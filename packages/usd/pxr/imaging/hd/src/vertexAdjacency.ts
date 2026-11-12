// Ported from OpenUSD 26.11.1: pxr/imaging/hd/vertexAdjacency.cpp,
//  pxr/imaging/hd/vertexAdjacency.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/vertexAdjacency.{h,cpp} (OpenUSD 26.11.1).
//
// Hd_VertexAdjacency encapsulates mesh adjacency information, which is used
// for smooth normal computation (vertexAdjacency.h:25-57). The table is split
// into two parts: the first numPoints*2 ints are [offset, valence] per point;
// then, at each point's offset, `valence` pairs of (prev, next) adjacent
// vertex indices.
//
// Deliberate divergences:
// - VtIntArray _adjacencyTable is an Int32Array.
// - HD_PERF_COUNTER_ADD/SUBTRACT(adjacencyBufSize) (vertexAdjacency.cpp:25,
//   82-89) is counted in BuildAdjacencyTable(topology); there is no
//   destructor to pair the subtraction with.

import { HdTokens, HdPerfTokens } from './tokens.ts'
import type { HdMeshTopology } from './meshTopology.ts'
import { HdPerfLog } from './perfLog.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** vertexAdjacency.h:58-86 */
export class Hd_VertexAdjacency {
  private _numPoints = 0
  private _adjacencyTable: Int32Array = new Int32Array(0)

  getNumPoints(): number { return this._numPoints }
  getAdjacencyTable(): Int32Array { return this._adjacencyTable }

  /** vertexAdjacency.cpp:29-120. Updates the internal adjacency table using
   *  the supplied topology. Important! The adjacency table needs to be
   *  computed before smooth normals. */
  buildAdjacencyTable(topology: HdMeshTopology): void {
    // compute adjacency

    const numVertsPtr = topology.getFaceVertexCounts()
    const vertsPtr = topology.getFaceVertexIndices()
    const numFaces = numVertsPtr.length
    const flip = topology.getOrientation() !== HdTokens.rightHanded
    const perfLog = HdPerfLog.GetInstance()

    // An empty VtIntArray's cdata() is null (vertexAdjacency.cpp:39).
    if (numFaces > 0 && vertsPtr.length === 0) {
      TF_WARN('Topology missing face vertex indices.')
      this._numPoints = 0
      this._adjacencyTable = new Int32Array(0)
      return
    }

    // compute numPoints from topology indices
    this._numPoints = topology.getNumPoints()

    // Track the number of entries needed the adjacency table.
    // We start by needing 2 per point (offset and valence).
    let numEntries = this._numPoints * 2

    // Compute the size of each entry, so we can work out the offsets.
    const vertexValence = new Int32Array(this._numPoints)

    let vertIndex = 0
    for (let i = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!
      for (let j = 0; j < nv; ++j) {
        const index = vertsPtr[vertIndex++]!
        if (!(index >= 0 && index < this._numPoints)) {
          TF_WARN(`vertex index out of range index: ${index} numPoints: ${this._numPoints}`)
          this._numPoints = 0
          this._adjacencyTable = new Int32Array(0)
          return
        }
        vertexValence[index] = vertexValence[index]! + 1
      }

      // Increase the number of entries needed by 2 (prev & next index).
      // for every vertex in the face.
      numEntries += 2 * nv
    }

    // Each entry is a count followed by pairs of adjacent vertex indices.
    // We use a uniform entry size for all vertices, this allows faster
    // lookups at the cost of some additional memory.
    perfLog.subtractCounter(HdPerfTokens.adjacencyBufSize, this._adjacencyTable.length * 4)

    const adjacencyTable = new Int32Array(numEntries)
    perfLog.addCounter(HdPerfTokens.adjacencyBufSize, numEntries * 4)

    // Fill out first part of buffer with offsets.  Even though we
    // know counts, don't fill them out now, so we know how many indices
    // we've written so far.
    let currentOffset = this._numPoints * 2
    for (let pointNum = 0; pointNum < this._numPoints; ++pointNum) {
      adjacencyTable[pointNum * 2] = currentOffset
      currentOffset += 2 * vertexValence[pointNum]!
    }

    vertIndex = 0
    for (let i = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!
      for (let j = 0; j < nv; ++j) {
        let prev = vertsPtr[vertIndex + (j + nv - 1) % nv]!
        const curr = vertsPtr[vertIndex + j]!
        let next = vertsPtr[vertIndex + (j + 1) % nv]!
        if (flip) { const t = prev; prev = next; next = t }

        const entryOffset = adjacencyTable[curr * 2 + 0]!
        const entryCount = adjacencyTable[curr * 2 + 1]!

        const pairOffset = entryOffset + entryCount * 2
        adjacencyTable[curr * 2 + 1] = entryCount + 1

        adjacencyTable[pairOffset + 0] = prev
        adjacencyTable[pairOffset + 1] = next
      }
      vertIndex += nv
    }
    this._adjacencyTable = adjacencyTable
  }
}
