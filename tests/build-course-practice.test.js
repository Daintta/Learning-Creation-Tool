// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSections, parseKnowledgeCheck, extractKeyTerms, htmlToLines } from '../scripts/build-course.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('parseKnowledgeCheck', () => {
  const LINES = [
    '1. Which signal do GNSS receivers use? [Select one]', 'A. Sound', 'B. Radio',
    '2. Select all that apply. Which are sensors?', 'A. Accelerometer', 'B. Thermometer', 'C. Keyboard',
    'Answers', '1. B: Radio signals come from satellites.', '2. A and B: Both are sensors.',
  ];

  it('parses numbered questions, options, answers and rationale', () => {
    const qs = parseKnowledgeCheck(LINES);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toEqual({
      n: 1, prompt: 'Which signal do GNSS receivers use?', multi: false,
      options: [{ id: 'A', text: 'Sound' }, { id: 'B', text: 'Radio' }], answer: ['B'], rationale: 'Radio signals come from satellites.',
    });
    expect(qs[1].multi).toBe(true);
    expect(qs[1].answer).toEqual(['A', 'B']);
    expect(qs[1].prompt).toBe('Which are sensors?');
  });

  it('reads answers from a table row as well', () => {
    const qs = parseKnowledgeCheck(['1. Pick one', 'A. x', 'B. y', 'Answers', '| 1 | A | Because x. |']);
    expect(qs[0].answer).toEqual(['A']);
    expect(qs[0].rationale).toBe('Because x.');
  });

  it('drops questions with no answer, and rejects an answer that matches no option', () => {
    expect(parseKnowledgeCheck(['1. No answer', 'A. x', 'B. y'])).toEqual([]);
    expect(() => parseKnowledgeCheck(['1. Q', 'A. x', 'B. y', 'Answers', '1. C: wrong letter']))
      .toThrow(/question 1: answer C/);
  });
});

describe('extractKeyTerms and htmlToLines', () => {
  it('pulls Key Terms tables out of the HTML and returns the rest', () => {
    const html = '<h1>Key terms</h1><table><tr><td><p>Term</p></td><td><p>Definition</p></td></tr>'
      + '<tr><td><p>GNSS</p></td><td><p>Satellite navigation</p></td></tr></table><p>after</p>';
    const { terms, html: kept } = extractKeyTerms(html);
    expect(terms).toEqual([{ term: 'GNSS', definition: 'Satellite navigation' }]);
    expect(kept).not.toContain('<table');
    expect(kept).toContain('after');
  });

  it('leaves tables that are not Key Terms alone', () => {
    const html = '<table><tr><td>Name</td><td>Value</td></tr></table>';
    expect(extractKeyTerms(html).terms).toEqual([]);
    expect(extractKeyTerms(html).html).toBe(html);
  });

  it('turns table cells into pipe-separated lines', () => {
    expect(htmlToLines('<table><tr><td>1</td><td>B</td></tr></table>')).toEqual(['| 1 | B |']);
  });

  it('splitSections keeps text before the first heading with the first section', () => {
    const sections = splitSections('<p>lead</p><h1>One</h1><p>a</p>');
    expect(sections.map((x) => x.title)).toEqual(['One']);
    expect(sections[0].html).toContain('lead');
  });
});

describe('npm run build-course with practice and glossary', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'course-docs', '01-Example-module-assessment.md'), 'utf8');
  const run = () => spawnSync(process.execPath, [SCRIPT], {
    cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
  });

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-practice-'));
    mkdirSync(path.join(root, 'course-docs'));
    mkdirSync(path.join(root, 'assessments'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    copyFileSync(path.join(REPO, 'tests', 'fixtures', '01-Example-module.docx'), path.join(root, 'course-docs', '01-Example-module.docx'));
    copyFileSync(path.join(REPO, 'tests', 'fixtures', '02-Knowledge-check.docx'), path.join(root, 'course-docs', '02-Knowledge-check.docx'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
    writeFileSync(path.join(root, 'assessments', 'm02.md'), approved.replace('Module 01', 'Module 02'));
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('writes practice questions, keeps the Knowledge Check out of the lessons, and merges the glossary', () => {
    const res = run();
    expect(res.status).toBe(0);
    const m2 = readFileSync(path.join(root, 'content', 'modules', 'm02.js'), 'utf8');
    const json = JSON.parse(m2.slice(m2.indexOf('{'), m2.lastIndexOf('}') + 1));
    expect(json.practice).toHaveLength(2);
    expect(json.practice[1].multi).toBe(true);
    expect(json.lessons.map((l) => l.title)).toEqual(['Welcome', 'Core ideas']);
    const glossary = readFileSync(path.join(root, 'content', 'glossary.js'), 'utf8');
    expect(glossary).toContain('"term": "GNSS"');
    expect(glossary).toMatch(/"modules": \[\s*2\s*\]/);
    expect(res.stdout).toMatch(/m02 .*2 practice questions, 2 key terms/);
  });
});
