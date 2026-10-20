// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleFromFile } from '../scripts/build-course.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('titleFromFile', () => {
  it('removes the Markdown extension and the number prefix', () => {
    expect(titleFromFile('/docs/01-Risk-Management.md')).toBe('Risk Management');
    expect(titleFromFile('/docs/02-Intro-practice.md')).toBe('Intro practice');
  });
});

describe('Markdown format: front matter, callouts, practice and assessment layouts', () => {
  let root;
  let data;
  let stdout;
  let stderr;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-format-'));
    mkdirSync(path.join(root, 'course-docs'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    for (const f of ['11-Format-check.md', '11-Format-check-practice.md', '11-Format-check-assessment.md']) {
      copyFileSync(path.join(REPO, 'tests', 'fixtures', f), path.join(root, 'course-docs', f));
    }
    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
    stdout = res.stdout;
    stderr = res.stderr;
    expect(res.status).toBe(0);
    const mod = readFileSync(path.join(root, 'content', 'modules', 'm01.js'), 'utf8');
    data = JSON.parse(mod.slice(mod.indexOf('{'), mod.lastIndexOf('}') + 1));
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('takes the module title from the front matter', () => {
    expect(data.title).toBe('Format check module');
  });

  it('does not show the front matter as lesson text', () => {
    const text = data.lessons.map((l) => l.html).join(' ');
    expect(text).not.toMatch(/category:|version:|title: Format/);
    expect(data.lessons.map((l) => l.title)).toEqual(['First lesson', 'Second lesson']);
  });

  it('turns each callout kind into a styled box, with or without a title', () => {
    const html = data.lessons[0].html;
    expect(html).toContain('callout-principle');
    expect(html).toContain('callout-note');
    expect(html).toContain('callout-update');
    expect(html).toContain('Key idea');
    expect(html).toContain('Newer edition');
    expect(data.lessons.some((l) => l.html.includes(':::'))).toBe(false);
  });

  it('reads practice questions from the assessment layout and converts them to lettered options', () => {
    expect(data.practice).toHaveLength(2);
    const [single, multi] = data.practice;
    expect(single.options.map((o) => o.id)).toEqual(['A', 'B']);
    expect(single.answer).toEqual(['B']);
    expect(single.rationale).toBe('Because B.');
    expect(multi.multi).toBe(true);
    expect(multi.answer).toEqual(['A', 'B']);
  });

  it('says when match questions are skipped from practice', () => {
    expect(stdout + stderr).toMatch(/1 match\/order question\(s\) skipped/);
  });

  it('uses the companion assessment next to the document', () => {
    const assessmentsJs = readFileSync(path.join(root, 'content', 'assessments.js'), 'utf8');
    const all = JSON.parse(assessmentsJs.slice(assessmentsJs.indexOf('['), assessmentsJs.lastIndexOf(']') + 1));
    expect(all[0].questions).toHaveLength(1);
    expect(all[0].questions[0].prompt).toBe('Is this a companion assessment?');
  });

  it('builds the Key Terms table into the glossary', () => {
    const glossary = readFileSync(path.join(root, 'content', 'glossary.js'), 'utf8');
    expect(glossary).toContain('"term": "Alpha"');
  });
});
