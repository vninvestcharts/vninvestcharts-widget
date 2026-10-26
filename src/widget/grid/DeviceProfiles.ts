/**
 * DeviceProfiles - Device-specific tuning for WebGL freeze/thaw behavior
 * Implements ADR-0011 device-specific recommendations
 */

export type DeviceType = 'ios-safari' | 'android-chrome' | 'desktop' | 'unknown';

export interface DeviceProfileConfig {
  // IntersectionObserver thresholds
  freezeThreshold: number;    // Visibility ratio below which to freeze (default: 0.5)
  thawThreshold: number;      // Visibility ratio above which to thaw (default: 0.1)
  debounceMs: number;         // Debounce time for intersection changes (default: 100)
  minFreezeDuration: number;  // Minimum time frozen before allowing thaw (default: 1000)

  // Memory budget limits
  maxWebGLContexts: number;   // Maximum concurrent WebGL contexts
  maxHeapBudget: number;      // Maximum heap budget in bytes

  // Snapshot settings
  maxSnapshotWidth: number;   // Maximum snapshot width in CSS pixels (default: 1920)
  snapshotQuality: number;    // JPEG quality for fallback (0-1, default: 0.8)

  // Performance tuning
  aggressiveFreeze: boolean;  // Whether to freeze more aggressively
  preThawOnHover: boolean;    // Whether to pre-thaw on hover intent
  enableFrameMonitoring: boolean; // Whether to monitor frame times
}

// Default profiles per device type
export const DEVICE_PROFILES: Record<DeviceType, DeviceProfileConfig> = {
	'ios-safari': {
		// iOS Safari: Very strict WebGL limits, aggressive memory management
		freezeThreshold: 0.4,      // Freeze earlier (40% visibility)
		thawThreshold: 0.15,       // Thaw later (15% visibility)
		debounceMs: 50,            // Faster response
		minFreezeDuration: 500,    // Shorter minimum freeze
		maxWebGLContexts: 4,       // Very conservative
		maxHeapBudget: 100 * 1024 * 1024, // 100MB
		maxSnapshotWidth: 1280,    // Lower resolution snapshots
		snapshotQuality: 0.7,      // Lower quality for faster capture
		aggressiveFreeze: true,
		preThawOnHover: true,
		enableFrameMonitoring: true,
	},

	'android-chrome': {
		// Android Chrome: Varies widely, moderate settings
		freezeThreshold: 0.5,      // Standard freeze threshold
		thawThreshold: 0.1,        // Standard thaw threshold
		debounceMs: 100,           // Standard debounce
		minFreezeDuration: 1000,   // Standard minimum freeze
		maxWebGLContexts: 6,       // Moderate
		maxHeapBudget: 150 * 1024 * 1024, // 150MB
		maxSnapshotWidth: 1920,    // Standard resolution
		snapshotQuality: 0.8,      // Standard quality
		aggressiveFreeze: false,
		preThawOnHover: true,
		enableFrameMonitoring: true,
	},

	'desktop': {
		// Desktop: Conservative, higher limits
		freezeThreshold: 0.6,      // Freeze later (60% visibility)
		thawThreshold: 0.05,       // Thaw earlier (5% visibility)
		debounceMs: 200,           // Slower response (less critical)
		minFreezeDuration: 2000,   // Longer minimum freeze
		maxWebGLContexts: 12,      // Higher limit
		maxHeapBudget: 500 * 1024 * 1024, // 500MB
		maxSnapshotWidth: 1920,    // Standard resolution
		snapshotQuality: 0.9,      // Higher quality
		aggressiveFreeze: false,
		preThawOnHover: false,
		enableFrameMonitoring: false, // Less critical on desktop
	},

	'unknown': {
		// Unknown/fallback: Safe defaults
		freezeThreshold: 0.5,
		thawThreshold: 0.1,
		debounceMs: 100,
		minFreezeDuration: 1000,
		maxWebGLContexts: 6,
		maxHeapBudget: 200 * 1024 * 1024, // 200MB
		maxSnapshotWidth: 1920,
		snapshotQuality: 0.8,
		aggressiveFreeze: false,
		preThawOnHover: false,
		enableFrameMonitoring: true,
	},
};

/**
 * Detect device type from user agent and hardware capabilities
 */
export function detectDeviceType(): DeviceType {
	// SSR guard
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return 'unknown';
	}

	const ua = navigator.userAgent.toLowerCase();
	const hardwareConcurrency = navigator.hardwareConcurrency || 4;
	const deviceMemory = (navigator as any).deviceMemory || 4; // GB // ARC-1-keep: legacy bridge

	// iOS Safari detection (exclude Chrome/Firefox on iOS)
	if (/iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/chrome|crios|fxios/.test(ua)) {
		return 'ios-safari';
	}

	// Android Chrome detection
	if (/android/.test(ua) && /chrome/.test(ua)) {
		return 'android-chrome';
	}

	// Other mobile browsers
	if (/mobile|android|iphone|ipad|ipod/.test(ua)) {
		return 'unknown';
	}

	// Desktop
	return 'desktop';
}

/**
 * Get device profile configuration
 */
export function getDeviceProfile(deviceType?: DeviceType): DeviceProfileConfig {
	const type = deviceType || detectDeviceType();
	return DEVICE_PROFILES[type];
}

/**
 * Get device profile with hardware-based adjustments
 */
export function getAdjustedDeviceProfile(): DeviceProfileConfig {
	const baseProfile = getDeviceProfile();

	// SSR guard
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return baseProfile;
	}

	const hardwareConcurrency = navigator.hardwareConcurrency || 4;
	const deviceMemory = (navigator as any).deviceMemory || 4; // GB // ARC-1-keep: legacy bridge
	const isLowEnd = hardwareConcurrency <= 4 || deviceMemory <= 3;

	// Adjust for low-end devices
	if (isLowEnd) {
		return {
			...baseProfile,
			maxWebGLContexts: Math.max(2, baseProfile.maxWebGLContexts - 2),
			maxHeapBudget: Math.floor(baseProfile.maxHeapBudget * 0.7),
			aggressiveFreeze: true,
			freezeThreshold: Math.min(0.6, baseProfile.freezeThreshold + 0.1),
			debounceMs: Math.max(50, baseProfile.debounceMs - 50),
		};
	}

	// Adjust for high-end devices
	if (hardwareConcurrency >= 8 && deviceMemory >= 8) {
		return {
			...baseProfile,
			maxWebGLContexts: baseProfile.maxWebGLContexts + 2,
			maxHeapBudget: Math.floor(baseProfile.maxHeapBudget * 1.5),
			aggressiveFreeze: false,
		};
	}

	return baseProfile;
}

/**
 * Apply device profile to MemoryBudgetManager
 * This should be called during app initialization
 */
export function applyDeviceProfile(): DeviceProfileConfig {
	const profile = getAdjustedDeviceProfile();
	return profile;
}

/**
 * Hook for React components to get device profile
 */
export function useDeviceProfile(): DeviceProfileConfig {
	// This would be used with React's useSyncExternalStore or similar
	// For now, return the adjusted profile
	return getAdjustedDeviceProfile();
}

export default {
	DEVICE_PROFILES,
	detectDeviceType,
	getDeviceProfile,
	getAdjustedDeviceProfile,
	applyDeviceProfile,
	useDeviceProfile,
};