import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'

// Usage: node scripts/check-models.mjs RUNTIME_ROOT [PLUGIN_ENTRY]
// PLUGIN_ENTRY is imported exactly as passed, including an unpacked archive.
const runtime = resolve(process.argv[2] ?? '.')
const entry = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3]))
  : new URL('../src/index.mjs', import.meta.url)
const plugin = await import(entry)
let networkAttempts = 0, authAttempts = 0, streamAttempts = 0
const originalFetch = globalThis.fetch
const report = {
  createdAt: new Date().toISOString(),
  scope: 'Offline model-metadata and PDF tool compatibility; no model generation, API authentication, provider requests, or user profiles.',
  pluginEntry: fileURLToPath(entry),
  sourceSha256: Object.fromEntries(await Promise.all(['index.mjs', 'document.mjs', 'process.mjs'].map(async name => [name, createHash('sha256').update(await readFile(new URL(name, entry))).digest('hex')]))),
}

function samplePdf() {
  const stream = 'BT /F1 12 Tf 40 750 Td (Offline adapter probe ORCHID-739: PDF text and visual rendering.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  const xref = pdf.length
  return pdf + `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
}

async function probe() {
  const require = createRequire(join(runtime, 'package.json'))
  const library = name => import(pathToFileURL(require.resolve(name)))
  const { Context } = await library('@deepseek-ai/cordis')
  const { LlmRuntime, LlmAdapter } = await library('@deepseek-ai/dsh-llm')
  const { DeepSeekAdapter, resolveAdapterOptions } = await library('@deepseek-ai/dsh-llm-deepseek')
  const { default: SystemPrompt } = await library('@deepseek-ai/dsh-system-prompt')
  const { default: ToolRuntime } = await library('@deepseek-ai/dsh-tools')
  const { LocalFileSystem } = await library('@deepseek-ai/dsh-fs-local')
  const { LocalAttachmentStore } = await library('@deepseek-ai/dsh-attachment-local')
  const home = await mkdtemp(join(tmpdir(), 'pdf-real-model-probe-'))
  const fixture = join(home, 'adapter-probe.pdf')
  await writeFile(fixture, samplePdf(), { mode: 0o600 })
  const ctx = new Context()
  const fibers = [], registrations = []
  const results = {
    runtimeVersion: require('@deepseek-ai/dsh-llm/package.json').version,
    deepSeekAdapterVersion: require('@deepseek-ai/dsh-llm-deepseek/package.json').version,
    toolExecution: null,
    cases: [],
    modelResolutions: [],
  }
  const connection = new Map([
    ['deepseek-built-in', resolveAdapterOptions({})],
    ['deepseek-configured', resolveAdapterOptions({ models: [
      { id: 'arbitrary-vision-wire-id', name: 'Deployment vision model', inputModalities: ['text', 'image'] },
      { id: 'arbitrary-text-wire-id', name: 'Deployment text model', inputModalities: ['text'] },
      { id: 'mutable-wire-id', name: 'Mutable deployment model', inputModalities: ['text'] },
    ] })],
  ])
  const adapters = new Map()
  let route, count = 0
  const agent = {
    session: { header: { id: 'offline-adapter-probe', cwd: dirname(fixture) }, requestHeader() { return { config: route } } },
    options: { provider: 'stale-provider-never-resolve', model: 'stale-model-never-resolve' },
  }
  try {
    fibers.push(await ctx.plugin(SystemPrompt))
    fibers.push(await ctx.plugin(ToolRuntime))
    if (typeof ctx.tools.setExecutor === 'function') {
      fibers.push(await ctx.plugin(await library('@deepseek-ai/dsh-tool-executor-native')))
      results.toolExecution = 'real native executor using batched tool calls'
    } else results.toolExecution = 'real registry using individual tool calls'
    fibers.push(await ctx.plugin(LocalFileSystem, { cwd: dirname(fixture) }))
    fibers.push(await ctx.plugin(LocalAttachmentStore, { dshHome: home }))
    fibers.push(await ctx.plugin(LlmRuntime))
    for (const provider of connection.keys()) {
      const adapter = new DeepSeekAdapter({
        options: () => connection.get(provider),
        connect: async signal => { signal?.throwIfAborted(); return connection.get(provider) },
        // Resolution does not use file upload, credentials, or generation.
        resolveFiles: () => Object.freeze({}),
        resolveAuth: async () => { authAttempts++; throw new Error('AUTH_FORBIDDEN_IN_MODEL_PROBE') },
        resolveUserId: () => { throw new Error('GENERATION_FORBIDDEN_IN_MODEL_PROBE') },
      })
      adapter.stream = () => { streamAttempts++; throw new Error('GENERATION_FORBIDDEN_IN_MODEL_PROBE') }
      const resolveModel = adapter.resolveModel.bind(adapter)
      adapter.resolveModel = async (actualProvider, model, signal) => {
        const metadata = await resolveModel(actualProvider, model, signal)
        results.modelResolutions.push({ provider: actualProvider, model, inputModalities: metadata.inputModalities ?? null })
        return metadata
      }
      adapters.set(provider, adapter)
      registrations.push(ctx.llm.registerAdapter([provider], adapter))
    }
    // DeepSeek always resolves an explicit modality list, including text-only
    // for uncatalogued IDs. Use a separately identified adapter to test the
    // Harness-wide contract where image capability has not been disclosed.
    class UndisclosedAdapter extends LlmAdapter {
      providerInfo(provider) { return { id: provider, name: 'Undisclosed metadata test adapter' } }
      async resolveModel(provider, model) { return { provider, id: model, name: model } }
      async *stream() { streamAttempts++; throw new Error('GENERATION_FORBIDDEN_IN_MODEL_PROBE') }
    }
    registrations.push(ctx.llm.registerAdapter(['undisclosed-test-provider'], new UndisclosedAdapter()))
    fibers.push(await ctx.plugin(plugin))

    async function execute(name, args) {
      const callId = `offline-model-${++count}`
      const signal = new AbortController().signal
      if (typeof ctx.tools.setExecutor !== 'function') return ctx.tools.execute({ name, arguments: args, callId, signal, agent })
      const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }], agent, signal })
      const matching = batch.results.filter(result => result.callId === callId)
      assert.equal(matching.length, 1)
      return matching[0].result
    }
    async function renderCase(label, provider, model, expected) {
      route = { provider, model }
      const metadata = await ctx.llm.resolveModelInfo(provider, model, new AbortController().signal)
      const result = await execute('pdf_render', { file_path: expected === 'image' ? fixture : join(home, 'must-not-be-read.pdf'), page: 1, pixels: 600 })
      if (expected === 'image') {
        assert.equal(result.isError, false, JSON.stringify(result))
        assert.equal(result.value.image.mediaType, 'image/png')
        assert.ok(result.content.some(block => block.type === 'image'))
        assert.ok(await ctx.attachments.readImage(result.value.image))
      } else {
        assert.equal(result.isError, true)
        assert.match(JSON.stringify(result), new RegExp(expected))
      }
      const evidence = { label, provider, model, name: metadata.name, inputModalities: metadata.inputModalities ?? null, outcome: expected }
      if (expected === 'image') evidence.renderedPixels = result.value.rendered_pixels
      results.cases.push(evidence)
    }

    const defaults = connection.get('deepseek-built-in').models
    results.builtInCatalog = defaults.map(({ id, name, inputModalities }) => ({ id, name, inputModalities }))
    const flash = defaults.find(model => /flash/i.test(`${model.id} ${model.name}`))
    const pro = defaults.find(model => /pro/i.test(`${model.id} ${model.name}`))
    assert.ok(flash, 'actual built-in catalog must contain Flash')
    assert.ok(pro, 'actual built-in catalog must contain Pro')
    assert.ok(flash.inputModalities.includes('image'))
    assert.deepEqual(pro.inputModalities, ['text'])
    await renderCase('Actual built-in Flash permits a real PDF image', 'deepseek-built-in', flash.id, 'image')
    await renderCase('Actual built-in Pro refuses image delivery before file access', 'deepseek-built-in', pro.id, 'PDF_MODEL_TEXT_ONLY')
    await renderCase('Uncatalogued DeepSeek ID inherits the adapter text-only default', 'deepseek-built-in', 'not-in-built-in-catalog', 'PDF_MODEL_TEXT_ONLY')
    await renderCase('Arbitrary configured vision model permits images', 'deepseek-configured', 'arbitrary-vision-wire-id', 'image')
    await renderCase('Arbitrary configured text model refuses images', 'deepseek-configured', 'arbitrary-text-wire-id', 'PDF_MODEL_TEXT_ONLY')
    await renderCase('Same configured model initially text-only', 'deepseek-configured', 'mutable-wire-id', 'PDF_MODEL_TEXT_ONLY')
    connection.set('deepseek-configured', resolveAdapterOptions({ models: [{ id: 'mutable-wire-id', inputModalities: ['text', 'image'] }] }))
    await renderCase('Same route detects changed vision metadata without reload', 'deepseek-configured', 'mutable-wire-id', 'image')
    connection.set('deepseek-configured', resolveAdapterOptions({ models: [{ id: 'mutable-wire-id', inputModalities: ['text'] }] }))
    await renderCase('Same route detects changed text-only metadata without reload', 'deepseek-configured', 'mutable-wire-id', 'PDF_MODEL_TEXT_ONLY')
    await renderCase('Provider and model route switch returns to built-in Flash', 'deepseek-built-in', flash.id, 'image')
    await renderCase('Generic undisclosed metadata is unknown, distinct from DeepSeek default', 'undisclosed-test-provider', 'new-undisclosed-model', 'PDF_MODEL_UNKNOWN')
    for (const model of [flash.id, pro.id]) {
      route = { provider: 'deepseek-built-in', model }
      const result = await execute('pdf_read', { file_path: fixture, first_page: 1, ocr: 'off' })
      assert.equal(result.isError, false, JSON.stringify(result))
      assert.match(result.value.pages[0].text, /ORCHID-739/)
      results.cases.push({ label: 'Embedded PDF text remains available', provider: route.provider, model, outcome: 'text' })
    }
    assert.ok(results.modelResolutions.every(call => call.provider !== agent.options.provider))
    return results
  } finally {
    for (const unregister of registrations.reverse()) unregister()
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await rm(home, { recursive: true, force: true })
  }
}

try {
  globalThis.fetch = async () => { networkAttempts++; throw new Error('NETWORK_FORBIDDEN_IN_MODEL_PROBE') }
  report.runtime = await probe()
  assert.equal(networkAttempts, 0)
  assert.equal(authAttempts, 0)
  assert.equal(streamAttempts, 0)
  report.networkAttempts = networkAttempts
  report.authAttempts = authAttempts
  report.streamAttempts = streamAttempts
  report.passed = true
  if (process.env.DSH_PDF_MODEL_EVIDENCE) await writeFile(resolve(process.env.DSH_PDF_MODEL_EVIDENCE), JSON.stringify(report, null, 2) + '\n')
  console.log(`Verified PDF model compatibility on Harness ${report.runtime.runtimeVersion}: ${report.runtime.cases.length} offline actual-adapter/registry cases passed; ${report.runtime.toolExecution}; no network/auth/generation calls.`)
} finally { globalThis.fetch = originalFetch }
