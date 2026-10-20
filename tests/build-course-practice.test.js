// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeCourse, runBuild, readModuleData } from './helpers/build.mjs';

describe('practice files (NN-Title-practice.md)', () => {
  const roots = [];
  const withPractice = () => {
    const root = makeCourse(['11-Format-check.md', '11-Format-check-practice.md', '11-Format-check-assessment.md'], { assessments: false });
    roots.push(root);
    return root;
  };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('reads practice questions in the assessment layout, converted to lettered options', () => {
    const root = withPractice();
    expect(runBuild(root).status).toBe(0);
    const { practice } = readModuleData(root);
    expect(practice).toHaveLength(2);
    const [single, multi] = practice;
    expect(single.options.map((o) => o.id)).toEqual(['A', 'B']);
    expect(single.answer).toEqual(['B']);
    expect(single.rationale).toBe('Because B.');
    expect(multi.multi).toBe(true);
    expect(multi.answer).toEqual(['A', 'B']);
  });

  it('says when match questions are skipped from practice', () => {
    const res = runBuild(withPractice());
    expect(res.stdout + res.stderr).toMatch(/1 match\/order question\(s\) skipped/);
  });

  it('rejects a practice file in the old numbered layout, and says which layout to use', () => {
    const knowledgeCheck = [
      '1. Which signal do GNSS receivers use? [Select one]',
      'A. Sound',
      'B. Radio',
      '',
      'Answers',
      '1. B: Radio signals come from satellites.',
    ].join('\n');
    const root = makeCourse(['01-Example-module.docx'], { extra: { '01-Example-module-practice.md': knowledgeCheck } });
    roots.push(root);
    const res = runBuild(root);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/01-Example-module-practice\.md: no practice questions were read\. Practice files use the layout ## single/);
  });

  it('has no practice questions when there is no practice file', () => {
    const root = makeCourse(['01-Example-module.docx']);
    roots.push(root);
    expect(runBuild(root).status).toBe(0);
    expect(readModuleData(root).practice).toEqual([]);
    expect(readFileSync(path.join(root, 'content', 'catalog.js'), 'utf8')).toContain('"practiceCount": 0');
  });
});
