# Test Suite

Automated tests for the Daintta Learning app and course build, using Vitest.

## Running Tests

```bash
npm install           # install dependencies first
npm test              # run all tests
npm run test:ui       # view tests in the browser UI
npm run test:coverage # generate a coverage report
```

## What is covered

**store.test.js**, **progress.test.js**: browser storage, lesson tracking, practice scores, assessment attempts, module unlocking, certificates and programme completion.

**satellite-tracking.test.js**: progress graphic maths, status colours and orbit positions.

**search-filter.test.js**, **url-normalization.test.js**: resource search and link normalisation.

**storage-fallback.test.js**: storage fallbacks when browser storage is unavailable.

> Note: store, progress, satellite, search, URL and storage-fallback tests mostly check a copy of the logic written inside the test, not the app code itself. They will not catch a change in `assets/js/`. Replacing those copies with imports of the real modules is the next step for the test suite.

**build-course.test.js**: the assessment parser and draft gate, lesson splitting, and the build command run against a temporary course folder.

**build-course-practice.test.js**: the Knowledge Check parser, Key Terms extraction, and a full build that checks the generated practice questions and glossary.

Fixtures for the build tests are in `tests/fixtures/`.

## Not yet tested

- Certificate PDF layout (checked by hand, see REGRESSION_CHECKLIST.md)
- Browser end-to-end flows (a Playwright suite would cover these)
- Form validation in the Welcome and Your details screens
