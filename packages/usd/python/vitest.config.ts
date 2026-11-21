// Runs the upstream Python tests under Pyodide: `pnpm test:python`.
// JSPI (--experimental-wasm-jspi) lets Python await the core's Promises
// synchronously (pyodide.ffi.run_sync); see runUpstream.ts.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['python/**/*.pyodide.ts'],
    setupFiles: ['./pxr/testing/valueEquality.ts'],
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--experimental-wasm-jspi'], singleFork: true } },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
