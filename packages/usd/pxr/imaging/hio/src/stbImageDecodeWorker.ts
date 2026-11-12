// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The worker of stbImageDecodePool.ts: decodes one image file per message
// with Hio_StbDecodePixels and posts the pixels back (transferred), with
// the warnings to report on the page's thread.
// No upstream counterpart: upstream's texture loads run on TBB worker
// threads (hdSt/textureObjectRegistry.cpp:236-244, WorkParallelForEach).

import { Hio_OpenEXRDecodePixels, Hio_StbDecodePixels } from './stbImagePixels.ts'

interface _Request { id: number, bytes: Uint8Array, ext: string, exr?: { channels: number, part: number, mip: number } }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<_Request>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

scope.onmessage = event => {
  const { id, bytes, ext, exr } = event.data
  const warnings: string[] = []
  if (exr) {
    Hio_OpenEXRDecodePixels(bytes, exr.channels, exr.part, exr.mip).then(
      decoded => scope.postMessage({ id, decoded, warnings }, decoded.data ? [decoded.data.buffer as ArrayBuffer] : []),
      (error: unknown) => scope.postMessage({ id, error: String(error) }))
    return
  }
  Hio_StbDecodePixels(bytes, ext, message => { warnings.push(message) }).then(
    decoded => scope.postMessage({ id, decoded, warnings }, decoded ? [decoded.data.buffer as ArrayBuffer] : []),
    (error: unknown) => scope.postMessage({ id, error: String(error) }))
}
