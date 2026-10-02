import { spawn } from 'node:child_process'

export function run(executable, args, { signal, maxBytes = 16 * 1024 * 1024, timeout = 30000 } = {}) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', OMP_THREAD_LIMIT: '1' },
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
