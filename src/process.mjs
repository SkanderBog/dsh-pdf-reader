import { spawn } from 'node:child_process'

// Native processors need runtime paths and font/OCR configuration, not the host's
// API keys, proxy authentication, Git tokens, or arbitrary injection variables.
const NATIVE_ENV = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'SYSTEMROOT', 'WINDIR',
  'TEMP', 'TMP', 'TMPDIR', 'TESSDATA_PREFIX', 'FONTCONFIG_FILE', 'FONTCONFIG_PATH',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
])
export function nativeEnvironment(source = process.env) {
  const env = {}
  for (const key of Object.keys(source)) {
    if (!NATIVE_ENV.has(key.toUpperCase())) continue
    const value = source[key]
    if (typeof value === 'string') env[key] = value
  }
  return { ...env, LC_ALL: 'C', OMP_THREAD_LIMIT: '1' }
}

export function run(executable, args, { signal, maxBytes = 16 * 1024 * 1024, timeout = 30000 } = {}) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: nativeEnvironment(),
    })
    const chunks = []
    let size = 0
    let stderr = ''
    let failure
    function stop(error) {
      failure ??= error
      child.kill('SIGKILL')
    }
    function abort() { stop(signal.reason ?? new Error('PDF_CANCELLED')) }
    const timer = setTimeout(() => stop(new Error('PDF_TIMEOUT: document processing exceeded its time limit')), timeout)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) stop(new Error('PDF_OUTPUT_LIMIT: split the document or request fewer pages'))
      else chunks.push(chunk)
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    child.on('error', error => {
      failure ??= error.code === 'ENOENT'
        ? new Error(`PDF_DEPENDENCY_MISSING: ${executable}; install Poppler for PDFs and Tesseract with language data for OCR`)
        : error
    })
    child.on('close', code => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (code !== 0) reject(new Error(`PDF_PROCESS_FAILED: ${executable} (${code}): ${stderr.trim()}`))
      else resolve(Buffer.concat(chunks))
    })
  })
}
