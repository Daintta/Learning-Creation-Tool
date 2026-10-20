// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headingLevel, splitSections } from '../scripts/build-course.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('headingLevel and splitSections', () => {
  it('uses Heading 1 when there is one', () => {
    expect(headingLevel('<h1>A</h1><h2>x</h2>')).toBe(1);
  });
  it('falls back to Heading 2 when there is no Heading 1', () => {
    expect(headingLevel('<p>intro</p><h2>A</h2>')).toBe(2);
    const sections = splitSections('<p>lead</p><h2>A</h2><p>a</p><h2>B</h2><p>b</p>');
    expect(sections.map((s) => s.title)).toEqual(['A', 'B']);
    expect(sections[0].html).toContain('lead');
  });
  it('makes one section when there are no headings', () => {
    expect(headingLevel('<p>plain</p>')).toBe(0);
    expect(splitSections('<p>plain</p>')).toEqual([{ title: 'Content', html: '<p>plain</p>' }]);
  });
});

describe('build warnings for documents that split badly', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'course-docs', '01-Example-module-assessment.md'), 'utf8');
  const build = (docs) => {
    rmSync(path.join(root, 'course-docs'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'course-docs'));
    for (const d of docs) copyFileSync(path.join(REPO, 'tests', 'fixtures', d), path.join(root, 'course-docs', d));
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-headings-'));
    mkdirSync(path.join(root, 'assessments'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('warns when a Word file has no headings and becomes one lesson', () => {
    const res = build(['03-No-headings.docx']);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/m01 .*\(1 lessons/);
    expect(res.stdout).toMatch(/No Heading 1 or Heading 2 found, so the whole document is one lesson/);
  });

  it('splits at Heading 2 with a note when there is no Heading 1', () => {
    const res = build(['04-Heading-2-only.docx']);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/m01 .*\(2 lessons/);
    expect(res.stdout).toMatch(/No Heading 1 found, so lessons are split at Heading 2/);
  });
});

describe('PDF heading detection', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'course-docs', '01-Example-module-assessment.md'), 'utf8');

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-pdf-'));
    mkdirSync(path.join(root, 'course-docs'));
    mkdirSync(path.join(root, 'assessments'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    copyFileSync(path.join(REPO, 'tests', 'fixtures', '05-Headings.pdf'), path.join(root, 'course-docs', '05-Headings.pdf'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('splits a PDF into lessons at its larger headings and drops the repeated footer', () => {
    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/PDF headings found from font size: "Introduction" \(H1\), "Second part" \(H1\), "Third part" \(H1\)/);
    const mod = readFileSync(path.join(root, 'content', 'modules', 'm01.js'), 'utf8');
    const data = JSON.parse(mod.slice(mod.indexOf('{'), mod.lastIndexOf('}') + 1));
    expect(data.lessons.map((l) => l.title)).toEqual(['Introduction', 'Second part', 'Third part']);
    expect(mod).toContain('Positioning tells you where something is');
    expect(mod).not.toContain('Course footer text');
  });
});
