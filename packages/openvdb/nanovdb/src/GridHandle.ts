// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/GridHandle.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/GridHandle.h: owns a buffer holding one or more
// back-to-back NanoVDB grids and hands out typed grid views.

import {
  GRID_DATA_SIZE,
  GridType,
  NANOVDB_MAGIC_GRID,
  NANOVDB_MAGIC_NUMB,
  NanoGrid,
  Version,
  floatTraits,
  traitsForGridType,
  vec3fTraits,
  type ValueTraits,
} from './NanoVDB.ts'
import type { Vec3 } from './math/Math.ts'

export class GridHandle {
  readonly buffer: ArrayBuffer
  private readonly dv: DataView
  private readonly offsets: number[] = [] // byte offset of each grid

  /**
   * Wrap a buffer that already holds raw NanoVDB grid(s) — the in-memory
   * stream, NOT a .nvdb file (io/IO.ts parses files and constructs handles).
   */
  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer
    this.dv = new DataView(buffer)
    let off = 0
    while (off + GRID_DATA_SIZE <= buffer.byteLength) {
      const magic = this.dv.getBigUint64(off, true)
      if (magic !== NANOVDB_MAGIC_NUMB && magic !== NANOVDB_MAGIC_GRID) {
        throw new Error(`invalid NanoVDB grid magic at byte offset ${off}`)
      }
      this.offsets.push(off)
      const gridSize = Number(this.dv.getBigUint64(off + 32, true))
      if (gridSize <= 0) throw new Error(`invalid grid size at byte offset ${off}`)
      off += gridSize
      if (this.offsets.length === this.gridCountAt(0)) break
    }
    if (this.offsets.length === 0) throw new Error('buffer contains no NanoVDB grids')
  }

  private gridCountAt(gridOffset: number): number {
    return this.dv.getUint32(gridOffset + 28, true)
  }

  gridCount(): number {
    return this.offsets.length
  }

  size(): number {
    return this.buffer.byteLength
  }

  /** byte view of the whole buffer (upstream GridHandle::data) — what a GPU upload consumes */
  data(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  /** byte view of grid n's region (upstream GridHandle::gridData) */
  gridData(n = 0): Uint8Array {
    const off = this.offsets[n]
    if (off === undefined) throw new RangeError(`grid index ${n} out of range`)
    return new Uint8Array(this.buffer, off, this.gridSize(n))
  }

  gridSize(n = 0): number {
    const off = this.offsets[n]
    if (off === undefined) throw new RangeError(`grid index ${n} out of range`)
    return Number(this.dv.getBigUint64(off + 32, true))
  }

  gridType(n = 0): GridType {
    const off = this.offsets[n]
    if (off === undefined) throw new RangeError(`grid index ${n} out of range`)
    return this.dv.getUint32(off + 636, true)
  }

  version(n = 0): Version {
    const off = this.offsets[n]
    if (off === undefined) throw new RangeError(`grid index ${n} out of range`)
    return new Version(this.dv.getUint32(off + 16, true))
  }

  /** Untyped grid view (metadata access; upstream GridHandle::gridMetaData). */
  gridMetaData(n = 0): NanoGrid<unknown> {
    const off = this.offsets[n]
    if (off === undefined) throw new RangeError(`grid index ${n} out of range`)
    return new NanoGrid(this.buffer, off, traitsForType(this.gridType(n)))
  }

  /** Typed float grid, or null if grid n is not a Float grid (upstream grid<float>()). */
  floatGrid(n = 0): NanoGrid<number> | null {
    if (this.gridType(n) !== GridType.Float) return null
    return new NanoGrid<number>(this.buffer, this.offsets[n]!, floatTraits)
  }

  /** Typed Vec3f grid, or null if grid n is not a Vec3f grid (upstream grid<Vec3f>()). */
  vec3fGrid(n = 0): NanoGrid<Vec3> | null {
    if (this.gridType(n) !== GridType.Vec3f) return null
    return new NanoGrid<Vec3>(this.buffer, this.offsets[n]!, vec3fTraits)
  }
}

function traitsForType(t: GridType): ValueTraits<unknown> {
  try {
    return traitsForGridType(t) as ValueTraits<unknown>
  } catch {
    // metadata view of a value type V1 cannot sample yet: float layout is
    // wrong for its tree, but all GridData fields (the metadata) are safe.
    return floatTraits as ValueTraits<unknown>
  }
}
