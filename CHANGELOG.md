# Changelog

## Unreleased

- Preserve exact embedded PDF text when `ocr: "force"` adds a full-page OCR reading, matching the safer mixed-page behavior of automatic OCR.
- Let local tests use the plugin's normal user-local Tesseract discovery unless an explicit test executable is configured.

## 0.1.0 — 2026-10-02

Initial release of a standalone Harness PDF reader with page inspection, text extraction and search, selective local OCR, and page/crop image output for vision-capable models. Includes page citations, coverage and truncation reporting, filesystem-mediated access, bounded subprocesses and cancellation.

Verified against the official Harness 0.2.0-rc.2 services on Linux and installed in DSH Tauri Desktop. The packed plugin also passed the full integration suite in CI on Linux (Node 22 and 24) and macOS (Node 24). The official desktop uses the same plugin mechanism, but its packaged GUI and Windows execution remain untested. Native Poppler and Tesseract are required separately. A matched live-model accuracy benchmark has not been run.
