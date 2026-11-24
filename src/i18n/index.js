// UI strings: sk.json is bundled statically; cs.json loads on demand to keep the initial bundle light.
import sk from "./sk.json";

const DICTS = { sk };
export const LANGS = ["sk", "cs"];
const STORE = "studyapp-lang";

function detect() {
  try {
    const saved = localStorage.getItem(STORE);
    if (LANGS.includes(saved)) return saved;
  } catch (e) {}
  return (navigator.language || "").toLowerCase().startsWith("cs") ? "cs" : "sk";
}

let lang = detect();
let csLoad = null;
export const getLang = () => lang;

export async function ensureLang(next = lang) {
  if (next !== "cs" || DICTS.cs) return;
  if (!csLoad) csLoad = import("./cs.json").then((m) => { DICTS.cs = m.default || m; });
  await csLoad;
}

export async function setLang(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  try { localStorage.setItem(STORE, next); } catch (e) {}
  await ensureLang(next);
  applyI18n(document);
}

// t("quiz.pos", {i: 3, n: 20}) replaces {i} and {n}; an unknown key returns the key itself.
export function t(key, vars) {
  const dict = DICTS[lang] || sk;
  const s = dict[key] ?? sk[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

export function applyI18n(root) {
  document.documentElement.lang = lang;
  if (root === document) document.title = "Lekto – " + t("welcome.title").replace(/\.$/, "");
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = t(el.dataset.i18n);
    if (el.textContent !== v) el.textContent = v;
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const v = t(el.dataset.i18nPlaceholder);
    if (el.placeholder !== v) el.placeholder = v;
  });
  root.querySelectorAll("[data-i18n-label]").forEach((el) => {
    const v = t(el.dataset.i18nLabel);
    if (el.getAttribute("aria-label") !== v) el.setAttribute("aria-label", v);
  });
}
