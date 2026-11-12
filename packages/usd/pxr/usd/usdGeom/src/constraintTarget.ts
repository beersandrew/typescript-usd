// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/constraintTarget.cpp,
//  pxr/usd/usdGeom/constraintTarget.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomConstraintTarget — a named, matrix-typed attribute in the
// `constraintTargets:` namespace on a MODEL prim, defining a local constraint
// space. Reference: pxr/usd/usdGeom/constraintTarget.cpp.
//
// Validity (UsdGeomConstraintTarget::IsValid): the prim is a model, the attr is
// in the constraintTargets namespace, and the attr is matrix-typed
// (matrix4d / frame4d, both backed by GfMatrix4d). ComputeInWorldSpace composes
// the authored local space with the model's local-to-world: local · localToWorld
// (row-vector convention).

import { Prim, type Stage, type Attribute } from 'typescript-usd/usd'
import { type Matrix4, IDENTITY_MATRIX, mul4 } from 'typescript-usd/gf'
import { asMatrix4Flat } from './valueUtils.ts'
import { XformCache } from './xformCache.ts'

export const CONSTRAINT_TARGETS_NS = 'constraintTargets'
const IDENTIFIER_FIELD = 'constraintTargetIdentifier'

// Model kinds (UsdModelAPI::IsModel). typescript-usd has no KindRegistry, so this is the
// builtin model-kind set; subcomponent is intentionally excluded (not a model).
// FAITHFULNESS-DEBT(constraintTarget-isModel): hard-coded model-kind set stands
// in for the KindRegistry hierarchy walk.
const MODEL_KINDS = new Set(['model', 'component', 'group', 'assembly'])

export function getConstraintAttrName(constraintName: string): string {
  return `${CONSTRAINT_TARGETS_NS}:${constraintName}`
}

// kind metadata does not flatten into composed nodes in this implementation, so
// read it from the edit-target layer spec (valid for in-memory authoring stages).
function isModelPrim(stage: Stage, primPath: string): boolean {
  const kind = stage.getEditTarget().getLayer()!.getField(primPath, 'kind')
  return typeof kind === 'string' && MODEL_KINDS.has(kind)
}

export class ConstraintTarget {
  private readonly _prim: Prim | null
  private readonly _attrName: string

  // Constructs from a constraint-target attribute handle (UsdGeom.ConstraintTarget(attr)),
  // or null/invalid attr. GeomModelAPI uses the (prim, attrName) overload directly.
  constructor(attr: Attribute | null, prim?: Prim, attrName?: string) {
    if (prim !== undefined) {
      this._prim = prim
      this._attrName = attrName ?? ''
    } else if (attr) {
      this._prim = attr.getStage()._primHandle(attr.primPath)
      this._attrName = attr.name
    } else {
      this._prim = null
      this._attrName = ''
    }
  }

  // Internal factory used by GeomModelAPI (it already holds the model prim).
  static _forPrim(prim: Prim, attrName: string): ConstraintTarget {
    return new ConstraintTarget(null, prim, attrName)
  }

  getAttr(): Attribute | null {
    return this._prim ? this._prim.attr(this._attrName) : null
  }

  get attrName(): string { return this._attrName }

  isValid(): boolean {
    const prim = this._prim
    if (!prim) return false
    const stage = prim.getStage()
    // In the constraintTargets namespace?
    if (this._attrName.split(':')[0] !== CONSTRAINT_TARGETS_NS) return false
    // On a model prim?
    if (!isModelPrim(stage, prim.path)) return false
    // Matrix-typed? (matrix4d and frame4d are both GfMatrix4d.)
    const t = stage.get(`${prim.path}.${this._attrName}`)?.typeName
    return t === 'matrix4d' || t === 'frame4d'
  }

  isDefined(): boolean { return this.isValid() }

  setIdentifier(identifier: string): void {
    if (!this._prim) return
    const propPath = `${this._prim.path}.${this._attrName}`
    this._prim.getStage().getEditTarget().getLayer()!.setField(propPath, IDENTIFIER_FIELD, identifier)
  }

  getIdentifier(): string {
    if (!this._prim) return ''
    const propPath = `${this._prim.path}.${this._attrName}`
    const v = this._prim.getStage().getEditTarget().getLayer()!.getField(propPath, IDENTIFIER_FIELD)
    return typeof v === 'string' ? v : ''
  }

  // Authors the local constraint-space matrix (4x4 row-major number[][]).
  set(matrix: number[][] | number[], time?: number): void {
    if (!this._prim) return
    const attr = this._prim.attr(this._attrName)
    if (time !== undefined) attr.setTimeSample(time, matrix)
    else attr.set(matrix)
  }

  getMatrix(time?: number): Matrix4 {
    if (!this._prim) return [...IDENTITY_MATRIX] as Matrix4
    const node = this._prim.getStage().get(`${this._prim.path}.${this._attrName}`)
    const v = node
      ? (time !== undefined ? node.getValueAtTime(time) : node.getValue())
      : undefined
    return (asMatrix4Flat(v) as Matrix4 | null) ?? ([...IDENTITY_MATRIX] as Matrix4)
  }

  // local · localToWorld(modelPrim)  (UsdGeomConstraintTarget::ComputeInWorldSpace).
  computeInWorldSpace(time?: number): Matrix4 {
    if (!this._prim) return [...IDENTITY_MATRIX] as Matrix4
    const local = this.getMatrix(time)
    const cache = new XformCache(this._prim.getStage(), time)
    const localToWorld = cache.getLocalToWorldTransform(this._prim.path)
    return mul4(local, localToWorld)
  }
}
