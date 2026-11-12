// Ported from OpenUSD 26.11.1: pxr/usd/sdf/spec.cpp, pxr/usd/sdf/spec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/spec.{h,cpp}: the base class of all spec handles. A
// spec holds no data of its own: its identity is a layer and a path (which
// follows the spec when it moves), and every query reads the layer.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfSpecType } from './abstractData.ts'
import { sdfChangeBlock } from './changeManager.ts'
import { Sdf_CleanupTracker } from './cleanupTracker.ts'
import type { Sdf_Identity } from './identity.ts'
import type { Layer } from './layer.ts'
import type { SdfPath } from './path.ts'
import { _sdfIsDictionary, SdfSchema } from './schema.ts'

type SpecConstructor<T extends SdfSpec> = new (id: Sdf_Identity) => T

export class SdfSpec {
  /** @internal */
  constructor(protected readonly _id: Sdf_Identity) {}

  /**
   * @internal The handle of class `this` for an identity. Handles of one class
   * to the same spec are the same object.
   */
  static _forIdentity<T extends SdfSpec>(this: SpecConstructor<T>, id: Sdf_Identity): T {
    let handle = id._handles.get(this) as T | undefined
    if (!handle) {
      handle = new this(id)
      id._handles.set(this, handle)
    }
    return handle
  }

  /** @internal */
  _getIdentity(): Sdf_Identity { return this._id }

  getSchema(): SdfSchema { return SdfSchema.getInstance() }

  getLayer(): Layer { return this._id.getLayer<Layer>()! }

  getPath(): SdfPath { return this._id.getPath() }

  getSpecType(): SdfSpecType {
    const layer = this._id.getLayer<Layer>()
    return layer ? layer.getSpecType(this.getPath().pathString) : 'unknown'
  }

  // SdfSpec::IsDormant: the spec no longer exists in its layer.
  isDormant(): boolean {
    const path = this._id.getPath()
    if (path.isEmpty()) return true
    const layer = this._id.getLayer<Layer>()
    return !layer || !layer.hasSpec(path.pathString)
  }

  /** The Python `expired` property: whether the spec is dormant. */
  get expired(): boolean { return this.isDormant() }

  permissionToEdit(): boolean {
    return this._id.getLayer<Layer>()?.permissionToEdit() ?? false
  }

  equals(other: SdfSpec | undefined | null): boolean {
    return !!other && this._id === other._id
  }

  // ---- Fields ----

  listFields(): string[] { return this.getLayer().listFields(this.getPath().pathString) }

  hasField(name: string): boolean { return this.getLayer().hasField(this.getPath().pathString, name) }

  getField(name: string): unknown { return this.getLayer().getField(this.getPath().pathString, name) }

  setField(name: string, value: unknown): boolean {
    this.getLayer().setField(this.getPath().pathString, name, value)
    return true
  }

  clearField(name: string): boolean {
    this.getLayer().eraseField(this.getPath().pathString, name)
    return true
  }

  // ---- Info (metadata) API ----

  getMetaDataInfoKeys(): string[] {
    return this.getSchema().getMetadataFields(this.getSpecType())
  }

  getMetaDataDisplayGroup(key: string): string {
    return this.getSchema().getSpecDefinition(this.getSpecType())?.getMetadataFieldDisplayGroup(key) ?? ''
  }

  // SdfSpec::ListInfoKeys (spec.cpp:165-190): the spec type's fields that
  // hold a value, except children fields.
  listInfoKeys(): string[] {
    const schema = this.getSchema()
    const specDef = schema.getSpecDefinition(this.getSpecType())
    if (!specDef) return []
    return specDef.getFields().filter(field =>
      !schema.holdsChildren(field) && this.hasInfo(field))
  }

  getInfo(key: string): unknown {
    const def = this.getSchema().getFieldDefinition(key)
    if (!def) throw new TfError(`Invalid info key: ${key}`, TfDiagnosticType.CodingError)
    const value = this.getField(key)
    return value !== undefined ? value : def.getFallbackValue()
  }

  setInfo(key: string, value: unknown): void {
    const schema = this.getSchema()
    canEditInfoOnSpec(key, this.getSpecType(), schema, 'set')
    this.setField(key, value)
  }

  setInfoDictionaryValue(dictionaryKey: string, entryKey: string, value: unknown): void {
    const existing = this.getField(dictionaryKey)
    const dict: Record<string, unknown> = _sdfIsDictionary(existing) ? { ...existing } : {}
    if (value === undefined) delete dict[entryKey]
    else dict[entryKey] = value
    this.setInfo(dictionaryKey, dict)
  }

  hasInfo(key: string): boolean { return this.hasField(key) }

  clearInfo(key: string): void {
    const schema = this.getSchema()
    // A field without a definition may still exist as an unknown field.
    if (schema.getFieldDefinition(key)) canEditInfoOnSpec(key, this.getSpecType(), schema, 'clear')
    sdfChangeBlock(() => {
      this.clearField(key)
      // The spec may be left inert; schedule it for cleanup if tracking.
      Sdf_CleanupTracker.getInstance().addSpecIfTracking(this)
    })
  }

  getFallbackForInfo(key: string): unknown {
    const schema = this.getSchema()
    const def = schema.getFieldDefinition(key)
    if (!def) throw new TfError(`Unknown field '${key}'`, TfDiagnosticType.CodingError)
    const specType = this.getSpecType()
    if (!schema.getSpecDefinition(specType)?.isMetadataField(key)) {
      throw new TfError(`Non-metadata key '${key}' for type ${specType}`, TfDiagnosticType.CodingError)
    }
    return def.getFallbackValue()
  }

  isInert(ignoreChildren = false): boolean {
    return this.getLayer()._isInert(this.getPath().pathString, ignoreChildren, false)
  }
}

// _CanEditInfoOnSpec (spec.cpp:194-223).
function canEditInfoOnSpec(key: string, specType: SdfSpecType, schema: SdfSchema, editType: string): void {
  const fieldDef = schema.getFieldDefinition(key)
  if (!fieldDef) {
    throw new TfError(`Cannot ${editType} value for unknown field '${key}'`, TfDiagnosticType.CodingError)
  }
  if (fieldDef.isReadOnly()) {
    throw new TfError(`Cannot ${editType} value for read-only field '${key}'`, TfDiagnosticType.CodingError)
  }
  if (!schema.isValidFieldForSpec(key, specType)) {
    throw new TfError(`Field '${key}' is not valid for spec type ${specType}`, TfDiagnosticType.CodingError)
  }
}
