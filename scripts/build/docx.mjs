// Word (.docx) documents: HTML, with images saved to assets/img/.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { ROOT } from "./common.mjs";

export async function readDocx(file, id) {
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
  return { html: value, warnings, title: null };
}
