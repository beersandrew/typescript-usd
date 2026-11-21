import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const page = (path: string) => resolve(import.meta.dirname, path)
const only = process.env.USD_TOOLS_PAGES?.split(',').map(p => p.trim()).filter(Boolean)
const pick = (inputs: Record<string, string>) => only ? Object.fromEntries(Object.entries(inputs).filter(([name]) => only.includes(name))) : inputs

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // USD_TOOLS_PAGES=usdcat,usdzip builds only those pages (scripts/ship.mjs).
      input: pick({
        index: page('index.html'),
        usdcat: page('usdcat/index.html'),
        usdzip: page('usdzip/index.html'),
        usdchecker: page('usdchecker/index.html'),
        usddiff: page('usddiff/index.html'),
        usdresolve: page('usdresolve/index.html'),
        usdstitch: page('usdstitch/index.html'),
        usdstitchclips: page('usdstitchclips/index.html'),
        usdfixbrokenpixarschemas: page('usdfixbrokenpixarschemas/index.html'),
      }),
    },
  },
  esbuild: { keepNames: true },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1' },
})
