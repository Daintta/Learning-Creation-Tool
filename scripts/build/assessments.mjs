// Assessment files: the question format described in README "Editing assessments".
import { hid, pad2, TYPES } from "./common.mjs";

export const DRAFT_RE = /^<!--\s*status:\s*draft/m;

// Parses one assessment file into questions. Errors name the file and the question.
export function parseAssessment(text, moduleId, label) {
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

// The blank file that --template writes. It carries the draft line, so the build will not publish it.
export function templateDraft(mod) {
  return [`# Module ${pad2(mod.number)} assessment: ${mod.title}`, "",
    "<!-- status: draft - replace this template with real questions, then DELETE this line to approve -->", "",
    "## single", "TODO: write a question about this module.", "- Wrong option", "* Correct option", "> Explanation shown after answering.", ""].join("\n");
}
