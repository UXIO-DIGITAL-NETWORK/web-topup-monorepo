import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import idActivity from "@/locales/id/activity.json";
import idAdministration from "@/locales/id/administration.json";
import idAuth from "@/locales/id/auth.json";
import idCategories from "@/locales/id/categories.json";
import idChangelog from "@/locales/id/changelog.json";
import idCommon from "@/locales/id/common.json";
import idContent from "@/locales/id/content.json";
import idDashboard from "@/locales/id/dashboard.json";
import idFeedback from "@/locales/id/feedback.json";
import idFinancial from "@/locales/id/financial.json";
import idIntegration from "@/locales/id/integration.json";
import idMarketing from "@/locales/id/marketing.json";
import idMembership from "@/locales/id/membership.json";
import idNavbar from "@/locales/id/navbar.json";
import idNotifications from "@/locales/id/notifications.json";
import idPricing from "@/locales/id/pricing.json";
import idProducts from "@/locales/id/products.json";
import idRefunds from "@/locales/id/refunds.json";
import idReports from "@/locales/id/reports.json";
import idTransactions from "@/locales/id/transactions.json";

import enActivity from "@/locales/en/activity.json";
import enAdministration from "@/locales/en/administration.json";
import enAuth from "@/locales/en/auth.json";
import enCategories from "@/locales/en/categories.json";
import enChangelog from "@/locales/en/changelog.json";
import enCommon from "@/locales/en/common.json";
import enContent from "@/locales/en/content.json";
import enDashboard from "@/locales/en/dashboard.json";
import enFeedback from "@/locales/en/feedback.json";
import enFinancial from "@/locales/en/financial.json";
import enIntegration from "@/locales/en/integration.json";
import enMarketing from "@/locales/en/marketing.json";
import enMembership from "@/locales/en/membership.json";
import enNavbar from "@/locales/en/navbar.json";
import enNotifications from "@/locales/en/notifications.json";
import enPricing from "@/locales/en/pricing.json";
import enProducts from "@/locales/en/products.json";
import enRefunds from "@/locales/en/refunds.json";
import enReports from "@/locales/en/reports.json";
import enTransactions from "@/locales/en/transactions.json";

/** The languages this panel ships. Mirrors `SupportedLocale::ALL` in the API. */
export const LOCALES = [
  { code: "id", flag: "🇮🇩", labelKey: "language.id" },
  { code: "en", flag: "🇺🇸", labelKey: "language.en" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "id";

export const LOCALE_STORAGE_KEY = "admin-locale";

export const isSupportedLocale = (value: unknown): value is Locale =>
  typeof value === "string" && LOCALES.some((locale) => locale.code === value);

/**
 * The language to start in, before the API has told us anything.
 *
 * `localStorage` only — deliberately no `Accept-Language` detection here. The
 * account's own `users.locale` is the real answer and arrives with the signed-in
 * user; guessing from the browser first would make the panel flip language a
 * beat after every sign-in.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);

    if (isSupportedLocale(stored)) return stored;
  } catch {
    // Site data blocked. Not a reason to fail to render.
  }

  return DEFAULT_LOCALE;
}

/**
 * i18n for the admin panel.
 *
 * Modelled on `apps/storefront/src/config/i18n.ts`, with one deliberate
 * difference: **no locale segment in the URL**. The storefront needs one so a
 * product page can be linked in a given language; a back-office screen is not
 * shared that way, and the cost of rewriting every route was not worth paying.
 * The choice lives on `users.locale` instead, so it follows an admin to a new
 * device — which a URL prefix could not do either.
 *
 * One namespace per feature slice, plus `common` and `navbar` for the shell.
 * Adding one means three edits in this file — the imports, both `resources`
 * maps, and the `ns` array. The storefront's CLAUDE.md flags that last one as
 * the step people forget, and it is the reason the three lists are kept
 * adjacent rather than scattered.
 */
i18n.use(initReactI18next).init({
  resources: {
    id: { activity: idActivity, administration: idAdministration, auth: idAuth, categories: idCategories, changelog: idChangelog, common: idCommon, content: idContent, dashboard: idDashboard, feedback: idFeedback, financial: idFinancial, integration: idIntegration, marketing: idMarketing, membership: idMembership, navbar: idNavbar, notifications: idNotifications, pricing: idPricing, products: idProducts, refunds: idRefunds, reports: idReports, transactions: idTransactions },
    en: { activity: enActivity, administration: enAdministration, auth: enAuth, categories: enCategories, changelog: enChangelog, common: enCommon, content: enContent, dashboard: enDashboard, feedback: enFeedback, financial: enFinancial, integration: enIntegration, marketing: enMarketing, membership: enMembership, navbar: enNavbar, notifications: enNotifications, pricing: enPricing, products: enProducts, refunds: enRefunds, reports: enReports, transactions: enTransactions },
  },
  lng: initialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  ns: ["activity", "administration", "auth", "categories", "changelog", "common", "content", "dashboard", "feedback", "financial", "integration", "marketing", "membership", "navbar", "notifications", "pricing", "products", "refunds", "reports", "transactions"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
