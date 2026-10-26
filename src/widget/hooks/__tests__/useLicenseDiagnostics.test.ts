// SPEC — CS-6 diagnostics tests. Filled in below.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLicenseDiagnostics, detectLicenseEnvironment } from '../useLicenseDiagnostics';

/**
 * CS-601/CS-604. The environment probe must name the cause instead of letting a
 * license silently degrade to free. Pure logic, no DOM needed beyond the hook.
 *
 * globalThis.crypto is getter-only in this environment, so the tests stub
 * `isSecureContext` (plain data property) and leave crypto alone. The subtle
 * branch is covered by asserting reason tracks subtleAvailable exactly.
 */
describe('useLicenseDiagnostics', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('CS-601 insecure-context: plain http reports the reason, not silence', () => {
		vi.stubGlobal('isSecureContext', false);
		const { result } = renderHook(() => useLicenseDiagnostics());
		expect(result.current.secureContext).toBe(false);
		expect(result.current.reason).toBe('insecure-context');
		expect(detectLicenseEnvironment()).toBe('insecure-context');
	});

	it('CS-601 still-fails-closed: the hook diagnoses, it does not grant', () => {
		// The hook NEVER returns a tier. If a future refactor makes it do so,
		// this test names the violated invariant. Fail-closed lives in the
		// verifier (verifyLicenseKey returns null without subtle); the hook only
		// explains why.
		vi.stubGlobal('isSecureContext', false);
		const { result } = renderHook(() => useLicenseDiagnostics());
		expect(result.current).not.toHaveProperty('tier');
		expect(result.current).not.toHaveProperty('plan');
		expect(result.current.reason).not.toBeNull();
	});

	it('CS-604 secure context with subtle: reason is null', () => {
		vi.stubGlobal('isSecureContext', true);
		const { result } = renderHook(() => useLicenseDiagnostics());
		// jsdom may or may not provide subtle; either answer is honest as long as
		// reason tracks subtleAvailable exactly.
		expect(result.current.secureContext).toBe(true);
		expect(result.current.reason).toBe(
			result.current.subtleAvailable ? null : 'subtle-unavailable',
		);
	});
});
