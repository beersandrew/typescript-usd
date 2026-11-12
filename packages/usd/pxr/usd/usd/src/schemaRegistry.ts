// Ported from OpenUSD 26.11.1: pxr/usd/usd/schemaRegistry.cpp,
//  pxr/usd/usd/schemaRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdSchemaRegistry — port of pxr/usd/usd/schemaRegistry.{h,cpp}.
//
// Singleton mapping schema identifiers ⇄ TfTypes ⇄ prim definitions. Inputs
// are plugin metadata (typescript-usd/plug Info.Types: bases/alias/schemaIdentifier/
// schemaKind + apply-info) and each plugin's generatedSchema.usda — never
// code: codeless schemas are the base case, exactly as upstream
// (schemaRegistry.cpp loads no libraries). Browser modules can arrive after
// singleton construction, so each Plug registration notice rebuilds the one
// canonical registry from the complete discovered plugin set. This is the
// narrow discovery-lifecycle adaptation of schemaRegistry.cpp:992-1019.

import {
  Type as TfType, TfEnvSetting, TfGetEnvSetting, dictionaryLessThan, isValidIdentifier,
} from 'typescript-usd/tf'
import { AssetPath as SdfAssetPath, Layer, sdfApplyListOpToVector, sdfNormalizeListOp } from 'typescript-usd/sdf'
import { Registry as PlugRegistry, Plugin as PlugPlugin } from 'typescript-usd/plug'
import {
  _sdfGetDictionaryValueTypes,
  _sdfGetMetadataFieldType,
  _sdfIsDictionary,
  _sdfRecordDictionaryValueTypes,
  _sdfRegisterPluginFields,
  _sdfTransformMetadataValue,
  type SdfMetadataSpecType,
} from 'typescript-usd/sdf/_internal'
import { UsdPrimDefinition, _familyAndInstanceKey } from './primDefinition.ts'
import { Array as VtArray } from 'typescript-usd/vt'

// schemaRegistry.cpp:58-60.
const USD_DISABLE_AUTO_APPLY_API_SCHEMAS = new TfEnvSetting(
  'USD_DISABLE_AUTO_APPLY_API_SCHEMAS', false,
  'Set to true to disable the application of all auto-apply API schemas.')

/** Mirrors UsdSchemaKind (usd/common.h), as the plugInfo metadata strings. */
export type UsdSchemaKind =
  | 'invalid'
  | 'abstractBase'
  | 'abstractTyped'
  | 'concreteTyped'
  | 'nonAppliedAPI'
  | 'singleApplyAPI'
  | 'multipleApplyAPI'

export type UsdSchemaVersion = number

/** Mirrors UsdSchemaRegistry::SchemaInfo. */
export interface UsdSchemaInfo {
  readonly identifier: string
  readonly type: TfType
  readonly family: string
  readonly version: UsdSchemaVersion
  readonly kind: UsdSchemaKind
}

/** Mirrors UsdSchemaRegistry::VersionPolicy. */
export type UsdSchemaVersionPolicy =
  | 'all'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'

// ---------------------------------------------------------------------------
// Pure identifier/name-template helpers (registry-free statics).
// ---------------------------------------------------------------------------

const INSTANCE_NAME_PLACEHOLDER = '__INSTANCE_NAME__'

// Search from the end for an underscore followed ONLY by digits — the start
// of the version suffix (schemaRegistry.cpp:340 _FindVersionDelimiter).
// Returns -1 when there is no version suffix.
function findVersionDelimiter(idString: string): number {
  if (idString.length < 2) return -1
  let i = idString.length - 1
  if (!/[0-9]/.test(idString[i]!)) return -1
  while (--i >= 0) {
    if (idString[i] === '_') return i
    if (!/[0-9]/.test(idString[i]!)) return -1
  }
  return -1
}

// SdfPath::JoinIdentifier — join non-empty parts with the namespace delimiter.
function joinIdentifier(lhs: string, rhs: string): string {
  if (lhs === '') return rhs
  if (rhs === '') return lhs
  return `${lhs}:${rhs}`
}

// First occurrence of the placeholder fully contained between namespace
// delimiters (schemaRegistry.cpp:702 _FindInstanceNamePlaceholder), or -1.
function findInstanceNamePlaceholder(nameTemplate: string): number {
  let substrStart = 0
  while (substrStart < nameTemplate.length) {
    let substrEnd = nameTemplate.indexOf(':', substrStart)
    if (substrEnd === -1) substrEnd = nameTemplate.length
    if (
      substrEnd - substrStart === INSTANCE_NAME_PLACEHOLDER.length &&
      nameTemplate.startsWith(INSTANCE_NAME_PLACEHOLDER, substrStart)
    ) {
      return substrStart
    }
    substrStart = substrEnd + 1
  }
  return -1
}

const SCHEMA_KINDS: ReadonlySet<string> = new Set([
  'abstractBase', 'abstractTyped', 'concreteTyped',
  'nonAppliedAPI', 'singleApplyAPI', 'multipleApplyAPI',
])

// _GetSchemaKindFromMetadata (schemaRegistry.cpp:109). An unknown kind
// string is a coding error upstream; both collapse to 'invalid'.
function schemaKindFromMetadata(dict: Record<string, unknown>): UsdSchemaKind {
  const kind = dict['schemaKind']
  return typeof kind === 'string' && SCHEMA_KINDS.has(kind) ? (kind as UsdSchemaKind) : 'invalid'
}

// _GetNameListFromMetadata (schemaRegistry.cpp:818).
function nameListFromMetadata(dict: Record<string, unknown>, key: string): string[] {
  const v = dict[key]
  if (!Array.isArray(v)) return []
  return v.filter((s): s is string => typeof s === 'string')
}

// Plugin-defined metadata fields. Plug owns discovery and Sdf owns field
// registration and value typing (SdfSchemaBase::_RegisterPluginFields,
// sdf/schema.cpp:1031-1046), which registers the plugins once and then each
// later registration as it is announced.
function syncMetadataPlugins(): void {
  _sdfRegisterPluginFields()
}

/** The registered value type name of a plugin metadata field. */
export function usdGetMetadataFieldType(
  fieldName: string, specType: SdfMetadataSpecType,
): string | undefined {
  syncMetadataPlugins()
  return _sdfGetMetadataFieldType(fieldName, specType)
}

/** A metadata value with its time-valued parts mapped. */
export function usdTransformMetadataValue(
  value: unknown, fieldName: string, specType: SdfMetadataSpecType,
  transformTime: (time: number) => number, durationScale?: number,
): unknown {
  return _sdfTransformMetadataValue(
    value, usdGetMetadataFieldType(fieldName, specType), transformTime, durationScale)
}

// The asset-path part of the field-to-stage value transform
// (_AssetPathToStage, usd/stage.cpp:583-610, registered at 711): an asset
// read from a layer is an SdfAssetPath, including inside dictionaries,
// where the text and crate readers keep the authored path string beside its
// recorded 'asset' value type. Values authored in memory are SdfAssetPath
// already. The resolution step of _AssetPathToStage (SdfResolveAssetPaths)
// is not applied here: Ar resolution is asynchronous, so the returned asset
// paths carry no resolved path.
export function usdAssetPathsToStage(value: unknown, typeName: string | undefined): unknown {
  if (typeName === 'asset') return typeof value === 'string' ? new SdfAssetPath(value) : value
  if (typeName === 'asset[]') {
    const toAsset = (item: unknown) => typeof item === 'string' ? new SdfAssetPath(item) : item
    if (value instanceof VtArray) return new VtArray(value.toArray().map(toAsset), value.getElementType())
    return Array.isArray(value) ? value.map(toAsset) : value
  }
  if (!_sdfIsDictionary(value)) return value
  const types = _sdfGetDictionaryValueTypes(value)
  if (!types) return value
  let changed = false
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemType = types.get(key)
    result[key] = usdAssetPathsToStage(item, itemType === undefined && _sdfIsDictionary(item) ? 'dictionary' : itemType)
    if (result[key] !== item) changed = true
  }
  if (!changed) return value
  _sdfRecordDictionaryValueTypes(result, types)
  return result
}

// Fields that may never provide schema fallback values — exact port of the
// IsDisallowedField list (schemaRegistry.cpp:1781), spelled in our layer
// field names. SdfChildrenKeys->allTokens and UsdGetClipRelatedFields()
// are expanded inline.
const DISALLOWED_FIELDS: ReadonlySet<string> = new Set([
  // Composition arc fields.
  'inheritPaths', 'payload', 'references', 'specializes',
  'variantSelection', 'variantSetNames',
  // usdGenSchema bookkeeping.
  'customData',
  // Never used in scenegraph population / value resolution.
  'active', 'instanceable', 'timeSamples', 'spline',
  'connectionPaths', 'targetPaths',
  // Meaningless as a fallback.
  'specifier',
  // Children fields (SdfChildrenKeys->allTokens).
  'connectionChildren', 'expressionChildren', 'mapperArgChildren',
  'mapperChildren', 'primChildren', 'properties', 'targetChildren',
  'variantChildren', 'variantSetChildren',
  // Clip-related fields (UsdGetClipRelatedFields — usd/clip.cpp).
  'clips', 'clipSets',
  // Prim composition intentionally ignores the kind fallback.
  'kind',
])

// Apply a single authored apiSchemas list op to an empty list — explicit
// items, or prepended followed by appended (SdfTokenListOp::ApplyOperations
// on an empty operand).
function applyListOpToEmpty(op: unknown): string[] {
  const normalized = sdfNormalizeListOp<string>(op)
  return normalized ? sdfApplyListOpToVector([], normalized) : []
}

// Usd_SortAutoAppliedAPISchemas (schemaRegistry.cpp:968): reverse dictionary
// order, so later versions of a family are stronger than earlier ones.
function sortAutoAppliedAPISchemas(names: string[]): void {
  if (names.length < 2) return
  names.sort((a, b) => (dictionaryLessThan(b, a) ? -1 : dictionaryLessThan(a, b) ? 1 : 0))
}

// apiSchemaOverridePropertyNames from the schematics prim's customData
// (schemaRegistry.cpp:1229 _GetOverridePropertyNames).
function getOverridePropertyNames(layer: Layer, primPath: string): string[] {
  const customData = layer.getField(primPath, 'customData')
  if (typeof customData !== 'object' || customData === null) return []
  const names = (customData as Record<string, unknown>)['apiSchemaOverridePropertyNames']
  const list = names instanceof VtArray ? names.toArray() : names
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : []
}

interface ApiSchemaDefinitionInfo {
  primDef: UsdPrimDefinition
  applyExpectsInstanceName: boolean
}

// Build-status states of _APISchemaPrimDefBuilder (schemaRegistry.cpp:1053).
type BuildStatus = typeof BuildStatus[keyof typeof BuildStatus]
const BuildStatus = { NotBuilding: 0, Building: 1, Complete: 2 } as const

// Per-batch builder for one applied API schema prim definition
// (schemaRegistry.cpp:1034 _APISchemaPrimDefBuilder).
interface ApiDefBuilder {
  info: UsdSchemaInfo
  layer: Layer
  primDef: UsdPrimDefinition | null
  buildStatus: BuildStatus
}

export class UsdSchemaRegistry {
  static #instance: UsdSchemaRegistry | null = null

  // _TypeMapCache (schemaRegistry.cpp:152).
  readonly #schemaInfoByType = new Map<TfType, UsdSchemaInfo>()
  readonly #schemaInfoByIdentifier = new Map<string, UsdSchemaInfo>()
  // _SchemasByFamilyCache (schemaRegistry.cpp:521) — highest version first.
  readonly #schemasByFamily = new Map<string, UsdSchemaInfo[]>()
  // _APISchemaApplyToInfoCache (schemaRegistry.cpp:233).
  readonly #autoApplyAPISchemas = new Map<string, string[]>()
  readonly #canOnlyApplyAPISchemas = new Map<string, string[]>()
  readonly #allowedInstanceNames = new Map<string, Set<string>>()
  // Prim definitions (schemaRegistry.h:578-588).
  readonly #concreteTypedPrimDefinitions = new Map<string, UsdPrimDefinition>()
  readonly #abstractTypedPrimDefinitions = new Map<string, UsdPrimDefinition>()
  readonly #appliedAPIPrimDefinitions = new Map<string, ApiSchemaDefinitionInfo>()
  #fallbackPrimTypes: Record<string, VtArray<string>> = {}
  readonly #emptyPrimDefinition = new UsdPrimDefinition()
  // Parsed generatedSchema.usda per plugin (kept alive: prim definitions
  // hold (layer, path) references into these).
  readonly #schematicsLayerByPlugin = new Map<PlugPlugin, Layer>()
  readonly #processedPluginNames = new Set<string>()

  private constructor() {}

  static getInstance(): UsdSchemaRegistry {
    if (!UsdSchemaRegistry.#instance) {
      const instance = new UsdSchemaRegistry()
      UsdSchemaRegistry.#instance = instance
      const plugRegistry = PlugRegistry.GetInstance()
      instance.#integratePlugins(plugRegistry.getAllPlugins())
      plugRegistry.addDidRegisterPluginsListener((newPlugins) => {
        instance.#integratePlugins(newPlugins)
      })
    }
    return UsdSchemaRegistry.#instance
  }

  // ---- Identifier grammar (static, pure) -----------------------------------

  /** 'Family' → [family, 0]; 'Family_N' → [family, N]. Null if malformed.
   *  Mirrors ParseSchemaFamilyAndVersionFromIdentifier. */
  static parseSchemaFamilyAndVersionFromIdentifier(identifier: string): [string, UsdSchemaVersion] | null {
    const delim = findVersionDelimiter(identifier)
    if (delim === -1) return [identifier, 0]
    return [identifier.slice(0, delim), parseInt(identifier.slice(delim + 1), 10)]
  }

  static makeSchemaIdentifierForFamilyAndVersion(family: string, version: UsdSchemaVersion): string {
    // Version 0: the family IS the identifier (schemaRegistry.cpp:319).
    return version === 0 ? family : `${family}_${version}`
  }

  static isAllowedSchemaFamily(family: string): boolean {
    return isValidIdentifier(family) && findVersionDelimiter(family) === -1
  }

  static isAllowedSchemaIdentifier(identifier: string): boolean {
    const parsed = UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(identifier)
    if (!parsed) return false
    const [family, version] = parsed
    return (
      UsdSchemaRegistry.isAllowedSchemaFamily(family) &&
      UsdSchemaRegistry.makeSchemaIdentifierForFamilyAndVersion(family, version) === identifier
    )
  }

  // ---- SchemaInfo lookups (static, as upstream) -----------------------------

  static findSchemaInfo(typeOrIdentifier: TfType | string): UsdSchemaInfo | null {
    const registry = UsdSchemaRegistry.getInstance()
    if (typeof typeOrIdentifier === 'string') {
      return registry.#schemaInfoByIdentifier.get(typeOrIdentifier) ?? null
    }
    return registry.#schemaInfoByType.get(typeOrIdentifier) ?? null
  }

  static findSchemaInfoInFamily(family: string, version: UsdSchemaVersion): UsdSchemaInfo | null {
    // Reject non-family names so FindSchemaInfo('Foo_1', 0) can't alias the
    // 'Foo_1' identifier (schemaRegistry.cpp:429).
    if (!UsdSchemaRegistry.isAllowedSchemaFamily(family)) return null
    return UsdSchemaRegistry.findSchemaInfo(
      UsdSchemaRegistry.makeSchemaIdentifierForFamilyAndVersion(family, version))
  }

  /** All schemas in a family ordered from highest to lowest version,
   *  optionally filtered by version+policy. Mirrors FindSchemaInfosInFamily. */
  static findSchemaInfosInFamily(
    family: string,
    version?: UsdSchemaVersion,
    versionPolicy?: UsdSchemaVersionPolicy,
  ): UsdSchemaInfo[] {
    const ordered = UsdSchemaRegistry.getInstance().#schemasByFamily.get(family)
    if (!ordered) return []
    if (version === undefined) return [...ordered]
    switch (versionPolicy ?? 'all') {
      case 'all': return [...ordered]
      case 'greaterThan': return ordered.filter((s) => s.version > version)
      case 'greaterThanOrEqual': return ordered.filter((s) => s.version >= version)
      case 'lessThan': return ordered.filter((s) => s.version < version)
      case 'lessThanOrEqual': return ordered.filter((s) => s.version <= version)
    }
  }

  // ---- Type-name mappings ----------------------------------------------------

  static getSchemaTypeName(type: TfType): string {
    return UsdSchemaRegistry.findSchemaInfo(type)?.identifier ?? ''
  }

  static getTypeFromSchemaTypeName(typeName: string): TfType {
    return UsdSchemaRegistry.findSchemaInfo(typeName)?.type ?? TfType.getUnknownType()
  }

  static getConcreteSchemaTypeName(type: TfType): string {
    const info = UsdSchemaRegistry.findSchemaInfo(type)
    return info && info.kind === 'concreteTyped' ? info.identifier : ''
  }

  static getConcreteTypeFromSchemaTypeName(typeName: string): TfType {
    const info = UsdSchemaRegistry.findSchemaInfo(typeName)
    return info && info.kind === 'concreteTyped' ? info.type : TfType.getUnknownType()
  }

  static getAPISchemaTypeName(type: TfType): string {
    const info = UsdSchemaRegistry.findSchemaInfo(type)
    return info && UsdSchemaRegistry.#isAPISchemaKind(info.kind) ? info.identifier : ''
  }

  static getAPITypeFromSchemaTypeName(typeName: string): TfType {
    const info = UsdSchemaRegistry.findSchemaInfo(typeName)
    return info && UsdSchemaRegistry.#isAPISchemaKind(info.kind) ? info.type : TfType.getUnknownType()
  }

  /** TfType for a registered schema by USD type name (alias under
   *  UsdSchemaBase) or full type name. Mirrors GetTypeFromName. */
  static getTypeFromName(typeName: string): TfType {
    return TfType.findByName('UsdSchemaBase').findDerivedByName(typeName)
  }

  // ---- Kind queries -----------------------------------------------------------

  static #isAPISchemaKind(kind: UsdSchemaKind): boolean {
    return kind === 'singleApplyAPI' || kind === 'multipleApplyAPI' || kind === 'nonAppliedAPI'
  }

  static #kindOf(typeNameOrType: string | TfType): UsdSchemaKind {
    return UsdSchemaRegistry.findSchemaInfo(typeNameOrType)?.kind ?? 'invalid'
  }

  static getSchemaKind(typeNameOrType: string | TfType): UsdSchemaKind {
    return UsdSchemaRegistry.#kindOf(typeNameOrType)
  }

  static isConcrete(typeNameOrType: string | TfType): boolean {
    return UsdSchemaRegistry.#kindOf(typeNameOrType) === 'concreteTyped'
  }

  static isAbstract(typeNameOrType: string | TfType): boolean {
    const kind = UsdSchemaRegistry.#kindOf(typeNameOrType)
    return kind === 'abstractTyped' || kind === 'abstractBase'
  }

  static isTyped(typeNameOrType: string | TfType): boolean {
    // Upstream: primType.IsA<UsdTyped>() (schemaRegistry.cpp:1833).
    const type = typeof typeNameOrType === 'string'
      ? UsdSchemaRegistry.getTypeFromSchemaTypeName(typeNameOrType)
      : typeNameOrType
    return type.isA(TfType.findByName('UsdTyped'))
  }

  static isAppliedAPISchema(typeNameOrType: string | TfType): boolean {
    const kind = UsdSchemaRegistry.#kindOf(typeNameOrType)
    return kind === 'singleApplyAPI' || kind === 'multipleApplyAPI'
  }

  static isMultipleApplyAPISchema(typeNameOrType: string | TfType): boolean {
    return UsdSchemaRegistry.#kindOf(typeNameOrType) === 'multipleApplyAPI'
  }

  // ---- Multiple-apply helpers ---------------------------------------------------

  /** 'Foo:inst' → ['Foo', 'inst']; 'Foo' → ['Foo', '']. Splits at the FIRST
   *  namespace delimiter. Mirrors GetTypeNameAndInstance. */
  static getTypeNameAndInstance(apiSchemaName: string): [string, string] {
    const delim = apiSchemaName.indexOf(':')
    if (delim === -1) return [apiSchemaName, '']
    return [apiSchemaName.slice(0, delim), apiSchemaName.slice(delim + 1)]
  }

  /** propName + __INSTANCE_NAME__ templating. Mirror the upstream trio. */
  static makeMultipleApplyNameTemplate(namespacePrefix: string, baseName: string): string {
    return joinIdentifier(joinIdentifier(namespacePrefix, INSTANCE_NAME_PLACEHOLDER), baseName)
  }

  static makeMultipleApplyNameInstance(nameTemplate: string, instanceName: string): string {
    const pos = findInstanceNamePlaceholder(nameTemplate)
    if (pos === -1) return nameTemplate
    return (
      nameTemplate.slice(0, pos) + instanceName +
      nameTemplate.slice(pos + INSTANCE_NAME_PLACEHOLDER.length)
    )
  }

  static getMultipleApplyNameTemplateBaseName(nameTemplate: string): string {
    const pos = findInstanceNamePlaceholder(nameTemplate)
    if (pos === -1) return nameTemplate
    const baseNamePos = pos + INSTANCE_NAME_PLACEHOLDER.length + 1
    return baseNamePos >= nameTemplate.length ? '' : nameTemplate.slice(baseNamePos)
  }

  static isMultipleApplyNameTemplate(nameTemplate: string): boolean {
    return findInstanceNamePlaceholder(nameTemplate) !== -1
  }

  static isAllowedAPISchemaInstanceName(apiSchemaName: string, instanceName: string): boolean {
    // Mirrors schemaRegistry.cpp:1873.
    if (instanceName === '' || !UsdSchemaRegistry.isMultipleApplyAPISchema(apiSchemaName)) {
      return false
    }
    const registry = UsdSchemaRegistry.getInstance()
    const allowed = registry.#allowedInstanceNames.get(apiSchemaName)
    if (allowed && allowed.size > 0 && !allowed.has(instanceName)) return false

    const apiSchemaDef = registry.findAppliedAPIPrimDefinition(apiSchemaName)
    if (!apiSchemaDef) return false

    const tokens = instanceName.split(':')
    if (tokens.length === 0 || tokens.some((t) => t === '')) return false
    const baseName = tokens[tokens.length - 1]!
    // Instance names whose base name shadows a property's template base name
    // are never allowed.
    for (const propName of apiSchemaDef.getPropertyNames()) {
      if (baseName === UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName(propName)) {
        return false
      }
    }
    return true
  }

  // ---- Apply-info (from plugInfo) -------------------------------------------------

  /** Type names an API schema may be applied to (apiSchemaCanOnlyApplyTo;
   *  empty = no restriction). Mirrors GetAPISchemaCanOnlyApplyToTypeNames. */
  static getAPISchemaCanOnlyApplyToTypeNames(apiSchemaName: string, instanceName?: string): string[] {
    const map = UsdSchemaRegistry.getInstance().#canOnlyApplyAPISchemas
    if (instanceName !== undefined && instanceName !== '') {
      const forInstance = map.get(joinIdentifier(apiSchemaName, instanceName))
      if (forInstance) return [...forInstance]
    }
    return [...(map.get(apiSchemaName) ?? [])]
  }

  /** API schema name → type names it auto-applies to.
   *  Mirrors GetAutoApplyAPISchemas. */
  static getAutoApplyAPISchemas(): Map<string, string[]> {
    return new Map([...UsdSchemaRegistry.getInstance().#autoApplyAPISchemas]
      .map(([schema, typeNames]) => [schema, [...typeNames]]))
  }

  // ---- Fields never used as fallbacks ------------------------------------------------

  static isDisallowedField(field: string): boolean {
    return DISALLOWED_FIELDS.has(field)
  }

  // ---- Prim definitions (instance, as upstream) -----------------------------------------

  findConcretePrimDefinition(typeName: string): UsdPrimDefinition | null {
    return this.#concreteTypedPrimDefinitions.get(typeName) ?? null
  }

  /** Prim definition for an ABSTRACT typed schema (fallback-less registry
   *  entry used by inheriting schemas). Mirrors FindAbstractPrimDefinition. */
  findAbstractPrimDefinition(typeName: string): UsdPrimDefinition | null {
    return this.#abstractTypedPrimDefinitions.get(typeName) ?? null
  }

  findAppliedAPIPrimDefinition(apiSchemaName: string): UsdPrimDefinition | null {
    return this.#appliedAPIPrimDefinitions.get(apiSchemaName)?.primDef ?? null
  }

  getEmptyPrimDefinition(): UsdPrimDefinition {
    return this.#emptyPrimDefinition
  }

  /** Compose authored API schemas (strongest→weakest) over a typed prim
   *  definition. Mirrors BuildComposedPrimDefinition. */
  buildComposedPrimDefinition(primTypeName: string, appliedAPISchemas: readonly string[]): UsdPrimDefinition {
    if (appliedAPISchemas.length === 0) {
      // Upstream: TF_CODING_ERROR + nullptr (schemaRegistry.cpp:1967).
      throw new Error(
        'UsdSchemaRegistry.buildComposedPrimDefinition without applied API schemas is not '
        + 'allowed — use findConcretePrimDefinition instead.')
    }

    const primDef = UsdSchemaRegistry.isConcrete(primTypeName)
      ? this.findConcretePrimDefinition(primTypeName)
      : this.findAbstractPrimDefinition(primTypeName)
    const composed = primDef ? primDef._copy() : new UsdPrimDefinition()

    // Authored API schemas may not add a second version of a family already
    // built in to the type's definition — seed the seen map from the copied
    // definition's applied schemas (schemaRegistry.cpp:1995).
    const seenSchemaFamilyVersions = new Map<string, number>()
    for (const apiSchema of composed._appliedAPISchemas) {
      const [typeName, instance] = UsdSchemaRegistry.getTypeNameAndInstance(apiSchema)
      const info = UsdSchemaRegistry.findSchemaInfo(typeName)
      if (!info) continue
      seenSchemaFamilyVersions.set(_familyAndInstanceKey(info.family, instance), info.version)
    }

    this.#composeAPISchemasIntoPrimDefinition(composed, appliedAPISchemas, seenSchemaFamilyVersions)
    return composed
  }

  /** fallbackPrimTypes root-layer metadata harvested from all
   *  generatedSchema.usda layers: concrete type name → ordered fallbacks. */
  getFallbackPrimTypes(): Record<string, VtArray<string>> {
    return Object.fromEntries(Object.entries(this.#fallbackPrimTypes)
      .map(([typeName, fallbacks]) => [typeName, fallbacks.Clone()]))
  }

  // ---- Registry construction --------------------------------------------------

  // Integrates one batch of plugins: schema infos, apply-to info, then prim
  // definitions. The initial getInstance() call passes every plugin
  // registered so far (upstream's one-shot init over the full plugin set);
  // the DidRegisterPlugins listener passes later arrivals.
  #integratePlugins(plugins: readonly PlugPlugin[]): void {
    const batch = plugins.filter((p) => !this.#processedPluginNames.has(p.getName()))
    if (batch.length === 0) return
    for (const plugin of batch) this.#processedPluginNames.add(plugin.getName())

    const newInfos = this.#buildSchemaInfos(batch)
    this.#collectApplyToInfo(batch, newInfos)
    this.#rebuildPrimDefinitions()
  }

  // Browser modules may register plugins after the singleton exists. Native
  // construction builds definitions only after discovering every schema
  // (schemaRegistry.cpp:992-1019); reproduce that ordering over the enlarged
  // set, then transplant rebuilt state into existing definitions so cached
  // UsdPrimTypeInfo objects retain observable prim-definition identity.
  #rebuildPrimDefinitions(): void {
    const oldConcrete = new Map(this.#concreteTypedPrimDefinitions)
    const oldAbstract = new Map(this.#abstractTypedPrimDefinitions)
    const oldApplied = new Map(this.#appliedAPIPrimDefinitions)

    this.#concreteTypedPrimDefinitions.clear()
    this.#abstractTypedPrimDefinitions.clear()
    this.#appliedAPIPrimDefinitions.clear()
    this.#fallbackPrimTypes = {}
    this.#buildPrimDefinitions([...this.#schemaInfoByType.values()])

    const preserve = (
      rebuilt: Map<string, UsdPrimDefinition>,
      previous: ReadonlyMap<string, UsdPrimDefinition>,
    ): void => {
      for (const [identifier, fresh] of rebuilt) {
        const existing = previous.get(identifier)
        if (!existing) continue
        existing._replaceWith(fresh)
        rebuilt.set(identifier, existing)
      }
    }
    preserve(this.#concreteTypedPrimDefinitions, oldConcrete)
    preserve(this.#abstractTypedPrimDefinitions, oldAbstract)
    for (const [identifier, fresh] of this.#appliedAPIPrimDefinitions) {
      const existing = oldApplied.get(identifier)
      if (!existing) continue
      existing.primDef._replaceWith(fresh.primDef)
      this.#appliedAPIPrimDefinitions.set(identifier, {
        primDef: existing.primDef,
        applyExpectsInstanceName: fresh.applyExpectsInstanceName,
      })
    }
  }

  // _TypeMapCache construction (schemaRegistry.cpp:152): identifier from
  // schemaIdentifier metadata, falling back to the single UsdSchemaBase
  // alias; no identifier = registration failure (upstream coding error);
  // duplicate identifiers = first wins (upstream coding error).
  #buildSchemaInfos(batch: readonly PlugPlugin[]): UsdSchemaInfo[] {
    const schemaBaseType = TfType.findByName('UsdSchemaBase')
    const newInfos: UsdSchemaInfo[] = []

    for (const plugin of batch) {
      const types = plugin.getMetadata()['Types']
      if (typeof types !== 'object' || types === null) continue
      for (const typeName of Object.keys(types)) {
        const type = TfType.findByName(typeName)
        if (type.isUnknown()) continue
        if (!(type === schemaBaseType || type.isA(schemaBaseType))) continue
        if (this.#schemaInfoByType.has(type)) continue

        const metadata = plugin.getMetadataForType(type)
        if (Object.keys(metadata).length === 0) continue

        let identifier = typeof metadata['schemaIdentifier'] === 'string'
          ? (metadata['schemaIdentifier'] as string)
          : ''
        if (identifier === '') {
          const aliases = schemaBaseType.getAliases(type)
          if (aliases.length === 1) identifier = aliases[0]!
        }
        if (identifier === '') continue // upstream: coding error, no registration

        if (this.#schemaInfoByIdentifier.has(identifier)) continue // first wins

        const kind = schemaKindFromMetadata(metadata)
        const [family, version] =
          UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(identifier)!
        const info: UsdSchemaInfo = { identifier, type, family, version, kind }

        this.#schemaInfoByType.set(type, info)
        this.#schemaInfoByIdentifier.set(identifier, info)
        // Keep the family list ordered highest → lowest version.
        let familyList = this.#schemasByFamily.get(family)
        if (!familyList) this.#schemasByFamily.set(family, familyList = [])
        let at = familyList.findIndex((s) => s.version < version)
        if (at === -1) at = familyList.length
        familyList.splice(at, 0, info)

        newInfos.push(info)
      }
    }
    return newInfos
  }

  // _APISchemaApplyToInfoCache: Usd_GetAPISchemaPluginApplyToInfoForType
  // (schemaRegistry.cpp:2054) for each new schema, plus plugin-level
  // AutoApplyAPISchemas (CollectAddtionalAutoApplyAPISchemasFromPlugins,
  // schemaRegistry.cpp:834).
  #collectApplyToInfo(batch: readonly PlugPlugin[], newInfos: readonly UsdSchemaInfo[]): void {
    for (const info of newInfos) {
      if (info.kind !== 'singleApplyAPI' && info.kind !== 'multipleApplyAPI') continue
      const plugin = PlugRegistry.GetInstance().getPluginForType(info.type)
      if (!plugin) continue
      const dict = plugin.getMetadataForType(info.type)

      const canOnlyApplyTo = nameListFromMetadata(dict, 'apiSchemaCanOnlyApplyTo')
      if (canOnlyApplyTo.length > 0) {
        this.#canOnlyApplyAPISchemas.set(info.identifier, canOnlyApplyTo)
      }

      if (info.kind === 'singleApplyAPI') {
        // Skip if auto apply API schemas have been disabled
        // (schemaRegistry.cpp:2088-2092).
        if (TfGetEnvSetting(USD_DISABLE_AUTO_APPLY_API_SCHEMAS)) continue
        const autoApplyTo = nameListFromMetadata(dict, 'apiSchemaAutoApplyTo')
        if (autoApplyTo.length > 0) {
          this.#autoApplyAPISchemas.set(info.identifier, autoApplyTo)
        }
      } else {
        const allowedInstanceNames = nameListFromMetadata(dict, 'apiSchemaAllowedInstanceNames')
        if (allowedInstanceNames.length > 0) {
          let set = this.#allowedInstanceNames.get(info.identifier)
          if (!set) this.#allowedInstanceNames.set(info.identifier, set = new Set())
          for (const n of allowedInstanceNames) set.add(n)
        }
        const instances = dict['apiSchemaInstances']
        if (typeof instances === 'object' && instances !== null) {
          for (const [instanceName, instanceDict] of Object.entries(instances)) {
            if (typeof instanceDict !== 'object' || instanceDict === null) continue
            const instanceCanOnlyApplyTo = nameListFromMetadata(
              instanceDict as Record<string, unknown>, 'apiSchemaCanOnlyApplyTo')
            if (instanceCanOnlyApplyTo.length > 0) {
              this.#canOnlyApplyAPISchemas.set(
                joinIdentifier(info.identifier, instanceName), instanceCanOnlyApplyTo)
            }
          }
        }
      }
    }

    // Plugin-level AutoApplyAPISchemas metadata appends to any existing entry,
    // unless auto apply API schemas have been disabled
    // (schemaRegistry.cpp:841-844).
    if (TfGetEnvSetting(USD_DISABLE_AUTO_APPLY_API_SCHEMAS)) return
    for (const plugin of batch) {
      const autoApplyMetadata = plugin.getMetadata()['AutoApplyAPISchemas']
      if (typeof autoApplyMetadata !== 'object' || autoApplyMetadata === null) continue
      for (const [apiSchemaName, entry] of Object.entries(autoApplyMetadata)) {
        if (typeof entry !== 'object' || entry === null) continue
        const autoApplyTo = nameListFromMetadata(
          entry as Record<string, unknown>, 'apiSchemaAutoApplyTo')
        if (autoApplyTo.length === 0) continue
        const existing = this.#autoApplyAPISchemas.get(apiSchemaName)
        if (existing) existing.push(...autoApplyTo)
        else this.#autoApplyAPISchemas.set(apiSchemaName, autoApplyTo)
      }
    }
  }

  // _GetTypeToAutoAppliedAPISchemaNames (schemaRegistry.cpp:917): invert the
  // full auto-apply map over each target type and its derived types, sorted
  // in reverse dictionary order per type.
  #computeTypeToAutoAppliedAPISchemaNames(): Map<TfType, string[]> {
    const result = new Map<TfType, string[]>()
    for (const [apiSchemaName, autoApplyToSchemas] of this.#autoApplyAPISchemas) {
      const applyToTypes = new Set<TfType>()
      for (const schemaName of autoApplyToSchemas) {
        const info = this.#schemaInfoByIdentifier.get(schemaName)
        if (info && !applyToTypes.has(info.type)) {
          applyToTypes.add(info.type)
          for (const derived of info.type.getAllDerivedTypes()) applyToTypes.add(derived)
        }
      }
      for (const applyToType of applyToTypes) {
        let list = result.get(applyToType)
        if (!list) result.set(applyToType, list = [])
        list.push(apiSchemaName)
      }
    }
    for (const list of result.values()) sortAutoAppliedAPISchemas(list)
    return result
  }

  // _SchemaDefInitHelper::FindAndBuildAllSchemaDefinitions
  // (schemaRegistry.cpp:992) over the complete discovered schema set.
  #buildPrimDefinitions(newInfos: readonly UsdSchemaInfo[]): void {
    const typeToAutoApplied = this.#computeTypeToAutoAppliedAPISchemaNames()

    const apiBuilders = new Map<string, ApiDefBuilder>()
    const abstractToBuild: Array<{ info: UsdSchemaInfo; layer: Layer }> = []
    const concreteToBuild: Array<{ info: UsdSchemaInfo; layer: Layer }> = []
    const newLayers = new Set<Layer>()

    for (const info of newInfos) {
      // Only these kinds get prim definitions (schemaRegistry.cpp:1134).
      const needsPrimDefinition =
        info.kind === 'abstractTyped' || info.kind === 'concreteTyped' ||
        info.kind === 'multipleApplyAPI' || info.kind === 'singleApplyAPI'
      if (!needsPrimDefinition) continue

      const layer = this.#schematicsLayerForType(info.type)
      newLayers.add(layer)
      if (info.kind === 'abstractTyped') abstractToBuild.push({ info, layer })
      else if (info.kind === 'concreteTyped') concreteToBuild.push({ info, layer })
      else {
        apiBuilders.set(info.identifier, {
          info, layer, primDef: null, buildStatus: BuildStatus.NotBuilding,
        })
      }
    }

    // Harvest fallbackPrimTypes root metadata (schemaRegistry.cpp:1205).
    for (const layer of newLayers) {
      const fallbacks = layer.getField('/', 'fallbackPrimTypes')
      if (typeof fallbacks !== 'object' || fallbacks === null) continue
      for (const [typeName, value] of Object.entries(fallbacks)) {
        if (!(value instanceof VtArray)) continue
        if (typeName in this.#fallbackPrimTypes) continue
        this.#fallbackPrimTypes[typeName] = (value as VtArray<string>).Clone()
      }
    }

    // Applied API schema definitions first — they may include each other
    // (_PopulateAppliedAPIPrimDefinitions, schemaRegistry.cpp:1612).
    for (const [identifier, builder] of apiBuilders) {
      this.#buildAPIPrimDefinition(builder, apiBuilders, typeToAutoApplied)
      this.#appliedAPIPrimDefinitions.set(identifier, {
        primDef: builder.primDef!,
        applyExpectsInstanceName: builder.info.kind === 'multipleApplyAPI',
      })
    }

    // Then typed (abstract + concrete) definitions
    // (_PopulateTypedPrimDefinitions, schemaRegistry.cpp:1646).
    for (const { info, layer } of [...abstractToBuild, ...concreteToBuild]) {
      const primPath = `/${info.identifier}`
      const overridePropertyNames = getOverridePropertyNames(layer, primPath)

      const primDef = new UsdPrimDefinition()
      primDef._initializeForTypedSchema(layer, primPath, overridePropertyNames)
      primDef._locallyDefinedPropertyNames = [...primDef._properties, ...overridePropertyNames]

      const apiSchemasToCompose =
        this.#getDirectBuiltinAPISchemas(layer, primPath, info, typeToAutoApplied)
      if (apiSchemasToCompose.length > 0) {
        this.#composeAPISchemasIntoPrimDefinition(
          primDef, apiSchemasToCompose, new Map<string, number>())
      }

      for (const overridePropertyName of overridePropertyNames) {
        primDef._composeOverAndReplaceExistingProperty(overridePropertyName, layer, primPath)
      }

      if (info.kind === 'abstractTyped') {
        this.#abstractTypedPrimDefinitions.set(info.identifier, primDef)
      } else {
        this.#concreteTypedPrimDefinitions.set(info.identifier, primDef)
      }
    }

    // Finally prune base-class properties from the locally-defined lists
    // (_FinalizeLocallyDefinedPropertiesForPrimDefinitions,
    // schemaRegistry.cpp:1740) — for THIS batch's typed definitions.
    for (const { info } of [...abstractToBuild, ...concreteToBuild]) {
      const primDef = info.kind === 'abstractTyped'
        ? this.#abstractTypedPrimDefinitions.get(info.identifier)!
        : this.#concreteTypedPrimDefinitions.get(info.identifier)!
      primDef._locallyDefinedPropertyNames =
        this.#pruneBaseClassPropertiesForPrimDefinition(primDef, info.identifier)
    }
  }

  // One parsed generatedSchema.usda per plugin (schemaRegistry.cpp:788
  // _GetGeneratedSchema). Missing/async resources yield an empty layer so
  // downstream code never checks for null layers, exactly as upstream.
  #schematicsLayerForType(type: TfType): Layer {
    const plugin = PlugRegistry.GetInstance().getPluginForType(type)
    if (!plugin) return Layer.createAnonymous('anon:generatedSchema:unowned')
    const cached = this.#schematicsLayerByPlugin.get(plugin)
    if (cached) return cached

    // Plugin registration is the synchronous discovery boundary, matching
    // native Plug registration: generatedSchema.usda is bundled inline before
    // the DidRegisterPlugins notice is emitted.
    const text = plugin._getResourceSync('generatedSchema.usda')
    let layer: Layer | null = null
    if (text !== undefined) {
      try {
        layer = Layer.createInMemory(`anon:${plugin.getName()}:generatedSchema.usda`, text)
      } catch {
        layer = null // malformed schema layer → empty, as upstream's TF_WARN path
      }
    }
    layer ??= Layer.createAnonymous(`anon:${plugin.getName()}:generatedSchema.usda`)
    this.#schematicsLayerByPlugin.set(plugin, layer)
    return layer
  }

  // _GetDirectBuiltinAPISchemas (schemaRegistry.cpp:1249): the schematics
  // prim's apiSchemas list op + auto-applied APIs for the type, filtered so
  // multiple-apply templates only include templates and non-templates only
  // include non-templates.
  #getDirectBuiltinAPISchemas(
    layer: Layer, primPath: string, info: UsdSchemaInfo,
    typeToAutoApplied: ReadonlyMap<TfType, string[]>,
  ): string[] {
    let result = applyListOpToEmpty(layer.getField(primPath, 'apiSchemas'))
    const autoApplied = typeToAutoApplied.get(info.type)
    if (autoApplied) result = [...result, ...autoApplied]
    if (result.length === 0) return result

    const isMultipleApplyTemplateSchema = info.kind === 'multipleApplyAPI'
    return result.filter(
      (name) => UsdSchemaRegistry.isMultipleApplyNameTemplate(name) === isMultipleApplyTemplateSchema)
  }

  // _APISchemaPrimDefBuilder::BuildPrimDefinition (schemaRegistry.cpp:1420):
  // recursive build of an API schema definition, expanding built-in API
  // schemas with cycle protection.
  #buildAPIPrimDefinition(
    builder: ApiDefBuilder,
    builders: ReadonlyMap<string, ApiDefBuilder>,
    typeToAutoApplied: ReadonlyMap<TfType, string[]>,
  ): boolean {
    if (builder.buildStatus === BuildStatus.Complete) return true
    builder.buildStatus = BuildStatus.Building

    const { info, layer } = builder
    const primPath = `/${info.identifier}`
    const overridePropertyNames = getOverridePropertyNames(layer, primPath)

    // Multiple apply schemas are templates: their definition name is
    // 'Identifier:__INSTANCE_NAME__' (schemaRegistry.cpp:1450).
    const apiSchemaName = info.kind === 'multipleApplyAPI'
      ? UsdSchemaRegistry.makeMultipleApplyNameTemplate(info.identifier, '')
      : info.identifier

    const primDef = new UsdPrimDefinition()
    primDef._initializeForAPISchema(apiSchemaName, layer, primPath, overridePropertyNames)
    primDef._locallyDefinedPropertyNames = [...primDef._properties, ...overridePropertyNames]
    builder.primDef = primDef

    const builtinAPISchemaNames =
      this.#getDirectBuiltinAPISchemas(layer, primPath, info, typeToAutoApplied)
    if (builtinAPISchemaNames.length === 0) {
      builder.buildStatus = BuildStatus.Complete
      return true
    }

    const seenAPISchemaVersions = new Map<string, number>()
    seenAPISchemaVersions.set(_familyAndInstanceKey(info.family, ''), info.version)

    let foundCycle = false
    for (const builtinApiSchemaName of builtinAPISchemaNames) {
      const [typeName, builtinInstanceName] =
        UsdSchemaRegistry.getTypeNameAndInstance(builtinApiSchemaName)

      const builtinBuilder = builders.get(typeName)
      if (builtinBuilder) {
        if (builtinBuilder.buildStatus === BuildStatus.Building) {
          // Direct or indirect self-inclusion — skip to break the cycle.
          foundCycle = true
          continue
        }
        if (!this.#buildAPIPrimDefinition(builtinBuilder, builders, typeToAutoApplied)) {
          foundCycle = true
        }
        primDef._composeWeakerAPIPrimDefinition(
          builtinBuilder.primDef!, builtinInstanceName, seenAPISchemaVersions)
        continue
      }

      // Cross-batch built-in: already fully built by an earlier plugin batch.
      const existing = this.#appliedAPIPrimDefinitions.get(typeName)
      if (existing) {
        primDef._composeWeakerAPIPrimDefinition(
          existing.primDef, builtinInstanceName, seenAPISchemaVersions)
      }
      // else: unknown built-in — skipped (upstream TF_WARN).
    }

    for (const overridePropertyName of overridePropertyNames) {
      primDef._composeOverAndReplaceExistingProperty(overridePropertyName, layer, primPath)
    }

    if (foundCycle) {
      // Rebuild from the top next time so the definition doesn't depend on
      // which inclusion path built it first (schemaRegistry.cpp:1590).
      builder.buildStatus = BuildStatus.NotBuilding
      return false
    }
    builder.buildStatus = BuildStatus.Complete
    return true
  }

  // _ComposeAPISchemasIntoPrimDefinition (schemaRegistry.cpp:2015).
  #composeAPISchemasIntoPrimDefinition(
    primDef: UsdPrimDefinition,
    appliedAPISchemas: readonly string[],
    seenSchemaFamilyVersions: Map<string, number>,
  ): void {
    for (const apiSchemaName of appliedAPISchemas) {
      const [typeName, instanceName] = UsdSchemaRegistry.getTypeNameAndInstance(apiSchemaName)
      const apiSchemaDefInfo = this.#appliedAPIPrimDefinitions.get(typeName)
      if (!apiSchemaDefInfo) continue
      // Multiple apply schemas need an instance name; single apply must not
      // have one (upstream TF_WARN + skip).
      const hasInstanceName = instanceName !== ''
      if (apiSchemaDefInfo.applyExpectsInstanceName !== hasInstanceName) continue
      primDef._composeWeakerAPIPrimDefinition(
        apiSchemaDefInfo.primDef, instanceName, seenSchemaFamilyVersions)
    }
  }

  // _PruneBaseClassPropertiesForPrimDefinition (schemaRegistry.cpp:1344).
  #pruneBaseClassPropertiesForPrimDefinition(
    primDef: UsdPrimDefinition, schemaName: string,
  ): string[] {
    const result = primDef._locallyDefinedPropertyNames
    const schemaType = UsdSchemaRegistry.getTypeFromSchemaTypeName(schemaName)
    if (schemaType.isUnknown()) return result

    const usdTyped = TfType.findByName('UsdTyped')
    const propsToPrune = new Set<string>()
    for (const baseType of schemaType.getBaseTypes()) {
      // The base Typed schema has no prim definition.
      if (baseType === usdTyped) continue
      const info = this.#schemaInfoByType.get(baseType)
      if (!info) continue
      const basePrimDef = info.kind === 'concreteTyped'
        ? this.findConcretePrimDefinition(info.identifier)
        : this.findAbstractPrimDefinition(info.identifier)
      if (!basePrimDef) continue
      for (const propName of basePrimDef.getPropertyNames()) propsToPrune.add(propName)
    }

    if (propsToPrune.size === 0) return result
    return result.filter((propName) => !propsToPrune.has(propName))
  }
}
