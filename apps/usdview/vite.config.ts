import { defineConfig } from 'vite'
import { aswfServer } from './scripts/aswf-server'
import { pluginImportMap } from './scripts/plugin-import-map'
import { licenses } from './scripts/licenses'
import { museumServer } from './scripts/museum-server'
import { readFileSync } from 'node:fs'

// The typescript-usd release the viewer is built from: the library's package version, A.B.C+N
// (CHANGELOG.md), shown as A.B.C.N in the menu bar.
const libraryVersion = (JSON.parse(readFileSync(new URL('../../packages/usd/package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_TYPESCRIPT_USD_VERSION': JSON.stringify(libraryVersion) },
  plugins: [aswfServer(), museumServer(), pluginImportMap(), licenses()],
  build: { target: 'es2022' },
  // Keep class and function names through minification, so the debugger, the
  // Hydra Scene Debugger and error messages show real type names
  // (constructor.name) in the production build as in development.
  esbuild: { keepNames: true },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1' },
})
