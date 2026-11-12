// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/objectHints.cpp,
//  pxr/usd/usdUI/objectHints.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdUI/objectHints.{h,cpp}.
import { TfEnvSetting, TfGetEnvSetting, Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { Attribute, Prim, Rel } from 'typescript-usd/usd'

/** A UsdObject: a prim or a property (attribute or relationship). */
export type UsdUIObject = Prim | Attribute | Rel

// objectHints.cpp:12-16
export const USDUI_WRITE_LEGACY_UI_HINTS = new TfEnvSetting(
  'USDUI_WRITE_LEGACY_UI_HINTS', true,
  'Also write deprecated core metadata fields displayName, displayGroup, ' +
  'and hidden when writing them to their new locations in the uiHints ' +
  'dictionary.')

/**
 * Tokens for the various entries in the `uiHints` dictionary metadata field
 * (objectHints.h:24-44 USDUI_HINT_KEYS, objectHints.cpp:18).
 */
export const UsdUIHintKeys = {
  UIHints: 'uiHints',
  DisplayName: 'displayName',
  DisplayGroup: 'displayGroup',
  Hidden: 'hidden',
  ShownIf: 'shownIf',
  ValueLabels: 'valueLabels',
  ValueLabelsOrder: 'valueLabelsOrder',
  DisplayGroupsExpanded: 'displayGroupsExpanded',
  DisplayGroupsShownIf: 'displayGroupsShownIf',
} as const

// TF_CODING_ERROR; the Python binding raises it as Tf.ErrorException.
export function _codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

// UsdObject::operator bool.
export function _isValidObject(obj: UsdUIObject | undefined): obj is UsdUIObject {
  if (!obj) return false
  const withValid = obj as { isValid?: () => boolean }
  return typeof withValid.isValid === 'function' ? withValid.isValid() : true
}

function _isDict(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
}

/**
 * UsdObject::GetMetadataByDictKey (object.h): the composed value at the
 * ':'-delimited `keyPath` within the dictionary-valued field `key`, or
 * undefined.
 */
export function _getMetadataByDictKey(obj: UsdUIObject, key: string, keyPath: string): unknown {
  const withDictKey = obj as { getMetadataByDictKey?: (k: string, p: string) => unknown }
  if (typeof withDictKey.getMetadataByDictKey === 'function') {
    return withDictKey.getMetadataByDictKey(key, keyPath)
  }
  let value: unknown = obj.getMetadata(key)
  for (const component of keyPath.split(':').filter(Boolean)) {
    if (!_isDict(value)) return undefined
    value = value[component]
  }
  return value
}

/**
 * UsdObject::SetMetadataByDictKey (object.h).
 *
 * FAITHFULNESS-DEBT(usdUI-property-dict-key): properties here have no
 * SetMetadataByDictKey (UsdObject::SetMetadataByDictKey, object.h:351-356,
 * which edits only the entry at the edit target). For properties this
 * rewrites the whole composed dictionary at the edit target instead; the
 * faithful replacement is a property SetMetadataByDictKey in pxr/usd/usd.
 */
export function _setMetadataByDictKey(
  obj: UsdUIObject, key: string, keyPath: string, value: unknown,
): boolean {
  const withDictKey = obj as { setMetadataByDictKey?: (k: string, p: string, v: unknown) => boolean }
  if (typeof withDictKey.setMetadataByDictKey === 'function') {
    return withDictKey.setMetadataByDictKey(key, keyPath, value)
  }
  const current = obj.getMetadata(key)
  const root: Record<string, unknown> = _isDict(current) ? structuredClone(current) : {}
  const components = keyPath.split(':').filter(Boolean)
  let dict = root
  for (const component of components.slice(0, -1)) {
    const next = dict[component]
    dict = dict[component] = _isDict(next) ? next : {}
  }
  dict[components[components.length - 1]!] = value
  return obj.setMetadata(key, root)
}

/**
 * A "schema-like" wrapper that provides API for retrieving and authoring UI
 * hint values within the `uiHints` dictionary field on a UsdObject
 * (objectHints.h:46-135).
 */
export class ObjectHints {
  private readonly _obj: UsdUIObject | undefined

  /**
   * Construct a hints object for `obj`; with no object, an invalid hints
   * object whose "set" operations post errors (objectHints.cpp:20-25).
   */
  constructor(obj?: UsdUIObject) {
    this._obj = obj
  }

  /** Return the object that this hints instance is interpreting (objectHints.h:66). */
  getObject(): UsdUIObject | undefined { return this._obj }

  /**
   * Return the object's display name. Falls back to the deprecated
   * displayName metadata (objectHints.cpp:27-43).
   */
  getDisplayName(): string {
    if (!_isValidObject(this._obj)) {
      return ''
    }

    const name = _getMetadataByDictKey(this._obj, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayName)
    if (typeof name === 'string') {
      return name
    }

    // XXX: Fall back to legacy field (UsdObject::GetDisplayName)
    const legacy = this._obj.getMetadata('displayName')
    return typeof legacy === 'string' ? legacy : ''
  }

  /** Set the object's display name (objectHints.cpp:45-67). */
  setDisplayName(name: string): boolean {
    if (!_isValidObject(this._obj)) {
      _codingError('Invalid object')
    }

    if (!_setMetadataByDictKey(this._obj, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayName, name)) {
      return false
    }

    if (TfGetEnvSetting(USDUI_WRITE_LEGACY_UI_HINTS)) {
      // Use generic API to avoid deprecation warning in
      // UsdObject::SetDisplayName()
      this._obj.setMetadata('displayName', name)
    }

    return true
  }

  /**
   * Return the object's hidden status. Falls back to the deprecated hidden
   * metadata (objectHints.cpp:69-85).
   */
  getHidden(): boolean {
    if (!_isValidObject(this._obj)) {
      return false
    }

    const hidden = _getMetadataByDictKey(this._obj, UsdUIHintKeys.UIHints, UsdUIHintKeys.Hidden)
    if (typeof hidden === 'boolean') {
      return hidden
    }

    // XXX: Fall back to legacy field (UsdObject::IsHidden)
    return this._obj.getMetadata('hidden') === true
  }

  /** Set the object's hidden status (objectHints.cpp:87-109). */
  setHidden(hidden: boolean): boolean {
    if (!_isValidObject(this._obj)) {
      _codingError('Invalid object')
    }

    if (!_setMetadataByDictKey(this._obj, UsdUIHintKeys.UIHints, UsdUIHintKeys.Hidden, hidden)) {
      return false
    }

    if (TfGetEnvSetting(USDUI_WRITE_LEGACY_UI_HINTS)) {
      // Use generic API to avoid deprecation warning in
      // UsdObject::SetHidden()
      this._obj.setMetadata('hidden', hidden)
    }

    return true
  }

  /** `explicit operator bool` (objectHints.h:118-121). */
  isValid(): boolean {
    return _isValidObject(this._obj)
  }

  /**
   * Combine `key1` and `key2` into a single token, separated by the namespace
   * delimiter ':' (objectHints.cpp:111-122).
   */
  protected static _makeKeyPath(key1: string, key2: string): string {
    return `${key1}:${key2}`
  }
}
