// Ported from OpenUSD 26.11.1: pxr/usd/sdf/listProxy.cpp,
//  pxr/usd/sdf/listProxy.h, pxr/usd/sdf/listEditorProxy.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/listProxy.h and listEditorProxy.h: live views of one
// operation list of a list editor, and of the whole list editor.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { sdfChangeBlock } from './changeManager.ts'
import type { Sdf_ListEditor } from './listEditor.ts'
import type { SdfListOpApplyCallback, SdfListOpType } from './listOp.ts'
import type { Layer } from './layer.ts'
import { SdfPath } from './path.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

// SdfListProxy<TypePolicy>: one operation list of a list editor.
export class SdfListProxy<T> implements Iterable<T> {
  constructor(private readonly _listEditor: Sdf_ListEditor<T> | undefined, private readonly _op: SdfListOpType) {}

  size(): number { return this._validate() ? this._listEditor!.getSize(this._op) : 0 }

  empty(): boolean { return this.size() === 0 }

  get(index: number): T {
    const size = this._getSize()
    if (index < 0 || index >= size) codingError(`Index ${index} out of range`)
    return this._listEditor!.get(this._op, index)
  }

  set(index: number, value: T): void { this._edit(index, 1, [value]) }

  front(): T { return this.get(0) }
  back(): T { return this.get(this._getSize() - 1) }

  /** std::vector push_back / Python append. */
  push(value: T): void { this._edit(this._getSize(), 0, [value]) }
  append(value: T): void { this.push(value) }

  popBack(): void { this._edit(this._getSize() - 1, 1, []) }

  clear(): void { this._edit(0, this._getSize(), []) }

  /** Replaces the whole list (the proxy's operator=). */
  assign(values: Iterable<T>): void { this._edit(0, this._getSize(), [...values]) }

  toArray(): T[] { return this._listEditor ? this._listEditor.getVector(this._op) : [] }

  [Symbol.iterator](): Iterator<T> { return this.toArray()[Symbol.iterator]() }

  equals(other: Iterable<T>): boolean {
    const a = this.toArray(), b = [...other]
    return a.length === b.length && a.every((item, i) => sameItem(item, b[i]))
  }

  /** Whether the proxy is valid and relevant to its editor's mode. */
  isValid(): boolean {
    return !!this._listEditor && this._listEditor.isValid() && this._isRelevant()
  }

  getLayer(): Layer | undefined { return this._listEditor?.getLayer() }
  getPath(): SdfPath { return this._listEditor?.getPath() ?? SdfPath.emptyPath }

  isExpired(): boolean { return !!this._listEditor && this._listEditor.isExpired() }

  count(value: T): number { return this._validate() ? this._listEditor!.count(this._op, value) : 0 }

  /** The index of value, or -1. */
  find(value: T): number { return this._validate() ? this._listEditor!.find(this._op, value) : -1 }

  /** Python index(): the index of value, raising when it is absent. */
  index(value: T): number {
    const index = this.find(value)
    if (index < 0) throw new TfError(`${String(value)} is not in list`)
    return index
  }

  insert(index: number, value: T): void {
    if (index === -1) index = this._getSize()
    this._edit(index, 0, [value])
  }

  remove(value: T): void {
    const index = this.find(value)
    // Let the policy raise an error even when nothing changes.
    if (index >= 0) this.erase(index)
    else this._edit(this._getSize(), 0, [])
  }

  replace(oldValue: T, newValue: T): void {
    const index = this.find(oldValue)
    if (index >= 0) this._edit(index, 1, [newValue])
    else this._edit(this._getSize(), 0, [])
  }

  erase(index: number): void { this._edit(index, 1, []) }

  applyList(list: SdfListProxy<T>): void {
    if (this._validate() && list._validate()) this._listEditor!.applyList(this._op, list._listEditor!)
  }

  applyEditsToList(vec: readonly T[]): T[] {
    return this._validate() ? this._listEditor!.applyEditsToList(vec) : [...vec]
  }

  modifyItemEdits(callback: (item: T) => T | undefined): void {
    if (this._validate()) this._listEditor!.modifyItemEdits(callback)
  }

  private _validate(): boolean {
    if (!this._listEditor) return false
    if (this.isExpired()) codingError('Accessing expired list editor')
    return true
  }

  private _isRelevant(): boolean {
    if (this._listEditor!.isExplicit()) return this._op === 'explicit'
    if (this._listEditor!.isOrderedOnly()) return this._op === 'ordered'
    return this._op !== 'explicit'
  }

  private _getSize(): number { return this._listEditor ? this._listEditor.getSize(this._op) : 0 }

  // _Edit (listProxy.h:509-530).
  private _edit(index: number, n: number, elems: readonly T[]): void {
    if (!this._validate()) return
    // Let the policy raise an error even when nothing changes.
    if (n === 0 && elems.length === 0) {
      const canEdit = this._listEditor!.permissionToEdit(this._op)
      if (!canEdit.isAllowed()) codingError(`Editing list: ${canEdit.getWhyNot()}`)
      return
    }
    if (!this._listEditor!.replaceEdits(this._op, index, n, elems)) {
      codingError('Inserting invalid value into list editor')
    }
  }
}

function sameItem(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  const equals = (a as { equals?: (other: unknown) => boolean } | null)?.equals
  if (typeof equals === 'function') return equals.call(a, b)
  if (a instanceof SdfPath || b instanceof SdfPath) return String(a) === String(b)
  return JSON.stringify(a) === JSON.stringify(b)
}

// SdfListEditorProxy<TypePolicy>.
export class SdfListEditorProxy<T> {
  constructor(private readonly _listEditor?: Sdf_ListEditor<T>) {}

  isExpired(): boolean { return !!this._listEditor && this._listEditor.isExpired() }

  isExplicit(): boolean { return this._validate() ? this._listEditor!.isExplicit() : true }

  isOrderedOnly(): boolean { return this._validate() ? this._listEditor!.isOrderedOnly() : false }

  hasKeys(): boolean { return this._validate() ? this._listEditor!.hasKeys() : true }

  applyEditsToList(vec: readonly T[], callback?: SdfListOpApplyCallback<T>): T[] {
    return this._validate() ? this._listEditor!.applyEditsToList(vec, callback) : [...vec]
  }

  copyItems(other: SdfListEditorProxy<T>): boolean {
    return this._validate() && other._validate() ? this._listEditor!.copyEdits(other._listEditor!) : false
  }

  clearEdits(): boolean { return this._validate() ? this._listEditor!.clearEdits() : false }

  clearEditsAndMakeExplicit(): boolean {
    return this._validate() ? this._listEditor!.clearEditsAndMakeExplicit() : false
  }

  modifyItemEdits(callback: (item: T) => T | undefined): void {
    if (this._validate()) this._listEditor!.modifyItemEdits(callback)
  }

  containsItemEdit(item: T, onlyAddOrExplicit = false): boolean {
    if (!this._validate()) return false
    if (this.getExplicitItems().find(item) >= 0 || this.getAddedItems().find(item) >= 0 ||
        this.getPrependedItems().find(item) >= 0 || this.getAppendedItems().find(item) >= 0) {
      return true
    }
    return !onlyAddOrExplicit &&
      (this.getDeletedItems().find(item) >= 0 || this.getOrderedItems().find(item) >= 0)
  }

  removeItemEdits(item: T): void {
    if (!this._validate()) return
    sdfChangeBlock(() => {
      for (const list of this._allLists()) list.remove(item)
    })
  }

  replaceItemEdits(oldItem: T, newItem: T): void {
    if (!this._validate()) return
    sdfChangeBlock(() => {
      for (const list of this._allLists()) list.replace(oldItem, newItem)
    })
  }

  getExplicitItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'explicit') }
  getAddedItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'added') }
  getPrependedItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'prepended') }
  getAppendedItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'appended') }
  getDeletedItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'deleted') }
  getOrderedItems(): SdfListProxy<T> { return new SdfListProxy(this._listEditor, 'ordered') }

  /** Deprecated; GetAppliedItems. */
  getAddedOrExplicitItems(): T[] { return this.getAppliedItems() }

  getAppliedItems(): T[] { return this._validate() ? this._listEditor!.applyEditsToList([]) : [] }

  add(value: T): void {
    if (!this._validate() || this._listEditor!.isOrderedOnly()) return
    if (this._listEditor!.isExplicit()) {
      this._addOrReplace('explicit', value)
    } else {
      this.getDeletedItems().remove(value)
      this._addOrReplace('added', value)
    }
  }

  prepend(value: T): void {
    if (!this._validate() || this._listEditor!.isOrderedOnly()) return
    if (this._listEditor!.isExplicit()) {
      this._prepend('explicit', value)
    } else {
      this.getDeletedItems().remove(value)
      this._prepend('prepended', value)
    }
  }

  append(value: T): void {
    if (!this._validate() || this._listEditor!.isOrderedOnly()) return
    if (this._listEditor!.isExplicit()) {
      this._append('explicit', value)
    } else {
      this.getDeletedItems().remove(value)
      this._append('appended', value)
    }
  }

  remove(value: T): void {
    if (!this._validate()) return
    if (this._listEditor!.isExplicit()) {
      this.getExplicitItems().remove(value)
    } else if (!this._listEditor!.isOrderedOnly()) {
      this.getAddedItems().remove(value)
      this.getPrependedItems().remove(value)
      this.getAppendedItems().remove(value)
      this._addIfMissing('deleted', value)
    }
  }

  erase(value: T): void {
    if (!this._validate() || this._listEditor!.isOrderedOnly()) return
    if (this._listEditor!.isExplicit()) {
      this.getExplicitItems().remove(value)
    } else {
      this.getAddedItems().remove(value)
      this.getPrependedItems().remove(value)
      this.getAppendedItems().remove(value)
    }
  }

  /** The proxy's bool conversion: whether its list editor is valid. */
  isValid(): boolean { return !!this._listEditor && this._listEditor.isValid() }

  private _allLists(): SdfListProxy<T>[] {
    return [this.getExplicitItems(), this.getAddedItems(), this.getPrependedItems(),
      this.getAppendedItems(), this.getDeletedItems(), this.getOrderedItems()]
  }

  private _validate(): boolean {
    if (!this._listEditor) return false
    if (this.isExpired()) codingError('Accessing expired list editor')
    return true
  }

  private _addIfMissing(op: SdfListOpType, value: T): void {
    const proxy = new SdfListProxy(this._listEditor, op)
    if (proxy.find(value) < 0) proxy.push(value)
  }

  private _addOrReplace(op: SdfListOpType, value: T): void {
    const proxy = new SdfListProxy(this._listEditor, op)
    const index = proxy.find(value)
    if (index < 0) proxy.push(value)
    else if (!sameItem(value, proxy.get(index))) proxy.set(index, value)
  }

  private _prepend(op: SdfListOpType, value: T): void {
    const proxy = new SdfListProxy(this._listEditor, op)
    const index = proxy.find(value)
    if (index !== 0) {
      if (index >= 0) proxy.erase(index)
      proxy.insert(0, value)
    }
  }

  private _append(op: SdfListOpType, value: T): void {
    const proxy = new SdfListProxy(this._listEditor, op)
    const index = proxy.find(value)
    if (proxy.empty() || index !== proxy.size() - 1) {
      if (index >= 0) proxy.erase(index)
      proxy.push(value)
    }
  }
}
