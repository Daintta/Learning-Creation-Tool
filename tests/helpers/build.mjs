// Helpers for the build tests: a temporary course folder, the build command, and reading its output.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');
const FIXTURES = path.join(REPO, 'tests', 'fixtures');

// A small approved assessment with one question, used as the companion file for each document.
export const APPROVED = [
  '# Assessment',
  '',
  '## single',
  'Which is correct?',
  '- No',
  '* Yes',
  '> Because yes.',
  '',
].join('\n');

// Creates a course folder in a temp directory. `docs` are fixture names copied into course-docs/.
// Each document gets an approved companion assessment unless `assessments` is false.
export function makeCourse(docs = [], { assessments = true, extra = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'course-test-'));
  mkdirSync(path.join(root, 'course-docs'));
  copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
  for (const doc of docs) {
    copyFileSync(path.join(FIXTURES, doc), path.join(root, 'course-docs', doc));
    if (assessments) {
      const base = doc.replace(/\.(docx|md)$/i, '');
      writeFileSync(path.join(root, 'course-docs', `${base}-assessment.md`), APPROVED);
    }
  }
  if (docs.some((d) => d.endsWith('.md'))) copyFileSync(path.join(FIXTURES, 'chart.png'), path.join(root, 'course-docs', 'chart.png'));
  for (const [name, content] of Object.entries(extra)) writeFileSync(path.join(root, 'course-docs', name), content);
  return root;
}

export function runBuild(root, ...flags) {
  return spawnSync(process.execPath, [SCRIPT, ...flags], {
    cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
  });
}

// The output of the build: the module's data (title, lessons, practice) as an object.
export function readModuleData(root, id = 'm01') {
  const mod = readFileSync(path.join(root, 'content', 'modules', `${id}.js`), 'utf8');
  return JSON.parse(mod.slice(mod.indexOf('{'), mod.lastIndexOf('}') + 1));
}

export function readAssessments(root) {
  const js = readFileSync(path.join(root, 'content', 'assessments.js'), 'utf8');
  return JSON.parse(js.slice(js.indexOf('['), js.lastIndexOf(']') + 1));
}

export function readGlossary(root) {
  const js = readFileSync(path.join(root, 'content', 'glossary.js'), 'utf8');
  return JSON.parse(js.slice(js.indexOf('['), js.lastIndexOf(']') + 1));
}

export function fileExists(...parts) {
  return existsSync(path.join(...parts));
}
