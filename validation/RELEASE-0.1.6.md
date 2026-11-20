# PDF Reader 0.1.6 validation

The final extracted seven-file archive passes **50 tests** with real Poppler, Tesseract, filesystem, attachment and tool services. New regressions cover the `pdf_status` cache hit, the `statusCacheMs: 0` bypass, and a status call answering while `pdf_read` is blocked in a deliberately slow `pdfinfo` wrapper. Both new behaviours are mutation-checked: removing the cache or the queue bypass makes the corresponding test fail.

The Windows tree-termination arguments are unit-tested (`taskkill /PID <pid> /T /F`); POSIX keeps the detached process-group kill. The macOS Homebrew Tesseract paths are probed before PATH.

CI runs ten package lanes: Node 22 and 24 on the baseline Harness `0.2.0-rc.2`, macOS, and the `0.2.1-alpha.1` / `alpha.2` / `rc.2` / `rc.5` / `0.2.2-alpha.2` / `rc.2` / `rc.5` lanes with their exact Cordis pins. The two disposable CLI profile lanes cover `0.2.0-rc.2` and `0.2.1-rc.5`. The rc.2/rc.5 lanes and the Windows/macOS portability changes landed in PR #12; the status cache and queue bypass landed in PR #13.

Windows native execution, packaged desktop GUIs and paid model output remain unverified. Poppler and optional Tesseract must be installed separately. This release adds no runtime npm dependencies, background services, downloads or model weights. Use this repository's archive; the unscoped npm name belongs to another author.
