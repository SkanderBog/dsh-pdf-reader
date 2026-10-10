# DSH PDF Reader

A standalone DeepSeek Harness plugin for reading PDFs in DSH Desktop. No desktop shell modifications, npm runtime dependencies, background indexing or model downloads.

## What it does

| Tool | Purpose |
| --- | --- |
| `pdf_status` | Check Poppler, Tesseract and installed OCR languages. |
| `pdf_inspect` | Page count, page-level text availability, scan warnings and coverage. |
| `pdf_read` | Read page ranges, preserve table spacing, selectively OCR scans, and report truncation. |
| `pdf_search` | Literal search of embedded text with page references and explicit scan coverage gaps. |
| `pdf_render` | Send a whole page or magnified crop as a real Harness image attachment. |

Attach a PDF normally and ask:

> Use the PDF tools to read this document. Inspect its pages first, OCR scanned pages in English and Chinese, and inspect relevant figures. Explain the findings with PDF page references. Tell me which pages or regions you could not read.

For a specific table:

> Read PDF page 6 with layout preserved, then render a crop of the table and check the numbers against the text. Cite the page.

The plugin adds a short reading workflow to the agent's system prompt. The current agent preset must allow these tools. If a restricted preset hides them, use a preset that permits plugin tools.

## Compatibility

This is a **Harness host plugin**, with no dependency on Tauri, Electron internals, or a custom desktop fork. It uses the official tool registry, filesystem, system-prompt and attachment services.

| Host | Status |
| --- | --- |
| DSH Tauri Desktop on Linux, Harness `0.2.0-rc.2` | Installed, enabled and observed running; integration and OCR tests passed. |
| Native macOS plugin execution | The 0.1.1 packed plugin passed all 22 integration tests with Node 24, Poppler and Tesseract in GitHub Actions. |
| Official DeepSeek Harness Desktop | Uses the same plugin mechanism. The official source reviewed on 2026-10-02 is also `0.2.0-rc.2`. Compatibility is expected when the required services and native dependencies are present; the packaged official desktop has not been tested here. |
| Other Harness versions or Windows | Not yet validated. |

The official desktop is described in [DeepSeek's desktop documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md). Its runtime follows the desktop release, so check the installed version rather than assuming every desktop contains the latest runtime. The consumer DeepSeek chat website/app is a separate product and does not load this Harness plugin.

Poppler and Tesseract are external native programs: this package does not bundle them. Install versions matching the host OS and architecture. GUI applications may have a different PATH from your terminal; configure absolute paths if `pdf_status` reports missing tools. On Apple Silicon Homebrew commonly installs binaries under `/opt/homebrew/bin`; on Intel Macs under `/usr/local/bin`. Windows requires its own native executables and OCR language data; the Linux OCR wrapper is not portable.

## Installation

Requires Node 22.19+ or 24+ and DeepSeek Harness `0.2.0-rc.2` or newer with the tool output, filesystem and attachment interfaces. The package declares this Harness floor so plugin managers can check it before installation. Tested against Harness `0.2.0-rc.2` on Linux. The packaged official desktop GUI and Windows execution have not been tested.

Download `dsh-pdf-reader-0.1.3.tgz` from the [GitHub release](https://github.com/SkanderBog/dsh-pdf-reader/releases/tag/v0.1.3). Use the desktop's Plugins page to install the archive and enable **dsh-pdf-reader**. The package is not published to npm.

For the official desktop, prefer its Plugins page. If using the command installed by the official desktop, launch the desktop once to initialize its profile, fully quit it, then run:

```sh
dsh plugin --profile desktop add /absolute/path/dsh-pdf-reader-0.1.3.tgz
```

Reopen the desktop after the command finishes. Do not use `desktop` as the profile for a community shell unless that shell actually owns that profile. Restart the Harness core if its profile does not use hot reload.

For a named CLI profile:

```sh
dsh plugin --profile YOUR_PROFILE add /absolute/path/dsh-pdf-reader-0.1.3.tgz
```

Use the profile that the desktop actually runs; its name is not necessarily `web` or `desktop`. Package installation and bundle activation are managed by Harness. Do not copy tool code into the model provider or edit the desktop's generated frontend.

To disable or uninstall, use that same plugin manager. Disabling removes the tools and workflow; in-memory coverage and temporary working PDFs are discarded. Generated image attachments already in a conversation remain managed by Harness.

## Store compatibility and permissions

`engines.dsh` is the host's version gate. DSH STORE separately reads `dsh.compatibility.dsh`, `dshReleases` and `dshOperations`; the manifest declares both formats. Exact supported releases are `0.2.0-rc.2` and `0.2.1-alpha.1`; `0.2.1-alpha.2` is initially marked unknown until its new CI lane passes. The compatibility matrix describes tested host APIs, not every desktop GUI or OS. Installation/start/uninstall have separate disposable CLI-profile evidence for `0.2.0-rc.2`; update rollback remains unknown.

| Capability | Scope and boundary |
| --- | --- |
| Source files | Read through the mounted Harness filesystem service; access is checked on each invocation. Source PDFs are never modified. |
| Local writes | Private OS temporary document/OCR files; rendered images are stored through the host attachment service. Unload removes working copies; a hard crash may leave OS temporary files. |
| Commands | Poppler and Tesseract only, using fixed argument arrays with `shell: false`, cancellation, deadlines and output limits. An administrator may configure absolute executable paths; those binaries must be trusted. |
| Network | No direct plugin network requests. Harness may send returned PDF text/images to the conversation's selected model provider. |
| Environment / credentials | Native subprocesses receive an explicit runtime-path/font/OCR allowlist rather than the full host environment. API keys, tokens, proxy authentication and injection variables such as `NODE_OPTIONS`/`LD_PRELOAD` are not forwarded. The plugin does not request a credential service or read credential files. This is not an OS sandbox: configured executables still run with the user's file permissions. |
| External dependencies | OS-installed Poppler; optional Tesseract with the requested language data. No runtime npm dependencies, lifecycle installation scripts, automatic downloads or bundled native executables. |

See [the store review evidence](validation/STORE-1336.md) for the exact scanner findings, reproduction commands and remaining admission boundary. File/command access is essential to a local PDF processor, so it is not eligible for the store's automatic no-capability approval policy. These declarations do not grant store approval or independent security certification.

## Native dependencies

Poppler supplies `pdfinfo`, `pdftotext`, `pdfimages` and `pdftoppm`. Tesseract is needed for local OCR; image rendering and selectable text do not require it.

Ubuntu/Debian:

```sh
sudo apt install poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim
```

macOS (native tools tested in CI; packaged desktop GUI not validated here):

```sh
brew install poppler tesseract tesseract-lang
```

Each binary can be configured with an absolute executable path in the plugin's Cordis `config`, for example `tesseract: /absolute/path/tesseract`. Default names resolve through the desktop process's PATH. A user-local Tesseract wrapper at `~/.local/share/dsh-pdf-reader/tesseract` is detected automatically. That optional runtime is installed separately; it is not bundled into the npm package.

The OCR language defaults to `eng`. Ask the agent to pass `language: "eng+chi_sim"` for English and Simplified Chinese. `pdf_status` lists languages actually installed. Other languages need their matching Tesseract data.

## Design and limits

- Source bytes are read through the mounted Harness filesystem provider, with the calling session's working directory. Access is rechecked on every tool call, even for cached documents. Source files are never modified.
- Parsing and OCR run locally in temporary working copies using fixed executable arguments, no shell interpolation. The plugin itself makes no network calls. Extracted text and rendered images are subsequently sent to the conversation's configured model provider by Harness as normal tool results.
- The subprocess wrapper enforces deadlines, output limits, cancellation, and one OCR thread. The child environment retains only runtime path, font and OCR settings (see `nativeEnvironment` in `src/process.mjs`). Custom wrappers that depend on other environment variables must set those values in the trusted wrapper itself. Tool processing is serialized to limit RAM use. At most four documents are cached; unloading the plugin cleans up its temporary copies. Failed or cancelled page renders remove any partially written PNG before returning. A hard process crash can leave OS temporary files behind.
- Limits: 64 MiB per PDF, 2,000 pages, 100 inspection records and 10 read pages per call, 60,000 returned text characters per read. Long text and inspection ranges have explicit continuation fields. Huge documents should be split.
- Rendered regions have a 600–2,400 pixel long edge. Crops use `[left, top, right, bottom]` fractions of the displayed, rotation-adjusted page, measured from its top-left corner. Tiny crops that require excessive rasterization are refused.
- `pdf_render` checks the **current routed model's** image capability. A text-only or unknown route is refused explicitly. OCR text works with either text-only or vision models. This plugin does not automatically send a document to a second model or choose a different provider.
- Automatic OCR triggers when a page has little embedded text or Poppler detects embedded images, including mixed text/scanned pages. Selectable text is preserved and a separately labeled full-page OCR reading is appended; duplicate or conflicting readings are not independent evidence. Logos and scans with an existing text layer can trigger extra work. Image detection does not cover vector outlines; use `ocr: "force"` for suspect pages. Missing dependencies are reported explicitly; empty OCR output never erases selectable text. `ocr: "off"` bypasses image detection and OCR.
- Search processes at most 100 pages per extraction batch, compiling the literal query once. It still scans the entire requested range and reports the full match count even when the returned snippets reach their limit. Each batch retains the native output limit; unusually dense pages may still require a narrower range. Search covers embedded text only, with explicit sparse-page warnings; scanned regions and OCR output are not searched. Search hits never establish whole-document coverage.
- Coverage describes complete text and page images returned by these tools in the current cache lifetime, not model comprehension or proof of visual inspection. A crop covers only its selected region. Restart and cache eviction reset coverage.
- Physical PDF page numbers are one-based and may differ from printed page labels. Returned citations include the filename, physical page and original source path.
- Layout extraction and OCR are fallible. Tables remain text with approximate spacing, not guaranteed cell-accurate data. Math recognition, handwriting, ambiguous reading order and chart interpretation still require verification. Password-protected documents need an unlocked copy.

## Verification

The 2026-10-08 compatibility audit exercised this checkout alongside Context Manager, Rewind `0.15.0`, Better Sidebar `0.24.1` and DSH Market `1.66.6` in an isolated Harness `0.2.0-rc.2` host. Text extraction and image attachments worked through the shared tool registry; disabling the two audited plugins preserved the other plugins' registrations. Market coverage was limited to route registration and its read-only capabilities endpoint. The companion Context Manager repository contains the reproducible `test:installed` harness. Desktop `0.22.4` pins these same host APIs; its packaged GUI and all bundled desktop features were not exercised by this test.

The search regression uses a real 201-page PDF through Poppler with a guarded converter that rejects oversized extraction batches. It verifies matches and sparse pages across batch boundaries, a non-first-page range, and exact total counts after the snippet limit. The current packed suite contains 30 tests.

The source includes synthetic prose/table, scanned, mixed text/image and rotated PDF fixtures and tests against the real Cordis tool registry, filesystem and attachment store. The model capability lookup is controlled in these integration tests; no paid model calls are made.

Install the native dependencies above, then install the pinned test-only npm dependencies:

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
```

Contained page reads reuse the most recent text/image inspection batch without launching another converter. The existing single-batch memory bounds, source fingerprint checks and filesystem permission checks remain in place. Layout and normal text are cached separately by mode.

The package check creates a tarball, checks its exact file list, and runs the integration suite against the unpacked package. `npm test` runs against source. To test an existing Harness installation instead, set `DSH_RUNTIME` to that installation's package root. GitHub Actions runs the package suite on Linux with Node 22 and 24, and on macOS with Node 24. Additional Linux Node 24 lanes test Harness `0.2.1-alpha.1` and `0.2.1-alpha.2`; the default dependency set remains `0.2.0-rc.2`. An OS test run checks the plugin and native tools, not a packaged desktop GUI.

Tests use a fresh temporary Harness home and never modify the user's conversations or credentials. They follow the plugin's normal Tesseract discovery (`~/.local/share/dsh-pdf-reader/tesseract`, then `PATH`) unless `DSH_PDF_TEST_TESSERACT` selects an absolute executable path. The English and Simplified Chinese data must both be installed.

For the real CLI lifecycle check, use a separately installed exact Harness version (not a desktop shell shim):

```sh
DSH_CLI=/absolute/path/node_modules/@deepseek-ai/dsh/lib/bin.js npm run test:profile
```

It packs this checkout, creates a new temporary `DSH_HOME`, uses the official plugin add/remove commands, boots a minimal profile with real host services, checks tool visibility and text extraction, then verifies uninstall and removes its test home. It never writes a normal DSH profile and does not require model credentials. A valid installation of pnpm and Poppler must be available. `DSH_PROFILE_EVIDENCE=/absolute/path/report.json` saves the bounded result.

This establishes document-processing behavior, not an end-to-end model accuracy benchmark. To measure model gains, hold model, prompts and decoding settings fixed and compare existing attachment handling, these tools, and manually verified evidence on the same PDFs. Use `evaluation.json` in the source directory as the starting rubric.
