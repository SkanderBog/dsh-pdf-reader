import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const entry = process.env.DSH_PDF_PLUGIN_ENTRY
  ? pathToFileURL(resolve(process.env.DSH_PDF_PLUGIN_ENTRY))
  : new URL('../src/index.mjs', import.meta.url)
const { openDocument, extract, embeddedImages } = await import(new URL('./document.mjs', entry))
const binaries = { pdfinfo: 'pdfinfo', pdftotext: 'pdftotext', pdfimages: 'pdfimages' }

async function document(t) {
  const doc = await openDocument(await readFile('test/fixtures/research-sample.pdf'), 'research-sample.pdf', binaries)
  t.after(() => doc.close())
  return doc
}

test('inspection text serves contained page reads without another converter process', async t => {
  const doc = await document(t)
  const pages = await extract(doc, 1, 2, false, binaries)
  assert.match(pages[0], /./)
  const unavailable = { ...binaries, pdftotext: 'missing-pdf-cache-test-command' }
  assert.deepEqual(await extract(doc, 1, 1, false, unavailable), [pages[0]])
  assert.deepEqual(await extract(doc, 2, 2, false, unavailable), [pages[1]])
  assert.deepEqual(await extract(doc, 1, 2, false, unavailable), pages)
  await assert.rejects(extract(doc, 1, 1, true, unavailable), /PDF_DEPENDENCY_MISSING/)
  await assert.rejects(extract(doc, 3, 3, false, unavailable), /PDF_DEPENDENCY_MISSING/)
})

test('image inspection serves contained page counts without relaunching pdfimages', async t => {
  const doc = await document(t)
  const counts = await embeddedImages(doc, 1, 2, binaries)
  assert.equal(counts[1], 1)
  const unavailable = { ...binaries, pdfimages: 'missing-pdf-cache-test-command' }
  assert.deepEqual(await embeddedImages(doc, 2, 2, unavailable), [1])
  assert.deepEqual(await embeddedImages(doc, 1, 1, unavailable), [counts[0]])
})

test('cached extraction and image inspection honor cancellation', async t => {
  const doc = await document(t)
  await extract(doc, 1, 2, false, binaries)
  await embeddedImages(doc, 1, 2, binaries)
  const signal = AbortSignal.abort(new Error('cancel cached read'))
  await assert.rejects(extract(doc, 1, 2, false, binaries, signal), /cancel cached read/)
  await assert.rejects(embeddedImages(doc, 1, 2, binaries, signal), /cancel cached read/)
})
