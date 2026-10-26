/**
 * Unit tests for DeviceProfiles
 */

import {
	detectDeviceType,
	getDeviceProfile,
	getAdjustedDeviceProfile,
	DEVICE_PROFILES,
	DeviceProfileConfig
} from '../DeviceProfiles';

describe('DeviceProfiles', () => {
	test('should have profiles for all device types', () => {
		expect(DEVICE_PROFILES['ios-safari']).toBeDefined();
		expect(DEVICE_PROFILES['android-chrome']).toBeDefined();
		expect(DEVICE_PROFILES['desktop']).toBeDefined();
		expect(DEVICE_PROFILES['unknown']).toBeDefined();
	});

	test('should have required properties in each profile', () => {
		const requiredProps: (keyof DeviceProfileConfig)[] = [
			'freezeThreshold',
			'thawThreshold',
			'debounceMs',
			'minFreezeDuration',
			'maxWebGLContexts',
			'maxHeapBudget',
			'maxSnapshotWidth',
			'snapshotQuality',
			'aggressiveFreeze',
			'preThawOnHover',
			'enableFrameMonitoring',
		];

		Object.values(DEVICE_PROFILES).forEach(profile => {
			requiredProps.forEach(prop => {
				expect(profile).toHaveProperty(prop);
			});
		});
	});

	test('iOS Safari profile should be aggressive', () => {
		const profile = DEVICE_PROFILES['ios-safari'];

		expect(profile.aggressiveFreeze).toBe(true);
		expect(profile.maxWebGLContexts).toBeLessThanOrEqual(6);
		expect(profile.maxHeapBudget).toBeLessThanOrEqual(150 * 1024 * 1024);
		expect(profile.freezeThreshold).toBeLessThan(0.5);
		expect(profile.preThawOnHover).toBe(true);
	});

	test('Android Chrome profile should be moderate', () => {
		const profile = DEVICE_PROFILES['android-chrome'];

		expect(profile.aggressiveFreeze).toBe(false);
		expect(profile.maxWebGLContexts).toBeLessThanOrEqual(6);
		expect(profile.maxHeapBudget).toBeLessThanOrEqual(200 * 1024 * 1024);
		expect(profile.freezeThreshold).toBe(0.5);
	});

	test('Desktop profile should be conservative', () => {
		const profile = DEVICE_PROFILES['desktop'];

		expect(profile.aggressiveFreeze).toBe(false);
		expect(profile.maxWebGLContexts).toBeGreaterThanOrEqual(8);
		expect(profile.maxHeapBudget).toBeGreaterThanOrEqual(300 * 1024 * 1024);
		expect(profile.freezeThreshold).toBeGreaterThan(0.5);
		expect(profile.preThawOnHover).toBe(false);
	});

	test('getDeviceProfile should return correct profile', () => {
		const iosProfile = getDeviceProfile('ios-safari');
		expect(iosProfile).toBe(DEVICE_PROFILES['ios-safari']);

		const androidProfile = getDeviceProfile('android-chrome');
		expect(androidProfile).toBe(DEVICE_PROFILES['android-chrome']);

		const desktopProfile = getDeviceProfile('desktop');
		expect(desktopProfile).toBe(DEVICE_PROFILES['desktop']);
	});

	test('getAdjustedDeviceProfile should adjust for low-end devices', () => {
		// Mock low-end device
		const originalHWConcurrency = navigator.hardwareConcurrency;
		const originalDeviceMemory = (navigator as any).deviceMemory;

		Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
		Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });

		const profile = getAdjustedDeviceProfile();

		expect(profile.maxWebGLContexts).toBeLessThanOrEqual(DEVICE_PROFILES['desktop'].maxWebGLContexts);
		expect(profile.maxHeapBudget).toBeLessThanOrEqual(DEVICE_PROFILES['desktop'].maxHeapBudget);
		expect(profile.aggressiveFreeze).toBe(true);

		// Restore
		Object.defineProperty(navigator, 'hardwareConcurrency', { value: originalHWConcurrency, configurable: true });
		Object.defineProperty(navigator, 'deviceMemory', { value: originalDeviceMemory, configurable: true });
	});

	test('getAdjustedDeviceProfile should adjust for high-end devices', () => {
		// Mock high-end device
		const originalHWConcurrency = navigator.hardwareConcurrency;
		const originalDeviceMemory = (navigator as any).deviceMemory;

		Object.defineProperty(navigator, 'hardwareConcurrency', { value: 16, configurable: true });
		Object.defineProperty(navigator, 'deviceMemory', { value: 16, configurable: true });

		const profile = getAdjustedDeviceProfile();

		expect(profile.maxWebGLContexts).toBeGreaterThanOrEqual(DEVICE_PROFILES['desktop'].maxWebGLContexts);
		expect(profile.maxHeapBudget).toBeGreaterThanOrEqual(DEVICE_PROFILES['desktop'].maxHeapBudget);
		expect(profile.aggressiveFreeze).toBe(false);

		// Restore
		Object.defineProperty(navigator, 'hardwareConcurrency', { value: originalHWConcurrency, configurable: true });
		Object.defineProperty(navigator, 'deviceMemory', { value: originalDeviceMemory, configurable: true });
	});
});