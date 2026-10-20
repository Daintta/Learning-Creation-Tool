// End-to-end check in a real browser: a learner signs in, reads every lesson, passes every
// module, and gets the certificates. Also checks the phone layout, console errors and outside requests.
//
//   npm run e2e
//
// Needs Google Chrome. Set CHROME_PATH if it is not in the usual place. Run `npm run build-course` first.
// The check answers questions from the course data (single, multi and true/false questions only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(ROOT) || !existsSync(file) || (await stat(file)).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const isOutside = (url) => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1');
const isFontHost = (url) => /fonts\.(googleapis|gstatic)\.com/.test(url);

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const failed = [];
  const outside = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', (r) => { if (!isFontHost(r.url())) failed.push(r.url()); });
    page.on('request', (r) => { if (isOutside(r.url()) && !isFontHost(r.url())) outside.push(r.url()); });

    // 1. A new learner goes to Welcome, enters a name, and reaches the dashboard.
    await page.goto(base, { waitUntil: 'networkidle0' });
    check(await page.evaluate(() => location.hash) === '#/welcome', 'a new visitor is sent to Welcome');
    await page.type('input[name="fullName"]', 'Test Learner');
    await page.click('form button[type="submit"], form .btn');
    await sleep(500);
    check(await page.evaluate(() => location.hash) === '#/', 'the learner reaches the dashboard after entering a name');

    const course = await page.evaluate(() => ({
      modules: window.Course.catalog.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) })),
      questions: Object.fromEntries(window.Course.assessments.map((a) => [a.moduleId, a.questions])),
    }));
    const unsupported = Object.values(course.questions).flat().filter((q) => !['single', 'multi', 'truefalse'].includes(q.type));
    check(unsupported.length === 0, 'every assessment question is single, multi or true/false (the check cannot answer match or order)');

    for (const mod of course.modules) {
      // 2. Read every lesson.
      for (const lesson of mod.lessons) {
        await page.goto(`${base}#/module/${mod.id}/lesson/${lesson}`, { waitUntil: 'networkidle0' });
        await sleep(200);
        const next = await page.$('#mark-next');
        if (next) { await next.click(); await sleep(250); }
      }

      // 3. Answer the assessment from the course data, then submit.
      await page.goto(`${base}#/module/${mod.id}/assessment`, { waitUntil: 'networkidle0' });
      await sleep(200);
      const start = await page.$('#start');
      if (start) { await start.click(); await sleep(250); }
      for (let step = 0; step < 50; step++) {
        const prompt = await page.$eval('.prompt', (e) => e.textContent.trim()).catch(() => null);
        if (!prompt) break;
        const q = course.questions[mod.id].find((x) => x.prompt === prompt);
        if (!q) throw new Error(`question not found in course data: ${prompt}`);
        for (const id of q.answer.split(',')) {
          await page.click(`input[value="${id}"]`);
        }
        await sleep(100);
        const next = await page.$('#next');
        const review = await page.$('#review');
        if (next) { await next.click(); await sleep(150); } else if (review) { await review.click(); await sleep(200); break; } else break;
      }
      const submit = await page.$('#submit');
      if (submit) { await submit.click(); await sleep(800); }
      const result = await page.$eval('#view', (v) => v.textContent).catch(() => '');
      check(/You passed/.test(result), `${mod.id} assessment is passed with the answers from the course data`);
      await page.goto(`${base}#/certificate/${mod.id}`, { waitUntil: 'networkidle0' });
      await sleep(2000);
      const frame = await page.$eval('#cert-viewer', (f) => f.src).catch(() => '');
      check(frame.startsWith('blob:'), `${mod.id} certificate PDF is generated`);
    }

    // 4. Programme certificate after every module.
    await page.goto(`${base}#/certificate/programme`, { waitUntil: 'networkidle0' });
    await sleep(2000);
    const programme = await page.$eval('#cert-viewer', (f) => f.src).catch(() => '');
    check(programme.startsWith('blob:'), 'the programme certificate PDF is generated after every module is passed');

    // 5. Phone width: no sideways scrolling on the main screens.
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    for (const route of ['#/', `#/module/${course.modules[0].id}`, '#/certificates', '#/resources', '#/glossary']) {
      await page.goto(base + route, { waitUntil: 'networkidle0' });
      await sleep(200);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(scroll <= client, `no sideways scrolling at phone width on ${route}`);
    }

    // 6. Errors and outside requests.
    check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    check(failed.length === 0, `no failed requests${failed.length ? ': ' + failed.join(' | ') : ''}`);
    check(outside.length === 0, `no requests outside the site${outside.length ? ': ' + outside.join(' | ') : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`e2e failed: ${e.message}`);
  process.exit(1);
});
