import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { host } from './runtime.mjs'

function multipagePdf(texts) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${texts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (const text of texts) {
    const stream = `BT /F1 12 Tf 40 750 Td (${text}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  const xref = pdf.length
  return pdf + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
}

test('large searches bound extraction batches while preserving page numbers, totals and OCR gaps', async t => {
  const h = await host()
  t.after(() => h.close())
  const converter = join(h.home, 'bounded-pdftotext')
  await writeFile(converter, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const args = process.argv.slice(2)
const first = Number(args[args.indexOf('-f') + 1])
const last = Number(args[args.indexOf('-l') + 1])
if (last - first + 1 > 100) {
  process.stderr.write('Extraction batch exceeds resource budget')
  process.exit(1)
}
const result = spawnSync('pdftotext', args, { stdio: 'inherit' })
process.exit(result.status ?? 1)
`, { mode: 0o755 })
  const bounded = await host({ pdftotext: converter })
  t.after(() => bounded.close())
  const file_path = join(h.home, 'many-pages.pdf')
  const hitPages = [1, 100, 101, 200, 201]
  await writeFile(file_path, multipagePdf(Array.from({ length: 201 }, (_, i) =>
    i === 99 || i === 100 ? '[ORCHID-739]' : hitPages.includes(i + 1) ? 'Long searchable record with exact literal token [ORCHID-739] for page citations.' : 'This searchable page has sufficient embedded text but no matching literal token.')))
  const result = await bounded.call('pdf_search', { file_path, query: '[orchid-739]', limit: 2 })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.equal(result.value.total_matches, 5)
  assert.deepEqual(result.value.matches.map(m => m.page), [1, 100])
  assert.equal(result.value.truncated, true)
  assert.deepEqual(result.value.sparse_pages_needing_ocr, [100, 101])
  assert.deepEqual(result.value.coverage.complete_text_pages_returned, [])
  const tail = await bounded.call('pdf_search', { file_path, first_page: 100, last_page: 201, query: '[ORCHID-739]' })
  assert.equal(tail.isError, false, JSON.stringify(tail))
  assert.deepEqual(tail.value.matches.map(m => m.page), [100, 101, 200, 201])
  assert.deepEqual(tail.value.searched_pages, [100, 201])
})
