import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { host } from './runtime.mjs'

const file = 'research-sample.pdf'
const binaries = { pdfinfo: 'pdfinfo', pdftotext: 'pdftotext', pdfimages: 'pdfimages', pdftoppm: 'pdftoppm' }

function value(result) {
  assert.equal(result.isError, false, JSON.stringify(result))
  return result.value
}

async function fakePdfinfo(t, body) {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-status-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'pdfinfo')
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return { directory, path }
}

test('pdf_status caches dependency probes and reports cache hits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-status-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const marker = join(directory, 'calls')
  const fake = await fakePdfinfo(t, `printf x >> ${JSON.stringify(marker)}\nexec pdfinfo "$@"`)
  const h = await host({ ...binaries, pdfinfo: fake.path, statusCacheMs: 60000 })
  t.after(() => h.close())

  const first = value(await h.call('pdf_status', {}))
  assert.equal(first.cached, false)
  const second = value(await h.call('pdf_status', {}))
  assert.equal(second.cached, true)
  assert.equal(second.checked_at, first.checked_at)
  assert.equal(await readFile(marker, 'utf8'), 'x')
})

test('statusCacheMs 0 disables the dependency probe cache', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-status-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const marker = join(directory, 'calls')
  const fake = await fakePdfinfo(t, `printf x >> ${JSON.stringify(marker)}\nexec pdfinfo "$@"`)
  const h = await host({ ...binaries, pdfinfo: fake.path, statusCacheMs: 0 })
  t.after(() => h.close())

  const first = value(await h.call('pdf_status', {}))
  const second = value(await h.call('pdf_status', {}))
  assert.equal(first.cached, false)
  assert.equal(second.cached, false)
  assert.equal((await readFile(marker, 'utf8')).length, 2)
})

test('pdf_status answers while a document read is blocked in a native probe', async t => {
  const fake = await fakePdfinfo(t, 'case "$1" in -v) exec pdfinfo "$@";; esac\nsleep 2\nexec pdfinfo "$@"')
  const h = await host({ ...binaries, pdfinfo: fake.path, statusCacheMs: 0 })
  t.after(() => h.close())

  let settled = false
  const read = h.call('pdf_read', { file_path: file, first_page: 1, ocr: 'off' })
  read.then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setTimeout(resolve, 250))
  const started = Date.now()
  const status = value(await h.call('pdf_status', {}))
  const elapsed = Date.now() - started
  assert.equal(settled, false, 'pdf_read finished before pdf_status was attempted')
  assert.ok(elapsed < 1200, `pdf_status waited ${elapsed}ms behind pdf_read`)
  assert.equal(status.tools.pdfinfo.available, true)
  const result = value(await read)
  assert.equal(result.total_pages, 3)
})

test('unload aborts and waits for an off-queue status probe', async t => {
  const fake = await fakePdfinfo(t, 'sleep 5\nexec pdfinfo "$@"')
  const h = await host({ ...binaries, pdfinfo: fake.path, statusCacheMs: 0 })
  const status = h.call('pdf_status', {})
  await new Promise(resolve => setTimeout(resolve, 250))
  const started = Date.now()
  await h.close()
  const elapsed = Date.now() - started
  const result = await status
  assert.equal(result.isError, true)
  assert.match(JSON.stringify(result), /PDF_PLUGIN_UNLOADED/)
  assert.ok(elapsed < 2000, `unload waited ${elapsed}ms for the status probe`)
})
