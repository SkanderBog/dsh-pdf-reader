import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const entry = process.env.DSH_PDF_PLUGIN_ENTRY
  ? pathToFileURL(resolve(process.env.DSH_PDF_PLUGIN_ENTRY))
  : new URL('../src/index.mjs', import.meta.url)
const { openDocument, extract, embeddedImages, render } = await import(new URL('./document.mjs', entry))
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

test('switching pages and layout modes preserves reusable extraction and image counts', async t => {
  const doc = await document(t)
  const normal = await extract(doc, 1, 1, false, binaries)
  const layout = await extract(doc, 1, 1, true, binaries)
  const third = await extract(doc, 3, 3, false, binaries)
  const images = await embeddedImages(doc, 1, 1, binaries)
  await embeddedImages(doc, 3, 3, binaries)
  const unavailable = { pdftotext: 'missing-pdf-cache-test-command', pdfimages: 'missing-pdf-cache-test-command' }
  assert.deepEqual(await extract(doc, 1, 1, false, unavailable), normal)
  assert.deepEqual(await extract(doc, 1, 1, true, unavailable), layout)
  assert.deepEqual(await extract(doc, 3, 3, false, unavailable), third)
  assert.deepEqual(await embeddedImages(doc, 1, 1, unavailable), images)
})

test('overlapping reads extract only missing pages and preserve empty scanned pages', async t => {
  const doc = await document(t)
  const first = await extract(doc, 1, 2, false, binaries)
  const converter = join(doc.directory, 'missing-pages-only.mjs')
  await writeFile(converter, `#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
const args = process.argv.slice(2)
if (args[args.indexOf('-f') + 1] !== '3' || args[args.indexOf('-l') + 1] !== '3') process.exit(1)
process.stdout.write(execFileSync('pdftotext', args))
`, { mode: 0o700 })
  const combined = await extract(doc, 1, 3, false, { ...binaries, pdftotext: converter })
  assert.deepEqual(combined.slice(0, 2), first)
  assert.equal(combined[1].trim(), '')
  assert.match(combined[2], /./)
})

test('text cache evicts least recently used pages within its character budget', async t => {
  const doc = await document(t)
  const converter = join(doc.directory, 'dense-pages.mjs')
  await writeFile(converter, `#!/usr/bin/env node
const args = process.argv.slice(2)
for (let page = Number(args[args.indexOf('-f') + 1]); page <= Number(args[args.indexOf('-l') + 1]); page++)
  process.stdout.write(String(page).repeat(2 * 1024 * 1024) + String.fromCharCode(12))
`, { mode: 0o700 })
  const dense = { ...binaries, pdftotext: converter }
  await extract(doc, 1, 2, false, dense)
  await extract(doc, 1, 1, false, dense) // Keep page 1 hot; page 2 should be evicted next.
  await extract(doc, 3, 3, false, dense)
  const unavailable = { ...binaries, pdftotext: 'missing-pdf-cache-test-command' }
  assert.equal((await extract(doc, 1, 1, false, unavailable))[0].length, 2 * 1024 * 1024)
  assert.equal((await extract(doc, 3, 3, false, unavailable))[0][0], '3')
  await assert.rejects(extract(doc, 2, 2, false, unavailable), /PDF_DEPENDENCY_MISSING/)
})


test('failed rendering removes partially written page images before returning', async t => {
  const doc = await document(t)
  const failingRenderer = join(doc.directory, 'failing-renderer.mjs')
  await writeFile(failingRenderer, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
writeFileSync(process.argv.at(-1) + '.png', 'partial private page image')
process.exit(1)
`, { mode: 0o700 })
  await assert.rejects(render(doc, 1, undefined, 600, { ...binaries, pdftoppm: failingRenderer }), /PDF_PROCESS_FAILED/)
  await assert.rejects(access(join(doc.directory, 'page.png')), { code: 'ENOENT' })
  const image = await render(doc, 1, undefined, 600, { ...binaries, pdftoppm: 'pdftoppm' })
  assert(image.data.length > 0)
  await assert.rejects(access(join(doc.directory, 'page.png')), { code: 'ENOENT' })
})
