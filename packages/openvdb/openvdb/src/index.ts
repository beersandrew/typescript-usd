// @vdb/openvdb — TypeScript port of OpenVDB (openvdb/openvdb/ in the ASWF
// OpenVDB repository, pinned 13.0.1). Read scope: .vdb archive parsing,
// converting to the NanoVDB in-memory representation from @vdb/nanovdb.
// See packages/openvdb/README.md.

export const OPENVDB_LIBRARY_MAJOR_VERSION_NUMBER = 13
export const OPENVDB_LIBRARY_MINOR_VERSION_NUMBER = 0
export const OPENVDB_LIBRARY_PATCH_VERSION_NUMBER = 1

export { File, readHeader, OPENVDB_MAGIC, OPENVDB_FILE_VERSION } from './io/File.ts'
export type { ArchiveHeader } from './io/File.ts'
export { GridDescriptor } from './io/GridDescriptor.ts'
export {
  COMPRESS_NONE,
  COMPRESS_ZIP,
  COMPRESS_ACTIVE_MASK,
  COMPRESS_BLOSC,
  compressionToString,
  readCompressedValues,
} from './io/Compression.ts'
export { bloscDecompress } from './io/Blosc.ts'
export { Stream } from './io/Stream.ts'
export { Metadata, readMetadata } from './Metadata.ts'
export type { MetaValue } from './Metadata.ts'
export { MetaMap } from './MetaMap.ts'
export { Transform } from './math/Transform.ts'
export { readMap, simplify, ScaleMap, ScaleTranslateMap, TranslationMap, AffineMap } from './math/Maps.ts'
export { mat4Inverse, mat4Mul } from './math/Mat4.ts'
export type { Mat4d } from './math/Mat4.ts'
export type { MapBase } from './math/Maps.ts'
export { halfToFloat } from './math/Half.ts'
export { VdbGrid, GridClass, GRID_CLASS_STRINGS, compsForGridType } from './Grid.ts'
export { VdbTree } from './tree/Tree.ts'
export { createNanoGrid } from './tools/CreateNanoGrid.ts'
export { copyToDense } from './tools/Dense.ts'
export { resampleToMatchBox, changeBackground, GridTransformer } from './tools/GridTransformer.ts'
export { BoxSampler, boxSample } from './tools/Interpolation.ts'
export { ValueAccessor } from './tree/ValueAccessor.ts'
export type { VdbLeafNode, VdbInternalNode } from './tree/Tree.ts'
