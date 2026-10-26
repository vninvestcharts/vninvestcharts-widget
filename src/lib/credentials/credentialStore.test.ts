// SPEC — CS-1 regression suite. Filled in below.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * CS-1 regression suite.
 *
 * WHY SOME TESTS MOCK verifyLicenseKey. The engine's trust anchor is a public key
 * embedded at `licenseValidator.ts:35-40`, and its private counterpart is not in
 * this repository by design. So a unit test cannot mint a key the engine will
 * accept. Tests therefore split:
 *   - structural/refusal/rollback paths use a REAL blob-shaped string and the real
 *     engine verifier, which returns null exactly as it does in production;
 *   - the migration-success path mocks the verifier, and says so.
 * Claiming a key "verifies" in a unit test when the private key is unavailable
 * would be the same class of error as AC-1.8 promising a Pro tier the structural
 * fixture cannot produce.
 */

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Structurally valid `vni1.*`, cryptographically worthless. Same shape the
 *  runtime harness at scripts/verify-license-persist.cjs:14 uses. */
const STRUCTURAL_KEY = `vni1.${b64url(JSON.stringify({ t: 'pro', e: 9999999999 }))}.${b64url('sig')}`;

const verifyMock = vi.fn((_k: string, _o?: unknown): Promise<unknown> => Promise.resolve(null));

vi.mock('@vninvestcharts/engine-core', async () => {
	const actual = await vi.importActual<typeof import('@vninvestcharts/engine-core')>('@vninvestcharts/engine-core');
	return {
		...actual,
		// parseLicenseKey stays REAL — the whole module is about structural typing.
		verifyLicenseKey: (key: string, opts?: unknown) => verifyMock(key, opts),
	};
});

const {
	LICENSE_STORAGE_KEY,
	PAT_STORAGE_KEY,
	PENDING_MIGRATION_WARNING,
	readLicenseKey,
	readPat,
	writeLicenseKey,
	writePat,
	clearLicenseKey,
	clearPat,
	migrateLegacyLicenseSlot,
} = (await import('./credentialStore')) as unknown as typeof import('./credentialStore');

/** Re-import with a clean module registry. Does NOT touch the mock: tests
 *  configure `verifyMock` themselves, and resetting here would wipe a
 *  mockResolvedValue the test set on the line above. */
async function freshModule() {
	vi.resetModules();
	return (await import('./credentialStore')) as unknown as typeof import('./credentialStore');
}

const ls = () => (typeof localStorage !== 'undefined' ? localStorage : undefined);

let warnSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };

beforeEach(() => {
	localStorage.clear();
	verifyMock.mockReset();
	warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warnSpy.mockRestore();
	localStorage.clear();
});

describe('CS-101 two slots coexist', () => {
	it('CS-101 coexists: a license and a PAT live in separate slots and read back independently', async () => {
		const m = await freshModule();
		localStorage.setItem(LICENSE_STORAGE_KEY, STRUCTURAL_KEY);
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_local');
		expect(m.readLicenseKey()).toBe(STRUCTURAL_KEY);
		expect(m.readPat()).toBe('vni_pro_local');
	});

	it('CS-101b no duplicate key literal outside this module', () => {
		// Guarded by scripts/gate-credential-split.cjs R1 + AC-1.0b.
		expect(PAT_STORAGE_KEY).toBe('vni_pat');
		expect(LICENSE_STORAGE_KEY).toBe('vni_license_key');
	});
});

describe('CS-102 purpose-bound credential types', () => {
	it('CS-102 rejects-blob-into-pat', async () => {
		const m = await freshModule();
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_keepme');
		m.writePat(STRUCTURAL_KEY);
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe('vni_pro_keepme');
	});

	it('CS-102 rejects-token-into-license', async () => {
		const m = await freshModule();
		m.writeLicenseKey(STRUCTURAL_KEY);
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_token');
		m.writeLicenseKey('vni_pro_token');
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
	});

	it('CS-102 readpat-refuses-blob', async () => {
		// The gap PLAN_AUDIT4 found: guarding only the write path let a blob reach
		// VNStocksAdapter.buildHeaders as `Authorization: Bearer vni1.*`.
		const m = await freshModule();
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		expect(m.readPat()).toBe('');
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe(STRUCTURAL_KEY); // refused, not deleted
	});

	it('CS-102 writepat-refuses-while-license-pending', async () => {
		const m = await freshModule();
		verifyMock.mockResolvedValue(null);
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		const pending = m.migrateLegacyLicenseSlot();
		const res = m.writePat('vni_pro_new');
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.reason).toBe('migration-pending');
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
		await pending;
	});

	/**
	 * The bug the screenshots exposed. An invalid `vni1.*` key rolls the migration
	 * copy back, so the blob stays in the PAT slot. The first version of writePat
	 * refused to write whenever the slot merely HELD a blob, which meant every
	 * later PAT paste was refused forever and the refusal was a console warning.
	 * One bad key permanently bricked the field: "PAT actually persisted: NO".
	 */
	it('CS-102b writepat-works-after-a-failed-migration-settles', async () => {
		const m = await freshModule();
		verifyMock.mockResolvedValue(null); // verify fails -> copy rolled back
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		await m.migrateLegacyLicenseSlot();
		// Blob is still in the slot, but it is worthless and nothing is in flight.
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
		const res = m.writePat('vni_pro_recovered');
		expect(res.ok).toBe(true);
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe('vni_pro_recovered');
		expect(m.readPat()).toBe('vni_pro_recovered');
	});

	it('CS-102c writepat-reports-a-refusal-instead-of-lying', async () => {
		const m = await freshModule();
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_existing');
		const res = m.writePat(STRUCTURAL_KEY); // a blob by value
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.reason).toBe('is-license-blob');
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe('vni_pro_existing');
	});

	it('CS-102 setpat-empty-clears-only-pat', async () => {
		const m = await freshModule();
		localStorage.setItem(LICENSE_STORAGE_KEY, STRUCTURAL_KEY);
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_tok');
		m.writePat('');
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
	});

	it('CS-102b each clear removes exactly one slot', async () => {
		const m = await freshModule();
		localStorage.setItem(LICENSE_STORAGE_KEY, STRUCTURAL_KEY);
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_tok');
		m.clearPat();
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
		m.clearLicenseKey();
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});
});

describe('CS-103 migration', () => {
	it('CS-103 keeps-invalid: verify fails, copy rolled back, blob survives', async () => {
		const m = await freshModule();
		verifyMock.mockResolvedValue(null); // what the real verifier does with STRUCTURAL_KEY
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		const res = await m.migrateLegacyLicenseSlot();
		expect(res).toEqual({ migrated: false, reason: 'verify-failed' });
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});

	it('CS-103 migrates-on-verify-ok', async () => {
		const m = await freshModule();
		verifyMock.mockResolvedValue({ tier: 'pro' });
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		const res = await m.migrateLegacyLicenseSlot();
		expect(res.migrated).toBe(true);
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
	});

	it('CS-103 idempotent', async () => {
		const m = await freshModule();
		verifyMock.mockResolvedValue({ tier: 'pro' });
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		expect((await m.migrateLegacyLicenseSlot()).migrated).toBe(true);
		const second = await m.migrateLegacyLicenseSlot();
		expect(second.migrated).toBe(false);
		expect(second.reason).toBe('already-migrated');
		expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
	});

	it('CS-103 ignores-non-license', async () => {
		const m = await freshModule();
		localStorage.setItem(PAT_STORAGE_KEY, 'vni_pro_real_token');
		const res = await m.migrateLegacyLicenseSlot();
		expect(res).toEqual({ migrated: false, reason: 'not-a-license' });
		expect(localStorage.getItem(PAT_STORAGE_KEY)).toBe('vni_pro_real_token');
	});

	it('CS-103 license-readable-before-migration-completes', async () => {
		// Migration is async. The bridge is what makes the window safe.
		const m = await freshModule();
		let release: (v: unknown) => void = () => {};
		verifyMock.mockReturnValue(new Promise((r) => { release = r; }) as Promise<unknown>);
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		const pending = m.migrateLegacyLicenseSlot();
		expect(m.readLicenseKey()).toBe(STRUCTURAL_KEY);
		expect(m.readPat()).toBe('');
		release({ tier: 'pro' });
		await pending;
	});

	it('CS-103 migration-runs-on-import', async () => {
		verifyMock.mockResolvedValue({ tier: 'pro' });
		localStorage.setItem(PAT_STORAGE_KEY, STRUCTURAL_KEY);
		const m = await freshModule(); // import triggers the module-init side effect
		await vi.waitFor(() => {
			expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(STRUCTURAL_KEY);
		});
		expect(m.readPat()).toBe('');
	});
});

describe('CS-104 storage failures never crash the widget', () => {
	it('CS-104 storage-throw', async () => {
		const m = await freshModule();
		const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
		expect(() => m.writePat('vni_pro_x')).not.toThrow();
		// CS-7: memory is authoritative within the session, so the value IS readable
		// even though storage rejected it. It simply will not survive a reload.
		expect(m.readPat()).toBe('vni_pro_x');
		expect(localStorage.getItem('vni_pat')).toBeNull();
		spy.mockRestore();
	});
});

describe('CS-701 session-first', () => {
	it('CS-701a memory wins over storage within the session', async () => {
		const m = await freshModule();
		m.writePat('vni_session_token');
		// Sabotage storage behind the module's back: the session value must hold.
		localStorage.setItem('vni_pat', 'vni_storage_token');
		expect(m.readPat()).toBe('vni_session_token');
	});

	it('CS-701b clear wipes both layers', async () => {
		const m = await freshModule();
		m.writePat('vni_session_token');
		m.clearPat();
		expect(m.readPat()).toBe('');
		expect(localStorage.getItem('vni_pat')).toBeNull();
	});

	it('CS-701c license memory wins, and clear drops it', async () => {
		const m = await freshModule();
		localStorage.setItem('vni_license_key', 'vni1_dep.dep.dep');
		// Storage holds a blob-shaped value; memory is empty so storage is read.
		// (A structurally-parseable blob is returned by the bridge as-is.)
		expect(m.readLicenseKey()).toBe('vni1_dep.dep.dep');
		m.clearLicenseKey();
		expect(m.readLicenseKey()).toBe('');
	});

	it('CS-701d first read after reload consults storage (memory starts empty)', async () => {
		const m = await freshModule();
		localStorage.setItem('vni_pat', 'vni_bootstrapped');
		// No write happened in this session, so memory is empty and storage answers.
		expect(m.readPat()).toBe('vni_bootstrapped');
	});
});
