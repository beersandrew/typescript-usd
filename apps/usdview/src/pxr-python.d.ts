// The dev server's virtual module (scripts/pxr-python.ts).
declare module 'virtual:pxr-python' {
  export interface PyProxyLike { get(key: string): unknown; destroy(): void }
  export interface BrowserPxrPython {
    pyodide: unknown
    loadMs: number
    run(script: string, argv?: readonly string[]): Promise<{ exitCode: number, output: string, outputs: unknown }>
  }
  export function loadPxrPythonInBrowser(options: {
    loadPyodide: (options: { indexURL: string }) => Promise<unknown>
    indexURL: string
    files: Readonly<Record<string, string>>
    pythonDir: string
    openusdSrc: string
  }): Promise<BrowserPxrPython>
  export function jspiSupported(): boolean
  /** packages/usd/python/interactive.ts */
  export type InteractiveStyle = 'output' | 'syntaxError' | 'traceback'
  export interface PxrInteractive {
    readonly banner: string
    readonly ps1: string
    readonly ps2: string
    runSource(source: string): Promise<{ more: boolean, output: [string, InteractiveStyle][] }>
    complete(token: string): string[]
    exec(source: string): Promise<void>
    readonly locals: { get(key: string): unknown, set(key: string, value: unknown): void, has(key: string): boolean, keys(): Iterable<string> }
  }
  export function createPxrInteractive(pyodide: unknown): PxrInteractive
  export const files: Readonly<Record<string, string>>
  export const pythonDir: string
  export const openusdSrc: string
  export const examplesDir: string
}
