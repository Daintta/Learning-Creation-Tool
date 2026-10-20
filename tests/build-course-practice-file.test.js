// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('companion practice files', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'course-docs', '01-Example-module-assessment.md'), 'utf8');
  const build = (...files) => {
    rmSync(path.join(root, 'course-docs'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'course-docs'));
    for (const f of files) copyFileSync(path.join(REPO, 'tests', 'fixtures', f), path.join(root, 'course-docs', f));
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
  };
  const data = () => {
    const mod = readFileSync(path.join(root, 'content', 'modules', 'm01.js'), 'utf8');
    return JSON.parse(mod.slice(mod.indexOf('{'), mod.lastIndexOf('}') + 1));
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-practice-file-'));
    mkdirSync(path.join(root, 'assessments'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reads practice questions from the companion file and does not treat it as a document', () => {
    const res = build('10-Lessons-only.md', '10-Lessons-only-practice.md');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/Reading 1 document\(s\)/);
    const d = data();
    expect(d.lessons.map((l) => l.title)).toEqual(['Introduction', 'Signals']);
    expect(d.practice).toHaveLength(2);
    expect(d.practice[0].answer).toEqual(['B']);
    expect(d.practice[1].answer).toEqual(['A', 'B']);
    expect(d.practice[1].multi).toBe(true);
  });

  it('uses the companion assessment file next to the document, ahead of assessments/mNN.md', () => {
    const res = build('10-Lessons-only.md', '10-Lessons-only-practice.md', '10-Lessons-only-assessment.md');
    expect(res.status).toBe(0);
    const assessmentsJs = readFileSync(path.join(root, 'content', 'assessments.js'), 'utf8');
    const data = JSON.parse(assessmentsJs.slice(assessmentsJs.indexOf('['), assessmentsJs.lastIndexOf(']') + 1));
    expect(data[0].questions).toHaveLength(1);
    expect(data[0].questions[0].prompt).toBe('Which statement about the lesson is true?');
  });

  it('creates the companion assessment with --template when there is none', () => {
    const legacy = path.join(root, 'assessments', 'm01.md');
    rmSync(legacy, { force: true });
    const res = build('10-Lessons-only.md', '10-Lessons-only-practice.md');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Write course-docs\/10-Lessons-only-assessment\.md/);
    const again = spawnSync(process.execPath, [SCRIPT, '--template'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
    expect(again.status).not.toBe(0);
    expect(again.stderr).toMatch(/Unapproved drafts: course-docs\/10-Lessons-only-assessment\.md/);
    expect(readFileSync(path.join(root, 'course-docs', '10-Lessons-only-assessment.md'), 'utf8')).toMatch(/status:\s*draft/);
    writeFileSync(legacy, approved);
  });

  it('warns when a document has its own Knowledge Check and a companion file is also present', () => {
    const res = build('08-Markdown-course.md');
    expect(res.status).toBe(0);
    writeFileSync(path.join(root, 'course-docs', '08-Markdown-course-practice.md'), readFileSync(path.join(REPO, 'tests', 'fixtures', '10-Lessons-only-practice.md'), 'utf8'));
    const again = spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/"Knowledge Check" in the document is ignored because 08-Markdown-course-practice\.md is present/);
    expect(data().practice).toHaveLength(2);
  });
});
