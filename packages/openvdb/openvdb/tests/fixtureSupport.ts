// Shared helpers for the tests against tests/fixtures/gridTransformer
// (native OpenVDB 10.1.0 capture; see FIXTURES.md).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { File, type VdbGrid } from '../src/index.ts'

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/gridTransformer/', import.meta.url))

export interface BBoxJson {
  min: [number, number, number]
  max: [number, number, number]
}

export interface DenseJson {
  dim: [number, number, number]
  fnv1a64: string
  samples: { offset: number; bits: number[] }[]
}

export interface ResampledJson {
  scale: number
  matrix: number[]
  mapType: string
  mat4: number[]
  bbox: BBoxJson | null
  activeVoxelCount: number
  leafCount: number
  dense: DenseJson | null
  threadedSameActiveTopology: boolean
}

export interface GridJson {
  name: string
  type: string
  class: string
  mapType: string
  mat4: number[]
  bbox: BBoxJson | null
  activeVoxelCount: number
  leafCount: number
  dense: DenseJson | null
  resampled: ResampledJson[]
}

export const expected = JSON.parse(readFileSync(FIXTURE_DIR + 'expected.json', 'utf8')) as {
  files: Record<string, GridJson[]>
}

export async function readGrid(file: string, name: string): Promise<VdbGrid> {
  const f = new File(new Uint8Array(readFileSync(FIXTURE_DIR + file)))
  await f.open()
  return f.readGrid(name)
}

/** FNV-1a 64 of the bytes of `data` (as capture.cpp fnv1a64), lowercase hex */
export function fnv1a64(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  let lo = 0x84222325
  let hi = 0xcbf29ce4
  for (let i = 0; i < bytes.length; ++i) {
    lo = (lo ^ bytes[i]!) >>> 0
    // h *= 0x100000001b3 = h * 0x1b3 + (h << 40)
    const l = lo * 0x1b3
    const carry = Math.floor(l / 4294967296)
    hi = (Math.imul(hi, 0x1b3) + carry + (lo << 8)) >>> 0
    lo = l >>> 0
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0')
}

/** the sampled voxels' float bits, as capture.cpp denseJson records them */
export function sampleBits(data: Float32Array, comps: number, offsets: number[]): number[][] {
  const u32 = new Uint32Array(data.buffer, data.byteOffset, data.length)
  return offsets.map((n) => Array.from(u32.subarray(n * comps, (n + 1) * comps)))
}

export function bboxJson(b: { min: number[]; max: number[] }): BBoxJson | null {
  if (b.min[0]! > b.max[0]! || b.min[1]! > b.max[1]! || b.min[2]! > b.max[2]!) return null
  return { min: [b.min[0]!, b.min[1]!, b.min[2]!], max: [b.max[0]!, b.max[1]!, b.max[2]!] }
}
