import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SaaSFeatureProvider } from "../../../../contexts/SaaSFeatureContext";
import { LicensingSettingsTab } from "../LicensingSettingsTab";
import { clearSessionState, writeLicenseKey } from "../../../../../lib/credentials/credentialStore";

// Storage isolation: every test starts from empty slots. Without this, a key
// saved by one test is read back as currentSavedPat by the next, which disables
// its save button forever (input === saved) and the test times out waiting for
// feedback that can never come. That is exactly what happened before this block
// existed — the failure looked like broken UI, but it was test pollution.
beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	// Module-level session memory is NOT storage: clearing storage alone leaves
	// the previous test.s write visible to readPat()/readLicenseKey().
	clearSessionState();
});
afterEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
});

// LIC-UX: lưu key báo kết quả THẬT (legacy → warn, key ký số hỏng → error).
// LIC-UX: luu key bao ket qua THAT (legacy -> warn, key ky so hong -> error).
function setup() {
	render(
		<SaaSFeatureProvider>
			<LicensingSettingsTab />
		</SaaSFeatureProvider>,
	);
	const licenseInput = screen.getByTestId("license-input") as HTMLInputElement;
	const patInput = screen.getByTestId("pat-input") as HTMLInputElement;
	const licenseSave = screen.getByTestId("license-save");
	const patSave = screen.getByTestId("pat-save");
	return { licenseInput, patInput, licenseSave, patSave };
}
// SEC-2026-10-18: the stored key must never render as plaintext by default
// (screenshots/screen-shares leaked the whole blob + serial). Masked by default,
// reveal only on explicit user action, serial always truncated.
function makeLicenseBlob(serial: string): string {
	const payload = btoa(JSON.stringify({ t: "pro", e: 1893456000, s: serial }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `vni1.${payload}.bm90LXNpZ25lZA`;
}

describe("LicensingSettingsTab credential masking (SEC)", () => {
	it("stored license renders masked (password) by default; reveal toggles and never persists open", async () => {
		writeLicenseKey(makeLicenseBlob("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
		const { licenseInput } = setup();
		expect(licenseInput.type).toBe("password");
		const reveal = screen.getByTestId("license-reveal");
		await waitFor(() => { if ((reveal as HTMLButtonElement).disabled) throw new Error("reveal still disabled"); });
		fireEvent.click(reveal);
		expect((screen.getByTestId("license-input") as HTMLInputElement).type).toBe("text");
		fireEvent.click(screen.getByTestId("license-reveal"));
		expect((screen.getByTestId("license-input") as HTMLInputElement).type).toBe("password");
	});

	it("serial renders truncated, full value never in visible text", async () => {
		writeLicenseKey(makeLicenseBlob("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
		setup();
		const serialLine = screen.getByText(/Mã serial|Serial/);
		expect(serialLine.textContent).toContain("aaaaaa…eeee");
		expect(serialLine.textContent).not.toContain("cccc-dddd");
	});

	it("reveal button absent when no stored key", async () => {
		setup();
		expect(screen.queryByTestId("license-reveal")).toBeNull();
	});
});

describe("LicensingSettingsTab save feedback (LIC-UX)", () => {
	it("legacy key: warn feedback + persistent hint, plan stays free", async () => {
		const { patInput, patSave } = setup();
		fireEvent.change(patInput, { target: { value: "vni_pro_test123" } });
		await waitFor(() => { if ((patSave as HTMLButtonElement).disabled) throw new Error("save still disabled"); });
		fireEvent.click(patSave);
		// Cả feedback lúc lưu lẫn hint thường trực đều nhắc định dạng cũ.
		expect((await screen.findAllByText(/định dạng cũ/i)).length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText("FREE")).toBeTruthy();
	});

	it("well-formed but bad-signature key: error feedback", async () => {
		const { licenseInput, licenseSave } = setup();
		fireEvent.change(licenseInput, { target: { value: "vni1.eyJ0IjoicHJvIiwiZSI6MTg5MzQ1NjAwMH0.bm90LXNpZ25lZA" } });
		await waitFor(() => { if ((licenseSave as HTMLButtonElement).disabled) throw new Error("save still disabled"); });
		fireEvent.click(licenseSave);
		expect(await screen.findByText(/không hợp lệ/i)).toBeTruthy();
	});

	describe("LicensingSettingsTab two fields (CS-6)", () => {
		it("CS-602 two-fields: blob in the PAT field is refused with guidance, license slot untouched", async () => {
			const { patInput, patSave } = setup();
			fireEvent.change(patInput, { target: { value: "vni1.eyJ0IjoicHJvIiwiZSI6MTg5MzQ1NjAwMH0.bm90LXNpZ25lZA" } });
			await waitFor(() => { if ((patSave as HTMLButtonElement).disabled) throw new Error("save still disabled"); });
			fireEvent.click(patSave);
			// Refused, not routed: the PAT field must not accept an entitlement.
			expect((await screen.findAllByText(/không hợp lệ|invalid/i)).length).toBeGreaterThanOrEqual(1);
			expect(window.localStorage.getItem("vni_pat")).toBeNull();
		});

		it("CS-602 isolated-writes: saving a PAT never touches the license slot and vice versa", async () => {
			const { licenseInput, licenseSave, patInput, patSave } = setup();
			fireEvent.change(patInput, { target: { value: "vni_pro_test123" } });
			await waitFor(() => { if ((patSave as HTMLButtonElement).disabled) throw new Error("save still disabled"); });
			fireEvent.click(patSave);
			await screen.findAllByText(/định dạng cũ/i);
			expect(window.localStorage.getItem("vni_license_key")).toBeNull();
			expect(window.localStorage.getItem("vni_pat")).toBe("vni_pro_test123");
		});

		it("CS-605 degraded-banner: hidden for anonymous free", async () => {
			setup();
			// Anonymous free (no credentials anywhere): no-pat must NOT banner.
			expect(screen.queryByTestId("degraded-banner")).toBeNull();
		});

		it("server 401 reason surfaces instead of blaming the key format", async () => {
		// The backend distinguishes unknown/revoked, expired status, disabled
		// account, and CIDR mismatch. The widget used to collapse all of them to
		// null and show "old format". Now the mapped copy plus raw detail render.
			window.localStorage.setItem("vni_pat", "vni_pro_rejected");
			const err = new Error("TOKEN_EXPIRED") as Error & { detail?: string };
			err.detail = "Invalid or revoked PAT.";
			const client = { validateMe: async () => { throw err; } };
			render(
				<SaaSFeatureProvider client={client as never}>
					<LicensingSettingsTab />
				</SaaSFeatureProvider>,
			);
			const box = await screen.findByTestId("server-reject");
			// Mapped headline (locale-resolved) plus the verbatim server detail.
			expect(box.textContent).toMatch(/không nhận|does not recognize/i);
			expect(box.textContent).toContain("Invalid or revoked PAT.");
		});
	});
});
