// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { titleFromFile, headingLevel, splitSections, parseAssessment, templateDraft, stripTags, slug } from '../scripts/build-course.mjs';
import { makeCourse, runBuild, readModuleData, readAssessments, fileExists } from './helpers/build.mjs';

describe('titleFromFile', () => {
  it('removes the number prefix and the extension, and tidies separators', () => {
    expect(titleFromFile('/docs/02-Core_concepts-now.docx')).toBe('Core concepts now');
    expect(titleFromFile('/docs/01-Risk-Management.md')).toBe('Risk Management');
  });
  it('falls back when nothing is left', () => {
    expect(titleFromFile('01-.docx')).toBe('Untitled module');
  });
});

describe('stripTags and slug', () => {
  it('removes markup and decodes common entities', () => {
    expect(stripTags('<p>Tom &amp; Jerry&nbsp;&lt;3</p>')).toBe('Tom & Jerry <3');
  });
  it('makes URL-safe slugs', () => {
    expect(slug('Welcome, to GNSS!')).toBe('welcome-to-gnss');
    expect(slug('!!!')).toBe('section');
  });
});

describe('heading levels', () => {
  it('uses Heading 1 when there is one, otherwise Heading 2, otherwise the whole document', () => {
    expect(headingLevel('<h1>A</h1><h2>x</h2>')).toBe(1);
    expect(headingLevel('<p>intro</p><h2>A</h2>')).toBe(2);
    expect(headingLevel('<p>plain</p>')).toBe(0);
  });
  it('splits at Heading 2 and keeps text before the first heading with the first section', () => {
    const sections = splitSections('<p>lead</p><h2>A</h2><p>a</p><h2>B</h2><p>b</p>');
    expect(sections.map((s) => s.title)).toEqual(['A', 'B']);
    expect(sections[0].html).toContain('lead');
  });
  it('makes one section when there are no headings', () => {
    expect(splitSections('<p>plain</p>')).toEqual([{ title: 'Content', html: '<p>plain</p>' }]);
  });
});

const SAMPLE = `# Module 01 assessment: Sample

<!-- a comment that must be ignored -->

## single
Which is correct?
- Wrong
* Right
- Also wrong
> Because right.

## multi
Pick all that apply.
* One
* Two
- Three

## truefalse
A statement.
= false

## match
Match them.
- Dog = Bark
- Cat = Meow

## order
Put in order.
1. First
2. Second
3. Third
`;

describe('parseAssessment', () => {
  const qs = parseAssessment(SAMPLE, 'm01', 'sample.md');

  it('parses every question type with sequential ids', () => {
    expect(qs.map((q) => q.type)).toEqual(['single', 'multi', 'truefalse', 'match', 'order']);
    expect(qs.map((q) => q.id)).toEqual(['m01-q01', 'm01-q02', 'm01-q03', 'm01-q04', 'm01-q05']);
  });

  it('keeps the correct answer and explanation for single choice', () => {
    const [single] = qs;
    expect(single.answer).toBe(single.options.find((o) => o.text === 'Right').id);
    expect(single.explanation).toBe('Because right.');
    expect(single.prompt).toBe('Which is correct?');
  });

  it('stores every correct option, sorted, for multi-select', () => {
    const [, multi] = qs;
    const ids = multi.options.filter((o) => ['One', 'Two'].includes(o.text)).map((o) => o.id).sort();
    expect(multi.answer).toBe(ids.join(','));
  });

  it('reads truefalse answers', () => {
    expect(qs[2].answer).toBe('false');
  });

  it('pairs match items and keeps order items in their correct sequence', () => {
    const [, , , match, order] = qs;
    expect(match.left).toHaveLength(2);
    expect(match.answer.split(';')).toHaveLength(2);
    expect(order.answer.split('>')[0]).toBe(order.items.find((i) => i.text === 'First').id);
  });

  it('gives stable ids on repeated parses', () => {
    expect(parseAssessment(SAMPLE, 'm01', 'sample.md')).toEqual(qs);
  });

  it('rejects malformed questions with a message that names the file', () => {
    expect(() => parseAssessment('## bogus\nX\n- a\n* b', 'm01', 'bad.md')).toThrow(/bad\.md.*unknown type 'bogus'/);
    expect(() => parseAssessment('## single\nX\n* a\n* b', 'm01', 'bad.md')).toThrow(/exactly one correct/);
    expect(() => parseAssessment('## truefalse\nX', 'm01', 'bad.md')).toThrow(/needs '= true' or '= false'/);
    expect(() => parseAssessment('## order\nX\n1. a\n2. b', 'm01', 'bad.md')).toThrow(/at least three items/);
  });
});

describe('templateDraft', () => {
  it('is marked as a draft and parses', () => {
    const md = templateDraft({ id: 'm01', number: 1, title: 'Sample' });
    expect(md).toMatch(/status:\s*draft/);
    expect(parseAssessment(md, 'm01', 'template.md')).toHaveLength(1);
  });
});

describe('npm run build-course (command line)', () => {
  const roots = [];
  const course = (docs, options) => { const root = makeCourse(docs, options); roots.push(root); return root; };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('stops when a module has no assessment, and names the file to write', () => {
    const res = runBuild(course(['01-Example-module.docx'], { assessments: false }));
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/No assessment for m01\. Write course-docs\/01-Example-module-assessment\.md/);
  });

  it('creates the companion assessment with --template and refuses to publish it', () => {
    const root = course(['01-Example-module.docx'], { assessments: false });
    const res = runBuild(root, '--template');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Unapproved drafts: course-docs\/01-Example-module-assessment\.md/);
    expect(readFileSync(path.join(root, 'course-docs', '01-Example-module-assessment.md'), 'utf8')).toMatch(/status:\s*draft/);
    expect(fileExists(root, 'content', 'catalog.js')).toBe(false);
  });

  it('publishes once the draft line is removed', () => {
    const root = course(['01-Example-module.docx']);
    const file = path.join(root, 'course-docs', '01-Example-module-assessment.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^<!--\s*status:\s*draft.*\n/m, ''));
    expect(runBuild(root).status).toBe(0);
    expect(readModuleData(root).title).toBe('Example module');
    expect(readFileSync(path.join(root, 'content', 'course-config.js'), 'utf8')).toContain('window.CourseSettings');
  });

  it('builds with drafts only when --allow-drafts is given, and warns', () => {
    const root = course(['01-Example-module.docx'], { assessments: false });
    writeFileSync(path.join(root, 'course-docs', '01-Example-module-assessment.md'), '# t\n<!-- status: draft -->\n## single\nQ\n- a\n* b\n');
    const res = runBuild(root, '--allow-drafts');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/WARNING: building with unapproved drafts/);
  });

  it('uses the companion assessment file next to the document', () => {
    const root = course(['11-Format-check.md', '11-Format-check-assessment.md'], { assessments: false });
    expect(runBuild(root).status).toBe(0);
    expect(readAssessments(root)[0].questions[0].prompt).toBe('Is this a companion assessment?');
  });

  it('ignores a README.md in course-docs, and fails when nothing else is there', () => {
    expect(runBuild(course(['01-Example-module.docx'], { extra: { 'README.md': '# Notes\n' } })).status).toBe(0);
    const res = runBuild(course([], { extra: { 'README.md': '# Notes\n' } }));
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/No \.docx or \.md files/);
  });
});
