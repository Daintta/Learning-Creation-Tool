// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('Markdown course documents', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'course-docs', '01-Example-module-assessment.md'), 'utf8');
  const build = (...docs) => {
    rmSync(path.join(root, 'course-docs'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'course-docs'));
    for (const d of [...docs, 'chart.png']) copyFileSync(path.join(REPO, 'tests', 'fixtures', d), path.join(root, 'course-docs', d));
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
  };
  const moduleData = (n = 'm01') => {
    const mod = readFileSync(path.join(root, 'content', 'modules', `${n}.js`), 'utf8');
    return { raw: mod, data: JSON.parse(mod.slice(mod.indexOf('{'), mod.lastIndexOf('}') + 1)) };
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-markdown-'));
    mkdirSync(path.join(root, 'assessments'));
    mkdirSync(path.join(root, 'assets', 'img'), { recursive: true });
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
    writeFileSync(path.join(root, 'assessments', 'm02.md'), approved.replace('Module 01', 'Module 02'));
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reads lessons, practice questions and key terms from a Markdown file', () => {
    const res = build('08-Markdown-course.md');
    expect(res.status).toBe(0);
    const { data } = moduleData();
    expect(data.lessons.map((l) => l.title)).toEqual(['Welcome', 'Core ideas']);
    expect(data.practice).toHaveLength(2);
    expect(data.practice[0].answer).toEqual(['B']);
    expect(data.practice[1].multi).toBe(true);
    expect(data.practice[1].answer).toEqual(['A', 'B']);
    const glossary = readFileSync(path.join(root, 'content', 'glossary.js'), 'utf8');
    expect(glossary).toContain('"term": "GNSS"');
    expect(res.stdout).toMatch(/m01 .*2 practice questions, 2 key terms/);
  });

  it('copies a local image next to the lessons and keeps its alt text', () => {
    const { raw, data } = moduleData();
    expect(raw).toContain('assets/img/m01-image1.png');
    expect(data.lessons[0].html).toContain('alt="Signal chart"');
    expect(existsSync(path.join(root, 'assets', 'img', 'm01-image1.png'))).toBe(true);
  });

  it('warns about a Markdown image with no alt text', () => {
    const res = build('09-Markdown-no-alt.md');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/1 image\(s\) have no alt text \(image 1\)/);
  });

  it('ignores a README.md in course-docs', () => {
    rmSync(path.join(root, 'course-docs'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'course-docs'));
    writeFileSync(path.join(root, 'course-docs', 'README.md'), '# Notes for authors\n');
    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/No \.docx, \.pdf or \.md files/);
  });
});
