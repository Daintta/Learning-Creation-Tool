# Learning Tool

Build a self-paced online course from your own Word or PDF documents. Learners work through
each module, pass a short assessment and earn a printable certificate for each module, plus a
programme certificate when every module is passed.

The course is a static website. It needs no server or database: each learner's progress is saved
in their own browser.

## What you get

- **Lessons** from your documents. In a Word file, each Heading 1 becomes a lesson (or each Heading 2, if there are no Heading 1s). In a PDF, headings are found from font size: larger short lines start a lesson. The build lists the headings it found so you can check them, and warns when a file splits badly.
- **Assessments** for each module: single choice, multi-select, true/false, matching and ordering.
  Questions are shuffled on every attempt.
- **Rules you set:** the pass mark, and whether learners must read every lesson before the assessment unlocks.
- **Certificates** as PDFs, one per module and one for the programme. Each shows the learner's name, score, date and a certificate ID.
- **Resources** page, from references you list in the course config.

## Quick start

You need [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
```

1. Put your course documents in `course-docs/` (see [course-docs/README.md](course-docs/README.md)).
2. Set the course details in `course.config.json`.
3. Build the course. If a module has no assessment file yet, the build stops and tells you which one.
   To create a blank one for each missing module, run it with `--template`:

   ```bash
   npm run build-course -- --template
   ```

4. Write the questions in each `assessments/mNN.md` file, then delete the `status: draft` line at the top.
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

Each module's questions are in `assessments/mNN.md`. Edit them in any text editor, then run
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

Each file can have a different number of questions.

**Have a subject-matter expert review the questions before the course goes live.** The build will not
publish a file that still has the draft line.

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

- **Progress is per browser.** Learners who clear their browser data or switch device start again.
  Certificates should be saved as PDFs to keep a permanent copy.
- **It is not tamper-proof.** Scoring happens in the learner's browser, so the answer key is present in
  the page's JavaScript. Certificate IDs cannot be verified centrally.
- **There is no central reporting.** Learners send their certificate PDFs to show completion.
- **PDF headings come from font size.** Check the list the build prints. Key Terms tables and Word-style structure need a Word file.

## Folder structure

```
course-docs/                  your Word and PDF documents (see course-docs/README.md)
course.config.json            course settings
assessments/mNN.md            assessment questions, one file per module
scripts/build-course.mjs      the build: documents and assessments to site content
index.html                    the app
assets/css/app.css            styles
assets/js/app.js              app logic
assets/js/store-local.js      browser storage and scoring
assets/js/certificate.js      certificate PDFs
assets/js/config.js           app settings
assets/img/                   logo, favicon and images from the documents
content/                      generated by the build; do not edit by hand
tests/                        unit tests (npm test)
.github/workflows/            GitHub Pages deployment
```

## Development

```bash
npm test          # run the unit tests
npm run test:ui   # run the tests in a browser UI
```
