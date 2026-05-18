import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ru from "./ru.json";

export const defaultNS = "translation";
export const resources = {
  en: { translation: en },
  ru: { translation: ru },
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
