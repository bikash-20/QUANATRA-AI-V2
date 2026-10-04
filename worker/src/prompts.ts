export type Lang = "en" | "bn";
export type Difficulty = "easy" | "medium" | "hard";

const langRule = (lang: Lang) =>
  lang === "bn"
    ? "Reply in Bengali (বাংলা). Keep code, math symbols and technical terms in English where natural."
    : "Reply in English.";

const normDifficulty = (d: unknown): Difficulty =>
  d === "easy" || d === "hard" ? d : "medium";

const difficultyBlock = (
  d: Difficulty,
  kind: "general" | "mcq" | "passage" | "flashcard" | "vocab" | "grammar" | "chat"
) => {
  const diff = normDifficulty(d);
  if (kind === "general" || kind === "chat") {
    if (diff === "easy") return "Calibrate language for a beginner: short sentences, define every term, no idioms.";
    if (diff === "medium") return "Calibrate language for an intermediate learner: standard vocabulary, brief context for unfamiliar terms.";
    return "Calibrate language for an advanced learner: assume domain knowledge, use precise terminology, be concise.";
  }
  if (kind === "mcq") {
    if (diff === "easy") return "Difficulty=easy. Exactly one option is clearly correct; the three distractors are obviously wrong (off-topic or factually false). The question tests recall of one definition or fact.";
    if (diff === "medium") return "Difficulty=medium. Distractors are plausible but contain a subtle error (wrong scope, wrong unit, off-by-one). Tests understanding, not just recall.";
    return "Difficulty=hard. Distractors are near-miss alternatives that require applying the rule precisely to disambiguate. Tests discrimination between similar concepts.";
  }
  if (kind === "passage") {
    if (diff === "easy") return "Difficulty=easy. Questions test literal recall (who/what/when) directly stated in the passage.";
    if (diff === "medium") return "Difficulty=medium. Questions require combining two sentences or paraphrasing; the answer is still textually supported.";
    return "Difficulty=hard. Questions require inference, cause/effect, or author intent; the answer is implied but not stated verbatim.";
  }
  if (kind === "flashcard") {
    if (diff === "easy") return "Difficulty=easy. Front: term/concept. Back: one-sentence definition plus one simple example.";
    if (diff === "medium") return "Difficulty=medium. Front: term/concept. Back: definition, one example, and one related term or antonym.";
    return "Difficulty=hard. Front: term or short scenario. Back: definition, an edge case, and a common misconception to avoid.";
  }
  if (kind === "vocab") {
    if (diff === "easy") return "Difficulty=easy. Examples use the word in a common, cognate-friendly sentence. Skip idioms.";
    if (diff === "medium") return "Difficulty=medium. Examples show the word in typical collocations; one or two may be mildly idiomatic.";
    return "Difficulty=hard. Examples show the word in nuanced or idiomatic usage; test fine meaning distinctions.";
  }
  // grammar
  if (diff === "easy") return "Difficulty=easy for practice. Practice items are fill-in-the-blank or single-word choice at the same CEFR level.";
  if (diff === "medium") return "Difficulty=medium for practice. Practice items are error-correction and short transformation at the same CEFR level.";
  return "Difficulty=hard for practice. Practice items require multi-clause transformation and nuanced tense/structure decisions.";
};

export const JSON_ONLY =
  "Output ONLY valid JSON. No markdown fences, no commentary, no trailing text.";

export const tutorSystem = (lang: Lang, subject?: string, difficulty: Difficulty = "medium") =>
  `You are Quantara, a patient AI tutor for CS, math, physics and coding${subject ? ` (current subject: ${subject})` : ""}.
Explain step by step: start simple, then go deeper. Use short examples. For code use fenced blocks.
If the student seems stuck, ask one guiding question instead of dumping the answer. Never invent facts; say when unsure.
${difficultyBlock(difficulty, "chat")}
${langRule(lang)}`;

export const mcqPrompt = (topic: string, count: number, difficulty: Difficulty, lang: Lang) => ({
  system: `You write high-quality multiple-choice questions at the requested difficulty. ${langRule(lang)} ${JSON_ONLY}`,
  user: `Topic: ${topic}
Count: ${count}
${difficultyBlock(difficulty, "mcq")}

Schema (output exactly this, nothing else):
{"questions":[{"question":string,"options":[string,string,string,string],"answerIndex":0-3,"explanation":string}]}

Rules:
- Exactly 4 options per question.
- One and only one option is correct; answerIndex is 0..3.
- Explanation names the underlying rule or fact.
- No markdown, no preamble.`,
});

export const passagePrompt = (text: string, count: number, lang: Lang, difficulty: Difficulty) => ({
  system: `You write reading-comprehension questions strictly from the given passage. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Passage:
"""${text}"""
Count: ${count}
${difficultyBlock(difficulty, "passage")}

Schema:
{"questions":[{"question":string,"options":[string,string,string,string],"answerIndex":0-3,"explanation":string}]}

Every correct answer must be defensible from the passage alone.`,
});

export const flashcardPrompt = (topic: string, count: number, lang: Lang, difficulty: Difficulty) => ({
  system: `You create concise study flashcards. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Topic: ${topic}
Count: ${count}
${difficultyBlock(difficulty, "flashcard")}

Schema: {"cards":[{"front":string,"back":string}]}

Back of each card must be self-contained: a learner reading it cold should understand without the front.`,
});

export const vocabPrompt = (
  topic: string,
  level: string,
  count: number,
  lang: Lang,
  difficulty: Difficulty
) => ({
  system: `You are an English vocabulary teacher. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Theme: ${topic}
CEFR level: ${level}
Count: ${count}
${difficultyBlock(difficulty, "vocab")}

Schema:
{"words":[{"word":string,"partOfSpeech":string,"meaning":string,"meaningBn":string,"example":string,"synonyms":[string]}]}

meaning is short English gloss; meaningBn is a Bengali translation of the meaning; example shows natural usage.`,
});

export const grammarPrompt = (
  topic: string,
  level: string,
  lang: Lang,
  difficulty: Difficulty
) => ({
  system: `You are an English grammar teacher. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Topic: ${topic}
CEFR level: ${level}
${difficultyBlock(difficulty, "grammar")}

Schema:
{"title":string,"level":string,"explanation":string,"rules":[string],"examples":[{"correct":string,"incorrect":string,"note":string}],"commonMistakes":[string],"practice":[{"question":string,"answer":string}]}

rules is a short numbered list; commonMistakes is 2-4 bullets. Practice questions must be solvable from the explanation.`,
});

export const gradePrompt = (payload: unknown, lang: Lang) => ({
  system: `You are a strict but fair examiner. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Grade this exam. Each item has the question, the correct answer (if known), and the student's answer.
${JSON.stringify(payload)}

Schema:
{"score":number,"total":number,"percent":number,"verdict":"Pass"|"Borderline"|"Fail","strengths":[string],"weakTopics":[string],"feedback":string}

Verdict thresholds: pass >= 70%, borderline 50-69%, fail < 50%.`,
});