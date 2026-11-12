// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/primHints.cpp,
//  pxr/usd/usdUI/primHints.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdUI/primHints.{h,cpp}.
import type { Prim } from 'typescript-usd/usd'
import {
  ObjectHints, UsdUIHintKeys, _codingError, _getMetadataByDictKey, _isValidObject,
  _setMetadataByDictKey,
} from './objectHints.ts'

// VtValue::IsHolding<VtDictionary>(): dictionary metadata values are plain
// objects here.
function _isDict(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
}

// VtValue::GetTypeName() for the error messages below.
function _typeName(value: unknown): string {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
  return typeof value
}

/**
 * A "schema-like" wrapper that provides API for retrieving and authoring UI
 * hint values within the `uiHints` dictionary metadata field on a UsdPrim
 * (primHints.h:17-115).
 */
export class PrimHints extends ObjectHints {
  private readonly _prim: Prim | undefined

  /** primHints.cpp:11-17 */
  constructor(prim?: Prim) {
    super(prim)
    this._prim = prim
  }

  /** Return the prim that this hints instance is interpreting (primHints.h:38). */
  getPrim(): Prim | undefined { return this._prim }

  /** Return the prim's display group expansion dictionary (primHints.cpp:19-34). */
  getDisplayGroupsExpanded(): Record<string, unknown> {
    if (!_isValidObject(this._prim)) {
      return {}
    }

    const dict = _getMetadataByDictKey(this._prim, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroupsExpanded)
    if (_isDict(dict)) {
      return dict
    }

    return {}
  }

  /** Set the prim's display group expansion dictionary (primHints.cpp:36-59). */
  setDisplayGroupsExpanded(expanded: Record<string, unknown>): boolean {
    if (!_isValidObject(this._prim)) {
      _codingError('Invalid prim')
    }

    // Verify all entires hold bool values
    for (const value of Object.values(expanded)) {
      if (typeof value !== 'boolean') {
        _codingError(
          `Unexpected value type (${_typeName(value)}) for '${UsdUIHintKeys.DisplayGroupsExpanded}' (bool)`)
      }
    }

    return _setMetadataByDictKey(
      this._prim, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroupsExpanded, { ...expanded })
  }

  /**
   * Return whether the display group named by `group` should be expanded by
   * default (primHints.cpp:61-72).
   */
  getDisplayGroupExpanded(group: string): boolean {
    if (!_isValidObject(this._prim)) {
      return false
    }

    // Note we don't use GetMetadataByDictKey() here as with the other fields
    // (see further explanation in SetDisplayGroupExpanded())
    const value = this.getDisplayGroupsExpanded()[group]
    // VtDictionaryGet<bool>(expandedDict, group, VtDefault = false)
    return typeof value === 'boolean' ? value : false
  }

  /**
   * Set whether the display group named by `group` should be expanded by
   * default (primHints.cpp:74-108). `group` may contain colon-delimited
   * subgroups; entries for nested groups live at the top level of the
   * dictionary rather than becoming nested subdicts.
   */
  setDisplayGroupExpanded(group: string, expanded: boolean): boolean {
    if (!_isValidObject(this._prim)) {
      _codingError('Invalid prim')
    }

    const expandedDict = { ...this.getDisplayGroupsExpanded() }
    expandedDict[group] = expanded
    return this.setDisplayGroupsExpanded(expandedDict)
  }

  /** Return the prim's display group "shown if" dictionary (primHints.cpp:110-125). */
  getDisplayGroupsShownIf(): Record<string, unknown> {
    if (!_isValidObject(this._prim)) {
      return {}
    }

    const dict = _getMetadataByDictKey(this._prim, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroupsShownIf)
    if (_isDict(dict)) {
      return dict
    }

    return {}
  }

  /** Set the prim's display group "shown if" dictionary (primHints.cpp:127-150). */
  setDisplayGroupsShownIf(shownIf: Record<string, unknown>): boolean {
    if (!_isValidObject(this._prim)) {
      _codingError('Invalid prim')
    }

    // Verify all entires hold string values
    for (const value of Object.values(shownIf)) {
      if (typeof value !== 'string') {
        _codingError(
          `Unexpected value type (${_typeName(value)}) for '${UsdUIHintKeys.DisplayGroupsShownIf}' expression: (string)`)
      }
    }

    return _setMetadataByDictKey(
      this._prim, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroupsShownIf, { ...shownIf })
  }

  /** Return the "shown if" expression string for the named `group` (primHints.cpp:152-168). */
  getDisplayGroupShownIf(group: string): string {
    if (!_isValidObject(this._prim)) {
      return ''
    }

    const keyPath = PrimHints._makeKeyPath(UsdUIHintKeys.DisplayGroupsShownIf, group)
    const shownIf = _getMetadataByDictKey(this._prim, UsdUIHintKeys.UIHints, keyPath)
    if (typeof shownIf === 'string') {
      return shownIf
    }

    return ''
  }

  /** Set the "shown if" expression string for the named `group` (primHints.cpp:170-186). */
  setDisplayGroupShownIf(group: string, shownIf: string): boolean {
    if (!_isValidObject(this._prim)) {
      _codingError('Invalid prim')
    }

    const keyPath = PrimHints._makeKeyPath(UsdUIHintKeys.DisplayGroupsShownIf, group)
    return _setMetadataByDictKey(this._prim, UsdUIHintKeys.UIHints, keyPath, shownIf)
  }
}
