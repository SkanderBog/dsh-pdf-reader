# DSH STORE #1336 — source remediation and evidence

Issue: https://github.com/AI-Scarlett/DSH-Store/issues/1336

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

## Remaining store-side decision

The store's automatic policy permits no file, command or environment-access signals. This plugin cannot satisfy that policy while retaining local PDF/OCR processing. The documented `user-reviewed` category is the appropriate request for maintainer consideration, with the disclosed native dependencies and scoped capabilities; it is not a self-issued approval. The existing blocked/external-only record must not be silently relabeled source-verified.

Maintainers can independently reproduce the lifecycle evidence, classify the capabilities, and decide whether to admit the fixed source for per-install local review. The automated eight-hour source recheck can pick up the metadata fix but does not itself constitute that independent acceptance. No independent security audit, Windows execution, packaged-desktop GUI acceptance or update rollback is claimed.
