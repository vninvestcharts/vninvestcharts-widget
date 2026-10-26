/**
 * CS-1 — typed credential storage. The ONLY module permitted to touch the two
 * credential slots.
 *
 * WHY TWO SLOTS AND NOT ONE. Until this file existed, `localStorage["vni_pat"]`
 * held BOTH a signed offline license key (`vni1.*`, an *entitlement*) and a
 * bearer account token (an *identity*). One slot, two credential types. That is
 * the root cause of three separately-patched bugs in this repo:
 *   - VNI1_KEY_WIPED_ON_RELOAD_2026-09-24   the client constructor wiped the slot
 *   - LICENSE_FIRST_BEATS_BACKEND_2026-09-24 settings and toolbar disagreed on tier
 *   - TIER_LIC_ACTIVATION_2026-09-23         DER/P1363 interop, same code path
 * No commercial product surveyed in the audit stores two credential types in
 * one slot. Redis documents the terminal version of this bug: "After you add a
 * cluster key, you cannot remove the key to return the cluster to trial mode."
 *
 * ALGORITHM LUCIDITY (PASETO). The two credential types are never accepted by
 * the same function, the same storage key, or the same retry logic. Pasting a
 * PAT where a license key goes is structurally impossible, not a runtime check.
 *
 * SECURITY POSTURE. These are client-side checks: a speed bump, not a control.
 * The Typora bypass was a one-line change with no backend involved. Do not spend
 * time obfuscating this file. What actually protects the product is server-side
 * gating of anything that costs money per call.
 */
import { parseLicenseKey, verifyLicenseKey } from '@vninvestcharts/engine-core';

import { readString, removeKey, writeString } from '../utils/storage';

/** Signed offline license key (`vni1.<payload>.<sig>`). Entitlement channel. */
export const LICENSE_STORAGE_KEY = 'vni_license_key';
/** Opaque bearer account token. Identity / transport channel. */
export const PAT_STORAGE_KEY = 'vni_pat';

/** Refusal reason surfaced when a write would destroy a not-yet-migrated key. */
export const PENDING_MIGRATION_WARNING = 'pending-license-migration';

export type MigrationReason = 'already-migrated' | 'verify-failed' | 'not-a-license';
export interface MigrationResult {
	migrated: boolean;
	reason: MigrationReason;
}

/**
 * Where migration got to. `writePat` consults this so a PAT paste is refused only
 * while a license that still has value is genuinely in flight.
 *
 * WHY THIS EXISTS. The first version refused the write whenever the slot merely
 * HELD a blob. Combined with a copy that is rolled back when verification fails,
 * that deadlocked: an invalid or expired `vni1.*` key stayed in `vni_pat` forever,
 * every later PAT paste was refused forever, and the refusal was a console warning
 * the user never sees. One bad key permanently bricked the field. Verified on the
 * running app: after one structural key, "PAT actually persisted: NO".
 *
 * A blob that failed verification grants nothing, so overwriting it costs nothing.
 * Only an in-flight migration is worth protecting.
 */
let migrationState: 'idle' | 'pending' | 'settled' = 'idle';

export function isLicenseMigrationPending(): boolean {
	return migrationState === 'pending';
}

/** Structural check only. A blob that fails this is still a blob, not a token. */
function isLicenseBlob(value: string | null | undefined): boolean {
	if (!value) return false;
	return parseLicenseKey(value) !== null;
}

function readRaw(key: string): string {
	// Lớp lưu credential dùng chung adapter `src/lib/utils/storage.ts` — file đó
	// không import gì nên không có vòng tròn. Trước đây module này tự viết guard và
	// chú thích rằng adapter "không dùng được"; lý do đó chỉ đúng khi adapter chưa tồn
	// tại, và giữ lại nó tốn 3 khối try/catch cùng số byte gọi.
	return readString(key) ?? '';
}

function writeRaw(key: string, value: string): void {
	// Một lần ghi hỏng không được làm sập licensing → bỏ qua kết quả trả về.
	writeString(key, value);
}

/** Dev-only channel. `import.meta.env` is not typed in this build, so the check is
 *  written defensively rather than pulling in a vite-env shim. */
function warnOnce(message: string): void {
	try {
		if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return;
	} catch { /* ignore */ }
	console.warn(`[credentialStore] ${message}`);
}

function removeRaw(key: string): void {
	removeKey(key);
}

// ---------------------------------------------------------------------------
// Session layer (CS-7, REQ-CS-701). In-memory values win over storage within the
// page lifetime; storage remains the reload bootstrap. Why: a bearer token that
// lives only in localStorage is re-read on every call, which widens the window
// where a concurrent writer (another tab, a host script) swaps it mid-session.
// Memory-first narrows the authority to this session. It deliberately does NOT
// sync across tabs — cross-tab consistency is the broadcast channel's job, and
// conflating the two layers is how stale grants survive.
//
// Semantics are identical to the storage path: the blob-refusal in readPat and
// the bridge in readLicenseKey apply to memory values too. Memory is populated
// on write, and on explicit prime (migration success); it is never populated by
// a bare read, so a first read after reload always consults storage.
let sessionLicense: string | null = null;
let sessionPat: string | null = null;

/**
 * Drop the in-memory session values without touching storage. Test isolation
 * needs this because module state otherwise leaks between tests in one file —
 * a previous test's writePat would make the next test's readPat return a value
 * that storage (cleared in beforeEach) no longer holds, disabling its save
 * button forever. Also the correct primitive for a "log out of this session
 * but keep remembered credentials" flow, should one ever be built.
 */
export function clearSessionState(): void {
	sessionLicense = null;
	sessionPat = null;
}

// ---------------------------------------------------------------------------
// 2 readers
// ---------------------------------------------------------------------------

/**
 * License key for the entitlement channel.
 *
 * BRIDGE (REQ-CS-105), and this is a real mechanism rather than a deprecation
 * nicety: migration is async, so a reader can legitimately run before it
 * resolves. If the license slot is empty but the PAT slot still holds a blob,
 * return the blob. The blob is NOT migrated here — that is migrateLegacyLicenseSlot's job,
 * and a getter must not have side effects.
 */
export function readLicenseKey(): string {
	if (sessionLicense !== null) return sessionLicense;
	const stored = readRaw(LICENSE_STORAGE_KEY);
	if (stored) return stored;
	if (isLicenseBlob(readRaw(PAT_STORAGE_KEY))) return readRaw(PAT_STORAGE_KEY);
	return '';
}

/**
 * Bearer token for the identity channel.
 *
 * Returns "" when the slot holds a license blob. This guard is mandatory, not
 * defensive padding: `VNStocksAdapter.resolvePatToken()` used to return the raw
 * slot value and then hand it to `buildHeaders`, which would have sent
 * `vni1.<…>` as `Authorization: Bearer` — the exact credential-crossing this
 * module exists to prevent. The blob is refused, NOT deleted: migration owns it.
 */
export function readPat(): string {
	if (sessionPat !== null) {
		// Same refusal as the storage path: a blob in memory is still a blob.
		if (!sessionPat || isLicenseBlob(sessionPat)) return '';
		return sessionPat;
	}
	const stored = readRaw(PAT_STORAGE_KEY);
	if (!stored) return '';
	if (isLicenseBlob(stored)) return '';
	return stored;
}

/**
 * Memory only, never storage. The constructor's quota-failure fallback needs
 * exactly this: after a storage failure, `readPat()` would re-read the same
 * broken storage, while a legacy token the constructor deliberately skipped
 * must stay skipped. Reading memory alone cannot resurrect either case.
 */
export function readSessionPat(): string {
	if (sessionPat === null || !sessionPat || isLicenseBlob(sessionPat)) return '';
	return sessionPat;
}

// ---------------------------------------------------------------------------
// 2 writers
// ---------------------------------------------------------------------------

/** Rejects a bearer token. A license blob must never enter the identity channel. */
export function writeLicenseKey(value: string): void {
	const trimmed = (value ?? '').trim();
	if (!trimmed) {
		sessionLicense = null;
		removeRaw(LICENSE_STORAGE_KEY);
		return;
	}
	if (!isLicenseBlob(trimmed)) {
		warnOnce('refused a non-license value on the license channel');
		return;
	}
	sessionLicense = trimmed;
	writeRaw(LICENSE_STORAGE_KEY, trimmed);
}

/**
 * Rejects a license blob by value.
 *
 * AND refuses to write while a blob is still being MIGRATED - the one case where
 * overwriting would destroy a license that may yet prove valid.
 *
 * It deliberately does NOT refuse merely because the slot holds a blob. The first
 * version did, and combined with the rollback-on-verify-failure path that
 * deadlocked: an invalid or expired `vni1.*` key stayed in `vni_pat` forever, every
 * later PAT paste was refused forever, and the refusal was a console warning nobody
 * sees. One bad key permanently bricked the field - verified on the running app,
 * "PAT actually persisted: NO". A blob that failed verification grants nothing, so
 * replacing it costs nothing.
 *
 * Returns the refusal reason so a caller cannot report a save that never happened.
 * The void signature let the UI claim success over a refusal.
 */
export type WritePatResult = { ok: true } | { ok: false; reason: "is-license-blob" | "migration-pending" };

export function writePat(value: string): WritePatResult {
	const trimmed = (value ?? '').trim();
	if (!trimmed) {
		clearPat();
		return { ok: true };
	}
	if (isLicenseBlob(trimmed)) {
		warnOnce('refused a license blob on the PAT channel');
		return { ok: false, reason: "is-license-blob" };
	}
	if (isLicenseMigrationPending()) {
		warnOnce(`${PENDING_MIGRATION_WARNING}: PAT not saved, a license key is still being migrated`);
		return { ok: false, reason: "migration-pending" };
	}
	sessionPat = trimmed;
	writeRaw(PAT_STORAGE_KEY, trimmed);
	return { ok: true };
}

// ---------------------------------------------------------------------------
// 2 clears — each removes exactly ONE slot, never the other. Without this the
// bridge in readLicenseKey has no stated behaviour.
// ---------------------------------------------------------------------------

export function clearLicenseKey(): void {
	// CS-7 audit: reset to null (no opinion), not ''. An '' sentinel would suppress
	// the PAT-slot bridge below, hiding a pending-migration blob the user never
	// asked to remove. Storage was just emptied, so null resolves identically
	// except the bridge still works.
	sessionLicense = null;
	removeRaw(LICENSE_STORAGE_KEY);
}

export function clearPat(): void {
	sessionPat = null;
	removeRaw(PAT_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Migration: copy -> verify -> delete. Order is load-bearing.
// ---------------------------------------------------------------------------

// Memoize the IN-FLIGHT promise only, then clear it. Memoizing the result
// forever would make the very first call win for the lifetime of the page, so a
// later retry (the user dismisses the pending-migration warning and pastes again
// without reloading) could never migrate. Idempotency comes from storage state,
// not from this variable: if the license slot is already populated the next call
// short-circuits to `already-migrated`.
let inFlight: Promise<MigrationResult> | null = null;

/**
 * Move a legacy license blob out of `vni_pat` and into `vni_license_key`.
 *
 * The order is not negotiable, and a previous draft of this plan left it
 * implicit, which is how a "delete then verify" variant would ship:
 *   1. COPY   the blob to the license slot
 *   2. VERIFY the copy with the engine (async — crypto.subtle)
 *   3a. ok   -> delete the blob from the PAT slot
 *   3b. fail -> roll the copy back, leave the PAT slot untouched
 *
 * Step 1 before step 2 means `readLicenseKey()` can serve the key through the
 * bridge even while the await is in flight. Step 3b means a corrupt key is never
 * silently promoted into a slot we would then treat as authoritative.
 *
 * Idempotent: a second call reports `already-migrated` and changes nothing.
 */
export async function migrateLegacyLicenseSlot(): Promise<MigrationResult> {
	if (inFlight) return inFlight;
	migrationState = 'pending';
	inFlight = (async (): Promise<MigrationResult> => {
		if (readRaw(LICENSE_STORAGE_KEY)) return { migrated: false, reason: 'already-migrated' };
		const stored = readRaw(PAT_STORAGE_KEY);
		if (!stored) return { migrated: false, reason: 'not-a-license' };
		if (!isLicenseBlob(stored)) return { migrated: false, reason: 'not-a-license' };

		writeRaw(LICENSE_STORAGE_KEY, stored);
		const verified = await verifyLicenseKey(stored, { host: typeof location !== 'undefined' ? location.hostname : '' });
		// CS-7 audit: every mutation below is compare-and-act on `stored`. Verification
		// is async, so a legitimate write (user saving a new key, host pinning) can land
		// mid-flight. Blindly deleting would destroy THEIR key, not our copy; blindly
		// priming memory would serve a STALE blob. Touch only what we copied.
		if (verified) {
			if (readRaw(LICENSE_STORAGE_KEY) === stored) {
				sessionLicense = stored;
			}
			if (readRaw(PAT_STORAGE_KEY) === stored) {
				sessionPat = null;
				removeRaw(PAT_STORAGE_KEY);
			}
			return { migrated: true, reason: 'already-migrated' };
		}
		if (readRaw(LICENSE_STORAGE_KEY) === stored) {
			removeRaw(LICENSE_STORAGE_KEY);
		}
		return { migrated: false, reason: 'verify-failed' };
	})();
	try {
		return await inFlight;
	} finally {
		inFlight = null;
		// Settled, whatever the outcome. Without this the guard stays armed forever
		// and the PAT channel is bricked after a single failed migration.
		migrationState = 'settled';
	}
}

// Module init, not a React effect. `VNInvestClient`'s constructor reads the PAT
// slot at mount, so running later would race it. Import order guarantees the
// migration *starts* first; it cannot guarantee it *finishes* — that is why
// readLicenseKey() bridges.
void migrateLegacyLicenseSlot();
