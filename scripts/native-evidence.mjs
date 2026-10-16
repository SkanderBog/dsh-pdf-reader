// Local author evidence only. Version probes execute the selected native tools.
import { createHash } from 'node:crypto'
import { createReadStream, constants, existsSync } from 'node:fs'
import { access, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { nativeEnvironment } from '../src/process.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const names = ['pdfinfo', 'pdftotext', 'pdfimages', 'pdftoppm', 'tesseract']
const config = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '')
  const value = process.argv[i + 1]
  if (!names.includes(key) || !value || (!isAbsolute(value) && value !== key)) {
    throw new Error('Usage: node scripts/native-evidence.mjs [--pdfinfo /absolute/path] [--pdftotext /absolute/path] [--pdfimages /absolute/path] [--pdftoppm /absolute/path] [--tesseract /absolute/path]')
  }
  config[key] = value
}
async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const env = nativeEnvironment()
async function locate(requested) {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH')
  // Require absolute PATH directories so a report never silently probes a
  // workspace executable. Explicit absolute paths support custom wrappers.
  const candidates = isAbsolute(requested) ? [requested] : (env[pathKey] ?? '').split(delimiter)
    .filter(isAbsolute).flatMap(dir => process.platform === 'win32'
      ? [join(dir, `${requested}.exe`), join(dir, requested)] : [join(dir, requested)])
  for (const path of candidates) {
    try {
      if (!(await stat(path)).isFile()) continue
      await access(path, constants.X_OK)
      return { path, realpath: await realpath(path) }
    } catch { /* Try the next explicit search directory. */ }
  }
  throw new Error('No executable in the absolute PATH directories; supply its absolute path explicitly')
}
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const sourceFiles = ['package.json', 'cordis.patch.yml', 'src/index.mjs', 'src/document.mjs', 'src/process.mjs', 'scripts/native-evidence.mjs']
const sourceSha256 = {}
for (const file of sourceFiles) sourceSha256[file] = await sha256(join(root, file))
const git = (...args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 })
  return result.status === 0 ? result.stdout.trim() : null
}
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  plugin: { name: manifest.name, version: manifest.version, commit: git('rev-parse', 'HEAD'), workingTree: git('status', '--porcelain'), sourceSha256 },
  host: { platform: process.platform, arch: process.arch, node: process.version },
  environment: {
    forwardedNames: Object.keys(env).sort(),
    valuesRecorded: false,
    librarySearchOverridesForwarded: ['LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'DYLD_FALLBACK_LIBRARY_PATH'].filter(key => Object.hasOwn(env, key)),
  },
  tools: {},
  limitations: [
    'Version probes execute the selected tools with the plugin environment; review their source first.',
    'Paths and hashes identify local files, not their publisher or authenticity.',
    'Wrappers may select other executables and libraries; these and font/OCR data need separate provenance review.',
    'Absolute PATH entries only are inspected; this does not harden or pin runtime PATH resolution.',
    'This is author evidence, not an independent security audit or Store acceptance.',
  ],
}
const localOcr = join(homedir(), '.local/share/dsh-pdf-reader/tesseract')
for (const key of names) {
  const requested = config[key] ?? (key === 'tesseract' && existsSync(localOcr) ? localOcr : key)
  try {
    const executable = await locate(requested)
    const before = await sha256(executable.realpath)
    const args = [key === 'tesseract' ? '--version' : '-v']
    const result = spawnSync(executable.path, args, { env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] })
    const after = await sha256(executable.realpath)
    const unchanged = before === after && await realpath(executable.path) === executable.realpath
    report.tools[key] = { requested, ...executable, sha256: before, unchangedDuringProbe: unchanged, args, exitCode: result.status, signal: result.signal, version: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(), error: result.error?.message ?? null }
    if (result.status !== 0 || !unchanged) process.exitCode = 1
  } catch (error) {
    report.tools[key] = { requested, error: error.message }
    process.exitCode = 1
  }
}
console.log(JSON.stringify(report, null, 2))
