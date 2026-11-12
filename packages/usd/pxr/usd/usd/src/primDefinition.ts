// Ported from OpenUSD 26.11.1: pxr/usd/usd/primDefinition.cpp,
//  pxr/usd/usd/primDefinition.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdPrimDefinition — port of pxr/usd/usd/primDefinition.{h,cpp}.
//
// The built-in ("schematics") definition of a prim type: property names,
// fallback values, applied API schemas, spec fields — all read out of the
// owning plugin's generatedSchema.usda layer. Upstream a definition stores
// (layer, path) references into that layer rather than copying property
// specs (primDefinition.h:488 _LayerAndPath); the TS port keeps that model.
//

import { Layer, findValueTypeName, sdfCopySpec, ValueTypeName as SdfValueTypeName } from 'typescript-usd/sdf'
import { dictionaryLessThan, RaiseWarning } from 'typescript-usd/tf'
import type { Prim } from './prim.ts'
import { UsdSchemaRegistry } from './schemaRegistry.ts'
import { _sdfIsDictionary } from 'typescript-usd/sdf/_internal'

/** @internal Key for the (family, instanceName) pairs of the
 *  seenSchemaFamilyVersions maps (upstream's std::pair hash key). */
export function _familyAndInstanceKey(family: string, instanceName: string): string {
  return `${family}\u0000${instanceName}`
}

export type UsdSpecType = 'attribute' | 'relationship' | ''

/** SdfVariability as the metadata token strings our sdf layer data carries. */
export type UsdVariability = 'varying' | 'uniform'

// A (layer, path) reference into a schematics layer — upstream's
// UsdPrimDefinition::_LayerAndPath (primDefinition.h:488). Property specs are
// referenced, never copied.
interface PrimDefLayerAndPath {
  layer: Layer
  path: string
}

// Substrate bookkeeping keys the parser stores alongside real fields
// (parser.ts addSpec spreads the ValueRep map next to `form`/`fields`).
// These are never spec metadata.
const SUBSTRATE_STRUCTURAL_FIELDS = new Set(['form', 'fields'])

type InternalSpecType = 'prim' | 'attribute' | 'relationship'

// SdfLayer::GetSpecType, as prim, attribute or relationship.
function specTypeOf(lap: PrimDefLayerAndPath): InternalSpecType {
  if (lap.path.lastIndexOf('.') <= lap.path.lastIndexOf('/')) return 'prim'
  return lap.layer.getSpecType(lap.path) === 'relationship' ? 'relationship' : 'attribute'
}

// _LayerAndPath::HasField (primDefinition.h): SdfLayer::GetField, which
// includes the fallbacks of the spec type's required fields.
function getFieldSynthesized(lap: PrimDefLayerAndPath, field: string): unknown {
  return lap.layer.getField(lap.path, field)
}

function hasFieldSynthesized(lap: PrimDefLayerAndPath, field: string): boolean {
  return lap.layer.hasField(lap.path, field)
}

// Upstream Property::ListMetadataFields (primDefinition.cpp:891): the spec's
// fields (SdfLayer::ListFields) minus IsDisallowedField.
function listMetadataFieldsFor(lap: PrimDefLayerAndPath): string[] {
  const fields: string[] = []
  for (const f of lap.layer.listFields(lap.path)) {
    if (SUBSTRATE_STRUCTURAL_FIELDS.has(f)) continue
    if (UsdSchemaRegistry.isDisallowedField(f)) continue
    fields.push(f)
  }
  return fields
}

// A "dictionary" value for merge purposes (upstream VtValue.IsHolding
// <VtDictionary>). Parsed dictionaries are plain records; list ops carry the
// isExplicit discriminator and arrays are arrays — neither is a dictionary.
function isDictValue(v: unknown): v is Record<string, unknown> {
  return _sdfIsDictionary(v) && !('isExplicit' in v)
}

// VtDictionaryOverRecursive: strong wins; nested dictionaries merge
// recursively (vt/dictionary.cpp).
function dictOverRecursive(
  strong: Record<string, unknown>, weak: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...weak }
  for (const [k, v] of Object.entries(strong)) {
    const wv = out[k]
    out[k] = isDictValue(v) && isDictValue(wv) ? dictOverRecursive(v, wv) : v
  }
  return out
}

/** @internal Shared with the prim-metadata resolution in stage.ts (authored
 *  dicts compose recursively over schema-fallback dicts). */
export { isDictValue as _isDictValue, dictOverRecursive as _dictOverRecursive }

// Walks a ':'-delimited keyPath through nested dictionaries (upstream
// HasFieldDictKey semantics).
function dictKeyLookup(value: unknown, keyPath: string): unknown {
  let cur: unknown = value
  for (const key of keyPath.split(':')) {
    if (!isDictValue(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

/**
 * Mirrors UsdPrimDefinition::Property — an accessor handle to one built-in
 * property of a prim definition. Handles for properties that don't exist
 * (and default-constructed handles) are INVALID: isValid() is false,
 * isAttribute()/isRelationship() are false, getName() still answers with the
 * requested name, and every other accessor throws (upstream: undefined
 * behavior in C++, RuntimeError in python).
 */
export class UsdPrimDefinitionProperty {
  /** @internal */
  readonly _name: string
  /** @internal */
  readonly _lap: PrimDefLayerAndPath | null

  constructor(name = '', lap: PrimDefLayerAndPath | null = null) {
    this._name = name
    this._lap = lap
  }

  /** @internal Throws on invalid handles, as upstream's python bindings do. */
  protected _requireLap(): PrimDefLayerAndPath {
    if (!this._lap) {
      throw new Error(
        `UsdPrimDefinition.Property('${this._name}'): accessed data on an invalid property definition`)
    }
    return this._lap
  }

  /** Upstream `explicit operator bool()`. */
  isValid(): boolean {
    return this._lap !== null
  }

  /** The requested property name — answered even on invalid handles. */
  getName(): string {
    return this._name
  }

  isAttribute(): boolean {
    return this._lap !== null && specTypeOf(this._lap) === 'attribute'
  }

  isRelationship(): boolean {
    return this._lap !== null && specTypeOf(this._lap) === 'relationship'
  }

  getSpecType(): UsdSpecType {
    // Only reachable as 'prim' through internal (prim-metadata) handles,
    // which are never exposed publicly.
    return specTypeOf(this._requireLap()) as unknown as UsdSpecType
  }

  listMetadataFields(): string[] {
    return listMetadataFieldsFor(this._requireLap())
  }

  getMetadata(field: string): unknown {
    const lap = this._requireLap()
    if (UsdSchemaRegistry.isDisallowedField(field)) return undefined
    return getFieldSynthesized(lap, field)
  }

  getMetadataByDictKey(field: string, key: string): unknown {
    const lap = this._requireLap()
    if (UsdSchemaRegistry.isDisallowedField(field)) return undefined
    return dictKeyLookup(lap.layer.getField(lap.path, field), key)
  }

  getVariability(): UsdVariability {
    return getFieldSynthesized(this._requireLap(), 'variability') as UsdVariability
  }

  /** customData.userDocBrief, falling back to the documentation field
   *  (primDefinition.cpp:911 Property::GetDocumentation). */
  getDocumentation(): string {
    const lap = this._requireLap()
    const brief = dictKeyLookup(lap.layer.getField(lap.path, 'customData'), 'userDocBrief')
    if (typeof brief === 'string') return brief
    const doc = lap.layer.getField(lap.path, 'documentation')
    return typeof doc === 'string' ? doc : ''
  }
}

/** Mirrors UsdPrimDefinition::Attribute. */
export class UsdPrimDefinitionAttribute extends UsdPrimDefinitionProperty {
  getTypeName(): SdfValueTypeName {
    return findValueTypeName(this.getTypeNameToken()) as SdfValueTypeName
  }

  getTypeNameToken(): string {
    const lap = this._requireLap()
    const v = lap.layer.getField(lap.path, 'typeName')
    return typeof v === 'string' ? v : ''
  }

  getFallbackValue(): unknown {
    const lap = this._requireLap()
    return lap.layer.getField(lap.path, 'default')
  }
}

/** Mirrors UsdPrimDefinition::Relationship. */
export class UsdPrimDefinitionRelationship extends UsdPrimDefinitionProperty {}

export class UsdPrimDefinition {
  // ---- Internal state (mirrors primDefinition.h:618-638). Only the
  // UsdSchemaRegistry constructs and populates definitions. -----------------

  /** @internal Path to this definition's prim in the schematics. */
  _primLap: PrimDefLayerAndPath | null = null
  /** @internal Property name → (layer, path); '' maps prim metadata. */
  _propMap = new Map<string, PrimDefLayerAndPath>()
  /** @internal */
  _appliedAPISchemas: string[] = []
  /** @internal */
  _properties: string[] = []
  /** @internal */
  _locallyDefinedPropertyNames: string[] = []
  /** @internal Lazily created layer holding composed property specs. */
  _composedPropertyLayer: Layer | null = null

  /** All built-in property names (propertyOrder-sorted, as upstream). */
  getPropertyNames(): string[] {
    return [...this._properties]
  }

  /** Only the property names defined directly in this schema's own class spec
   *  (not composed in from built-in API schemas). Mirrors
   *  GetLocallyDefinedPropertyNames (primDefinition.h). */
  getLocallyDefinedPropertyNames(): string[] {
    return [...this._locallyDefinedPropertyNames]
  }

  /** The composed applied API schemas (built-in + auto-applied [+ authored,
   *  for composed definitions from buildComposedPrimDefinition]). */
  getAppliedAPISchemas(): string[] {
    return [...this._appliedAPISchemas]
  }

  /** Spec type of a built-in property, '' if not built-in. */
  getSpecType(propName: string): UsdSpecType {
    const prop = this.getPropertyDefinition(propName)
    return prop.isValid() ? prop.getSpecType() : ''
  }

  hasProperty(propName: string): boolean {
    return propName !== '' && this._propMap.has(propName)
  }

  /** The fallback (default) value of a built-in attribute, undefined if the
   *  attribute has none or isn't built-in. Mirrors GetAttributeFallbackValue. */
  getAttributeFallbackValue(attrName: string): unknown {
    const lap = this._propMap.get(attrName)
    if (!lap || attrName === '') return undefined
    return lap.layer.getField(lap.path, 'default')
  }

  /** Schema-level metadata field on the prim definition itself (propName
   *  omitted) or on a built-in property. Fields on
   *  UsdSchemaRegistry.isDisallowedField never appear. Mirrors GetMetadata /
   *  GetPropertyMetadata. */
  getMetadataField(field: string, propName?: string): unknown {
    if (UsdSchemaRegistry.isDisallowedField(field)) return undefined
    if (propName === undefined) {
      const lap = this._propMap.get('')
      return lap ? getFieldSynthesized(lap, field) : undefined
    }
    const prop = this.getPropertyDefinition(propName)
    return prop.isValid() ? prop.getMetadata(field) : undefined
  }

  /** @internal Usd_GetFallbackValue (primDefinition.h:473-479), used by
   * stage.cpp:6365-6411 independently of public IsDisallowedField filtering. */
  _getFallbackValue(field: string, propName = ''): unknown {
    const lap = this._propMap.get(propName)
    return lap ? getFieldSynthesized(lap, field) : undefined
  }

  listMetadataFields(propName?: string): string[] {
    if (propName === undefined) {
      // Prim metadata is stored as the empty-named entry, which
      // getPropertyDefinition never exposes (primDefinition.cpp:178).
      const lap = this._propMap.get('')
      return lap ? listMetadataFieldsFor(lap) : []
    }
    const prop = this.getPropertyDefinition(propName)
    return prop.isValid() ? prop.listMetadataFields() : []
  }

  getDocumentation(): string {
    // Pure API schemas don't map '' (no metadata fallbacks), so documentation
    // reads the prim spec directly (primDefinition.cpp:148).
    if (!this._primLap) return ''
    return new UsdPrimDefinitionProperty('', this._primLap).getDocumentation()
  }

  getPropertyDocumentation(propName: string): string {
    const prop = this.getPropertyDefinition(propName)
    return prop.isValid() ? prop.getDocumentation() : ''
  }

  // ---- Property-definition accessor handles (upstream nested classes) ------

  /** Upstream nested-class names, e.g. `new UsdPrimDefinition.Property()`. */
  static Property = UsdPrimDefinitionProperty
  static Attribute = UsdPrimDefinitionAttribute
  static Relationship = UsdPrimDefinitionRelationship

  /** Accessor for a built-in property; INVALID (but named) if absent.
   *  Mirrors GetPropertyDefinition. */
  getPropertyDefinition(propName: string): UsdPrimDefinitionProperty {
    // The empty-named prim-metadata mapping never leaks (primDefinition.cpp:121).
    if (propName === '') return new UsdPrimDefinitionProperty('')
    return new UsdPrimDefinitionProperty(propName, this._propMap.get(propName) ?? null)
  }

  /** Mirrors GetAttributeDefinition — invalid if absent OR not an attribute. */
  getAttributeDefinition(attrName: string): UsdPrimDefinitionAttribute {
    const lap = attrName === '' ? null : this._propMap.get(attrName) ?? null
    // Upstream Attribute's operator bool is IsAttribute(); a handle over a
    // relationship spec converts to invalid.
    return new UsdPrimDefinitionAttribute(
      attrName, lap && specTypeOf(lap) === 'attribute' ? lap : null)
  }

  /** Mirrors GetRelationshipDefinition — invalid if absent OR not a rel. */
  getRelationshipDefinition(relName: string): UsdPrimDefinitionRelationship {
    const lap = relName === '' ? null : this._propMap.get(relName) ?? null
    return new UsdPrimDefinitionRelationship(
      relName, lap && specTypeOf(lap) === 'relationship' ? lap : null)
  }

  /** Query one key of a dictionary-valued metadata field on the prim
   *  definition itself (propName omitted) or a built-in property. Mirrors
   *  GetMetadataByDictKey / GetPropertyMetadataByDictKey. */
  getMetadataByDictKey(field: string, key: string, propName?: string): unknown {
    if (UsdSchemaRegistry.isDisallowedField(field)) return undefined
    const lap = propName === undefined
      ? this._propMap.get('')
      : propName !== '' ? this._propMap.get(propName) : undefined
    if (!lap) return undefined
    return dictKeyLookup(lap.layer.getField(lap.path, field), key)
  }

  /** Author this definition's prim + property specs onto a layer/prim.
   *  Mirrors the three upstream FlattenTo overloads. `newSpecSpecifier`
   *  applies only to newly created prim specs (default 'over'). */
  flattenTo(layer: Layer, path: string, newSpecSpecifier?: 'def' | 'over'): boolean
  flattenTo(parent: Prim, name?: string): Prim | null
  flattenTo(layerOrParent: Layer | Prim, pathOrName?: string, newSpecSpecifier?: 'def' | 'over'): boolean | Prim | null {
    if (layerOrParent instanceof Layer) {
      return this._flattenToLayer(layerOrParent, pathOrName ?? '', newSpecSpecifier ?? 'over')
    }
    return this._flattenToPrim(layerOrParent, pathOrName)
  }

  // Port of FlattenTo(SdfLayerHandle, SdfPath, SdfSpecifier)
  // (primDefinition.cpp:767).
  private _flattenToLayer(layer: Layer, path: string, newSpecSpecifier: 'def' | 'over'): boolean {
    if (!path.startsWith('/') || path === '/') return false

    const specPaths = new Set(layer.getSpecPaths())
    if (specPaths.has(path)) {
      // Existing target: clear property specs and all schema-allowed metadata.
      // Disallowed fields (specifier, children lists, composition arcs, …)
      // survive — upstream clears via SetProperties({}) + ClearInfo of
      // non-disallowed keys only.
      layer.getPrimAtPath(path)!.setProperties([])
      for (const f of [...layer.getFieldNames(path)]) {
        if (SUBSTRATE_STRUCTURAL_FIELDS.has(f)) continue
        if (!UsdSchemaRegistry.isDisallowedField(f)) layer.eraseField(path, f)
      }
    } else {
      // New target: ancestors are always created as OVERS; only the target
      // spec itself takes newSpecSpecifier (SdfCreatePrimInLayer semantics).
      const parts = path.split('/').filter(Boolean)
      for (let i = 0; i < parts.length; i++) {
        const specPath = '/' + parts.slice(0, i + 1).join('/')
        const parentPath = i === 0 ? '/' : '/' + parts.slice(0, i).join('/')
        const isTarget = i === parts.length - 1
        if (!layer.getSpecPaths().includes(specPath)) {
          layer.setField(specPath, 'specifier', isTarget ? newSpecSpecifier : 'over')
        }
        const siblings = (layer.getField(parentPath, 'primChildren') as string[] | undefined) ?? []
        if (!siblings.includes(parts[i]!)) {
          layer.setField(parentPath, 'primChildren', [...siblings, parts[i]!])
        }
      }
    }

    // Copy all properties (primDefinition.cpp:798-815).
    for (const propName of this._properties) {
      const lap = this._propMap.get(propName)
      if (!lap) continue
      if (!sdfCopySpec(lap.layer, lap.path, layer, `${path}.${propName}`)) {
        RaiseWarning(`Failed to copy prim definition property '${propName}' to prim ` +
          `spec at path '${path}' in layer '${layer.identifier}'.`)
      }
    }

    // Copy prim metadata.
    for (const field of this.listMetadataFields()) {
      const v = this.getMetadataField(field)
      if (v !== undefined) layer.setField(path, field, v)
    }

    // apiSchemas is always explicitly the full applied list
    // (primDefinition.cpp:828 — SdfTokenListOp::CreateExplicit).
    layer.setField(path, 'apiSchemas', {
      isExplicit: true,
      explicitItems: [...this._appliedAPISchemas],
      deletedItems: [],
      prependedItems: [],
      appendedItems: [],
      orderedItems: [],
    })

    // Documentation is set explicitly — GetMetadata doesn't surface it for
    // API schema definitions (primDefinition.cpp:834).
    const doc = this.getDocumentation()
    if (doc !== '') layer.setField(path, 'documentation', doc)
    else layer.eraseField(path, 'documentation')

    return true
  }

  // Port of the Prim FlattenTo overloads (primDefinition.cpp:839-865).
  // The parent/prim handle exposes its stage (Prim.getStage / a
  // Stage.getPrim read handle); the returned handle is valid immediately —
  // its composed content appears after the coalesced recompose
  // (await stage.flushChanges()), per the async web-USD model.
  private _flattenToPrim(parentOrPrim: Prim, name?: string): Prim | null {
    let parentPath: string
    let childName: string
    if (name !== undefined) {
      parentPath = parentOrPrim.path
      childName = name
    } else {
      const p = parentOrPrim.path
      const slash = p.lastIndexOf('/')
      parentPath = slash <= 0 ? '/' : p.slice(0, slash)
      childName = p.slice(slash + 1)
    }
    const primPath = parentPath === '/' ? `/${childName}` : `${parentPath}/${childName}`

    const stage = (parentOrPrim as unknown as {
      getStage: () => {
        getEditTarget(): { getLayer(): Layer | undefined }
        _primHandle(path: string): Prim
      }
    }).getStage()

    if (!this._flattenToLayer(stage.getEditTarget().getLayer()!, primPath, 'over')) return null
    return stage._primHandle(primPath)
  }

  // ---- Internal construction/composition (upstream private, friended to
  // UsdSchemaRegistry) --------------------------------------------------------

  /** @internal Copy for BuildComposedPrimDefinition (upstream's private copy
   *  ctor — maps/lists copied, layer references shared). */
  _copy(): UsdPrimDefinition {
    const out = new UsdPrimDefinition()
    out._primLap = this._primLap
    out._propMap = new Map(this._propMap)
    out._appliedAPISchemas = [...this._appliedAPISchemas]
    out._properties = [...this._properties]
    out._locallyDefinedPropertyNames = [...this._locallyDefinedPropertyNames]
    out._composedPropertyLayer = this._composedPropertyLayer
    return out
  }

  /** @internal Replaces the definition state while preserving object identity.
   *  The browser plugin-discovery adaptation rebuilds the same complete set
   *  that _SchemaDefInitHelper builds during native singleton construction
   *  (schemaRegistry.cpp:992-1019). */
  _replaceWith(source: UsdPrimDefinition): void {
    this._primLap = source._primLap
    this._propMap = new Map(source._propMap)
    this._appliedAPISchemas = [...source._appliedAPISchemas]
    this._properties = [...source._properties]
    this._locallyDefinedPropertyNames = [...source._locallyDefinedPropertyNames]
    this._composedPropertyLayer = source._composedPropertyLayer
  }

  /** @internal Mirrors _InitializeForTypedSchema (primDefinition.cpp:24). */
  _initializeForTypedSchema(
    schematicsLayer: Layer, schematicsPrimPath: string, propertiesToIgnore: readonly string[],
  ): void {
    this._primLap = { layer: schematicsLayer, path: schematicsPrimPath }
    if (this._mapSchematicsPropertyPaths(propertiesToIgnore)) {
      // Typed schemas provide prim-level metadata: the empty property name
      // maps to the prim path (primDefinition.cpp:39).
      this._propMap.set('', this._primLap)
    }
    this._applyPropertyOrder()
  }

  /** @internal Mirrors _InitializeForAPISchema (primDefinition.cpp:46). */
  _initializeForAPISchema(
    apiSchemaName: string, schematicsLayer: Layer, schematicsPrimPath: string,
    propertiesToIgnore: readonly string[],
  ): void {
    // The API schema itself is always the first applied API schema in its
    // own prim definition.
    this._appliedAPISchemas = [apiSchemaName]
    this._primLap = { layer: schematicsLayer, path: schematicsPrimPath }
    const [, instance] = UsdSchemaRegistry.getTypeNameAndInstance(apiSchemaName)
    // Only single apply API schemas provide prim metadata.
    if (this._mapSchematicsPropertyPaths(propertiesToIgnore) && instance === '') {
      this._propMap.set('', this._primLap)
    }
    this._applyPropertyOrder()
  }

  // Mirrors _MapSchematicsPropertyPaths (primDefinition.cpp:189).
  private _mapSchematicsPropertyPaths(propertiesToIgnore: readonly string[]): boolean {
    const lap = this._primLap!
    const specPropertyNames = lap.layer.getField(lap.path, 'properties') as string[] | undefined
    if (!specPropertyNames) {
      // A spec with no properties is fine; a missing spec is not (upstream
      // warns and skips the prim-metadata mapping).
      return lap.layer.getSpecPaths().includes(lap.path)
    }
    for (const propName of specPropertyNames) {
      if (propertiesToIgnore.includes(propName)) continue
      if (this._propMap.has(propName)) continue
      this._propMap.set(propName, { layer: lap.layer, path: `${lap.path}.${propName}` })
      this._properties.push(propName)
    }
    return true
  }

  // Mirrors _ApplyPropertyOrder (primDefinition.cpp:17 → UsdPrim::
  // ApplyPropertyOrder): names in the propertyOrder metadata move to the
  // front in that order; the rest keep their relative order.
  private _applyPropertyOrder(): void {
    const order = this.getMetadataField('propertyOrder') as string[] | undefined
    if (!Array.isArray(order) || order.length === 0) return
    const present = new Set(this._properties)
    const ordered: string[] = []
    const taken = new Set<string>()
    for (const name of order) {
      if (present.has(name) && !taken.has(name)) {
        ordered.push(name)
        taken.add(name)
      }
    }
    if (ordered.length === 0) return
    this._properties = [...ordered, ...this._properties.filter((n) => !taken.has(n))]
  }

  // Mirrors _ComposePropertiesFromPrimDef (primDefinition.cpp:325).
  private _composePropertiesFromPrimDef(weakerPrimDef: UsdPrimDefinition): void {
    for (const [propName, lap] of weakerPrimDef._propMap) {
      this._addOrComposeProperty(propName, lap)
    }
    this._sortAndOrderProperties()
  }

  // Mirrors _ComposePropertiesFromPrimDefInstance (primDefinition.cpp:342).
  private _composePropertiesFromPrimDefInstance(
    weakerPrimDef: UsdPrimDefinition, instanceName: string,
  ): void {
    for (const [propName, lap] of weakerPrimDef._propMap) {
      const instancedPropName = UsdSchemaRegistry.makeMultipleApplyNameInstance(propName, instanceName)
      this._addOrComposeProperty(instancedPropName, lap)
    }
    this._sortAndOrderProperties()
  }

  private _sortAndOrderProperties(): void {
    // Upstream re-sorts in TfDictionaryLessThan order after composition, then
    // re-applies propertyOrder (primDefinition.cpp:337-339).
    this._properties.sort((a, b) => (dictionaryLessThan(a, b) ? -1 : dictionaryLessThan(b, a) ? 1 : 0))
    this._applyPropertyOrder()
  }

  // Mirrors _AddOrComposeProperty (primDefinition.cpp:364).
  private _addOrComposeProperty(propName: string, lap: PrimDefLayerAndPath): void {
    // Prim metadata special case: a weaker definition's prim metadata seeds a
    // composed prim spec (only merge-allowed fields land there).
    if (propName === '' && !this._propMap.has('')) {
      const composed = this._createComposedPrimOrPropertyIfNeeded('', null, lap)
      if (composed) this._propMap.set('', composed)
      return
    }

    const existing = this._propMap.get(propName)
    if (existing === undefined) {
      this._propMap.set(propName, lap)
      if (propName !== '') this._properties.push(propName)
      return
    }
    const composed = this._createComposedPrimOrPropertyIfNeeded(propName, existing, lap)
    if (composed) this._propMap.set(propName, composed)
  }

  // Mirrors _FindOrCreateSpecForComposition (primDefinition.cpp:413).
  private _findOrCreateSpecForComposition(
    propName: string, srcLap: PrimDefLayerAndPath | null,
  ): PrimDefLayerAndPath | null {
    const primPath = '/ComposedProperties'
    const specPath = propName === '' ? primPath : `${primPath}.${propName}`

    if (this._composedPropertyLayer) {
      if (propName !== '' && this._composedPropertyLayer.getSpecPaths().includes(specPath)) {
        return { layer: this._composedPropertyLayer, path: specPath }
      }
    } else {
      this._composedPropertyLayer = Layer.createAnonymous('anon:schema-composed-properties')
    }
    const layer = this._composedPropertyLayer

    // Find or create the prim spec that holds the composed property specs.
    if (!layer.getSpecPaths().includes(primPath)) {
      layer.setField(primPath, 'specifier', 'def')
    }

    // Invalid src: blank-slate prim spec for prim metadata composition.
    if (!srcLap) return { layer, path: propName === '' ? primPath : specPath }

    // Copy of the source spec: the spec-defining fields plus every allowed
    // metadata field. Upstream's copy loop applies to prim specs too — the
    // strong definition's prim metadata seeds the composed prim spec
    // (primDefinition.cpp:461-489: destSpec = destPrim for SdfSpecTypePrim,
    // then ListMetadataFields are copied for every spec kind).
    const srcType = specTypeOf(srcLap)
    const destPath = srcType === 'prim' ? primPath : specPath
    const variability = String(getFieldSynthesized(srcLap, 'variability') ?? 'varying')
    if (srcType === 'attribute') {
      // SdfAttributeSpec::New(destPrim, propName, typeName, variability).
      const typeName = srcLap.layer.getField(srcLap.path, 'typeName') as string | undefined
      layer._createPropertySpec(primPath, propName, 'attribute',
        { ...(typeName ? { typeName } : {}), custom: false, variability })
    } else if (srcType === 'relationship') {
      // SdfRelationshipSpec::New(destPrim, propName, variability): the
      // variability argument binds to New's `custom` parameter.
      layer._createPropertySpec(primPath, propName, 'relationship',
        { custom: variability === 'uniform', variability: 'uniform' })
    }
    for (const field of listMetadataFieldsFor(srcLap)) {
      const v = getFieldSynthesized(srcLap, field)
      if (v !== undefined) layer.setField(destPath, field, v)
    }
    return { layer, path: destPath }
  }

  // Mirrors _CreateComposedPrimOrPropertyIfNeeded (primDefinition.cpp:512).
  private _createComposedPrimOrPropertyIfNeeded(
    propName: string, strongLap: PrimDefLayerAndPath | null, weakLap: PrimDefLayerAndPath,
  ): PrimDefLayerAndPath | null {
    if (strongLap && !UsdPrimDefinition._propertyTypesMatch(strongLap, weakLap)) return null

    // Fields never composed in from a weaker definition
    // (_GetDisallowedComposeFromWeakerFields, primDefinition.cpp:495).
    const blockedFields = specTypeOf(weakLap) === 'prim'
      ? ['documentation']
      : ['custom', 'documentation']

    let destLap: PrimDefLayerAndPath | null = null
    for (const field of listMetadataFieldsFor(weakLap)) {
      let mergeValue = getFieldSynthesized(weakLap, field)
      const allowedMerge = field === 'propertyOrder' || isDictValue(mergeValue)
      if (!allowedMerge) {
        // The stronger property already has the field — its opinion wins.
        if (strongLap && hasFieldSynthesized(strongLap, field)) continue
      }
      if (blockedFields.includes(field)) continue

      if (strongLap && allowedMerge) {
        const strongValue = getFieldSynthesized(strongLap, field)
        if (strongValue !== undefined) {
          if (Array.isArray(strongValue) && Array.isArray(mergeValue)) {
            // propertyOrder: weaker entries append after the stronger ones,
            // skipping duplicates.
            const merged = [...(strongValue as string[])]
            const seen = new Set(merged)
            for (const item of mergeValue as string[]) {
              if (!seen.has(item)) {
                seen.add(item)
                merged.push(item)
              }
            }
            mergeValue = merged
          } else if (isDictValue(strongValue) && isDictValue(mergeValue)) {
            mergeValue = dictOverRecursive(strongValue, mergeValue)
          }
        }
      }

      if (!destLap) {
        destLap = this._findOrCreateSpecForComposition(propName, strongLap)
        if (!destLap) return null
      }
      destLap.layer.setField(destLap.path, field, mergeValue)
    }
    return destLap
  }

  // Mirrors _PropertyTypesMatch (primDefinition.cpp:251).
  private static _propertyTypesMatch(strong: PrimDefLayerAndPath, weak: PrimDefLayerAndPath): boolean {
    const strongType = specTypeOf(strong)
    const weakType = specTypeOf(weak)
    if (strongType === 'prim' || weakType === 'prim') return strongType === weakType
    if (strongType !== weakType) return false
    if (strongType === 'attribute') {
      return strong.layer.getField(strong.path, 'typeName') === weak.layer.getField(weak.path, 'typeName')
    }
    return true
  }

  /** @internal Mirrors _ComposeOverAndReplaceExistingProperty
   *  (primDefinition.cpp:594): API-schema override properties compose OVER
   *  the defined property, then replace its (layer, path). */
  _composeOverAndReplaceExistingProperty(
    propName: string, overLayer: Layer, overPrimPath: string,
  ): void {
    const defLap = this._propMap.get(propName)
    if (!defLap) return

    const overLap: PrimDefLayerAndPath = { layer: overLayer, path: `${overPrimPath}.${propName}` }
    if (!overLayer.getSpecPaths().includes(overLap.path)) return
    if (!UsdPrimDefinition._propertyTypesMatch(overLap, defLap)) return

    // Fields authored on the override spec are stronger; fill in the rest
    // from the defined property.
    for (const srcField of listMetadataFieldsFor(defLap)) {
      if (overLap.layer.getField(overLap.path, srcField) !== undefined) continue
      const v = getFieldSynthesized(defLap, srcField)
      if (v !== undefined) overLayer.setField(overLap.path, srcField, v)
    }
    // Exception: an override cannot change the defined property's variability.
    const defVariability = getFieldSynthesized(defLap, 'variability')
    if (getFieldSynthesized(overLap, 'variability') !== defVariability) {
      overLayer.setField(overLap.path, 'variability', defVariability)
    }

    this._propMap.set(propName, overLap)
  }

  /** @internal Mirrors _ComposeWeakerAPIPrimDefinition (primDefinition.cpp:647):
   *  appends the API schema def's applied list (instanced if needed) with the
   *  seenSchemaFamilyVersions one-version-per-family guard — a conflict skips
   *  the WHOLE schema (with undo of partial adds) — then composes properties. */
  _composeWeakerAPIPrimDefinition(
    apiPrimDef: UsdPrimDefinition,
    instanceName: string,
    alreadyAppliedSchemaFamilyVersions: Map<string, number>,
  ): boolean {
    const appendSchemas = (apiSchemaNamesToAppend: readonly string[]): boolean => {
      const startingNumAppliedSchemas = this._appliedAPISchemas.length
      const newlyAddedFamilies: string[] = []
      for (const apiSchemaName of apiSchemaNamesToAppend) {
        const [identifier, instance] = UsdSchemaRegistry.getTypeNameAndInstance(apiSchemaName)
        const schemaInfo = UsdSchemaRegistry.findSchemaInfo(identifier)
        if (!schemaInfo) continue
        const key = _familyAndInstanceKey(schemaInfo.family, instance)
        const existingVersion = alreadyAppliedSchemaFamilyVersions.get(key)
        if (existingVersion === undefined) {
          alreadyAppliedSchemaFamilyVersions.set(key, schemaInfo.version)
          this._appliedAPISchemas.push(apiSchemaName)
          newlyAddedFamilies.push(key)
        } else if (existingVersion !== schemaInfo.version) {
          // Version conflict: none of this schema's included schemas apply.
          this._appliedAPISchemas.length = startingNumAppliedSchemas
          for (const k of newlyAddedFamilies) alreadyAppliedSchemaFamilyVersions.delete(k)
          return false
        }
      }
      return true
    }

    const apiSchemaNamesToAppend = apiPrimDef._appliedAPISchemas
    if (instanceName === '') {
      if (!appendSchemas(apiSchemaNamesToAppend)) return false
      this._composePropertiesFromPrimDef(apiPrimDef)
    } else {
      const instancedNames = apiSchemaNamesToAppend.map((n) =>
        UsdSchemaRegistry.makeMultipleApplyNameInstance(n, instanceName))
      if (!appendSchemas(instancedNames)) return false
      this._composePropertiesFromPrimDefInstance(apiPrimDef, instanceName)
    }
    return true
  }
}
