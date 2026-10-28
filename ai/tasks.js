// Prompts and output checks for the study features. Provider-neutral: plain text in, JSON out.

const LANG = { sk: "slovenčine", cs: "češtině" };

export function summaryQuizSystem(lang = "sk") {
  return `You turn university course material into study material for students.
Write everything in ${lang === "cs" ? "Czech" : "Slovak"} (v ${LANG[lang] || LANG.sk}), whatever the language of the source.
Use only facts stated in the source. If the source is too thin for a question, write fewer questions.

Reply with one JSON object and nothing else:
{
  "summary": "the section's key points as short Markdown bullet lines",
  "questions": [
    {
      "q": "question text",
      "o": ["option A", "option B", "option C", "option D"],
      "a": 0,
      "e": "one or two sentences on why the answer is right",
      "x": "a short concrete example, or an empty string",
      "s": "a short exact quote from the source that supports the answer"
    }
  ]
}
"a" is the index of the one correct option. Wrong options must be plausible but clearly wrong given the source.`;
}

export function summaryQuizPrompt({ title, text, count = 8 }) {
  return `Source: ${title}\nWrite a summary and ${count} multiple-choice questions.\n\n<source>\n${text}\n</source>`;
}

// Pulls the first JSON object out of a reply and keeps only well-formed questions.
export function parseSummaryQuiz(reply) {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in the reply.");
  const data = JSON.parse(reply.slice(start, end + 1));
  const questions = (Array.isArray(data.questions) ? data.questions : []).filter(
    (x) => typeof x.q === "string" && Array.isArray(x.o) && x.o.length >= 2 &&
      Number.isInteger(x.a) && x.a >= 0 && x.a < x.o.length,
  );
  const dropped = (data.questions?.length || 0) - questions.length;
  return { summary: String(data.summary || ""), questions, dropped };
}

// Past exam mode: read an old exam (text or scanned pages) and tag every question with a topic.
export function pastExamSystem(lang = "sk") {
  return `You read old university exams for students who want to know which topics come up most.
List every exam question or task you can find, in order. Copy its wording as written (fix only obvious scan errors).
Give each one a short topic name in ${lang === "cs" ? "Czech" : "Slovak"}, 1 to 4 words, the way a course syllabus would name it.
Reuse the same topic name for questions on the same topic, and prefer names from the known topics list when one fits.
If part of a page is unreadable, say so in "unreadable" instead of guessing.

Reply with one JSON object and nothing else:
{
  "questions": [{ "n": "1a", "text": "question wording", "topic": "topic name", "points": 5 }],
  "unreadable": "what could not be read, or an empty string"
}
"points" is a number when the exam shows it, otherwise null.`;
}

export function pastExamPrompt({ title, text = "", knownTopics = [] }) {
  return `Exam: ${title}\nKnown topics: ${knownTopics.length ? knownTopics.join("; ") : "none yet"}\n`
    + (text.trim() ? `\n<exam_text>\n${text}\n</exam_text>\n` : "\nThe exam is in the attached page images.\n");
}

export function parsePastExam(reply) {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in the reply.");
  const data = JSON.parse(reply.slice(start, end + 1));
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .filter((x) => typeof x.text === "string" && typeof x.topic === "string" && x.topic.trim())
    .map((x) => ({ n: String(x.n ?? ""), text: x.text, topic: x.topic.trim(), points: typeof x.points === "number" ? x.points : null }));
  return { questions, unreadable: String(data.unreadable || "") };
}

// How often each topic appears across exams, most frequent first.
export function rankTopics(exams) {
  const by = new Map();
  exams.forEach((exam, e) => exam.questions.forEach((q) => {
    const k = q.topic.toLowerCase();
    const r = by.get(k) || { topic: q.topic, exams: new Set(), questions: 0, points: 0 };
    r.exams.add(e); r.questions++; r.points += q.points || 0;
    by.set(k, r);
  }));
  return [...by.values()]
    .map((r) => ({ topic: r.topic, exams: r.exams.size, of: exams.length, questions: r.questions, points: r.points }))
    .sort((a, b) => b.exams - a.exams || b.questions - a.questions || b.points - a.points);
}
