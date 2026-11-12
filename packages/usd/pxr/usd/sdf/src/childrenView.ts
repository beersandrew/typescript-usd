// Ported from OpenUSD 26.11.1: pxr/usd/sdf/childrenView.cpp,
//  pxr/usd/sdf/childrenView.h, pxr/usd/sdf/children.cpp,
//  pxr/usd/sdf/children.h, pxr/usd/sdf/childrenProxy.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/childrenView.h, childrenProxy.h and children.{h,cpp}:
// an ordered map view of a spec's children, keyed by child name (or target
// path), and the proxy that edits the children through Sdf_ChildrenUtils.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { sdfChangeBlock } from './changeManager.ts'
import type { Sdf_ChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import type { Layer } from './layer.ts'
import type { SdfPath } from './path.ts'
import type { SdfSpec } from './spec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

// SdfChildrenView<ChildPolicy, Predicate>: the children of the spec at
// parentPath, optionally filtered by a predicate.
export class SdfChildrenView<V extends SdfSpec = SdfSpec> implements Iterable<V> {
  constructor(
    private readonly _layer: Layer | undefined,
    private readonly _parentPath: SdfPath,
    /** @internal */ readonly _policy: Sdf_ChildPolicy,
    private readonly _predicate: (spec: SdfSpec) => spec is V = (_spec): _spec is V => true,
  ) {}

  /** @internal */ _getLayer(): Layer | undefined { return this._layer }
  /** @internal */ _getParentPath(): SdfPath { return this._parentPath }

  isValid(): boolean { return !!this._layer && !this._parentPath.isEmpty() }

  // The (name, spec) entries that pass the predicate, in order.
  private _entries(): [string, V][] {
    if (!this.isValid()) return []
    const names = this._layer!.getField(this._parentPath.pathString, this._policy.childrenKey)
    const entries: [string, V][] = []
    for (const name of Array.isArray(names) ? names.map(String) : []) {
      const spec = this._layer!.getObjectAtPath(this._policy.getChildPath(this._parentPath, name))
      if (spec && this._predicate(spec)) entries.push([name, spec])
    }
    return entries
  }

  size(): number { return this._entries().length }
  empty(): boolean { return this.size() === 0 }

  at(index: number): V {
    const entries = this._entries()
    if (index < 0 || index >= entries.length) codingError(`Index ${index} out of range`)
    return entries[index]![1]
  }

  front(): V { return this.at(0) }
  back(): V { return this.at(this.size() - 1) }

  get(key: string | SdfPath): V | undefined {
    const k = this._key(key)
    return this._entries().find(([name]) => name === k)?.[1]
  }

  has(key: string | SdfPath): boolean { return this.get(key) !== undefined }

  /** The index of the child with key, or -1. */
  find(key: string | SdfPath): number {
    const k = this._key(key)
    return this._entries().findIndex(([name]) => name === k)
  }

  /** The key of a child of this view, or undefined (SdfChildrenView::key). */
  key(value: SdfSpec): string | undefined {
    if (value.getLayer() !== this._layer) return undefined
    if (!this._policy.getParentPath(value.getPath()).equals(this._parentPath)) return undefined
    return this._policy.getFieldValue(value.getPath())
  }

  keys(): string[] { return this._entries().map(([name]) => name) }
  values(): V[] { return this._entries().map(([, spec]) => spec) }
  items(): [string, V][] { return this._entries() }

  [Symbol.iterator](): Iterator<V> { return this.values()[Symbol.iterator]() }

  /** @internal The key canonicalized for this view's children field. */
  _key(key: string | SdfPath): string {
    if (typeof key !== 'string') {
      return this._policy.keyIsPath ? key.makeAbsolutePath(this._parentPath.getPrimPath()).pathString
        : key.pathString
    }
    return key
  }
}

// SdfChildrenProxy permission bits.
export const SdfChildrenProxyPermission = {
  CanSet: 1,
  CanInsert: 2,
  CanErase: 4,
} as const

// SdfChildrenProxy<View>: a view whose children may be set, inserted and
// erased (as permitted), through Sdf_ChildrenUtils.
export class SdfChildrenProxy<V extends SdfSpec = SdfSpec> extends SdfChildrenView<V> {
  constructor(
    layer: Layer | undefined, parentPath: SdfPath, policy: Sdf_ChildPolicy,
    private readonly _type: string,
    private readonly _permission = SdfChildrenProxyPermission.CanSet | SdfChildrenProxyPermission.CanInsert |
      SdfChildrenProxyPermission.CanErase,
    predicate?: (spec: SdfSpec) => spec is V,
  ) {
    super(layer, parentPath, policy, predicate)
  }

  /** Inserts value at index (at the end by default); returns whether it did. */
  insert(value: V, index = -1): boolean {
    if (!this._validatePermission(SdfChildrenProxyPermission.CanInsert)) return false
    if (this.has(this.key(value) ?? '\0')) return false
    return Sdf_ChildrenUtils.insertChild(
      this._policy, this._getLayer()!, this._getParentPath(), value, index === -1 ? this.size() : index)
  }

  /** Python append: inserts value at the end. */
  append(value: V): boolean { return this.insert(value) }

  /** Erases the child with key; returns whether it did. */
  erase(key: string | SdfPath): boolean {
    if (!this._validatePermission(SdfChildrenProxyPermission.CanErase)) return false
    return Sdf_ChildrenUtils.removeChild(this._policy, this._getLayer()!, this._getParentPath(), this._key(key))
  }

  /** Replaces the children with values (the proxy's operator=). */
  assign(values: readonly V[]): boolean {
    if (!this._validatePermission(SdfChildrenProxyPermission.CanSet)) return false
    return Sdf_ChildrenUtils.setChildren(this._policy, this._getLayer()!, this._getParentPath(), values)
  }

  clear(): void { this.assign([]) }

  /** Inserts each value at the end, in one change block. */
  insertAll(values: readonly V[]): void {
    if (!this._validatePermission(SdfChildrenProxyPermission.CanInsert)) return
    sdfChangeBlock(() => {
      for (const value of values) {
        Sdf_ChildrenUtils.insertChild(this._policy, this._getLayer()!, this._getParentPath(), value, this.size())
      }
    })
  }

  private _validatePermission(permission: number): boolean {
    if (!this.isValid()) codingError(`Accessing expired ${this._type}`)
    if ((this._permission & permission) === permission) return true
    const op = permission & SdfChildrenProxyPermission.CanSet ? 'replace'
      : permission & SdfChildrenProxyPermission.CanInsert ? 'insert' : 'remove'
    codingError(`Cannot ${op} ${this._type}`)
  }
}
