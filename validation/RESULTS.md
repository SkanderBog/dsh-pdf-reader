# Verification results

Verified on 2 October 2026 against the installed DeepSeek Harness 0.2.0-rc.2 runtime on Ubuntu Linux, using Node 22.23.2.

- 15 integration tests passed. They use the real Cordis tool registry, system prompt, filesystem provider and durable attachment store. Model capability discovery is controlled in the test; no remote model calls are made.
- Covered selectable prose, table row association, physical-page citations, scan detection, search coverage gaps, OCR, image output through the tool registry, text-only model refusal, encrypted/malformed files, page bounds, missing OCR, filesystem denial after caching, changed-source invalidation, cancellation/timeouts, literal shell-like filenames, lossless text continuation and rotated crop geometry.
- The packaged `.tgz` was unpacked and used for a separate processing smoke test covering scanned-page OCR and four image outputs.
- The scanned fixture contained zero selectable text characters. Local OCR recovered `COBALT-582`, sample count `47`, and mass `12.75 grams`.
- Visual review covered the prose/table fixture, scanned page, chart, magnified red-square crop and rotated page. Rendered content and crop location matched the source.
- Runtime JavaScript passed Node syntax checks.

The npm archive contains no model weights and has no npm runtime dependencies. Its exact size changes when documentation is updated. Its separate user-local Tesseract runtime is approximately 14 MiB and includes English and Simplified Chinese data. Poppler was already installed.

This is evidence of document processing and Harness integration. A matched live-model comparison against the original DSH workflow has not been run. OCR, mathematical notation and reading order still need content-specific checking.

Reproduce the integration run with `npm run test:package`. Generated logs, local source paths and installation backups are excluded from version control. See `evaluation.json` at the project root for the proposed model comparison.

## Installed desktop verification

- Installed the packaged archive through `dsh plugin --profile tauri add` with offline resolution and lifecycle scripts disabled.
- The running desktop plugin manager reports `dsh-pdf-reader` v0.1.0 enabled, with one component running. No restart was needed.
- A second smoke check imported the installed profile package with its default configuration. Poppler and both OCR languages were detected, and scanned-page extraction recovered all three expected facts.
- Profile manifest and lockfile changes are confined to adding this plugin; existing dependency versions and bundle selections are unchanged.
- The desktop source checkout remains clean. Profile metadata from before installation is preserved in `installation-backup/`.

## Official desktop compatibility review

The official `apps/desktop/package.json` and root manifest both identify `0.2.0-rc.2` at the time of review on 2026-10-02. The official desktop documentation confirms that the shared plugin manager installs external bundles into the desktop-owned profile. This plugin uses only official Harness host services, with no Tauri imports. This supports compatibility at the runtime API level; it is not evidence of running the official packaged desktop on macOS or Windows.

## Independent release package check

A fresh npm installation of the pinned official Harness libraries (not the desktop's dependency tree) passed all 15 integration tests against the unpacked release tarball. The archive contains exactly seven allowlisted public files. Source syntax checks passed. Test dependencies are development-only.
