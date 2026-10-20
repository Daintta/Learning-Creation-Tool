// Splits a document's HTML into lessons, and pulls out Key Terms tables.
import { slug, stripTags } from "./common.mjs";

// Heading level used to split lessons: 1 if the document has Heading 1s, otherwise 2 if it has
// Heading 2s, otherwise 0 (the whole document is one lesson).
export function headingLevel(html) {
  if (/<h1[\s>]/i.test(html)) return 1;
  if (/<h2[\s>]/i.test(html)) return 2;
  return 0;
}

// Each heading at the chosen level starts a section. Text before the first heading goes into the first section.
export function splitSections(html, level = headingLevel(html)) {
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
export function lessonsFromSections(sections, moduleId) {
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

export function splitLessons(html, moduleId) {
  return lessonsFromSections(splitSections(html), moduleId);
}

// Pulls Key Terms tables (header row "Term" | "Definition") out of the HTML.
export function extractKeyTerms(html) {
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
