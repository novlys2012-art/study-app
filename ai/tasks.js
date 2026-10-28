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
