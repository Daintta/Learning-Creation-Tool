# Changelog

## Unreleased

- Rebuilt as a general learning tool. A course is built from the Word and PDF files in `course-docs/` with `npm run build-course`.
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
