import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const page = (path: string) => resolve(import.meta.dirname, path)

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: page('index.html'),
        usdcat: page('usdcat/index.html'),
        usdzip: page('usdzip/index.html'),
        usdchecker: page('usdchecker/index.html'),
        usddiff: page('usddiff/index.html'),
        usdresolve: page('usdresolve/index.html'),
        usdstitch: page('usdstitch/index.html'),
        usdstitchclips: page('usdstitchclips/index.html'),
        usdfixbrokenpixarschemas: page('usdfixbrokenpixarschemas/index.html'),
      },
    },
  },
  esbuild: { keepNames: true },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1' },
})
