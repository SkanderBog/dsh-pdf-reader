# PDF Reader 0.1.7 validation

The final extracted seven-file archive passes **51 tests** with real Poppler, Tesseract, filesystem, attachment and tool services. The new unload regression starts a deliberately slow `pdf_status` probe, disposes the plugin, and asserts that disposal returns promptly with `PDF_PLUGIN_UNLOADED`. It is mutation-checked: replacing the combined lifetime signal with the caller signal alone makes it fail.

The 0.1.6 behaviors remain covered: `pdf_status` cache hit and `statusCacheMs: 0`, status answering while `pdf_read` is blocked, Windows `taskkill /T /F` arguments, macOS Homebrew Tesseract discovery, and the ten package lanes from `0.2.0-rc.2` through `0.2.2-rc.5` with exact Cordis pins. The two disposable CLI profile lanes cover `0.2.0-rc.2` and `0.2.1-rc.5`.

Windows native execution, packaged desktop GUIs and paid model output remain unverified. Poppler and optional Tesseract must be installed separately. This release adds no runtime npm dependencies, background services, downloads or model weights. Use this repository's archive; the unscoped npm name belongs to another author.
