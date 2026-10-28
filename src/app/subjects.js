// Subjects and their questions, kept on the device until accounts and sync arrive in phase 2.
// A subject: { id, code, name, term, topics: { key: name }, questions: [{ t, q, o, a, e, x, s }] }
// Questions use the format the AI layer returns (ai/tasks.js); "a" may be an array for several right answers.
const STORE = "studyapp-subjects-v1";

// Stable question id from its text, so progress survives adding new questions.
export function hid(s) {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0;
  return h.toString(36).slice(-5).padStart(5, "0");
}

export function loadSubjects() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) {}
  if (!Array.isArray(list)) return [];
  return list
    .filter((sj) => sj && sj.id && Array.isArray(sj.questions))
    .map((sj) => ({
      topics: {},
      ...sj,
      questions: sj.questions.map((x) => (x.id ? x : { ...x, id: hid((x.t || "") + "|" + x.q) })),
    }));
}

export function saveSubjects(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {}
}

export const progressKey = (sj) => "studyapp-progress:" + sj.id;
