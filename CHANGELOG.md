# Changelog

## 0.1.4 — 2026-10-19

- Honor cancellation before cached OCR returns; clean OCR input files even when writing is interrupted.
- Reject malformed native PNG headers and invalid image dimensions before returning an attachment.
- Add a packed runtime test lane for Harness `0.2.1-rc.2`.

- Stop forwarding inherited dynamic-library search overrides to native PDF/OCR processes; trusted custom wrappers must supply their own fixed library paths.
- Add a source-bound native dependency inventory for Store review, recording executable paths, hashes and version probes without dumping environment values.
- Reuse page text across overlapping reads and layout switches with a bounded least-recently-used cache; preserve image counts across inspected ranges.
- Convert only missing pages, retaining the 100-page extraction batch limit and avoiding eviction-driven rereads.
- Add match offsets and `next_offset` to PDF search so later results are accessible without guessing page ranges.

## 0.1.3

- Remove partial page images when rendering fails or is cancelled, and verify a subsequent render still works.
- Add a current DSH 0.2.1-alpha.2 compatibility test lane and explicit Store feature/category metadata.

## 0.1.2

- Declare DSH STORE's separate compatibility range, exact release matrix and measured CLI lifecycle results; keep untested operations unknown.
- Restrict native subprocess environment inheritance to runtime path, font and OCR settings. Host API keys, authentication tokens and loader-injection variables are no longer forwarded.
- Add actual disposable-profile install/start/tool-execution/uninstall verification and permission/dependency documentation for Store issue #1336.


- Reuse inspected text and image counts for contained page ranges, keeping the existing bounded cache and layout separation.
- Honor cancellation before returning cached extraction results.
- Add packaged regression coverage and a Harness 0.2.1-alpha.1 compatibility lane.

## 0.1.1

- Preserve exact embedded PDF text when `ocr: "force"` adds a full-page OCR reading, matching the safer mixed-page behavior of automatic OCR.
- Let local tests use the plugin's normal user-local Tesseract discovery unless an explicit test executable is configured.

## 0.1.0 — 2026-10-02

Initial release of a standalone Harness PDF reader with page inspection, text extraction and search, selective local OCR, and page/crop image output for vision-capable models. Includes page citations, coverage and truncation reporting, filesystem-mediated access, bounded subprocesses and cancellation.

Verified against the official Harness 0.2.0-rc.2 services on Linux and installed in DSH Tauri Desktop. The packed plugin also passed the full integration suite in CI on Linux (Node 22 and 24) and macOS (Node 24). The official desktop uses the same plugin mechanism, but its packaged GUI and Windows execution remain untested. Native Poppler and Tesseract are required separately. A matched live-model accuracy benchmark has not been run.
