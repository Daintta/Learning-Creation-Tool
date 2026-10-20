// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { makeCourse, runBuild, readModuleData, readGlossary, fileExists } from './helpers/build.mjs';

describe('Word documents: lessons and headings', () => {
  const roots = [];
  const course = (docs, options) => { const root = makeCourse(docs, options); roots.push(root); return root; };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('makes one lesson, with a warning, when there are no headings', () => {
    const res = runBuild(course(['03-No-headings.docx']));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/m01 .*\(1 lessons/);
    expect(res.stdout).toMatch(/No Heading 1 or Heading 2 found, so the whole document is one lesson/);
  });

  it('splits at Heading 2, with a note, when there is no Heading 1', () => {
    const res = runBuild(course(['04-Heading-2-only.docx']));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/m01 .*\(2 lessons/);
    expect(res.stdout).toMatch(/No Heading 1 found, so lessons are split at Heading 2/);
  });

  it('ignores a Knowledge Check section in a Word file, warns, and still reads the Key terms table', () => {
    const root = course(['02-Knowledge-check.docx']);
    const res = runBuild(root);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/"Knowledge Check".*in 02-Knowledge-check\.docx is not read/);
    const data = readModuleData(root);
    expect(data.lessons.map((l) => l.title)).not.toContain('Knowledge Check');
    expect(data.practice).toHaveLength(0);
    expect(readGlossary(root).map((g) => g.term)).toEqual(['GNSS', 'Sensor']);
  });
});

describe('images', () => {
  const roots = [];
  const course = (docs, options) => { const root = makeCourse(docs, options); roots.push(root); return root; };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('keeps the alt text from a Word file and saves the image', () => {
    const root = course(['06-Image-alt.docx']);
    expect(runBuild(root).status).toBe(0);
    const data = readModuleData(root);
    expect(data.lessons[0].html).toContain('Diagram of a GNSS signal path from satellite to receiver');
    expect(fileExists(root, 'assets', 'img', 'm01-image1.png')).toBe(true);
  });

  it('warns about a Word image with no alt text', () => {
    const res = runBuild(course(['07-Image-no-alt.docx']));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/1 image\(s\) have no alt text \(image 1\)/);
  });
});

describe('Markdown documents', () => {
  const roots = [];
  const course = (docs, options) => { const root = makeCourse(docs, options); roots.push(root); return root; };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('reads lessons, Key terms, and copies local images with alt text', () => {
    const root = course(['08-Markdown-course.md']);
    const res = runBuild(root);
    expect(res.status).toBe(0);
    const data = readModuleData(root);
    expect(data.lessons.map((l) => l.title)).toEqual(['Welcome', 'Core ideas']);
    expect(data.lessons[0].html).toContain('alt="Signal chart"');
    expect(data.lessons[0].html).toContain('assets/img/m01-image1.png');
    expect(fileExists(root, 'assets', 'img', 'm01-image1.png')).toBe(true);
    expect(readGlossary(root).find((g) => g.term === 'GNSS').modules).toEqual([1]);
    expect(res.stdout).toMatch(/"Knowledge Check".*in 08-Markdown-course\.md is not read/);
  });

  it('warns about a Markdown image with no alt text', () => {
    const res = runBuild(course(['09-Markdown-no-alt.md']));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/1 image\(s\) have no alt text \(image 1\)/);
  });

  it('takes the module title from the front matter, hides it from the lessons, and renders callouts', () => {
    const root = course(['11-Format-check.md', '11-Format-check-assessment.md'], { assessments: false });
    expect(runBuild(root).status).toBe(0);
    const data = readModuleData(root);
    expect(data.title).toBe('Format check module');
    const text = data.lessons.map((l) => l.html).join(' ');
    expect(text).not.toMatch(/category:|version:|title: Format/);
    expect(data.lessons.map((l) => l.title)).toEqual(['First lesson', 'Second lesson']);
    expect(data.lessons[0].html).toContain('callout-principle');
    expect(data.lessons[0].html).toContain('callout-note');
    expect(data.lessons[0].html).toContain('callout-update');
    expect(data.lessons.some((l) => l.html.includes(':::'))).toBe(false);
  });
});

describe('course-docs folder contents', () => {
  const roots = [];
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('skips PDF files with a note, and builds the Word and Markdown files', () => {
    const root = makeCourse(['01-Example-module.docx'], { extra: { '02-Old-scan.pdf': 'not a real pdf' } });
    roots.push(root);
    const res = runBuild(root);
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toMatch(/02-Old-scan\.pdf skipped\. PDF files are not supported/);
    expect(res.stdout).toMatch(/Reading 1 document\(s\)/);
    expect(existsSync(path.join(root, 'content', 'modules', 'm02.js'))).toBe(false);
  });

  it('keeps a stale image from an earlier build out of the output', () => {
    const root = makeCourse(['01-Example-module.docx']);
    roots.push(root);
    mkdirSync(path.join(root, 'assets', 'img'), { recursive: true });
    writeFileSync(path.join(root, 'assets', 'img', 'm09-image1.png'), 'old');
    runBuild(root);
    expect(existsSync(path.join(root, 'assets', 'img', 'm09-image1.png'))).toBe(false);
  });
});
