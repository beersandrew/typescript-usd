// @vdb/nanovdb — TypeScript port of NanoVDB (nanovdb/nanovdb/ in the ASWF
// OpenVDB repository, pinned 32.9.1). Read + sample scope: .nvdb parsing,
// GridHandle over an ArrayBuffer, tree traversal/sampling, index↔world
// transforms. See packages/openvdb/README.md.

export {
  NANOVDB_MAJOR_VERSION_NUMBER,
  NANOVDB_MINOR_VERSION_NUMBER,
  NANOVDB_PATCH_VERSION_NUMBER,
  NANOVDB_DATA_ALIGNMENT,
  NANOVDB_MAGIC_NUMB,
  NANOVDB_MAGIC_GRID,
  NANOVDB_MAGIC_FILE,
  NANOVDB_MAGIC_MASK,
  GridType,
  GridClass,
  GridFlags,
  GridBlindDataClass,
  Version,
  NanoMap,
  NanoMask,
  NanoGrid,
  Tree,
  RootNode,
  UpperInternalNode,
  LowerInternalNode,
  LeafNode,
  ReadAccessor,
  leafCoordToOffset,
  lowerCoordToOffset,
  upperCoordToOffset,
  coordToKey,
  floatTraits,
  vec3fTraits,
  traitsForGridType,
  FLOAT_LAYOUT,
  VEC3F_LAYOUT,
  GRID_DATA_SIZE,
  TREE_DATA_SIZE,
} from './NanoVDB.ts'
export type { GridLayout, ValueTraits, RootTile } from './NanoVDB.ts'
export type { Coord, CoordBBox, Vec3, Vec3dBBox } from './math/Math.ts'
export { fma, matMult, matMult3 } from './math/Math.ts'
export { Ray, roundDown } from './math/Ray.ts'
export { HDDA, zeroCrossing } from './math/HDDA.ts'
export type { ZeroCrossingHit } from './math/HDDA.ts'
export {
  NearestNeighborSampler,
  TrilinearSampler,
  TrilinearVec3Sampler,
  createSampler,
} from './math/SampleFromVoxels.ts'
export { GridHandle } from './GridHandle.ts'
export { pnanovdbWGSL, PNANOVDB_WGSL_CONSTANTS } from './wgsl/PNanoVDB.ts'
export type { PNanoVDBWGSLOptions } from './wgsl/PNanoVDB.ts'
export { Codec, readGrid, readGrids, readGridMetaData } from './io/IO.ts'
export type { FileHeader, FileGridMetaData, Segment } from './io/IO.ts'
