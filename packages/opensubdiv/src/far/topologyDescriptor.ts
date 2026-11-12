// Ported from OpenSubdiv 3.7.0: opensubdiv/far/topologyDescriptor.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/far/topologyDescriptor.h — Far::TopologyDescriptor,
// adapted to this port's TS conventions and the typescript-usd consumer contract.
//
// CREASE ENCODING DECISION (consumer contract): TopologyDescriptor
// accepts creases in EITHER form, and the factory normalizes to edge pairs:
//
//   - OSD-native edge pairs:  `creaseIndexPairs` (2 vertex indices per sharp
//     edge) + `creaseWeights` (one sharpness per edge).
//   - USD-native runs (PREFERRED by the consumer): `creaseLengths` (run lengths)
//     + `creaseIndices` (flat vertex runs) + `creaseSharpnesses` (one value per
//     RUN, length == creaseLengths.length, OR one per EDGE, length ==
//     sum(creaseLengths[i] - 1)).
//
// A run of N vertices is N-1 sharp edges. The run→pair expansion and the
// per-run/per-edge sharpness resolution happen once in the factory
// (`normalizeCreases`), so every consumer is spared the conversion.

export interface FVarChannel {
  /** Number of distinct face-varying values in this channel. */
  numValues: number
  /** One value index per face-corner (parallels vertIndicesPerFace). */
  valueIndices: ArrayLike<number>
}

export interface TopologyDescriptor {
  numVertices: number
  /** Optional; derived from vertsPerFace.length when omitted. */
  numFaces?: number

  /** USD `faceVertexCounts` — vertices per face. */
  vertsPerFace: ArrayLike<number>
  /** USD `faceVertexIndices` — flat concatenated vertex indices. */
  vertIndicesPerFace: ArrayLike<number>

  //  Creases — supply ONE form (see CREASE ENCODING DECISION above):
  /** OSD-native: 2 vertex indices per sharp edge. */
  creaseIndexPairs?: ArrayLike<number>
  /** OSD-native: one sharpness per edge in creaseIndexPairs. */
  creaseWeights?: ArrayLike<number>
  /** USD-native: run lengths (a run of N verts == N-1 sharp edges). */
  creaseLengths?: ArrayLike<number>
  /** USD-native: flat vertex runs. */
  creaseIndices?: ArrayLike<number>
  /** USD-native: per-run (== creaseLengths.length) or per-edge sharpness. */
  creaseSharpnesses?: ArrayLike<number>

  /** USD `cornerIndices` — direct per-vertex. */
  cornerIndices?: ArrayLike<number>
  /** USD `cornerSharpnesses` — direct per-vertex. */
  cornerWeights?: ArrayLike<number>

  /** USD `holeIndices` — sorted face ids. */
  holeIndices?: ArrayLike<number>

  /** Face-varying channels (UVs etc.) — P2. */
  fvarChannels?: FVarChannel[]

  /** Reverse winding order (default false). */
  isLeftHanded?: boolean
}

/** Resolved crease in OSD-native edge-pair form. */
export interface NormalizedCreases {
  /** 2 vertex indices per sharp edge. */
  indexPairs: number[]
  /** one sharpness per edge. */
  weights: number[]
}

/**
 * Resolve a descriptor's crease specification to canonical edge pairs + weights.
 * Accepts either the edge-pair form or the USD run form (§3). Returns empty
 * arrays when no creases are present.
 */
export function normalizeCreases(desc: TopologyDescriptor): NormalizedCreases {
  // Edge-pair form takes precedence if provided.
  if (desc.creaseIndexPairs && desc.creaseWeights) {
    const indexPairs = Array.from(desc.creaseIndexPairs as ArrayLike<number>)
    const weights = Array.from(desc.creaseWeights as ArrayLike<number>)
    if (indexPairs.length !== weights.length * 2) {
      throw new Error(
        `TopologyDescriptor: creaseIndexPairs (${indexPairs.length}) must be 2× creaseWeights (${weights.length}).`,
      )
    }
    return { indexPairs, weights }
  }

  // USD run form.
  if (desc.creaseLengths && desc.creaseIndices && desc.creaseSharpnesses) {
    const lengths = desc.creaseLengths
    const indices = desc.creaseIndices
    const sharp = desc.creaseSharpnesses

    let totalEdges = 0
    for (let i = 0; i < lengths.length; ++i) totalEdges += Math.max(0, lengths[i]! - 1)

    const perRun = sharp.length === lengths.length
    const perEdge = sharp.length === totalEdges
    if (!perRun && !perEdge) {
      throw new Error(
        `TopologyDescriptor: creaseSharpnesses length ${sharp.length} matches neither ` +
          `per-run (${lengths.length}) nor per-edge (${totalEdges}).`,
      )
    }

    const indexPairs: number[] = []
    const weights: number[] = []
    let cursor = 0 // position within the flat creaseIndices run list
    let edge = 0 // global edge counter (for per-edge sharpness)
    for (let run = 0; run < lengths.length; ++run) {
      const len = lengths[run]!
      for (let k = 0; k < len - 1; ++k) {
        const v0 = indices[cursor + k]!
        const v1 = indices[cursor + k + 1]!
        indexPairs.push(v0, v1)
        weights.push(perRun ? sharp[run]! : sharp[edge]!)
        edge++
      }
      cursor += len
    }
    return { indexPairs, weights }
  }

  return { indexPairs: [], weights: [] }
}
