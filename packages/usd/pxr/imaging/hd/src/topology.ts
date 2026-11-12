// Ported from OpenUSD 26.11.1: pxr/imaging/hd/topology.cpp,
//  pxr/imaging/hd/topology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/topology.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergence: ID (uint64_t) is a bigint.

/** topology.h:19-28 */
export abstract class HdTopology {
  /** Returns the hash value of this topology to be used for instancing. */
  abstract computeHash(): bigint
}

export type HdTopologyID = bigint
