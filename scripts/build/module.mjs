// Turns each course document, and its companion files, into one module.
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT, pad2, warn } from "./common.mjs";
import { readDocx } from "./docx.mjs";
import { readMarkdown } from "./markdown.mjs";
import { headingLevel, splitSections, lessonsFromSections, extractKeyTerms } from "./lessons.mjs";
import { readPracticeFile } from "./practice.mjs";
import { stripTags } from "./common.mjs";

export function titleFromFile(file) {
  return path.basename(file).replace(/\.(docx|md)$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim() || "Untitled module";
}

export async function loadConfig() {
  const cfg = JSON.parse(await readFile(path.join(ROOT, "course.config.json"), "utf8"));
  const out = {
    title: "Learning course", subtitle: "", organisation: "", passMark: 80,
    requireAllLessonsRead: true, revealAnswersOnFail: false, certificatePrefix: "CERT", contentVersion: "1.0",
    stages: null, resources: [], ...cfg,
  };
  if (!(out.passMark > 0 && out.passMark <= 100)) throw new Error("course.config.json: passMark must be between 1 and 100");
  return out;
}

// The course documents, in filename order. Companion files and PDFs are not documents.
export async function findDocs() {
  const dir = path.join(ROOT, "course-docs");
  const all = (await readdir(dir)).filter((n) => !n.startsWith("~$") && !n.startsWith("."));
  for (const p of all.filter((n) => /\.pdf$/i.test(n))) {
    warn(`  note: ${p} skipped. PDF files are not supported. Save the document as Word (.docx) or Markdown (.md).`);
  }
  const names = all
    .filter((n) => /\.(docx|md)$/i.test(n) && !/-(practice|assessment)\.md$/i.test(n) && !/^readme\.md$/i.test(n))
    .sort();
  if (!names.length) throw new Error("No .docx or .md files in course-docs/. Add the course documents there and run again.");
  return names.map((n) => path.join(dir, n));
}

export async function readModule(file, index) {
  const id = `m${pad2(index + 1)}`;
  const base = path.join(path.dirname(file), path.basename(file, path.extname(file)));
  const isMd = /\.md$/i.test(file);
  const { html: raw, warnings, title: frontTitle } = isMd ? await readMarkdown(file, id) : await readDocx(file, id);

  const { terms, html } = extractKeyTerms(raw);
  const level = headingLevel(html);
  let sections = splitSections(html, level);

  // Knowledge Check and Answers sections are not read from the document. Practice goes in the companion file.
  const ignored = sections.filter((s) => /knowledge check|^answers?\b/i.test(s.title));
  if (ignored.length) {
    warnings.push(`"${ignored.map((s) => s.title).join('", "')}" in ${path.basename(file)} is not read. Move these questions to ${path.basename(base)}-practice.md (see the documents guide).`);
  }
  sections = sections.filter((s) => !ignored.includes(s));

  const lessons = lessonsFromSections(sections, id);
  if (!lessons.length) throw new Error(`${path.basename(file)}: no lesson text found in this document`);

  let practice = [];
  const practiceFile = `${base}-practice.md`;
  if (existsSync(practiceFile)) {
    const read = await readPracticeFile(practiceFile);
    practice = read.practice;
    warnings.push(...read.warnings);
  }

  if (level === 0) warnings.push("No Heading 1 or Heading 2 found, so the whole document is one lesson. Use Heading 1 for each lesson.");
  if (level === 2) warnings.push("No Heading 1 found, so lessons are split at Heading 2.");
  const plain = stripTags(html);
  if (/key terms?\b/i.test(plain) && !terms.length) {
    warnings.push('"Key terms" is in the text but no terms were read. Check the table has the header row Term | Definition.');
  }

  return {
    id, number: index + 1, title: frontTitle || titleFromFile(file), lessons, practice, terms, warnings,
    assessmentFile: `${base}-assessment.md`,
  };
}
