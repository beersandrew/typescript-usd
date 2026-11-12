// Ported from OpenUSD 26.11.1: pxr/imaging/hd/geomSubset.cpp,
//  pxr/imaging/hd/geomSubset.h
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/imaging/hd/geomSubset.h:23-58.
export enum HdGeomSubsetType { TypeFaceSet }
export interface HdGeomSubset {
  type: HdGeomSubsetType
  id: string
  materialId: string
  indices: number[]
}
