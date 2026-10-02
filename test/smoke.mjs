import { host } from './runtime.mjs'
const instance = await host()
try {
  console.log(JSON.stringify(await instance.call('pdf_inspect', { file_path: 'research-sample.pdf' }), null, 2))
} finally { await instance.close() }
