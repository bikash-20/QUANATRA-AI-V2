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
Answer the student's question directly first. Follow with a short, clear explanation; do not default to a long step-by-step response.
Include a brief worked example only when it makes the answer easier to understand. End with at most one optional, relevant follow-up question.
Be warm and direct. Never invent facts: clearly admit when you are uncertain, and distinguish uncertainty from established facts.
Use the selected language (English or Bengali); match the student's wording and register within that language. Keep code, math symbols and technical terms in English where natural. Use fenced blocks for code.
${difficultyBlock(difficulty, "chat")}
${langRule(lang)}`;

export const explainPrompt = (
  input: {
    kind: string;
    question: string;
    options?: string[];
    correctAnswer?: string;
    userAnswer?: string;
    context?: string;
  },
  difficulty: Difficulty,
  lang: Lang
) => {
  // GRE quant gets a tighter prompt: concise output (under ~250 words),
  // and the caller has already formatted qc/multi answers as readable text.
  if (input.kind === "gre-quant") {
    return {
      system: `You are Quantara, a GRE quantitative tutor. Give the answer first, then a tight, step-by-step explanation a strong test-taker can follow in under 250 words. Use math notation ($...$ inline). Do not repeat the question. If the learner's answer is wrong, identify the exact misconception in one sentence. Be honest when uncertain; never invent facts. ${difficultyBlock(difficulty, "chat")} ${langRule(lang)} ${JSON_ONLY}`,
      user: `Explain this GRE quant question.
${JSON.stringify(input)}

Rules:
- The "correctAnswer" field is already in human-readable form (for QC it is the full choice text; for multi-select it is "1. ...; 2. ..."). Use it as authoritative.
- The "userAnswer" field is in the same readable form. If it disagrees with correctAnswer, briefly say why it is wrong.
- Stay under about 250 words. Markdown is fine inside the JSON string but do not use fences.
- If the problem requires multiple distinct steps, show them as a short bulleted list. Otherwise prose is fine.

Schema: {"explanation":string}`,
    };
  }
  if (input.kind === "gre-reading") {
    return {
      system: `You are Quantara, a GRE reading-comprehension tutor. Cite the specific sentences or phrases in the passage that justify the correct answer. Give the answer first, then a concise explanation a strong test-taker can follow in under 300 words. Do not repeat the question. If the learner's answer is wrong, identify the exact line of reasoning that failed in one sentence. Be honest when uncertain; never invent facts. ${difficultyBlock(difficulty, "chat")} ${langRule(lang)} ${JSON_ONLY}`,
      user: `Explain this GRE reading-comprehension question.
${JSON.stringify(input)}

Rules:
- Use the supplied "context" field (the passage body) as the source of truth. Quote short phrases (in single quotes) when they support the answer.
- The "correctAnswer" field is already in human-readable form ("N. text" for single, "M. ...; N. ..." for multi-select). Use it as authoritative.
- The "userAnswer" field is in the same readable form. If it disagrees with correctAnswer, briefly say why it is wrong.
- Stay under about 300 words. Markdown is fine inside the JSON string but do not use fences.
- Do not invent information that is not in the passage.

Schema: {"explanation":string}`,
    };
  }
  if (input.kind === "gre-rc") {
    // RC explainer. Mirrors gre-reading's rules but with a strict
    // EVIDENCE trailer so the client can highlight the right
    // sentences in the passage. The client ignores any sentence
    // index it can't resolve, so the trailer is best-effort.
    return {
      system: `You are Quantara, a GRE reading-comprehension tutor. Always:
- Give the answer first, then a concise explanation in 4 short sections: (1) what the question is testing, (2) the line of reasoning to the correct answer, (3) why the learner's answer (if any) is wrong, naming the misconception in one sentence, (4) a single sentence summary.
- Cite the specific sentences or phrases in the passage that justify the answer; quote short phrases in single quotes.
- Use the supplied "context" (the passage body) as the source of truth; do not invent facts or rely on outside knowledge.
- Distinguish trap patterns: too extreme, out of scope, reverses the claim, true but irrelevant, partially correct, misattributes a view.
- Be honest when uncertain. ${difficultyBlock(difficulty, "chat")} ${langRule(lang)}
- Keep the explanation under about 300 words. Markdown is fine inside the JSON string but do not use fences.

After the explanation, output a literal trailer line:
EVIDENCE: <comma-separated 0-based sentence indices>

The indices refer to the 0-indexed sentences in the passage, in the order they appear. Use 1-4 indices. ${JSON_ONLY}`,
      user: `Explain this GRE reading-comprehension question.
${JSON.stringify(input)}

Rules:
- The "context" field is the full passage body. Treat it as authoritative.
- The "correctAnswer" field is already in human-readable form ("N. text" for single, "M. ...; N. ..." for multi, "Sentence K" for select-sentence). Use it as authoritative.
- The "userAnswer" field is in the same readable form. If it disagrees with correctAnswer, briefly say why it is wrong.
- If the question supplies "qType" (e.g. "main-idea", "detail", "inference", "author-attitude", "function", "structure", "vocab-in-context", "strengthen-weaken"), frame the explanation around that question type.
- Sentence indices in the EVIDENCE trailer must be 0-based and refer to the order of sentences in the context string. Verify each index is in range.
- Output exactly the JSON object: {"explanation":string} where the explanation string ENDS with the EVIDENCE trailer line.`,
    };
  }
  return {
    system: `You are Quantara, a warm and direct tutor. Explain the answer in natural language: give the answer first, then a short explanation. Include a useful worked example only when it helps, and at most one optional follow-up question. Be honest when uncertain; never invent facts. ${difficultyBlock(difficulty, "chat")} ${langRule(lang)} ${JSON_ONLY}`,
    user: `Explain this learning question.
${JSON.stringify(input)}

Use the provided correct answer as authoritative when present. If the learner's answer is present, briefly clarify why it is right or mistaken without shaming them. Use context and options when provided; do not assume missing information.

Schema: {"explanation":string}
Keep the explanation concise and self-contained.`,
  };
};

export const mcqPrompt = (topic: string, count: number, difficulty: Difficulty, lang: Lang) => ({
  system: `You write high-quality multiple-choice questions at the requested difficulty. ${langRule(lang)} ${JSON_ONLY}`,
  user: `Topic: ${topic}
Count: ${count}
${difficultyBlock(difficulty, "mcq")}

Schema (output exactly this, nothing else):
{"questions":[{"question":string,"options":[string,string,string,string],"answer":string,"explanation":string}]}

Rules:
- Exactly 4 options per question.
- One and only one option is correct; answer must exactly match the full text of that option.
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
{"questions":[{"question":string,"options":[string,string,string,string],"answer":string,"explanation":string}]}

Every correct answer must be defensible from the passage alone. The answer must exactly match one option.`,
});

export const readingGeneratePrompt = (
  category: string,
  topic: string,
  count: number,
  lang: Lang,
  difficulty: Difficulty
) => ({
  system: `You are a GRE reading-comprehension author. Write a single original passage in the requested category and 3-5 well-calibrated questions about it. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Category: ${category}
Topic: ${topic}
Question count: ${count}
${difficultyBlock(difficulty, "passage")}

Schema (output exactly this, nothing else):
{
  "id": "rc-ai-<8-char-hash>",
  "category": "${category}",
  "title": "string (<=120 chars)",
  "source": "AI-generated practice",
  "wordCount": <integer between 300 and 500>,
  "body": "string (the passage; 3-4 paragraphs; use \\n\\n between paragraphs)",
  "difficulty": "${difficulty}",
  "tags": ["string", "string"],
  "questions": [
    {
      "type": "rc-single",
      "questionId": "q-rc-ai-<short>-1",
      "stem": "string",
      "choices": ["string", "string", "string", "string", "string"],
      "answer": <index 0-4, single correct option>,
      "rationale": "string (1-2 sentences explaining why the answer is correct)"
    },
    ...
    {
      "type": "rc-multi",
      "questionId": "q-rc-ai-<short>-N",
      "stem": "string (use 'Select all that apply.' wording)",
      "choices": ["string", "string", "string", "string", "string"],
      "answer": [<index>, <index>, <index>] (1-3 correct indices, exact order doesn't matter),
      "rationale": "string (1-2 sentences)"
    }
  ]
}

Rules:
- All questions must be defensible from the passage alone; never introduce outside knowledge.
- The first 1-2 questions should be rc-single (recall or main idea). At least one question must be rc-multi (select all that apply).
- Body should be in 3-4 paragraphs separated by a single blank line. Topic vocabulary should match the category.
- Do not prefix with "Output:" or any other text. Just the JSON object.`,
});

/**
 * Generator prompt for the cross-checked /api/gre/generate-passage
 * pipeline. Output must be a complete RcPassage envelope (kind, qType,
 * evidence, etc.) so the validator and the loader accept it without
 * remapping. The `kindsMix` argument lets the caller request a specific
 * distribution of question types.
 */
export const rcGeneratePassagePrompt = (
  category: string,
  topic: string,
  count: number,
  lang: Lang,
  difficulty: Difficulty,
  kindsMix?: Partial<Record<string, number>>
) => {
  const mix =
    kindsMix && Object.keys(kindsMix).length > 0
      ? `\nQuestion type mix (HARD requirement — exactly this many of each):\n${JSON.stringify(kindsMix, null, 2)}`
      : "";
  return {
    system: `You are a GRE reading-comprehension author. Write a single original passage in the requested category with ${count} well-calibrated questions. ${JSON_ONLY} ${langRule(lang)}`,
    user: `Category: ${category}
Topic: ${topic}
Question count: ${count}
${difficultyBlock(difficulty, "passage")}${mix}

Schema (output exactly this, nothing else — no fences, no commentary):
{
  "id": "rc-ai-<8-char-hash>",
  "category": "${category}",
  "title": "string (8-160 chars)",
  "source": "ai",
  "body": "string (the passage; 3-4 paragraphs; use \\n\\n between paragraphs; 150-450 words; do NOT include any real researchers, organisations, or citations; use original placeholder names if needed)",
  "difficulty": "${difficulty}",
  "tags": ["string", "string"],
  "questions": [
    {
      "kind": "single" | "multi" | "select-sentence",
      "questionId": "q-rc-ai-<short>-<n>",
      "stem": "string (10-800 chars)",
      "qType": "main-idea" | "detail" | "inference" | "author-attitude" | "function" | "structure" | "vocab-in-context" | "strengthen-weaken",
      "evidence": [
        { "sentence": <0-based sentence index>, "anchor": "<first 5 words of that sentence, lowercase, 8-80 chars>" }
      ],
      "rationale": "string (20-800 chars)",
      // single:
      "choices": ["string", "string", "string", "string", "string"],
      "answer": <index 0-4, single correct option>,
      // multi:
      "choices": ["string", "string", "string"],
      "answer": [<index 0-2>, <index 0-2>] (1-3 correct indices),
      // select-sentence:
      "answer": <0-based sentence index>
    }
  ]
}

Rules:
- ORIGINAL passage. Do NOT cite real people, real papers, real companies, real statistics, or anything that looks like a real-world attribution.
- Body in 3-4 paragraphs separated by a blank line. Use a formal register; medium and hard should use hedged claims ("researchers have argued", "some evidence suggests") and include at least one "however" or "nevertheless" transition.
- Question kind rules:
  - "single" — exactly 5 choices; exactly 1 correct; randomized correct index.
  - "multi" — exactly 3 choices; 1-3 correct; use "Select all that apply." in the stem.
  - "select-sentence" — no choices field; answer is a 0-based index into the passage.
- Wrong-answer trap design (single/multi): too extreme, out of scope, reverses the claim, true but irrelevant, partially correct, misattributes a view.
- Evidence: every question must list 1-4 sentence indices that the answer depends on. The "anchor" must be the first ~5 words of that sentence, exactly as it appears in the body. 0-indexed. Sentence count is the number of sentences in the body (treat each . ! ? followed by whitespace+capital as a split; abbreviations are not split).
- Do not prefix with "Output:" or any other text. Just the JSON object.`,
  };
};

/**
 * Verifier prompt for the cross-checked pipeline. The verifier receives
 * ONLY the passage, sentence list, and the question text/choices — never
 * the answer key. It returns its own answer set and flags any question
 * where two choices seem defensible.
 */
export const rcVerifyPassagePrompt = (
  lang: Lang,
  difficulty: Difficulty
) => ({
  system: `You are a skeptical GRE reading-comprehension reader. Answer each question independently. The answer must be textually supported by the passage. If two choices seem defensible, set that question's "ambiguous" to true. Use only the question text and the passage — no outside knowledge. ${JSON_ONLY} ${langRule(lang)} ${difficultyBlock(difficulty, "passage")}`,
  user: `You are given a passage, the pre-split sentence list, and the questions. Output your answers.

Schema (output exactly this, nothing else):
{
  "answers": [<answer for q1>, <answer for q2>, ...],
  "ambiguous": [<true|false for q1>, <true|false for q2>, ...]
}

Rules:
- "answers[i]" is the answer for questions[i] in the same order.
- For "single" questions, the answer is the 0-based index of the chosen choice.
- For "multi" questions, the answer is the array of 0-based indices (sorted ascending).
- For "select-sentence" questions, the answer is the 0-based sentence index.
- If you cannot choose between two options for any question, set that question's "ambiguous" to true and pick the most defensible answer anyway.
- "ambiguous" must be an array of the same length as "answers".`,
});

export const flashcardPrompt = (topic: string, count: number, lang: Lang, difficulty: Difficulty) => ({
  system: `You create concise study flashcards. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Topic: ${topic}
Count: ${count}
${difficultyBlock(difficulty, "flashcard")}

Schema: {"flashcards":[{"front":string,"back":string}]}

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
{"vocab":[{"word":string,"meaning":string,"bangla":string,"example":string}]}

meaning is a short English gloss; bangla is a Bengali translation of the meaning; example shows natural usage.`,
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
{"grammar":{"rule":string,"explanation":string,"example":string,"practice":[{"question":string,"answer":string,"explanation":string}]}}

Provide one representative example and 2-4 short practice questions. Each practice explanation briefly explains why the answer is correct.`,
});

export const gradePrompt = (payload: unknown, lang: Lang) => ({
  system: `You are a strict but fair examiner. ${JSON_ONLY} ${langRule(lang)}`,
  user: `Grade this exam. Each item has the question, the correct answer (if known), and the student's answer.
${JSON.stringify(payload)}

Schema:
{"score":number,"total":number,"percent":number,"verdict":"Pass"|"Borderline"|"Fail","strengths":[string],"weak_topics":[string],"feedback":string}

Verdict thresholds: pass >= 70%, borderline 50-69%, fail < 50%.`,
});