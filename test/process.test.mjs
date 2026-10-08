import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const entry = process.env.DSH_PDF_PLUGIN_ENTRY
  ? new URL('./process.mjs', pathToFileURL(resolve(process.env.DSH_PDF_PLUGIN_ENTRY)))
  : new URL('../src/process.mjs', import.meta.url)
const { nativeEnvironment, run } = await import(entry)

test('native processor environment preserves runtime paths but drops credentials and code injection', () => {
  const allowed = { Path: 'C:\\tools', SystemRoot: 'C:\\Windows', TESSDATA_PREFIX: '/ocr/data', LD_LIBRARY_PATH: '/ocr/lib', TMPDIR: '/tmp/pdf' }
  const env = nativeEnvironment({ ...allowed, DEEPSEEK_API_KEY: 'synthetic-key', GITHUB_TOKEN: 'synthetic-token', HTTPS_PROXY: 'synthetic-proxy', NODE_OPTIONS: '--require=/untrusted.js', LD_PRELOAD: '/untrusted.so', DYLD_INSERT_LIBRARIES: '/untrusted.dylib', DSH_HOME: '/private-profile', OMP_THREAD_LIMIT: '64', LC_ALL: 'other' })
  assert.deepEqual(env, { ...allowed, LC_ALL: 'C', OMP_THREAD_LIMIT: '1' })
})
test('spawned processes receive the filtered environment and fixed thread limit', async () => {
  // Add only a synthetic marker; never print the parent environment.
  process.env.DSH_PDF_TEST_PRIVATE_MARKER = 'synthetic-secret'
  try {
    const result = JSON.parse((await run(process.execPath, ['-e', 'console.log(JSON.stringify({hasMarker:Object.hasOwn(process.env,"DSH_PDF_TEST_PRIVATE_MARKER"),threads:process.env.OMP_THREAD_LIMIT,locale:process.env.LC_ALL,path:!!(process.env.PATH||process.env.Path)}))'])).toString())
    assert.deepEqual(result, {hasMarker:false,threads:'1',locale:'C',path:true})
  } finally { delete process.env.DSH_PDF_TEST_PRIVATE_MARKER }
})
