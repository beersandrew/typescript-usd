// Ported from OpenUSD 26.11.1: pxr/usd/sdf/listOp.cpp, pxr/usd/sdf/listOp.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfListOp — the generic list-editing value type (explicit replace, or
// prepend/append/delete composable operations) and its ApplyOperations
// combine algebra. Faithful port of sdf/listOp.{h,cpp}'s SdfListOp<T> +
// _ApplyListOp/ApplyOperations semantics: OpenUSD 26.11.1
// pxr/usd/sdf/listOp.cpp:413-465 (applying to an item vector), :469-547
// (composing two list ops) and :584-726 (the per-field _AddKeys,
// _PrependKeys, _AppendKeys, _DeleteKeys and _ReorderKeys steps).
//
// Combining is STRONGER.applyOperations(weaker): the result of composing
// `stronger` OVER `weaker` (stronger wins). An explicit stronger list
// replaces weaker entirely; deleted/prepended/appended items compose
// per-field, weak-to-strong, deduping so no item appears twice.

import { Debug as TfDebug, Error as TfError, TfDiagnosticMgr, TfDiagnosticType, Type as TfType } from 'typescript-usd/tf'
import { RegisterComposeOver as VtRegisterComposeOver, Value as VtValue } from 'typescript-usd/vt'

export interface SdfListOpValue<T> {
  readonly isExplicit?: boolean
  readonly explicitItems?: readonly T[]
  // The deprecated "added" items (SdfListOpTypeAdded): applied after the
  // deleted items, each appended only if not already present.
  readonly addedItems?: readonly T[]
  readonly deletedItems?: readonly T[]
  readonly prependedItems?: readonly T[]
  readonly appendedItems?: readonly T[]
  readonly orderedItems?: readonly T[]
}

export interface SdfListOpEquality<T> {
  equals?: (left: T, right: T) => boolean
  key?: (item: T) => unknown
}

export type SdfNormalizedListOp<T> = Required<SdfListOpValue<T>>

function equalityFor<T>(options: SdfListOpEquality<T> = {}): (left: T, right: T) => boolean {
  if (options.equals) return options.equals
  if (options.key) return (left, right) => Object.is(options.key!(left), options.key!(right))
  return Object.is
}

function contains<T>(items: readonly T[], item: T, equals: (left: T, right: T) => boolean): boolean {
  return items.some(existing => equals(existing, item))
}

function uniqueBy<T>(items: readonly T[], equals: (left: T, right: T) => boolean): T[] {
  const result: T[] = []
  for (const item of items) if (!contains(result, item, equals)) result.push(item)
  return result
}

function isRawListOp(value: object): boolean {
  return 'isExplicit' in value || 'explicitItems' in value || 'deletedItems' in value
    || 'prependedItems' in value || 'appendedItems' in value || 'orderedItems' in value
    || 'addedItems' in value
}

/** Normalize parser/runtime field shapes into one canonical Sdf list-op. */
export function sdfNormalizeListOp<T>(raw: unknown): SdfNormalizedListOp<T> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return { isExplicit: true, explicitItems: [...raw] as T[], addedItems: [], deletedItems: [], prependedItems: [], appendedItems: [], orderedItems: [] }
  if (typeof raw !== 'object') return { isExplicit: true, explicitItems: [raw as T], addedItems: [], deletedItems: [], prependedItems: [], appendedItems: [], orderedItems: [] }
  if (!isRawListOp(raw)) return null
  const op = raw as SdfListOpValue<T>
  return {
    isExplicit: op.isExplicit ?? op.explicitItems !== undefined,
    explicitItems: [...(op.explicitItems ?? [])], addedItems: [...(op.addedItems ?? [])],
    deletedItems: [...(op.deletedItems ?? [])],
    prependedItems: [...(op.prependedItems ?? [])], appendedItems: [...(op.appendedItems ?? [])],
    orderedItems: [...(op.orderedItems ?? [])],
  }
}

/** SdfApplyListOrdering / _ReorderKeysHelper with caller-defined equality. */
export function sdfApplyListOrdering<T>(items: readonly T[], order: readonly T[], options: SdfListOpEquality<T> = {}): T[] {
  const equals = equalityFor(options)
  const uniqueOrder = uniqueBy(order, equals)
  if (uniqueOrder.length === 0 || items.length === 0) return [...items]
  const scratch = [...items]
  const result: T[] = []
  for (const ordered of uniqueOrder) {
    const start = scratch.findIndex(item => equals(item, ordered))
    if (start < 0) continue
    let end = start + 1
    while (end < scratch.length && !uniqueOrder.some(item => equals(item, scratch[end]!))) end++
    result.push(...scratch.splice(start, end - start))
  }
  return [...scratch, ...result]
}

// SdfListOpType (listOp.h).
export type SdfListOpType = 'explicit' | 'added' | 'deleted' | 'prepended' | 'appended' | 'ordered'

// SdfListOp::ApplyCallback: maps an item as it is applied; undefined drops it.
export type SdfListOpApplyCallback<T> = (opType: SdfListOpType, item: T) => T | undefined

/**
 * Apply one list operation to a concrete item vector (SdfListOp::
 * ApplyOperations, listOp.cpp:413-463), optionally mapping each item
 * through `callback` in upstream's order: deleted, added, prepended (in
 * reverse), appended, then ordered.
 */
export function sdfApplyListOpToVector<T>(
  base: readonly T[],
  operation: SdfListOpValue<T>,
  options: SdfListOpEquality<T> = {},
  callback?: SdfListOpApplyCallback<T>,
): T[] {
  const equals = equalityFor(options)
  const op = sdfNormalizeListOp<T>(operation)!
  const map = (type: SdfListOpType, item: T): T | undefined =>
    callback ? callback(type, item) : item
  const indexOf = (result: readonly T[], item: T): number =>
    result.findIndex(existing => equals(existing, item))
  // _AddKeys: append only if the item isn't already present.
  if (op.isExplicit) {
    const result: T[] = []
    for (const item of op.explicitItems) {
      const mapped = map('explicit', item)
      if (mapped !== undefined && indexOf(result, mapped) < 0) result.push(mapped)
    }
    return result
  }
  if (!callback && op.deletedItems.length + op.addedItems.length + op.prependedItems.length
      + op.appendedItems.length + op.orderedItems.length === 0) return [...base]
  // The input is deduplicated by the search map.
  let result = uniqueBy(base, equals)
  // _DeleteKeys
  for (const item of op.deletedItems) {
    const mapped = map('deleted', item)
    if (mapped === undefined) continue
    const at = indexOf(result, mapped)
    if (at >= 0) result.splice(at, 1)
  }
  // _AddKeys(SdfListOpTypeAdded): append only if the item isn't present.
  for (const item of op.addedItems) {
    const mapped = map('added', item)
    if (mapped !== undefined && indexOf(result, mapped) < 0) result.push(mapped)
  }
  // _PrependKeys: _InsertOrMove each item to the front, last to first.
  for (let i = op.prependedItems.length - 1; i >= 0; i--) {
    const mapped = map('prepended', op.prependedItems[i]!)
    if (mapped === undefined) continue
    const at = indexOf(result, mapped)
    if (at >= 0) result.splice(at, 1)
    result.unshift(mapped)
  }
  // _AppendKeys: _InsertOrMove each item to the back.
  for (const item of op.appendedItems) {
    const mapped = map('appended', item)
    if (mapped === undefined) continue
    const at = indexOf(result, mapped)
    if (at >= 0) result.splice(at, 1)
    result.push(mapped)
  }
  // _ReorderKeys
  const order: T[] = []
  for (const item of op.orderedItems) {
    const mapped = map('ordered', item)
    if (mapped !== undefined) order.push(mapped)
  }
  result = sdfApplyListOrdering(result, order, options)
  return result
}

/** Evaluate a strongest-first list-op chain over an initially empty vector. */
export function sdfComposeListOpsStrongToWeak<T>(operations: readonly SdfListOpValue<T>[], options: SdfListOpEquality<T> = {}): T[] {
  let result: T[] = []
  for (let index = operations.length - 1; index >= 0; index--) result = sdfApplyListOpToVector(result, operations[index]!, options)
  return result
}

export interface SdfListOpResult<T> {
  readonly isExplicit: boolean
  readonly explicitItems: readonly T[]
  readonly deletedItems: readonly T[]
  readonly prependedItems: readonly T[]
  readonly appendedItems: readonly T[]
}

// Anything sdfApplyListOpOperations can take as an operand — a raw authored
// value, or the already-folded result of a previous ApplyOperations call.
type ListOpOperand<T> = SdfListOpValue<T> | SdfListOpResult<T>

// Accepts either a raw SdfListOpValue (explicitItems undefined means "field
// not authored") or a previously-folded SdfListOpResult (whose `isExplicit`
// flag is authoritative — its arrays are always defined, so checking
// `explicitItems !== undefined` would misfire on a composable result).
function isExplicit<T>(v: ListOpOperand<T>): boolean {
  // `=== true` keeps the result boolean when a consumer compiles without
  // exactOptionalPropertyTypes (a raw value's `isExplicit` is optional).
  return 'isExplicit' in v ? v.isExplicit === true : v.explicitItems !== undefined
}

// Is this list op inert — would applying it produce no side effect, so it may
// be dropped from a chain as if it had been applied (SdfListOp::operator bool)?
function isInert<T>(v: ListOpOperand<T>): boolean {
  return !isExplicit(v) && !(v.deletedItems?.length) && !(v.prependedItems?.length) && !(v.appendedItems?.length)
}

function explicitResult<T>(items: readonly T[], equals: (left: T, right: T) => boolean): SdfListOpResult<T> {
  return { isExplicit: true, explicitItems: uniqueBy(items, equals), deletedItems: [], prependedItems: [], appendedItems: [] }
}

function composableResult<T>(
  deleted: readonly T[], prepended: readonly T[], appended: readonly T[],
): SdfListOpResult<T> {
  return { isExplicit: false, explicitItems: [], deletedItems: deleted, prependedItems: prepended, appendedItems: appended }
}

// _ComposeOverExplicit (listOp.py's _compose_over_explicit): `stronger`'s
// composable operations applied to a weaker EXPLICIT list — always produces
// a new explicit list. Prepend items (not already appended by stronger) go
// first, then weaker's explicit items not deleted/prepended/appended by
// stronger, then stronger's appended items.
function composeOverExplicit<T>(stronger: ListOpOperand<T>, weakerExplicit: readonly T[], equals: (left: T, right: T) => boolean): SdfListOpResult<T> {
  const pre = stronger.prependedItems ?? []
  const app = stronger.appendedItems ?? []
  const items = [
    ...pre.filter((e) => !contains(app, e, equals)),
    ...weakerExplicit.filter((e) => !contains(stronger.deletedItems ?? [], e, equals) && !contains(pre, e, equals) && !contains(app, e, equals)),
    ...app,
  ]
  return explicitResult(items, equals)
}

// _ComposeDeletedItems / _ComposePrependedItems / _ComposeAppendedItems:
// fold two composable list ops' same-named field, weak-to-strong, so a
// stronger prepend/append "moves" an item out of the weaker's corresponding
// field rather than duplicating it.
function composeDeletedItems<T>(stronger: ListOpOperand<T>, weaker: ListOpOperand<T>, equals: (left: T, right: T) => boolean): T[] {
  const sPre = stronger.prependedItems ?? []
  const sApp = stronger.appendedItems ?? []
  const wDel = weaker.deletedItems ?? []
  const fromWeaker = wDel.filter((e) => !contains(sPre, e, equals) && !contains(sApp, e, equals))
  const fromStronger = (stronger.deletedItems ?? []).filter((e) => !contains(wDel, e, equals) && !contains(sPre, e, equals) && !contains(sApp, e, equals))
  return uniqueBy([...fromWeaker, ...fromStronger], equals)
}

function composePrependedItems<T>(stronger: ListOpOperand<T>, weaker: ListOpOperand<T>, equals: (left: T, right: T) => boolean): T[] {
  const sDel = stronger.deletedItems ?? []
  const sPre = stronger.prependedItems ?? []
  const sApp = stronger.appendedItems ?? []
  const fromWeaker = (weaker.prependedItems ?? []).filter((e) => !contains(sDel, e, equals) && !contains(sPre, e, equals) && !contains(sApp, e, equals))
  const fromStronger = sPre.filter((e) => !contains(sApp, e, equals))
  return uniqueBy([...fromStronger, ...fromWeaker], equals)
}

function composeAppendedItems<T>(stronger: ListOpOperand<T>, weaker: ListOpOperand<T>, equals: (left: T, right: T) => boolean): T[] {
  const sDel = stronger.deletedItems ?? []
  const sPre = stronger.prependedItems ?? []
  const sApp = stronger.appendedItems ?? []
  const fromWeaker = (weaker.appendedItems ?? []).filter((e) => !contains(sDel, e, equals) && !contains(sPre, e, equals) && !contains(sApp, e, equals))
  return uniqueBy([...fromWeaker, ...sApp], equals)
}

/**
 * SdfListOp::ApplyOperations — combine `stronger` OVER `weaker` into a single
 * list op (stronger wins). Faithful to listOp.py's ListOp.combined_with:
 * both-inert / stronger-inert / stronger-explicit / weaker-inert shortcuts,
 * then compose-over-explicit or compose-over-composable.
 */
export function sdfApplyListOpOperations<T>(
  stronger: ListOpOperand<T>, weaker: ListOpOperand<T>,
  options: SdfListOpEquality<T> = {},
): SdfListOpResult<T> {
  const equals = equalityFor(options)
  if (isInert(stronger) && isInert(weaker)) return composableResult([], [], [])
  if (isInert(stronger)) {
    return isExplicit(weaker)
      ? explicitResult(weaker.explicitItems ?? [], equals)
      : composableResult(weaker.deletedItems ?? [], weaker.prependedItems ?? [], weaker.appendedItems ?? [])
  }
  if (isExplicit(stronger)) return explicitResult(stronger.explicitItems ?? [], equals)
  if (isInert(weaker)) {
    return composableResult(stronger.deletedItems ?? [], stronger.prependedItems ?? [], stronger.appendedItems ?? [])
  }
  if (isExplicit(weaker)) return composeOverExplicit(stronger, weaker.explicitItems ?? [], equals)
  return composableResult(
    composeDeletedItems(stronger, weaker, equals),
    composePrependedItems(stronger, weaker, equals),
    composeAppendedItems(stronger, weaker, equals),
  )
}

/**
 * SdfListOp::Reduced-equivalent (listOp.py's ListOp.reduced): normalize a
 * SINGLE list op so that a prepended item also being appended is dropped
 * from prepended (appended wins), and a deleted item also being prepended
 * or appended is dropped from deleted. A no-op for an explicit list op
 * (dedup already applied at construction).
 */
export function sdfReducedListOp<T>(v: SdfListOpValue<T>, options: SdfListOpEquality<T> = {}): SdfListOpResult<T> {
  const equals = equalityFor(options)
  if (isExplicit(v)) return explicitResult(v.explicitItems ?? [], equals)
  const app = uniqueBy(v.appendedItems ?? [], equals)
  const pre = uniqueBy((v.prependedItems ?? []).filter((e) => !contains(app, e, equals)), equals)
  const del = uniqueBy((v.deletedItems ?? []).filter((e) => !contains(pre, e, equals) && !contains(app, e, equals)), equals)
  return composableResult(del, pre, app)
}

/**
 * Reduce a STRONGEST-FIRST chain of list ops to one: self-reduce the
 * strongest (seed) entry, then fold every weaker entry in via
 * ApplyOperations. Mirrors harness.TestReduceChain's `chain` (strongest
 * first) + the Python reference's `functools.reduce(apply, chain)`.
 */
export function sdfReduceListOpChain<T>(chain: readonly SdfListOpValue<T>[], options: SdfListOpEquality<T> = {}): SdfListOpResult<T> {
  if (chain.length === 0) return composableResult([], [], [])
  return chain.slice(1).reduce<SdfListOpResult<T>>(
    (acc, next) => sdfApplyListOpOperations(acc, next, options),
    sdfReducedListOp(chain[0]!, options),
  )
}

// ---- SdfListOp<T> (listOp.h, listOp.cpp) ------------------------------------
//
// The list-op value type with its edit operations. Layers store list ops in
// the SdfListOpValue shape; SdfListOp.fromValue reads one and toValue writes
// one.

// Item equality for list ops: identity for strings and numbers, structural
// for reference and payload items.
function sdfListOpItemsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const equals = (a as { equals?: (other: unknown) => boolean }).equals
  if (typeof equals === 'function') return equals.call(a, b)
  const otherEquals = (b as { equals?: (other: unknown) => boolean }).equals
  if (typeof otherEquals === 'function') return otherEquals.call(b, a)
  return JSON.stringify(a) === JSON.stringify(b)
}

const LIST_OP_TYPES: readonly SdfListOpType[] = [
  'explicit', 'added', 'prepended', 'appended', 'deleted', 'ordered',
]

export class SdfListOp<T> {
  private _isExplicit = false
  private _explicitItems: T[] = []
  private _addedItems: T[] = []
  private _prependedItems: T[] = []
  private _appendedItems: T[] = []
  private _deletedItems: T[] = []
  private _orderedItems: T[] = []

  constructor(private readonly _equals: (a: T, b: T) => boolean = sdfListOpItemsEqual) {}

  static createExplicit<T>(explicitItems: readonly T[] = []): SdfListOp<T> {
    const listOp = new SdfListOp<T>()
    listOp.setExplicitItems(explicitItems)
    return listOp
  }

  static create<T>(
    prependedItems: readonly T[] = [], appendedItems: readonly T[] = [], deletedItems: readonly T[] = [],
  ): SdfListOp<T> {
    const listOp = new SdfListOp<T>()
    listOp.setPrependedItems(prependedItems)
    listOp.setAppendedItems(appendedItems)
    listOp.setDeletedItems(deletedItems)
    return listOp
  }

  /** A list op read from a stored list op value (or an explicit item array). */
  static fromValue<T>(
    raw: unknown, mapItem: (item: unknown) => T = item => item as T,
    equals?: (a: T, b: T) => boolean,
  ): SdfListOp<T> {
    const listOp = new SdfListOp<T>(equals)
    const op = sdfNormalizeListOp<unknown>(raw)
    if (!op) return listOp
    listOp._isExplicit = op.isExplicit
    listOp._explicitItems = op.explicitItems.map(mapItem)
    listOp._addedItems = op.addedItems.map(mapItem)
    listOp._prependedItems = op.prependedItems.map(mapItem)
    listOp._appendedItems = op.appendedItems.map(mapItem)
    listOp._deletedItems = op.deletedItems.map(mapItem)
    listOp._orderedItems = op.orderedItems.map(mapItem)
    return listOp
  }

  /** The stored value of this list op. */
  toValue(): SdfNormalizedListOp<T> {
    return {
      isExplicit: this._isExplicit, explicitItems: [...this._explicitItems],
      addedItems: [...this._addedItems], prependedItems: [...this._prependedItems],
      appendedItems: [...this._appendedItems], deletedItems: [...this._deletedItems],
      orderedItems: [...this._orderedItems],
    }
  }

  clone(): SdfListOp<T> {
    const copy = new SdfListOp<T>(this._equals)
    copy._isExplicit = this._isExplicit
    for (const type of LIST_OP_TYPES) copy._itemsRef(type).push(...this._itemsRef(type))
    return copy
  }

  // The copy VtValue makes of a held list op (value.ts copyObject calls a
  // held object's Clone(), the counterpart of SdfListOp's copy constructor).
  Clone(): SdfListOp<T> { return this.clone() }

  isExplicit(): boolean { return this._isExplicit }

  // SdfListOp::HasKeys.
  hasKeys(): boolean {
    if (this._isExplicit) return true
    return this._addedItems.length + this._prependedItems.length + this._appendedItems.length +
      this._deletedItems.length + this._orderedItems.length > 0
  }

  // SdfListOp::HasItem.
  hasItem(item: T): boolean {
    const has = (items: readonly T[]): boolean => items.some(x => this._equals(x, item))
    if (this._isExplicit) return has(this._explicitItems)
    return has(this._addedItems) || has(this._prependedItems) || has(this._appendedItems) ||
      has(this._deletedItems) || has(this._orderedItems)
  }

  getExplicitItems(): T[] { return [...this._explicitItems] }
  getAddedItems(): T[] { return [...this._addedItems] }
  getPrependedItems(): T[] { return [...this._prependedItems] }
  getAppendedItems(): T[] { return [...this._appendedItems] }
  getDeletedItems(): T[] { return [...this._deletedItems] }
  getOrderedItems(): T[] { return [...this._orderedItems] }

  getItems(type: SdfListOpType): T[] { return [...this._itemsRef(type)] }

  private _itemsRef(type: SdfListOpType): T[] {
    switch (type) {
      case 'explicit': return this._explicitItems
      case 'added': return this._addedItems
      case 'prepended': return this._prependedItems
      case 'appended': return this._appendedItems
      case 'deleted': return this._deletedItems
      case 'ordered': return this._orderedItems
    }
  }

  getAppliedItems(): T[] { return this.applyOperations([]) }

  // _MakeUnique (listOp.cpp:228-300): drops duplicates, keeping the first
  // occurrence (the last when reverse is set). Returns false when it did.
  private _makeUnique(items: T[], reverse: boolean): boolean {
    const unique: T[] = []
    const ordered = reverse ? [...items].reverse() : items
    for (const item of ordered) if (!unique.some(x => this._equals(x, item))) unique.push(item)
    if (unique.length === items.length) return true
    if (reverse) unique.reverse()
    items.splice(0, items.length, ...unique)
    return false
  }

  setExplicitItems(items: readonly T[]): boolean {
    this._setExplicit(true)
    this._explicitItems = [...items]
    return this._makeUnique(this._explicitItems, false)
  }

  setAddedItems(items: readonly T[]): void {
    this._setExplicit(false)
    this._addedItems = [...items]
  }

  setPrependedItems(items: readonly T[]): boolean {
    this._setExplicit(false)
    this._prependedItems = [...items]
    return this._makeUnique(this._prependedItems, false)
  }

  setAppendedItems(items: readonly T[]): boolean {
    this._setExplicit(false)
    this._appendedItems = [...items]
    return this._makeUnique(this._appendedItems, true)
  }

  setDeletedItems(items: readonly T[]): boolean {
    this._setExplicit(false)
    this._deletedItems = [...items]
    return this._makeUnique(this._deletedItems, false)
  }

  setOrderedItems(items: readonly T[]): void {
    this._setExplicit(false)
    this._orderedItems = [...items]
  }

  setItems(items: readonly T[], type: SdfListOpType): boolean {
    switch (type) {
      case 'explicit': return this.setExplicitItems(items)
      case 'added': this.setAddedItems(items); return true
      case 'prepended': return this.setPrependedItems(items)
      case 'appended': return this.setAppendedItems(items)
      case 'deleted': return this.setDeletedItems(items)
      case 'ordered': this.setOrderedItems(items); return true
    }
  }

  // Changing between explicit and list-editing modes clears every list.
  private _setExplicit(isExplicit: boolean): void {
    if (isExplicit === this._isExplicit) return
    this._isExplicit = isExplicit
    for (const type of LIST_OP_TYPES) this._itemsRef(type).length = 0
  }

  clear(): void {
    this._isExplicit = true
    this._setExplicit(false)
  }

  clearAndMakeExplicit(): void {
    this._isExplicit = false
    this._setExplicit(true)
  }

  // SdfListOp::ApplyOperations(vector*, callback) (listOp.cpp:413-465), and
  // SdfListOp::ApplyOperations(const SdfListOp &inner) (listOp.cpp:467-547):
  // the list op composed over `inner`, or undefined when the result cannot
  // be expressed as a single list op.
  applyOperations(vec: readonly T[], callback?: SdfListOpApplyCallback<T>): T[]
  applyOperations(inner: SdfListOp<T>): SdfListOp<T> | undefined
  applyOperations(
    vecOrInner: readonly T[] | SdfListOp<T>, callback?: SdfListOpApplyCallback<T>,
  ): T[] | SdfListOp<T> | undefined {
    if (vecOrInner instanceof SdfListOp) return this._applyOperationsToListOp(vecOrInner)
    return sdfApplyListOpToVector(vecOrInner, this.toValue(), { equals: this._equals }, callback)
  }

  // listOp.cpp:467-547.
  private _applyOperationsToListOp(inner: SdfListOp<T>): SdfListOp<T> | undefined {
    if (this.isExplicit()) {
      // Explicit list-op replaces the result entirely.
      return this.clone()
    }
    if (this._addedItems.length === 0 && this._orderedItems.length === 0) {
      if (inner.isExplicit()) {
        const items = this.applyOperations(inner.getExplicitItems())
        const r = new SdfListOp<T>(this._equals)
        r.setExplicitItems(items)
        return r
      }
      if (inner._addedItems.length === 0 && inner._orderedItems.length === 0) {
        let del = inner.getDeletedItems()
        let pre = inner.getPrependedItems()
        let app = inner.getAppendedItems()
        const remove = (items: T[], x: T): T[] => items.filter(i => !this._equals(i, x))
        // Apply deletes
        for (const x of this._deletedItems) {
          pre = remove(pre, x)
          app = remove(app, x)
          if (!del.some(i => this._equals(i, x))) del.push(x)
        }
        // Apply prepends
        for (const x of this._prependedItems) {
          del = remove(del, x)
          pre = remove(pre, x)
          app = remove(app, x)
        }
        pre = [...this._prependedItems, ...pre]
        // Apply appends
        for (const x of this._appendedItems) {
          del = remove(del, x)
          pre = remove(pre, x)
          app = remove(app, x)
        }
        app = [...app, ...this._appendedItems]
        const r = new SdfListOp<T>(this._equals)
        r.setDeletedItems(del)
        r.setPrependedItems(pre)
        r.setAppendedItems(app)
        return r
      }
    }
    // The result is not well-defined, in general. There is no way to
    // express the combined result as a single SdfListOp.
    return undefined
  }

  // SdfListOp::ModifyOperations (listOp.cpp:729-790): callback returns the
  // replacement item, or undefined to remove it; a replacement equal to an
  // earlier item of the same list is removed.
  modifyOperations(callback: (item: T) => T | undefined): boolean {
    let didModify = false
    for (const type of LIST_OP_TYPES) {
      const items = this._itemsRef(type)
      const modified: T[] = []
      let listModified = false
      for (const item of items) {
        let modifiedItem = callback(item)
        if (modifiedItem !== undefined && modified.some(x => this._equals(x, modifiedItem!))) {
          modifiedItem = undefined
        }
        if (modifiedItem === undefined) listModified = true
        else {
          if (!this._equals(modifiedItem, item)) listModified = true
          modified.push(modifiedItem)
        }
      }
      if (listModified) {
        items.splice(0, items.length, ...modified)
        didModify = true
      }
    }
    return didModify
  }

  // SdfListOp::ReplaceOperations (listOp.cpp:798-844).
  replaceOperations(op: SdfListOpType, index: number, n: number, newItems: readonly T[]): boolean {
    const needsModeSwitch = (this._isExplicit && op !== 'explicit') ||
      (!this._isExplicit && op === 'explicit')
    // Inserting switches modes; replacing or removing is silently ignored.
    if (needsModeSwitch && (n > 0 || newItems.length === 0)) return false
    const items = this.getItems(op)
    if (index > items.length) {
      throw new TfError(`Invalid start index ${index} (size is ${items.length})`, TfDiagnosticType.CodingError)
    }
    if (index + n > items.length) {
      throw new TfError(`Invalid end index ${index + n - 1} (size is ${items.length})`,
        TfDiagnosticType.CodingError)
    }
    items.splice(index, n, ...newItems)
    this.setItems(items, op)
    return true
  }

  // SdfListOp::ComposeOperations (listOp.cpp:846-895).
  composeOperations(stronger: SdfListOp<T>, op: SdfListOpType): void {
    if (op === 'explicit') {
      this.setItems(stronger.getItems(op), op)
      return
    }
    const weaker = this.getItems(op)
    const indexOf = (items: readonly T[], item: T): number => items.findIndex(x => this._equals(x, item))
    if (op === 'ordered') {
      for (const item of stronger._orderedItems) if (indexOf(weaker, item) < 0) weaker.push(item)
      this.setItems(sdfApplyListOrdering(weaker, stronger._orderedItems, { equals: this._equals }), op)
      return
    }
    if (op === 'added' || op === 'deleted') {
      for (const item of stronger.getItems(op)) if (indexOf(weaker, item) < 0) weaker.push(item)
    } else if (op === 'prepended') {
      const items = stronger._prependedItems
      for (let i = items.length - 1; i >= 0; i--) {
        const at = indexOf(weaker, items[i]!)
        if (at >= 0) weaker.splice(at, 1)
        weaker.unshift(items[i]!)
      }
    } else if (op === 'appended') {
      for (const item of stronger._appendedItems) {
        const at = indexOf(weaker, item)
        if (at >= 0) weaker.splice(at, 1)
        weaker.push(item)
      }
    }
    this.setItems(weaker, op)
  }

  // operator<< (listOp.cpp:926-977). `typeName` is the list op type's
  // TfType alias (e.g. "SdfIntListOp").
  toString(typeName = 'SdfListOp'): string {
    let out = `${typeName}(`
    let firstItems = true
    const streamOutItems = (itemsName: string, items: readonly T[], isExplicitList = false): void => {
      if (isExplicitList || items.length > 0) {
        out += `${firstItems ? '' : ', '}${itemsName} Items: [${items.map(i => String(i)).join(', ')}]`
        firstItems = false
      }
    }
    if (this._isExplicit) {
      streamOutItems('Explicit', this._explicitItems, true)
    } else {
      streamOutItems('Deleted', this._deletedItems)
      streamOutItems('Added', this._addedItems)
      streamOutItems('Prepended', this._prependedItems)
      streamOutItems('Appended', this._appendedItems)
      streamOutItems('Ordered', this._orderedItems)
    }
    return out + ')'
  }

  equals(other: SdfListOp<T>): boolean {
    if (this._isExplicit !== other._isExplicit) return false
    return LIST_OP_TYPES.every(type => {
      const a = this._itemsRef(type), b = other._itemsRef(type)
      return a.length === b.length && a.every((item, i) => this._equals(item, b[i]!))
    })
  }
}

// TF_REGISTRY_FUNCTION(TfType) (listOp.cpp:35-58): the list op value types,
// each named by its root alias. One TS class serves every item type, so the
// TfType (not the class) distinguishes them, as in VtValue.Create(op, type).
export const SDF_LIST_OP_TYPE_NAMES = [
  'SdfTokenListOp', 'SdfPathListOp', 'SdfStringListOp', 'SdfReferenceListOp',
  'SdfPayloadListOp', 'SdfIntListOp', 'SdfUIntListOp', 'SdfInt64ListOp',
  'SdfUInt64ListOp', 'SdfUnregisteredValueListOp',
] as const
for (const name of SDF_LIST_OP_TYPE_NAMES) TfType.define(name)

// _TruncateListOpString (listOp.cpp:70-80).
function truncateListOpString<T>(listOp: SdfListOp<T>, typeName: string, displayWidth: number): string {
  let res = listOp.toString(typeName)
  if (res.length > displayWidth && displayWidth > 3) res = res.slice(0, displayWidth - 3) + '...'
  return res
}

// _RegisterVtComposeOver<ListOp> (listOp.cpp:82-117).
function registerVtComposeOver(typeName: string): void {
  const listOpType = TfType.findByName(typeName)
  VtRegisterComposeOver(listOpType, listOpType, (strongVal, weakVal) => {
    // Here "weak" is "inner", "strong" is "outer". If we fail to compose
    // (because either strong or weak use 'ordered' or 'added' lists) we
    // issue a warning and return "strong" only.
    const strong = strongVal.Get<SdfListOp<unknown>>()
    const weak = weakVal.Get<SdfListOp<unknown>>()
    const composed = strong.applyOperations(weak)
    if (composed !== undefined) return VtValue.create(composed, listOpType)
    const failedComposeMsg = `Failed to compose ${truncateListOpString(strong, typeName, 100)} over ` +
      `${truncateListOpString(weak, typeName, 100)} because one or both use 'ordered' or 'added' ` +
      'operations.  Returning the stronger.'
    if (TfDebug.isEnabled('SDF_ERROR_ON_FAILED_LISTOP_COMPOSE')) {
      TfDiagnosticMgr.GetInstance().postError(failedComposeMsg)
    } else {
      TfDiagnosticMgr.GetInstance().postWarning(failedComposeMsg)
    }
    return VtValue.create(strong, listOpType)
  })
  VtRegisterComposeOver(listOpType, TfType.findByName('VtBackgroundType'), strongVal => {
    // To finalize a listop, we call ApplyOperations over an empty list and
    // return a list op with the result as explicit items.
    const strong = strongVal.Get<SdfListOp<unknown>>()
    const items = strong.applyOperations([])
    const r = strong.clone()
    r.clearAndMakeExplicit()
    r.setExplicitItems(items)
    return VtValue.create(r, listOpType)
  })
}

// TF_REGISTRY_FUNCTION(VtValue) (listOp.cpp:119-131).
for (const name of SDF_LIST_OP_TYPE_NAMES) registerVtComposeOver(name)
