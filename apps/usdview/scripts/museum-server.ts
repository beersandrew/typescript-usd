import { loadEnv, type Plugin } from 'vite'
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

/** The URL path the dev server serves a local museum checkout under. */
export const museumMount = '/museum'

/** Dev server only: serves a local USD Museum checkout (USDVIEW_MUSEUM_ROOT, from
 *  the environment or a git-ignored .env.local; unset, nothing is served) under /museum/ and points the
 *  welcome note's Start Museum Tour button at its tour.usda, with the
 *  checkout's resource plugins (config/<name>/plugInfo.json, e.g. variant
 *  fallbacks) registered. Nothing is copied into a build; a build configures the
 *  button with VITE_MUSEUM_TOUR_URL (and VITE_MUSEUM_TOUR_PLUGINS) or ?tour=.
 *  An explicit VITE_MUSEUM_TOUR_URL wins over the checkout. */
export function museumServer(): Plugin {
  let root: string | undefined
  return {
    name: 'local-museum',
    apply: 'serve',
    config(_, { mode }) {
      const setting = process.env.USDVIEW_MUSEUM_ROOT ?? loadEnv(mode, process.cwd(), 'USDVIEW_').USDVIEW_MUSEUM_ROOT
      if (!setting) return
      const checkout = path.resolve(setting)
      if (!existsSync(path.join(checkout, 'tour.usda'))) return
      root = checkout
      if (process.env.VITE_MUSEUM_TOUR_URL) return
      const config = path.join(checkout, 'config')
      const plugins = existsSync(config)
        ? readdirSync(config, { withFileTypes: true })
          .filter(entry => entry.isDirectory() && existsSync(path.join(config, entry.name, 'plugInfo.json')))
          .map(entry => `${museumMount}/config/${entry.name}/plugInfo.json`)
        : []
      return { define: {
        'import.meta.env.VITE_MUSEUM_TOUR_URL': JSON.stringify(`${museumMount}/tour.usda`),
        'import.meta.env.VITE_MUSEUM_TOUR_PLUGINS': JSON.stringify(plugins.join(',')),
      } }
    },
    configureServer(server) {
      if (!root) return
      const mountRoot = root
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith(museumMount + '/')) { next(); return }
        try {
          // No dot files or folders (the checkout's .git).
          if (decodeURIComponent(url.pathname).split('/').some(part => part.startsWith('.'))) throw new Error('Invalid museum path')
          const base = await realpath(mountRoot)
          const file = await realpath(path.resolve(base, '.' + decodeURIComponent(url.pathname.slice(museumMount.length))))
          if (!file.startsWith(base + path.sep) || !(await stat(file)).isFile()) throw new Error('Invalid museum path')
          const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mtlx': 'application/xml', '.usda': 'text/plain; charset=utf-8' }
          res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-cache')
          createReadStream(file).pipe(res)
        } catch { res.statusCode = 404; res.end('Museum file unavailable') }
      })
    },
  }
}
