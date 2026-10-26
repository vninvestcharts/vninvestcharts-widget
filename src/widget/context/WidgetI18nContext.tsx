import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { widgetMessagesEn } from "../i18n/messages.en";
import { widgetMessagesVi } from "../i18n/messages.vi";
import type { WidgetLocale, WidgetMessages } from "../i18n/types";

type TranslationParams = Record<string, string | number | undefined> & { defaultValue?: string };

export interface WidgetI18nContextValue {
	locale: WidgetLocale;
	setLocale: (locale: WidgetLocale) => void;
	t: (key: string, params?: TranslationParams) => string;
}

export interface WidgetI18nProviderProps {
	children: ReactNode;
	locale?: WidgetLocale;
	messages?: Partial<WidgetMessages>;
	onLocaleChange?: (locale: WidgetLocale) => void;
}

function isWidgetLocale(value: string | undefined | null): value is WidgetLocale {
	return value === "vi" || value === "en";
}

function resolveInitialLocale(locale?: WidgetLocale): WidgetLocale {
	if (isWidgetLocale(locale)) {
		return locale;
	}
	if (typeof document !== "undefined") {
		const documentLocale = document.documentElement.lang.trim().toLowerCase();
		if (documentLocale.startsWith("en")) {
			return "en";
		}
	}
	return "vi";
}

function interpolate(message: string, params?: TranslationParams): string {
	if (!params) {
		return message;
	}
	return message.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const value = params[key];
		return value === undefined ? `{${key}}` : String(value);
	});
}

const defaultValue: WidgetI18nContextValue = {
	locale: "vi",
	setLocale: () => {},
	t: (key, params) => {
		const template = widgetMessagesVi[key] ?? widgetMessagesEn[key] ?? params?.defaultValue;
		if (!template) return key;
		return interpolate(template, params);
	},
};

export const WidgetI18nContext = createContext<WidgetI18nContextValue>(defaultValue);

export function WidgetI18nProvider({ children, locale, messages, onLocaleChange }: WidgetI18nProviderProps) {
	const [internalLocale, setInternalLocale] = useState<WidgetLocale>(() => resolveInitialLocale(locale));
	const resolvedLocale = isWidgetLocale(locale) ? locale : internalLocale;

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}
		document.documentElement.lang = resolvedLocale;
	}, [resolvedLocale]);

	const setLocale = useCallback((nextLocale: WidgetLocale) => {
		if (!isWidgetLocale(nextLocale)) {
			return;
		}
		if (!isWidgetLocale(locale)) {
			setInternalLocale(nextLocale);
		}
		onLocaleChange?.(nextLocale);
	}, [locale, onLocaleChange]);

	const t = useCallback((key: string, params?: TranslationParams) => {
		const primaryDictionary = resolvedLocale === "en" ? widgetMessagesEn : widgetMessagesVi;
		const secondaryDictionary = resolvedLocale === "en" ? widgetMessagesVi : widgetMessagesEn;
		const template = messages?.[key] ?? primaryDictionary[key] ?? secondaryDictionary[key] ?? params?.defaultValue;
		if (!template) return key;
		return interpolate(template, params);
	}, [messages, resolvedLocale]);

	const value = useMemo<WidgetI18nContextValue>(() => ({ locale: resolvedLocale, setLocale, t }), [resolvedLocale, setLocale, t]);

	return <WidgetI18nContext.Provider value={value}>{children}</WidgetI18nContext.Provider>;
}

export function useWidgetI18n() {
	return useContext(WidgetI18nContext);
}

/**
 * S3/BUG-4: safe fallback helper. `t()` returns the raw key when missing
 * (never ""), so `t(key) || fallback` NEVER fires — use this instead.
 */
export function tOr(t: (key: string) => string, key: string, fallback: string): string {
	const res = t(key);
	return res === key ? fallback : res;
}
