// Ported from OpenUSD 26.11.1: pxr/usd/sdf/abstractData.cpp,
//  pxr/usd/sdf/abstractData.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/abstractData.{h,cpp}: anonymous scene-description
// storage. This is deliberately not a Layer; it owns no validation, state
// delegate, change list, notices, identifier, or registry identity.

import { _sdfCloneDictionaryValueTypes, _sdfIsDictionary } from './schema.ts'
import { Array as VtArray, _GetTypeKind as vtTypeKind } from 'typescript-usd/vt'

export type SdfSpecType =
  | 'unknown'
  | 'attribute'
  | 'connection'
  | 'expression'
  | 'mapper'
  | 'mapperArg'
  | 'prim'
  | 'pseudoRoot'
  | 'relationship'
  | 'relationshipTarget'
  | 'variant'
  | 'variantSet'

export interface SdfHasSpecAndFieldResult {
  specType: SdfSpecType
  hasField: boolean
  value?: unknown
}

export abstract class SdfAbstractDataSpecVisitor {
  abstract visitSpec(data: SdfAbstractData, path: string): boolean
  done(_data: SdfAbstractData): void {}
}

const isDictionary = _sdfIsDictionary

function dictionaryPath(keyPath: string): string[] {
  return keyPath.split(':').filter(Boolean)
}

function cloneDictionary(value: Record<string, unknown>): Record<string, unknown> {
  const clone = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sdfCloneValue(item)]))
  _sdfCloneDictionaryValueTypes(value, clone)
  return clone
}

/** @internal Whether a sample sequence holds strings, or values other than
 * numbers, booleans, strings, arrays, VtArrays and Gf values. Upstream asks
 * a sample's type whether it composes (_GetSampleComposability,
 * usd/stage.cpp:8270-8277); only strings (path expressions) and other value
 * classes (array edits) can, so a sequence holding neither never composes. */
export interface SdfTimeSampleValueKinds {
  readonly strings: boolean
  readonly others: boolean
}

export function sdfTimeSampleValueKinds(
  samples: ReadonlyArray<readonly [number, unknown]>,
): SdfTimeSampleValueKinds {
  let strings = false, others = false
  for (let i = 0; i < samples.length && !others; i++) {
    const value = samples[i]![1]
    if (typeof value === 'string') strings = true
    else if (typeof value === 'number' || typeof value === 'boolean') continue
    else {
      const kind = vtTypeKind(value)
      if (kind !== 'list' && kind !== 'array' && kind !== 'gf') others = true
    }
  }
  return { strings, others }
}

// Dispatch is on the value's Vt type kind (typeInfo.ts in vt), one lookup per
// value, as upstream's VtValue copies through its type's _TypeInfo.
export function sdfCloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  switch (vtTypeKind(value)) {
    // A VtArray copy shares storage until either side is written.
    case 'array': return (value as VtArray<unknown>).Clone()
    case 'gf': return new (value.constructor as new (v: unknown) => unknown)(value)
    case 'list': return (value as unknown[]).map(sdfCloneValue)
    case 'record': return cloneDictionary(value as Record<string, unknown>)
  }
  if (isDictionary(value)) return cloneDictionary(value)
  if (value instanceof Map) {
    return new Map([...value].map(([key, item]) => [key, sdfCloneValue(item)]))
  }
  if (value instanceof Set) return new Set([...value].map(sdfCloneValue))
  return value
}

export function sdfValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  // Values of different types are unequal, as VtValue equality requires the
  // same held type (value.h operator==).
  const leftKind = vtTypeKind(left), rightKind = vtTypeKind(right)
  if (leftKind === 'array' || rightKind === 'array') {
    return leftKind === 'array' && rightKind === 'array' &&
      (left as VtArray<unknown>).getElementType() === (right as VtArray<unknown>).getElementType() &&
      (left as VtArray<unknown>).equals(right as VtArray<unknown>)
  }
  if (leftKind === 'gf' || rightKind === 'gf') {
    return left !== null && right !== null && typeof left === 'object' && typeof right === 'object' &&
      Object.getPrototypeOf(left) === Object.getPrototypeOf(right) &&
      (left as { equals(o: unknown): boolean }).equals(right)
  }
  if (leftKind === 'list' && rightKind === 'list') {
    const leftList = left as unknown[], rightList = right as unknown[]
    return leftList.length === rightList.length
      && leftList.every((value, index) => sdfValuesEqual(value, rightList[index]))
  }
  if (left instanceof Map && right instanceof Map) {
    return left.size === right.size
      && [...left].every(([key, value]) => right.has(key) && sdfValuesEqual(value, right.get(key)))
  }
  if (left instanceof Set && right instanceof Set) {
    return left.size === right.size && [...left].every(value => right.has(value))
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false
    // Value classes with their own equality (TsSpline::operator== etc.).
    const equals = (left as { equals?: unknown }).equals
    if (typeof equals === 'function') return Boolean(equals.call(left, right))
    const leftKeys = Object.keys(left as object)
    const rightKeys = Object.keys(right as object)
    return leftKeys.length === rightKeys.length
      && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
      && sdfValuesEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ))
  }
  return false
}

export abstract class SdfAbstractData {
  private _visitDepth = 0

  abstract streamsData(): boolean

  isDetached(): boolean {
    return !this.streamsData()
  }

  isEmpty(): boolean {
    let empty = true
    this.visitSpecs({
      visitSpec: () => { empty = false; return false },
      done: () => {},
    })
    return empty
  }

  copyFrom(source: SdfAbstractData): void {
    this._requireMutable()
    if (source === this) return
    source.visitSpecs({
      visitSpec: (data, path) => {
        this.createSpec(path, data.getSpecType(path))
        for (const fieldName of data.list(path)) {
          this.set(path, fieldName, sdfCloneValue(data.get(path, fieldName)))
          this.setValueTypeName(path, fieldName, data.getValueTypeName(path, fieldName))
        }
        return true
      },
      done: () => {},
    })
  }

  equals(other: SdfAbstractData): boolean {
    const thisPaths: string[] = []
    const otherPaths: string[] = []
    this.visitSpecs({ visitSpec: (_data, path) => { thisPaths.push(path); return true }, done: () => {} })
    other.visitSpecs({ visitSpec: (_data, path) => { otherPaths.push(path); return true }, done: () => {} })
    if (thisPaths.length !== otherPaths.length) return false
    const otherSet = new Set(otherPaths)
    for (const path of thisPaths) {
      if (!otherSet.has(path) || this.getSpecType(path) !== other.getSpecType(path)) return false
      const fields = this.list(path)
      const otherFields = other.list(path)
      if (fields.length !== otherFields.length) return false
      const otherFieldSet = new Set(otherFields)
      if (!fields.every(field => otherFieldSet.has(field)
        && this.getValueTypeName(path, field) === other.getValueTypeName(path, field)
        && sdfValuesEqual(this.get(path, field), other.get(path, field)))) return false
    }
    return true
  }

  createSpec(path: string, specType: SdfSpecType): void {
    this._requireMutable()
    this._createSpec(path, specType)
  }

  abstract hasSpec(path: string): boolean

  eraseSpec(path: string): void {
    this._requireMutable()
    this._eraseSpec(path)
  }

  moveSpec(oldPath: string, newPath: string): void {
    this._requireMutable()
    this._moveSpec(oldPath, newPath)
  }

  abstract getSpecType(path: string): SdfSpecType
  abstract has(path: string, fieldName: string): boolean
  abstract get(path: string, fieldName: string): unknown
  // OpenUSD v26.08 VtValue carries this identity intrinsically while
  // SdfAbstractData copies values (pxr/usd/sdf/abstractData.cpp:89-108).
  abstract getValueTypeName(path: string, fieldName: string): string | undefined
  abstract setValueTypeName(path: string, fieldName: string, typeName: string | undefined): void

  hasSpecAndField(path: string, fieldName: string): SdfHasSpecAndFieldResult {
    const specType = this.getSpecType(path)
    const hasField = specType !== 'unknown' && this.has(path, fieldName)
    return hasField
      ? { specType, hasField, value: this.get(path, fieldName) }
      : { specType, hasField }
  }

  set(path: string, fieldName: string, value: unknown): void {
    this._requireMutable()
    if (value === undefined) this._erase(path, fieldName)
    else this._set(path, fieldName, value)
  }

  erase(path: string, fieldName: string): void {
    this._requireMutable()
    this._erase(path, fieldName)
  }

  abstract list(path: string): string[]

  visitSpecs(visitor: Pick<SdfAbstractDataSpecVisitor, 'visitSpec' | 'done'>): void {
    this._visitDepth++
    try {
      this._visitSpecs(visitor)
      visitor.done(this)
    } finally {
      this._visitDepth--
    }
  }

  hasDictKey(path: string, fieldName: string, keyPath: string): boolean {
    return this.getDictValueByKey(path, fieldName, keyPath) !== undefined
  }

  getDictValueByKey(path: string, fieldName: string, keyPath: string): unknown {
    let value = this.get(path, fieldName)
    for (const key of dictionaryPath(keyPath)) {
      if (!isDictionary(value) || !Object.prototype.hasOwnProperty.call(value, key)) {
        return undefined
      }
      value = value[key]
    }
    return value
  }

  setDictValueByKey(path: string, fieldName: string, keyPath: string, value: unknown): void {
    if (value === undefined) {
      this.eraseDictValueByKey(path, fieldName, keyPath)
      return
    }
    const current = this.get(path, fieldName)
    const dictionary = isDictionary(current) ? cloneDictionary(current) : {}
    const keys = dictionaryPath(keyPath)
    if (keys.length === 0) return
    let target = dictionary
    for (const key of keys.slice(0, -1)) {
      const child = target[key]
      target = target[key] = isDictionary(child) ? cloneDictionary(child) : {}
    }
    target[keys.at(-1)!] = value
    this.set(path, fieldName, dictionary)
  }

  eraseDictValueByKey(path: string, fieldName: string, keyPath: string): void {
    const current = this.get(path, fieldName)
    if (!isDictionary(current)) return
    const dictionary = cloneDictionary(current)
    const keys = dictionaryPath(keyPath)
    if (keys.length === 0) return
    const parents: Array<[Record<string, unknown>, string]> = []
    let target = dictionary
    for (const key of keys.slice(0, -1)) {
      const child = target[key]
      if (!isDictionary(child)) return
      parents.push([target, key])
      target = child
    }
    if (!Object.prototype.hasOwnProperty.call(target, keys.at(-1)!)) return
    delete target[keys.at(-1)!]
    for (let i = parents.length - 1; i >= 0; --i) {
      const [parent, key] = parents[i]!
      const child = parent[key]
      if (isDictionary(child) && Object.keys(child).length === 0) delete parent[key]
    }
    if (Object.keys(dictionary).length === 0) this.erase(path, fieldName)
    else this.set(path, fieldName, dictionary)
  }

  listDictKeys(path: string, fieldName: string, keyPath: string): string[] {
    const value = keyPath
      ? this.getDictValueByKey(path, fieldName, keyPath)
      : this.get(path, fieldName)
    return isDictionary(value) ? Object.keys(value) : []
  }

  abstract listAllTimeSamples(): number[]
  abstract listTimeSamplesForPath(path: string): number[]
  abstract getBracketingTimeSamples(time: number): [number, number] | undefined
  abstract getNumTimeSamplesForPath(path: string): number
  abstract getBracketingTimeSamplesForPath(path: string, time: number): [number, number] | undefined

  getPreviousTimeSampleForPath(path: string, time: number): number | undefined {
    const bracket = this.getBracketingTimeSamplesForPath(path, time)
    if (!bracket || time < bracket[0]) return undefined
    if (time !== bracket[0]) return bracket[0]
    const previous = this.getBracketingTimeSamplesForPath(path, nextDown(time))
    return !previous || previous[0] === time ? undefined : previous[0]
  }

  abstract queryTimeSample(path: string, time: number): unknown

  // The stored field value, uncloned, for internal readers that never mutate
  // or retain it (upstream's GetField hands out a cheap copy-on-write VtValue;
  // get() here must deep-copy to protect the store).
  _getView(path: string, fieldName: string): unknown {
    return this.get(path, fieldName)
  }

  // The path's samples as time-sorted [time, value] pairs, read-only and
  // uncloned: the composition-side read path (UsdResolveInfo holds the source
  // layer and reads samples from it on demand; it never copies the map).
  // Callers must not mutate the result or keep it across edits.
  _getTimeSamplesView(path: string): ReadonlyArray<readonly [number, unknown]> {
    return this.listTimeSamplesForPath(path).map(time => [time, this.queryTimeSample(path, time)] as const)
  }

  /** @internal Which kinds of value the path's samples hold; see
   * sdfTimeSampleValueKinds. */
  _getTimeSampleValueKinds(path: string): SdfTimeSampleValueKinds {
    return sdfTimeSampleValueKinds(this._getTimeSamplesView(path))
  }

  setTimeSample(path: string, time: number, value: unknown): void {
    this._requireMutable()
    if (value === undefined) this._eraseTimeSample(path, time)
    else this._setTimeSample(path, time, value)
  }

  eraseTimeSample(path: string, time: number): void {
    this._requireMutable()
    this._eraseTimeSample(path, time)
  }

  protected abstract _createSpec(path: string, specType: SdfSpecType): void
  protected abstract _eraseSpec(path: string): void
  protected abstract _moveSpec(oldPath: string, newPath: string): void
  protected abstract _set(path: string, fieldName: string, value: unknown): void
  protected abstract _erase(path: string, fieldName: string): void
  protected abstract _visitSpecs(visitor: Pick<SdfAbstractDataSpecVisitor, 'visitSpec'>): void
  protected abstract _setTimeSample(path: string, time: number, value: unknown): void
  protected abstract _eraseTimeSample(path: string, time: number): void

  private _requireMutable(): void {
    if (this._visitDepth !== 0) {
      throw new Error('SdfAbstractData may not be modified during spec visitation')
    }
  }
}

// JavaScript's next representable double toward -Infinity. This supplies the
// exact fallback used by SdfAbstractData::GetPreviousTimeSampleForPath
// (abstractData.cpp:270-299) without assuming integer sample times.
function nextDown(value: number): number {
  if (Number.isNaN(value) || value === -Infinity) return value
  if (value === 0) return -Number.MIN_VALUE
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setFloat64(0, value)
  let bits = view.getBigUint64(0)
  bits = value > 0 ? bits - 1n : bits + 1n
  view.setBigUint64(0, bits)
  return view.getFloat64(0)
}
