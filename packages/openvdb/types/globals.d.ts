// Shared ambient declarations for the whole workspace.
//
// The base tsconfig targets bare lib:ES2022 — no DOM lib and no @types/node
// (the packages are browser-first; node appears only in tests). This file
// declares the host-provided globals and node builtins with the smallest
// surface the code actually uses, so every package's strict typecheck
// resolves them identically. It is included by every package tsconfig;
// keep it dependency-free and type-only.

// ---- Web platform globals (browsers, Node >= 18, Deno, Bun) ----

declare class TextDecoder {
  constructor(label?: string)
  decode(input?: ArrayBufferView | ArrayBuffer): string
}

declare class TextEncoder {
  encode(input?: string): Uint8Array<ArrayBuffer>
}

type BlobPart = ArrayBufferView | ArrayBuffer | Blob | string

declare class Blob {
  constructor(parts?: BlobPart[])
  stream(): { pipeThrough(transform: DecompressionStream): unknown }
}

declare class DecompressionStream {
  constructor(format: string)
}

declare class Response {
  constructor(body?: unknown)
  readonly ok: boolean
  readonly status: number
  arrayBuffer(): Promise<ArrayBuffer>
}

declare function structuredClone<T>(value: T): T

declare var console: {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

interface ImportMeta {
  url: string
}

// Provided by Vitest's CJS-compatible transform at runtime (tests only).
declare const __dirname: string

// ---- Node builtin shims (tests run under vitest/node) ----

declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array<ArrayBuffer>
  export function readFileSync(path: string, encoding: 'utf-8' | 'utf8'): string
  export function writeFileSync(file: string, data: string | Uint8Array): void
  export function readdirSync(path: string): string[]
  export function existsSync(path: string): boolean
}

declare module 'node:path' {
  export function join(...paths: string[]): string
  export function resolve(...paths: string[]): string
  export function dirname(p: string): string
  const path: {
    join: (...paths: string[]) => string
    resolve: (...paths: string[]) => string
    dirname: (p: string) => string
  }
  export default path
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}

declare var process: {
  env: Record<string, string | undefined>
}
