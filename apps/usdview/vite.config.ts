import { defineConfig } from 'vite'
import { aswfServer } from './scripts/aswf-server'
import { pluginImportMap } from './scripts/plugin-import-map'
import { licenses } from './scripts/licenses'
import { museumServer } from './scripts/museum-server'

export default defineConfig({
  base: './',
  plugins: [aswfServer(), museumServer(), pluginImportMap(), licenses()],
  build: { target: 'es2022' },
  // Keep class and function names through minification, so the debugger, the
  // Hydra Scene Debugger and error messages show real type names
  // (constructor.name) in the production build as in development.
  esbuild: { keepNames: true },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1' },
})
