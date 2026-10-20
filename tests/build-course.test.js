// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  titleFromFile, splitLessons, parseAssessment, templateDraft, stripTags, slug,
} from '../scripts/build-course.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('titleFromFile', () => {
  it('drops the number prefix and extension and tidies separators', () => {
    expect(titleFromFile('/docs/02-Core_concepts-now.docx')).toBe('Core concepts now');
    expect(titleFromFile('01-Intro.PDF')).toBe('Intro');
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

describe('splitLessons', () => {
  it('starts a lesson at each Heading 1 and keeps text before the first heading', () => {
    const html = '<p>Intro text</p><h1>Alpha</h1><p>a body</p><h1>Beta</h1><p>b body</p>';
    const lessons = splitLessons(html, 'm01');
    expect(lessons.map((l) => l.title)).toEqual(['Alpha', 'Beta']);
    expect(lessons[0].id).toBe('m01-alpha');
    expect(lessons[0].html).toContain('Intro text');
    expect(lessons[0].html).toContain('a body');
    expect(lessons[1].html).not.toContain('Intro text');
  });
  it('makes lesson ids unique when headings repeat', () => {
    const lessons = splitLessons('<h1>Same</h1><p>x</p><h1>Same</h1><p>y</p>', 'm02');
    expect(lessons.map((l) => l.id)).toEqual(['m02-same', 'm02-same-2']);
  });
  it('makes one lesson when there are no headings', () => {
    const lessons = splitLessons('<p>Just text</p>', 'm03');
    expect(lessons).toHaveLength(1);
    expect(lessons[0].title).toBe('Content');
  });
  it('drops sections with no text', () => {
    expect(splitLessons('<h1>Empty</h1><p>   </p>', 'm04')).toEqual([]);
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
    const right = single.options.find((o) => o.text === 'Right');
    expect(single.answer).toBe(right.id);
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
    expect(order.answer.split('>')).toHaveLength(3);
    const firstId = order.items.find((i) => i.text === 'First').id;
    expect(order.answer.split('>')[0]).toBe(firstId);
  });

  it('gives stable ids on repeated parses', () => {
    const again = parseAssessment(SAMPLE, 'm01', 'sample.md');
    expect(again).toEqual(qs);
  });

  it('rejects malformed questions with a message that names the file', () => {
    expect(() => parseAssessment('## bogus\nX\n- a\n* b', 'm01', 'bad.md')).toThrow(/bad\.md.*unknown type 'bogus'/);
    expect(() => parseAssessment('## single\nX\n* a\n* b', 'm01', 'bad.md')).toThrow(/exactly one correct/);
    expect(() => parseAssessment('## truefalse\nX', 'm01', 'bad.md')).toThrow(/needs '= true' or '= false'/);
    expect(() => parseAssessment('## order\nX\n1. a\n2. b', 'm01', 'bad.md')).toThrow(/at least three items/);
  });
});

describe('templateDraft', () => {
  const mod = { id: 'm01', number: 1, title: 'Sample', text: '' };

  it('is marked as a draft and parses', () => {
    const md = templateDraft(mod);
    expect(md).toMatch(/status:\s*draft/);
    expect(parseAssessment(md, 'm01', 'template.md')).toHaveLength(1);
  });
});

describe('npm run build-course (command line)', () => {
  let root;
  const run = (...flags) => spawnSync(process.execPath, [SCRIPT, ...flags], {
    cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
  });

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-build-'));
    mkdirSync(path.join(root, 'course-docs'));
    mkdirSync(path.join(root, 'assessments'));
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    copyFileSync(path.join(REPO, 'tests', 'fixtures', '01-Example-module.docx'), path.join(root, 'course-docs', '01-Example-module.docx'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stops when a module has no assessment', () => {
    const res = run();
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/No assessment for m01/);
  });

  it('creates a blank template with --template and refuses to publish it', () => {
    const res = run('--template');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Unapproved drafts: assessments\/m01\.md/);
    expect(readFileSync(path.join(root, 'assessments', 'm01.md'), 'utf8')).toMatch(/status:\s*draft/);
    expect(existsSync(path.join(root, 'content', 'catalog.js'))).toBe(false);
  });

  it('publishes once the draft line is removed', () => {
    const file = path.join(root, 'assessments', 'm01.md');
    const approved = readFileSync(file, 'utf8').replace(/^<!--\s*status:\s*draft.*\n/m, '');
    writeFileSync(file, approved);
    const res = run();
    expect(res.status).toBe(0);
    const catalog = readFileSync(path.join(root, 'content', 'catalog.js'), 'utf8');
    expect(catalog).toContain('"title": "Example module"');
    expect(readFileSync(path.join(root, 'content', 'modules', 'm01.js'), 'utf8')).toContain('Course.registerModule');
    expect(readFileSync(path.join(root, 'content', 'course-config.js'), 'utf8')).toContain('window.CourseSettings');
  });

  it('builds with drafts only when --allow-drafts is given, and warns', () => {
    writeFileSync(path.join(root, 'assessments', 'm01.md'), '# t\n<!-- status: draft -->\n## single\nQ\n- a\n* b\n');
    const res = run('--allow-drafts');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/WARNING: building with unapproved drafts/);
  });
});
