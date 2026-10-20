// Shared paths and small helpers for the course build.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// The course folder. Tests point this at a temporary copy with COURSE_ROOT.
export const ROOT = process.env.COURSE_ROOT
  ? path.resolve(process.env.COURSE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TYPES = new Set(["single", "multi", "truefalse", "match", "order"]);

export const pad2 = (n) => String(n).padStart(2, "0");
export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const unesc = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export const stripTags = (html) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
export const hid = (...parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 6);
export const log = (msg) => console.log(msg);
export const warn = (msg) => console.warn(msg);
