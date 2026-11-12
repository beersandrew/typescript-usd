// Ported from OpenUSD 26.11.1: pxr/imaging/hioOpenVDB/vdbTextureData.cpp,
//  pxr/imaging/hioOpenVDB/vdbTextureData.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/imaging/hioOpenVDB/vdbTextureData.{h,cpp}:
// HioOpenVDB_TextureData, the field texture data for OpenVDB files,
// registered for the "vdb" field data type (hioOpenVDB/plugInfo.json).
// Grids are read with @vdb/openvdb (an OpenVDB port); as upstream, a grid
// larger than the target memory is resampled with
// tools::resampleToMatch<BoxSampler> and then copied into a dense,
// x-fastest voxel array (tools::copyToDense, LayoutXYZ) that Storm uploads
// as a 3D texture.
//
// Divergences (each also noted at its site):
// - Read() is asynchronous (hio/fieldTextureData.ts).
// - The asset is read through the resolver (ArResolver::OpenAsset), the
//   path upstream takes for non-file paths (HioOpenVDBGridFromAsset,
//   vdbTextureData.cpp:434-444); a plain file path is not opened with
//   openvdb::io::File directly.
// - @vdb/openvdb reads float and Vec3f grids; upstream also holds DoubleGrid
//   and Vec3dGrid (_GridHolderBase::New, vdbTextureData.cpp:349-381). Those
//   grids fail to parse here (the reader's grid types).
import {
  File as VdbFile,
  Transform as VdbTransform,
  VdbGrid,
  copyToDense as VdbCopyToDense,
  resampleToMatchBox as VdbResampleToMatchBox,
} from '@vdb/openvdb'
import { BBox3d as GfBBox3d, Range3d as GfRange3d, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec4d as GfVec4d } from 'typescript-usd/gf'
import { openAssetBytes, type ArResolverContext } from 'typescript-usd/ar/_internal'
import { Debug as TfDebug, RaiseWarning as TfRaiseWarning } from 'typescript-usd/tf'
import {
  FieldTextureData as HioFieldTextureData,
  HioFormat,
  registerFieldTextureDataFactory,
} from 'typescript-usd/hio'
import { HioOpenVDBDebugCodes } from './debugCodes.ts'

// One fetch and open per asset while reads are in flight: File.open reads
// the grid descriptors, so fields naming different grids of one file share
// it and each reads only its own grid.
const _openFiles = new Map<string, Promise<VdbFile>>()

function _OpenFile(filePath: string, resolverContext: ArResolverContext | undefined): Promise<VdbFile> {
  let pending = _openFiles.get(filePath)
  if (!pending) {
    pending = (async () => {
      const file = new VdbFile(await openAssetBytes(filePath, undefined, resolverContext))
      await file.open()
      return file
    })()
    _openFiles.set(filePath, pending)
    const forget = () => { _openFiles.delete(filePath) }
    pending.then(forget, forget)
  }
  return pending
}

const _message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** An OpenVDB CoordBBox: inclusive integer bounds; empty when min > max on
 *  any axis (openvdb/math/Coord.h CoordBBox::empty). */
interface _CoordBBox { min: [number, number, number], max: [number, number, number] }

function _IsEmpty(b: _CoordBBox): boolean {
  return !(b.min[0] <= b.max[0] && b.min[1] <= b.max[1] && b.min[2] <= b.max[2])
}
/** CoordBBox::dim: zero for an empty box. */
function _Dim(b: _CoordBBox): [number, number, number] {
  return _IsEmpty(b) ? [0, 0, 0]
    : [b.max[0] - b.min[0] + 1, b.max[1] - b.min[1] + 1, b.max[2] - b.min[2] + 1]
}
/** CoordBBox::volume */
function _Volume(b: _CoordBBox): number {
  const d = _Dim(b)
  return d[0] * d[1] * d[2]
}

/** vdbTextureData.cpp:120-150. Extracts the transform associated with an
 *  OpenVDB grid. The maps @vdb/openvdb reads (scale, scale-translate,
 *  translation, affine, unitary) are all linear and affine. */
function _ExtractTransformFromGrid(grid: VdbGrid): GfMatrix4d {
  const t = grid.transform
  if (!t) {
    return new GfMatrix4d(1.0)
  }
  // openvdb::math::Mat4d and GfMatrix4d are both row-major with row
  // vectors, so the affine map's matrix is the GfMatrix4d as is.
  const m = t.baseMap.getAffineMat4()
  return new GfMatrix4d(
    m[0]!, m[1]!, m[2]!, m[3]!,
    m[4]!, m[5]!, m[6]!, m[7]!,
    m[8]!, m[9]!, m[10]!, m[11]!,
    m[12]!, m[13]!, m[14]!, m[15]!)
}

/** vdbTextureData.cpp:154-200 _DenseGridHolder: an OpenVDB dense grid
 *  (LayoutXYZ, x fastest) copied from a grid's tree over a bounding box. */
class _DenseGridHolder {
  /** vdbTextureData.cpp:163-174. Null for an empty grid. */
  static new(grid: VdbGrid, bbox: _CoordBBox): _DenseGridHolder | null {
    if (_IsEmpty(bbox)) {
      // Empty grid
      return null
    }
    // Allocate dense grid and copy grid to it.
    return new _DenseGridHolder(grid, bbox)
  }

  private readonly _data: Float32Array

  /** vdbTextureData.cpp:176-186 */
  private constructor(grid: VdbGrid, private readonly _bbox: _CoordBBox) {
    this._data = VdbCopyToDense(grid.tree, _bbox)
  }

  /** vdbTextureData.cpp:188-190 */
  getData(): Uint8Array {
    return new Uint8Array(this._data.buffer, this._data.byteOffset, this._data.byteLength)
  }

  /** vdbTextureData.cpp:192-194 */
  getTreeBoundingBox(): _CoordBBox { return this._bbox }
}

/** vdbTextureData.cpp:200-295 _GridHolderBase / _GridHolder<GridType>:
 *  the grid with its active-voxel bounding box, dispatched by value type
 *  (the template parameter becomes the grid's component count). */
class _GridHolder {
  private readonly _treeBoundingBox: _CoordBBox

  /** vdbTextureData.cpp:236-239 and :247-252 (_ComputeTreeBoundingBox:
   *  grid->evalActiveVoxelBoundingBox()). */
  private constructor(private readonly _grid: VdbGrid) {
    const b = _grid.evalActiveVoxelBoundingBox()
    this._treeBoundingBox = {
      min: [b.min[0], b.min[1], b.min[2]],
      max: [b.max[0], b.max[1], b.max[2]],
    }
  }

  /** vdbTextureData.cpp:349-381 _GridHolderBase::New: float grids and
   *  float-vector grids (see the header for double grids). */
  static new(grid: VdbGrid | null): _GridHolder | null {
    if (!grid) {
      return null
    }
    const valueType = grid.valueType()
    if (valueType === 'float') {
      TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
        '[VdbTextureData] Grid is holding floats\n')
      return new _GridHolder(grid)
    }
    if (valueType === 'vec3s') {
      TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
        '[VdbTextureData] Grid is holding float vectors\n')
      return new _GridHolder(grid)
    }
    TfRaiseWarning('Unsupported OpenVDB grid type')
    return null
  }

  /** vdbTextureData.cpp:224-226 */
  getTreeBoundingBox(): _CoordBBox { return this._treeBoundingBox }

  /** vdbTextureData.cpp:265-267 */
  getGridTransform(): GfMatrix4d { return _ExtractTransformFromGrid(this._grid) }

  /** vdbTextureData.cpp:299-341: (bytesPerPixel, format) by value type. */
  getMetadata(): [number, HioFormat] {
    return this._grid.valueType() === 'vec3s'
      ? [3 * 4, HioFormat.HioFormatFloat32Vec3]
      : [4, HioFormat.HioFormatFloat32]
  }

  /** vdbTextureData.cpp:272-284. A new grid of the same type with the given
   *  transform, resampled with BoxSampler. */
  getResampled(newTransform: GfMatrix4d): _GridHolder | null {
    const result = new VdbGrid(this._grid.type, this._grid.tree.comps)
    result.transform = VdbTransform.createLinearTransform([...newTransform.GetArray()])
    VdbResampleToMatchBox(this._grid, result)
    return _GridHolder.new(result)
  }

  /** vdbTextureData.cpp:286-288 */
  getDense(): _DenseGridHolder | null {
    return _DenseGridHolder.new(this._grid, this.getTreeBoundingBox())
  }
}

/** vdbTextureData.cpp:385-445 _LoadGrid: open the file, warn and fail when
 *  it cannot be parsed or has no grid of the name, otherwise read that grid
 *  only. Other grids of the file, whatever their type, are not read. */
async function _LoadGrid(
  filePath: string, gridName: string, resolverContext: ArResolverContext | undefined,
): Promise<_GridHolder | null> {
  let file: VdbFile
  try {
    file = await _OpenFile(filePath, resolverContext)
  } catch (error) {
    TfRaiseWarning(`Could not parse OpenVDB file: ${_message(error)}`)
    return null
  }
  if (!file.hasGrid(gridName)) {
    TfRaiseWarning(`OpenVDB file ${filePath} has no grid ${gridName}`)
    return null
  }
  let grid: VdbGrid
  try {
    grid = await file.readGrid(gridName)
  } catch (error) {
    // _GridHolderBase::New (:376-377) for a grid type the reader does not
    // hold; other read errors are reported likewise.
    if (/grid type .* is not supported/.test(_message(error))) {
      TfRaiseWarning('Unsupported OpenVDB grid type')
    } else {
      TfRaiseWarning(`Could not read OpenVDB grid ${gridName} from ${filePath}: ${_message(error)}`)
    }
    return null
  }
  return _GridHolder.new(grid)
}

/** vdbTextureData.cpp:447-455 */
function _ToRange3d(b: _CoordBBox): GfRange3d {
  return new GfRange3d(new GfVec3d(b.min[0], b.min[1], b.min[2]), new GfVec3d(b.max[0], b.max[1], b.max[2]))
}

/** vdbTextureData.cpp:457-492 */
function _ResamplingAdjustment(nativeLength: number, scale: number): number {
  // First, we can use the approximate distance to compute how many
  // voxels the texture can have at most accross the direction we
  // consider here to not exceed the target memory.
  const maxNumberOfSamples = Math.floor(nativeLength / scale) | 0

  // Second, before dividing the length of the interval containing all
  // original sampling points by the above number of samples, we account
  // for the fact that re-sampling might pick up ad additional sample
  // at each end.
  return nativeLength / Math.max(1, maxNumberOfSamples - 2)
}

export class HioOpenVDB_TextureData extends HioFieldTextureData {
  private _boundingBox = new GfBBox3d()
  private _resizedWidth = 0
  private _resizedHeight = 0
  private _resizedDepth = 1
  private _format: HioFormat = HioFormat.HioFormatUNorm8Vec3
  private _denseGrid: _DenseGridHolder | null = null

  /** vdbTextureData.cpp:46-57 */
  constructor(
    private readonly _filePath: string,
    private readonly _gridName: string,
    private readonly _targetMemory: number,
  ) { super() }

  /** vdbTextureData.cpp:61-89 */
  getBoundingBox(): GfBBox3d { return this._boundingBox }
  GetFormat(): HioFormat { return this._format }
  resizedWidth(): number { return this._resizedWidth }
  resizedHeight(): number { return this._resizedHeight }
  resizedDepth(): number { return this._resizedDepth }

  /** vdbTextureData.cpp:91-95 */
  hasRawBuffer(): boolean { return this.getRawBuffer() !== null }

  /** vdbTextureData.cpp:614-621 */
  getRawBuffer(): Uint8Array | null {
    if (!this._denseGrid) {
      return null
    }
    return this._denseGrid.getData()
  }

  /** vdbTextureData.cpp:494-612 */
  async Read(resolverContext?: ArResolverContext): Promise<boolean> {
    TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
      `[VdbTextureData] Path: ${this._filePath} GridName: ${this._gridName}\n`)

    // Load grid from OpenVDB file
    let gridHolder = await _LoadGrid(this._filePath, this._gridName, resolverContext)

    if (!gridHolder) {
      // Runtime or coding errors already issued
      return false
    }

    // Get grid transform
    let gridTransform = gridHolder.getGridTransform()

    // Get _bytesPerPixel & _format
    const [bytesPerPixel, format] = gridHolder.getMetadata()
    this._format = format

    // Get tree bounding box to compute native dimensions and size
    const nativeTreeBoundingBox = gridHolder.getTreeBoundingBox()
    const nativeDim = _Dim(nativeTreeBoundingBox)
    const nativeWidth = nativeDim[0]
    const nativeHeight = nativeDim[1]
    // Following convention to set depth to 1 for an empty texture.
    const nativeDepth = Math.max(1, nativeDim[2])

    const nativeSize = _Volume(nativeTreeBoundingBox) * bytesPerPixel

    TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
      `[VdbTextureData] Native dimensions ${nativeWidth} x ${nativeHeight} x ${nativeDepth}\n`)

    // Check whether native size is more than target memory if given
    if (nativeSize > this._targetMemory && this._targetMemory > 0) {
      // We need to down-sample.

      // Compute the spacing of the points where we will
      // (re-)sample the volume.

      // As first approximation, use the cube-root.
      const approxScale = Math.cbrt(nativeSize / this._targetMemory)

      TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
        `[VdbTextureData] Approximate scaling factor ${approxScale.toFixed(6)}\n`)

      // There will be additional samples near the boundary
      // of the original voluem, so scale down a bit more.
      const scale = Math.min(
        _ResamplingAdjustment(nativeWidth, approxScale),
        _ResamplingAdjustment(nativeHeight, approxScale),
        _ResamplingAdjustment(nativeDepth, approxScale))

      TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
        `[VdbTextureData] Scaling by factor ${scale.toFixed(6)}\n`)

      // Apply voxel scaling to grid transform
      gridTransform =
        new GfMatrix4d(new GfVec4d(scale, scale, scale, 1.0)).getMultiply(gridTransform)

      // And resample to match new grid transform
      gridHolder = gridHolder.getResampled(gridTransform)
      if (!gridHolder) {
        return false
      }
    }

    // Convert grid to dense grid
    this._denseGrid = gridHolder.getDense()

    if (!this._denseGrid) {
      this._resizedWidth = 0
      this._resizedHeight = 0
      this._resizedDepth = 1

      // Not emitting warning as volume might be empty for
      // legitimate reason (for example during an animation).

      return false
    }

    // Get the bounding box of dense grid and combine with above
    // grid transform to compute volume bounding box, dimensions and size.
    const treeBoundingBox = this._denseGrid.getTreeBoundingBox()

    this._boundingBox = new GfBBox3d(_ToRange3d(treeBoundingBox), gridTransform)

    const dim = _Dim(treeBoundingBox)
    this._resizedWidth = dim[0]
    this._resizedHeight = dim[1]
    this._resizedDepth = dim[2]

    const size = _Volume(treeBoundingBox) * bytesPerPixel

    TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
      `[VdbTextureData] Resized dimensions ${this._resizedWidth} x ${this._resizedHeight} x ` +
      `${this._resizedDepth} (size: ${size}, target: ${this._targetMemory})\n`)

    TfDebug.msg(HioOpenVDBDebugCodes.HIOOPENVDB_DEBUG_TEXTURE,
      `[VdbTextureData] ${(size <= this._targetMemory || this._targetMemory === 0)
        ? 'Target memory was met.'
        : 'WARNING: the target memory was EXCEEDED'}`)

    return true
  }
}

// HioOpenVDB_TextureDataFactory::_New (vdbTextureData.cpp:25-37): the
// field index and purpose are not used; grids are selected by name.
registerFieldTextureDataFactory(['vdb'],
  (filePath, fieldName, _fieldIndex, _fieldPurpose, targetMemory) =>
    new HioOpenVDB_TextureData(filePath, fieldName, targetMemory), 0)
