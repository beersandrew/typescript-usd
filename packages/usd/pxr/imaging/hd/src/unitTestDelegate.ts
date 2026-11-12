// Ported from OpenUSD 26.11.1: pxr/imaging/hd/unitTestDelegate.cpp,
//  pxr/imaging/hd/unitTestDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/unitTestDelegate.{h,cpp} (OpenUSD 26.11.1) —
// HdUnitTestDelegate, a simple scene delegate for unit test drivers.
//
// Deliberate divergences:
// - SdfPath ids are path strings; VtVec3fArray / VtIntArray / VtFloatArray
//   arguments are GfVec3f[] / number[] / number[]. Values handed to Hydra
//   through Get / GetIndexedPrimvar / GetCameraParamValue are VtValues holding
//   VtArrays and Gf values of the upstream types (VtVec3fArray,
//   VtFloatArray, GfVec3f, float, ...).
// - The C++ overloads of AddMesh, AddCube and AddPoints are single methods
//   that select the overload from their arguments (see each method).
// - AddTask<T>(id) takes the task: AddTask(id, task) inserts it through
//   HdRenderIndex.InsertTask(task, this) (renderIndex.ts's task API).
// - UpdateTask marks the task dirty through HdRenderIndex.MarkTaskDirty:
//   renderIndex.ts tracks task dirty bits itself rather than in the change
//   tracker (unitTestDelegate.cpp:695-704 uses HdChangeTracker::MarkTaskDirty).
// - GetTaskRenderTags reads a token array held in the task params dictionary.
// - _ComputeFlattenedValue flattens any array-valued VtValue by index
//   (unitTestDelegate.cpp:991-1037 enumerates the supported array types; the
//   result is the same for each).

import { Token as TfToken } from 'typescript-usd/tf'
import {
  Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes,
  Dictionary as VtDictionary,
} from 'typescript-usd/vt'
import {
  Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f, Range3d as GfRange3d,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3i as GfVec3i, Vec4f as GfVec4f,
  makeRotation, rotationToQuat,
} from 'typescript-usd/gf'
import {
  OpenSubdivTokens as PxOsdOpenSubdivTokens, SubdivTags as PxOsdSubdivTags,
} from 'typescript-usd/pxOsd'
import { HdSceneDelegate, HdPrimvarDescriptor, type HdPrimvarDescriptorVector } from './sceneDelegate.ts'
import { HdMeshTopology } from './meshTopology.ts'
import { HdBasisCurvesTopology } from './basisCurvesTopology.ts'
import { HdCullStyle, HdDisplayStyle, HdReprSelector } from './displayStyle.ts'
import { HdInterpolation } from './enums.ts'
import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import {
  HdTokens, HdInstancerTokens, HdPrimTypeTokens, HdPrimvarRoleTokens,
  HdRenderTagTokens, HdReprTokens,
} from './tokens.ts'
import { HdRenderBufferDescriptor } from './aov.ts'
import { HdFormat } from './types.ts'
import type { HdRenderIndex } from './renderIndex.ts'
import type { HdTask } from './task.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

const T = (s: string): TfToken => TfToken(s)

// material.h:29-30 HdMaterial::DirtyResource; renderBuffer.h:38
// HdRenderBuffer::DirtyDescription.
const HdMaterial_DirtyResource = 1 << 3
const HdRenderBuffer_DirtyDescription = 1 << 0

// ---- VtValue construction helpers (VtValue(x) for the upstream types) ----
function _Vec3fValue(v: GfVec3f): VtValue { return VtValue.create(v, VtValueTypes.GfVec3f) }
function _Vec4fValue(v: GfVec4f): VtValue { return VtValue.create(v, VtValueTypes.GfVec4f) }
function _FloatValue(f: number): VtValue { return VtValue.create(f, VtValueTypes.float) }
function _Vec3fArray(values: readonly GfVec3f[]): VtArray<GfVec3f> {
  return new VtArray<GfVec3f>(values, VtValueTypes.GfVec3f)
}
function _Vec3fArrayValue(values: readonly GfVec3f[]): VtValue {
  return VtValue.createArray(_Vec3fArray(values))
}
function _Vec4fArrayValue(values: readonly GfVec4f[]): VtValue {
  return VtValue.createArray(new VtArray<GfVec4f>(values, VtValueTypes.GfVec4f))
}
function _FloatArrayValue(values: readonly number[]): VtValue {
  return VtValue.createArray(new VtArray<number>(values, VtValueTypes.float))
}

/** unitTestDelegate.h:425-458 _Mesh */
class _Mesh {
  reprSelector = new HdReprSelector()
  cullStyle: HdCullStyle = HdCullStyle.HdCullStyleDontCare
  constructor(
    public scheme: TfToken,
    public orientation: TfToken,
    public transform: GfMatrix4f,
    public points: GfVec3f[],
    public numVerts: number[],
    public verts: number[],
    public holes: number[],
    public subdivTags: PxOsdSubdivTags,
    public guide: boolean,
    public doubleSided: boolean,
  ) {}
}

/** unitTestDelegate.h:459-477 _Curves */
class _Curves {
  constructor(
    public points: GfVec3f[],
    public curveVertexCounts: number[],
    public curveIndices: number[],
    public type: TfToken,
    public basis: TfToken,
    public wrap: TfToken = T(HdTokens.nonperiodic),
  ) {}
}

/** unitTestDelegate.h:478-482 _Points */
class _Points {
  constructor(public points: GfVec3f[]) {}
}

/** unitTestDelegate.h:483-499 _Instancer */
class _Instancer {
  scale: GfVec3f[] = []
  rotate: GfVec4f[] = []
  translate: GfVec3f[] = []
  prototypeIndices: number[] = []
  rootTransform = new GfMatrix4f(1)
  prototypes: string[] = []
}

/** unitTestDelegate.h:500-519 _Primvar */
class _Primvar {
  constructor(
    public name: TfToken,
    public value: VtValue,
    public interp: HdInterpolation,
    public role: TfToken,
    public indices: number[] = [],
  ) {}
}

type _Primvars = _Primvar[]

/** unitTestDelegate.h:528-531 _Camera */
class _Camera {
  params = new VtDictionary()
  transform = new GfMatrix4f(1)
}

/** unitTestDelegate.h:532-537 _Light / _Task */
class _Light { params = new VtDictionary() }
class _Task { params = new VtDictionary() }

/** unitTestDelegate.h:538-545 _RenderBuffer */
class _RenderBuffer {
  constructor(
    public dims: GfVec3i = new GfVec3i(0, 0, 0),
    public format: HdFormat = HdFormat.HdFormatInvalid,
    public multiSampled = false,
  ) {}
}

// unitTestDelegate.cpp:1166-1199 cube points / topology.
function _CubePoints(): GfVec3f[] {
  return [
    new GfVec3f(1.0, 1.0, 1.0),
    new GfVec3f(-1.0, 1.0, 1.0),
    new GfVec3f(-1.0, -1.0, 1.0),
    new GfVec3f(1.0, -1.0, 1.0),
    new GfVec3f(-1.0, -1.0, -1.0),
    new GfVec3f(-1.0, 1.0, -1.0),
    new GfVec3f(1.0, 1.0, -1.0),
    new GfVec3f(1.0, -1.0, -1.0),
  ]
}
const _cubeLoopNumVerts = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
const _cubeLoopVerts = [
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  0, 6, 5, 0, 5, 1,
  4, 7, 3, 4, 3, 2,
  0, 3, 7, 0, 7, 6,
  4, 2, 1, 4, 1, 5,
]
const _cubeQuadNumVerts = [4, 4, 4, 4, 4, 4]
const _cubeQuadVerts = [
  0, 1, 2, 3,
  4, 5, 6, 7,
  0, 6, 5, 1,
  4, 7, 3, 2,
  0, 3, 7, 6,
  4, 2, 1, 5,
]

// unitTestDelegate.cpp:1323-1340 / 1400-1420 polygon points and topology.
const _polygonNumVerts = [3, 4, 5]
const _polygonVerts = [
  0, 1, 2,
  1, 3, 4, 2,
  3, 5, 6, 7, 4,
]
function _PolygonPoints(): GfVec3f[] {
  return [
    new GfVec3f(-2.0, 0.0, -0.5),
    new GfVec3f(-1.0, -1.0, 0.0),
    new GfVec3f(-1.0, 1.0, 0.0),
    new GfVec3f(0.0, -1.0, 0.2),
    new GfVec3f(0.0, 1.0, 0.2),
    new GfVec3f(1.0, -1.0, 0.0),
    new GfVec3f(2.0, 0.0, -0.5),
    new GfVec3f(1.0, 1.0, 0.0),
  ]
}

/** unitTestDelegate.cpp:1460-1484 */
function _CreateGrid(nx: number, ny: number, points: GfVec3f[], numVerts: number[],
  verts: number[], _transform: GfMatrix4f): void {
  if (nx === 0 && ny === 0) return
  // create a unit plane (-1 ~ 1)
  for (let y = 0; y <= ny; ++y) {
    for (let x = 0; x <= nx; ++x) {
      points.push(new GfVec3f(2.0 * x / Math.fround(nx) - 1.0,
        2.0 * y / Math.fround(ny) - 1.0, 0))
    }
  }
  for (let y = 0; y < ny; ++y) {
    for (let x = 0; x < nx; ++x) {
      numVerts.push(4)
      verts.push(y * (nx + 1) + x)
      verts.push(y * (nx + 1) + x + 1)
      verts.push((y + 1) * (nx + 1) + x + 1)
      verts.push((y + 1) * (nx + 1) + x)
    }
  }
}

/** unitTestDelegate.cpp:555-563 */
function _AnimatePositions(positions: readonly GfVec3f[], time: number): GfVec3f[] {
  return positions.map((p, i) =>
    new GfVec3f(p.get(0) + Math.fround(0.5 * Math.sin(0.5 * i + time)), p.get(1), p.get(2)))
}

/** unitTestDelegate.cpp:975-1037 _ComputeFlattened / _ComputeFlattenedValue */
function _ComputeFlattenedValue(value: VtValue, indices: readonly number[]): VtValue {
  const array = value.Get<VtArray<unknown>>()
  const source = array.toArray()
  const result: unknown[] = []
  for (let i = 0; i < indices.length; ++i) {
    const index = indices[i]!
    if (index >= 0 && index < source.length) {
      result.push(source[index])
    } else {
      TF_CODING_ERROR('Invalid indices')
      result.push(source[0])
    }
  }
  return VtValue.createArray(new VtArray<unknown>(result, array.getElementType()))
}

function _Transform4f(p: GfVec3f, m: GfMatrix4f): GfVec3f {
  // GfVec4f(p, 1) * transform (row vector times matrix).
  const v = [p.get(0), p.get(1), p.get(2), 1]
  const out = [0, 0, 0]
  for (let j = 0; j < 3; ++j) {
    let s = 0
    for (let i = 0; i < 4; ++i) s += v[i]! * m.getElement(i, j)
    out[j] = s
  }
  return new GfVec3f(out[0]!, out[1]!, out[2]!)
}

/** unitTestDelegate.h:30-570 */
export class HdUnitTestDelegate extends HdSceneDelegate {
  private _meshes = new Map<string, _Mesh>()
  private _curves = new Map<string, _Curves>()
  private _points = new Map<string, _Points>()
  private _instancers = new Map<string, _Instancer>()
  private _primvars = new Map<string, _Primvars>()
  private _materials = new Map<string, VtValue>()
  private _sceneMaterials = new Map<string, VtValue>()
  private _cameras = new Map<string, _Camera>()
  private _renderBuffers = new Map<string, _RenderBuffer>()
  private _lights = new Map<string, _Light>()
  private _tasks = new Map<string, _Task>()
  private _hiddenRprims = new Set<string>()
  private _materialBindings = new Map<string, string>()
  private _instancerBindings = new Map<string, string>()
  private _hasInstancePrimvars: boolean
  private _refineLevel: number
  private _visibility: boolean
  private _refineLevels = new Map<string, number>()
  private _visibilities = new Map<string, boolean>()

  /** unitTestDelegate.cpp:41-46 */
  constructor(parentIndex: HdRenderIndex, delegateID: string) {
    super(parentIndex, delegateID)
    this._hasInstancePrimvars = true
    this._refineLevel = 0
    this._visibility = true
  }

  /** unitTestDelegate.h:42 */
  setUseInstancePrimvars(v: boolean): void { this._hasInstancePrimvars = v }

  /** unitTestDelegate.cpp:48-63 SetRefineLevel(level), and
   *  unitTestDelegate.cpp:540-546 SetRefineLevel(id, refineLevel). */
  setRefineLevel(level: number): void
  setRefineLevel(id: string, refineLevel: number): void
  setRefineLevel(idOrLevel: string | number, refineLevel?: number): void {
    const tracker = this.getRenderIndex().getChangeTracker()
    if (typeof idOrLevel === 'string') {
      this._refineLevels.set(idOrLevel, refineLevel ?? 0)
      tracker.markRprimDirty(idOrLevel, HdChangeTracker.DirtyDisplayStyle)
      return
    }
    this._refineLevel = idOrLevel
    for (const id of this._meshes.keys()) {
      tracker.markRprimDirty(id, HdChangeTracker.DirtyDisplayStyle)
    }
    for (const id of this._curves.keys()) {
      tracker.markRprimDirty(id, HdChangeTracker.DirtyDisplayStyle)
    }
    for (const id of this._refineLevels.keys()) {
      this._refineLevels.set(id, idOrLevel)
    }
  }

  /** unitTestDelegate.cpp:65-79 SetVisibility(vis), and
   *  unitTestDelegate.cpp:548-553 SetVisibility(id, vis). */
  setVisibility(vis: boolean): void
  setVisibility(id: string, vis: boolean): void
  setVisibility(idOrVis: string | boolean, vis?: boolean): void {
    const tracker = this.getRenderIndex().getChangeTracker()
    if (typeof idOrVis === 'string') {
      this._visibilities.set(idOrVis, vis ?? true)
      tracker.markRprimDirty(idOrVis, HdChangeTracker.DirtyVisibility)
      return
    }
    this._visibility = idOrVis
    // unitTestDelegate.cpp:69-76 marks the meshes twice.
    for (const id of this._meshes.keys()) {
      tracker.markRprimDirty(id, HdChangeTracker.DirtyVisibility)
    }
    for (const id of this._meshes.keys()) {
      tracker.markRprimDirty(id, HdChangeTracker.DirtyVisibility)
    }
    for (const id of this._visibilities.keys()) {
      this._visibilities.set(id, idOrVis)
    }
  }

  /**
   * The AddMesh overloads:
   * - AddMesh(id) (unitTestDelegate.cpp:81-93)
   * - AddMesh(id, transform, points, numVerts, verts, guide=false,
   *   instancerId='', scheme=catmullClark, orientation=rightHanded,
   *   doubleSided=false) (unitTestDelegate.cpp:95-129)
   * - AddMesh(id, transform, points, numVerts, verts, holes, subdivTags,
   *   color, colorInterpolation, opacity, opacityInterpolation, guide,
   *   instancerId, scheme, orientation, doubleSided)
   *   (unitTestDelegate.cpp:131-170)
   * - AddMesh(id, transform, points, numVerts, verts, holes, subdivTags,
   *   color, colorIndices, colorInterpolation, opacity, opacityIndices,
   *   opacityInterpolation, guide, instancerId, scheme, orientation,
   *   doubleSided) (unitTestDelegate.cpp:172-214)
   */
  addMesh(id: string): void
  addMesh(id: string, transform: GfMatrix4f, points: readonly GfVec3f[],
    numVerts: readonly number[], verts: readonly number[], guide?: boolean,
    instancerId?: string, scheme?: string, orientation?: string, doubleSided?: boolean): void
  addMesh(id: string, transform: GfMatrix4f, points: readonly GfVec3f[],
    numVerts: readonly number[], verts: readonly number[], holes: readonly number[],
    subdivTags: PxOsdSubdivTags, color: VtValue, colorInterpolation: HdInterpolation,
    opacity: VtValue, opacityInterpolation: HdInterpolation, guide?: boolean,
    instancerId?: string, scheme?: string, orientation?: string, doubleSided?: boolean): void
  addMesh(id: string, transform: GfMatrix4f, points: readonly GfVec3f[],
    numVerts: readonly number[], verts: readonly number[], holes: readonly number[],
    subdivTags: PxOsdSubdivTags, color: VtValue, colorIndices: readonly number[],
    colorInterpolation: HdInterpolation, opacity: VtValue, opacityIndices: readonly number[],
    opacityInterpolation: HdInterpolation, guide?: boolean, instancerId?: string,
    scheme?: string, orientation?: string, doubleSided?: boolean): void
  addMesh(id: string, ...args: unknown[]): void {
    if (args.length === 0) {
      // unitTestDelegate.cpp:81-93
      this.addMesh(id, new GfMatrix4f(1), [], [], [], false, '',
        PxOsdOpenSubdivTokens.catmullClark)
      return
    }
    const transform = args[0] as GfMatrix4f
    const points = [...(args[1] as readonly GfVec3f[])]
    const numVerts = [...(args[2] as readonly number[])]
    const verts = [...(args[3] as readonly number[])]

    if (!Array.isArray(args[4])) {
      // unitTestDelegate.cpp:95-129
      const [guide = false, instancerId = '', scheme = PxOsdOpenSubdivTokens.catmullClark,
        orientation = HdTokens.rightHanded, doubleSided = false] =
        args.slice(4) as [boolean?, string?, string?, string?, boolean?]
      this.getRenderIndex().insertRprim(HdPrimTypeTokens.mesh, this, id)
      this._meshes.set(id, new _Mesh(T(scheme), T(orientation), transform,
        points, numVerts, verts, /*holes*/[], new PxOsdSubdivTags(), guide, doubleSided))
      // Add color and opacity as a constant primvar
      this._primvars.set(id, [
        new _Primvar(T(HdTokens.displayColor), _Vec3fValue(new GfVec3f(1)),
          HdInterpolation.HdInterpolationConstant, T(HdPrimvarRoleTokens.color)),
        new _Primvar(T(HdTokens.displayOpacity), _FloatValue(1.0),
          HdInterpolation.HdInterpolationConstant, T(HdPrimvarRoleTokens.color)),
      ])
      this._bindInstancer(id, instancerId)
      return
    }

    const holes = [...(args[4] as readonly number[])]
    const subdivTags = args[5] as PxOsdSubdivTags
    const color = args[6] as VtValue
    let colorIndices: number[] = []
    let opacityIndices: number[] = []
    let rest: unknown[]
    let colorInterpolation: HdInterpolation
    let opacity: VtValue
    let opacityInterpolation: HdInterpolation
    if (Array.isArray(args[7])) {
      // unitTestDelegate.cpp:172-214
      colorIndices = [...(args[7] as number[])]
      colorInterpolation = args[8] as HdInterpolation
      opacity = args[9] as VtValue
      opacityIndices = [...(args[10] as number[])]
      opacityInterpolation = args[11] as HdInterpolation
      rest = args.slice(12)
    } else {
      // unitTestDelegate.cpp:131-170
      colorInterpolation = args[7] as HdInterpolation
      opacity = args[8] as VtValue
      opacityInterpolation = args[9] as HdInterpolation
      rest = args.slice(10)
    }
    const [guide = false, instancerId = '', scheme = PxOsdOpenSubdivTokens.catmullClark,
      orientation = HdTokens.rightHanded, doubleSided = false] =
      rest as [boolean?, string?, string?, string?, boolean?]

    this.getRenderIndex().insertRprim(HdPrimTypeTokens.mesh, this, id)
    this._meshes.set(id, new _Mesh(T(scheme), T(orientation), transform,
      points, numVerts, verts, holes, subdivTags, guide, doubleSided))
    this._primvars.set(id, [
      new _Primvar(T(HdTokens.displayColor), color, colorInterpolation,
        T(HdPrimvarRoleTokens.color), colorIndices),
      new _Primvar(T(HdTokens.displayOpacity), opacity, opacityInterpolation,
        T(HdPrimvarRoleTokens.color), opacityIndices),
    ])
    this._bindInstancer(id, instancerId)
  }

  // unitTestDelegate.cpp:124-128 (repeated in each Add* method).
  private _bindInstancer(id: string, instancerId: string): void {
    if (instancerId !== '') {
      this._instancerBindings.set(id, instancerId)
      this._getInstancer(instancerId).prototypes.push(id)
    }
  }

  // std::map::operator[] on _instancers.
  private _getInstancer(id: string): _Instancer {
    let instancer = this._instancers.get(id)
    if (!instancer) this._instancers.set(id, instancer = new _Instancer())
    return instancer
  }

  /** unitTestDelegate.cpp:216-231 */
  setMeshCullStyle(id: string, cullStyle: HdCullStyle): void {
    const mesh = this._meshes.get(id)
    if (mesh) {
      if (mesh.cullStyle !== cullStyle) {
        mesh.cullStyle = cullStyle
        this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyCullStyle)
      }
    } else {
      TF_WARN(`Could not find mesh Rprim named ${id}. \n`)
    }
  }

  /** unitTestDelegate.cpp:233-283 */
  addBasisCurves(id: string, points: readonly GfVec3f[], curveVertexCounts: readonly number[],
    curveIndices: readonly number[], normals: readonly GfVec3f[], type: string, basis: string,
    color: VtValue, colorInterpolation: HdInterpolation,
    opacity: VtValue, opacityInterpolation: HdInterpolation,
    width: VtValue, widthInterpolation: HdInterpolation, instancerId = ''): void {
    this.getRenderIndex().insertRprim(HdPrimTypeTokens.basisCurves, this, id)
    this._curves.set(id, new _Curves([...points], [...curveVertexCounts], [...curveIndices],
      T(type), T(basis)))
    const primvars: _Primvars = [
      new _Primvar(T(HdTokens.displayColor), color, colorInterpolation, T(HdPrimvarRoleTokens.color)),
      new _Primvar(T(HdTokens.displayOpacity), opacity, opacityInterpolation, T(HdPrimvarRoleTokens.color)),
      new _Primvar(T(HdTokens.widths), width, widthInterpolation, T(HdPrimvarRoleTokens.none)),
    ]
    if (normals.length > 0) {
      primvars.push(new _Primvar(T(HdTokens.normals), _Vec3fArrayValue(normals),
        HdInterpolation.HdInterpolationVertex, T(HdPrimvarRoleTokens.normal)))
    }
    this._primvars.set(id, primvars)
    this._bindInstancer(id, instancerId)
  }

  /**
   * AddPoints(id, points, color, colorInterpolation, opacity,
   * opacityInterpolation, width, widthInterpolation, instancerId='')
   * (unitTestDelegate.cpp:285-321) or AddPoints(id, transform,
   * colorInterp=constant, widthInterp=constant, instancerId='')
   * (unitTestDelegate.cpp:1774-1820).
   */
  addPoints(id: string, points: readonly GfVec3f[], color: VtValue,
    colorInterpolation: HdInterpolation, opacity: VtValue,
    opacityInterpolation: HdInterpolation, width: VtValue,
    widthInterpolation: HdInterpolation, instancerId?: string): void
  addPoints(id: string, transform: GfMatrix4f, colorInterp?: HdInterpolation,
    widthInterp?: HdInterpolation, instancerId?: string): void
  addPoints(id: string, ...args: unknown[]): void {
    if (args[0] instanceof GfMatrix4f) {
      this._addPointsWithTransform(id, args[0],
        (args[1] as HdInterpolation | undefined) ?? HdInterpolation.HdInterpolationConstant,
        (args[2] as HdInterpolation | undefined) ?? HdInterpolation.HdInterpolationConstant,
        (args[3] as string | undefined) ?? '')
      return
    }
    const [points, color, colorInterpolation, opacity, opacityInterpolation,
      width, widthInterpolation, instancerId = ''] =
      args as [GfVec3f[], VtValue, HdInterpolation, VtValue, HdInterpolation,
        VtValue, HdInterpolation, string?]
    this.getRenderIndex().insertRprim(HdPrimTypeTokens.points, this, id)
    this._points.set(id, new _Points([...points]))
    this._primvars.set(id, [
      new _Primvar(T(HdTokens.displayColor), color, colorInterpolation, T(HdPrimvarRoleTokens.color)),
      new _Primvar(T(HdTokens.displayOpacity), opacity, opacityInterpolation, T(HdPrimvarRoleTokens.color)),
      new _Primvar(T(HdTokens.widths), width, widthInterpolation, T(HdPrimvarRoleTokens.none)),
    ])
    this._bindInstancer(id, instancerId)
  }

  /** unitTestDelegate.cpp:323-346 */
  addInstancer(id: string, parentId = '', rootTransform: GfMatrix4f = new GfMatrix4f(1)): void {
    const index = this.getRenderIndex()
    // add instancer
    index.insertInstancer(this, id)
    const instancer = new _Instancer()
    instancer.rootTransform = rootTransform
    this._instancers.set(id, instancer)
    if (parentId !== '') {
      this._instancerBindings.set(id, parentId)
      this._getInstancer(parentId).prototypes.push(id)
    }
    // Instancers don't have initial dirty bits, so we need to add them.
    index.getChangeTracker().markInstancerDirty(id, HdChangeTracker.DirtyTransform
      | HdChangeTracker.DirtyPrimvar | HdChangeTracker.DirtyInstanceIndex)
  }

  /** unitTestDelegate.cpp:348-369 */
  setInstancerProperties(id: string, prototypeIndex: readonly number[],
    scale: readonly GfVec3f[], rotate: readonly GfVec4f[], translate: readonly GfVec3f[]): void {
    if (!TF_VERIFY(prototypeIndex.length === scale.length)
      || !TF_VERIFY(prototypeIndex.length === rotate.length)
      || !TF_VERIFY(prototypeIndex.length === translate.length)) {
      return
    }
    const instancer = this._getInstancer(id)
    instancer.scale = [...scale]
    instancer.rotate = [...rotate]
    instancer.translate = [...translate]
    instancer.prototypeIndices = [...prototypeIndex]
    this.getRenderIndex().getChangeTracker().markInstancerDirty(id,
      HdChangeTracker.DirtyPrimvar | HdChangeTracker.DirtyInstanceIndex)
  }

  /** unitTestDelegate.cpp:371-385 */
  updateInstancer(rprimId: string, instancerId: string): void {
    if (this._meshes.has(rprimId)) {
      if (instancerId !== '') {
        this._instancerBindings.set(rprimId, instancerId)
        this._getInstancer(instancerId).prototypes.push(rprimId)
        this.getRenderIndex().getChangeTracker().markRprimDirty(rprimId,
          HdChangeTracker.DirtyInstancer)
      }
    }
  }

  /** unitTestDelegate.cpp:387-406 */
  addPrimvar(id: string, name: string, value: VtValue, interp: HdInterpolation,
    role: string, indices: readonly number[] = []): void {
    if (this._findPrimvar(id, name)) {
      TF_WARN(`Rprim ${id} already has a primvar named ${name}. Skipping.\n`)
      return
    }
    let primvars = this._primvars.get(id)
    if (!primvars) this._primvars.set(id, primvars = [])
    primvars.push(new _Primvar(T(name), value, interp, T(role), [...indices]))
    // XXX: Using DirtyPrimvar even though this is a descriptor change.
    this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyPrimvar)
  }

  /** unitTestDelegate.cpp:408-431 */
  updatePrimvarValue(id: string, name: string, value: VtValue,
    indices: readonly number[] = []): void {
    const pv = this._findPrimvar(id, name)
    if (pv) {
      pv.value = value
      pv.indices = [...indices]
      this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyPrimvar)
    } else {
      TF_WARN(`Rprim ${id} has no primvar named ${name}.\n`)
    }
  }

  /** unitTestDelegate.cpp:433-447 */
  removePrimvar(id: string, name: string): void {
    const pv = this._findPrimvar(id, name)
    if (pv) {
      const primvars = this._primvars.get(id)!
      primvars.splice(primvars.indexOf(pv), 1)
      // XXX: Using DirtyPrimvar even though this is a descriptor change.
      this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyPrimvar)
    } else {
      TF_WARN(`Rprim ${id} has no primvar named ${name}.\n`)
    }
  }

  /** unitTestDelegate.cpp:449-463 */
  updateTransform(id: string, mat: GfMatrix4f): void {
    const mesh = this._meshes.get(id)
    if (mesh) {
      mesh.transform = mat
      this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyTransform)
    }
    const camera = this._cameras.get(id)
    if (camera) {
      camera.transform = mat
      this.getRenderIndex().getChangeTracker().markSprimDirty(id, HdChangeTracker.DirtyTransform)
    }
  }

  /** unitTestDelegate.cpp:465-472 */
  addMaterialResource(id: string, materialResource: VtValue): void {
    this.getRenderIndex().insertSprim(HdPrimTypeTokens.material, this, id)
    this._materials.set(id, materialResource)
  }

  /** unitTestDelegate.cpp:474-491 */
  updateMaterialResource(materialId: string, materialResource: VtValue): void {
    this._materials.set(materialId, materialResource)
    const tracker = this.getRenderIndex().getChangeTracker()
    tracker.markSprimDirty(materialId, HdMaterial_DirtyResource)
    // XXX : Make sure all rprims know they have an invalid binding, some
    //       backends need to be notified when a material has been updated.
    for (const [rprimId, boundId] of this._materialBindings) {
      if (boundId === materialId) {
        tracker.markRprimDirty(rprimId, HdChangeTracker.DirtyMaterialId)
      }
    }
  }

  /** unitTestDelegate.cpp:493-498 */
  bindMaterial(rprimId: string, materialId: string): void {
    this._materialBindings.set(rprimId, materialId)
  }

  /** unitTestDelegate.cpp:500-511 */
  rebindMaterial(rprimId: string, materialId: string): void {
    this.bindMaterial(rprimId, materialId)
    this.getRenderIndex().getChangeTracker().markRprimDirty(rprimId,
      HdChangeTracker.DirtyMaterialId)
  }

  /** unitTestDelegate.cpp:513-529 */
  setUseSceneMaterials(useSceneMaterials: boolean): void {
    if (!useSceneMaterials) {
      // Update material resource to the fallback
      for (const [path, resource] of [...this._materials]) {
        // store the scene materials
        this._sceneMaterials.set(path, resource)
        this.updateMaterialResource(path, VtValue.getEmpty())
      }
    } else {
      // update the material resource to the scene material
      for (const [path, resource] of this._sceneMaterials) {
        this.updateMaterialResource(path, resource)
      }
    }
  }

  /** unitTestDelegate.cpp:531-536 */
  hideRprim(id: string): void {
    this._hiddenRprims.add(id)
    this.markRprimDirty(id, HdChangeTracker.DirtyRenderTag)
  }

  /** unitTestDelegate.cpp:538-543 */
  unhideRprim(id: string): void {
    this._hiddenRprims.delete(id)
    this.markRprimDirty(id, HdChangeTracker.DirtyRenderTag)
  }

  /** unitTestDelegate.cpp:545-555 */
  setReprSelector(id: string, reprSelector: HdReprSelector): void {
    // XXX: Add repr support for curves and points
    const mesh = this._meshes.get(id)
    if (mesh) {
      mesh.reprSelector = reprSelector
      this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyRepr)
    }
  }

  /** unitTestDelegate.cpp:571-587 */
  updatePositions(id: string, time: number): void {
    const mesh = this._meshes.get(id)
    const curves = this._curves.get(id)
    const points = this._points.get(id)
    if (mesh) {
      mesh.points = _AnimatePositions(mesh.points, time)
    } else if (curves) {
      curves.points = _AnimatePositions(curves.points, time)
    } else if (points) {
      points.points = _AnimatePositions(points.points, time)
    } else {
      return
    }
    this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyPoints)
  }

  /** unitTestDelegate.cpp:589-610 */
  updateRprims(_time: number): void {
    // update prims
    const delta = Math.fround(0.01)
    const tracker = this.getRenderIndex().getChangeTracker()
    for (const id of this._meshes.keys()) {
      tracker.markRprimDirty(id, HdChangeTracker.DirtyPrimvar)
      // Update constant interp color on each invocation
      const pv = this._findPrimvar(id, HdTokens.displayColor)
      if (pv && pv.interp === HdInterpolation.HdInterpolationConstant) {
        const color = pv.value.Get<GfVec4f>()
        const c0 = Math.fround((color.get(0) + delta) % 1.0)
        const c1 = Math.fround((color.get(1) + delta * 2) % 1.0)
        pv.value = _Vec4fValue(new GfVec4f(c0, c1, color.get(2), color.get(3)))
      }
    }
  }

  /** unitTestDelegate.cpp:612-629 */
  updateInstancerPrimvars(time: number): void {
    // update instancers
    for (const [id, instancer] of this._instancers) {
      for (let i = 0; i < instancer.rotate.length; ++i) {
        const q = rotationToQuat(makeRotation([1, 0, 0], i * time))
        instancer.rotate[i] = new GfVec4f(q[0], q[1], q[2], q[3])
      }
      this.getRenderIndex().getChangeTracker().markInstancerDirty(id, HdChangeTracker.DirtyPrimvar)
    }
  }

  /** unitTestDelegate.cpp:631-649 */
  updateInstancerPrototypes(_time: number): void {
    // update instancer prototypes
    for (const [id, instancer] of this._instancers) {
      // rotate prototype indices
      const numInstances = instancer.prototypeIndices.length
      if (numInstances > 0) {
        const firstPrototype = instancer.prototypeIndices[0]!
        for (let i = 1; i < numInstances; ++i) {
          instancer.prototypeIndices[i - 1] = instancer.prototypeIndices[i]!
        }
        instancer.prototypeIndices[numInstances - 1] = firstPrototype
      }
      // invalidate instance index
      this.getRenderIndex().getChangeTracker().markInstancerDirty(id,
        HdChangeTracker.DirtyInstanceIndex)
    }
  }

  /** unitTestDelegate.h:349 (declared upstream, not defined in
   *  unitTestDelegate.cpp; a no-op here). */
  updateCurvePrimvarsInterpMode(_time: number): void {}

  /** unitTestDelegate.cpp:651-659 */
  addRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void {
    this.getRenderIndex().insertBprim(HdPrimTypeTokens.renderBuffer, this, id)
    this._renderBuffers.set(id, new _RenderBuffer(
      new GfVec3i(desc.dimensions[0], desc.dimensions[1], desc.dimensions[2]),
      desc.format, desc.multiSampled))
  }

  /** unitTestDelegate.cpp:661-669 */
  updateRenderBuffer(id: string, desc: HdRenderBufferDescriptor): void {
    this._renderBuffers.set(id, new _RenderBuffer(
      new GfVec3i(desc.dimensions[0], desc.dimensions[1], desc.dimensions[2]),
      desc.format, desc.multiSampled))
    this.getRenderIndex().getChangeTracker().markBprimDirty(id, HdRenderBuffer_DirtyDescription)
  }

  /** unitTestDelegate.cpp:671-677 */
  addCamera(id: string): void {
    this.getRenderIndex().insertSprim(HdPrimTypeTokens.camera, this, id)
    this._cameras.set(id, new _Camera())
  }

  /** unitTestDelegate.cpp:679-687 */
  updateCamera(id: string, key: string, value: VtValue): void {
    let camera = this._cameras.get(id)
    if (!camera) this._cameras.set(id, camera = new _Camera())
    camera.params.set(key, value)
    this.getRenderIndex().getChangeTracker().markSprimDirty(id, HdChangeTracker.AllDirty)
  }

  /** unitTestDelegate.h:245-249 AddTask<T>; see the header. */
  addTask(id: string, task: HdTask): void {
    this.getRenderIndex().insertTask(task, this)
    this._tasks.set(id, new _Task())
  }

  /** unitTestDelegate.cpp:689-707 */
  updateTask(id: string, key: string, value: VtValue): void {
    let task = this._tasks.get(id)
    if (!task) this._tasks.set(id, task = new _Task())
    task.params.set(key, value)
    // Update dirty bits for tokens we recognize.
    const index = this.getRenderIndex()
    if (key === HdTokens.params) {
      index.markTaskDirty(id, HdChangeTracker.DirtyParams)
    } else if (key === HdTokens.collection) {
      index.markTaskDirty(id, HdChangeTracker.DirtyCollection)
    } else if (key === HdTokens.renderTags) {
      index.markTaskDirty(id, HdChangeTracker.DirtyRenderTags)
    } else {
      TF_CODING_ERROR(`Unknown key ${key}`)
    }
  }

  /** unitTestDelegate.cpp:1898-1902 */
  remove(id: string): void {
    this.getRenderIndex().removeRprim(id)
  }

  /** unitTestDelegate.cpp:1904-1908 */
  clear(): void {
    this.getRenderIndex().clear()
  }

  /** unitTestDelegate.cpp:1910-1914 */
  markRprimDirty(path: string, flag: HdDirtyBits): void {
    this.getRenderIndex().getChangeTracker().markRprimDirty(path, flag)
  }

  // ---------------------------------------------------------------------- //
  // Scene delegate overrides
  // ---------------------------------------------------------------------- //

  /** unitTestDelegate.cpp:709-731 */
  override getRenderTag(id: string): TfToken {
    if (this._hiddenRprims.has(id)) {
      return T(HdRenderTagTokens.hidden)
    }
    const mesh = this._meshes.get(id)
    if (mesh) {
      return T(mesh.guide ? HdRenderTagTokens.guide : HdRenderTagTokens.geometry)
    } else if (this._curves.has(id)) {
      return T(HdRenderTagTokens.geometry)
    } else if (this._points.has(id)) {
      return T(HdRenderTagTokens.geometry)
    }
    return T(HdRenderTagTokens.hidden)
  }

  /** unitTestDelegate.cpp:733-744 */
  override getTaskRenderTags(id: string): TfToken[] {
    const task = this._tasks.get(id)
    if (!task) return []
    const value = task.params.get(HdTokens.renderTags)
    if (!value || value.IsEmpty()) return []
    const held = value.Get<unknown>()
    if (held instanceof VtArray) return (held.toArray() as string[]).map(T)
    return Array.isArray(held) ? (held as string[]).map(T) : []
  }

  /** unitTestDelegate.cpp:746-761 (operator[] default-inserts a mesh). */
  override getMeshTopology(id: string): HdMeshTopology {
    const mesh = this._getMesh(id)
    return new HdMeshTopology(mesh.scheme, mesh.orientation, mesh.numVerts,
      mesh.verts, mesh.holes)
  }

  /** unitTestDelegate.cpp:763-776 */
  override getBasisCurvesTopology(id: string): HdBasisCurvesTopology {
    let curve = this._curves.get(id)
    if (!curve) this._curves.set(id, curve = new _Curves([], [], [], T(''), T('')))
    // Need to implement testing support for basis curves
    return new HdBasisCurvesTopology(curve.type, curve.basis, curve.wrap,
      curve.curveVertexCounts, curve.curveIndices)
  }

  /** unitTestDelegate.cpp:778-786 */
  override getSubdivTags(id: string): PxOsdSubdivTags {
    return this._getMesh(id).subdivTags
  }

  /** unitTestDelegate.cpp:788-809 */
  override getExtent(id: string): GfRange3d {
    const range = new GfRange3d()
    let points: GfVec3f[] = []
    if (this._meshes.has(id)) {
      points = this._meshes.get(id)!.points
    } else if (this._curves.has(id)) {
      points = this._curves.get(id)!.points
    } else if (this._points.has(id)) {
      points = this._points.get(id)!.points
    }
    for (const p of points) {
      range.unionWith(new GfVec3d(p.get(0), p.get(1), p.get(2)))
    }
    return range
  }

  /** unitTestDelegate.cpp:811-818 */
  override getDoubleSided(id: string): boolean {
    return this._meshes.get(id)?.doubleSided ?? false
  }

  /** unitTestDelegate.cpp:820-829 */
  override getDisplayStyle(id: string): HdDisplayStyle {
    const level = this._refineLevels.get(id)
    if (level !== undefined) {
      return new HdDisplayStyle(level)
    }
    // returns fallback refinelevel
    return new HdDisplayStyle(this._refineLevel)
  }

  /** unitTestDelegate.cpp:831-838 */
  override getCullStyle(id: string): HdCullStyle {
    return this._meshes.get(id)?.cullStyle ?? HdCullStyle.HdCullStyleDontCare
  }

  /** unitTestDelegate.cpp:840-866 */
  override getInstanceIndices(instancerId: string, prototypeId: string): number[] {
    const indices: number[] = []
    // XXX: this is very naive implementation for unit test.
    //   transpose prototypeIndices/instances to instanceIndices/prototype
    const instancer = this._instancers.get(instancerId)
    if (instancer) {
      const prototypeIndex = instancer.prototypes.indexOf(prototypeId)
      if (prototypeIndex < 0) return indices
      for (let i = 0; i < instancer.prototypeIndices.length; ++i) {
        if (instancer.prototypeIndices[i] === prototypeIndex) {
          indices.push(i)
        }
      }
    }
    return indices
  }

  /** unitTestDelegate.cpp:868-879 */
  override getInstancerPrototypes(instancerId: string): string[] {
    return [...(this._instancers.get(instancerId)?.prototypes ?? [])]
  }

  /** unitTestDelegate.cpp:881-890 */
  override getInstancerTransform(instancerId: string): GfMatrix4d {
    const instancer = this._instancers.get(instancerId)
    if (instancer) {
      return new GfMatrix4d(instancer.rootTransform)
    }
    return new GfMatrix4d(1)
  }

  /** unitTestDelegate.cpp:892-899 */
  override getMaterialId(rprimId: string): string {
    return this._materialBindings.get(rprimId) ?? ''
  }

  /** unitTestDelegate.cpp:901-908 */
  override getInstancerId(primId: string): string {
    return this._instancerBindings.get(primId) ?? ''
  }

  /** unitTestDelegate.cpp:910-918 */
  override getMaterialResource(materialId: string): VtValue {
    return this._materials.get(materialId) ?? VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:920-929 */
  override getCameraParamValue(cameraId: string, paramName: string): VtValue {
    const camera = this._cameras.get(cameraId)
    if (camera) {
      return camera.params.get(paramName) ?? VtValue.getEmpty()
    }
    return VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:931-940 */
  override getRenderBufferDescriptor(id: string): HdRenderBufferDescriptor {
    const rb = this._renderBuffers.get(id)
    if (rb) {
      return new HdRenderBufferDescriptor(
        [rb.dims.get(0), rb.dims.get(1), rb.dims.get(2)], rb.format, rb.multiSampled)
    }
    return new HdRenderBufferDescriptor()
  }

  /** unitTestDelegate.cpp:942-956 */
  override getTransform(id: string): GfMatrix4d {
    const mesh = this._meshes.get(id)
    if (mesh) {
      return new GfMatrix4d(mesh.transform)
    }
    const camera = this._cameras.get(id)
    if (camera) {
      return new GfMatrix4d(camera.transform)
    }
    return new GfMatrix4d(1)
  }

  /** unitTestDelegate.cpp:958-969 */
  override getVisible(id: string): boolean {
    const vis = this._visibilities.get(id)
    if (vis !== undefined) {
      return vis
    }
    // returns fallback visibility
    return this._visibility
  }

  // The points of a mesh / curves / points prim as VtValue(VtVec3fArray).
  private _getPointsValue(id: string): VtValue | null {
    const mesh = this._meshes.get(id)
    if (mesh) return _Vec3fArrayValue(mesh.points)
    const curves = this._curves.get(id)
    if (curves) return _Vec3fArrayValue(curves.points)
    const points = this._points.get(id)
    if (points) return _Vec3fArrayValue(points.points)
    return null
  }

  // The instancer primvar values (unitTestDelegate.cpp:1061-1075).
  private _getInstancerPrimvarValue(id: string, key: string): VtValue | null {
    const instancer = this._instancers.get(id)
    if (!instancer) return null
    if (key === HdInstancerTokens.instanceScales) return _Vec3fArrayValue(instancer.scale)
    if (key === HdInstancerTokens.instanceRotations) return _Vec4fArrayValue(instancer.rotate)
    if (key === HdInstancerTokens.instanceTranslations) return _Vec3fArrayValue(instancer.translate)
    return null
  }

  private _isInstancerKey(key: string): boolean {
    return key === HdInstancerTokens.instanceScales
      || key === HdInstancerTokens.instanceRotations
      || key === HdInstancerTokens.instanceTranslations
  }

  /** unitTestDelegate.cpp:1039-1095 */
  override Get(id: string, key: string): VtValue {
    // camera, light, tasks
    const task = this._tasks.get(id)
    if (task) {
      return task.params.get(key) ?? VtValue.getEmpty()
    }
    const light = this._lights.get(id)
    if (light) {
      return light.params.get(key) ?? VtValue.getEmpty()
    }

    let value = VtValue.getEmpty()
    if (key === HdTokens.points) {
      // Each of the prim types hold onto their points
      return this._getPointsValue(id) ?? value
    } else if (this._isInstancerKey(key)) {
      return this._getInstancerPrimvarValue(id, key) ?? value
    } else {
      // Check if key is a primvar
      const pv = this._findPrimvar(id, key)
      if (pv) {
        value = pv.value
        if (pv.indices.length > 0 && value.isArrayValued()) {
          // Flatten primvar
          value = _ComputeFlattenedValue(value, pv.indices)
        }
      }
    }
    return value
  }

  /** unitTestDelegate.cpp:1097-1137 */
  override getIndexedPrimvar(id: string, key: string,
    outIndices: { value: number[] } | null): VtValue {
    if (key === HdTokens.points) {
      return this._getPointsValue(id) ?? VtValue.getEmpty()
    } else if (this._isInstancerKey(key)) {
      return this._getInstancerPrimvarValue(id, key) ?? VtValue.getEmpty()
    }
    // Check if key is a primvar
    const pv = this._findPrimvar(id, key)
    if (pv) {
      if (outIndices) outIndices.value = [...pv.indices]
      return pv.value
    }
    return VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:1139-1149 */
  override getReprSelector(id: string): HdReprSelector {
    return this._meshes.get(id)?.reprSelector ?? new HdReprSelector()
  }

  /** unitTestDelegate.cpp:1151-1186 */
  override getPrimvarDescriptors(id: string, interpolation: HdInterpolation): HdPrimvarDescriptorVector {
    const primvars: HdPrimvarDescriptorVector = []
    if (interpolation === HdInterpolation.HdInterpolationVertex) {
      primvars.push(new HdPrimvarDescriptor(T(HdTokens.points), interpolation,
        T(HdPrimvarRoleTokens.point)))
    }
    if (interpolation === HdInterpolation.HdInterpolationInstance && this._hasInstancePrimvars
      && this._instancers.has(id)) {
      primvars.push(new HdPrimvarDescriptor(T(HdInstancerTokens.instanceScales), interpolation))
      primvars.push(new HdPrimvarDescriptor(T(HdInstancerTokens.instanceRotations), interpolation))
      primvars.push(new HdPrimvarDescriptor(T(HdInstancerTokens.instanceTranslations), interpolation))
    }
    for (const pv of this._primvars.get(id) ?? []) {
      if (pv.interp === interpolation) {
        primvars.push(new HdPrimvarDescriptor(pv.name, pv.interp, pv.role, pv.indices.length > 0))
      }
    }
    return primvars
  }

  // ---------------------------------------------------------------------- //
  // Test geometry
  // ---------------------------------------------------------------------- //

  /**
   * AddCube(id, transform, guide=false, instancerId='', scheme=catmullClark)
   * (unitTestDelegate.cpp:1188-1243) or AddCube(id, transform, guide,
   * instancerId, scheme, color, colorInterpolation, opacity,
   * opacityInterpolation) (unitTestDelegate.cpp:1245-1328).
   */
  addCube(id: string, transform: GfMatrix4f, guide?: boolean, instancerId?: string,
    scheme?: string): void
  addCube(id: string, transform: GfMatrix4f, guide: boolean, instancerId: string,
    scheme: string, color: VtValue, colorInterpolation: HdInterpolation,
    opacity: VtValue, opacityInterpolation: HdInterpolation): void
  addCube(id: string, transform: GfMatrix4f, guide = false, instancerId = '',
    scheme: string = PxOsdOpenSubdivTokens.catmullClark, color?: VtValue,
    colorInterpolation?: HdInterpolation, opacity?: VtValue,
    opacityInterpolation?: HdInterpolation): void {
    const loop = scheme === PxOsdOpenSubdivTokens.loop
    const numVerts = loop ? _cubeLoopNumVerts : _cubeQuadNumVerts
    const verts = loop ? _cubeLoopVerts : _cubeQuadVerts
    if (color === undefined) {
      this.addMesh(id, transform, _CubePoints(), numVerts, verts, guide, instancerId, scheme)
    } else {
      this.addMesh(id, transform, _CubePoints(), numVerts, verts,
        /*holes*/[], new PxOsdSubdivTags(), color, colorInterpolation!,
        opacity!, opacityInterpolation!, guide, instancerId, scheme)
    }
  }

  /** unitTestDelegate.cpp:1330-1396 */
  addPolygons(id: string, transform: GfMatrix4f, colorInterp: HdInterpolation,
    instancerId = ''): void {
    const points = _PolygonPoints()
    const subdivTags = new PxOsdSubdivTags()
    const holes: number[] = []
    let color = VtValue.getEmpty()
    const fabs = Math.abs
    if (colorInterp === HdInterpolation.HdInterpolationConstant) {
      color = _Vec3fValue(new GfVec3f(1, 1, 0))
    } else if (colorInterp === HdInterpolation.HdInterpolationUniform) {
      color = _Vec3fArrayValue([new GfVec3f(1, 0, 0), new GfVec3f(0, 0, 1), new GfVec3f(0, 1, 0)])
    } else if (colorInterp === HdInterpolation.HdInterpolationVertex) {
      const colorArray: GfVec3f[] = []
      for (let i = 0; i < points.length; ++i) {
        colorArray.push(new GfVec3f(fabs(Math.sin(0.5 * i)), fabs(Math.cos(0.7 * i)),
          fabs(Math.sin(0.9 * i) * Math.cos(0.25 * i))))
      }
      color = _Vec3fArrayValue(colorArray)
    } else if (colorInterp === HdInterpolation.HdInterpolationFaceVarying) {
      const colorArray: GfVec3f[] = []
      for (let i = 0; i < _polygonVerts.length; ++i) {
        colorArray.push(new GfVec3f(fabs(Math.sin(0.5 * i)), fabs(Math.cos(0.7 * i)),
          fabs(Math.sin(0.9 * i) * Math.cos(0.25 * i))))
      }
      color = _Vec3fArrayValue(colorArray)
    }
    const opacity = _FloatValue(1.0)
    this.addMesh(id, transform, points, _polygonNumVerts, _polygonVerts, holes, subdivTags,
      color, colorInterp, opacity, HdInterpolation.HdInterpolationConstant, false, instancerId)
  }

  /** unitTestDelegate.cpp:1398-1458 */
  addFaceVaryingPolygons(id: string, transform: GfMatrix4f, instancerId = ''): void {
    const colorArray = [
      new GfVec3f(1, 0, 0),
      new GfVec3f(1, 0.3, 0),
      new GfVec3f(1, 1, 0),
      new GfVec3f(0, 1, 0),
      new GfVec3f(0, 1, 1),
      new GfVec3f(0, 0, 1),
      new GfVec3f(0.5, 0, 0.5),
      new GfVec3f(1, 0.4, 0.7),
      new GfVec3f(1, 1, 1),
      new GfVec3f(1, 0, 0),
      new GfVec3f(1, 0.3, 0),
      new GfVec3f(1, 1, 0),
    ]
    const opacityArray = [
      1.0, 1.0, 1.0, 0.6, 0.6, 0.6, 0.6,
      0.75, 0.75, 0.75, 0.75, 0.75,
    ]
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    this.addMesh(id, transform, _PolygonPoints(), _polygonNumVerts, _polygonVerts,
      [], new PxOsdSubdivTags(),
      _Vec3fArrayValue(colorArray), indices, HdInterpolation.HdInterpolationFaceVarying,
      _FloatArrayValue(opacityArray), indices, HdInterpolation.HdInterpolationFaceVarying,
      false, instancerId)
  }

  /** unitTestDelegate.cpp:1486-1505 */
  addGrid(id: string, nx: number, ny: number, transform: GfMatrix4f,
    rightHanded = true, doubleSided = false, instancerId = ''): void {
    const points: GfVec3f[] = []
    const numVerts: number[] = []
    const verts: number[] = []
    _CreateGrid(nx, ny, points, numVerts, verts, transform)
    this.addMesh(id, transform, points, numVerts, verts, false, instancerId,
      PxOsdOpenSubdivTokens.catmullClark,
      rightHanded ? HdTokens.rightHanded : HdTokens.leftHanded, doubleSided)
  }

  /** unitTestDelegate.cpp:1507-1538 */
  addGridWithCustomColor(id: string, nx: number, ny: number, transform: GfMatrix4f,
    color: VtValue, colorInterpolation: HdInterpolation, rightHanded = true,
    doubleSided = false, instancerId = ''): void {
    const points: GfVec3f[] = []
    const numVerts: number[] = []
    const verts: number[] = []
    _CreateGrid(nx, ny, points, numVerts, verts, transform)
    this.addMesh(id, transform, points, numVerts, verts, [], new PxOsdSubdivTags(),
      color, colorInterpolation, _FloatValue(1.0), HdInterpolation.HdInterpolationConstant,
      false, instancerId, PxOsdOpenSubdivTokens.catmullClark,
      rightHanded ? HdTokens.rightHanded : HdTokens.leftHanded, doubleSided)
  }

  // unitTestDelegate.cpp:1540-1662 share this body; `count` is the color
  // array size and the sin/cos coefficients are those of the grid helpers.
  private _addGridWithColor(id: string, nx: number, ny: number, transform: GfMatrix4f,
    rightHanded: boolean, doubleSided: boolean, instancerId: string,
    interp: HdInterpolation, count: (points: number, faces: number, verts: number) => number): void {
    const points: GfVec3f[] = []
    const numVerts: number[] = []
    const verts: number[] = []
    _CreateGrid(nx, ny, points, numVerts, verts, transform)
    const n = count(points.length, numVerts.length, verts.length)
    const colorArray: GfVec3f[] = []
    for (let i = 0; i < n; ++i) {
      colorArray.push(new GfVec3f(Math.abs(Math.sin(0.1 * i)), Math.abs(Math.cos(0.3 * i)),
        Math.abs(Math.sin(0.7 * i) * Math.cos(0.25 * i))))
    }
    this.addMesh(id, transform, points, numVerts, verts, [], new PxOsdSubdivTags(),
      _Vec3fArrayValue(colorArray), interp, _FloatValue(1.0),
      HdInterpolation.HdInterpolationConstant, false, instancerId,
      PxOsdOpenSubdivTokens.catmullClark,
      rightHanded ? HdTokens.rightHanded : HdTokens.leftHanded, doubleSided)
  }

  /** unitTestDelegate.cpp:1540-1578 */
  addGridWithFaceColor(id: string, nx: number, ny: number, transform: GfMatrix4f,
    rightHanded = true, doubleSided = false, instancerId = ''): void {
    this._addGridWithColor(id, nx, ny, transform, rightHanded, doubleSided, instancerId,
      HdInterpolation.HdInterpolationUniform, (_p, faces) => faces)
  }

  /** unitTestDelegate.cpp:1580-1618 */
  addGridWithVertexColor(id: string, nx: number, ny: number, transform: GfMatrix4f,
    rightHanded = true, doubleSided = false, instancerId = ''): void {
    this._addGridWithColor(id, nx, ny, transform, rightHanded, doubleSided, instancerId,
      HdInterpolation.HdInterpolationVertex, p => p)
  }

  /** unitTestDelegate.cpp:1620-1662 */
  addGridWithFaceVaryingColor(id: string, nx: number, ny: number, transform: GfMatrix4f,
    rightHanded = true, doubleSided = false, instancerId = ''): void {
    this._addGridWithColor(id, nx, ny, transform, rightHanded, doubleSided, instancerId,
      HdInterpolation.HdInterpolationFaceVarying, (_p, _f, v) => v)
  }

  /** unitTestDelegate.cpp:1664-1756 */
  addCurves(id: string, type: string, basis: string, transform: GfMatrix4f,
    colorInterp: HdInterpolation = HdInterpolation.HdInterpolationConstant,
    widthInterp: HdInterpolation = HdInterpolation.HdInterpolationConstant,
    authoredNormals = false, instancerId = ''): void {
    const curveVertexCounts = [4, 4]
    let points = _CubePoints()
    let authNormals: GfVec3f[] = []
    if (authoredNormals) {
      authNormals = [
        new GfVec3f(0.0, -0.7, 0.7),
        new GfVec3f(0.0, 0.0, 1.0),
        new GfVec3f(0.0, 0.7, 0.7),
        new GfVec3f(0.7, 0.7, 0.0),
        new GfVec3f(0.0, 0.0, 1.0),
        new GfVec3f(0.0, 0.0, 1.0),
        new GfVec3f(-1.0, 0.0, 0.0),
        new GfVec3f(-1.0, 0.0, 0.0),
      ]
    }
    points = points.map(p => _Transform4f(p, transform))

    let color = VtValue.getEmpty()
    if (colorInterp === HdInterpolation.HdInterpolationConstant) {
      color = _Vec3fValue(new GfVec3f(1))
    } else if (colorInterp === HdInterpolation.HdInterpolationUniform) {
      color = _Vec3fArrayValue([new GfVec3f(1, 0, 0), new GfVec3f(0, 0, 1)])
    } else if (colorInterp === HdInterpolation.HdInterpolationVertex) {
      color = _Vec3fArrayValue([
        new GfVec3f(0, 0, 1),
        new GfVec3f(0, 1, 0),
        new GfVec3f(0, 1, 1),
        new GfVec3f(1, 0, 0),
        new GfVec3f(1, 0, 1),
        new GfVec3f(1, 1, 0),
        new GfVec3f(1, 1, 1),
        new GfVec3f(0.5, 0.5, 1),
      ])
    }

    let width = VtValue.getEmpty()
    if (widthInterp === HdInterpolation.HdInterpolationConstant) {
      width = _FloatValue(0.1)
    } else if (widthInterp === HdInterpolation.HdInterpolationUniform) {
      width = _FloatArrayValue([0.1, 0.4])
    } else if (widthInterp === HdInterpolation.HdInterpolationVertex) {
      width = _FloatArrayValue([0, 0.1, 0.2, 0.3, 0.1, 0.2, 0.2, 0.1])
    } else if (type === HdTokens.cubic && widthInterp === HdInterpolation.HdInterpolationVarying) {
      width = _FloatArrayValue([0, 0.1, 0.2, 0.3])
    } else if (type === HdTokens.linear && widthInterp === HdInterpolation.HdInterpolationVarying) {
      width = _FloatArrayValue([0, 0.1, 0.2, 0.3, 0.1, 0.2, 0.2, 0.1])
    }

    this.addBasisCurves(id, points, curveVertexCounts, /*curveIndices=*/[], authNormals,
      type, basis, color, colorInterp, _FloatValue(1.0), HdInterpolation.HdInterpolationConstant,
      width, widthInterp, instancerId)
  }

  /** unitTestDelegate.cpp:1758-1772 */
  setCurveWrapMode(id: string, wrap: string): void {
    const curves = this._curves.get(id)
    if (curves) {
      if (curves.wrap !== wrap) {
        curves.wrap = T(wrap)
        this.getRenderIndex().getChangeTracker().markRprimDirty(id, HdChangeTracker.DirtyTopology)
      }
    } else {
      TF_WARN(`Could not find Rprim named ${id}.\n`)
    }
  }

  /** unitTestDelegate.cpp:1774-1820 */
  private _addPointsWithTransform(id: string, transform: GfMatrix4f,
    colorInterp: HdInterpolation, widthInterp: HdInterpolation, instancerId: string): void {
    const numPoints = 500
    const points: GfVec3f[] = []
    let s = 0, t = 0
    for (let i = 0; i < numPoints; ++i) {
      const p = _Transform4f(new GfVec3f(Math.sin(s) * Math.cos(t), Math.sin(s) * Math.sin(t),
        Math.cos(s)), transform)
      points.push(p)
      // `float s = 0, t = 0;` (unitTestDelegate.cpp:1779): each step is
      // rounded to float. Over 500 steps that moves the points by up to
      // 0.03 pixels in testHdStBasicDrawing, which decides edge pixels of
      // its wide points.
      s = Math.fround(s + 0.10)
      t = Math.fround(t + 0.34)
    }

    let color = VtValue.getEmpty()
    if (colorInterp === HdInterpolation.HdInterpolationConstant
      || colorInterp === HdInterpolation.HdInterpolationUniform) {
      color = _Vec3fValue(new GfVec3f(1, 1, 1))
    } else if (colorInterp === HdInterpolation.HdInterpolationVertex) {
      const colors: GfVec3f[] = []
      for (let i = 0; i < numPoints; ++i) {
        colors.push(new GfVec3f(Math.abs(Math.sin(0.1 * i)), Math.abs(Math.cos(0.3 * i)),
          Math.abs(Math.sin(0.7 * i) * Math.cos(0.25 * i))))
      }
      color = _Vec3fArrayValue(colors)
    }

    let width: VtValue
    if (widthInterp === HdInterpolation.HdInterpolationConstant
      || widthInterp === HdInterpolation.HdInterpolationUniform) {
      width = _FloatValue(0.1)
    } else { // VERTEX
      const widths: number[] = []
      for (let i = 0; i < numPoints; ++i) widths.push(0.1 * Math.abs(Math.sin(0.1 * i)))
      width = _FloatArrayValue(widths)
    }

    this.addPoints(id, points, color, colorInterp, _FloatValue(1.0),
      HdInterpolation.HdInterpolationConstant, width, widthInterp, instancerId)
  }

  /** unitTestDelegate.cpp:1822-1896 */
  addSubdiv(id: string, transform: GfMatrix4f, instancerId = ''): void {
    /*
         0-----3-------4-----7
         |     ||      |     |
         |     || hole |     |
         |     ||       \    |
         1-----2--------[5]--6
               |        /    |
               |       |     |
               |       |     |
               8-------9----10

           =  : creased edge
           [] : corner vertex
    */
    const numVerts = [4, 4, 4, 4, 4]
    const verts = [
      0, 1, 2, 3,
      3, 2, 5, 4,
      4, 5, 6, 7,
      2, 8, 9, 5,
      5, 9, 10, 6,
    ]
    const points = [
      new GfVec3f(-1.0, 0.0, 1.0),
      new GfVec3f(-1.0, 0.0, 0.0),
      new GfVec3f(-0.5, 0.0, 0.0),
      new GfVec3f(-0.5, 0.0, 1.0),
      new GfVec3f(0.0, 0.0, 1.0),
      new GfVec3f(0.5, 0.0, 0.0),
      new GfVec3f(1.0, 0.0, 0.0),
      new GfVec3f(1.0, 0.0, 1.0),
      new GfVec3f(-0.5, 0.0, -1.0),
      new GfVec3f(0.0, 0.0, -1.0),
      new GfVec3f(1.0, 0.0, -1.0),
    ]
    const holes = [1]
    const subdivTags = new PxOsdSubdivTags()
    subdivTags.setCreaseLengths([2])
    subdivTags.setCreaseIndices([2, 3])
    subdivTags.setCreaseWeights([5.0])
    subdivTags.setCornerIndices([5])
    subdivTags.setCornerWeights([5.0])
    subdivTags.setVertexInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)
    subdivTags.setFaceVaryingInterpolationRule(PxOsdOpenSubdivTokens.edgeOnly)

    this.addMesh(id, transform, points, numVerts, verts, holes, subdivTags,
      /*color=*/_Vec3fValue(new GfVec3f(1)),
      /*colorInterpolation=*/HdInterpolation.HdInterpolationConstant,
      /*opacity=*/_FloatValue(1.0), HdInterpolation.HdInterpolationConstant,
      false, instancerId)
  }

  /** unitTestDelegate.cpp:1916-2131 */
  populateBasicTestSet(): GfVec3f {
    const dmat = new GfMatrix4d(1)
    let xPos = 0.0
    const f = (m: GfMatrix4d): GfMatrix4f => new GfMatrix4f(m)
    const C = HdInterpolation

    // grids
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addGrid('/grid1', 10, 10, f(dmat))
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addGridWithFaceColor('/grid2', 10, 10, f(dmat))
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addGridWithVertexColor('/grid3', 10, 10, f(dmat))
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addGridWithFaceVaryingColor('/grid3a', 3, 3, f(dmat))
    xPos += 3.0

    // non-quads
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addPolygons('/nonquads1', f(dmat), C.HdInterpolationConstant)
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addPolygons('/nonquads2', f(dmat), C.HdInterpolationUniform)
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addPolygons('/nonquads3', f(dmat), C.HdInterpolationVertex)
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addPolygons('/nonquads4', f(dmat), C.HdInterpolationFaceVarying)
    xPos += 3.0

    // more grids (backface, single sided)
    // rotate X 180
    dmat.setRotate(makeRotation([1, 0, 0], 180.0))
    dmat.setTranslateOnly(new GfVec3d(xPos, -3.0, 0.0))
    this.addGrid('/grid4', 10, 10, f(dmat))
    // inverse X
    dmat.setScale(new GfVec3d(-1, 1, 1))
    dmat.setTranslateOnly(new GfVec3d(xPos, 0.0, 0.0))
    this.addGridWithFaceColor('/grid5', 10, 10, f(dmat))
    // inverse Z
    dmat.setScale(new GfVec3d(1, 1, -1))
    dmat.setTranslateOnly(new GfVec3d(xPos, 3.0, 0.0))
    this.addGridWithVertexColor('/grid6', 10, 10, f(dmat))
    // left-handed
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addGridWithFaceVaryingColor('/grid7', 3, 3, f(dmat), /*rightHanded=*/false)
    xPos += 3.0

    // more grids (backface, double sided)
    dmat.setRotate(makeRotation([1, 0, 0], 180.0))
    dmat.setTranslateOnly(new GfVec3d(xPos, -3.0, 0.0))
    this.addGrid('/grid8', 10, 10, f(dmat), /*rightHanded=*/true, /*doubleSided=*/true)
    dmat.setScale(new GfVec3d(-1, 1, 1))
    dmat.setTranslateOnly(new GfVec3d(xPos, 0.0, 0.0))
    this.addGridWithFaceColor('/grid9', 10, 10, f(dmat), true, true)
    dmat.setScale(new GfVec3d(1, 1, -1))
    dmat.setTranslateOnly(new GfVec3d(xPos, 3.0, 0.0))
    this.addGridWithVertexColor('/grid10', 10, 10, f(dmat), true, true)
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addGridWithFaceVaryingColor('/grid11', 3, 3, f(dmat), false, true)
    xPos += 3.0

    // cubes
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addCube('/cube1', f(dmat), false, '', PxOsdOpenSubdivTokens.loop)
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addCube('/cube2', f(dmat), false, '', PxOsdOpenSubdivTokens.catmullClark)
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addCube('/cube3', f(dmat), false, '', PxOsdOpenSubdivTokens.bilinear)
    xPos += 3.0

    // cubes with authored reprs
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addCube('/cube4', f(dmat), false, '', PxOsdOpenSubdivTokens.catmullClark)
    this.setReprSelector('/cube4', new HdReprSelector(HdReprTokens.smoothHull))
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addCube('/cube5', f(dmat), false, '', PxOsdOpenSubdivTokens.catmullClark)
    this.setReprSelector('/cube5', new HdReprSelector(HdReprTokens.hull))
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addCube('/cube6', f(dmat), false, '', PxOsdOpenSubdivTokens.catmullClark)
    this.setReprSelector('/cube6', new HdReprSelector(HdReprTokens.refined))
    this.setRefineLevel('/cube6', Math.max(1, this._refineLevel))
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addCube('/cube7', f(dmat), false, '', PxOsdOpenSubdivTokens.catmullClark)
    this.setReprSelector('/cube7', new HdReprSelector(HdReprTokens.wireOnSurf))
    xPos += 3.0

    // curves
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addCurves('/curve1', HdTokens.linear, '', f(dmat), C.HdInterpolationVertex, C.HdInterpolationVertex)
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addCurves('/curve2', HdTokens.cubic, HdTokens.bezier, f(dmat), C.HdInterpolationVertex, C.HdInterpolationVertex)
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addCurves('/curve3', HdTokens.cubic, HdTokens.bspline, f(dmat), C.HdInterpolationVertex, C.HdInterpolationConstant)
    dmat.setTranslate(new GfVec3d(xPos, 6.0, 0.0))
    this.addCurves('/curve4', HdTokens.cubic, HdTokens.catmullRom, f(dmat), C.HdInterpolationVertex, C.HdInterpolationConstant)
    xPos += 3.0

    // points
    dmat.setTranslate(new GfVec3d(xPos, -3.0, 0.0))
    this.addPoints('/points1', f(dmat), C.HdInterpolationConstant, C.HdInterpolationConstant)
    dmat.setTranslate(new GfVec3d(xPos, 0.0, 0.0))
    this.addPoints('/points2', f(dmat), C.HdInterpolationVertex, C.HdInterpolationConstant)
    dmat.setTranslate(new GfVec3d(xPos, 3.0, 0.0))
    this.addPoints('/points3', f(dmat), C.HdInterpolationVertex, C.HdInterpolationVertex)

    return new GfVec3f(xPos / 2.0, 0, 0)
  }

  /** unitTestDelegate.cpp:2133-2162 */
  populateInvalidPrimsSet(): GfVec3f {
    const C = HdInterpolation
    // empty mesh
    this.addGrid('/empty_mesh', 0, 0, new GfMatrix4f(1))
    // empty curve
    this.addBasisCurves('/empty_curve', [], [], [], [], HdTokens.linear, '',
      _Vec3fValue(new GfVec3f(1)), C.HdInterpolationConstant,
      _FloatValue(1.0), C.HdInterpolationConstant,
      _FloatValue(1.0), C.HdInterpolationConstant)
    // empty point
    this.addPoints('/empty_points', [],
      _Vec4fValue(new GfVec4f(1)), C.HdInterpolationConstant,
      _FloatValue(1.0), C.HdInterpolationConstant,
      _FloatValue(1.0), C.HdInterpolationConstant)
    return new GfVec3f(0)
  }

  // ---------------------------------------------------------------------- //
  // private utility methods
  // ---------------------------------------------------------------------- //

  /** unitTestDelegate.cpp:2164-2175 */
  protected _getPrimvarValue(id: string, name: string): VtValue {
    const pv = this._findPrimvar(id, name)
    if (pv) return pv.value
    TF_WARN(`Rprim ${id} has no primvar named ${name}.\n`)
    return VtValue.getEmpty()
  }

  /** unitTestDelegate.cpp:2177-2203: the primvar, or null. */
  private _findPrimvar(id: string, name: string): _Primvar | null {
    const primvars = this._primvars.get(id)
    if (!primvars) return null
    return primvars.find(x => x.name === name) ?? null
  }

  // std::map::operator[] on _meshes (default-constructed _Mesh).
  private _getMesh(id: string): _Mesh {
    let mesh = this._meshes.get(id)
    if (!mesh) {
      mesh = new _Mesh(T(''), T(''), new GfMatrix4f(1), [], [], [], [],
        new PxOsdSubdivTags(), false, false)
      this._meshes.set(id, mesh)
    }
    return mesh
  }
}
