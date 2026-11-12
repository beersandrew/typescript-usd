// Ported from OpenUSD 26.11.1: pxr/usd/usd/relationship.cpp,
//  pxr/usd/usd/relationship.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/relationship.{h,cpp} — UsdRel, the relationship
// authoring handle returned from Prim.rel() / createRel().

import { ListPositionBackOfPrependList, type UsdListPosition } from './common.ts'
import type { Prim } from './prim.ts'
import type { Stage } from './stage.ts'
import { Value as VtValue } from 'typescript-usd/vt'

// A relationship handle returned from Prim.rel() / createRel().
export class UsdRel {
  constructor(
    private readonly _stage: Stage,
    private readonly _primPath: string,
    readonly name: string,
  ) {}

  // UsdObject::GetPath.
  getPath(): string { return `${this._primPath}.${this.name}` }

  setTargets(targets: string[]): void {
    this._stage._setRelTargets(this._primPath, this.name, targets)
  }

  // UsdObject::GetPrim.
  getPrim(): Prim | undefined { return this._stage.getPrim(this._primPath) }

  // UsdObject::GetStage (OpenUSD 26.11.1 object.cpp:18-22).
  getStage(): Stage { return this._stage }

  // UsdObject::IsValid (OpenUSD 26.11.1 object.h:127-137): a relationship
  // object is valid while its prim is and its defining spec is a
  // relationship spec.
  isValid(): boolean {
    const prim = this.getPrim()
    if (!prim?.isValid()) return false
    return this._stage._getDefiningSpecType(prim._prim.path, this.name) === 'relationship'
  }

  // UsdProperty::GetBaseName (OpenUSD 26.11.1 property.cpp:29-41): the name
  // after the last namespace delimiter.
  getBaseName(): string {
    const fullName = this.name
    const delim = fullName.lastIndexOf(':')
    if (delim === fullName.length - 1) return ''
    return delim < 0 ? fullName : fullName.slice(delim + 1)
  }

  // UsdProperty::GetNamespace (OpenUSD 26.11.1 property.cpp:43-55).
  getNamespace(): string {
    const fullName = this.name
    const delim = fullName.lastIndexOf(':')
    if (delim === fullName.length - 1) return ''
    return delim < 0 ? '' : fullName.slice(0, delim)
  }

  // UsdRelationship::AddTarget (relationship.cpp:85-111): Usd_InsertListItem
  // of the target into the edit target's target list op, at position.
  addTarget(target: string, position: UsdListPosition = ListPositionBackOfPrependList): boolean {
    this._stage._addRelTarget(this._primPath, this.name, target, position)
    return true
  }

  // UsdRelationship::RemoveTarget (relationship.cpp:115-137).
  removeTarget(target: string): boolean {
    this._stage._removeRelTarget(this._primPath, this.name, target)
    return true
  }

  // UsdRelationship::ClearTargets (relationship.cpp:176-196).
  clearTargets(removeSpec: boolean): boolean {
    this._stage._clearRelTargets(this._primPath, this.name, removeSpec)
    return true
  }

  getTargets(): string[] {
    return this._stage.get(`${this._primPath}.${this.name}`)?.getTargets() ?? []
  }

  // UsdRelationship::GetForwardedTargets (relationship.cpp:262-279) through
  // _GetForwardedTargetsImpl (:209-260): targets that are relationships are
  // replaced, recursively and once per relationship, by their own forwarded
  // targets; duplicates keep their first position. The returned targets are
  // the SdfPathVector result; the bool success value is not modelled, since
  // target resolution here reports no errors.
  getForwardedTargets(): string[] {
    const visited = new Set<string>([this.getPath()])
    const unique = new Set<string>()
    const targets: string[] = []
    const visit = (primPath: string, name: string): void => {
      for (const target of this._stage.get(`${primPath}.${name}`)?.getTargets() ?? []) {
        const dot = target.indexOf('.')
        // :229-247: a prim-property target naming a relationship forwards.
        if (dot > 0 && !target.includes('[')) {
          const relPrim = target.slice(0, dot), relName = target.slice(dot + 1)
          if (this._stage.get(target)?.isRelationship) {
            if (!visited.has(target)) {
              visited.add(target)
              visit(relPrim, relName)
            }
            continue
          }
        }
        if (!unique.has(target)) {
          unique.add(target)
          targets.push(target)
        }
      }
    }
    visit(this._primPath, this.name)
    return targets
  }

  // UsdRelationship inherits UsdProperty metadata authoring. OpenUSD v26.08
  // pxr/usd/usd/property.{h,cpp}.
  getMetadata(fieldName: string): unknown
  /** UsdObject::GetMetadata(const TfToken &key, VtValue *value) (object.h:285). */
  getMetadata(fieldName: string, value: VtValue): boolean
  getMetadata(fieldName: string, value?: VtValue): unknown {
    const property = this._stage.get(`${this._primPath}.${this.name}`)
    if (value) {
      if (property) return property.getMetadata(fieldName, value)
      value.swap(VtValue.getEmpty())
      return false
    }
    return property?.getMetadata(fieldName)
  }

  setMetadata(fieldName: string, value: unknown): boolean {
    this._stage._setPropertyMetadata(this._primPath, this.name, fieldName, value)
    return true
  }
}
