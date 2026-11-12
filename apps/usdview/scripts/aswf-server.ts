import type { Plugin } from 'vite'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Local test corpora are independent checkouts beside the workspace root
// (USDVIEW_LOCAL_ASSETS overrides that folder; ASWF_ASSET_ROOT the ASWF corpus).
export function workspaceRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    if (path.dirname(dir) === dir) return from
  }
}
const localAssets = path.resolve(process.env.USDVIEW_LOCAL_ASSETS ?? path.dirname(workspaceRoot(process.cwd())))

/** Local-only corpus mount. Assets remain in their pinned independent checkout. */
export function aswfServer(): Plugin {
  const root = path.resolve(process.env.ASWF_ASSET_ROOT ?? path.join(localAssets, 'aswf-assets-091bb5c'))
  return {
    name: 'local-aswf-corpus',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (['/__bike_perf_results', '/__review_v2_results', '/__fleet_results', '/__review_results', '/__integration_results', '/__audit_results', '/__aswf_results', '/__materialx_results', '/__chessset_results', '/__viewer_controls_results'].includes(url.pathname) && req.method === 'POST') {
          if (req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end(); return }
          try {
            let body = ''
            for await (const chunk of req) { body += String(chunk); if (body.length > 2_000_000) throw new Error('Report too large') }
            const report = JSON.parse(body)
            if (!Array.isArray(report.results) || report.results.length > 2000) throw new Error('Invalid report')
            const browser = String(report.browser).includes('Chrome/') ? 'chrome' : String(report.browser).includes('Safari/') ? 'safari' : 'other'
            const directory = path.resolve(url.pathname === '/__bike_perf_results' ? 'out/performance-bike' : url.pathname === '/__review_v2_results' ? 'out/review-v2-integration' : url.pathname === '/__fleet_results' ? 'out/fleet-integration' : url.pathname === '/__review_results' ? 'out/animation-composition-integration' : url.pathname === '/__integration_results' ? 'out/geometry-material-integration' : url.pathname === '/__audit_results' ? 'out/aswf/current' : url.pathname === '/__viewer_controls_results' ? 'out/viewer-controls' : url.pathname === '/__chessset_results' ? 'out/chess-set' : url.pathname === '/__materialx_results' ? 'out/materialx-render' : 'out/aswf')
            await mkdir(directory, {recursive: true})
            if (url.pathname === '/__fleet_results' || url.pathname === '/__review_v2_results') {
              for (const [index, result] of report.results.entries()) {
                if (typeof result.capture === 'string' && result.capture.startsWith('data:image/png;base64,')) {
                  result.screenshot = `${browser}-${index}.png`
                  await writeFile(path.join(directory, result.screenshot), Buffer.from(result.capture.slice(22), 'base64'))
                  delete result.capture
                }
              }
            }
            await writeFile(path.join(directory, `browser-${browser}${url.pathname === '/__bike_perf_results' && ['batch2','batch2-arm','batch2-brainstem','skinning-before','skinning-after','skinning-bike','retained-brainstem','retained-bike','shared-brainstem','shared-bike'].includes(report.variant) ? `-${report.variant}` : url.pathname === '/__bike_perf_results' && report.variant === 'optimized' ? '-optimized' : url.pathname === '/__bike_perf_results' && report.variant === 'playback' ? '-playback' : ''}.json`), JSON.stringify(report, null, 2) + '\n')
            res.setHeader('Content-Type', 'application/json'); res.end('{"saved":true}')
          } catch (error) { res.statusCode = 400; res.end(String(error)) }
          return
        }
        const mount = url.pathname.startsWith('/schema-assets/') ? {prefix:'/schema-assets',root:path.join(localAssets, 'usd-test-assets')} : url.pathname.startsWith('/aswf/') ? {prefix:'/aswf',root} : null
        if (!mount) { next(); return }
        try {
          const file = await realpath(path.resolve(mount.root, '.' + decodeURIComponent(url.pathname.slice(mount.prefix.length))))
          const base = await realpath(mount.root)
          if (!file.startsWith(base + path.sep) || !(await stat(file)).isFile()) throw new Error('Invalid asset path')
          const types: Record<string, string> = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.mtlx':'application/xml'}
          res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
          createReadStream(file).pipe(res)
        } catch { res.statusCode = 404; res.end('Local corpus asset unavailable') }
      })
    },
  }
}
