# Changelog

## Unreleased

- Simplified: PDF support removed, along with its heading detection and its library. Practice comes only from the companion `-practice.md` file, in the assessment layout. Knowledge Check and Answers sections in documents are no longer read, and the build warns about them. Assessments are only read from `NN-Title-assessment.md` next to the document. The build is split into `scripts/build/`.
- Tests: the copies of app logic in the tests were replaced by a test of the real browser store. The build tests run against small test courses. The tests README and the separate regression checklist were folded into the main README.
- The store's certificate IDs no longer use the letter L, as the certificate has never done.
- Rebuilt as a general learning tool. A course is built from the Word and Markdown files in `course-docs/` with `npm run build-course`.
- Assessment questions are written by hand. `--template` creates a blank file for any module that has none. The build will not publish a file until its status line is removed.
- No online service is used. The Claude API drafting, its SDK dependency and the `questionsPerModule` setting were removed.
- The three fixed pathway certificates are removed. Each module has a certificate, and passing every module earns the programme certificate.
- Certificate template wording is covered and redrawn from the course settings (header, side-panel label, the line above the module, and the pass mark).
- The Resources page reads its links from `course.config.json`.
- Suggested resources are copied to the clipboard. The GitHub suggestion automation has been removed.
- The `PNT` namespace is now `Course`. Generated course settings are `window.CourseSettings`.
- Build tests added in `tests/build-course.test.js`.
- Superseded tools removed: `tools/build_content.py`, `scripts/fix-links.js`.
- Admin version removed from this repo: admin and sign-in pages, the Supabase client, the Python server builder, and the Supabase config. The app is browser-only. The admin version is archived and will be rebuilt as a separate project.
- Store simplified to local browser storage. The sync queue and retry logic are removed.
