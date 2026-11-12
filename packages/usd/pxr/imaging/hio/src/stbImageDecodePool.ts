// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureObjectRegistry.cpp,
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2018, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Runs Hio_StbImage's pixel decoding (stbImagePixels.ts) on a pool of Web
// Workers, so that independent texture loads decode in parallel as
// upstream's do: HdSt_TextureObjectRegistry::Commit loads the textures with
// WorkParallelForEach (hdSt/textureObjectRegistry.cpp:236-244) and each load
// decodes its file in Hio_StbImage::ReadCropped (stbImage.cpp:427-460).
// In the browser the decode (the stb_image ports, stbImageDecode.ts)
// otherwise runs on the page's one thread, so the
// concurrent loads of HdSt_TextureObjectRegistry.LoadAsync finish one after
// another. Where there are no workers (Node, the tests) the same function
// runs on the calling thread, as WorkParallelForEach does with a single
// thread. The decoded pixels are the same either way: Hio_StbDecodePixels is
// a pure function of the bytes and the extension.
// No upstream counterpart (threads are TBB's there).

import { RaiseWarning } from 'typescript-usd/tf'
import { Hio_OpenEXRDecodePixels, Hio_StbDecodePixels, type Hio_OpenEXRDecoded, type Hio_StbDecoded } from './stbImagePixels.ts'

export type { Hio_OpenEXRDecoded, Hio_StbDecoded } from './stbImagePixels.ts'

// The pool also runs Hio_OpenEXRImage's pixel decode (openexrHioImage.ts,
// nanoexr_read_exr), as upstream's texture loads decode EXR files on the
// same worker threads.
interface _Pending { resolve(decoded: Hio_StbDecoded | Hio_OpenEXRDecoded | null): void, reject(error: Error): void }
interface _PoolWorker { worker: Worker, inFlight: Set<number> }

/** Workers, at most this many: the hardware threads but one for the page,
 *  bounded so that the decodes in flight stay within memory (a 2048 x 2048
 *  image is 12-16 MB decoded). */
const _MaxWorkers = 8

const _workers: _PoolWorker[] = []
const _pending = new Map<number, _Pending>()
let _nextId = 0

function _CreateWorker(): _PoolWorker {
  const worker = new Worker(new URL('./stbImageDecodeWorker.ts', import.meta.url), { type: 'module', name: 'Hio_StbImage decode' })
  const entry: _PoolWorker = { worker, inFlight: new Set() }
  worker.onmessage = (event: MessageEvent<{ id: number, decoded?: Hio_StbDecoded | Hio_OpenEXRDecoded | null, warnings?: string[], error?: string }>) => {
    const { id, decoded, warnings, error } = event.data
    for (const message of warnings ?? []) RaiseWarning(message)
    const pending = _pending.get(id)
    if (!pending) return
    _pending.delete(id)
    entry.inFlight.delete(id)
    if (error !== undefined) pending.reject(new Error(error))
    else pending.resolve(decoded ?? null)
  }
  worker.onerror = event => {
    // A worker that fails to load or throws outside a decode leaves the
    // pool; its decodes fail (those images do not open), with a warning.
    RaiseWarning(`Hio_StbImage: image decode worker failed: ${event.message}`)
    _workers.splice(_workers.indexOf(entry), 1)
    worker.terminate()
    for (const id of entry.inFlight) {
      _pending.get(id)?.reject(new Error(`image decode worker failed: ${event.message}`))
      _pending.delete(id)
    }
    entry.inFlight.clear()
  }
  _workers.push(entry)
  return entry
}

function _PickWorker(): _PoolWorker {
  const hardware = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
  const limit = Math.max(1, Math.min(_MaxWorkers, hardware - 1))
  const idle = _workers.find(w => w.inFlight.size === 0)
  if (idle) return idle
  if (_workers.length < limit) return _CreateWorker()
  return _workers.reduce((a, b) => (b.inFlight.size < a.inFlight.size ? b : a))
}

/** Hio_StbDecodePixels on a worker of the pool (on the calling thread where
 *  there are no workers). `bytes` is copied, not transferred: the asset's
 *  buffer stays with its owner. */
export function Hio_StbDecodeOnWorkers(bytes: Uint8Array, ext: string): Promise<Hio_StbDecoded | null> {
  if (typeof Worker !== 'function') {
    return Hio_StbDecodePixels(bytes, ext, RaiseWarning)
  }
  return _Post({ bytes, ext }) as Promise<Hio_StbDecoded | null>
}

/** Hio_OpenEXRDecodePixels (nanoexr_read_exr of part `part` at `mip`,
 *  `channels` channels) on a worker of the pool (on the calling thread
 *  where there are no workers). */
export function Hio_OpenEXRDecodeOnWorkers(bytes: Uint8Array, channels: number, part: number,
  mip: number): Promise<Hio_OpenEXRDecoded> {
  if (typeof Worker !== 'function') {
    return Hio_OpenEXRDecodePixels(bytes, channels, part, mip)
  }
  return _Post({ bytes, ext: 'exr', exr: { channels, part, mip } }) as Promise<Hio_OpenEXRDecoded>
}

function _Post(message: object): Promise<Hio_StbDecoded | Hio_OpenEXRDecoded | null> {
  const entry = _PickWorker()
  const id = _nextId++
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject })
    entry.inFlight.add(id)
    entry.worker.postMessage({ id, ...message })
  })
}
