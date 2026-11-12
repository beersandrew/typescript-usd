import type { Plugin } from 'vite'

/** typescript-usd modules a runtime plugin may import by bare specifier. */
export const pluginApiModules = ['ar', 'gf', 'plug', 'sdf', 'tf', 'usd', 'vt'] as const

/**
 * Runtime plugins (plugInfo LibraryPath ES modules) import typescript-usd by
 * bare specifier and must share the viewer's instance: its TfType and Plug
 * registries. The page's import map points each specifier at a stable viewer
 * module re-exporting it: the source module under the dev server, a fixed-name
 * build entry in production (Rollup shares its modules with the app's chunks).
 */
export function pluginImportMap(): Plugin {
  let command: 'serve' | 'build' = 'serve'
  return {
    name: 'usdview-plugin-import-map',
    config(_config, env) {
      command = env.command
      if (env.command !== 'build') return
      return {
        build: {
          rollupOptions: {
            // Vite drops app entries' exports by default; these entries exist to export.
            preserveEntrySignatures: 'exports-only',
            input: { index: 'index.html', ...Object.fromEntries(pluginApiModules.map(name => [`plugin-api/${name}`, `src/plugin-api/${name}.ts`])) },
            output: {
              entryFileNames: chunk => chunk.name.startsWith('plugin-api/') ? '[name].js' : 'assets/[name]-[hash].js',
              // Several entries would otherwise split Core into many small shared
              // chunks; keep Core (pxr/base and pxr/usd, except usdMtlx and the usdShaders
              // Sdr nodes, which only Storm needs) in one.
              manualChunks: id => /\/packages\/usd\/pxr\/(base|usd)\//.test(id) && !id.includes('/usdMtlx/') && !id.includes('/plugin/usdShaders/') ? 'usd-core' : undefined,
            },
          },
        },
      }
    },
    transformIndexHtml(_html, ctx) {
      // The build is relocatable (base './'): entries are relative to the
      // page, which may be below the root (e.g. the asset harness page).
      const toRoot = '../'.repeat(Math.max(0, ctx.path.split('/').length - 2)) || './'
      const imports = Object.fromEntries(pluginApiModules.map(name =>
        [`typescript-usd/${name}`, command === 'build' ? `${toRoot}plugin-api/${name}.js` : `/src/plugin-api/${name}.ts`]))
      return [{ tag: 'script', attrs: { type: 'importmap' }, children: JSON.stringify({ imports }), injectTo: 'head-prepend' }]
    },
  }
}
