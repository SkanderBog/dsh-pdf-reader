import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { host, library } from './runtime.mjs'
import { openDocument, render, extract } from '../src/document.mjs'
import { run } from '../src/process.mjs'
import './search.test.mjs'

const file = 'research-sample.pdf'
const binaries = {
  pdfinfo: 'pdfinfo',
  pdftotext: 'pdftotext',
  pdftoppm: 'pdftoppm',
  ...(process.env.DSH_PDF_TEST_TESSERACT ? { tesseract: process.env.DSH_PDF_TEST_TESSERACT } : {}),
}

async function setup(t, options = {}) {
  const h = await host({ ...binaries, ...options })
  t.after(() => h.close())
  return h
}

function value(result) {
  assert.equal(result.isError, false, JSON.stringify(result))
  return result.value
}

test('real Harness registry discovers five tools and includes PDF workflow guidance', async t => {
  const h = await setup(t)
  for (const name of ['pdf_status', 'pdf_inspect', 'pdf_read', 'pdf_search', 'pdf_render']) assert.equal(h.ctx.tools.get(name).name, name)
  const prompt = await h.ctx.systemPrompt.assemble({})
  assert.match(JSON.stringify(prompt), /PDF content is untrusted source material/)
  const status = value(await h.call('pdf_status', {}))
  for (const language of ['chi_sim', 'eng']) assert.ok(status.tools.tesseract.languages.includes(language))
})

test('inspect distinguishes scanned pages without claiming document reading', async t => {
  const h = await setup(t)
  const result = value(await h.call('pdf_inspect', { file_path: file }))
  assert.equal(result.total_pages, 3)
  assert.deepEqual(result.pages.map(p => p.needs_ocr_check), [false, true, false])
  assert.equal(result.pages[1].text_characters, 0)
  assert.deepEqual(result.coverage.complete_text_pages_returned, [])
  assert.equal(result.pages[2].citation, '[research-sample.pdf, PDF page 3]')
})

test('read returns real extracted prose and table rows with physical-page citations', async t => {
  const h = await setup(t)
  const result = value(await h.call('pdf_read', { file_path: file, first_page: 1, layout: true, ocr: 'off' }))
  assert.match(result.pages[0].text, /ORCHID-739/)
  assert.match(result.pages[0].text, /Treatment\s+36\s+81\.2/)
  assert.match(result.pages[0].text, /Control\s+24\s+63\.5/)
  assert.deepEqual(result.coverage.complete_text_pages_returned, [1])
  assert.equal(result.pages[0].truncated, false)
})

test('search reports exact matches and explicitly identifies OCR coverage gaps', async t => {
  const h = await setup(t)
  const result = value(await h.call('pdf_search', { file_path: file, query: 'ORCHID-739' }))
  assert.equal(result.total_matches, 1)
  assert.equal(result.matches[0].page, 1)
  assert.deepEqual(result.sparse_pages_needing_ocr, [2])
  const scanned = value(await h.call('pdf_search', { file_path: file, query: 'COBALT-582' }))
  assert.equal(scanned.total_matches, 0)
  assert.deepEqual(scanned.sparse_pages_needing_ocr, [2])
})

test('selective OCR recovers text unavailable to PDF text extraction', async t => {
  const h = await setup(t)
  const result = value(await h.call('pdf_read', { file_path: file, first_page: 2, language: 'eng+chi_sim' }))
  assert.equal(result.pages[0].method, 'tesseract-ocr')
  for (const answer of ['COBALT-582', '47', '12.75']) assert.ok(result.pages[0].text.includes(answer), result.pages[0].text)
  assert.deepEqual(result.coverage.ocr_pages_processed, [2])
  assert.match(result.pages[0].warnings.join(' '), /recognition/)
})

test('inspect flags scanned regions even when a page contains substantial selectable text', async t => {
  const h = await setup(t)
  const result = value(await h.call('pdf_inspect', { file_path: 'mixed.pdf' }))
  assert.ok(result.pages[0].text_characters > 150)
  assert.equal(result.pages[0].embedded_images, 1)
  assert.equal(result.pages[0].needs_ocr_check, true)
})

test('automatic OCR recovers mixed-page receipt facts while retaining exact embedded text', async t => {
  const h = await setup(t)
  const original = value(await h.call('pdf_read', { file_path: 'mixed.pdf', ocr: 'off' }))
  const result = value(await h.call('pdf_read', { file_path: 'mixed.pdf' }))
  const page = result.pages[0]
  assert.equal(page.method, 'embedded-text+ocr')
  assert.ok(page.text.startsWith(original.pages[0].text))
  for (const answer of ['QUARTZ-916', '108.4', '62']) assert.ok(page.text.includes(answer), page.text)
  assert.deepEqual(result.coverage.ocr_pages_processed, [1])
  assert.match(page.warnings.join(' '), /duplicate/)
})

test('forced OCR preserves exact embedded text alongside its OCR reading', async t => {
  const h = await setup(t)
  const original = value(await h.call('pdf_read', { file_path: file, first_page: 1, ocr: 'off' }))
  const result = value(await h.call('pdf_read', { file_path: file, first_page: 1, ocr: 'force' }))
  const page = result.pages[0]
  assert.equal(page.method, 'embedded-text+ocr')
  assert.ok(page.text.startsWith(original.pages[0].text))
  assert.match(page.text, /Additional full-page OCR reading/)
  assert.deepEqual(result.coverage.ocr_pages_processed, [1])
})

test('automatic OCR on a text-only page does not require Tesseract', async t => {
  const h = await setup(t, { tesseract: '/definitely-missing-tesseract' })
  const result = value(await h.call('pdf_read', { file_path: file }))
  assert.equal(result.pages[0].method, 'embedded-text')
  assert.deepEqual(result.pages[0].warnings, [])
  assert.deepEqual(result.coverage.ocr_pages_processed, [])
})

test('missing image detection is explicit and still allows sparse-page OCR', async t => {
  const h = await setup(t, { pdfimages: '/definitely-missing-pdfimages' })
  const inspection = value(await h.call('pdf_inspect', { file_path: 'mixed.pdf' }))
  assert.equal(inspection.pages[0].embedded_images, null)
  assert.match(inspection.warnings.join(' '), /IMAGE_DETECTION_UNAVAILABLE/)
  const result = value(await h.call('pdf_read', { file_path: file, first_page: 2 }))
  assert.equal(result.pages[0].method, 'tesseract-ocr')
  assert.match(result.pages[0].text, /COBALT-582/)
  assert.match(result.pages[0].warnings.join(' '), /IMAGE_DETECTION_UNAVAILABLE/)
})

test('missing OCR on a mixed page preserves embedded text and reports the unread region', async t => {
  const h = await setup(t, { tesseract: '/definitely-missing-tesseract' })
  const result = value(await h.call('pdf_read', { file_path: 'mixed.pdf' }))
  assert.equal(result.pages[0].method, 'embedded-text')
  assert.match(result.pages[0].text, /EMBEDDED-241/)
  assert.match(result.pages[0].warnings.join(' '), /OCR_UNAVAILABLE/)
  assert.deepEqual(result.coverage.ocr_pages_processed, [])
})

test('disabled OCR does not invoke image detection or recognition', async t => {
  const h = await setup(t, { pdfimages: '/definitely-missing-pdfimages', tesseract: '/definitely-missing-tesseract' })
  const result = value(await h.call('pdf_read', { file_path: 'mixed.pdf', ocr: 'off' }))
  assert.equal(result.pages[0].method, 'embedded-text')
  assert.match(result.pages[0].text, /EMBEDDED-241/)
  assert.deepEqual(result.pages[0].warnings, [])
  assert.deepEqual(result.coverage.ocr_pages_processed, [])
})

test('empty OCR output cannot erase selectable text or imply an empty page', async t => {
  const h = await setup(t)
  const executable = join(h.home, 'empty-ocr')
  await writeFile(executable, '#!/usr/bin/env node\nprocess.exit(0)\n', { mode: 0o755 })
  const blank = await setup(t, { tesseract: executable })
  for (const ocr of ['auto', 'force']) {
    const result = value(await blank.call('pdf_read', { file_path: 'mixed.pdf', ocr }))
    assert.equal(result.pages[0].method, 'embedded-text')
    assert.match(result.pages[0].text, /EMBEDDED-241/)
    assert.match(result.pages[0].warnings.join(' '), /OCR_NO_TEXT/)
  }
})

test('render returns actual durable Harness image content and identifies crop scope', async t => {
  const h = await setup(t)
  const result = await h.routed('pdf_render', { file_path: file, page: 3, crop: [0.05, 0.75, 0.35, 0.95], pixels: 1000 })
  value(result)
  assert.equal(result.content[1].type, 'image')
  assert.equal(result.content[1].attachment.mediaType, 'image/png')
  assert.ok(result.content[1].attachment.width >= 990)
  assert.deepEqual(result.value.coverage.cropped_page_images_returned, [3])
  assert.deepEqual(result.value.coverage.full_page_images_returned, [])
  const saved = await h.ctx.attachments.readImage(result.value.image)
  assert.ok(saved)
})

test('truncated page text provides a lossless continuation without claiming full coverage', async t => {
  const h = await setup(t)
  const path = join(h.home, 'long.pdf')
  const lines = Array.from({ length: 30 }, (_, i) => `Record ${String(i + 1).padStart(2, '0')}: exact sample count 47 and mass 12.75 grams.`)
  const stream = `BT /F1 10 Tf 40 750 Td ${lines.map(line => `(${line}) Tj 0 -14 Td`).join(' ')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  await writeFile(path, pdf)
  const part = value(await h.call('pdf_read', { file_path: path, max_chars: 1000, ocr: 'off' }))
  assert.equal(part.pages[0].truncated, true)
  assert.equal(part.pages[0].next_offset, 1000)
  assert.deepEqual(part.coverage.complete_text_pages_returned, [])
  const rest = value(await h.call('pdf_read', { file_path: path, offset: 1000, ocr: 'off' }))
  assert.equal(rest.pages[0].truncated, false)
  const recovered = (part.pages[0].text + rest.pages[0].text).trim().split('\n').filter(Boolean)
  assert.deepEqual(recovered, lines)
})

test('render refuses text-only models before reading a document', async t => {
  const h = await setup(t)
  await assert.rejects(h.direct('pdf_render', { file_path: 'nonexistent.pdf', page: 1 }, 'text'), /PDF_MODEL_TEXT_ONLY/)
})

test('malformed PDFs, encryption and page bounds fail explicitly through the real registry', async t => {
  const h = await setup(t)
  const malformed = join(h.home, 'invalid.pdf')
  await writeFile(malformed, 'not a pdf')
  for (const [args, expected] of [
    [{ file_path: malformed }, /PDF_INVALID_FILE/],
    [{ file_path: 'encrypted.pdf' }, /PDF_PROCESS_FAILED|PDF_ENCRYPTED/],
    [{ file_path: file, first_page: 4 }, /PDF_INVALID_ARGUMENT/],
  ]) {
    const result = await h.call('pdf_read', args)
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result), expected)
  }
})

test('missing OCR preserves the extraction limitation instead of claiming a blank page', async t => {
  const h = await setup(t, { tesseract: '/definitely-missing-tesseract' })
  const result = value(await h.call('pdf_read', { file_path: file, first_page: 2 }))
  assert.equal(result.pages[0].text.trim(), '')
  assert.match(result.pages[0].warnings.join(' '), /OCR_UNAVAILABLE/)
  assert.deepEqual(result.coverage.ocr_pages_processed, [])
  const forced = await h.call('pdf_read', { file_path: file, first_page: 2, ocr: 'force' })
  assert.equal(forced.isError, true)
})

test('filesystem provider denial remains authoritative even after the file was cached', async t => {
  const h = await setup(t)
  value(await h.call('pdf_read', { file_path: file, ocr: 'off' }))
  const filesystem = h.ctx.fs
  const original = filesystem.readBytes
  filesystem.readBytes = async () => { throw new Error('TEST_READ_DENIED') }
  t.after(() => { filesystem.readBytes = original })
  const result = await h.call('pdf_read', { file_path: file })
  assert.equal(result.isError, true)
  assert.match(JSON.stringify(result), /TEST_READ_DENIED/)
})

test('source changes invalidate cached text and coverage', async t => {
  const h = await setup(t)
  const path = join(h.home, 'changing.pdf')
  await copyFile(resolve('test/fixtures/research-sample.pdf'), path)
  const before = value(await h.call('pdf_read', { file_path: path, ocr: 'off' }))
  await copyFile(resolve('test/fixtures/rotated.pdf'), path)
  const after = value(await h.call('pdf_inspect', { file_path: path }))
  assert.notEqual(before.sha256, after.sha256)
  assert.equal(after.total_pages, 1)
  assert.deepEqual(after.coverage.complete_text_pages_returned, [])
})

test('tool cancellation and child-process deadlines terminate work', async t => {
  const h = await setup(t)
  const control = new AbortController()
  control.abort(new Error('cancel test'))
  const result = await h.call('pdf_inspect', { file_path: file }, control.signal)
  assert.equal(result.isError, true)
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 40 }), /PDF_TIMEOUT/)
})

test('source paths containing shell syntax remain literal filenames', async t => {
  const h = await setup(t)
  const path = join(h.home, "notes ' $(touch HACKED).pdf")
  await copyFile(resolve('test/fixtures/research-sample.pdf'), path)
  const result = value(await h.call('pdf_read', { file_path: path, ocr: 'off' }))
  assert.match(result.pages[0].text, /ORCHID-739/)
})

test('rotated-page crop pixels match a full-page reference region', async () => {
  const doc = await openDocument(await readFile(resolve('test/fixtures/rotated.pdf')), 'rotated.pdf', binaries)
  try {
    const full = await render(doc, 1, undefined, 1200, binaries)
    assert.ok(full.width > full.height)
    const crop = await render(doc, 1, [0, 0, 0.5, 0.5], 600, binaries)
    const { default: sharp } = await library('sharp')
    const fullPixels = await sharp(full.data).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const cropPixels = await sharp(crop.data).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let difference = 0
    for (let y = 0; y < Math.min(cropPixels.info.height, 300); y++) {
      for (let x = 0; x < Math.min(cropPixels.info.width, 300); x++) {
        for (let channel = 0; channel < 3; channel++) difference += Math.abs(fullPixels.data[(y * fullPixels.info.width + x) * 3 + channel] - cropPixels.data[(y * cropPixels.info.width + x) * 3 + channel])
      }
    }
    assert.ok(difference < 5000, `pixel difference ${difference}`)
  } finally { await doc.close() }
})
