/**
 * KERF i18n — App Store / Play necessary languages.
 * Detects browser locale, persists choice, supports RTL (ar).
 */
import { STRINGS, LANGS } from "./locales.js";

const KEY = "kerf.lang.v1";

export { LANGS };

export function detectLang() {
  const saved = localStorage.getItem(KEY);
  if (saved && STRINGS[saved]) return saved;
  const nav = (navigator.language || "en").toLowerCase();
  const base = nav.split("-")[0];
  if (STRINGS[nav]) return nav;
  if (STRINGS[base]) return base;
  // regional fallbacks
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("pt")) return "pt";
  return "en";
}

let current = "en";

export function getLang() {
  return current;
}

export function setLang(code) {
  if (!STRINGS[code]) code = "en";
  current = code;
  localStorage.setItem(KEY, code);
  document.documentElement.lang = code;
  document.documentElement.dir = LANGS.find((l) => l.code === code)?.dir || "ltr";
  return current;
}

export function t(key, vars = {}) {
  const table = STRINGS[current] || STRINGS.en;
  let s = table[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Apply data-i18n / data-i18n-html / data-i18n-aria / data-i18n-title / data-i18n-placeholder */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    if (el.children.length && el.getAttribute("data-i18n-keep-children") === "1") {
      // only update text nodes carefully — skip
      return;
    }
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  const titleEl = document.querySelector("title");
  if (titleEl) titleEl.textContent = t("app.title");
  const theme = document.querySelector('meta[name="description"]');
  if (theme) theme.setAttribute("content", t("app.description"));
}

export function initI18n() {
  setLang(detectLang());
  applyI18n();
}
