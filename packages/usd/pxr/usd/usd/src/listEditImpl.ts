// Ported from OpenUSD 26.11.1: pxr/usd/usd/listEditImpl.h,
//  pxr/usd/usd/valueUtils.h
// Copyright 2017, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Usd_ListEditImpl (pxr/usd/usd/listEditImpl.h) and Usd_InsertListItem
// (pxr/usd/usd/valueUtils.h:245-293): the list-op edits shared by
// UsdInherits, UsdSpecializes, UsdReferences and UsdPayloads.

import { sdfNormalizeListOp } from 'typescript-usd/sdf'
import type { UsdListPosition } from './common.ts'

export interface UsdEditedListOp<T> {
  isExplicit: boolean
  explicitItems: T[]
  deletedItems: T[]
  prependedItems: T[]
  appendedItems: T[]
  orderedItems: T[]
}

const emptyListOp = <T>(): UsdEditedListOp<T> => ({
  isExplicit: false, explicitItems: [], deletedItems: [],
  prependedItems: [], appendedItems: [], orderedItems: [],
})

/** The list op authored in a field, or an empty one. */
export function usdListOpForEditing<T>(raw: unknown): UsdEditedListOp<T> {
  const op = sdfNormalizeListOp<T>(raw)
  return op ? {
    isExplicit: op.isExplicit, explicitItems: [...op.explicitItems], deletedItems: [...op.deletedItems],
    prependedItems: [...op.prependedItems], appendedItems: [...op.appendedItems],
    orderedItems: [...op.orderedItems],
  } : emptyListOp<T>()
}

/**
 * Usd_InsertListItem: inserts item at position. If the list op is explicit
 * the item goes in the explicit list; an item already in the list moves to
 * the requested position.
 */
export function usdInsertListItem<T>(
  op: UsdEditedListOp<T>, item: T, position: UsdListPosition,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): void {
  const atFront = position === 'frontOfPrependList' || position === 'frontOfAppendList'
  const list = op.isExplicit ? op.explicitItems
    : position === 'frontOfPrependList' || position === 'backOfPrependList'
      ? op.prependedItems : op.appendedItems
  const pos = list.findIndex(existing => equals(existing, item))
  if (pos >= 0) {
    // Item already exists in the right position.
    if (pos === (atFront ? 0 : list.length - 1)) return
    list.splice(pos, 1)
  }
  if (atFront) list.unshift(item)
  else list.push(item)
}

/**
 * SdfListEditorProxy::Remove (listEditorProxy.h:346-359): an explicit list
 * drops the item; list edits drop it and delete it.
 */
export function usdRemoveListItem<T>(
  op: UsdEditedListOp<T>, item: T, equals: (a: T, b: T) => boolean = (a, b) => a === b,
): void {
  const remove = (list: T[]): void => {
    const pos = list.findIndex(existing => equals(existing, item))
    if (pos >= 0) list.splice(pos, 1)
  }
  if (op.isExplicit) {
    remove(op.explicitItems)
    return
  }
  remove(op.prependedItems)
  remove(op.appendedItems)
  if (!op.deletedItems.some(existing => equals(existing, item))) op.deletedItems.push(item)
}

/** Whether a list op holds no edits (SdfListOp::HasKeys). */
export function usdListOpHasKeys<T>(op: UsdEditedListOp<T>): boolean {
  return op.isExplicit || op.prependedItems.length > 0 || op.appendedItems.length > 0 ||
    op.deletedItems.length > 0 || op.orderedItems.length > 0
}
