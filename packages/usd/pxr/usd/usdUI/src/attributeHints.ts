// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/attributeHints.cpp,
//  pxr/usd/usdUI/attributeHints.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdUI/attributeHints.{h,cpp}.
import type { Attribute } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import {
  UsdUIHintKeys, _codingError, _getMetadataByDictKey, _isValidObject, _setMetadataByDictKey,
} from './objectHints.ts'
import { PropertyHints } from './propertyHints.ts'

// VtValue::IsHolding<VtDictionary>(): dictionary metadata values are plain
// objects here.
function _isDict(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
}

// VtValue::IsHolding<VtTokenArray>().
function _asTokenArray(value: unknown): string[] | undefined {
  const arr = value instanceof VtArray ? value.toArray() : value
  if (Array.isArray(arr) && arr.every((v) => typeof v === 'string')) return [...arr] as string[]
  return undefined
}

/**
 * A "schema-like" wrapper that provides API for retrieving and authoring UI
 * hint values within the `uiHints` dictionary field on a UsdAttribute
 * (attributeHints.h:19-87).
 */
export class AttributeHints extends PropertyHints {
  private readonly _attr: Attribute | undefined

  /** attributeHints.cpp:11-17 */
  constructor(attr?: Attribute) {
    super(attr)
    this._attr = attr
  }

  /** Return the attribute that this hints instance is interpreting (attributeHints.h:37). */
  getAttribute(): Attribute | undefined { return this._attr }

  /** Return the attribute's value labels dictionary (attributeHints.cpp:19-34). */
  getValueLabels(): Record<string, unknown> {
    if (!_isValidObject(this._attr)) {
      return {}
    }

    const labels = _getMetadataByDictKey(this._attr, UsdUIHintKeys.UIHints, UsdUIHintKeys.ValueLabels)
    if (_isDict(labels)) {
      return labels
    }

    return {}
  }

  /** Set the attribute's value labels dictionary (attributeHints.cpp:36-48). */
  setValueLabels(labels: Record<string, unknown>): boolean {
    if (!_isValidObject(this._attr)) {
      _codingError('Invalid attribute')
    }

    return _setMetadataByDictKey(this._attr, UsdUIHintKeys.UIHints, UsdUIHintKeys.ValueLabels, labels)
  }

  /** Return the value labels order (attributeHints.cpp:50-65; VtTokenArray). */
  getValueLabelsOrder(): string[] {
    if (!_isValidObject(this._attr)) {
      return []
    }

    const order = _asTokenArray(
      _getMetadataByDictKey(this._attr, UsdUIHintKeys.UIHints, UsdUIHintKeys.ValueLabelsOrder))
    if (order !== undefined) {
      return order
    }

    return []
  }

  /** Set the attribute's value labels order (attributeHints.cpp:67-79). */
  setValueLabelsOrder(order: readonly string[]): boolean {
    if (!_isValidObject(this._attr)) {
      _codingError('Invalid attribute')
    }

    return _setMetadataByDictKey(
      this._attr, UsdUIHintKeys.UIHints, UsdUIHintKeys.ValueLabelsOrder, [...order])
  }

  /**
   * Author the value associated with the given `label` to the attribute.
   * Returns false if `label` is not a key in the value labels dictionary
   * (attributeHints.cpp:81-100).
   */
  applyValueLabel(label: string): boolean {
    if (!_isValidObject(this._attr)) {
      _codingError('Invalid attribute')
    }

    const keyPath = AttributeHints._makeKeyPath(UsdUIHintKeys.ValueLabels, label)
    const value = _getMetadataByDictKey(this._attr, UsdUIHintKeys.UIHints, keyPath)

    if (value !== undefined) {
      // UsdAttribute::Set returns whether the value was authored.
      this._attr.set(value)
      return true
    }

    return false
  }
}
