import { useWidgetI18n } from '../context/WidgetI18nContext';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { SaaSFeatureFlags } from '../types/saas';
import type { ReactNode } from 'react';

export interface PremiumFeatureGateProps {
  feature: keyof SaaSFeatureFlags;
  children: ReactNode;
  fallback?: ReactNode;
  upgradeUrl?: string;
  mode?: 'blur' | 'unmount';
}

export function PremiumFeatureGate({
	feature,
	children,
	fallback,
	upgradeUrl,
	mode = 'unmount',
}: PremiumFeatureGateProps) {
	const { t } = useWidgetI18n();
	const { isLoading, isValid, checkFeature } = useFeatureGate();
	const hasAccess = checkFeature(feature);

	if (isLoading) {
		return (
			<div className="vnsc-premium-gate-container" data-testid="premium-gate-loading">
				<div className="vnsc-premium-loading">
					<div className="vnsc-premium-spinner" />
					<span>{t('premium.loading')}</span>
				</div>
			</div>
		);
	}

	if (!isValid) {
		return (
			<div className="vnsc-premium-gate-container" data-testid="premium-gate-invalid">
				{fallback || (
					<div className="vnsc-premium-overlay">
						<div className="vnsc-premium-lock-icon">🔒</div>
						<div className="vnsc-premium-title">
							{t('premium.invalidToken')}
						</div>
						<div className="vnsc-premium-description">
							{t('premium.invalidTokenDesc')}
						</div>
					</div>
				)}
			</div>
		);
	}

	if (hasAccess) {
		return <>{children}</>;
	}

	// Feature locked - handle based on mode
	if (mode === 'unmount') {
		// Don't render children at all - prevents phantom API calls
		return (
			<div className="vnsc-premium-gate-container" data-testid={`premium-gate-locked-${feature}`}>
				{fallback || (
					<div className="vnsc-premium-overlay" data-feature={feature}>
						<div className="vnsc-premium-lock-icon">🔒</div>
						<div className="vnsc-premium-title">
							{t(`premium.${feature}.title`)}
						</div>
						<div className="vnsc-premium-description">
							{t(`premium.${feature}.description`)}
						</div>
						{upgradeUrl && (
							<a
								href={upgradeUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="vnsc-premium-cta-btn"
								data-testid="premium-upgrade-btn"
							>
								{t('premium.upgrade')}
							</a>
						)}
					</div>
				)}
			</div>
		);
	}

	// mode === 'blur' - render children but blurred (for static content only)
	return (
		<div className="vnsc-premium-gate-container" data-testid={`premium-gate-locked-${feature}`}>
			<div className="vnsc-premium-content-blur" data-testid="premium-content-blur">
				{children}
			</div>
			{fallback || (
				<div className="vnsc-premium-overlay" data-feature={feature}>
					<div className="vnsc-premium-lock-icon">🔒</div>
					<div className="vnsc-premium-title">
						{t(`premium.${feature}.title`)}
					</div>
					<div className="vnsc-premium-description">
						{t(`premium.${feature}.description`)}
					</div>
					{upgradeUrl && (
						<a
							href={upgradeUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="vnsc-premium-cta-btn"
							data-testid="premium-upgrade-btn"
						>
							{t('premium.upgrade')}
						</a>
					)}
				</div>
			)}
		</div>
	);
}