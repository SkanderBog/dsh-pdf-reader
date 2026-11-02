import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const entry = process.env.DSH_PDF_PLUGIN_ENTRY
  ? new URL('./process.mjs', pathToFileURL(resolve(process.env.DSH_PDF_PLUGIN_ENTRY)))
  : new URL('../src/process.mjs', import.meta.url)
const { nativeEnvironment, run } = await import(entry)

test('native processor environment preserves runtime paths but drops credentials and code injection', () => {
  const allowed = { Path: 'C:\\tools', SystemRoot: 'C:\\Windows', TESSDATA_PREFIX: '/ocr/data', TMPDIR: '/tmp/pdf' }
  const env = nativeEnvironment({ ...allowed, DEEPSEEK_API_KEY: 'synthetic-key', GITHUB_TOKEN: 'synthetic-token', HTTPS_PROXY: 'synthetic-proxy', NODE_OPTIONS: '--require=/untrusted.js', LD_PRELOAD: '/untrusted.so', LD_LIBRARY_PATH: '/untrusted/lib', DYLD_LIBRARY_PATH: '/untrusted/lib', DYLD_FALLBACK_LIBRARY_PATH: '/untrusted/fallback', DYLD_INSERT_LIBRARIES: '/untrusted.dylib', DSH_HOME: '/private-profile', OMP_THREAD_LIMIT: '64', LC_ALL: 'other' })
  assert.deepEqual(env, { ...allowed, LC_ALL: 'C', OMP_THREAD_LIMIT: '1' })
})
test('native children do not inherit dynamic library search overrides', async () => {
  const keys = ['LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'DYLD_FALLBACK_LIBRARY_PATH']
  const previous = new Map(keys.map(key => [key, process.env[key]]))
  try {
    for (const key of keys) process.env[key] = '/synthetic-untrusted-library-path'
    const result = JSON.parse((await run(process.execPath, ['-e', `console.log(JSON.stringify(${JSON.stringify(keys)}.filter(key => Object.hasOwn(process.env, key))))`])).toString())
    assert.deepEqual(result, [])
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
test('spawned processes receive the filtered environment and fixed thread limit', async () => {
  // Add only a synthetic marker; never print the parent environment.
  process.env.DSH_PDF_TEST_PRIVATE_MARKER = 'synthetic-secret'
  try {
    const result = JSON.parse((await run(process.execPath, ['-e', 'console.log(JSON.stringify({hasMarker:Object.hasOwn(process.env,"DSH_PDF_TEST_PRIVATE_MARKER"),threads:process.env.OMP_THREAD_LIMIT,locale:process.env.LC_ALL,path:!!(process.env.PATH||process.env.Path)}))'])).toString())
    assert.deepEqual(result, {hasMarker:false,threads:'1',locale:'C',path:true})
  } finally { delete process.env.DSH_PDF_TEST_PRIVATE_MARKER }
})

test('timeouts terminate wrapper descendants instead of waiting for inherited pipes', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-process-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const completed = join(directory, 'descendant-completed')
  const script = `require('node:fs').writeFileSync(${JSON.stringify(completed)}, 'still running')`
  const descendant = `setTimeout(() => { ${script} }, 1500)`
  const started = Date.now()
  await assert.rejects(run(process.execPath, ['-e', `
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' })
    setInterval(() => {}, 1000)
  `], { timeout: 300 }), /PDF_TIMEOUT/)
  assert.ok(Date.now() - started < 1200, 'timeout must not wait for the wrapped processor to finish')
  await new Promise(resolve => setTimeout(resolve, 1600))
  await assert.rejects(readFile(completed), { code: 'ENOENT' })
})

test('cancellation and output limits reject promptly while child pipes are inherited', async () => {
  for (const cause of ['cancel', 'limit']) {
    const control = new AbortController()
    const timer = cause === 'cancel' ? setTimeout(() => control.abort(new Error('cancel processor')), 200) : undefined
    try {
      const started = Date.now()
      await assert.rejects(run(process.execPath, ['-e', `
        require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { stdio: 'inherit' })
        ${cause === 'limit' ? 'process.stdout.write("x".repeat(1024))' : ''}
        setInterval(() => {}, 1000)
      `], { signal: control.signal, maxBytes: 128 }), cause === 'cancel' ? /cancel processor/ : /PDF_OUTPUT_LIMIT/)
      assert.ok(Date.now() - started < 1200, `${cause} must close inherited pipes promptly`)
    } finally { clearTimeout(timer) }
  }
})
