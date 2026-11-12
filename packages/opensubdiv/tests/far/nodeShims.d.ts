// Node builtins used by the far fixture loaders beyond types/globals.d.ts
// (tests only; the shims there cover the other tests).

declare module 'node:zlib' {
  export function gunzipSync(data: Uint8Array): Uint8Array<ArrayBuffer>
}

declare class TextDecoder {
  constructor(label?: string)
  decode(input: Uint8Array): string
}

declare function atob(data: string): string
