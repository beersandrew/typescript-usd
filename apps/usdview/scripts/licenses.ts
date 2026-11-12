// Ships the third-party notices with the viewer: NOTICE and the licence texts
// of everything the build bundles, under licenses/ next to index.html (the
// build's output, and the dev server at the same path). The viewer's menubar
// links to licenses/.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const repo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))

/** Published name -> [repository file, description]. */
const FILES: Record<string, [string, string]> = {
  'NOTICE.txt': ['NOTICE', 'Notices for typescript-usd and every upstream project it includes'],
  'LICENSE-typescript-usd-OpenUSD.txt': ['LICENSE', 'typescript-usd and OpenUSD: Tomorrow Open Source Technology License 1.0'],
  'LICENSE-MaterialX.txt': ['packages/materialx/LICENSE', 'MaterialX: Apache License 2.0'],
  'LICENSE-OpenSubdiv.txt': ['packages/opensubdiv/LICENSE', 'OpenSubdiv 3.7.0: Tomorrow Open Source Technology License 1.0'],
  'LICENSE-OpenSubdiv-3.6.1.txt': ['packages/opensubdiv/LICENSE-OpenSubdiv-3.6.1.txt', 'OpenSubdiv 3.6.1: Modified Apache 2.0 License'],
  'NOTICE-OpenSubdiv-3.6.1.txt': ['packages/opensubdiv/NOTICE-OpenSubdiv-3.6.1.txt', 'OpenSubdiv NOTICE'],
  'LICENSE-OpenVDB.txt': ['packages/openvdb/LICENSE', 'OpenVDB 13 and NanoVDB: Apache License 2.0'],
  'LICENSE-OpenVDB-10.1.0.txt': ['packages/openvdb/LICENSE-OpenVDB-10.1.0.txt', 'OpenVDB 10.1.0: Mozilla Public License 2.0'],
  'LICENSE-Roboto.txt': ['apps/usdview/src/fonts/LICENSE.txt', 'Roboto font: Apache License 2.0'],
  'LICENSE-RobotoMono.txt': ['apps/usdview/src/fonts/RobotoMono-LICENSE.txt', 'Roboto Mono font: Apache License 2.0'],
}

const escape = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

function index(): string {
  const items = Object.entries(FILES)
    .map(([name, [, what]]) => `<li><a href="${name}">${escape(name)}</a> — ${escape(what)}</li>`).join('\n')
  return `<!doctype html><meta charset="utf-8"><title>Licenses</title>
<h1>Licenses</h1>
<p>The LZ4, stb_image, OpenEXR, libdeflate, IlmBase, Imath, RapidJSON, PugiXML,
c-blosc, Open Shading Language and Microsoft notices are reproduced in full in NOTICE.txt.</p>
<ul>
${items}
</ul>
`
}

function contents(name: string): string | undefined {
  if (name === '' || name === 'index.html') return index()
  const entry = FILES[name]
  return entry ? readFileSync(repo(entry[0]), 'utf8') : undefined
}

export function licenses(): Plugin {
  return {
    name: 'usdview-licenses',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/licenses\/([^?#]*)/.exec(req.url ?? '')
        const text = match ? contents(decodeURIComponent(match[1]!)) : undefined
        if (text === undefined) return next()
        res.setHeader('Content-Type', match![1]!.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8')
        res.end(text)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'licenses/index.html', source: index() })
      for (const name of Object.keys(FILES)) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: contents(name)! })
      }
    },
  }
}
