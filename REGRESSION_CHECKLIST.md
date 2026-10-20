# Regression checklist

Run before each release. Items marked [x] were run on the current build; the rest are manual.

## Build

- [x] `npm test` passes (94 tests, including the build tests)
- [x] Build with no assessment for a module stops and names the module
- [x] `--template` creates a blank file that the build refuses to publish
- [x] Removing the draft line lets the build publish
- [x] `--allow-drafts` builds and prints a warning
- [x] Word file with Heading 1 sections becomes one lesson per heading
- [x] PDF headings are found from font size and split lessons; the repeated footer is dropped

## Learner flow

- [x] First visit redirects to Welcome; a valid name opens the dashboard
- [x] Lesson pages render for every module
- [x] Assessment is locked until every lesson is read
- [x] Passing a module issues its certificate
- [x] Passing every module issues the programme certificate
- [x] Certificates page lists each module, with the programme card below
- [x] Certificate pages show the correct module or programme title
- [x] Certificate PDFs generate with the learner's name, score, date, ID and content version (checked in Node)
- [ ] Certificate PDF displays correctly in Chrome, Edge and Safari
- [ ] Certificate cover boxes hide the old template wording cleanly (visual check)

## Resources and suggestions

- [x] Resources page renders with links from `course.config.json`
- [x] Search filters the resource cards
- [x] Suggest a Resource copies the formatted text to the clipboard and shows a confirmation

## Errors and network

- [x] No JavaScript errors on the learner screens (jsdom run)
- [ ] No external requests beyond Google Fonts (check in a browser's network panel)
- [ ] Mobile layout has no sideways scroll

## Before publishing

- [ ] Every assessment has been reviewed and its draft line removed
- [ ] `npm run build-course` completes without `--allow-drafts`
- [ ] Footer shows the correct app version
- [ ] Deployed site loads over HTTPS
