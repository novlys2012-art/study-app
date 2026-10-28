// UI strings: sk.json is the source, cs.json is filled in phase 7. Missing keys fall back to Slovak.
import sk from "./sk.json";
import cs from "./cs.json";

const DICTS = { sk, cs };
export const LANGS = Object.keys(DICTS);
const STORE = "studyapp-lang";

function detect() {
  try {
    const saved = localStorage.getItem(STORE);
    if (DICTS[saved]) return saved;
  } catch (e) {}
  return (navigator.language || "").toLowerCase().startsWith("cs") ? "cs" : "sk";
}

let lang = detect();
export const getLang = () => lang;

export function setLang(next) {
  if (!DICTS[next]) return;
  lang = next;
  try { localStorage.setItem(STORE, next); } catch (e) {}
  applyI18n(document);
}

// t("quiz.pos", {i: 3, n: 20}) replaces {i} and {n}; an unknown key returns the key itself.
export function t(key, vars) {
  const s = DICTS[lang][key] ?? sk[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

export function applyI18n(root) {
  document.documentElement.lang = lang;
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
