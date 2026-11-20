# PDF Reader 0.1.7

- Fix a 0.1.6 teardown regression: off-queue `pdf_status` probes now combine the caller signal with the plugin lifetime signal, are tracked, and are settled during disposal. Disabling or uninstalling the plugin no longer leaves a probe running.
- From 0.1.6: `pdf_status` caches dependency probes for 30 s (`statusCacheMs`; 0 disables) and stays off the document queue; Windows process trees are terminated with `taskkill /T /F` on timeout or cancellation; macOS Homebrew Tesseract paths are probed before PATH; Harness `0.2.2-rc.2` / `rc.5` lanes use Cordis `4.1.0`.

Install the attached `.tgz` using the correct DSH profile's Plugins page or CLI. Verify it against `SHA256SUMS`. This GitHub release does not update an installed profile or confer Store approval.

Validation covers real Harness services and extracted package contents, plus controlled model-adapter behavior. Paid provider output quality and packaged desktop GUIs are not certified. PDF native processing is tested on Linux/macOS; Windows native execution remains unverified. Poppler and optional Tesseract must be installed separately. The unscoped npm name belongs to another author; use this repository archive.

Validation: 51 extracted-package tests and 12 actual-adapter cases per runtime; all package lanes and the two CLI profile lanes passed on the release PR. The teardown regression is mutation-checked: using only the caller signal makes the unload test fail. Changes are in PR [#15](https://github.com/SkanderBog/dsh-pdf-reader/pull/15), on top of [#12](https://github.com/SkanderBog/dsh-pdf-reader/pull/12) and [#13](https://github.com/SkanderBog/dsh-pdf-reader/pull/13).
