// Ported from OpenSubdiv 3.7.0: opensubdiv/far/topologyLevel.h
// Copyright 2015 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/far/topologyLevel.h — Far::TopologyLevel.
//
// A read-only view of one refinement level's topology. Exposes the refined
// face topology in USD-shaped form (faceVertexCounts / faceVertexIndices) so a
// consumer can feed it straight into a triangulator, plus the usual counts.

import type { Level } from '../vtr/level.ts'
import type { Refinement } from '../vtr/refinement.ts'

export class TopologyLevel {
  private _level: Level
  constructor(level: Level, private _refToParent?: Refinement) {
    this._level = level
  }

  getNumVertices(): number {
    return this._level.getNumVertices()
  }
  getNumFaces(): number {
    return this._level.getNumFaces()
  }
  getNumEdges(): number {
    return this._level.getNumEdges()
  }

  // OpenSubdiv v3.7.0 far/topologyLevel.h:263.
  getFaceParentFace(face: number): number {
    if (!this._refToParent) throw new Error('The base level has no parent faces')
    return this._refToParent.getChildFaceParentFace(face)
  }

  /** Per-face vertex counts — same shape as USD `faceVertexCounts`. */
  getFaceVertexCounts(): Int32Array {
    const n = this._level.getNumFaces()
    const counts = new Int32Array(n)
    for (let f = 0; f < n; ++f) counts[f] = this._level.getNumFaceVertices(f)
    return counts
  }

  /** Flat concatenated face-vertex indices — same shape as USD `faceVertexIndices`. */
  getFaceVertexIndices(): Int32Array {
    // The level stores face-vertices contiguously in face order, so the flat
    // index table is exactly what USD wants. Copy it out (caller-owned).
    return this._level.getAllFaceVertices().slice()
  }

  /** Vertices of a single face (view into the level's storage). */
  getFaceVertices(face: number): Int32Array {
    return this._level.getFaceVertices(face)
  }

  isFaceHole(face: number): boolean {
    return this._level.isFaceHole(face)
  }

  // ---- face-varying readback --------------------------------------------

  getNumFVarChannels(): number {
    return this._level.getNumFVarChannels()
  }
  /** Number of distinct face-varying values in `channel` at this level. */
  getNumFVarValues(channel = 0): number {
    return this._level.getNumFVarValues(channel)
  }
  /**
   * Flat per-face-corner fvar value indices for `channel` — parallels
   * GetFaceVertexIndices(). Index the interpolated fvar buffer by these to get
   * the value (e.g. UV) at each refined face corner.
   */
  getFaceFVarValues(channel = 0): Int32Array {
    return this._level.getFVarLevel(channel).getAllFaceValues().slice()
  }
}
