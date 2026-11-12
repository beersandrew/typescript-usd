// Ported from OpenUSD 26.11.1: pxr/imaging/hd/meshUtil.cpp,
//  pxr/imaging/hd/meshUtil.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/meshUtil.{h,cpp} (OpenUSD 26.11.1).
//
// HdQuadInfo, HdMeshComputationResult, HdMeshUtil, HdMeshEdgeIndexTable and
// HdMeshTriQuadBuilder.
//
// Deliberate divergences:
// - Out-parameters (VtArray*, VtValue*, HdQuadInfo*) are `{ value }` boxes
//   (or the HdQuadInfo / std::vector itself, which is filled in place); a
//   null box is upstream's nullptr.
// - VtIntArray inputs from HdMeshTopology are number[] (meshTopology.ts);
//   the VtArray outputs are typescript-usd/vt VtArrays over typed storage.
// - `void const* source` + HdType is a typed-array view of the source's
//   components (an HdBufferSource::GetData() view), reinterpreted as the
//   HdType's component type as upstream's static_cast does.
// - Float element types (float, GfVec*f) round every arithmetic step with
//   Math.fround to reproduce single-precision results.
// - HdMeshEdgeIndexTable: std::sort is not stable, so upstream leaves the
//   order of equal edges unspecified; here they stay in index order.
//   GetVerticesForEdgeIndices returns the std::unordered_set contents in
//   first-insertion order (upstream: unspecified order).
// - HD_TRACE_FUNCTION is not ported.

import {
  Array as VtArray,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { Vec2i as GfVec2i, Vec4i as GfVec4i, type Vec3i as GfVec3i } from 'typescript-usd/gf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { HdMeshTopology } from './meshTopology.ts'
import { HdTokens } from './tokens.ts'
import { HdType } from './types.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** meshUtil.h:27-59. A helper class for quadrangulation computation.
 *
 *  v0           v2
 *  +-----e2----+
 *   \    |    /
 *    \ __c__ /
 *    e0     e1
 *      \   /
 *       \ /
 *        + v1
 *
 *   original points       additional center and edge points
 *  +------------ ... ----+--------------------------------+
 *  | v0 v1 v2         vn | e0 e1 e2 c0, e3 e4 e5 c1 ...   |
 *  +------------ ... ----+--------------------------------+
 *                        ^
 *                    pointsOffset
 *                        <----- numAdditionalPoints  ---->
 */
export class HdQuadInfo {
  // Offset to the first additional (edge/center) point — equals numPoints.
  pointsOffset = 0
  // Count of appended edge+center points across all non-quad faces.
  numAdditionalPoints = 0
  // Largest face valence among non-quads (GPU-table sizing upstream).
  maxNumVert = 0
  // num vertices of non-quads
  numVerts: number[] = []
  // vertex indices of non-quads
  verts: number[] = []

  /** meshUtil.h:51-52. Returns true if the mesh is all-quads. */
  isAllQuads(): boolean { return this.numAdditionalPoints === 0 }
}

/** meshUtil.h:62-67 */
export enum HdMeshComputationResult {
  Error = 'error',
  Success = 'success',
  Unchanged = 'unchanged',
}

// ===========================================================================
// HdMeshUtil (meshUtil.h:73-265, meshUtil.cpp)
// ===========================================================================

/** A typed-array view of a source's components (HdBufferSource::GetData()). */
export type HdMeshUtilSource = ArrayBufferView | ArrayLike<number>

/** An out-parameter box (upstream `T*`). */
export interface HdMeshUtilOut<T> { value: T }

type _TypedArrayCtor = Float32ArrayConstructor | Float64ArrayConstructor | Int32ArrayConstructor

/** The `static_cast<T const*>(source)` of meshUtil.cpp: reinterpret a view's
 *  bytes as the component type. Plain number arrays are used as they are. */
function _HdReinterpret(source: HdMeshUtilSource, ctor: _TypedArrayCtor): ArrayLike<number> {
  if (!ArrayBuffer.isView(source)) return source
  if (source instanceof ctor) return source
  const bytes = source.byteLength - (source.byteLength % ctor.BYTES_PER_ELEMENT)
  if (source.byteOffset % ctor.BYTES_PER_ELEMENT === 0) {
    return new ctor(source.buffer as ArrayBuffer, source.byteOffset, bytes / ctor.BYTES_PER_ELEMENT)
  }
  const copy = new Uint8Array(bytes)
  copy.set(new Uint8Array(source.buffer, source.byteOffset, bytes))
  return new ctor(copy.buffer)
}

/** The element types the HdMeshUtil templates are instantiated for
 *  (meshUtil.cpp:344-373, 770-799, 966-1011): the Vt type name, component
 *  count, storage and whether arithmetic is single precision. */
interface _HdPrimvarElement {
  vtTypeName: 'float' | 'double' | 'GfVec2f' | 'GfVec3f' | 'GfVec4f' | 'GfVec2d' | 'GfVec3d' | 'GfVec4d'
  width: number
  ctor: Float32ArrayConstructor | Float64ArrayConstructor
  single: boolean
}

function _HdPrimvarElementOf(dataType: HdType): _HdPrimvarElement | null {
  switch (dataType) {
    case HdType.HdTypeFloat: return { vtTypeName: 'float', width: 1, ctor: Float32Array, single: true }
    case HdType.HdTypeFloatVec2: return { vtTypeName: 'GfVec2f', width: 2, ctor: Float32Array, single: true }
    case HdType.HdTypeFloatVec3: return { vtTypeName: 'GfVec3f', width: 3, ctor: Float32Array, single: true }
    case HdType.HdTypeFloatVec4: return { vtTypeName: 'GfVec4f', width: 4, ctor: Float32Array, single: true }
    case HdType.HdTypeDouble: return { vtTypeName: 'double', width: 1, ctor: Float64Array, single: false }
    case HdType.HdTypeDoubleVec2: return { vtTypeName: 'GfVec2d', width: 2, ctor: Float64Array, single: false }
    case HdType.HdTypeDoubleVec3: return { vtTypeName: 'GfVec3d', width: 3, ctor: Float64Array, single: false }
    case HdType.HdTypeDoubleVec4: return { vtTypeName: 'GfVec4d', width: 4, ctor: Float64Array, single: false }
    default: return null
  }
}

/** A VtArray that owns freshly filled typed storage. */
function _HdVtArray<T>(vtTypeName: keyof typeof VtValueTypes, buffer: Float32Array | Float64Array | Int32Array): VtArray<T> {
  return VtArray._adopt<T>(VtValueTypes[vtTypeName], buffer)
}

/** meshUtil.cpp:28-52. Fan triangulation helper function; writes three
 *  elements of `width` components at `dst[dstIndex]`. */
function _FanTriangulate(
  dst: Float32Array | Float64Array | Int32Array, dstIndex: number,
  src: ArrayLike<number>, width: number,
  offset: number, index: number, size: number, flip: boolean,
): boolean {
  // overrun check
  if (offset + index + 2 >= size) {
    for (let c = 0; c < 3 * width; ++c) dst[dstIndex * width + c] = 0
    return false
  }
  const a = offset
  const b = flip ? offset + index + 2 : offset + index + 1
  const c = flip ? offset + index + 1 : offset + index + 2
  for (let k = 0; k < width; ++k) {
    dst[dstIndex * width + k] = src[a * width + k]!
    dst[(dstIndex + 1) * width + k] = src[b * width + k]!
    dst[(dstIndex + 2) * width + k] = src[c * width + k]!
  }
  return true
}

/** Swap elements `i` and `j` (of `width` components) of `buf`. */
function _SwapElements(buf: Float32Array | Float64Array | Int32Array, width: number, i: number, j: number): void {
  for (let k = 0; k < width; ++k) {
    const t = buf[i * width + k]!
    buf[i * width + k] = buf[j * width + k]!
    buf[j * width + k] = t
  }
}

/** meshUtil.cpp:61-97. Returns the number of triangles of the triangulated
 *  mesh and whether the mesh is already all triangles. */
function _CountTriangles(
  id: SdfPath,
  faceVertexCounts: ArrayLike<number>,
  holeIndices: ArrayLike<number>,
): [number, boolean] {
  const numFaces = faceVertexCounts.length
  const numHoleFaces = holeIndices.length
  let numTris = 0
  let invalidTopology = false
  let allTriangles = true
  for (let i = 0, holeIndex = 0; i < numFaces; ++i) {
    const nv = faceVertexCounts[i]!
    if (nv < 3) {
      // skip degenerated face
      invalidTopology = true
      allTriangles = false
    } else if (holeIndex < numHoleFaces && holeIndices[holeIndex] === i) {
      // skip hole face
      ++holeIndex
      allTriangles = false
    } else {
      numTris += nv - 2
      allTriangles = allTriangles && nv === 3
    }
  }
  if (invalidTopology) {
    TF_WARN(`degenerated face found [${id.toString()}]`)
  }
  return [numTris, allTriangles]
}

/** meshUtil.cpp:246-315. Face-varying triangulation, for one element type. */
function _TriangulateFaceVarying(
  id: SdfPath,
  faceVertexCounts: ArrayLike<number>,
  holeIndices: ArrayLike<number>,
  flip: boolean,
  element: _HdPrimvarElement,
  sourceUntyped: HdMeshUtilSource,
  numElements: number,
  triangulated: HdMeshUtilOut<VtValue>,
): HdMeshComputationResult {
  const source = _HdReinterpret(sourceUntyped, element.ctor)
  const w = element.width

  const [numTris, allTriangles] = _CountTriangles(id, faceVertexCounts, holeIndices)

  // Already triangulated
  if (allTriangles && !flip) {
    return HdMeshComputationResult.Unchanged
  }

  // CPU face-varying triangulation
  const numFaces = faceVertexCounts.length
  const numHoleFaces = holeIndices.length

  const results = new element.ctor(numTris * 3 * w)
  let invalidTopology = false
  for (let i = 0, v = 0, holeIndex = 0, dstIndex = 0; i < numFaces; ++i) {
    const nVerts = faceVertexCounts[i]!

    if (nVerts < 3) {
      // Skip degenerate faces.
    } else if (holeIndex < numHoleFaces && holeIndices[holeIndex] === i) {
      // Skip hole faces.
      ++holeIndex
    } else {
      // triangulate.
      // apply same triangulation as index does
      for (let j = 0; j < nVerts - 2; ++j) {
        if (!_FanTriangulate(results, dstIndex, source, w, v, j, numElements, flip)) {
          invalidTopology = true
        }
        // To keep edge flags consistent, when a face is triangulated
        // and the topology is flipped we rotate the first and last
        // triangle indices. See ComputeTriangleIndices.
        if (nVerts > 3 && flip) {
          if (j === 0) {
            _SwapElements(results, w, dstIndex, dstIndex + 1)
            _SwapElements(results, w, dstIndex + 1, dstIndex + 2)
          } else if (j === nVerts - 3) {
            _SwapElements(results, w, dstIndex + 1, dstIndex + 2)
            _SwapElements(results, w, dstIndex, dstIndex + 1)
          }
        }
        dstIndex += 3
      }
    }
    v += nVerts
  }
  if (invalidTopology) {
    TF_WARN(`numVerts and verts are incosistent [${id.toString()}]`)
  }

  triangulated.value = VtValue.createArray(_HdVtArray(element.vtTypeName, results))
  return HdMeshComputationResult.Success
}

/** meshUtil.cpp:698-750. CPU quadrangulation, for one element type. */
function _Quadrangulate(
  id: SdfPath,
  element: _HdPrimvarElement,
  sourceUntyped: HdMeshUtilSource,
  numElements: number,
  qi: HdQuadInfo,
  quadrangulated: HdMeshUtilOut<VtValue>,
): void {
  const w = element.width
  const f = element.single ? Math.fround : (x: number) => x

  // original points + quadrangulated points
  const results = new element.ctor((qi.pointsOffset + qi.numAdditionalPoints) * w)

  // copy original primvars
  const source = _HdReinterpret(sourceUntyped, element.ctor)
  if (numElements >= qi.pointsOffset) {
    for (let i = 0; i < qi.pointsOffset * w; ++i) results[i] = source[i]!
  } else {
    TF_WARN(`source.numElements and pointsOffset are inconsistent [${id.toString()}]`)
    for (let i = 0; i < numElements * w; ++i) results[i] = source[i]!
    // results[numElements, pointsOffset) are value-initialized (T(0)).
  }

  // compute quadrangulate primvars
  let index = 0
  // store quadrangulated points at end
  let dstIndex = qi.pointsOffset

  const center = new Float64Array(w)
  for (const nv of qi.numVerts) {
    center.fill(0)
    for (let i = 0; i < nv; ++i) {
      const i0 = qi.verts[index + i]!
      const i1 = qi.verts[index + (i + 1) % nv]!

      // midpoint
      for (let c = 0; c < w; ++c) {
        const a = results[i0 * w + c]!
        const b = results[i1 * w + c]!
        results[dstIndex * w + c] = f(a + b) * 0.5
        // accumulate center
        center[c] = f(center[c]! + a)
      }
      ++dstIndex
    }
    // average center value: scalar T /= int divides; GfVec /= double
    // multiplies by 1.0/nv (gf/vec3f.h operator/=).
    for (let c = 0; c < w; ++c) {
      results[dstIndex * w + c] = w === 1 ? f(center[c]! / nv) : center[c]! * (1.0 / nv)
    }
    ++dstIndex

    index += nv
  }

  quadrangulated.value = VtValue.createArray(_HdVtArray(element.vtTypeName, results))
}

/** meshUtil.cpp:804-936. CPU face-varying quadrangulation, for one element
 *  type. */
function _QuadrangulateFaceVarying(
  id: SdfPath,
  faceVertexCounts: ArrayLike<number>,
  holeFaces: ArrayLike<number>,
  flip: boolean,
  element: _HdPrimvarElement,
  sourceUntyped: HdMeshUtilSource,
  numElements: number,
  quadrangulated: HdMeshUtilOut<VtValue>,
): void {
  const source = _HdReinterpret(sourceUntyped, element.ctor)
  const w = element.width
  const f = element.single ? Math.fround : (x: number) => x

  // CPU face-varying quadrangulation
  let invalidTopology = false
  let numFVarValues = 0
  let holeIndex = 0
  const numHoleFaces = holeFaces.length
  for (let i = 0; i < faceVertexCounts.length; ++i) {
    const nVerts = faceVertexCounts[i]!
    if (nVerts < 3) {
      // skip degenerated face
      invalidTopology = true
    } else if (holeIndex < numHoleFaces && holeFaces[holeIndex] === i) {
      // skip hole face
      ++holeIndex
    } else if (nVerts === 4) {
      numFVarValues += 4
    } else {
      numFVarValues += 4 * nVerts
    }
  }
  if (invalidTopology) {
    TF_WARN(`degenerated face found [${id.toString()}]`)
    invalidTopology = false
  }

  const results = new element.ctor(numFVarValues * w)
  // reset holeIndex
  holeIndex = 0

  let dstIndex = 0
  const put = (values: ArrayLike<number>, at: number): void => {
    for (let c = 0; c < w; ++c) results[dstIndex * w + c] = values[at * w + c]!
    ++dstIndex
  }
  const putVec = (values: Float64Array): void => {
    for (let c = 0; c < w; ++c) results[dstIndex * w + c] = values[c]!
    ++dstIndex
  }
  const putZero = (): void => {
    for (let c = 0; c < w; ++c) results[dstIndex * w + c] = 0
    ++dstIndex
  }
  const center = new Float64Array(w)
  const e0 = new Float64Array(w)
  const e1 = new Float64Array(w)
  // T e = (source[a] + source[b]) * 0.5
  const mid = (out: Float64Array, a: number, b: number): void => {
    for (let c = 0; c < w; ++c) out[c] = f(f(source[a * w + c]! + source[b * w + c]!) * 0.5)
  }
  for (let i = 0, v = 0; i < faceVertexCounts.length; ++i) {
    const nVerts = faceVertexCounts[i]!
    if (nVerts < 3) {
      // skip degenerated faces.
    } else if (holeIndex < numHoleFaces && holeFaces[holeIndex] === i) {
      // skip hole faces.
      ++holeIndex
    } else if (nVerts === 4) {
      // copy
      if (v + nVerts > numElements) {
        invalidTopology = true
        putZero(); putZero(); putZero(); putZero()
      } else {
        put(source, v)
        if (flip) {
          put(source, v + 3)
          put(source, v + 2)
          put(source, v + 1)
        } else {
          put(source, v + 1)
          put(source, v + 2)
          put(source, v + 3)
        }
      }
    } else {
      // quadrangulate
      // compute the center first

      // early out if overrunning
      if (v + nVerts > numElements) {
        invalidTopology = true
        for (let j = 0; j < nVerts; ++j) {
          putZero(); putZero(); putZero(); putZero()
        }
        // meshUtil.cpp:885 continues without advancing v.
        continue
      }

      center.fill(0)
      for (let j = 0; j < nVerts; ++j) {
        for (let c = 0; c < w; ++c) center[c] = f(center[c]! + source[(v + j) * w + c]!)
      }
      for (let c = 0; c < w; ++c) {
        center[c] = w === 1 ? f(center[c]! / nVerts) : f(center[c]! * (1.0 / nVerts))
      }

      // mid edges
      mid(e0, v, v + 1)
      mid(e1, v, v + (nVerts - 1) % nVerts)

      put(source, v)
      if (flip) {
        putVec(e1)
        putVec(center)
        putVec(e0)

        for (let j = nVerts - 1; j > 0; --j) {
          mid(e0, v + j, v + (j + 1) % nVerts)
          mid(e1, v + j, v + (j + nVerts - 1) % nVerts)

          put(source, v + j)
          putVec(e1)
          putVec(center)
          putVec(e0)
        }
      } else {
        putVec(e0)
        putVec(center)
        putVec(e1)

        for (let j = 1; j < nVerts; ++j) {
          mid(e0, v + j, v + (j + 1) % nVerts)
          mid(e1, v + j, v + (j + nVerts - 1) % nVerts)

          put(source, v + j)
          putVec(e0)
          putVec(center)
          putVec(e1)
        }
      }
    }
    v += nVerts
  }
  if (invalidTopology) {
    TF_WARN(`numVerts and verts are incosistent [${id.toString()}]`)
  }

  quadrangulated.value = VtValue.createArray(_HdVtArray(element.vtTypeName, results))
}

/** meshUtil.h:73-265. A collection of utility algorithms for generating
 *  triangulation and quadrangulation of an input topology. */
export class HdMeshUtil {
  private readonly _topology: HdMeshTopology | null
  private readonly _id: SdfPath

  /** meshUtil.h:80-81 */
  constructor(topology: HdMeshTopology | null, id: SdfPath = SdfPath.emptyPath) {
    this._topology = topology
    this._id = id
  }

  // ------------------------------------------------------------------------
  // Triangulation

  /** meshUtil.cpp:99-244. Return a triangulation of the input topology.
   *  indices and primitiveParams are output parameters. */
  computeTriangleIndices(
    indices: HdMeshUtilOut<VtArray<GfVec3i>> | null,
    primitiveParams: HdMeshUtilOut<VtArray<number>> | null,
    edgeIndices: HdMeshUtilOut<VtArray<number>> | null = null,
  ): void {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for triangulation')
      return
    }
    if (indices === null || primitiveParams === null) {
      TF_CODING_ERROR('No output buffer provided for triangulation')
      return
    }

    // generate triangle index buffer

    const faceVertexCounts = this._topology.getFaceVertexCounts()
    const holeIndices = this._topology.getHoleIndices()
    const [numTris, allTriangles] = _CountTriangles(this._id, faceVertexCounts, holeIndices)

    const indicesBuf = new Int32Array(numTris * 3) // vec3 per face
    const primitiveParamsBuf = new Int32Array(numTris) // int per face
    const edgeIndicesBuf = edgeIndices ? new Int32Array(numTris) : null // int per face
    const commit = (): void => {
      indices.value = _HdVtArray<GfVec3i>('GfVec3i', indicesBuf)
      primitiveParams.value = _HdVtArray<number>('int', primitiveParamsBuf)
      if (edgeIndices) edgeIndices.value = _HdVtArray<number>('int', edgeIndicesBuf!)
    }

    const flip = this._topology.getOrientation() !== HdTokens.rightHanded

    const vertsPtr = this._topology.getFaceVertexIndices()

    // Fast path for already triangulated
    if (allTriangles && !flip) {
      // meshUtil.cpp:144-145 memcpy's numTris * 3 ints; a shorter index
      // array reads past its end there, here the rest stays zero.
      const n = Math.min(numTris * 3, vertsPtr.length)
      for (let i = 0; i < n; ++i) indicesBuf[i] = vertsPtr[i]!
      for (let i = 0; i < numTris; ++i) {
        primitiveParamsBuf[i] = HdMeshUtil.encodeCoarseFaceParam(i, 0)
        if (edgeIndicesBuf) {
          edgeIndicesBuf[i] = 3 * i
        }
      }
      commit()
      return
    }

    const numVertsPtr = faceVertexCounts
    const holeFacesPtr = holeIndices
    const numFaces = faceVertexCounts.length
    const numVertIndices = vertsPtr.length
    const numHoleFaces = holeIndices.length

    // i  -> authored face index [0, numFaces)
    // tv -> triangulated face index [0, numTris)
    // v  -> index to the first vertex (index) for face i
    // ev -> edges visited
    let invalidTopology = false
    for (let i = 0, tv = 0, v = 0, ev = 0, holeIndex = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!
      if (nv < 3) {
        // Skip degenerate faces.
      } else if (holeIndex < numHoleFaces && holeFacesPtr[holeIndex] === i) {
        // Skip hole faces.
        ++holeIndex
      } else {
        // edgeFlag is used for inner-line removal of non-triangle
        // faces on wireframe shading.
        //
        //          0__                0  0   0__
        //        _/|\ \_            _/.  ..   . \_
        //      _/  | \  \_   ->   _/  .  . .   .  \_
        //     /  A |C \ B \_     /  A .  .C .   . B \_
        //    1-----2---3----4   1-----2  1---2   1----2
        //
        //  Type   EdgeFlag    Draw
        //    -       0        show all edges
        //    A       1        hide [2-0]
        //    B       2        hide [0-1]
        //    C       3        hide [0-1] and [2-0]
        //
        let edgeFlag = 0
        let edgeIndex = ev
        for (let j = 0; j < nv - 2; ++j) {
          if (!_FanTriangulate(indicesBuf, tv * 3, vertsPtr, 1, v, j, numVertIndices, flip)) {
            invalidTopology = true
          }

          if (nv > 3) {
            const t = tv * 3
            if (j === 0) {
              if (flip) {
                // If the topology is flipped, we get the triangle
                // 021 instead of 012, and we'd hide edge 0-1
                // instead of 0-2; so we rotate the indices to
                // produce triangle 210.
                const i0 = indicesBuf[t]!, i1 = indicesBuf[t + 1]!, i2 = indicesBuf[t + 2]!
                indicesBuf[t] = i1; indicesBuf[t + 1] = i2; indicesBuf[t + 2] = i0
              }
              edgeFlag = 1
            } else if (j === nv - 3) {
              if (flip) {
                // If the topology is flipped, we get the triangle
                // 043 instead of 034, and we'd hide edge 0-4
                // instead of 0-3; so we rotate the indices to
                // produce triangle 304.
                const i0 = indicesBuf[t]!, i1 = indicesBuf[t + 1]!, i2 = indicesBuf[t + 2]!
                indicesBuf[t] = i2; indicesBuf[t + 1] = i0; indicesBuf[t + 2] = i1
              }
              edgeFlag = 2
            } else {
              edgeFlag = 3
            }
            ++edgeIndex
          }

          primitiveParamsBuf[tv] = HdMeshUtil.encodeCoarseFaceParam(i, edgeFlag)
          if (edgeIndicesBuf) {
            edgeIndicesBuf[tv] = edgeIndex
          }

          ++tv
        }
      }
      // When the face is degenerate and nv > 0, we need to increment the v
      // pointer to walk past the degenerate verts.
      v += nv
      ev += nv
    }
    if (invalidTopology) {
      TF_WARN(`numVerts and verts are incosistent [${this._id.toString()}]`)
    }
    commit()
  }

  /** meshUtil.cpp:317-374. Perform a triangulation of a face-varying
   *  primvar. The result is written to `triangulated` unless the result is
   *  not Success, in which case the argument is unmodified. */
  computeTriangulatedFaceVaryingPrimvar(
    source: HdMeshUtilSource,
    numElements: number,
    dataType: HdType,
    triangulated: HdMeshUtilOut<VtValue> | null,
  ): HdMeshComputationResult {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for triangulation')
      return HdMeshComputationResult.Error
    }
    if (triangulated === null) {
      TF_CODING_ERROR('No output buffer provided for triangulation')
      return HdMeshComputationResult.Error
    }

    const faceVertexCounts = this._topology.getFaceVertexCounts()

    // Faces tagged as holes can be skipped over only when not refined.
    const holeFaces = this._topology.getRefineLevel() > 0
      ? []
      : this._topology.getHoleIndices()

    const flip = this._topology.getOrientation() !== HdTokens.rightHanded

    const element = _HdPrimvarElementOf(dataType)
    if (element === null) {
      TF_CODING_ERROR(`Unsupported primvar type for triangulation [${this._id.toString()}]`)
      return HdMeshComputationResult.Error
    }
    return _TriangulateFaceVarying(this._id, faceVertexCounts, holeFaces, flip,
      element, source, numElements, triangulated)
  }

  // ------------------------------------------------------------------------
  // Quadrangulation

  /** meshUtil.cpp:409-484. Generate a quadInfo struct for the input
   *  topology. */
  computeQuadInfo(quadInfo: HdQuadInfo | null): void {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for quadrangulation')
      return
    }
    if (quadInfo === null) {
      TF_CODING_ERROR('No output buffer provided for quadrangulation')
      return
    }

    const numVertsPtr = this._topology.getFaceVertexCounts()
    const vertsPtr = this._topology.getFaceVertexIndices()
    const holeFacesPtr = this._topology.getHoleIndices()
    const numFaces = numVertsPtr.length
    const numVertIndices = vertsPtr.length
    const numHoleFaces = holeFacesPtr.length
    const numPoints = this._topology.getNumPoints()

    quadInfo.numVerts = []
    quadInfo.verts = []
    quadInfo.pointsOffset = numPoints

    let vertIndex = 0
    let numAdditionalPoints = 0
    let maxNumVert = 0
    let holeIndex = 0
    let invalidTopology = false
    for (let i = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!

      if (nv < 3) {
        vertIndex += nv
        continue // skip degenerated face
      }
      if (holeIndex < numHoleFaces && holeFacesPtr[holeIndex] === i) {
        // skip hole faces.
        vertIndex += nv
        ++holeIndex
        continue
      }

      if (nv === 4) {
        vertIndex += nv
        continue
      }

      // if it isn't a quad,
      quadInfo.numVerts.push(nv)
      for (let j = 0; j < nv; ++j) {
        // store vertex indices into quadinfo
        let index = 0
        if (vertIndex >= numVertIndices) {
          invalidTopology = true
        } else {
          index = vertsPtr[vertIndex++]!
        }
        quadInfo.verts.push(index)
      }
      // nv + 1 (edge + center) additional vertices needed.
      numAdditionalPoints += nv + 1

      // remember max numvert for making gpu-friendly table
      maxNumVert = Math.max(maxNumVert, nv)
    }
    quadInfo.numAdditionalPoints = numAdditionalPoints
    quadInfo.maxNumVert = maxNumVert

    if (invalidTopology) {
      TF_WARN(`numVerts and verts are incosistent [${this._id.toString()}]`)
    }
  }

  /** meshUtil.cpp:680-687. Return quadrangulated indices of the input
   *  topology. indices and primitiveParams are output parameters. */
  computeQuadIndices(
    indices: HdMeshUtilOut<VtArray<number>> | null,
    primitiveParams: HdMeshUtilOut<VtArray<number>> | null,
    edgeIndices: HdMeshUtilOut<VtArray<GfVec2i>> | null = null,
  ): void {
    this._computeQuadIndices(indices, primitiveParams, edgeIndices)
  }

  /** meshUtil.cpp:689-696. Return triquad indices (triangulated after
   *  quadrangulation) of the input topology. */
  computeTriQuadIndices(
    indices: HdMeshUtilOut<VtArray<number>> | null,
    primitiveParams: HdMeshUtilOut<VtArray<number>> | null,
    edgeIndices: HdMeshUtilOut<VtArray<GfVec2i>> | null = null,
  ): void {
    this._computeQuadIndices(indices, primitiveParams, edgeIndices, /*triangulate=*/true)
  }

  /** meshUtil.cpp:752-802. Return a quadrangulation of a per-vertex
   *  primvar. Returns false if it can't resolve dataType. */
  computeQuadrangulatedPrimvar(
    qi: HdQuadInfo,
    source: HdMeshUtilSource,
    numElements: number,
    dataType: HdType,
    quadrangulated: HdMeshUtilOut<VtValue> | null,
  ): boolean {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for quadrangulation')
      return false
    }
    if (quadrangulated === null) {
      TF_CODING_ERROR('No output buffer provided for quadrangulation')
      return false
    }

    const element = _HdPrimvarElementOf(dataType)
    if (element === null) {
      TF_CODING_ERROR(`Unsupported points type for quadrangulation [${this._id.toString()}]`)
      return false
    }
    _Quadrangulate(this._id, element, source, numElements, qi, quadrangulated)
    return true
  }

  /** meshUtil.cpp:938-1014. Return a quadrangulation of a face-varying
   *  primvar. Returns false if it can't resolve dataType. */
  computeQuadrangulatedFaceVaryingPrimvar(
    source: HdMeshUtilSource,
    numElements: number,
    dataType: HdType,
    quadrangulated: HdMeshUtilOut<VtValue> | null,
  ): boolean {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for quadrangulation')
      return false
    }
    if (quadrangulated === null) {
      TF_CODING_ERROR('No output buffer provided for quadrangulation')
      return false
    }

    const faceVertexCounts = this._topology.getFaceVertexCounts()

    // Faces tagged as holes can be skipped over only when not refined.
    const holeFaces = this._topology.getRefineLevel() > 0
      ? []
      : this._topology.getHoleIndices()

    const flip = this._topology.getOrientation() !== HdTokens.rightHanded

    const element = _HdPrimvarElementOf(dataType)
    if (element === null) {
      TF_CODING_ERROR(`Unsupported primvar type for quadrangulation [${this._id.toString()}]`)
      return false
    }
    _QuadrangulateFaceVarying(this._id, faceVertexCounts, holeFaces, flip,
      element, source, numElements, quadrangulated)
    return true
  }

  /** meshUtil.cpp:1016-1075. Fill `edgeVerticesOut` with face vertex index
   *  pairs in the sequence edges are visited when iterating through the mesh
   *  topology; optionally record the first edge index for each face. */
  enumerateEdges(
    edgeVerticesOut: GfVec2i[] | null,
    firstEdgeIndexForFacesOut: number[] | null = null,
  ): void {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for edge vertices')
      return
    }
    if (edgeVerticesOut === null) {
      TF_CODING_ERROR('No output buffer provided for edge vertices')
      return
    }

    const numVertsPtr = this._topology.getFaceVertexCounts()
    const vertsPtr = this._topology.getFaceVertexIndices()
    const numFaces = numVertsPtr.length

    if (firstEdgeIndexForFacesOut) {
      firstEdgeIndexForFacesOut.length = numFaces
      firstEdgeIndexForFacesOut.fill(0)
    }

    let numEdges = 0
    for (let i = 0; i < numFaces; ++i) {
      numEdges += numVertsPtr[i]!
    }
    edgeVerticesOut.length = numEdges

    const flip = this._topology.getOrientation() !== HdTokens.rightHanded

    for (let i = 0, v = 0, ev = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!
      if (firstEdgeIndexForFacesOut) {
        firstEdgeIndexForFacesOut[i] = ev
      }
      if (flip) {
        for (let j = nv; j > 0; --j) {
          let v0 = vertsPtr[v + j % nv]!
          let v1 = vertsPtr[v + (j + nv - 1) % nv]!
          if (v0 < v1) {
            const t = v0; v0 = v1; v1 = t
          }
          edgeVerticesOut[ev++] = new GfVec2i(v0, v1)
        }
      } else {
        for (let j = 0; j < nv; ++j) {
          let v0 = vertsPtr[v + j]!
          let v1 = vertsPtr[v + (j + 1) % nv]!
          if (v0 < v1) {
            const t = v0; v0 = v1; v1 = t
          }
          edgeVerticesOut[ev++] = new GfVec2i(v0, v1)
        }
      }
      v += nv
    }
  }

  // ------------------------------------------------------------------------
  // Primitive Param bit encoding (meshUtil.h:215-247)

  /** meshUtil.h:237-239 */
  static encodeCoarseFaceParam(faceIndex: number, edgeFlag: number): number {
    return (faceIndex << 2) | (edgeFlag & 3)
  }
  /** meshUtil.h:240-242 */
  static decodeFaceIndexFromCoarseFaceParam(coarseFaceParam: number): number {
    return coarseFaceParam >> 2
  }
  /** meshUtil.h:243-245 */
  static decodeEdgeFlagFromCoarseFaceParam(coarseFaceParam: number): number {
    return coarseFaceParam & 3
  }

  /** meshUtil.cpp:379-407. Return the number of quadrangulated quads. If a
   *  degenerate face is found, sets invalidFaceFound.value to true. */
  private _computeNumQuads(
    numVerts: ArrayLike<number>,
    holeFaces: ArrayLike<number>,
    invalidFaceFound: HdMeshUtilOut<boolean> | null = null,
  ): number {
    const numFaces = numVerts.length
    const numHoleFaces = holeFaces.length
    let numQuads = 0
    let holeIndex = 0

    for (let i = 0; i < numFaces; ++i) {
      const nv = numVerts[i]!
      if (nv < 3) {
        // skip degenerated face
        if (invalidFaceFound) invalidFaceFound.value = true
      } else if (holeIndex < numHoleFaces && holeFaces[holeIndex] === i) {
        // skip hole face
        ++holeIndex
      } else {
        // non-quad n-gons are quadrangulated into n-quads.
        numQuads += nv === 4 ? 1 : nv
      }
    }
    return numQuads
  }

  /** meshUtil.cpp:486-678. Return quad indices (optionally triangulated
   *  after quadrangulation). */
  private _computeQuadIndices(
    indices: HdMeshUtilOut<VtArray<number>> | null,
    primitiveParams: HdMeshUtilOut<VtArray<number>> | null,
    edgeIndices: HdMeshUtilOut<VtArray<GfVec2i>> | null,
    triangulate = false,
  ): void {
    if (this._topology === null) {
      TF_CODING_ERROR('No topology provided for quadrangulation')
      return
    }
    if (indices === null || primitiveParams === null) {
      TF_CODING_ERROR('No output buffer provided for quadrangulation')
      return
    }

    const numVertsPtr = this._topology.getFaceVertexCounts()
    const vertsPtr = this._topology.getFaceVertexIndices()
    const holeFacesPtr = this._topology.getHoleIndices()
    const numFaces = numVertsPtr.length
    const numVertIndices = vertsPtr.length
    const numHoleFaces = holeFacesPtr.length
    const numPoints = this._topology.getNumPoints()

    // count num quads
    const invalid = { value: false }
    const numQuads = this._computeNumQuads(numVertsPtr, holeFacesPtr, invalid)
    let invalidTopology = invalid.value
    if (invalidTopology) {
      TF_WARN(`degenerated face found [${this._id.toString()}]`)
      invalidTopology = false
    }

    let holeIndex = 0

    const numIndicesPerQuad = triangulate
      ? HdMeshTriQuadBuilder.NumIndicesPerTriQuad
      : HdMeshTriQuadBuilder.NumIndicesPerQuad
    const indicesBuf = new Int32Array(numQuads * numIndicesPerQuad)

    const outputIndices = new HdMeshTriQuadBuilder(indicesBuf, triangulate)

    const primitiveParamsBuf = new Int32Array(numQuads)
    const edgeIndicesBuf = edgeIndices ? new Int32Array(numQuads * 2) : null

    // quadrangulated verts is added to the end.
    const flip = this._topology.getOrientation() !== HdTokens.rightHanded
    let vertIndex = numPoints

    // i  -> authored face index [0, numFaces)
    // qv -> quadrangulated face index [0, numQuads)
    // v  -> index to the first vertex (index) for face i
    // ev -> edges visited
    // vertIndex -> index to the start of the additional verts (edge, center)
    //              for face i
    const zero = new GfVec4i(0, 0, 0, 0)
    for (let i = 0, qv = 0, v = 0, ev = 0; i < numFaces; ++i) {
      const nv = numVertsPtr[i]!
      if (nv < 3) {
        v += nv
        ev += nv
        continue // skip degenerated face
      }
      if (holeIndex < numHoleFaces && holeFacesPtr[holeIndex] === i) {
        // skip hole faces.
        ++holeIndex
        v += nv
        ev += nv
        continue
      }

      if (v + nv > numVertIndices) {
        invalidTopology = true
        if (nv === 4) {
          outputIndices.emitQuadFace(zero)
        } else {
          for (let j = 0; j < nv; ++j) {
            outputIndices.emitQuadFace(zero)
          }
        }
        // meshUtil.cpp:564-576 advances neither qv nor the additional
        // points offset, so these quads' primitive params stay 0.
        v += nv
        ev += nv
        continue
      }

      const edgeIndex = ev
      if (nv === 4) {
        let quadIndices: GfVec4i
        if (flip) {
          quadIndices = new GfVec4i(vertsPtr[v + 0]!, vertsPtr[v + 3]!, vertsPtr[v + 2]!, vertsPtr[v + 1]!)
        } else {
          quadIndices = new GfVec4i(vertsPtr[v + 0]!, vertsPtr[v + 1]!, vertsPtr[v + 2]!, vertsPtr[v + 3]!)
        }
        outputIndices.emitQuadFace(quadIndices)

        //  Case             EdgeFlag    Draw
        //  Quad/Refined face   0        hide common edge for the tri-pair
        //  Non-Quad face       1/2/3    hide common edge for the tri-pair &
        //                               hide interior quadrangulated edges
        //
        //  The first quad of a non-quad face is marked 1; the last as 2; and
        //  intermediate quads as 3.

        primitiveParamsBuf[qv] = HdMeshUtil.encodeCoarseFaceParam(i, /*edgeFlag=*/0)

        if (edgeIndicesBuf) {
          edgeIndicesBuf[qv * 2 + 0] = edgeIndex
          edgeIndicesBuf[qv * 2 + 1] = edgeIndex + 3
        }

        ++qv
      } else {
        // quadrangulate non-quad faces
        // the additional points (edge and center) are stored at the end of
        // original points, as
        //   last point, e0, e1, ..., en, center, e0, e1, ...
        // so each sub-quads become
        // *first non-quad
        //   v0, e0, center, e(-1),
        //   v1, e1, center, e0,
        //...
        // *second non-quad
        //   ...
        for (let j = 0; j < nv; ++j) {
          let quadIndices: GfVec4i
          if (flip) {
            // vertex, edge prev, center, edge next
            quadIndices = new GfVec4i(vertsPtr[v + j]!,
              vertIndex + (j + nv - 1) % nv, vertIndex + nv, vertIndex + j)
          } else {
            // vertex, edge next, center, edge prev
            quadIndices = new GfVec4i(vertsPtr[v + j]!,
              vertIndex + j, vertIndex + nv, vertIndex + (j + nv - 1) % nv)
          }
          outputIndices.emitQuadFace(quadIndices)

          // edge flag != 0 => quad face is from quadrangulation
          // it is used to hide internal edges (edge-center) of the quad
          // The first quad gets flag = 1, intermediate quads get flag = 3
          // and the last quad gets flag = 2, so computations can tell
          // how quads are grouped by looking at edge flags.
          let edgeFlag = 0
          if (j === 0) {
            edgeFlag = 1
          } else if (j === nv - 1) {
            edgeFlag = 2
          } else {
            edgeFlag = 3
          }
          primitiveParamsBuf[qv] = HdMeshUtil.encodeCoarseFaceParam(i, edgeFlag)

          if (edgeIndicesBuf) {
            if (flip) {
              edgeIndicesBuf[qv * 2 + 0] = edgeIndex + (j + nv - 1) % nv
              edgeIndicesBuf[qv * 2 + 1] = edgeIndex + j
            } else {
              edgeIndicesBuf[qv * 2 + 0] = edgeIndex + j
              edgeIndicesBuf[qv * 2 + 1] = edgeIndex + (j + nv - 1) % nv
            }
          }

          ++qv
        }
        vertIndex += nv + 1
      }
      v += nv
      ev += nv
    }
    if (invalidTopology) {
      TF_WARN(`numVerts and verts are incosistent [${this._id.toString()}]`)
    }

    indices.value = _HdVtArray<number>('int', indicesBuf)
    primitiveParams.value = _HdVtArray<number>('int', primitiveParamsBuf)
    if (edgeIndices) edgeIndices.value = _HdVtArray<GfVec2i>('GfVec2i', edgeIndicesBuf!)
  }
}

/** meshUtil.h:338-351 */
interface _Edge {
  verts: [number, number]
  index: number
}

/** meshUtil.h:338-351. Simplify sorting and searching by keeping the
 *  vertices ordered. */
function _MakeEdge(verts: GfVec2i = new GfVec2i(-1, -1), index = -1): _Edge {
  let v0 = verts.get(0), v1 = verts.get(1)
  if (v0 > v1) {
    const t = v0; v0 = v1; v1 = t
  }
  return { verts: [v0, v1], index }
}

/** meshUtil.h:353-359 _CompareEdgeVertices */
function _CompareEdgeVertices(lhs: _Edge, rhs: _Edge): boolean {
  return lhs.verts[0] < rhs.verts[0] ||
    (lhs.verts[0] === rhs.verts[0] && lhs.verts[1] < rhs.verts[1])
}

/** meshUtil.h:267-380. Mesh edges are described as a pair of adjacent
 *  vertices; edge indices are derived from HdMeshUtil::EnumerateEdges(). */
export class HdMeshEdgeIndexTable {
  private readonly _topology: HdMeshTopology
  private readonly _firstEdgeIndexForFaces: number[] = []
  private readonly _edgeVertices: GfVec2i[] = []
  private readonly _edgesByIndex: _Edge[]

  /** meshUtil.cpp:1077-1092 */
  constructor(topology: HdMeshTopology) {
    this._topology = topology
    const meshUtil = new HdMeshUtil(this._topology, SdfPath.emptyPath)

    meshUtil.enumerateEdges(this._edgeVertices, this._firstEdgeIndexForFaces)

    this._edgesByIndex = new Array<_Edge>(this._edgeVertices.length)
    for (let i = 0; i < this._edgeVertices.length; ++i) {
      this._edgesByIndex[i] = _MakeEdge(this._edgeVertices[i]!, i)
    }

    this._edgesByIndex.sort((a, b) =>
      _CompareEdgeVertices(a, b) ? -1 : _CompareEdgeVertices(b, a) ? 1 : 0)
  }

  /** meshUtil.cpp:1096-1107 */
  getVerticesForEdgeIndex(edgeId: number, edgeVerticesOut: HdMeshUtilOut<GfVec2i>): boolean {
    if (edgeId < 0 || edgeId >= this._edgeVertices.length) {
      return false
    }

    edgeVerticesOut.value = this._edgeVertices[edgeId]!

    return true
  }

  /** meshUtil.cpp:1109-1124 */
  getVerticesForEdgeIndices(edgeIndices: readonly number[], edgeVerticesOut: GfVec2i[]): boolean {
    const result = new Map<string, GfVec2i>()
    for (const edgeIndex of edgeIndices) {
      const edgeVertices = { value: new GfVec2i(0, 0) }
      if (this.getVerticesForEdgeIndex(edgeIndex, edgeVertices)) {
        const key = `${edgeVertices.value.get(0)},${edgeVertices.value.get(1)}`
        if (!result.has(key)) result.set(key, edgeVertices.value)
      }
    }
    edgeVerticesOut.length = 0
    edgeVerticesOut.push(...result.values())

    return edgeVerticesOut.length !== 0
  }

  /** meshUtil.cpp:1126-1149 */
  getEdgeIndices(edgeVertices: GfVec2i, edgeIndicesOut: number[]): boolean {
    const edge = _MakeEdge(edgeVertices)
    // std::equal_range
    let lo = 0, hi = this._edgesByIndex.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (_CompareEdgeVertices(this._edgesByIndex[mid]!, edge)) lo = mid + 1
      else hi = mid
    }
    let end = lo
    while (end < this._edgesByIndex.length && !_CompareEdgeVertices(edge, this._edgesByIndex[end]!)) {
      ++end
    }

    if (lo === end) {
      return false
    }

    edgeIndicesOut.length = 0
    for (let i = lo; i !== end; ++i) {
      edgeIndicesOut.push(this._edgesByIndex[i]!.index)
    }

    return edgeIndicesOut.length !== 0
  }

  /** meshUtil.cpp:1151-1187. Returns the edge indices for all faces in
   *  faceIndices. */
  collectFaceEdgeIndices(faceIndices: Iterable<number>): VtArray<number> {
    const numMeshFaces = this._topology.getFaceVertexCounts().length

    if (!TF_VERIFY(numMeshFaces === this._firstEdgeIndexForFaces.length)) {
      return new VtArray<number>([], VtValueTypes.int)
    }

    const result: number[] = []

    for (const face of faceIndices) {
      // Skip invalid face indices.
      if (face < 0 || face >= numMeshFaces) {
        continue
      }

      const firstEdgeIndex = this._firstEdgeIndexForFaces[face]!
      const numEdges = this._topology.getFaceVertexCounts()[face]!

      for (let e = 0; e < numEdges; ++e) {
        // Edges are identified by their vertex indices.
        const edgeVertices = this._edgeVertices[firstEdgeIndex + e]!

        const edgeIndices: number[] = []
        this.getEdgeIndices(edgeVertices, edgeIndices)

        result.push(...edgeIndices)
      }
    }

    return new VtArray<number>(result, VtValueTypes.int)
  }
}

/** meshUtil.h:382-417. Helper class for emitting a buffer of quad indices,
 *  optionally splitting each quad into two triangles. */
export class HdMeshTriQuadBuilder {
  static readonly NumIndicesPerQuad = 4
  static readonly NumIndicesPerTriQuad = 6

  private _outputPtr: number
  private readonly _buffer: Int32Array | number[]
  private readonly _triangulate: boolean

  /** meshUtil.h:393-396. `indicesBuffer` is written from its start. */
  constructor(indicesBuffer: Int32Array | number[], triangulate: boolean) {
    this._buffer = indicesBuffer
    this._outputPtr = 0
    this._triangulate = triangulate
  }

  /** meshUtil.h:398-412 */
  emitQuadFace(quadIndices: GfVec4i): void {
    const q0 = quadIndices.get(0), q1 = quadIndices.get(1)
    const q2 = quadIndices.get(2), q3 = quadIndices.get(3)
    const out = this._buffer
    if (this._triangulate) {
      out[this._outputPtr++] = q0
      out[this._outputPtr++] = q1
      out[this._outputPtr++] = q2
      out[this._outputPtr++] = q2
      out[this._outputPtr++] = q3
      out[this._outputPtr++] = q0
    } else {
      out[this._outputPtr++] = q0
      out[this._outputPtr++] = q1
      out[this._outputPtr++] = q2
      out[this._outputPtr++] = q3
    }
  }
}
