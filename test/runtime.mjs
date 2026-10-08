import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, isAbsolute } from 'node:path'
const entry = process.env.DSH_PDF_PLUGIN_ENTRY ?? '../src/index.mjs'
const plugin = await import(isAbsolute(entry) ? pathToFileURL(entry).href : entry)

const runtime = process.env.DSH_RUNTIME ?? fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(runtime, 'package.json'))
export async function library(name) { return import(pathToFileURL(require.resolve(name)).href) }

export async function host(config = {}) {
  const { Context, Service } = await library('@deepseek-ai/cordis')
  const { default: SystemPrompt } = await library('@deepseek-ai/dsh-system-prompt')
  const { default: ToolRuntime } = await library('@deepseek-ai/dsh-tools')
  const { LocalFileSystem } = await library('@deepseek-ai/dsh-fs-local')
  const { LocalAttachmentStore } = await library('@deepseek-ai/dsh-attachment-local')
  const home = await mkdtemp(join(tmpdir(), 'pdf-reader-test-'))
  const ctx = new Context()
  class TestLlm extends Service {
    constructor(context) { super(context, 'llm', true) }
    async resolveModelInfo(_provider, model) { return { inputModalities: model === 'vision' ? ['text', 'image'] : ['text'] } }
  }
  const fibers = []
  fibers.push(await ctx.plugin(SystemPrompt))
  fibers.push(await ctx.plugin(ToolRuntime))
  fibers.push(await ctx.plugin(LocalFileSystem, { cwd: resolve('test/fixtures') }))
  fibers.push(await ctx.plugin(LocalAttachmentStore, { dshHome: home }))
  fibers.push(await ctx.plugin(TestLlm))
  fibers.push(await ctx.plugin(plugin, { ...config }))
  let counter = 0
  return {
    ctx, home,
    async call(name, args, signal = new AbortController().signal) {
      return ctx.tools.execute({ name, arguments: args, callId: `pdf-test-${++counter}`, signal })
    },
    async routed(name, args, model = 'vision') {
      const agent = { session: { header: { id: 'test-session', cwd: resolve('test/fixtures') }, requestHeader() { return { config: { provider: 'test', model } } } }, options: {} }
      return ctx.tools.execute({ name, arguments: args, agent, callId: `pdf-test-${++counter}`, signal: new AbortController().signal })
    },
    async direct(name, args, model = 'vision', signal = new AbortController().signal) {
      const tool = ctx.tools.get(name)
      const value = await tool.execute(args, {
        signal,
        agent: { session: { header: { id: 'test-session', cwd: resolve('test/fixtures') }, requestHeader() { return { config: { provider: 'test', model } } } }, options: {} },
      })
      return { value, content: tool.output.render(args, value) }
    },
    async close() { for (const fiber of fibers.reverse()) await fiber.dispose(); await rm(home, { recursive: true, force: true }) },
  }
}
