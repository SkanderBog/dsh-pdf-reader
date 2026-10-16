# DSH STORE #1336 — source remediation and evidence

Issue: https://github.com/AI-Scarlett/DSH-Store/issues/1336

## Follow-up to the 2026-10-15 maintainer review

The [maintainer's fixed-source review](https://github.com/AI-Scarlett/DSH-Store/issues/1336#issuecomment-6195604593) read commit `8b91187472ede1eb4b02ac4d03b86dad530cc2df`, recognized the subprocess argument, timeout, output and cleanup controls, and kept admission **blocked**. The unresolved issue is the trust boundary around native executable sources, configured paths and shared-library loading. It is not a request to repeat the existing controls, nor a claim that an environment-variable reference proves API-key access.

The current follow-up removes inherited `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH` and `DYLD_FALLBACK_LIBRARY_PATH`. The regression checks both the allowlist result and an actual spawned child's environment. A custom wrapper can still explicitly set its own library path; the plugin does not sandbox that wrapper or authenticate its contents. `PATH`, home, font and OCR settings remain compatibility inputs and need review alongside the executable.

Reproduce the inventory from the exact commit under review, using the same environment and executable configuration as the DSH process:

```sh
git rev-parse HEAD
git status --short
node scripts/native-evidence.mjs > ../native-evidence.json
# With explicit Cordis binary paths, pass the identical values, for example:
node scripts/native-evidence.mjs --pdfinfo /usr/bin/pdfinfo --pdftotext /usr/bin/pdftotext --pdfimages /usr/bin/pdfimages --pdftoppm /usr/bin/pdftoppm --tesseract /absolute/path/to/reviewed/tesseract > ../native-evidence-explicit.json
```

The JSON binds its source-file hashes and collector hash to the Git commit and dirty-tree status, and reports requested/resolved/real executable paths, executable hashes, version-probe arguments/results, and forwarded environment **names**. It hashes before and after each probe to flag a changed file; that is not protection against all filesystem races. Missing tools or failed probes cause a nonzero exit while retaining the partial report. The collector deliberately skips relative/empty PATH directories; runtime name resolution remains unchanged. Explicit paths affect this inventory only, not the installed plugin's configuration.

For each resolved native file, record the OS package owner/version and trusted distribution source, or independently review the custom installation. A wrapper hash does not identify its child executable, private libraries, font files or trained OCR data: review and hash those separately. Do not treat a successful `--version` or a package database entry alone as publisher authentication. Version probes execute the selected programs with the same filtered native environment; inspect unknown programs before probing.

Local verification on 2026-10-16 found two Poppler wrappers ahead of `/usr/bin` in the agent environment. Their version was 26.05.0, while `/usr/bin/pdftotext` and `/usr/bin/pdfimages` reported 26.01.0 (OS package `poppler-utils` 26.01.0-2ubuntu0.2). The separately installed Tesseract wrapper reported 5.5.0 and sets its own fixed private-library and OCR-data paths. This illustrates why the terminal's apparent package version is insufficient evidence for a desktop process. These observations do not independently establish native supply-chain trust.

This follow-up does not change Store admission, declare an independent security audit, broaden compatibility, or claim native sandboxing. The historical evidence below describes earlier snapshots; use the exact-head checks and current inventory when assessing this follow-up.

## What was confirmed

The store had already scanned source `e39262a3222f4932cb7d5f226e1f94100548e866`; this was not merely a stale pre-compatibility scan. Its `inferredCompatibility()` in `scripts/check-plugin-submission.mjs` reads `dsh.compatibility.dsh` or a unique official peer range. It does not read `engines.dsh`. Version 0.1.2 supplies both, plus exact release and separately bounded operation declarations.

The other findings are expected capability signals. `src/automation-source-policy.mjs` flags filesystem APIs, child processes and every use of `process.env` as files, commands and credentials respectively. Reading a PDF, writing a temporary copy and running local Poppler/Tesseract legitimately require the first two. Previously the subprocess inherited the entire environment; 0.1.2 narrows this to explicitly allowed runtime, font and OCR variables. The [bounded source-policy report](store-source-policy.json) confirms a complete scan with only these three capability signals remaining. The environment signal remains present and is disclosed; it has not been obfuscated or bypassed.

The shipped source does not make network requests, modify DSH or official packages, access a credentials service, or accept a model-provided executable/shell command. An administrator-configured executable remains trusted native code running with the user's OS permissions. Text/images returned as tool results may be transmitted by Harness to the selected model provider. PDF processing itself is local.

## Evidence and reproduction

- `npm run check`: runtime syntax checks.
- `npm run test:package`: 29 passing tests against the unpacked seven-file tarball, including actual Poppler/Tesseract extraction, OCR, images, cancellation, bounds, filesystem denial, cache invalidation, and environment filtering. No paid model calls.
- `DSH_CLI=/absolute/path/node_modules/@deepseek-ai/dsh/lib/bin.js npm run test:profile`: official CLI install, successful profile startup, discovery of all five PDF tools and prompt guidance, extraction of synthetic code `ORCHID-739`, official CLI uninstall, and another successful startup proving tools and guidance are absent.
- [Measured Linux CLI result](store-profile-0.2.0-rc.2.json): Harness 0.2.0-rc.2, Node 22.23.2. A fresh temporary home/profile was created and removed; no real profile or conversation was changed. Uninstall is not claimed as update rollback.
- The GitHub Actions package matrix covers Linux Node 22/24 and macOS Node 24 on 0.2.0-rc.2, and Linux Node 24 on 0.2.1-alpha.1. Check the run bound to the exact source commit before treating a CI result as current evidence. The matrix tests runtime packages, not each OS's packaged desktop GUI.

## Current store-side decision

The October 15 review keeps this fixed source blocked because the native executable and library-loading trust boundary has not been independently confirmed. Filesystem, subprocess and environment capabilities remain disclosed; removing or hiding their static signals is not the objective. Any `user-reviewed` admission still requires a Store maintainer decision. The existing blocked/external-only record must not be silently relabeled source-verified.

Maintainers can inspect the exact source, reproduce the native inventory and lifecycle evidence, and decide whether the native dependency provenance is sufficient. An automated source recheck does not itself constitute that independent acceptance. No independent security audit, Windows execution, packaged-desktop GUI acceptance or update rollback is claimed.
