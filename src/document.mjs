import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { run } from './process.mjs'

export const MAX_FILE_BYTES = 64 * 1024 * 1024

export function integer(value, fallback, min, max, name) {
  const n = value ?? fallback
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`PDF_INVALID_ARGUMENT: ${name} must be an integer from ${min} to ${max}`)
  return n
}

export function range(args, total, maximum = total) {
  const first = integer(args.first_page, 1, 1, total, 'first_page')
  const last = integer(args.last_page, first, first, total, 'last_page')
  if (last - first + 1 > maximum) throw new Error(`PDF_PAGE_LIMIT: request at most ${maximum} pages at a time`)
  return [first, last]
}

export function citation(source, page) {
  return `[${basename(source)}, PDF page ${page}]`
}

export async function openDocument(data, source, binaries, signal) {
  if (data.length > MAX_FILE_BYTES) throw new Error('PDF_FILE_LIMIT: maximum PDF size is 64 MiB')
  if (!Buffer.from(data.subarray(0, 1024)).includes(Buffer.from('%PDF-'))) throw new Error('PDF_INVALID_FILE: no PDF signature found')
  const directory = await mkdtemp(join(tmpdir(), 'dsh-pdf-'))
  const path = join(directory, 'source.pdf')
  try {
    await writeFile(path, data, { mode: 0o600, signal })
    const info = (await run(binaries.pdfinfo, [path], { signal })).toString('utf8')
    if (/^Encrypted:\s+yes/m.test(info)) throw new Error('PDF_ENCRYPTED: provide an unlocked copy of this PDF')
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1])
    if (!Number.isInteger(pages) || pages < 1) throw new Error('PDF_INVALID_FILE: page count unavailable')
    if (pages > 2000) throw new Error('PDF_PAGE_LIMIT: maximum document size is 2000 pages; split the PDF')
    return {
      path, directory, pages, source,
      fingerprint: createHash('sha256').update(data).digest('hex'),
      title: info.match(/^Title:\s*(.+)/m)?.[1]?.trim() ?? '',
      text: new Map(), ocr: new Map(), images: new Map(),
      async close() { await rm(directory, { recursive: true, force: true }) },
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function extract(doc, first, last, layout, binaries, signal) {
  const key = `${first}:${last}:${layout}`
  if (doc.text.has(key)) return doc.text.get(key)
  const result = (await run(binaries.pdftotext, [
    '-f', String(first), '-l', String(last), '-enc', 'UTF-8',
    ...(layout ? ['-layout'] : []), doc.path, '-',
  ], { signal })).toString('utf8')
  const pages = result.split('\f')
  if (pages.at(-1)?.trim() === '') pages.pop()
  if (pages.length !== last - first + 1) throw new Error('PDF_EXTRACTION_FAILED: extracted page boundaries do not match the requested pages')
  doc.text.clear()
  if (result.length <= 4 * 1024 * 1024) doc.text.set(key, pages)
  return pages
}

export async function embeddedImages(doc, first, last, binaries, signal) {
  const key = `${first}:${last}`
  if (doc.images.has(key)) return doc.images.get(key)
  const output = (await run(binaries.pdfimages, ['-f', String(first), '-l', String(last), '-list', doc.path], { signal, maxBytes: 1024 * 1024 })).toString('utf8')
  if (!/^page\s+num\s+type\s+width\s+height/m.test(output)) throw new Error('PDF_IMAGE_DETECTION_FAILED: image listing format is unavailable')
  const counts = Array(last - first + 1).fill(0)
  for (const line of output.split('\n')) {
    const row = /^\s*(\d+)\s+\d+\s+(image|mask|smask)\s+\d+\s+\d+\s/.exec(line)
    if (!row || row[2] === 'smask') continue
    const page = Number(row[1])
    if (page >= first && page <= last) counts[page - first]++
  }
  doc.images.clear()
  doc.images.set(key, counts)
  return counts
}

export async function render(doc, page, crop, pixels, binaries, signal) {
  integer(page, 1, 1, doc.pages, 'page')
  integer(pixels, 1600, 600, 2400, 'pixels')
  const box = crop ?? [0, 0, 1, 1]
  if (!Array.isArray(box) || box.length !== 4 || box.some(x => !Number.isFinite(x) || x < 0 || x > 1)
    || box[2] <= box[0] || box[3] <= box[1]) throw new Error('PDF_INVALID_CROP: use [left, top, right, bottom] fractions between 0 and 1')
  const info = (await run(binaries.pdfinfo, ['-f', String(page), '-l', String(page), doc.path], { signal })).toString('utf8')
  const dimensions = info.match(/(?:Page\s+\d+ size|Page size):\s+([\d.]+) x ([\d.]+) pts/)
  if (!dimensions) throw new Error('PDF_GEOMETRY_FAILED: page dimensions unavailable')
  let width = Number(dimensions[1])
  let height = Number(dimensions[2])
  const rotation = Number(info.match(/(?:Page\s+\d+ rot|Page rot):\s+(\d+)/)?.[1] ?? 0)
  if (rotation % 180 !== 0) [width, height] = [height, width]
  const scale = pixels / Math.max(width * (box[2] - box[0]), height * (box[3] - box[1]))
  const fullWidth = Math.ceil(width * scale)
  const fullHeight = Math.ceil(height * scale)
  if (!Number.isFinite(scale) || fullWidth * fullHeight > 36_000_000 || Math.max(fullWidth, fullHeight) > 12000)
    throw new Error('PDF_CROP_LIMIT: crop is too small for this resolution; use a larger region or fewer pixels')
  const x = Math.floor(fullWidth * box[0])
  const y = Math.floor(fullHeight * box[1])
  const w = Math.max(1, Math.ceil(fullWidth * box[2]) - x)
  const h = Math.max(1, Math.ceil(fullHeight * box[3]) - y)
  const prefix = join(doc.directory, 'page')
  await run(binaries.pdftoppm, [
    '-f', String(page), '-l', String(page), '-singlefile', '-png',
    '-r', String(72 * scale), '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h),
    doc.path, prefix,
  ], { signal, maxBytes: 1024 })
  const data = await readFile(`${prefix}.png`, { signal })
  await rm(`${prefix}.png`, { force: true })
  if (data.length > 16 * 1024 * 1024) throw new Error('PDF_IMAGE_LIMIT: render is too large; reduce pixels')
  return { data, crop: box, width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

export async function recognize(doc, page, language, binaries, signal) {
  if (!/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/.test(language) || language.length > 100)
    throw new Error('PDF_INVALID_ARGUMENT: OCR language must be a Tesseract language code such as eng or eng+chi_sim')
  const key = `${page}:${language}`
  if (doc.ocr.has(key)) return doc.ocr.get(key)
  const image = await render(doc, page, undefined, 2400, binaries, signal)
  const path = join(doc.directory, 'ocr.png')
  await writeFile(path, image.data, { signal, mode: 0o600 })
  try {
    const text = (await run(binaries.tesseract, [path, 'stdout', '-l', language], { signal, timeout: 60000, maxBytes: 1024 * 1024 })).toString('utf8')
    if (doc.ocr.size >= 8) doc.ocr.delete(doc.ocr.keys().next().value)
    if (text.length <= 200000) doc.ocr.set(key, text)
    return text
  } finally {
    await rm(path, { force: true })
  }
}
