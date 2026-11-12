// Ported from OpenUSD 26.11.1: pxr/usd/sdf/listEditor.cpp,
//  pxr/usd/sdf/listEditor.h, pxr/usd/sdf/connectionListEditor.cpp,
//  pxr/usd/sdf/connectionListEditor.h, pxr/usd/sdf/listOpListEditor.h,
//  pxr/usd/sdf/vectorListEditor.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/listEditor.h, listOpListEditor.h, vectorListEditor.h
// and connectionListEditor.{h,cpp}: the editors behind SdfListProxy and
// SdfListEditorProxy, which read a spec's list-op (or vector) field, edit it,
// and write it back.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfSpecType } from './abstractData.ts'
import { SdfAllowed } from './allowed.ts'
import { sdfChangeBlock } from './changeManager.ts'
import {
  Sdf_AttributeConnectionChildPolicy, Sdf_RelationshipTargetChildPolicy, type Sdf_ChildPolicy,
} from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { SdfListOp, type SdfListOpApplyCallback, type SdfListOpType } from './listOp.ts'
import type { Layer } from './layer.ts'
import { SdfPath } from './path.ts'
import type { SdfSpec } from './spec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

// The type policies of proxyPolicies.h: how items are canonicalized and
// compared, and how stored items are read.
export interface SdfListTypePolicy<T> {
  canonicalize(value: T): T
  equals(a: T, b: T): boolean
  fromStored(value: unknown): T
}

export abstract class Sdf_ListEditor<T> {
  constructor(
    private readonly _owner: SdfSpec | undefined,
    private readonly _field: string,
    private readonly _typePolicy: SdfListTypePolicy<T>,
  ) {}

  getLayer(): Layer | undefined { return this._owner?.getLayer() }

  getPath(): SdfPath { return this._owner?.getPath() ?? SdfPath.emptyPath }

  isValid(): boolean { return !this.isExpired() }

  isExpired(): boolean { return !this._owner || this._owner.isDormant() }

  hasKeys(): boolean {
    if (this.isExplicit()) return true
    if (this.isOrderedOnly()) return this._getOperations('ordered').length > 0
    return this._getOperations('added').length > 0 || this._getOperations('prepended').length > 0 ||
      this._getOperations('appended').length > 0 || this._getOperations('deleted').length > 0 ||
      this._getOperations('ordered').length > 0
  }

  abstract isExplicit(): boolean
  abstract isOrderedOnly(): boolean

  permissionToEdit(_op: SdfListOpType): SdfAllowed {
    if (!this._owner || this._owner.isDormant()) return new SdfAllowed('List editor is expired')
    if (!this._owner.permissionToEdit()) return new SdfAllowed('Permission denied')
    return SdfAllowed.allowed()
  }

  abstract copyEdits(rhs: Sdf_ListEditor<T>): boolean
  abstract clearEdits(): boolean
  abstract clearEditsAndMakeExplicit(): boolean
  abstract modifyItemEdits(callback: (item: T) => T | undefined): void
  abstract applyEditsToList(vec: readonly T[], callback?: SdfListOpApplyCallback<T>): T[]

  getSize(op: SdfListOpType): number { return this._getOperations(op).length }

  get(op: SdfListOpType, i: number): T { return this._getOperations(op)[i]! }

  getVector(op: SdfListOpType): T[] { return [...this._getOperations(op)] }

  count(op: SdfListOpType, value: T): number {
    const canonical = this._typePolicy.canonicalize(value)
    return this._getOperations(op).filter(item => this._typePolicy.equals(item, canonical)).length
  }

  // The index of value in the list, or -1.
  find(op: SdfListOpType, value: T): number {
    const canonical = this._typePolicy.canonicalize(value)
    return this._getOperations(op).findIndex(item => this._typePolicy.equals(item, canonical))
  }

  abstract replaceEdits(op: SdfListOpType, index: number, n: number, elems: readonly T[]): boolean
  abstract applyList(op: SdfListOpType, rhs: Sdf_ListEditor<T>): void

  protected _getOwner(): SdfSpec | undefined { return this._owner }
  protected _getField(): string { return this._field }
  protected _getTypePolicy(): SdfListTypePolicy<T> { return this._typePolicy }

  // Sdf_ListEditor::_ValidateEdit (listEditor.h:205-265): no duplicate items,
  // and every new item valid for the field.
  protected _validateEdit(_op: SdfListOpType, oldValues: readonly T[], newValues: readonly T[]): boolean {
    const equals = this._typePolicy.equals
    // Old values are already valid, so skip their common prefix.
    let tail = 0
    while (tail < oldValues.length && tail < newValues.length && equals(oldValues[tail]!, newValues[tail]!)) {
      tail++
    }
    for (let i = tail; i < newValues.length; i++) {
      for (let j = 0; j < i; j++) {
        if (equals(newValues[i]!, newValues[j]!)) {
          codingError(`Duplicate item '${stringify(newValues[i])}' not allowed for field ` +
            `'${this._field}' on <${this.getPath().pathString}>`)
        }
      }
    }
    const fieldDef = this._owner?.getSchema().getFieldDefinition(this._field)
    if (!fieldDef) codingError(`No field definition for field '${this._field}'`)
    for (let i = tail; i < newValues.length; i++) {
      const isValid = fieldDef.isValidListValue(newValues[i])
      if (!isValid.isAllowed()) codingError(isValid.getWhyNot())
    }
    return true
  }

  protected _onEdit(_op: SdfListOpType, _oldValues: readonly T[], _newValues: readonly T[]): void {}

  protected abstract _getOperations(op: SdfListOpType): readonly T[]
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const LIST_OP_TYPES_IN_UPDATE_ORDER: readonly SdfListOpType[] = [
  'explicit', 'added', 'deleted', 'ordered', 'prepended', 'appended',
]

// Sdf_ListOpListEditor (listOpListEditor.h): edits an SdfListOp field. The
// list op is read once, when the editor is made.
export class Sdf_ListOpListEditor<T> extends Sdf_ListEditor<T> {
  private _listOp: SdfListOp<T>

  constructor(owner: SdfSpec | undefined, listField: string, typePolicy: SdfListTypePolicy<T>) {
    super(owner, listField, typePolicy)
    this._listOp = SdfListOp.fromValue(
      owner ? owner.getField(listField) : undefined, item => typePolicy.fromStored(item),
      typePolicy.equals)
  }

  isExplicit(): boolean { return this._listOp.isExplicit() }

  isOrderedOnly(): boolean { return false }

  copyEdits(rhs: Sdf_ListEditor<T>): boolean {
    if (!(rhs instanceof Sdf_ListOpListEditor)) {
      codingError('Could not copy from list editor of different type')
    }
    this._updateListOp((rhs as Sdf_ListOpListEditor<T>)._listOp.clone())
    return true
  }

  clearEdits(): boolean {
    this._updateListOp(new SdfListOp<T>(this._getTypePolicy().equals))
    return true
  }

  clearEditsAndMakeExplicit(): boolean {
    const emptyAndExplicit = new SdfListOp<T>(this._getTypePolicy().equals)
    emptyAndExplicit.clearAndMakeExplicit()
    this._updateListOp(emptyAndExplicit)
    return true
  }

  modifyItemEdits(callback: (item: T) => T | undefined): void {
    const modified = this._listOp.clone()
    const policy = this._getTypePolicy()
    modified.modifyOperations(item => {
      const value = callback(item)
      return value === undefined ? undefined : policy.canonicalize(value)
    })
    this._updateListOp(modified)
  }

  applyEditsToList(vec: readonly T[], callback?: SdfListOpApplyCallback<T>): T[] {
    return this._listOp.applyOperations(vec, callback)
  }

  replaceEdits(op: SdfListOpType, index: number, n: number, elems: readonly T[]): boolean {
    const edited = this._listOp.clone()
    const policy = this._getTypePolicy()
    if (!edited.replaceOperations(op, index, n, elems.map(item => policy.canonicalize(item)))) {
      return false
    }
    this._updateListOp(edited, op)
    return true
  }

  applyList(op: SdfListOpType, rhs: Sdf_ListEditor<T>): void {
    if (!(rhs instanceof Sdf_ListOpListEditor)) {
      codingError('Cannot apply from list editor of different type')
    }
    const composed = this._listOp.clone()
    composed.composeOperations((rhs as Sdf_ListOpListEditor<T>)._listOp, op)
    this._updateListOp(composed, op)
  }

  protected _getOperations(op: SdfListOpType): readonly T[] { return this._listOp.getItems(op) }

  // _UpdateListOp (listOpListEditor.h:105-180).
  private _updateListOp(newListOp: SdfListOp<T>, updatedListOpType?: SdfListOpType): void {
    const owner = this._getOwner()
    if (!owner || owner.isDormant()) codingError('Invalid owner.')
    if (!owner.getLayer().permissionToEdit()) codingError('Layer is not editable.')
    const policy = this._getTypePolicy()
    const differs = (op: SdfListOpType): boolean => {
      const a = newListOp.getItems(op), b = this._listOp.getItems(op)
      return a.length !== b.length || a.some((item, i) => !policy.equals(item, b[i]!))
    }
    const changed = new Map<SdfListOpType, boolean>()
    let anyChanged = false
    for (const op of LIST_OP_TYPES_IN_UPDATE_ORDER) {
      // Only the op type the caller says changed is considered.
      if (updatedListOpType !== undefined && updatedListOpType !== op) continue
      const opChanged = differs(op)
      changed.set(op, opChanged)
      if (opChanged) {
        if (!this._validateEdit(op, this._listOp.getItems(op), newListOp.getItems(op))) return
        anyChanged = true
      }
    }
    if (!anyChanged && newListOp.isExplicit() === this._listOp.isExplicit()) return
    sdfChangeBlock(() => {
      const oldListOp = this._listOp
      this._listOp = newListOp.clone()
      if (newListOp.hasKeys()) owner.setField(this._getField(), newListOp.toValue())
      else owner.clearField(this._getField())
      for (const op of LIST_OP_TYPES_IN_UPDATE_ORDER) {
        if (changed.get(op)) this._onEdit(op, oldListOp.getItems(op), newListOp.getItems(op))
      }
    })
  }
}

// Sdf_ConnectionListEditor (connectionListEditor.cpp): connection and
// relationship target edits also create and remove the corresponding child
// specs.
class Sdf_ConnectionListEditor extends Sdf_ListOpListEditor<string> {
  constructor(
    owner: SdfSpec | undefined, field: string, typePolicy: SdfListTypePolicy<string>,
    private readonly _childPolicy: Sdf_ChildPolicy,
    private readonly _childSpecType: SdfSpecType,
  ) {
    super(owner, field, typePolicy)
  }

  // _OnEditShared (connectionListEditor.cpp:30-110).
  protected override _onEdit(op: SdfListOpType, oldItems: readonly string[], newItems: readonly string[]): void {
    // Ordered and deleted lists do not affect child spec lifetime.
    if (op === 'ordered' || op === 'deleted') return
    const propertyPath = this.getPath()
    const layer = this.getLayer()!
    // Skip the common prefix; both lists are free of duplicates.
    let tail = 0
    while (tail < oldItems.length && tail < newItems.length && oldItems[tail] === newItems[tail]) tail++
    const oldItemSet = new Set(oldItems.slice(tail))
    const newItemSet = new Set(newItems.slice(tail))
    const sorted = (set: Set<string>): string[] =>
      [...set].sort((a, b) => SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b)))
    // Remove the children in oldItems that are not in newItems.
    for (const child of sorted(oldItemSet)) {
      if (newItemSet.has(child)) continue
      if (!Sdf_ChildrenUtils.removeChild(this._childPolicy, layer, propertyPath, child)) {
        // Data backends may generate the child specs; only an existing spec
        // is an error.
        const specPath = this._childPolicy.getChildPath(propertyPath, child)
        if (layer.hasSpec(specPath.pathString)) {
          codingError(`Failed to remove spec at <${specPath.pathString}>`)
        }
      }
    }
    // Add the children in newItems that are not in oldItems.
    for (const child of sorted(newItemSet)) {
      if (oldItemSet.has(child)) continue
      const specPath = this._childPolicy.getChildPath(propertyPath, child)
      if (layer.hasSpec(specPath.pathString)) continue
      Sdf_ChildrenUtils.createSpec(this._childPolicy, layer, specPath, this._childSpecType)
    }
  }
}

export function sdfAttributeConnectionListEditor(
  owner: SdfSpec | undefined, typePolicy: SdfListTypePolicy<string>,
): Sdf_ListEditor<string> {
  return new Sdf_ConnectionListEditor(owner, 'connectionPaths', typePolicy,
    Sdf_AttributeConnectionChildPolicy, 'connection')
}

export function sdfRelationshipTargetListEditor(
  owner: SdfSpec | undefined, typePolicy: SdfListTypePolicy<string>,
): Sdf_ListEditor<string> {
  return new Sdf_ConnectionListEditor(owner, 'targetPaths', typePolicy,
    Sdf_RelationshipTargetChildPolicy, 'relationshipTarget')
}

// Sdf_VectorListEditor (vectorListEditor.h): edits a plain vector field as
// a list of a single, fixed operation type.
export class Sdf_VectorListEditor<T> extends Sdf_ListEditor<T> {
  private _data: T[]

  constructor(
    owner: SdfSpec | undefined, field: string, private readonly _op: SdfListOpType,
    typePolicy: SdfListTypePolicy<T>,
  ) {
    super(owner, field, typePolicy)
    const stored = owner ? owner.getField(field) : undefined
    this._data = Array.isArray(stored) ? stored.map(item => typePolicy.fromStored(item)) : []
  }

  isExplicit(): boolean { return this._op === 'explicit' }

  isOrderedOnly(): boolean { return this._op === 'ordered' }

  copyEdits(rhs: Sdf_ListEditor<T>): boolean {
    if (!(rhs instanceof Sdf_VectorListEditor)) codingError('Cannot copy from list editor of different type')
    const other = rhs as Sdf_VectorListEditor<T>
    if (this._op !== other._op) codingError('Cannot copy from list editor in different mode')
    this._updateFieldData(other._data)
    return true
  }

  // This editor never switches modes.
  clearEdits(): boolean {
    if (this._op === 'explicit') return false
    this._updateFieldData([])
    return true
  }

  clearEditsAndMakeExplicit(): boolean {
    if (this._op !== 'explicit') return false
    this._updateFieldData([])
    return true
  }

  modifyItemEdits(callback: (item: T) => T | undefined): void {
    if (this._data.length === 0) return
    const listOp = this._listOp(this._data)
    const policy = this._getTypePolicy()
    listOp.modifyOperations(item => {
      const value = callback(item)
      return value === undefined ? undefined : policy.canonicalize(value)
    })
    this._updateFieldData(listOp.getItems(this._op))
  }

  applyEditsToList(vec: readonly T[], callback?: SdfListOpApplyCallback<T>): T[] {
    if (this._data.length === 0) return [...vec]
    return this._listOp(this._data).applyOperations(vec, callback)
  }

  replaceEdits(op: SdfListOpType, index: number, n: number, elems: readonly T[]): boolean {
    if (op !== this._op) return false
    const listOp = this._listOp(this._data)
    const policy = this._getTypePolicy()
    if (!listOp.replaceOperations(op, index, n, elems.map(item => policy.canonicalize(item)))) return false
    this._updateFieldData(listOp.getItems(op))
    return true
  }

  applyList(op: SdfListOpType, rhs: Sdf_ListEditor<T>): void {
    if (!(rhs instanceof Sdf_VectorListEditor)) codingError('Cannot apply from list editor of different type')
    const other = rhs as Sdf_VectorListEditor<T>
    if (op !== this._op && op !== other._op) return
    const self = this._listOp(this._data, op)
    self.composeOperations(this._listOp(other._data, op), op)
    this._updateFieldData(self.getItems(op))
  }

  protected _getOperations(op: SdfListOpType): readonly T[] {
    return op === this._op ? this._data : []
  }

  private _listOp(items: readonly T[], op: SdfListOpType = this._op): SdfListOp<T> {
    const listOp = new SdfListOp<T>(this._getTypePolicy().equals)
    listOp.setItems(items, op)
    return listOp
  }

  // _UpdateFieldData (vectorListEditor.h:101-135).
  private _updateFieldData(newData: readonly T[]): void {
    const owner = this._getOwner()
    if (!owner || owner.isDormant()) codingError('Invalid owner.')
    if (!owner.getLayer().permissionToEdit()) codingError('Layer is not editable.')
    const policy = this._getTypePolicy()
    const same = newData.length === this._data.length &&
      newData.every((item, i) => policy.equals(item, this._data[i]!))
    if (same || !this._validateEdit(this._op, this._data, newData)) return
    sdfChangeBlock(() => {
      const oldData = this._data
      this._data = [...newData]
      if (newData.length === 0) owner.clearField(this._getField())
      else owner.setField(this._getField(), [...newData])
      this._onEdit(this._op, oldData, newData)
    })
  }
}
