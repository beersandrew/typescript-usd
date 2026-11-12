// Ported from OpenUSD 26.11.1: pxr/usd/sdf/data.cpp, pxr/usd/sdf/data.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/data.{h,cpp}: the in-memory, map-backed implementation
// of SdfAbstractData.

import {
  SdfAbstractData,
  sdfTimeSampleValueKinds,
  type SdfAbstractDataSpecVisitor,
  type SdfSpecType,
  type SdfTimeSampleValueKinds,
} from './abstractData.ts'
import { _sdfCheckReturnedValues, _sdfHandOut } from './checkReturnedValues.ts'
import { sdfHandOutValue, sdfStoredValue } from './immutableValue.ts'

// Field values and time samples are copied when stored and handed out by
// reads without a copy, deep-frozen (immutableValue.ts): a stored value is
// frozen the first time a read hands it out, and is shared from then on.
interface SpecData {
  specType: SdfSpecType
  fields: Map<string, unknown>
  // Allocated on first use; most specs record no parser value types.
  valueTypeNames?: Map<string, string>
  // The sorted pairs behind the stored timeSamples value (see _samples),
  // kept with the stored object it indexes.
  sampleIndex?: SampleIndex
}

interface SampleIndex {
  readonly stored: object
  readonly pairs: SamplePairs
  // The pairs are the stored value itself, edited in place by sample edits
  // until a read hands them out (frozen); the next edit then copies them, as
  // SdfData::SetTimeSample copies a shared sample map (data.cpp:478-505).
  readonly owned: boolean
}

type SamplePairs = Array<[number, unknown]>

function sampleEntries(value: unknown): SamplePairs {
  const entries = value instanceof Map
    ? [...value.entries()]
    : Array.isArray(value)
      ? value.filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
      : value !== null && typeof value === 'object'
        ? Object.entries(value)
        : []
  return entries
    .map(([time, sample]): [number, unknown] =>
      [Number(time), sample])
    .filter(([time]) => Number.isFinite(time))
    .sort(([left], [right]) => left - right)
}

// Index of the first time >= time (std::lower_bound over the sorted map, as
// SdfData's std::map<double, VtValue> lookups are upstream).
function lowerBound(length: number, timeAt: (i: number) => number, time: number): number {
  let lo = 0, hi = length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (timeAt(mid) < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

function sampleIndex(samples: SamplePairs, time: number): number {
  return lowerBound(samples.length, i => samples[i]![0], time)
}

function bracket(length: number, timeAt: (i: number) => number, time: number): [number, number] | undefined {
  if (length === 0) return undefined
  const first = timeAt(0)
  if (time <= first) return [first, first]
  const last = timeAt(length - 1)
  if (time >= last) return [last, last]
  const upperIndex = lowerBound(length, timeAt, time)
  const upper = timeAt(upperIndex)
  return upper === time ? [upper, upper] : [timeAt(upperIndex - 1), upper]
}

// A field value decoded on first access (Sdf_CrateData keeps value reps and
// unpacks them on demand, crateData.cpp). The resolved value replaces it.
export abstract class _SdfLazyFieldValue {
  abstract resolve(): unknown
}

class SdfLazyFieldThunk extends _SdfLazyFieldValue {
  constructor(private readonly _resolve: () => unknown) { super() }
  resolve(): unknown { return this._resolve() }
}

function fieldValue(spec: SpecData | undefined, fieldName: string): unknown {
  if (!spec) return undefined
  const stored = spec.fields.get(fieldName)
  if (!(stored instanceof _SdfLazyFieldValue)) return stored
  const value = stored.resolve()
  // Sdf_CrateData unpacks the value rep on every access (_DetachValue,
  // crateData.cpp:1179-1182; crateFile.cpp:4360-4368), so a rep that fails
  // to unpack posts its error on each read: such a field stays lazy. A
  // decoded value is kept, which is observably the same.
  if (value !== undefined) spec.fields.set(fieldName, value)
  return value
}

// A stored sample as a read hands it out (stored samples are frozen).
function handOutSample(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  return _sdfHandOut(sdfHandOutValue(value))
}

export class SdfData extends SdfAbstractData {
  private _data = new Map<string, SpecData>()

  /** @internal Store a field whose value is decoded on first read. The
   * resolved value is owned by this data and is not copied again. */
  _setLazy(path: string, fieldName: string, value: _SdfLazyFieldValue | (() => unknown)): void {
    const spec = this._data.get(path)
    if (!spec) return
    spec.fields.set(fieldName, value instanceof _SdfLazyFieldValue ? value : new SdfLazyFieldThunk(value))
    spec.valueTypeNames?.delete(fieldName)
  }

  /** @internal Store a value this data takes ownership of, without copying
   * (it is frozen). */
  _setOwned(path: string, fieldName: string, value: unknown): void {
    const spec = this._data.get(path)
    if (!spec) return
    spec.fields.set(fieldName, value)
    spec.valueTypeNames?.delete(fieldName)
  }

  streamsData(): boolean { return false }
  override isDetached(): boolean { return true }

  hasSpec(path: string): boolean {
    return this._data.has(path)
  }

  getSpecType(path: string): SdfSpecType {
    return this._data.get(path)?.specType ?? 'unknown'
  }

  has(path: string, fieldName: string): boolean {
    return this._data.get(path)?.fields.has(fieldName) ?? false
  }

  // The stored value, shared and read-only (immutableValue.ts). Sample
  // pairs this data edits in place are frozen when handed out, so the next
  // sample edit copies them first.
  get(path: string, fieldName: string): unknown {
    const spec = this._data.get(path)
    const value = fieldValue(spec, fieldName)
    if (value === null || typeof value !== 'object') return value
    return _sdfHandOut(sdfHandOutValue(value))
  }

  // The stored value for internal readers that neither edit nor keep it, not
  // frozen here (freezing costs a pass over the value). The checking mode
  // freezes it, so library code that edits one throws in the test suite.
  override _getView(path: string, fieldName: string): unknown {
    const value = fieldValue(this._data.get(path), fieldName)
    return _sdfCheckReturnedValues ? _sdfHandOut(value) : value
  }

  getValueTypeName(path: string, fieldName: string): string | undefined {
    return this._data.get(path)?.valueTypeNames?.get(fieldName)
  }

  setValueTypeName(path: string, fieldName: string, typeName: string | undefined): void {
    const spec = this._data.get(path)
    if (!spec) return
    if (typeName === undefined) spec.valueTypeNames?.delete(fieldName)
    else (spec.valueTypeNames ??= new Map()).set(fieldName, typeName)
  }

  list(path: string): string[] {
    return [...(this._data.get(path)?.fields.keys() ?? [])]
  }

  listAllTimeSamples(): number[] {
    const times = new Set<number>()
    for (const path of this._data.keys()) {
      for (const [time] of this._samples(path)) times.add(time)
    }
    return [...times].sort((left, right) => left - right)
  }

  listTimeSamplesForPath(path: string): number[] {
    return this._samples(path).map(([time]) => time)
  }

  getBracketingTimeSamples(time: number): [number, number] | undefined {
    const times = this.listAllTimeSamples()
    return bracket(times.length, i => times[i]!, time)
  }

  getNumTimeSamplesForPath(path: string): number {
    return this._samples(path).length
  }

  getBracketingTimeSamplesForPath(path: string, time: number): [number, number] | undefined {
    const samples = this._samples(path)
    return bracket(samples.length, i => samples[i]![0], time)
  }

  override getPreviousTimeSampleForPath(path: string, time: number): number | undefined {
    const samples = this._samples(path)
    const at = sampleIndex(samples, time)
    return at > 0 ? samples[at - 1]![0] : undefined
  }

  queryTimeSample(path: string, time: number): unknown {
    const samples = this._samples(path)
    const at = sampleIndex(samples, time)
    return at < samples.length && samples[at]![0] === time
      ? handOutSample(samples[at]![1])
      : undefined
  }

  override _getTimeSamplesView(path: string): ReadonlyArray<readonly [number, unknown]> {
    const samples = this._samples(path)
    return _sdfCheckReturnedValues ? _sdfHandOut(samples) : samples
  }

  // Computed once per sample sequence; an in-place sample edit drops it.
  override _getTimeSampleValueKinds(path: string): SdfTimeSampleValueKinds {
    const samples = this._samples(path)
    let kinds = this._sampleKinds.get(samples)
    if (!kinds) {
      kinds = sdfTimeSampleValueKinds(samples)
      this._sampleKinds.set(samples, kinds)
    }
    return kinds
  }
  private _sampleKinds = new WeakMap<object, SdfTimeSampleValueKinds>()

  // The sorted samples behind a spec's timeSamples field, read-only and
  // uncloned. Samples authored through _setTimeSample live in a sorted pairs
  // array this data owns and edits in place; any other stored form (the text
  // parser's time-keyed object, a value given to set()) is indexed once,
  // keyed by the stored object, which set() always replaces with a fresh clone.
  // The index is kept on the spec, valid while the field still holds the
  // object it was built from.
  private _samples(path: string): SamplePairs {
    const spec = this._data.get(path)
    const stored = fieldValue(spec, 'timeSamples')
    if (stored === null || typeof stored !== 'object') return []
    const index = spec!.sampleIndex
    if (index !== undefined && index.stored === stored) return index.pairs
    const pairs = sampleEntries(stored)
    spec!.sampleIndex = { stored, pairs, owned: false }
    return pairs
  }

  protected _createSpec(path: string, specType: SdfSpecType): void {
    if (specType === 'unknown') return
    const existing = this._data.get(path)
    if (existing) existing.specType = specType
    else this._data.set(path, { specType, fields: new Map() })
  }

  protected _eraseSpec(path: string): void {
    this._data.delete(path)
  }

  protected _moveSpec(oldPath: string, newPath: string): void {
    const existing = this._data.get(oldPath)
    if (!existing || this._data.has(newPath)) return
    this._data.set(newPath, existing)
    this._data.delete(oldPath)
  }

  protected _set(path: string, fieldName: string, value: unknown): void {
    const spec = this._data.get(path)
    spec?.fields.set(fieldName, sdfStoredValue(value))
    spec?.valueTypeNames?.delete(fieldName)
    if (spec && fieldName === 'timeSamples') delete spec.sampleIndex
  }

  protected _erase(path: string, fieldName: string): void {
    const spec = this._data.get(path)
    spec?.fields.delete(fieldName)
    spec?.valueTypeNames?.delete(fieldName)
    if (spec && fieldName === 'timeSamples') delete spec.sampleIndex
  }

  protected _visitSpecs(visitor: Pick<SdfAbstractDataSpecVisitor, 'visitSpec'>): void {
    for (const path of this._data.keys()) {
      if (!visitor.visitSpec(this, path)) break
    }
  }

  protected _setTimeSample(path: string, time: number, value: unknown): void {
    const spec = this._data.get(path)
    if (!spec) return
    const samples = this._ownSamples(spec, path)
    this._sampleKinds.delete(samples)
    const at = sampleIndex(samples, time)
    const pair: [number, unknown] = [time, sdfStoredValue(value)]
    if (at < samples.length && samples[at]![0] === time) samples[at] = pair
    else samples.splice(at, 0, pair)
  }

  protected _eraseTimeSample(path: string, time: number): void {
    const spec = this._data.get(path)
    if (!spec) return
    const samples = this._ownSamples(spec, path)
    this._sampleKinds.delete(samples)
    const at = sampleIndex(samples, time)
    if (at < samples.length && samples[at]![0] === time) samples.splice(at, 1)
    if (samples.length === 0) this._erase(path, 'timeSamples')
  }

  // Converts the spec's timeSamples field to an owned sorted pairs array (the
  // stored form after any sample edit) and returns it for in-place editing.
  private _ownSamples(spec: SpecData, path: string): SamplePairs {
    const stored = fieldValue(spec, 'timeSamples')
    spec.valueTypeNames?.delete('timeSamples')
    const index = spec.sampleIndex
    // Pairs a read has handed out are frozen and shared: edit a copy.
    if (index !== undefined && index.owned && index.stored === stored &&
      !Object.isFrozen(index.pairs)) return index.pairs
    const owned = this._samples(path).slice()
    spec.fields.set('timeSamples', owned)
    spec.sampleIndex = { stored: owned, pairs: owned, owned: true }
    return owned
  }
}
