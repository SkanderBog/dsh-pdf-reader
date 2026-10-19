# PDF Reader 0.1.4 validation

The extracted seven-file archive passes 37 tests using real Harness services and local Poppler/Tesseract. New regressions first fail on the previous source: cached OCR ignores an already-aborted signal, and a renderer returning non-PNG bytes is accepted. Both now pass; temporary page output is removed on failure.

The CI matrix adds Harness 0.2.1-rc.2 with stable Cordis 4.0.5. Publication requires every package lane and the existing disposable-profile lifecycle job to pass. These checks do not certify packaged desktop GUIs, Windows native processors, external executable provenance, or update rollback. Store admission remains independent.

This release includes the previously merged bounded page cache, paginated search, and removal of inherited native-library search overrides. Use this repository's release archive: the unscoped npm name belongs to another author.
