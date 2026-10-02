import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { host } from '../test/runtime.mjs'

await mkdir('validation', { recursive: true })
const h = await host({ tesseract: process.env.DSH_PDF_TEST_TESSERACT ?? 'tesseract' })
try {
  const file_path = 'research-sample.pdf'
  const baseline = await h.call('pdf_read', { file_path, first_page: 2, ocr: 'off' })
  const improved = await h.call('pdf_read', { file_path, first_page: 2, language: 'eng+chi_sim' })
  if (baseline.isError || improved.isError) throw new Error('Processing comparison failed')
  const results = { baseline: baseline.value, improved: improved.value, images: [] }
  for (const [name, args] of [
    ['scan', { file_path, page: 2 }],
    ['figure', { file_path, page: 3 }],
    ['crop', { file_path, page: 3, crop: [0.05, 0.75, 0.35, 0.95], pixels: 1000 }],
    ['rotated', { file_path: 'rotated.pdf', page: 1 }],
  ]) {
    const result = await h.routed('pdf_render', args)
    if (result.isError) throw new Error(JSON.stringify(result))
    const output = `validation/${name}.png`
    await rm(output, { force: true })
    await writeFile(output, await readFile(h.ctx.attachments.imageHostPath(result.value.image)), { mode: 0o600 })
    const { image, ...report } = result.value
    results.images.push({ name, ...report })
  }
  await writeFile('validation/processing-results.json', JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify({ baseline_scan_characters: baseline.value.pages[0].text.trim().length, ocr_scan_text: improved.value.pages[0].text.trim(), rendered_images: results.images.map(x => x.name) }, null, 2))
} finally { await h.close() }
