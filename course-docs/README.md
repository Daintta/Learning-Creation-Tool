# Course documents

Put the course documents in this folder. The build turns each file into one module.

## Steps

1. **Add the documents.** Word (`.docx`) and PDF (`.pdf`) files are supported.
2. **Name them in the order you want.** Files are sorted by name, so start each with a number:
   `01-Introduction.docx`, `02-Core-concepts.docx`, `03-Assessment-basics.pdf`.
   The number is removed from the module title, so `02-Core-concepts.docx` becomes "Core concepts".
3. **Set the course details** in `course.config.json` (title, organisation, pass mark and so on).
4. **Build:**

   ```
   npm install
   npm run build-course -- --template
   ```

5. **Write the assessments.** Each module needs `assessments/mNN.md`. `--template` creates a blank one for any
   module that does not have one. Write the questions by hand (see "Editing assessments" in the main README),
   then **delete the `status: draft` line** at the top of the file.
6. **Build again:** `npm run build-course`. The build stops while any template is still unapproved.

To preview a course before the questions are approved, use `npm run build-course -- --allow-drafts`.
Do not share a build made that way.

Nothing in the build sends your documents anywhere. Assessment questions are written by hand.

## How documents become lessons

| In the document | In the course |
| --- | --- |
| The file name | The module title (the number prefix is removed) |
| Each Heading 1 | One lesson, titled with the heading. If there are no Heading 1s, each Heading 2 is used instead |
| No headings at all | The whole document becomes one lesson, and the build warns you |
| Text before the first Heading 1 | Included at the start of the first lesson |
| Images in a Word file | Saved to `assets/img/` and shown in the lesson, with the Alt Text from Word. An image with no Alt Text gets a build warning |
| A PDF | One module. Headings are found from font size (the larger short lines), and each becomes a lesson or part of one |

PDFs have no heading tags, so headings are found from font size: the most common size is body text, and short lines clearly larger than that are headings. Repeated headers and footers and bare page numbers are dropped. The build prints every heading it found, so check them against the document. The build warns about files that split badly: no headings, or a Knowledge Check or Key Terms section that was not read. For a course with several lessons,
use Word and add Heading 1 to each section. Tables are kept as tables.

## Assessment format

Each `assessments/mNN.md` file holds the questions for one module. The file is written by hand or
approved from a draft. See the README section "Editing assessments" for the full format.

## Practice questions (Knowledge Check)

Add a Heading 1 called **Knowledge Check**. Write each question as a numbered paragraph, with lettered options under it:

    1. Which signal do GNSS receivers use? [Select one]
    A. Sound
    B. Radio

Use "Select all that apply." in the question text for questions with more than one correct answer.

Then add a Heading 1 called **Answers** directly after the Knowledge Check, with one line per question:

    1. B: Radio signals come from satellites.
    2. A and B: Both are sensors.

The Knowledge Check and Answers sections become the module's practice questions. They are not shown as lessons. Answers can also be a table with columns Number | Answer | Rationale.

## Key terms (glossary)

Add a table with the header row **Term | Definition**. Each row becomes a glossary entry. The same term in several modules is listed once, with every module that defines it. The table is removed from the lesson text.

## Limitations

- Key Terms need a table, which only Word files can hold, so a PDF has no glossary entries. Knowledge Check questions can be read from a PDF too, but PDF line breaks are less reliable, so check them carefully.
