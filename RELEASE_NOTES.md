# PDF Reader 0.1.6

- Cache `pdf_status` dependency probes for 30 s (`statusCacheMs`; 0 disables) and keep the check off the document queue, so a read or OCR page no longer blocks it; the result reports `cached` and `checked_at`.
- Terminate native process trees on Windows with `taskkill /T /F` on timeout or cancellation; POSIX keeps the process-group kill.
- Probe Homebrew Tesseract locations on macOS before PATH.
- Add Harness `0.2.2-rc.2` and `0.2.2-rc.5` package lanes with Cordis `4.1.0`, and record both in the Store compatibility matrix.

Install the attached `.tgz` using the correct DSH profile's Plugins page or CLI. Verify it against `SHA256SUMS`. This GitHub release does not update an installed profile or confer Store approval.

Validation covers real Harness services and extracted package contents, plus controlled model-adapter behavior. Paid provider output quality and packaged desktop GUIs are not certified. PDF native processing is tested on Linux/macOS; Windows native execution remains unverified. Poppler and optional Tesseract must be installed separately. The unscoped npm name belongs to another author; use this repository archive.

Validation: 50 extracted-package tests and 12 actual-adapter cases per runtime; all package lanes and the two CLI profile lanes passed on the release PR. Functional changes are in PRs [#12](https://github.com/SkanderBog/dsh-pdf-reader/pull/12) and [#13](https://github.com/SkanderBog/dsh-pdf-reader/pull/13).
