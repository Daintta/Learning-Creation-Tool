// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'build-course.mjs');

describe('images in Word files', () => {
  let root;
  const approved = readFileSync(path.join(REPO, 'assessments', 'm01.md'), 'utf8');
  const build = (doc) => {
    rmSync(path.join(root, 'course-docs'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'course-docs'));
    copyFileSync(path.join(REPO, 'tests', 'fixtures', doc), path.join(root, 'course-docs', doc));
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root, encoding: 'utf8', env: { ...process.env, COURSE_ROOT: root },
    });
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'course-images-'));
    mkdirSync(path.join(root, 'assessments'));
    mkdirSync(path.join(root, 'assets', 'img'), { recursive: true });
    copyFileSync(path.join(REPO, 'course.config.json'), path.join(root, 'course.config.json'));
    writeFileSync(path.join(root, 'assessments', 'm01.md'), approved);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('keeps the alt text from Word and saves the image', () => {
    const res = build('06-Image-alt.docx');
    expect(res.status).toBe(0);
    const mod = readFileSync(path.join(root, 'content', 'modules', 'm01.js'), 'utf8');
    expect(mod).toContain('Diagram of a GNSS signal path from satellite to receiver');
    expect(mod).toContain('assets/img/m01-image1.png');
    expect(res.stdout).not.toMatch(/no alt text/);
  });

  it('warns about an image with no alt text', () => {
    const res = build('07-Image-no-alt.docx');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/1 image\(s\) have no alt text \(image 1\)/);
  });
});
