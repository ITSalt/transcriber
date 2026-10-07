import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ru from "./ru.json";

export const defaultNS = "translation";

type Bundle = Record<string, unknown>;

/**
 * Feature translations (D-15): `features/<name>/i18n/{ru,en}.json` is
 * registered automatically as the namespace `<name>` — no edits here needed.
 */
function featureNamespaces(
  modules: Record<string, Bundle>,
): Record<"en" | "ru", Record<string, Bundle>> {
  const result: Record<"en" | "ru", Record<string, Bundle>> = {
    en: {},
    ru: {},
  };
  for (const [path, bundle] of Object.entries(modules)) {
    const match = /features\/([^/]+)\/i18n\/(ru|en)\.json$/.exec(path);
    if (match) result[match[2] as "en" | "ru"][match[1]!] = bundle;
  }
  return result;
}

const features = featureNamespaces(
  import.meta.glob<Bundle>("../features/*/i18n/{ru,en}.json", {
    eager: true,
    import: "default",
  }),
);

export const resources = {
  en: { translation: en, ...features.en },
  ru: { translation: ru, ...features.ru },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem("lang") ?? "ru",
  fallbackLng: "en",
  defaultNS,
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
