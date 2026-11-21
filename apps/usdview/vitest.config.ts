// The viewer's tests: vite.config.ts (its plugins, including the pxr Python
// virtual module of scripts/pxr-python.ts) with JSPI turned on in the test
// forks, so tests/py-interpreter.test.ts can await the core's Promises from
// Python under Pyodide (pyodide.ffi.run_sync), as the library's
// python/vitest.config.ts does.
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    poolOptions: { forks: { execArgv: ['--experimental-wasm-jspi'] } },
  },
}))
