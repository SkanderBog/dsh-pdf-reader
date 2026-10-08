// Actual CLI package install -> profile boot/tool call -> uninstall -> clean boot.
// Never use the desktop's shell shim: DSH_CLI must point to the core's lib/bin.js.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = process.env.DSH_CLI
assert(cli && isAbsolute(cli) && cli.endsWith('/lib/bin.js'), 'Set DSH_CLI to the absolute installed @deepseek-ai/dsh/lib/bin.js (not a desktop shim)')
const host = JSON.parse(await readFile(resolve(dirname(cli), '../package.json'), 'utf8'))
assert.equal(host.name, '@deepseek-ai/dsh')
const home = await mkdtemp(join(tmpdir(), 'pdf-profile-check-'))
const profile = 'pdf-store-check'
const profileDir = join(home, 'profiles', profile)
const evidence = { host: host.version, platform: process.platform, node: process.version, scope: 'disposable CLI profile with real tool/fs/systemPrompt services; no model calls', operations: {} }
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', CI: '1', npm_config_cache: join(home, 'npm-cache') }
function command(args) {
  try { return execFileSync(process.execPath, [cli, ...args], { cwd: home, env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 }) }
  catch (error) { throw new Error(`DSH ${args.slice(0, 4).join(' ')} failed: ${error.stderr?.toString() ?? error.message}`) }
}
try {
  await mkdir(profileDir, { recursive: true })
  const baseline = { name: 'dsh-profile-pdf-store-check', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }
  await writeFile(join(profileDir, 'package.json'), JSON.stringify(baseline, null, 2)+'\n')
  await writeFile(join(profileDir, 'cordis.yml'), '[]\n')
  const probe = join(home, 'probe.mjs')
  await writeFile(probe, `
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
export const inject = ['tools', 'fs', 'systemPrompt', 'appReady', 'appExit']
export function apply(ctx, config) {
  ctx.effect(() => ctx.appReady.onReady(() => {
    void (async () => {
      const names = ['pdf_status','pdf_inspect','pdf_read','pdf_search','pdf_render']
      for (const name of names) assert.equal(Boolean(ctx.tools.get(name)), config.present, name)
      const prompt = JSON.stringify(await ctx.systemPrompt.assemble({}))
      assert.equal(prompt.includes('Read PDFs with pdf_inspect'), config.present)
      let status, read
      if (config.present) {
        const execute = (name, args) => ctx.tools.execute({name, arguments:args, callId:'profile-check-'+name, signal:new AbortController().signal})
        status = await execute('pdf_status', {})
        assert.equal(status.isError, false)
        assert.equal(status.value.tools.pdfinfo.available, true)
        assert.equal(status.value.tools.pdftotext.available, true)
        read = await execute('pdf_read', {file_path:config.fixture, first_page:1, ocr:'off'})
        assert.equal(read.isError, false)
        assert.match(read.value.pages[0].text, /ORCHID-739/)
      }
      await writeFile(config.output, JSON.stringify({registered:config.present, workflow:config.present, text:read ? 'ORCHID-739' : null}))
      ctx.appExit(0)
    })().catch(error => { console.error(error); ctx.appExit(1) })
  }))
}
`)
  async function boot(present) {
    const output = join(home, present ? 'started.json' : 'uninstalled.json')
    const entries = [
      {id:'probe-tools', name:'@deepseek-ai/dsh-tools'},
      {id:'probe-fs', name:'@deepseek-ai/dsh-fs-local', config:{cwd:home}},
      {id:'probe-prompt', name:'@deepseek-ai/dsh-system-prompt'},
      {id:'profile-probe', name:probe, config:{present, fixture:join(root,'test/fixtures/research-sample.pdf'), output}},
    ]
    // JSON is a YAML subset. This is an isolated test harness, not shipped plugin code.
    await writeFile(join(profileDir,'cordis.patch.yml'), JSON.stringify([{insert:entries}],null,2)+'\n')
    command(['--profile',profile])
    return JSON.parse(await readFile(output,'utf8'))
  }
  const npm = process.env.npm_execpath
  assert(npm, 'Run with npm run test:profile')
  const [packed] = JSON.parse(execFileSync(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',home],{cwd:root,env,encoding:'utf8',timeout:60000}))
  const tarball = join(home,packed.filename)
  command(['plugin','--profile',profile,'add',tarball,'--ignore-scripts','--offline'])
  const installed = JSON.parse(await readFile(join(profileDir,'node_modules/dsh-pdf-reader/package.json'),'utf8'))
  assert.equal(installed.version,JSON.parse(await readFile(join(root,'package.json'),'utf8')).version)
  evidence.pluginVersion = installed.version
  evidence.runtimeSha256 = {}
  for (const file of ['src/index.mjs','src/document.mjs','src/process.mjs','cordis.patch.yml']) {
    evidence.runtimeSha256[file] = createHash('sha256').update(await readFile(join(profileDir,'node_modules/dsh-pdf-reader',file))).digest('hex')
  }
  evidence.operations.install = 'passed'
  evidence.started = await boot(true); evidence.operations.start = 'passed'
  command(['plugin','--profile',profile,'remove','dsh-pdf-reader'])
  evidence.removed = await boot(false); evidence.operations.uninstall = 'passed'
  const remaining = JSON.parse(await readFile(join(profileDir,'package.json'),'utf8'))
  assert.equal(remaining.dependencies?.['dsh-pdf-reader'], undefined)
  assert(!remaining.dsh.profile.bundles.includes('dsh-pdf-reader'))
  evidence.operations.rollback = 'unknown' // Uninstall is not an update rollback.
  if (process.env.DSH_PROFILE_EVIDENCE) await writeFile(resolve(process.env.DSH_PROFILE_EVIDENCE), JSON.stringify(evidence,null,2)+'\n')
  console.log(JSON.stringify(evidence,null,2))
} finally { await rm(home,{recursive:true,force:true}) }
