# Learning Tool

Build a self-paced online course from your own Word or Markdown documents. Learners work through
each module, pass a short assessment and earn a printable certificate for each module, plus a
programme certificate when every module is passed.

The course is a static website. It needs no server or database: each learner's progress is saved
in their own browser.

## What you get

- **Lessons** from your documents. In a Word file, each Heading 1 becomes a lesson (or each Heading 2, if there are no Heading 1s). In a Markdown file, each `#` heading does the same. The build warns you when a file splits badly.
- **Practice questions** from a companion file, with instant feedback. They do not count towards the certificate.
- **Assessments** for each module: single choice, multi-select, true/false, matching and ordering. Questions are shuffled on every attempt.
- **Rules you set:** the pass mark, and whether learners must read every lesson before the assessment unlocks.
- **Certificates** as PDFs, one per module and one for the programme. Each shows the learner's name, score, date and a certificate ID.
- **Glossary** from a Key Terms table in each document.
- **Resources** page, from references you list in the course config.

## Quick start

You need [Node.js](https://nodejs.org) 22.12 or later. The build and tests were run on Node 24.

```bash
npm install
```

To see a working course first, run `npm run build-course` and open the site. The example module in `course-docs/` shows how the files fit together.

1. Put your course documents in `course-docs/` (see [course-docs/README.md](course-docs/README.md)). Each module needs its files named with the same number:
   the lessons (`NN-Title.docx` or `NN-Title.md`), the practice questions (optional, `NN-Title-practice.md`) and the assessment (`NN-Title-assessment.md`).
2. Set the course details in `course.config.json`.
3. Build the course. If a module has no assessment file yet, the build stops and tells you which one.
   To create a blank one for each missing module, run it with `--template`:

   ```bash
   npm run build-course -- --template
   ```

4. Write the questions in each module's `NN-Title-assessment.md` file, then delete the `status: draft` line at the top.
   Templates carry that line, so the build will not publish them until you have removed it.
5. Build again. This time it succeeds only when every file is approved:

   ```bash
   npm run build-course
   ```

6. Preview the site by serving the folder with any static web server:

   ```bash
   python3 -m http.server 8000
   # then open http://localhost:8000
   ```

Nothing is sent to an online service. Questions are written by hand. See
[course-docs/README.md](course-docs/README.md) for the details.

## Configuration

### Course settings: `course.config.json`

| Setting | Purpose |
|---|---|
| `title`, `subtitle`, `organisation` | Shown across the app and on certificates |
| `passMark` | Percentage needed to pass each assessment (default 80) |
| `requireAllLessonsRead` | Unlock the assessment only after every lesson is marked as read |
| `revealAnswersOnFail` | Show correct answers and explanations after a failed attempt |
| `certificatePrefix` | Start of each certificate ID (default `CERT`) |
| `contentVersion` | Version printed on certificates. Change it when the documents change |
| `stages` | Optional grouping of modules, for example `[{"name": "Foundation", "modules": [1, 2]}]`. Leave `null` for one group |
| `resources` | Reference links shown on the Resources page: `[{"title": "...", "desc": "...", "url": "https://..."}]` |

The build writes these settings to `content/course-config.js`. Do not edit that file by hand.

### App settings: `assets/js/config.js`

Settings that are not about the course, such as the storage key and the footer version.

## Editing assessments

Each module's questions are in its `NN-Title-assessment.md` file, next to its document. Edit them in any text editor, then run
`npm run build-course` to check them and rebuild.

```markdown
## single
Question text.
- A wrong option
* The correct option (marked with *)
- Another wrong option
> Explanation shown after the learner answers.

## multi
Question text. Mark every correct option with *.
* Correct
* Also correct
- Wrong
> Explanation.

## truefalse
A statement.
= false
> Explanation.

## match
Instruction text.
- Left item = Its matching right item
- Another left item = Its match
> Explanation. (Right-hand items are shuffled; each must be unique.)

## order
Instruction text. List the items in the CORRECT order; they are shuffled on screen.
1. First
2. Second
3. Third
> Explanation.
```

Each file can have a different number of questions. Practice files use the same layout, without match and order.

## Before you publish

These checks are manual. Run them before each release.

- [ ] A subject-matter expert has reviewed every assessment and practice question, and the draft lines are removed.
- [ ] `npm run build-course` completes without `--allow-drafts`, and every warning has been read.
- [ ] Each lesson's images have alt text, and every "Further learning" link opens.
- [ ] A certificate PDF opens and shows the right name, score, date and ID, in Chrome, Edge and Safari.
- [ ] The main screens have no sideways scrolling on a phone.
- [ ] The footer shows the right version, and the site loads over HTTPS once deployed.

## Deploy to GitHub Pages

1. Create a repository and push this folder to the `main` branch. Commit the generated `content/`
   folder so the site can be deployed without rebuilding.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site on every push to `main`.

The workflow publishes only `index.html`, `assets/` and `content/`. The source documents, the
assessment files and the build scripts stay in the repository and are not published.

> **Visibility:** on GitHub Free, Pages sites are public, and Pages from a private repository needs
> GitHub Pro, Team or Enterprise. If the material should not be publicly reachable, check your plan first.

## Limitations of the standalone version

- **PDF files are not supported.** Save the document as Word or Markdown. PDFs are skipped with a note.
- **Progress is per browser.** Learners who clear their browser data or switch device start again.
  Certificates should be saved as PDFs to keep a permanent copy.
- **It is not tamper-proof.** Scoring happens in the learner's browser, so the answer key is present in
  the page's JavaScript. Certificate IDs cannot be verified centrally.
- **There is no central reporting.** Learners send their certificate PDFs to show completion.

## Folder structure

```
course-docs/                  your Word and Markdown documents, and their companion files (see course-docs/README.md)
course.config.json            course settings
scripts/build-course.mjs      the build command
scripts/build/                the build's parts: readers, lessons, assessments and practice
index.html                    the app
assets/css/app.css            styles
assets/js/app.js              app logic
assets/js/store-local.js      browser storage and scoring
assets/js/certificate.js      certificate PDFs
assets/js/config.js           app settings
assets/img/                   logo, favicon and images from the documents
content/                      generated by the build; do not edit by hand
tests/                        automated tests (npm test)
.github/workflows/            GitHub Pages deployment
```

## Development

```bash
npm test          # run the tests once
npm run test:ui   # run the tests in a browser UI
npm run e2e       # run the learner flow in Google Chrome (build the course first)
```

The build tests run the real build against small test courses in fixtures (`tests/fixtures/`). The store test loads the real `assets/js/store-local.js`. The end-to-end check opens the site in Chrome, reads and answers every module from the course data, and checks the certificates, the phone layout, console errors and outside requests. It needs Google Chrome; set `CHROME_PATH` if Chrome is not in the usual place.
