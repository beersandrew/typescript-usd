// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/crateData.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The usdc data backend's handling of relationship target and attribute
// connection specs (Sdf_CrateData, pxr/usd/sdf/crateData.cpp:179-560): they
// are not stored. Their existence, and the targetChildren and
// connectionChildren fields, are synthesized from the owning property's
// targetPaths or connectionPaths list op.

import type { SdfAbstractDataSpecVisitor, SdfSpecType } from './abstractData.ts'
import { SdfData } from './data.ts'
import { sdfNormalizeListOp, type SdfNormalizedListOp } from './listOp.ts'
import { SdfPath } from './path.ts'

function isTargetPathString(path: string): boolean {
  return path.endsWith(']') && SdfPath.fromString(path).isTargetPath()
}

function isChildrenField(fieldName: string): boolean {
  return fieldName === 'connectionChildren' || fieldName === 'targetChildren'
}

export class Sdf_CrateData extends SdfData {
  // Sdf_CrateDataImpl::StreamsData/IsDetached, crateData.cpp:196-202:
  // only opened backing files stream, and detached backing files do not.
  constructor(private readonly _hasBackingFile = false, private readonly _detached = false,
    private _fileVersion?: readonly [number, number, number]) { super() }
  /** @internal The backing crate file's version (CrateFile::_boot.version),
   * which saving in place keeps (crateFile.cpp:993-999). */
  _getFileVersion(): readonly [number, number, number] | undefined { return this._fileVersion }
  /** @internal Saving in place leaves the data backed by the file just
   * written (crateData.cpp:131-192). */
  _setFileVersion(version: readonly [number, number, number]): void { this._fileVersion = version }
  override streamsData(): boolean { return this._hasBackingFile && !this._detached }
  override isDetached(): boolean { return this._hasBackingFile && this._detached }
  // _GetTargetOrConnectionListOpValue: the property's path list op and
  // whether it is a relationship's or an attribute's.
  private _targetOrConnectionListOp(path: string):
    { specType: SdfSpecType; listOp: SdfNormalizedListOp<string> } | undefined {
    if (!SdfPath.fromString(path).isPrimPropertyPath()) return undefined
    let specType: SdfSpecType = 'relationship'
    let value = super._getView(path, 'targetPaths')
    if (value === undefined) {
      specType = 'attribute'
      value = super._getView(path, 'connectionPaths')
    }
    const listOp = value === undefined ? null : sdfNormalizeListOp<string>(value)
    return listOp ? { specType, listOp } : undefined
  }

  // The target paths of the target or connection specs (_VisitSpecs).
  private _targetSpecPaths(listOp: SdfNormalizedListOp<string>): string[] {
    if (listOp.isExplicit) return listOp.explicitItems.map(String)
    const items = [...listOp.addedItems, ...listOp.prependedItems, ...listOp.appendedItems].map(String)
    return [...new Set(items)].sort((a, b) => SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b)))
  }

  // _HasTargetOrConnectionSpec: a target in the explicit, added, prepended
  // or appended items.
  private _hasTargetOrConnectionSpec(path: string): boolean {
    const sdfPath = SdfPath.fromString(path)
    const owner = this._targetOrConnectionListOp(sdfPath.getParentPath().pathString)
    if (!owner) return false
    const target = sdfPath.getTargetPath().pathString
    const { listOp } = owner
    if (listOp.isExplicit) return listOp.explicitItems.map(String).includes(target)
    return [...listOp.addedItems, ...listOp.prependedItems, ...listOp.appendedItems]
      .map(String).includes(target)
  }

  override hasSpec(path: string): boolean {
    if (isTargetPathString(path)) return this._hasTargetOrConnectionSpec(path)
    return super.hasSpec(path)
  }

  override getSpecType(path: string): SdfSpecType {
    if (isTargetPathString(path)) {
      if (!this._hasTargetOrConnectionSpec(path)) return 'unknown'
      const parentType = this.getSpecType(SdfPath.fromString(path).getParentPath().pathString)
      return parentType === 'relationship' ? 'relationshipTarget'
        : parentType === 'attribute' ? 'connection' : 'unknown'
    }
    return super.getSpecType(path)
  }

  override has(path: string, fieldName: string): boolean {
    if (super.has(path, fieldName)) return true
    return isChildrenField(fieldName) && this._targetOrConnectionListOp(path) !== undefined
  }

  override get(path: string, fieldName: string): unknown {
    const value = super.get(path, fieldName)
    if (value !== undefined || !isChildrenField(fieldName)) return value
    return this._childrenFieldValue(path)
  }

  override _getView(path: string, fieldName: string): unknown {
    const value = super._getView(path, fieldName)
    if (value !== undefined || !isChildrenField(fieldName)) return value
    return this._childrenFieldValue(path)
  }

  // _HasConnectionOrTargetChildren: the list op's applied paths.
  private _childrenFieldValue(path: string): string[] | undefined {
    const owner = this._targetOrConnectionListOp(path)
    if (!owner) return undefined
    const op = owner.listOp
    if (op.isExplicit) return [...new Set(op.explicitItems.map(String))]
    let result: string[] = []
    for (const item of op.deletedItems.map(String)) result = result.filter(x => x !== item)
    for (const item of op.addedItems.map(String)) if (!result.includes(item)) result.push(item)
    for (let i = op.prependedItems.length - 1; i >= 0; i--) {
      const item = String(op.prependedItems[i])
      result = [item, ...result.filter(x => x !== item)]
    }
    for (const item of op.appendedItems.map(String)) result = [...result.filter(x => x !== item), item]
    return result
  }

  override list(path: string): string[] {
    const names = super.list(path)
    // A property with a target or connection list op lists its children field.
    if (super.hasSpec(path)) {
      const owner = this._targetOrConnectionListOp(path)
      if (owner?.specType === 'relationship') names.push('targetChildren')
      else if (owner?.specType === 'attribute') names.push('connectionChildren')
    }
    return names
  }

  // Target and connection specs are not stored.
  protected override _createSpec(path: string, specType: SdfSpecType): void {
    if (isTargetPathString(path)) return
    super._createSpec(path, specType)
  }

  protected override _eraseSpec(path: string): void {
    if (isTargetPathString(path)) return
    super._eraseSpec(path)
  }

  protected override _moveSpec(oldPath: string, newPath: string): void {
    if (isTargetPathString(oldPath)) return
    super._moveSpec(oldPath, newPath)
  }

  // The children fields are synthesized from the list ops, so setting them
  // does nothing.
  protected override _set(path: string, fieldName: string, value: unknown): void {
    if (isChildrenField(fieldName) || isTargetPathString(path)) return
    super._set(path, fieldName, value)
  }

  protected override _erase(path: string, fieldName: string): void {
    if (isChildrenField(fieldName)) return
    super._erase(path, fieldName)
  }

  // _VisitSpecs: each stored spec, then its synthesized target specs.
  protected override _visitSpecs(visitor: Pick<SdfAbstractDataSpecVisitor, 'visitSpec'>): void {
    const paths: string[] = []
    super._visitSpecs({ visitSpec: (_data, path) => { paths.push(path); return true } })
    for (const path of paths) {
      if (!visitor.visitSpec(this, path)) return
      const specType = super.getSpecType(path)
      if (specType !== 'attribute' && specType !== 'relationship') continue
      const owner = this._targetOrConnectionListOp(path)
      if (!owner) continue
      const propertyPath = SdfPath.fromString(path)
      for (const target of this._targetSpecPaths(owner.listOp)) {
        if (!visitor.visitSpec(this, propertyPath.appendTarget(SdfPath.fromString(target)).pathString)) return
      }
    }
  }
}
