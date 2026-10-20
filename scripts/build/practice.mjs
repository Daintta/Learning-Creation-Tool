// Practice files: NN-Title-practice.md, next to the document. Same layout as the assessments
// ("## single", "## multi", "## truefalse"), without the pass mark. Answers are shown after each question.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAssessment } from "./assessments.mjs";

export async function readPracticeFile(file) {
  const label = path.basename(file);
  const src = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const questions = parseAssessment(src, "practice", label);
  const warnings = [];
  const letters = "ABCDEFGHIJ";
  const practice = [];
  let skipped = 0;
  for (const q of questions) {
    if (!["single", "multi", "truefalse"].includes(q.type)) { skipped += 1; continue; }
    // Options are shown as A, B, C..., so answers are letters rather than the hashed ids the assessments use.
    const chosen = q.type === "truefalse" ? [q.answer] : q.answer.split(",");
    const answer = q.options.map((o, j) => (chosen.includes(o.id) ? letters[j] : null)).filter(Boolean);
    practice.push({
      n: practice.length + 1, prompt: q.prompt, multi: q.type === "multi" || answer.length > 1,
      options: q.options.map((o, j) => ({ id: letters[j], text: o.text })), answer, rationale: q.explanation || "",
    });
  }
  if (skipped) warnings.push(`${label}: ${skipped} match/order question(s) skipped. Practice supports single, multi and true/false.`);
  if (!practice.length) {
    throw new Error(`${label}: no practice questions were read. Practice files use the layout ## single, ## multi or ## truefalse.`);
  }
  return { practice, warnings };
}
