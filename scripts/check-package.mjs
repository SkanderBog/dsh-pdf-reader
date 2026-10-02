import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const directory = await mkdtemp(join(tmpdir(), 'pdf-package-check-'))
try {
  if (!process.env.npm_execpath) throw new Error('Run this check with npm run test:package')
  const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { encoding: 'utf8' }))
  assert.deepEqual(packed.files.map(x => x.path).sort(), ['LICENSE', 'README.md', 'cordis.patch.yml', 'package.json', 'src/document.mjs', 'src/index.mjs', 'src/process.mjs'])
  execFileSync('tar', ['-xzf', join(directory, packed.filename), '-C', directory])
  const result = spawnSync(process.execPath, ['test/reader.test.mjs'], {
    stdio: 'inherit', env: { ...process.env, DSH_PDF_PLUGIN_ENTRY: join(directory, 'package/src/index.mjs') },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Packed plugin integration tests failed')
  console.log(`Verified ${packed.filename}: seven public files; packed plugin integration tests passed.`)
} finally { await rm(directory, { recursive: true, force: true }) }
