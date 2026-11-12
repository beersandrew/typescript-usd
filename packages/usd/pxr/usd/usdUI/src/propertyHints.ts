// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/propertyHints.cpp,
//  pxr/usd/usdUI/propertyHints.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdUI/propertyHints.{h,cpp}.
import type { Attribute, Rel } from 'typescript-usd/usd'
import {
  ObjectHints, USDUI_WRITE_LEGACY_UI_HINTS, UsdUIHintKeys, _codingError,
  _getMetadataByDictKey, _isValidObject, _setMetadataByDictKey,
} from './objectHints.ts'
import { TfGetEnvSetting } from 'typescript-usd/tf'

/** A UsdProperty: an attribute or a relationship. */
export type UsdUIProperty = Attribute | Rel

/**
 * A "schema-like" wrapper that provides API for retrieving and authoring UI
 * hint values within the `uiHints` dictionary field on a UsdProperty
 * (propertyHints.h:17-83).
 */
export class PropertyHints extends ObjectHints {
  private readonly _prop: UsdUIProperty | undefined

  /** propertyHints.cpp:11-17 */
  constructor(prop?: UsdUIProperty) {
    super(prop)
    this._prop = prop
  }

  /** Return the property that this hints instance is interpreting (propertyHints.h:39). */
  getProperty(): UsdUIProperty | undefined { return this._prop }

  /**
   * Return the property's display group. Falls back to the deprecated
   * displayGroup metadata (propertyHints.cpp:19-34).
   */
  getDisplayGroup(): string {
    if (!_isValidObject(this._prop)) {
      return ''
    }

    const group = _getMetadataByDictKey(this._prop, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroup)
    if (typeof group === 'string') {
      return group
    }

    // XXX: Fall back to legacy field (UsdProperty::GetDisplayGroup)
    const legacy = this._prop.getMetadata('displayGroup')
    return typeof legacy === 'string' ? legacy : ''
  }

  /** Set the property's display group (propertyHints.cpp:36-58). */
  setDisplayGroup(group: string): boolean {
    if (!_isValidObject(this._prop)) {
      _codingError('Invalid property')
    }

    if (!_setMetadataByDictKey(this._prop, UsdUIHintKeys.UIHints, UsdUIHintKeys.DisplayGroup, group)) {
      return false
    }

    if (TfGetEnvSetting(USDUI_WRITE_LEGACY_UI_HINTS)) {
      // Use generic API to avoid deprecation warning in
      // UsdProperty::SetDisplayGroup()
      this._prop.setMetadata('displayGroup', group)
    }

    return true
  }

  /** Return the property's "shown if" expression string (propertyHints.cpp:60-75). */
  getShownIf(): string {
    if (!_isValidObject(this._prop)) {
      return ''
    }

    const shownIf = _getMetadataByDictKey(this._prop, UsdUIHintKeys.UIHints, UsdUIHintKeys.ShownIf)
    if (typeof shownIf === 'string') {
      return shownIf
    }

    return ''
  }

  /** Set the property's "shown if" expression string (propertyHints.cpp:77-90). */
  setShownIf(shownIf: string): boolean {
    if (!_isValidObject(this._prop)) {
      _codingError('Invalid property')
    }

    return _setMetadataByDictKey(this._prop, UsdUIHintKeys.UIHints, UsdUIHintKeys.ShownIf, shownIf)
  }
}
