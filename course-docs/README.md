# Course documents

Put the course documents in this folder. The build turns each document into one module.

## Files for one module

Each module is up to three files in this folder, named with the same number and title:

```
09-Chapter-10.md              the lessons (Word .docx or Markdown .md)
09-Chapter-10-practice.md     the practice questions (optional)
09-Chapter-10-assessment.md   the assessment questions
```

The example module follows the same pattern: `01-Example-module.docx` and `01-Example-module-assessment.md`.

## Steps

1. **Add the documents.** Word (`.docx`) and Markdown (`.md`) files are supported. PDF files are skipped with a note, so save them as Word or Markdown first. A `README.md` in this folder is ignored.
2. **Name them in the order you want.** Files are sorted by name, so start each with a number, for example `01-Introduction.md` and `02-Core-concepts.docx`. The number is removed from the module title, so `02-Core-concepts.docx` becomes "Core concepts".
3. **Set the course details** in `course.config.json` (title, organisation, pass mark and so on).
4. **Build:**

   ```
   npm install
   npm run build-course -- --template
   ```

5. **Write the assessments.** Each module needs an assessment file next to its document, named `NN-Title-assessment.md`. `--template` creates a blank one for any module that does not have one. Write the questions by hand (see "Editing assessments" in the main README), then **delete the `status: draft` line** at the top of the file.
6. **Build again:** `npm run build-course`. The build stops while any template is still unapproved.

To preview a course before the questions are approved, use `npm run build-course -- --allow-drafts`. Do not share a build made that way.

Nothing in the build sends your documents anywhere. Assessment questions are written by hand.

## How documents become lessons

| In the document | In the course |
| --- | --- |
| The file name | The module title, unless a Markdown file has a `title:` in its front matter. The number prefix is removed |
| Each Heading 1 | One lesson, titled with the heading. If there are no Heading 1s, each Heading 2 is used instead |
| No headings at all | The whole document becomes one lesson, and the build warns you |
| Text before the first Heading 1 | Included at the start of the first lesson |
| A Knowledge Check or Answers section | Not read. The build warns you. Move the questions to the practice file |
| Key terms table (header row `Term \| Definition`) | Glossary entries. The same term in several modules is listed once |
| Images in a Word file | Saved to `assets/img/` and shown in the lesson, with the alt text from Word. An image with no alt text gets a build warning |
| Images in a Markdown file | Written as `![alt text](file.png)`, with the file in the same folder. Copied and shown in the lesson |

## Markdown documents

- Each `# ` heading starts a lesson. Text before the first heading goes into the first lesson.
- Optional front matter gives the module title. It is not shown as lesson text:

  ```
  ---
  title: Risk Management & Governance
  ---
  ```

- Callouts are blocks that start with `:::kind` and end with `:::` on its own line. The kinds are `principle`, `note`, `example`, `warning` and `update`:

  ```
  :::principle Making assumptions explicit
  A key challenge in risk work is making assumptions explicit.
  :::
  ```

  Leave a blank line after the opening line and before the closing `:::`.

## Practice files

A practice file sits next to its document, with `-practice.md` added to the name, for example `09-Chapter-10-practice.md`. It uses the same layout as the assessment files, without the pass mark:

```
## single
Which signal do GNSS receivers use?
- Sound
* Radio
> Radio signals come from satellites.

## multi
Which are sensors? Mark every correct option with *.
* Accelerometer
* Thermometer
- Keyboard
> Both are sensors.
```

Single-choice questions need exactly one `*` option. Match and order questions are skipped in practice, with a note, because practice supports single, multi and true/false questions only.

## Assessment format

Each module's assessment is a companion file named `NN-Title-assessment.md`. It holds the questions for the module, written by hand, in the same layout as the practice files. Assessments also have a pass mark and can use match and order questions. See "Editing assessments" in the main README for the full format.

## Limitations

- PDF files are not supported. Save the document as Word or Markdown.
- Key terms need a table with the header row `Term | Definition`.
