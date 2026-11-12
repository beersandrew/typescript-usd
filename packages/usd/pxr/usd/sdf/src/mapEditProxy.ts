// Ported from OpenUSD 26.11.1: pxr/usd/sdf/mapEditProxy.cpp,
//  pxr/usd/sdf/mapEditProxy.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/mapEditProxy.h and mapEditor.{h,cpp}: a live,
// validated view of a spec's map-valued field (dictionaries, variant
// selections, relocates). The map is read when the proxy is made; each edit
// writes the whole map back, or clears the field when the map empties.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { _sdfIsDictionary } from './schema.ts'
import type { SdfSpec } from './spec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

// The value policy of a map proxy (SdfIdentityMapEditProxyValuePolicy).
export interface SdfMapEditProxyValuePolicy<V> {
  canonicalizeKey(spec: SdfSpec, key: string): string
  canonicalizeValue(spec: SdfSpec, value: V): V
}

export const sdfIdentityMapEditProxyValuePolicy: SdfMapEditProxyValuePolicy<unknown> = {
  canonicalizeKey: (_spec, key) => key,
  canonicalizeValue: (_spec, value) => value,
}

export class SdfMapEditProxy<V = unknown> implements Iterable<[string, V]> {
  private _data: Record<string, V> = {}

  constructor(
    private readonly _owner: SdfSpec | undefined,
    private readonly _field: string,
    private readonly _valuePolicy: SdfMapEditProxyValuePolicy<V> =
      sdfIdentityMapEditProxyValuePolicy as SdfMapEditProxyValuePolicy<V>,
  ) {
    const stored = _owner?.getField(_field)
    if (stored !== undefined) {
      if (!_sdfIsDictionary(stored)) codingError(`${this._location()} does not hold value of expected type.`)
      this._data = { ...(stored as Record<string, V>) }
    }
  }

  /** The proxy's bool conversion: whether it has an editor that is not expired. */
  isValid(): boolean { return !!this._owner && !this._owner.isDormant() }

  isExpired(): boolean { return !!this._owner && this._owner.isDormant() }

  size(): number { return this._validate() ? Object.keys(this._data).length : 0 }

  empty(): boolean { return this.size() === 0 }

  has(key: string): boolean {
    return this._validate() && Object.hasOwn(this._data, this._canonicalizeKey(key))
  }

  get(key: string): V | undefined {
    return this._validate() ? this._data[this._canonicalizeKey(key)] : undefined
  }

  set(key: string, value: V): void {
    if (!this._validate()) return
    const canonicalKey = this._validateKey(key)
    const canonicalValue = this._validateValue(value)
    this._data[canonicalKey] = canonicalValue
    this._updateDataInSpec()
  }

  /** Inserts the entry unless the key is present; returns whether it inserted. */
  insert(key: string, value: V): boolean {
    if (!this._validate()) return false
    const canonicalKey = this._validateKey(key)
    if (Object.hasOwn(this._data, canonicalKey)) return false
    this._data[canonicalKey] = this._validateValue(value)
    this._updateDataInSpec()
    return true
  }

  /** Erases the entry; returns whether it existed. */
  erase(key: string): boolean {
    if (!this._validate()) return false
    const canonicalKey = this._canonicalizeKey(key)
    if (!Object.hasOwn(this._data, canonicalKey)) return false
    delete this._data[canonicalKey]
    this._updateDataInSpec()
    return true
  }

  clear(): void { this.assign({}) }

  /** Replaces the whole map (the proxy's operator=). */
  assign(other: Readonly<Record<string, V>>): void {
    if (!this._validate()) return
    const data: Record<string, V> = {}
    for (const [key, value] of Object.entries(other)) {
      data[this._validateKey(key)] = this._validateValue(value)
    }
    this._data = data
    this._updateDataInSpec()
  }

  /** Python dict update: sets each entry of other. */
  update(other: Readonly<Record<string, V>>): void {
    for (const [key, value] of Object.entries(other)) this.set(key, value)
  }

  keys(): string[] { return this._validate() ? Object.keys(this._data) : [] }
  values(): V[] { return this._validate() ? Object.values(this._data) : [] }
  items(): [string, V][] { return this._validate() ? Object.entries(this._data) : [] }

  toObject(): Record<string, V> { return this._validate() ? { ...this._data } : {} }

  [Symbol.iterator](): Iterator<[string, V]> { return this.items()[Symbol.iterator]() }

  private _location(): string {
    return `field '${this._field}' in <${this._owner?.getPath().pathString ?? ''}>`
  }

  private _validate(): boolean {
    if (!this._owner) return false
    if (this._owner.isDormant()) codingError(`Editing an invalid map proxy`)
    return true
  }

  private _canonicalizeKey(key: string): string {
    return this._valuePolicy.canonicalizeKey(this._owner!, key)
  }

  private _validateKey(key: string): string {
    const canonical = this._canonicalizeKey(key)
    const isValid = this._owner!.getSchema().getFieldDefinition(this._field)?.isValidMapKey(canonical)
    if (isValid && !isValid.isAllowed()) codingError(`Invalid key: ${isValid.getWhyNot()}`)
    return canonical
  }

  private _validateValue(value: V): V {
    const canonical = this._valuePolicy.canonicalizeValue(this._owner!, value)
    const isValid = this._owner!.getSchema().getFieldDefinition(this._field)?.isValidMapValue(canonical)
    if (isValid && !isValid.isAllowed()) codingError(`Invalid value: ${isValid.getWhyNot()}`)
    return canonical
  }

  // _UpdateDataInSpec (mapEditor.cpp:112-124).
  private _updateDataInSpec(): void {
    if (Object.keys(this._data).length === 0) this._owner!.clearField(this._field)
    else this._owner!.setField(this._field, { ...this._data })
  }
}

export type SdfDictionaryProxy = SdfMapEditProxy<unknown>
export type SdfVariantSelectionProxy = SdfMapEditProxy<string>
export type SdfRelocatesMapProxy = SdfMapEditProxy<string>
