# PDF Reader 0.1.5

- Stop native processor descendants on POSIX timeout/cancellation and promptly reject cancelled queued work.
- Track complete text delivery across contiguous read offsets without combining different text representations; failed calls and cancelled image saves no longer claim delivery.
- Validate OCR language arguments consistently and distinguish unknown image capability from explicitly text-only routes.
- Exercise actual DeepSeek model metadata, arbitrary model IDs, route/capability changes, and real images without network or model calls.
- Add Harness `0.2.1-rc.5` and `0.2.2-alpha.2` package lanes with exact Cordis families, alpha native-executor fixtures, and a current rc.5 CLI lifecycle lane.

Install the attached `.tgz` using the correct DSH profile's Plugins page or CLI. Verify it against `SHA256SUMS`. This GitHub release does not update an installed profile or confer Store approval.

Validation covers real Harness services and extracted package contents, plus controlled model-adapter behavior. Paid provider output quality and packaged desktop GUIs are not certified. PDF native processing is tested on Linux/macOS; Windows native execution remains unverified. Poppler and optional Tesseract must be installed separately. The unscoped npm name belongs to another author; use this repository archive.
