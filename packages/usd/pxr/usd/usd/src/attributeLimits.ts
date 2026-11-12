// Ported from OpenUSD 26.11.1: pxr/usd/usd/attributeLimits.cpp,
//  pxr/usd/usd/attributeLimits.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/attributeLimits.{h,cpp}.
//
// JavaScript has no C++ template argument at runtime, so get()/getMinimum()/
// getMaximum() expose the type-erased VtValue overloads used by the Python API.

import type { Attribute } from './prim.ts'
import { _sdfCloneValue, _sdfIsDictionary } from 'typescript-usd/sdf/_internal'

export const UsdLimitsKeys = Object.freeze({
  Soft: 'soft',
  Hard: 'hard',
  Minimum: 'minimum',
  Maximum: 'maximum',
} as const)

type Dictionary = Record<string, unknown>

function isDictionary(value: unknown): value is Dictionary {
  return _sdfIsDictionary(value)
}

function copyDictionary(value: unknown): Dictionary {
  return isDictionary(value) ? _sdfCloneValue(value) as Dictionary : {}
}

function sameValueType(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
  }
  return typeof left === typeof right
}

export class UsdAttributeLimitsValidationResult {
  constructor(
    readonly success: boolean,
    readonly invalidValuesDict: Readonly<Dictionary> = {},
    readonly conformedSubDict: Readonly<Dictionary> = {},
    readonly errorString = '',
  ) {}
}

export class UsdAttributeLimits {
  constructor(
    private readonly _attr?: Attribute,
    private readonly _subDictKey = '',
  ) {}

  isValid(): boolean {
    return this._attr !== undefined && this._subDictKey.length > 0
  }

  getAttribute(): Attribute | undefined {
    return this._attr
  }

  getSubDictKey(): string {
    return this._subDictKey
  }

  private _limitsDict(): Dictionary {
    return copyDictionary(this._attr?.getMetadata('limits'))
  }

  private _subDict(): Dictionary {
    const subDict = this._limitsDict()[this._subDictKey]
    return copyDictionary(subDict)
  }

  private _writeSubDict(subDict: Dictionary | undefined): boolean {
    if (!this.isValid()) return false
    const limits = this._limitsDict()
    if (subDict === undefined || Object.keys(subDict).length === 0) {
      delete limits[this._subDictKey]
    } else {
      limits[this._subDictKey] = subDict
    }
    if (Object.keys(limits).length === 0) {
      this._attr!._clearMetadata('limits')
    } else {
      this._attr!.setMetadata('limits', limits)
    }
    return true
  }

  hasAuthored(key?: string): boolean {
    const subDict = this._subDict()
    return key === undefined ? Object.keys(subDict).length > 0
      : Object.prototype.hasOwnProperty.call(subDict, key)
  }

  clear(key?: string): boolean {
    if (!this.isValid()) return false
    if (key === undefined) return this._writeSubDict(undefined)
    const subDict = this._subDict()
    delete subDict[key]
    return this._writeSubDict(subDict)
  }

  hasAuthoredMinimum(): boolean { return this.hasAuthored(UsdLimitsKeys.Minimum) }
  clearMinimum(): boolean { return this.clear(UsdLimitsKeys.Minimum) }
  hasAuthoredMaximum(): boolean { return this.hasAuthored(UsdLimitsKeys.Maximum) }
  clearMaximum(): boolean { return this.clear(UsdLimitsKeys.Maximum) }

  validate(subDict: Dictionary): UsdAttributeLimitsValidationResult {
    if (!this.isValid() || !isDictionary(subDict)) {
      return new UsdAttributeLimitsValidationResult(false, {}, {}, 'Invalid attribute limits')
    }
    const attrValue = this._attr!.get()
    const invalid: Dictionary = {}
    for (const key of [UsdLimitsKeys.Minimum, UsdLimitsKeys.Maximum]) {
      if (key in subDict && !sameValueType(attrValue, subDict[key])) {
        invalid[key] = subDict[key]
      }
    }
    const success = Object.keys(invalid).length === 0
    return new UsdAttributeLimitsValidationResult(
      success,
      invalid,
      success ? _sdfCloneValue(subDict) as Dictionary : {},
      success ? '' : `Invalid limits values for <${this._attr!.primPath}.${this._attr!.name}>`,
    )
  }

  set(subDict: Dictionary): boolean
  set(key: string, value: unknown): boolean
  set(keyOrSubDict: string | Dictionary, value?: unknown): boolean {
    if (typeof keyOrSubDict !== 'string') {
      const result = this.validate(keyOrSubDict)
      return result.success && this._writeSubDict(copyDictionary(result.conformedSubDict))
    }
    if (!this.isValid() || keyOrSubDict.length === 0) return false
    if ((keyOrSubDict === UsdLimitsKeys.Minimum ||
         keyOrSubDict === UsdLimitsKeys.Maximum) &&
        !sameValueType(this._attr!.get(), value)) {
      return false
    }
    const subDict = this._subDict()
    subDict[keyOrSubDict] = _sdfCloneValue(value)
    return this._writeSubDict(subDict)
  }

  get(key: string): unknown {
    return this._subDict()[key]
  }

  getOr<T>(key: string, defaultValue: T): T {
    const value = this.get(key)
    return value === undefined ? defaultValue : value as T
  }

  getMinimum(): unknown { return this.get(UsdLimitsKeys.Minimum) }
  getMinimumOr<T>(defaultValue: T): T {
    return this.getOr(UsdLimitsKeys.Minimum, defaultValue)
  }
  setMinimum(value: unknown): boolean { return this.set(UsdLimitsKeys.Minimum, value) }

  getMaximum(): unknown { return this.get(UsdLimitsKeys.Maximum) }
  getMaximumOr<T>(defaultValue: T): T {
    return this.getOr(UsdLimitsKeys.Maximum, defaultValue)
  }
  setMaximum(value: unknown): boolean { return this.set(UsdLimitsKeys.Maximum, value) }
}
