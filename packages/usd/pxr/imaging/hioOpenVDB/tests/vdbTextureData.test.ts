// Ported from OpenUSD 26.11.1: pxr/imaging/hioOpenVDB/vdbTextureData.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HioOpenVDB_TextureData against native OpenUSD 26.11.1 HioFieldTextureData
// reads of the upstream testUsdImagingGLVdbVolume grids (the capture of the
// usdVolImaging fixture): bounding box, sizes, format and the dense raw
// buffer (FNV-1a 64 of its bytes), with no target memory and with target
// memories that make it resample the grid (vdbTextureData.cpp:533-560).
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { File } from '@vdb/openvdb'
import { TfDiagnosticMgr, type Warning as TfWarning } from 'typescript-usd/tf'
import { FieldTextureData, HioFormat, HioGetDataSizeOfFormat, isSupportedFieldDataFile } from 'typescript-usd/hio'
import 'typescript-usd/hioOpenVDB'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

const root = new URL('../../../usdImaging/usdVolImaging/tests/fixtures/testUsdImagingGLVdbVolume/', import.meta.url)
interface FieldRead {
  file: string, grid: string, read: boolean, targetMemory?: number,
  rangeMin?: number[], rangeMax?: number[], matrix?: number[], resized?: number[],
  format?: number, bytes?: number, rawFnv1a64?: string
}
const native = readOracleFixture(new URL('expected.json', root)) as {
  times: { densityData: FieldRead }[], densityAndHeat: FieldRead[], targetMemory: FieldRead[]
}
const reads = [...native.times.map(time => time.densityData), ...native.densityAndHeat, ...native.targetMemory]

/** FNV-1a 64 of bytes, as the capture computes it. */
function fnv1a64(bytes: Uint8Array): string {
  let h = 0xcbf29ce484222325n
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

describe('HioOpenVDB_TextureData', () => {
  it('registers the vdb field data type (hioOpenVDB/plugInfo.json)', () => {
    expect(isSupportedFieldDataFile('/a/b/smoke.VDB')).toBe(true)
  })

  for (const expected of reads) {
    const memory = expected.targetMemory ?? 0
    it(`reads ${expected.file} grid '${expected.grid}' (target memory ${memory}) as native Hio does`, async () => {
      const path = fileURLToPath(new URL(expected.file, root))
      const data = FieldTextureData.new(path, expected.grid, 0, '', memory)!
      expect(data).not.toBeNull()
      expect(await data.Read()).toBe(expected.read)
      if (!expected.read) {
        expect(data.hasRawBuffer()).toBe(false)
        return
      }
      const bbox = data.getBoundingBox()
      expect([...bbox.getRange().getMin().data]).toEqual(expected.rangeMin)
      expect([...bbox.getRange().getMax().data]).toEqual(expected.rangeMax)
      expect([...bbox.getMatrix().GetArray()]).toEqual(expected.matrix)
      expect([data.resizedWidth(), data.resizedHeight(), data.resizedDepth()]).toEqual(expected.resized)
      expect(data.GetFormat()).toBe(expected.format)
      expect(data.GetFormat()).toBe(HioFormat.HioFormatFloat32)
      expect(data.hasRawBuffer()).toBe(true)
      const raw = data.getRawBuffer()!
      expect(raw.byteLength).toBe(expected.bytes)
      expect(raw.byteLength).toBe(
        data.resizedWidth() * data.resizedHeight() * data.resizedDepth() * HioGetDataSizeOfFormat(data.GetFormat()))
      expect(fnv1a64(raw)).toBe(expected.rawFnv1a64)
    })
  }
})

// A file whose int32 and bool grids HioOpenVDB_TextureData does not hold,
// around two float grids, written by the native OpenVDB and read through
// native Hio (fixtures/mixedGridTypes): each read touches only
// its own grid, so the float grids load and the others warn and fail.
describe('HioOpenVDB_TextureData with unsupported grids in the file', () => {
  const mixedRoot = new URL('fixtures/mixedGridTypes/', import.meta.url)
  const mixed = readOracleFixture(new URL('expected.json', mixedRoot)) as {
    descriptors: { name: string, type: string }[]
    reads: (FieldRead & { warnings: string[] })[]
  }
  const dir = fileURLToPath(mixedRoot)
  const path = fileURLToPath(new URL('mixedGridTypes.vdb', mixedRoot))

  it('opens the file with the native grid names and types', async () => {
    const file = new File(readFileSync(path))
    await file.open()
    expect(file.gridDescriptors().map(d => ({ name: d.gridName, type: d.gridType })))
      .toEqual(expect.arrayContaining(mixed.descriptors))
    expect(file.gridDescriptors()).toHaveLength(mixed.descriptors.length)
  })

  // openvdb::io::File::readGrid reads one grid by its descriptor; getGrids
  // reads them all (File.cc readGridByName, getGrids).
  it('reads float grids by name past grids of types the port cannot read', async () => {
    const file = new File(readFileSync(path))
    await file.open()
    const readable = mixed.reads.filter(r => r.read).map(r => r.grid)
    for (const name of readable) expect((await file.readGrid(name)).getName()).toBe(name)
    await expect(file.readGrid('index')).rejects.toThrow('Tree_int32_5_4_3')
    await expect(file.getGrids()).rejects.toThrow()
  })

  for (const expected of mixed.reads) {
    it(`reads grid '${expected.grid}' as native Hio does, with its warnings`, async () => {
      const warnings: TfWarning[] = []
      const delegate = { issueError() {}, issueWarning: (w: TfWarning) => { warnings.push(w) }, issueStatus() {} }
      TfDiagnosticMgr.GetInstance().addDelegate(delegate)
      let read: boolean
      const data = FieldTextureData.new(path, expected.grid, 0, '', 0)!
      try { read = await data.Read() } finally { TfDiagnosticMgr.GetInstance().removeDelegate(delegate) }
      expect(read).toBe(expected.read)
      expect(warnings.map(w => w.getCommentary().replaceAll(dir, ''))).toEqual(expected.warnings)
      expect(data.hasRawBuffer()).toBe(expected.read)
      if (!expected.read) return
      const bbox = data.getBoundingBox()
      expect([...bbox.getRange().getMin().data]).toEqual(expected.rangeMin)
      expect([...bbox.getRange().getMax().data]).toEqual(expected.rangeMax)
      expect([...bbox.getMatrix().GetArray()]).toEqual(expected.matrix)
      expect([data.resizedWidth(), data.resizedHeight(), data.resizedDepth()]).toEqual(expected.resized)
    })
  }
})
