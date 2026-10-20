// Markdown (.md) documents. Each "# " heading is a lesson, the same as Heading 1 in Word.
import { readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { ROOT, esc } from "./common.mjs";

export async function readMarkdown(file, id) {
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

  const html = marked.parse(src, { gfm: true });

  // Local images are copied to assets/img/ and keep their alt text.
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
