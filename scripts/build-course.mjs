#!/usr/bin/env node
/*
 * Build the course from the documents in course-docs/.
 *
 *   npm run build-course                     build the course; stops if an assessment is missing or still a template
 *   npm run build-course -- --template       create a blank assessments/mNN.md for any module that has none
 *   npm run build-course -- --allow-drafts   build even with unapproved templates (preview only)
 *
 * Reads:  course-docs/*.docx and course-docs/*.pdf (in filename order), course.config.json,
 *         assessments/mNN.md (one per module, written by hand)
 * Writes: content/catalog.js, content/modules/mNN.js, content/glossary.js,
 *         content/assessments.js, content/course-config.js, assets/img/mNN-imageN.*
 *
 * Nothing is sent to any online service. Assessment questions are written by hand.
 */
import { readFile, writeFile, readdir, mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { marked } from "marked";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = process.env.COURSE_ROOT ? path.resolve(process.env.COURSE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const TEMPLATE = args.has("--template");
const ALLOW_DRAFTS = args.has("--allow-drafts");
const DRAFT_RE = /^<!--\s*status:\s*draft/m;
const TYPES = new Set(["single", "multi", "truefalse", "match", "order"]);

const pad2 = (n) => String(n).padStart(2, "0");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const stripTags = (html) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
const hid = (...parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 6);
const log = (msg) => console.log(msg);

function titleFromFile(file) {
  return path.basename(file).replace(/\.(docx|pdf|md)$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim() || "Untitled module";
}

async function loadConfig() {
  const cfg = JSON.parse(await readFile(path.join(ROOT, "course.config.json"), "utf8"));
  const out = {
    title: "Learning course", subtitle: "", organisation: "", passMark: 80, 
    requireAllLessonsRead: true, revealAnswersOnFail: false, certificatePrefix: "CERT", contentVersion: "1.0",
    stages: null, resources: [], ...cfg,
  };
  if (!(out.passMark > 0 && out.passMark <= 100)) throw new Error("course.config.json: passMark must be between 1 and 100");
  return out;
}

async function findDocs() {
  const dir = path.join(ROOT, "course-docs");
  const names = (await readdir(dir))
    .filter((n) => /\.(docx|pdf|md)$/i.test(n) && !/-(practice|assessment)\.md$/i.test(n) && !/^readme\.md$/i.test(n) && !n.startsWith("~$") && !n.startsWith("."))
    .sort();
  if (!names.length) throw new Error("No .docx, .pdf or .md files in course-docs/. Add the course documents there and run again.");
  return names.map((n) => path.join(dir, n));
}

/* ---------- reading documents ---------- */

async function readDocx(file, id) {
  let imageNo = 0;
  const noAlt = [];
  const convertImage = mammoth.images.imgElement(async (image) => {
    imageNo += 1;
    if (!image.altText) noAlt.push(imageNo);
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg" }[image.contentType] || "png";
    const name = `${id}-image${imageNo}.${ext}`;
    await writeFile(path.join(ROOT, "assets", "img", name), await image.read());
    return { src: `assets/img/${name}` };
  });
  const { value, messages } = await mammoth.convertToHtml({ path: file }, { convertImage });
  const warnings = messages.filter((m) => m.type === "warning").map((m) => m.message);
  if (noAlt.length) warnings.push(`${noAlt.length} image(s) have no alt text (image ${noAlt.join(", ")}). Add Alt Text in Word so screen readers can describe them.`);
  return { html: value, warnings };
}

// Markdown: each "# " heading is a section, the same as a Heading 1 in Word. Numbered lines inside a
// Knowledge Check or Answers section are escaped so they stay as text lines, not list items.
// Local images are copied to assets/img/ and keep their alt text.
async function readMarkdown(file, id) {
  let src = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  // Optional front matter (--- ... ---) gives the module title. It is not shown as lesson text.
  let title = null;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    title = (fm[1].match(/^title:\s*(.+)$/m) || [])[1]?.trim() || null;
    src = src.slice(fm[0].length);
  }
  // Callouts: ":::kind Optional title" ... ":::" become styled boxes. The body stays Markdown.
  src = src.replace(/^:::(principle|note|example|warning|update)[ \t]*(.*)\n([\s\S]*?)^:::[ \t]*$/gm, (m, kind, heading, body) => {
    const label = heading.trim() ? `<p class="callout-title">${esc(heading.trim())}</p>` : "";
    return `<aside class="callout callout-${kind}">${label}\n\n${body.trim()}\n\n</aside>`;
  });
  const prepared = src.split(/^(?=# )/m).map((chunk) => {
    const head = chunk.match(/^# (.*)$/m);
    const practice = head && /knowledge check|answer/i.test(head[1]);
    return practice ? chunk.replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2\\.$3") : chunk;
  }).join("");
  const html = marked.parse(prepared, { gfm: true });

  const warnings = [];
  const noAlt = [];
  const images = [...html.matchAll(/<img src="([^"]+)"([^>]*)>/g)];
  let out = "";
  let last = 0;
  let imageNo = 0;
  for (const m of images) {
    out += html.slice(last, m.index);
    last = m.index + m[0].length;
    const alt = (/alt="([^"]*)"/.exec(m[2]) || [])[1] || "";
    const srcPath = m[1];
    if (/^(https?:|data:)/i.test(srcPath)) {
      warnings.push(`Image "${srcPath}" is a web link, so it is not copied. Save it into the document folder instead.`);
      out += m[0];
      continue;
    }
    const from = path.resolve(path.dirname(file), decodeURI(srcPath));
    if (!existsSync(from)) {
      warnings.push(`Image "${srcPath}" was not found next to the Markdown file.`);
      out += m[0];
      continue;
    }
    imageNo += 1;
    const ext = path.extname(from).toLowerCase().replace(".", "") || "png";
    const name = `${id}-image${imageNo}.${ext}`;
    await copyFile(from, path.join(ROOT, "assets", "img", name));
    if (!alt) noAlt.push(imageNo);
    out += `<img src="assets/img/${name}" alt="${alt}">`;
  }
  out += html.slice(last);
  if (noAlt.length) warnings.push(`${noAlt.length} image(s) have no alt text (image ${noAlt.join(", ")}). Add alt text in the ![...] part of the Markdown.`);
  return { html: out, warnings, title };
}

// Companion practice file: NN-Name-practice.md next to NN-Name.(docx|pdf|md). Every numbered line is
// read as a question, so the whole file uses the Knowledge Check layout (questions, then an "Answers" heading).
async function readPracticeFile(file) {
  const src = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  // Assessment layout ("## single", "## multi", "## truefalse"): same files as the assessments.
  if (/^##\s+(single|multi|truefalse)\s*$/m.test(src)) {
    const questions = parseAssessment(src, "practice", path.basename(file));
    const practice = [];
    let skipped = 0;
    for (const q of questions) {
      if (!["single", "multi", "truefalse"].includes(q.type)) { skipped += 1; continue; }
      const letters = "ABCDEFGHIJ";
      const chosen = q.type === "truefalse" ? [q.answer] : q.answer.split(",");
      const answer = q.options.map((o, j) => (chosen.includes(o.id) ? letters[j] : null)).filter(Boolean);
      practice.push({
        n: practice.length + 1, prompt: q.prompt, multi: q.type === "multi" || answer.length > 1,
        options: q.options.map((o, j) => ({ id: letters[j], text: o.text })), answer, rationale: q.explanation || "",
      });
    }
    if (skipped) console.warn(`  note: ${path.basename(file)}: ${skipped} match/order question(s) skipped. Practice supports single, multi and true/false.`);
    return { practice, numbered: questions.length };
  }
  // Knowledge Check layout: numbered questions with lettered options, then an "Answers" heading.
  const prepared = src.replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2\\.$3");
  const lines = htmlToLines(marked.parse(prepared, { gfm: true }));
  const numbered = lines.filter((l) => /^\d+\.\s/.test(l)).length;
  const practice = parseKnowledgeCheck(lines);
  return { practice, numbered };
}

// PDFs carry no heading tags, so headings are found from font size. The most common size (by
// characters) is the body text. Short lines clearly larger than that become headings: about 1.4x
// the body size is Heading 1, about 1.15x is Heading 2. Text lines that repeat on most pages
// (running headers and footers) and bare page numbers are dropped. Lines are then joined into
// paragraphs, and the result goes through the same splitting as a Word file.
const fontSize = (item) => Math.abs(item.height || (item.transform && item.transform[3]) || 0);

async function readPdf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(file)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const lines = [];
    let items = [];
    const flush = () => {
      const text = items.map((it) => it.str).join("").replace(/\s+/g, " ").trim();
      if (text) {
        const dominant = items.reduce((best, it) => (it.str.trim().length > best.str.trim().length ? it : best), items[0]);
        lines.push({ text, size: Math.round(fontSize(dominant) * 2) / 2 });
      }
      items = [];
    };
    for (const item of content.items) {
      if (!("str" in item)) continue;
      items.push(item);
      if (item.hasEOL) flush();
    }
    flush();
    pages.push(lines);
  }

  const onPages = new Map();
  for (const lines of pages) for (const t of new Set(lines.map((l) => l.text))) onPages.set(t, (onPages.get(t) || 0) + 1);
  const repeated = (t) => pages.length >= 3 && onPages.get(t) > pages.length / 2;
  const kept = pages.flat().filter((l) => !repeated(l.text) && !/^\d+$/.test(l.text));

  const weight = new Map();
  for (const l of kept) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
  const body = [...weight.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 0;
  const levelOf = (l) => {
    if (!body || l.text.length > 120 || /[.!?;]$/.test(l.text)) return 0;
    const ratio = l.size / body;
    return ratio >= 1.4 ? 1 : ratio >= 1.15 ? 2 : 0;
  };

  const blocks = [];
  for (const l of kept) {
    const level = levelOf(l);
    const prev = blocks[blocks.length - 1];
    if (level) {
      if (prev && prev.type === "h" && prev.level === level && (prev.text + " " + l.text).length <= 120) prev.text += " " + l.text;
      else blocks.push({ type: "h", level, text: l.text });
    } else if (prev && prev.type === "p" && !prev.closed) {
      prev.text += " " + l.text;
      if (/[.!?:;]$/.test(l.text) || l.text.length < 40) prev.closed = true;
    } else {
      blocks.push({ type: "p", text: l.text, closed: /[.!?:;]$/.test(l.text) || l.text.length < 40 });
    }
  }

  const headings = blocks.filter((b) => b.type === "h");
  const html = blocks.map((b) => (b.type === "h" ? `<h${b.level}>${esc(b.text)}</h${b.level}>` : `<p>${esc(b.text)}</p>`)).join("\n");
  const warnings = [];
  if (headings.length) {
    const list = headings.slice(0, 12).map((h) => `"${h.text}" (H${h.level})`).join(", ");
    warnings.push(`PDF headings found from font size: ${list}${headings.length > 12 ? ", ..." : ""}. Check these are right.`);
  } else {
    warnings.push("No headings found in the PDF from font size, so the whole file is one lesson.");
  }
  return { html, warnings };
}

// Heading level used to split lessons: 1 if the document has Heading 1s, otherwise 2 if it has
// Heading 2s, otherwise 0 (the whole document is one lesson).
function headingLevel(html) {
  if (/<h1[\s>]/i.test(html)) return 1;
  if (/<h2[\s>]/i.test(html)) return 2;
  return 0;
}

// Each heading at the chosen level starts a section. Text before the first heading goes into the first section.
function splitSections(html, level = headingLevel(html)) {
  if (level === 0) return [{ title: "Content", html }];
  const tag = `h${level}`;
  const parts = html.split(new RegExp(`(?=<${tag}[\\s>])`, "i")).filter((p) => p.trim());
  const isHeading = (p) => new RegExp(`^<${tag}[\\s>]`, "i").test(p);
  const lead = parts.filter((p) => !isHeading(p)).join("");
  const headed = parts.filter(isHeading);
  if (headed.length === 0) return [{ title: "Content", html: lead }];
  const sections = headed.map((p) => {
    const m = p.match(new RegExp(`^<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return { title: m ? stripTags(m[1]) || "Section" : "Section", html: p.replace(new RegExp(`^<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "i"), "") };
  });
  sections[0].html = lead + sections[0].html;
  return sections;
}

// Each section with text becomes a lesson. Ids are made unique within the module.
function lessonsFromSections(sections, moduleId) {
  const seen = new Map();
  return sections
    .filter((s) => stripTags(s.html) !== "")
    .map((s) => {
      const base = `${moduleId}-${slug(s.title)}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { id: n === 1 ? base : `${base}-${n}`, title: s.title, html: s.html };
    });
}

function splitLessons(html, moduleId) {
  return lessonsFromSections(splitSections(html), moduleId);
}

// Block elements become line breaks and table cells become " | ", so the question and
// answer patterns below work the same on Word and PDF text.
function htmlToLines(html) {
  const text = unesc(html
    .replace(/<tr[^>]*>/gi, "\n| ")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
  return text.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Knowledge Check layout: numbered questions with lettered options ("A. ..."), then an
// answer section with lines like "1. B: rationale" or "2. A and C: rationale", or a table row "| 1 | B | rationale |".
function parseKnowledgeCheck(lines) {
  const answerAt = lines.findIndex((l) => /^answers?( key)?:?$/i.test(l));
  const qLines = answerAt < 0 ? lines : lines.slice(0, answerAt);
  const aLines = answerAt < 0 ? [] : lines.slice(answerAt + 1);

  const questions = [];
  for (const line of qLines) {
    const q = line.match(/^(\d+)\.\s+(.+)$/);
    if (q) {
      const text = q[2].replace(/\[?select (one|all that apply)\]?\.?/gi, "").trim();
      questions.push({ n: Number(q[1]), prompt: text, multi: /select all/i.test(q[2]), options: [], answer: [], rationale: "" });
      continue;
    }
    const o = line.match(/^([A-F])\.\s+(.+)$/);
    if (o && questions.length) questions[questions.length - 1].options.push({ id: o[1], text: o[2].trim() });
  }

  const answers = new Map();
  for (const line of aLines) {
    const a = line.match(/^(?:- )?(\d+)\.\s*([A-F](?:[ ,]+(?:and\s+)?[A-F])*)\s*:\s*(.+)$/)
      || line.match(/^\|\s*(\d+)\s*\|\s*([A-F ,and]+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (a) answers.set(Number(a[1]), { letters: a[2].match(/[A-F]/g), rationale: a[3].trim() });
  }

  return questions
    .filter((q) => answers.has(q.n) && q.options.length)
    .map((q) => {
      const { letters, rationale } = answers.get(q.n);
      const known = q.options.map((o) => o.id);
      if (letters.some((l) => !known.includes(l))) throw new Error(`Knowledge Check question ${q.n}: answer ${letters.join(",")} is not one of its options`);
      return { n: q.n, prompt: q.prompt, multi: q.multi || letters.length > 1, options: q.options, answer: letters, rationale };
    });
}

// Pulls Key Terms tables (header row "Term" | "Definition") out of the HTML.
function extractKeyTerms(html) {
  const terms = [];
  const kept = html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1])));
    const header = rows[0] || [];
    if (!(header.length >= 2 && header[0].toLowerCase() === "term" && header[1].toLowerCase() === "definition")) return table;
    for (const cells of rows.slice(1)) if (cells.length >= 2 && cells[0] && cells[1]) terms.push({ term: cells[0], definition: cells[1] });
    return "";
  });
  return { terms, html: kept };
}

// Separates the Knowledge Check (and its answer section, if it has one) from the lessons.
function extractPractice(sections) {
  const at = sections.findIndex((s) => /knowledge check/i.test(s.title));
  if (at < 0) return { practice: [], sections };
  const block = [sections[at]];
  if (sections[at + 1] && /answer/i.test(sections[at + 1].title)) block.push(sections[at + 1]);
  const lines = block.flatMap((s, i) => (i ? ["Answers", ...htmlToLines(s.html)] : htmlToLines(s.html)));
  const rest = sections.filter((s) => !block.includes(s));
  return { practice: parseKnowledgeCheck(lines), sections: rest };
}

async function readModule(file, index) {
  const id = `m${pad2(index + 1)}`;
  const isPdf = /\.pdf$/i.test(file);
  const isMd = /\.md$/i.test(file);
  const { html: raw, warnings, title: frontTitle } = isPdf ? await readPdf(file) : isMd ? await readMarkdown(file, id) : { ...(await readDocx(file, id)), title: null };
  const { terms, html } = extractKeyTerms(raw);
  const level = headingLevel(html);
  let { practice, sections } = extractPractice(splitSections(html, level));
  const companion = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}-practice.md`);
  if (existsSync(companion)) {
    const from = await readPracticeFile(companion);
    if (practice.length) warnings.push(`\"Knowledge Check\" in the document is ignored because ${path.basename(companion)} is present.`);
    if (from.numbered !== from.practice.length) warnings.push(`${path.basename(companion)}: ${from.numbered} numbered question(s) found, ${from.practice.length} read. Check the options and Answers lines.`);
    if (!from.practice.length) throw new Error(`${path.basename(companion)}: no practice questions were read`);
    practice = from.practice;
  }
  const lessons = lessonsFromSections(sections, id);
  if (!lessons.length) throw new Error(`${path.basename(file)}: no lesson text found in this document`);

  // Warn about things that are easy to miss: a document that became one lesson, or a Knowledge
  // Check or Key Terms section that was written but not picked up.
  if (!isPdf && level === 0) warnings.push("No Heading 1 or Heading 2 found, so the whole document is one lesson. Use Heading 1 for each lesson.");
  if (level === 2) warnings.push("No Heading 1 found, so lessons are split at Heading 2.");
  const plain = stripTags(html);
  if (/knowledge check/i.test(plain) && !practice.length) warnings.push("\"Knowledge Check\" is in the text but no questions were read. Check it is a Heading 1, with numbered questions and lettered options.");
  if (/key terms?\b/i.test(plain) && !terms.length) warnings.push(isPdf
    ? "\"Key terms\" is in the PDF text, but a PDF cannot hold a Key Terms table, so there are no glossary entries. Use a Word file for the glossary."
    : "\"Key terms\" is in the text but no terms were read. Check the table has the header row Term | Definition.");

  const base = path.join(path.dirname(file), path.basename(file, path.extname(file)));
  return { id, number: index + 1, title: frontTitle || titleFromFile(file), lessons, practice, terms, warnings, text: plain, assessmentFile: `${base}-assessment.md` };
}

/* ---------- assessments ---------- */

// Port of the question format described in README "Editing assessments".
function parseAssessment(text, moduleId, label) {
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  const blocks = text.split(/^## /m).slice(1);
  const questions = [];
  blocks.forEach((block, n0) => {
    const n = n0 + 1;
    const lines = block.trim().split("\n").map((l) => l.trim());
    const qtype = lines[0].toLowerCase();
    if (!TYPES.has(qtype)) throw new Error(`${label}: question ${n}: unknown type '${qtype}'`);
    const qid = `${moduleId}-q${pad2(n)}`;
    const prompt = [], opts = [], correct = [], pairs = [], items = [], expl = [];
    let tf = null;
    for (const s of lines.slice(1)) {
      if (!s) continue;
      if (s.startsWith(">")) expl.push(s.slice(1).trim());
      else if (s.startsWith("= ")) tf = s.slice(2).trim().toLowerCase();
      else if (qtype === "match" && s.startsWith("- ") && s.includes(" = ")) {
        const [left, right] = s.slice(2).split(" = ", 2);
        pairs.push([left.trim(), right.trim()]);
      } else if (qtype === "order" && /^\d+\.\s/.test(s)) items.push(s.replace(/^\d+\.\s+/, ""));
      else if ((qtype === "single" || qtype === "multi") && (s.startsWith("- ") || s.startsWith("* "))) {
        opts.push(s.slice(2).trim());
        if (s.startsWith("* ")) correct.push(opts.length - 1);
      } else prompt.push(s);
    }
    const q = { id: qid, type: qtype, prompt: prompt.join(" "), explanation: expl.join(" ") };
    if (qtype === "single" || qtype === "multi") {
      if (opts.length < 2 || !correct.length) throw new Error(`${label}: ${qid}: needs options and at least one correct (*) option`);
      if (qtype === "single" && correct.length !== 1) throw new Error(`${label}: ${qid}: single-choice needs exactly one correct option`);
      const ids = opts.map((o, i) => hid(qid, "o", String(i), o));
      q.options = opts.map((t, i) => ({ id: ids[i], text: t }));
      q.answer = correct.map((i) => ids[i]).sort().join(",");
    } else if (qtype === "truefalse") {
      if (tf !== "true" && tf !== "false") throw new Error(`${label}: ${qid}: truefalse needs '= true' or '= false'`);
      q.options = [{ id: "true", text: "True" }, { id: "false", text: "False" }];
      q.answer = tf;
    } else if (qtype === "match") {
      if (pairs.length < 2) throw new Error(`${label}: ${qid}: match needs at least two pairs`);
      const lids = pairs.map((p) => hid(qid, "l", p[0]));
      const rids = pairs.map((p) => hid(qid, "r", p[1]));
      q.left = pairs.map((p, i) => ({ id: lids[i], text: p[0] }));
      q.right = pairs.map((p, i) => ({ id: rids[i], text: p[1] })).sort((a, b) => (a.id < b.id ? -1 : 1));
      q.answer = lids.map((l, i) => [l, rids[i]]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([l, r]) => `${l}=${r}`).join(";");
    } else if (qtype === "order") {
      if (items.length < 3) throw new Error(`${label}: ${qid}: order needs at least three items`);
      const iids = items.map((t) => hid(qid, "i", t));
      q.items = items.map((t, i) => ({ id: iids[i], text: t })).sort((a, b) => (a.id < b.id ? -1 : 1));
      q.answer = iids.join(">");
    }
    questions.push(q);
  });
  return questions;
}

function templateDraft(mod) {
  return [`# Module ${pad2(mod.number)} assessment: ${mod.title}`, "",
    "<!-- status: draft - replace this template with real questions, then DELETE this line to approve -->", "",
    "## single", "TODO: write a question about this module.", "- Wrong option", "* Correct option", "> Explanation shown after answering.", ""].join("\n");
}

/* ---------- main ---------- */

async function main() {
  const cfg = await loadConfig();
  const docs = await findDocs();
  log(`Reading ${docs.length} document(s)`);
  await mkdir(path.join(ROOT, "assets", "img"), { recursive: true });
  for (const old of (await readdir(path.join(ROOT, "assets", "img"))).filter((n) => /^m\d\d-image\d+\./.test(n))) {
    await rm(path.join(ROOT, "assets", "img", old));
  }

  const modules = [];
  for (let i = 0; i < docs.length; i++) {
    const mod = await readModule(docs[i], i);
    modules.push(mod);
    log(`  ${mod.id}  ${mod.title}  (${mod.lessons.length} lessons, ${mod.practice.length} practice questions, ${mod.terms.length} key terms)`);
    mod.warnings.forEach((w) => log(`      note: ${w}`));
  }

  log("Checking assessments");
  await mkdir(path.join(ROOT, "assessments"), { recursive: true });
  const drafts = [];
  const assessments = [];
  for (const mod of modules) {
    // Companion file next to the document (NN-Title-assessment.md) is used first. assessments/mNN.md is still read if present.
    const legacy = path.join(ROOT, "assessments", `${mod.id}.md`);
    const file = existsSync(mod.assessmentFile) ? mod.assessmentFile : existsSync(legacy) ? legacy : mod.assessmentFile;
    const label = path.relative(ROOT, file);
    let text = await readFile(file, "utf8").catch(() => null);
    if (text === null) {
      if (!TEMPLATE) throw new Error(`No assessment for ${mod.id}. Write ${label}, or run again with --template to create a blank one.`);
      text = templateDraft(mod);
      await writeFile(file, text, "utf8");
      log(`  ${mod.id}  created ${label} from a blank template (needs writing)`);
    }
    if (DRAFT_RE.test(text)) drafts.push(label);
    const questions = parseAssessment(text, mod.id, label);
    if (!questions.length) throw new Error(`${label} has no questions`);
    assessments.push({ moduleId: mod.id, questions });
  }
  if (drafts.length && !ALLOW_DRAFTS) {
    throw new Error(`Unapproved drafts: ${drafts.join(", ")}. Review each file, delete its status line, then run again. (Preview anyway with --allow-drafts.)`);
  }
  if (drafts.length) log(`  WARNING: building with unapproved drafts: ${drafts.join(", ")}`);

  const stages = cfg.stages
    ? cfg.stages.map((s) => ({ name: s.name, note: s.note || "", modules: s.modules }))
    : [{ name: "Modules", note: "", modules: modules.map((m) => m.number) }];
  const known = new Set(modules.map((m) => m.number));
  for (const s of stages) for (const n of s.modules) if (!known.has(n)) throw new Error(`course.config.json: stage '${s.name}' refers to module ${n}, which does not exist`);

  log("Writing content");
  const contentDir = path.join(ROOT, "content");
  await rm(path.join(contentDir, "modules"), { recursive: true, force: true });
  await mkdir(path.join(contentDir, "modules"), { recursive: true });
  const header = "/* Generated by scripts/build-course.mjs - edit course-docs/ and assessments/ instead. */";

  // Key terms from every module, merged by term. Each entry lists the modules that define it.
  const glossaryMap = new Map();
  for (const m of modules) {
    for (const t of m.terms) {
      const key = t.term.toLowerCase();
      if (!glossaryMap.has(key)) glossaryMap.set(key, { term: t.term, definition: t.definition, modules: [] });
      const entry = glossaryMap.get(key);
      if (!entry.modules.includes(m.number)) entry.modules.push(m.number);
    }
  }
  const glossary = [...glossaryMap.values()].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));

  const catalog = modules.map((m) => ({
    id: m.id, number: m.number, title: m.title, subtitle: "", version: cfg.contentVersion,
    objectives: [], lessons: m.lessons.map((l) => ({ id: l.id, title: l.title })), practiceCount: m.practice.length,
  }));
  await writeFile(path.join(contentDir, "catalog.js"),
    `${header}\nCourse.catalog = ${JSON.stringify(catalog, null, 1)};\n`);

  for (const m of modules) {
    const obj = { id: m.id, number: m.number, title: m.title, subtitle: "", version: cfg.contentVersion,
      objectives: [], lessons: m.lessons, practice: m.practice };
    await writeFile(path.join(contentDir, "modules", `${m.id}.js`), `${header}\nCourse.registerModule(${JSON.stringify(obj)});\n`);
  }

  await writeFile(path.join(contentDir, "glossary.js"), `${header}\nCourse.glossary = ${JSON.stringify(glossary, null, 1)};\n`);
  await writeFile(path.join(contentDir, "assessments.js"),
    `${header}\nCourse.assessments = ${JSON.stringify(assessments)};\n`);

  const course = {
    programmeTitle: cfg.title, programmeSubtitle: cfg.subtitle, organisation: cfg.organisation,
    passMark: cfg.passMark, requireAllLessonsRead: cfg.requireAllLessonsRead, revealAnswersOnFail: cfg.revealAnswersOnFail,
    certificatePrefix: cfg.certificatePrefix, contentVersion: cfg.contentVersion,
    totalModules: modules.length, stages, modulesPerStage: stages.map((s) => s.modules.length),
    resources: cfg.resources,
  };
  await writeFile(path.join(contentDir, "course-config.js"),
    `${header}\nwindow.CourseSettings = ${JSON.stringify(course, null, 2)};\n`);

  const questions = assessments.reduce((n, a) => n + a.questions.length, 0);
  log(`Done: ${modules.length} modules, ${questions} assessment questions. Open index.html to check it.`);
}

// Run as a script, not when imported by the tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`Build failed: ${e.message}`);
    process.exit(1);
  });
}

export { titleFromFile, headingLevel, splitSections, splitLessons, parseKnowledgeCheck, extractKeyTerms, htmlToLines, parseAssessment, templateDraft, stripTags, slug };
