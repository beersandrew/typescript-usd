// Ported from OpenUSD 26.11.1: pxr/usd/sdf/schema.cpp, pxr/usd/sdf/schema.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Private SdfSchema metadata-field substrate. OpenUSD registers the
// SdfMetadata dictionaries from Plug plugins in SdfSchemaBase::_UpdateMetadataFromPlugins
// (schema.cpp:1699-1852); typescript-usd keeps the registry private until the complete
// public SdfSchema query surface is ported.

import { Duration as GfDuration, _VecBase as GfVecBase, _MatrixBase as GfMatrixBase, _QuatBase as GfQuatBase } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import {
  Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes, _GetTypeKind as vtTypeKind,
} from 'typescript-usd/vt'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import type { SdfSpecType } from './abstractData.ts'
import { SdfAllowed } from './allowed.ts'
import { SdfAssetPath } from './assetPath.ts'
import { SdfPath } from './path.ts'
import { SdfPathExpression } from './pathExpression.ts'
import { ValueTypeNames, findValueTypeName } from './valueTypeName.ts'
import { sdfIsVariableExpression } from './variableExpression.ts'

export type SdfMetadataSpecType = 'layer' | 'prim' | 'attribute' | 'relationship' | 'variant'

export interface SdfMetadataPlugin {
  getMetadata(): Record<string, unknown>
}

interface MetadataFieldDefinition {
  typeName: string
  appliesTo?: ReadonlySet<string>
  fallback?: unknown
  info?: Readonly<Record<string, unknown>>
}

const metadataFields = new Map<string, MetadataFieldDefinition>([
  ['customData', { typeName: 'dictionary', appliesTo: new Set(['prims', 'attributes', 'relationships']) }],
  ['assetInfo', { typeName: 'dictionary', appliesTo: new Set(['prims']) }],
  ['customLayerData', { typeName: 'dictionary', appliesTo: new Set(['layers']) }],
  // schema.cpp:1750-1859: test/extension fields are registered only from
  // their Plug metadata, including the plugin's authored appliesTo masks.
  // Legacy symmetry metadata retained by the OpenUSD v26.08 Pcp museum
  // TrickyMultipleRelocationsAndClasses fixtures and copied by Usd flattening.
  ['prefix', { typeName: 'string', appliesTo: new Set(['prims']) }],
])

// VtDictionary retains each entry's concrete VtValue type. JavaScript numbers
// do not distinguish SdfTimeCode from double, so USDA parsing records that
// otherwise-erased type identity out of band on the dictionary object.
const dictionaryValueTypes = new WeakMap<object, ReadonlyMap<string, string>>()

// TsKnot has value semantics, so its custom-data dictionary is copied while a
// text spline is assembled. OpenUSD v26.08 retains each copied VtValue's type
// intrinsically (pxr/usd/sdf/textFileFormatParser.cpp:2898-2905); retain the
// equivalent type map on the owning spline after those copies are complete.
const splineKnotCustomDataValueTypes = new WeakMap<
  object, ReadonlyMap<number, ReadonlyMap<string, string>>
>()

export interface SdfTextSplineKnotState {
  dualValued: boolean
  preTangentSlope: number
  preTangentWidth: number
  postTangentSlope: number
  postTangentWidth: number
}

export interface SdfTextSplineState {
  preExtrapolationAuthored: boolean
  postExtrapolationAuthored: boolean
  knots: ReadonlyMap<number, SdfTextSplineKnotState>
}

const textSplineStates = new WeakMap<object, SdfTextSplineState>()

export function _sdfRecordDictionaryValueTypes(
  dictionary: Record<string, unknown>, valueTypes: ReadonlyMap<string, string>,
): void {
  dictionaryValueTypes.set(dictionary, valueTypes)
}

export function _sdfGetDictionaryValueTypes(
  dictionary: object,
): ReadonlyMap<string, string> | undefined {
  return dictionaryValueTypes.get(dictionary)
}

export function _sdfRecordSplineKnotCustomDataValueTypes(
  spline: object, valueTypes: ReadonlyMap<number, ReadonlyMap<string, string>>,
): void {
  splineKnotCustomDataValueTypes.set(spline, valueTypes)
}

export function _sdfGetSplineKnotCustomDataValueTypes(
  spline: object,
): ReadonlyMap<number, ReadonlyMap<string, string>> | undefined {
  return splineKnotCustomDataValueTypes.get(spline)
}

export function _sdfRecordTextSplineState(spline: object, state: SdfTextSplineState): void {
  textSplineStates.set(spline, state)
}

export function _sdfGetTextSplineState(spline: object): SdfTextSplineState | undefined {
  return textSplineStates.get(spline)
}

export function _sdfCloneDictionaryValueTypes(source: object, target: object): void {
  const types = dictionaryValueTypes.get(source)
  if (types) dictionaryValueTypes.set(target, types)
}

// SdfSchemaBase::_RegisterPluginFields (schema.cpp:1031-1040): register the
// metadata fields of every plugin registered so far, then those of each later
// registration as PlugNotice::DidRegisterPlugins reports it
// (_OnDidRegisterPlugins, schema.cpp:1042-1046). Upstream does this once when
// the schema is constructed; here on the first metadata lookup that needs it,
// so plugins registered before then are all seen.
let pluginFieldsRegistered = false
export function _sdfRegisterPluginFields(): void {
  if (pluginFieldsRegistered) return
  pluginFieldsRegistered = true
  const registry = PlugRegistry.GetInstance()
  _sdfRegisterMetadataPlugins(registry.getAllPlugins())
  registry.addDidRegisterPluginsListener(newPlugins => _sdfRegisterMetadataPlugins(newPlugins))
}

export function _sdfRegisterMetadataPlugins(plugins: Iterable<SdfMetadataPlugin>): void {
  for (const plugin of plugins) {
    const rawFields = plugin.getMetadata()['SdfMetadata']
    if (!isDictionary(rawFields)) continue
    for (const [name, rawInfo] of Object.entries(rawFields)) {
      if (metadataFields.has(name) || !isDictionary(rawInfo)) continue
      const typeName = rawInfo['type']
      if (typeof typeName !== 'string') continue
      const rawAppliesTo = rawInfo['appliesTo']
      const appliesTo = typeof rawAppliesTo === 'string'
        ? new Set([rawAppliesTo])
        : Array.isArray(rawAppliesTo)
          ? new Set(rawAppliesTo.filter((item): item is string => typeof item === 'string'))
          : undefined
      const info = Object.fromEntries(Object.entries(rawInfo)
        .filter(([key]) => key !== 'type' && key !== 'default' && key !== 'appliesTo'))
      const definition: MetadataFieldDefinition = {
        typeName,
        ...('default' in rawInfo ? { fallback: rawInfo['default'] } : {}),
        ...(Object.keys(info).length ? { info } : {}),
        ...(appliesTo?.size ? { appliesTo } : {}),
      }
      metadataFields.set(name, definition)
      // SdfSchemaBase::_UpdateMetadataFromPlugins (schema.cpp:1779-1859).
      if (!standardFields.has(name)) {
        standardFields.set(name, {
          fallback: () => cloneFallback(definition.fallback), plugin: true,
          ...optionalValueType(_sdfMetadataValueTypeName(typeName)),
        })
      }
      const displayGroup = typeof rawInfo['displayGroup'] === 'string' ? rawInfo['displayGroup'] : ''
      const applies = (...names: string[]): boolean =>
        !appliesTo?.size || names.some(n => appliesTo.has(n))
      if (applies('layers')) specDefinitions.get('pseudoRoot')!._addField(name, false, true, displayGroup)
      if (applies('prims')) specDefinitions.get('prim')!._addField(name, false, true, displayGroup)
      if (applies('properties', 'attributes')) {
        specDefinitions.get('attribute')!._addField(name, false, true, displayGroup)
      }
      if (applies('properties', 'relationships')) {
        specDefinitions.get('relationship')!._addField(name, false, true, displayGroup)
      }
      // All metadata on prims also applies to variants.
      if (applies('variants', 'prims')) specDefinitions.get('variant')!._addField(name, false, true, displayGroup)
    }
  }
}

// ---- SdfSchemaBase field and spec definitions -------------------------------
//
// SdfSchemaBase::_RegisterStandardFields (schema.cpp:686-1000): every scene
// description field with its fallback value, and each spec type's fields,
// required fields and metadata fields. Fallbacks use typescript-usd value shapes: list
// ops are SdfListOpValue objects, enums their token spellings, tokens strings.

type SdfValidator = (value: unknown) => SdfAllowed

interface StandardFieldInfo {
  fallback: () => unknown
  // The TfType name of the fallback VtValue's held type (see
  // standardFieldValueTypes); undefined for an empty fallback.
  valueType?: string
  readOnly?: boolean
  children?: boolean
  plugin?: boolean
  // FieldDefinition::ValueValidator / ListValueValidator / MapKeyValidator / MapValueValidator.
  value?: SdfValidator
  listValue?: SdfValidator
  mapKey?: SdfValidator
  mapValue?: SdfValidator
}

function cloneFallback(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (_sdfIsDictionary(value)) return { ...value }
  return value
}

const listOp = (): unknown => ({
  isExplicit: false, explicitItems: [], addedItems: [], prependedItems: [], appendedItems: [],
  deletedItems: [], orderedItems: [],
})
const constant = (value: unknown) => () => value
const emptyArray = () => []
const emptyDict = () => ({})

const standardFields = new Map<string, StandardFieldInfo>([
  ['active', { fallback: constant(true) }],
  ['allowedTokens', { fallback: emptyArray }],
  ['arraySizeConstraint', { fallback: constant(0) }],
  ['assetInfo', { fallback: emptyDict }],
  ['timeSamples', { fallback: emptyArray }],
  ['clips', { fallback: emptyDict }],
  ['clipSets', { fallback: listOp }],
  ['colorConfiguration', { fallback: () => new SdfAssetPath() }],
  ['colorManagementSystem', { fallback: constant('') }],
  ['colorSpace', { fallback: constant('') }],
  ['comment', { fallback: constant('') }],
  // Connection paths and target paths are read-only: adding or removing them
  // adds or removes children specs, which the Info API does not allow.
  ['connectionPaths', { fallback: listOp, readOnly: true }],
  ['custom', { fallback: constant(false) }],
  ['customData', { fallback: emptyDict }],
  ['customLayerData', { fallback: emptyDict }],
  ['default', { fallback: constant(undefined) }],
  ['displayGroup', { fallback: constant('') }],
  ['displayGroupOrder', { fallback: emptyArray }],
  ['displayName', { fallback: constant('') }],
  ['displayUnit', { fallback: constant('default') }],
  ['documentation', { fallback: constant('') }],
  ['defaultPrim', { fallback: constant('') }],
  ['endFrame', { fallback: constant(0) }],
  ['endTimeCode', { fallback: constant(0) }],
  ['expressionVariables', { fallback: emptyDict }],
  ['framePrecision', { fallback: constant(3) }],
  ['framesPerSecond', { fallback: constant(24) }],
  ['hidden', { fallback: constant(false) }],
  ['hasOwnedSubLayers', { fallback: constant(false) }],
  ['instanceable', { fallback: constant(false) }],
  ['inheritPaths', { fallback: listOp }],
  ['kind', { fallback: constant('') }],
  ['limits', { fallback: emptyDict }],
  ['owner', { fallback: constant('') }],
  ['primOrder', { fallback: emptyArray }],
  ['noLoadHint', { fallback: constant(false) }],
  ['payload', { fallback: listOp }],
  ['permission', { fallback: constant('public') }],
  ['prefix', { fallback: constant('') }],
  ['prefixSubstitutions', { fallback: emptyDict }],
  ['propertyOrder', { fallback: emptyArray }],
  ['references', { fallback: listOp }],
  ['sessionOwner', { fallback: constant('') }],
  ['specializes', { fallback: listOp }],
  ['spline', { fallback: constant(undefined) }],
  ['suffix', { fallback: constant('') }],
  ['suffixSubstitutions', { fallback: emptyDict }],
  ['targetPaths', { fallback: listOp, readOnly: true }],
  ['layerRelocates', { fallback: emptyArray }],
  ['specifier', { fallback: constant('over') }],
  ['startFrame', { fallback: constant(0) }],
  ['startTimeCode', { fallback: constant(0) }],
  ['subLayers', { fallback: emptyArray }],
  ['subLayerOffsets', { fallback: emptyArray }],
  ['symmetricPeer', { fallback: constant('') }],
  ['symmetryArgs', { fallback: emptyDict }],
  ['symmetryArguments', { fallback: emptyDict }],
  ['symmetryFunction', { fallback: constant('') }],
  ['timeCodesPerSecond', { fallback: constant(24) }],
  ['typeName', { fallback: constant('') }],
  ['variantSetNames', { fallback: listOp }],
  ['variantSelection', { fallback: emptyDict }],
  ['variability', { fallback: constant('varying') }],
  // Children fields.
  ['connectionChildren', { fallback: emptyArray, children: true }],
  ['expressionChildren', { fallback: emptyArray, children: true }],
  ['mapperArgChildren', { fallback: emptyArray, children: true }],
  ['mapperChildren', { fallback: emptyArray, children: true }],
  ['primChildren', { fallback: emptyArray, children: true }],
  ['properties', { fallback: emptyArray, children: true }],
  ['targetChildren', { fallback: emptyArray, children: true }],
  ['variantChildren', { fallback: emptyArray, children: true }],
  ['variantSetChildren', { fallback: emptyArray, children: true }],
])

// The held type of each standard field's fallback VtValue
// (_RegisterStandardFields, schema.cpp:734-863), by TfType name; a field
// whose fallback is an empty VtValue (Default) has none. typescript-usd's
// fallbacks above are JS value shapes, so the C++ type is kept here
// (SdfFieldDefinition.getTypedFallbackValue). Names: a type typescript-usd
// already names keeps that name (VtValueTypes: bool, int, int64 for
// int64_t, double, string, token for TfToken, VtDictionary; VtArray<T> is
// '<T>[]'); every other type has its upstream TfType name with libc++'s
// inline namespace and default template arguments removed (the native
// names are pxr/usd/sdf/tests/fixtures/schemaFieldTypes/expected.json).
const standardFieldValueTypes = new Map<string, string>([
  ['active', 'bool'],
  ['allowedTokens', 'token[]'],
  ['arraySizeConstraint', 'int64'],
  ['assetInfo', 'VtDictionary'],
  ['timeSamples', 'map<double, VtValue>'],
  ['clips', 'VtDictionary'],
  ['clipSets', 'SdfListOp<string>'],
  ['colorConfiguration', 'SdfAssetPath'],
  ['colorManagementSystem', 'token'],
  ['colorSpace', 'token'],
  ['comment', 'string'],
  ['connectionPaths', 'SdfListOp<SdfPath>'],
  ['custom', 'bool'],
  ['customData', 'VtDictionary'],
  ['customLayerData', 'VtDictionary'],
  ['displayGroup', 'string'],
  ['displayGroupOrder', 'string[]'],
  ['displayName', 'string'],
  ['displayUnit', 'TfEnum'],
  ['documentation', 'string'],
  ['defaultPrim', 'token'],
  ['endFrame', 'double'],
  ['endTimeCode', 'double'],
  ['expressionVariables', 'VtDictionary'],
  ['framePrecision', 'int'],
  ['framesPerSecond', 'double'],
  ['hidden', 'bool'],
  ['hasOwnedSubLayers', 'bool'],
  ['instanceable', 'bool'],
  ['inheritPaths', 'SdfListOp<SdfPath>'],
  ['kind', 'token'],
  ['limits', 'VtDictionary'],
  ['owner', 'string'],
  ['primOrder', 'vector<TfToken>'],
  ['noLoadHint', 'bool'],
  ['payload', 'SdfListOp<SdfPayload>'],
  ['permission', 'SdfPermission'],
  ['prefix', 'string'],
  ['prefixSubstitutions', 'VtDictionary'],
  ['propertyOrder', 'vector<TfToken>'],
  ['references', 'SdfListOp<SdfReference>'],
  ['sessionOwner', 'string'],
  ['specializes', 'SdfListOp<SdfPath>'],
  ['spline', 'TsSpline'],
  ['suffix', 'string'],
  ['suffixSubstitutions', 'VtDictionary'],
  ['targetPaths', 'SdfListOp<SdfPath>'],
  ['layerRelocates', 'vector<pair<SdfPath, SdfPath>>'],
  ['specifier', 'SdfSpecifier'],
  ['startFrame', 'double'],
  ['startTimeCode', 'double'],
  ['subLayers', 'vector<string>'],
  ['subLayerOffsets', 'vector<SdfLayerOffset>'],
  ['symmetricPeer', 'string'],
  ['symmetryArgs', 'VtDictionary'],
  ['symmetryArguments', 'VtDictionary'],
  ['symmetryFunction', 'token'],
  ['timeCodesPerSecond', 'double'],
  ['typeName', 'token'],
  ['variantSetNames', 'SdfListOp<string>'],
  ['variantSelection', 'map<string, string>'],
  ['variability', 'SdfVariability'],
  ['connectionChildren', 'vector<SdfPath>'],
  ['expressionChildren', 'vector<TfToken>'],
  ['mapperArgChildren', 'vector<TfToken>'],
  ['mapperChildren', 'vector<SdfPath>'],
  ['primChildren', 'vector<TfToken>'],
  ['properties', 'vector<TfToken>'],
  ['targetChildren', 'vector<SdfPath>'],
  ['variantChildren', 'vector<TfToken>'],
  ['variantSetChildren', 'vector<TfToken>'],
])

for (const [field, valueType] of standardFieldValueTypes) {
  const info = standardFields.get(field)
  if (info) info.valueType = valueType
}

function optionalValueType(valueType: string | undefined): { valueType?: string } {
  return valueType === undefined ? {} : { valueType }
}

// The list op types of _GetDefaultValueForListOp (schema.cpp:1658-1680).
const listOpValueTypes = new Map<string, string>([
  ['intlistop', 'SdfListOp<int>'],
  ['int64listop', 'SdfListOp<long long>'],
  ['uintlistop', 'SdfListOp<unsigned int>'],
  ['uint64listop', 'SdfListOp<unsigned long long>'],
  ['stringlistop', 'SdfListOp<string>'],
  ['tokenlistop', 'SdfListOp<TfToken>'],
])

// The TfType of the scalar Sdf value types that VtValueTypes does not name
// (SdfValueTypeName::GetType(), types.cpp's SdfValueTypeNames).
function scalarTfTypeName(type: string): string {
  switch (type) {
    case 'asset': return 'SdfAssetPath'
    case 'timecode': return 'SdfTimeCode'
    case 'pathExpression': return 'SdfPathExpression'
    case 'opaque': return 'SdfOpaqueValue'
  }
  return type
}

/**
 * @internal The TfType name of the fallback a plugin metadata field of value
 * type `valueTypeName` gets (_GetDefaultMetadataValue, schema.cpp:1682-1730):
 * VtDictionary, a list op, or the SdfValueTypeName's type; undefined when
 * the name is not a registered value type.
 */
export function _sdfMetadataValueTypeName(valueTypeName: string): string | undefined {
  if (valueTypeName === 'dictionary') return 'VtDictionary'
  const listOp = listOpValueTypes.get(valueTypeName)
  if (listOp) return listOp
  const valueType = findValueTypeName(valueTypeName)
  if (!valueType) return undefined
  if (valueType.isArray && valueType.scalarType) {
    return `${scalarTfTypeName(valueType.scalarType.type)}[]`
  }
  return scalarTfTypeName(valueType.type)
}

/**
 * @internal The TfType a typed read holds for a value of TfType name
 * `typeName` (VtValueTypes when it names one, else a declared type).
 */
export function _sdfTfTypeForName(typeName: string): TfType {
  return (VtValueTypes as Record<string, TfType>)[typeName] ??
    (typeName === 'VtDictionary' ? VtValueTypes.dictionary : TfType.declare(typeName))
}

/**
 * @internal A VtValue holding the typescript-usd value shape `value` as the
 * TfType named `typeName`: a VtArray, or a JS array of a '<T>[]' type, is held
 * array-valued; a string held as a String object is unboxed. Dictionaries keep
 * their JS object shape (typescript-usd metadata dictionaries are plain
 * objects), held as VtDictionary. `undefined` is the empty VtValue.
 */
export function _sdfMakeTypedValue(value: unknown, typeName: string): VtValue {
  if (value === undefined || value === null) return VtValue.getEmpty()
  if (value instanceof VtValue) return value
  if (value instanceof VtArray) return VtValue.createArray(value as VtArray<unknown>)
  if (typeName.endsWith('[]') && Array.isArray(value)) {
    return VtValue.createArray(new VtArray<unknown>(value, _sdfTfTypeForName(typeName.slice(0, -2))))
  }
  const held = typeof value === 'object' && value instanceof String ? String(value) : value
  return VtValue.create(held, _sdfTfTypeForName(typeName))
}

// The validators _RegisterStandardFields attaches (schema.cpp:686-835).
{
  const pathOf = (value: unknown): SdfPath =>
    value instanceof SdfPath ? value : SdfPath.fromString(String(value))
  const attach = (field: string, validators: Partial<StandardFieldInfo>): void => {
    Object.assign(standardFields.get(field)!, validators)
  }
  const identifier: SdfValidator = v => SdfSchema.isValidIdentifier(String(v))
  const namespacedIdentifier: SdfValidator = v => SdfSchema.isValidNamespacedIdentifier(String(v))
  const nonEmptyString: SdfValidator = v => typeof v === 'string' && v !== ''
    ? SdfAllowed.allowed() : new SdfAllowed('Value must be a non-empty string')
  const isString: SdfValidator = v => typeof v === 'string'
    ? SdfAllowed.allowed() : new SdfAllowed('Value must be a string')
  const sceneDescriptionValue: SdfValidator = v => SdfSchema.isValidValue(v)
  attach('default', { value: sceneDescriptionValue })
  // OpenUSD 26.11.1 schema.cpp:345-353,776-777. Deliberately allows +inf.
  attach('framesPerSecond', { value: v => typeof v !== 'number'
    ? new SdfAllowed('Expected value of type double')
    : new SdfAllowed(v > 0, 'Value must be greater than 0') })
  attach('assetInfo', { mapKey: identifier, mapValue: sceneDescriptionValue })
  attach('connectionPaths', { listValue: v => SdfSchema.isValidAttributeConnectionPath(pathOf(v)) })
  attach('customData', { mapKey: identifier, mapValue: sceneDescriptionValue })
  attach('customLayerData', { mapKey: identifier, mapValue: sceneDescriptionValue })
  attach('inheritPaths', { listValue: v => SdfSchema.isValidInheritPath(pathOf(v)) })
  attach('primOrder', { listValue: identifier })
  attach('payload', { listValue: v => SdfSchema.isValidPayload(v as SdfReferenceLike) })
  attach('prefixSubstitutions', { mapKey: nonEmptyString, mapValue: isString })
  attach('propertyOrder', { listValue: namespacedIdentifier })
  attach('references', { listValue: v => SdfSchema.isValidReference(v as SdfReferenceLike) })
  attach('specializes', { listValue: v => SdfSchema.isValidSpecializesPath(pathOf(v)) })
  attach('suffixSubstitutions', { mapKey: nonEmptyString, mapValue: isString })
  attach('targetPaths', { listValue: v => SdfSchema.isValidRelationshipTargetPath(pathOf(v)) })
  attach('layerRelocates', {
    listValue: v => SdfSchema.isValidRelocate(v as readonly [unknown, unknown]),
  })
  attach('subLayers', { listValue: v => SdfSchema.isValidSubLayer(String(v)) })
  attach('symmetryArgs', { mapKey: identifier, mapValue: sceneDescriptionValue })
  attach('symmetryArguments', { mapKey: identifier, mapValue: sceneDescriptionValue })
  attach('variantSetNames', { listValue: identifier })
  attach('variantSelection', { mapValue: v => SdfSchema.isValidVariantSelection(String(v)) })
  attach('connectionChildren', { listValue: v => SdfSchema.isValidAttributeConnectionPath(pathOf(v)) })
  attach('mapperArgChildren', { listValue: identifier })
  attach('mapperChildren', { listValue: v => SdfSchema.isValidAttributeConnectionPath(pathOf(v)) })
  attach('primChildren', { listValue: identifier })
  attach('properties', { listValue: identifier })
  attach('targetChildren', { listValue: v => SdfSchema.isValidRelationshipTargetPath(pathOf(v)) })
  attach('variantChildren', { listValue: v => SdfSchema.isValidVariantIdentifier(String(v)) })
  attach('variantSetChildren', { listValue: identifier })
}

interface SdfReferenceLike { primPath?: string | SdfPath }

const requiredFieldNames = new Set<string>()

interface SpecFieldInfo { required: boolean; metadata: boolean; displayGroup: string }

// SdfSchemaBase::SpecDefinition (schema.h:157-203).
export class SdfSpecDefinition {
  private readonly _fields = new Map<string, SpecFieldInfo>()
  private _requiredFields: string[] = []

  getFields(): string[] { return [...this._fields.keys()] }
  getRequiredFields(): readonly string[] { return this._requiredFields }
  getMetadataFields(): string[] {
    return [...this._fields].filter(([, info]) => info.metadata).map(([name]) => name)
  }
  isValidField(name: string): boolean { return this._fields.has(name) }
  isMetadataField(name: string): boolean { return this._fields.get(name)?.metadata ?? false }
  getMetadataFieldDisplayGroup(name: string): string {
    const info = this._fields.get(name)
    return info?.metadata ? info.displayGroup : ''
  }
  isRequiredField(name: string): boolean { return this._fields.get(name)?.required ?? false }

  /** @internal _SpecDefiner::Field / MetadataField. */
  _addField(name: string, required: boolean, metadata = false, displayGroup = ''): this {
    if (!standardFields.has(name)) throw new Error(`Field '${name}' has not been registered`)
    this._fields.set(name, { required, metadata, displayGroup })
    if (required) {
      requiredFieldNames.add(name)
      if (!this._requiredFields.includes(name)) this._requiredFields = [...this._requiredFields, name]
    }
    return this
  }

  /** @internal _SpecDefiner::CopyFrom. */
  _copyFrom(other: SdfSpecDefinition): this {
    for (const [name, info] of other._fields) this._addField(name, info.required, info.metadata, info.displayGroup)
    return this
  }
}

const specDefinitions = new Map<SdfSpecType, SdfSpecDefinition>()
{
  const define = (specType: SdfSpecType): SdfSpecDefinition => {
    const def = new SdfSpecDefinition()
    specDefinitions.set(specType, def)
    return def
  }
  const meta = (def: SdfSpecDefinition, names: string[], group = ''): void => {
    for (const name of names) def._addField(name, false, true, group)
  }
  const plain = (def: SdfSpecDefinition, names: string[]): void => {
    for (const name of names) def._addField(name, false)
  }

  const pseudoRoot = define('pseudoRoot')
  meta(pseudoRoot, ['colorConfiguration', 'colorManagementSystem'])
  plain(pseudoRoot, ['comment'])
  meta(pseudoRoot, [
    'customLayerData', 'defaultPrim', 'documentation', 'endTimeCode', 'expressionVariables',
    'framesPerSecond', 'framePrecision', 'hasOwnedSubLayers', 'owner', 'sessionOwner',
    'startTimeCode', 'timeCodesPerSecond', 'endFrame', 'startFrame',
  ])
  plain(pseudoRoot, ['primChildren', 'layerRelocates', 'primOrder', 'subLayers', 'subLayerOffsets'])

  const prim = define('prim')
  prim._addField('specifier', true)
  plain(prim, [
    'comment', 'inheritPaths', 'specializes', 'primChildren', 'primOrder', 'properties',
    'propertyOrder', 'references', 'variantSelection', 'variantSetChildren',
    'variantSetNames',
  ])
  meta(prim, [
    'active', 'assetInfo', 'clips', 'clipSets', 'customData', 'displayGroupOrder', 'displayName',
    'documentation', 'hidden', 'instanceable', 'kind', 'payload', 'permission', 'prefix',
    'prefixSubstitutions', 'suffix', 'suffixSubstitutions',
  ], 'core')
  meta(prim, ['symmetricPeer', 'symmetryArguments', 'symmetryFunction'], 'symmetry')
  meta(prim, ['typeName'], 'core')

  // The property spec definition is the basis for attributes and relationships.
  const property = new SdfSpecDefinition()
  property._addField('custom', true)._addField('variability', true)
  plain(property, ['comment', 'default'])
  meta(property, [
    'assetInfo', 'customData', 'displayGroup', 'displayName', 'documentation', 'hidden',
    'permission', 'prefix', 'suffix',
  ], 'core')
  meta(property, ['symmetricPeer', 'symmetryArguments', 'symmetryFunction'], 'symmetry')

  const attribute = define('attribute')._copyFrom(property)
  attribute._addField('typeName', true)
  plain(attribute, ['spline', 'connectionChildren', 'connectionPaths', 'displayUnit', 'timeSamples'])
  meta(attribute, ['allowedTokens', 'arraySizeConstraint', 'colorSpace', 'limits'], 'core')

  define('connection')

  const relationship = define('relationship')._copyFrom(property)
  plain(relationship, ['targetChildren', 'targetPaths'])
  meta(relationship, ['noLoadHint'], 'core')

  define('relationshipTarget')

  plain(define('variantSet'), ['variantChildren'])

  define('variant')._copyFrom(prim)

  // The statically registered plugin metadata fields.
  for (const [name, definition] of metadataFields) {
    if (standardFields.has(name)) continue
    standardFields.set(name, {
      fallback: () => cloneFallback(definition.fallback), plugin: true,
      ...optionalValueType(_sdfMetadataValueTypeName(definition.typeName)),
    })
    const appliesTo = definition.appliesTo
    const applies = (...names: string[]): boolean => !appliesTo?.size || names.some(n => appliesTo.has(n))
    if (applies('layers')) pseudoRoot._addField(name, false, true)
    if (applies('prims')) prim._addField(name, false, true)
    if (applies('properties', 'attributes')) attribute._addField(name, false, true)
    if (applies('properties', 'relationships')) relationship._addField(name, false, true)
    if (applies('variants', 'prims')) specDefinitions.get('variant')!._addField(name, false, true)
  }
}

// The registered metadata fields with a plugin-declared type also carry their
// concrete value type (typescript-usd keeps it on the field definition).
function metadataTypeName(fieldName: string): string {
  return metadataFields.get(fieldName)?.typeName ?? ''
}

// SdfSchemaBase::FieldDefinition (schema.h:53-140).
export class SdfFieldDefinition {
  constructor(
    readonly name: string,
    private readonly _definition: StandardFieldInfo,
  ) {}
  getName(): string { return this.name }
  getFallbackValue(): unknown { return this._definition.fallback() }
  /**
   * FieldDefinition::GetFallbackValue (schema.cpp:88-92) as upstream's typed
   * VtValue: the fallback held as its registered C++ type; the empty VtValue
   * for a field whose fallback is empty (Default).
   */
  getTypedFallbackValue(): VtValue {
    const valueType = this._definition.valueType
    if (valueType === undefined) return VtValue.getEmpty()
    const fallback = this._definition.fallback()
    // Spline's fallback is a default TsSpline upstream and undefined in
    // typescript-usd's value shapes; it is still held as a TsSpline.
    return fallback === undefined ? VtValue.create(undefined, _sdfTfTypeForName(valueType))
      : _sdfMakeTypedValue(fallback, valueType)
  }
  /** @internal The TfType name of the typed fallback (getTypedFallbackValue). */
  _getValueTypeName(): string | undefined { return this._definition.valueType }
  /** typescript-usd: a plugin field's declared value type ('' for standard fields). */
  getTypeName(): string { return metadataTypeName(this.name) }
  getFallback(): unknown { return this.getFallbackValue() }
  getInfo(): Readonly<Record<string, unknown>> {
    return metadataFields.get(this.name)?.info ?? {}
  }
  isPlugin(): boolean { return this._definition.plugin ?? false }
  isReadOnly(): boolean { return this._definition.readOnly ?? false }
  holdsChildren(): boolean { return this._definition.children ?? false }
  // SdfSchemaBase::FieldDefinition::IsValidValue (schema.cpp:167-172).
  isValidValue(value: unknown): SdfAllowed {
    return this._definition.value?.(value) ?? SdfAllowed.allowed()
  }
  isValidListValue(value: unknown): SdfAllowed {
    return this._definition.listValue?.(value) ?? SdfAllowed.allowed()
  }
  isValidMapKey(value: unknown): SdfAllowed {
    return this._definition.mapKey?.(value) ?? SdfAllowed.allowed()
  }
  isValidMapValue(value: unknown): SdfAllowed {
    return this._definition.mapValue?.(value) ?? SdfAllowed.allowed()
  }
}

export class SdfSchema {
  private static readonly _instance = new SdfSchema()
  static getInstance(): SdfSchema { return this._instance }

  // SdfSchemaBase::IsValidFieldForSpec.
  isValidFieldForSpec(fieldName: string, specType: SdfSpecType | SdfMetadataSpecType): boolean {
    const type: SdfSpecType = specType === 'layer' ? 'pseudoRoot' : specType
    return specDefinitions.get(type)?.isValidField(fieldName) ?? false
  }

  // SdfSchemaBase::GetFallback.
  getFallback(fieldName: string): unknown {
    return standardFields.get(fieldName)?.fallback()
  }

  // SdfSchemaBase::IsRegistered.
  isRegistered(fieldName: string): boolean {
    return standardFields.has(fieldName)
  }

  // SdfSchemaBase::HoldsChildren.
  holdsChildren(fieldName: string): boolean {
    return standardFields.get(fieldName)?.children ?? false
  }

  getFieldDefinition(fieldName: string): SdfFieldDefinition | undefined {
    const definition = standardFields.get(fieldName)
    return definition ? new SdfFieldDefinition(fieldName, definition) : undefined
  }

  getSpecDefinition(specType: SdfSpecType): SdfSpecDefinition | undefined {
    return specDefinitions.get(specType)
  }

  getFields(specType: SdfSpecType): string[] {
    return specDefinitions.get(specType)?.getFields() ?? []
  }

  getMetadataFields(specType: SdfSpecType): string[] {
    return specDefinitions.get(specType)?.getMetadataFields() ?? []
  }

  getMetadataFieldDisplayGroup(specType: SdfSpecType, metadataField: string): string {
    return specDefinitions.get(specType)?.getMetadataFieldDisplayGroup(metadataField) ?? ''
  }

  getRequiredFields(specType: SdfSpecType): readonly string[] {
    return specDefinitions.get(specType)?.getRequiredFields() ?? []
  }

  isRequiredFieldName(fieldName: string): boolean {
    return requiredFieldNames.has(fieldName)
  }

  // SdfSchemaBase::IsValidValue (schema.cpp:1187-1232): whether `value`
  // holds a scene description value type. Dictionaries are valid when each
  // of their values is.
  static isValidValue(value: unknown): SdfAllowed {
    if (value === undefined) return SdfAllowed.allowed()
    if (_sdfIsDictionary(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (!SdfSchema.isValidValue(item).isAllowed()) {
          return new SdfAllowed(`Value for key '${key}' does not have a valid scene description type ` +
            `(${_sdfValueTypeNameForError(item)})`)
        }
      }
    } else if (value instanceof SdfPathExpression) {
      // Path expressions must be absolute, following requirements for other
      // SdfPaths written to files.
      if (!value.isAbsolute()) {
        return new SdfAllowed(`pathExpression paths must be absolute paths ("${value.getText()}")`)
      }
    } else if (!_sdfIsSceneDescriptionValueType(value)) {
      return new SdfAllowed(
        `Value does not have a valid scene description type (${_sdfValueTypeNameForError(value)})`)
    }
    return SdfAllowed.allowed()
  }

  // ---- Value validation (schema.cpp:1283-1520) ----

  static isValidIdentifier(identifier: string): SdfAllowed {
    return SdfPath.isValidIdentifier(identifier) ? SdfAllowed.allowed()
      : new SdfAllowed(`"${identifier}" is not a valid identifier`)
  }

  static isValidNamespacedIdentifier(identifier: string): SdfAllowed {
    return SdfPath.isValidNamespacedIdentifier(identifier) ? SdfAllowed.allowed()
      : new SdfAllowed(`"${identifier}" is not a valid identifier`)
  }

  // The path parser's VariantName rule (pathParser.h:105-107): an optional
  // leading '.', then identifier characters, '|' and '-'.
  static isValidVariantIdentifier(identifier: string): SdfAllowed {
    return /^\.?[\p{ID_Continue}_|-]*$/u.test(identifier) ? SdfAllowed.allowed()
      : new SdfAllowed(`"${identifier}" is not a valid variant name`)
  }

  static isValidVariantSelection(selection: string): SdfAllowed {
    if (sdfIsVariableExpression(selection)) return SdfAllowed.allowed()
    return SdfSchema.isValidVariantIdentifier(selection)
  }

  static isValidRelocatesSourcePath(path: SdfPath): SdfAllowed {
    if (pathContainsProhibitedVariantSelection(path)) {
      return new SdfAllowed('Relocate paths cannot contain variant selections')
    }
    if (!path.isPrimPath()) {
      return new SdfAllowed(`Relocate path <${path.pathString}> must be a prim path`)
    }
    return SdfAllowed.allowed()
  }

  static isValidRelocatesTargetPath(path: SdfPath): SdfAllowed {
    // Relocates target paths are allowed to be empty but source paths are not.
    if (path.isEmpty()) return SdfAllowed.allowed()
    return SdfSchema.isValidRelocatesSourcePath(path)
  }

  static isValidRelocate(relocate: readonly [unknown, unknown]): SdfAllowed {
    const pathOf = (value: unknown): SdfPath =>
      value instanceof SdfPath ? value : SdfPath.fromString(String(value))
    const source = SdfSchema.isValidRelocatesSourcePath(pathOf(relocate[0]))
    if (!source.isAllowed()) return source
    return SdfSchema.isValidRelocatesTargetPath(pathOf(relocate[1]))
  }

  static isValidInheritPath(path: SdfPath): SdfAllowed {
    if (pathContainsProhibitedVariantSelection(path)) {
      return new SdfAllowed('Inherit paths cannot contain variant selections')
    }
    if (!(path.isAbsolutePath() && path.isPrimPath())) {
      return new SdfAllowed('Inherit paths must be absolute prim paths')
    }
    return SdfAllowed.allowed()
  }

  static isValidSpecializesPath(path: SdfPath): SdfAllowed {
    if (pathContainsProhibitedVariantSelection(path)) {
      return new SdfAllowed('Specializes paths cannot contain variant selections')
    }
    if (!(path.isAbsolutePath() && path.isPrimPath())) {
      return new SdfAllowed('Specializes paths must be absolute prim paths')
    }
    return SdfAllowed.allowed()
  }

  static isValidAttributeConnectionPath(path: SdfPath): SdfAllowed {
    if (path.containsPrimVariantSelection()) {
      return new SdfAllowed('Attribute connection paths cannot contain variant selections')
    }
    if (path.isAbsolutePath() && (path.isPropertyPath() || path.isPrimPath())) {
      return SdfAllowed.allowed()
    }
    return new SdfAllowed(
      `Connection paths must be absolute prim or property paths: <${path.pathString}>`)
  }

  static isValidRelationshipTargetPath(path: SdfPath): SdfAllowed {
    if (path.containsPrimVariantSelection()) {
      return new SdfAllowed('Relationship target paths cannot contain variant selections')
    }
    if (path.isAbsolutePath() && (path.isPropertyPath() || path.isPrimPath())) {
      return SdfAllowed.allowed()
    }
    return new SdfAllowed(
      'Relationship target paths must be absolute prim, property or mapper paths')
  }

  static isValidReference(reference: { primPath?: string | SdfPath }): SdfAllowed {
    return validateArcPrimPath(reference.primPath, 'Reference')
  }

  static isValidPayload(payload: { primPath?: string | SdfPath }): SdfAllowed {
    return validateArcPrimPath(payload.primPath, 'Payload')
  }

  static isValidSubLayer(subLayer: string): SdfAllowed {
    if (subLayer === '') return new SdfAllowed('Sublayer paths must not be empty')
    return SdfAllowed.allowed()
  }
}

// _PathContainsProhibitedVariantSelection (schema.cpp:1336-1342), with
// SDF_SCHEMA_PROHIBIT_INVALID_VARIANT_SELECTIONS at its default of 1.
function pathContainsProhibitedVariantSelection(path: SdfPath): boolean {
  return path.containsPrimVariantSelection()
}

function validateArcPrimPath(primPath: string | SdfPath | undefined, kind: string): SdfAllowed {
  // SdfReference/SdfPayload hold an SdfPath, empty when the arc names no prim;
  // an empty string here is that empty path, not text to parse.
  const path = primPath instanceof SdfPath ? primPath : primPath ? SdfPath.fromString(primPath) : SdfPath.emptyPath
  if (pathContainsProhibitedVariantSelection(path)) {
    return new SdfAllowed(`${kind} paths cannot contain variant selections`)
  }
  if (!path.isEmpty() && !(path.isAbsolutePath() && path.isPrimPath())) {
    return new SdfAllowed(
      `${kind} prim path <${path.pathString}> must be either empty or an absolute prim path`)
  }
  return SdfAllowed.allowed()
}

export function _sdfGetMetadataFieldType(
  fieldName: string, specType: SdfMetadataSpecType,
): string | undefined {
  const definition = metadataFields.get(fieldName)
  if (!definition) return undefined
  if (!definition.appliesTo) return definition.typeName
  const upstreamName = specType === 'layer' ? 'layers'
    : specType === 'prim' ? 'prims'
    : specType === 'attribute' ? 'attributes'
    : specType === 'relationship' ? 'relationships'
    : 'variants'
  if (definition.appliesTo.has(upstreamName)) return definition.typeName
  if ((specType === 'attribute' || specType === 'relationship') &&
      definition.appliesTo.has('properties')) return definition.typeName
  // Sdf applies prim metadata to variant specs as well (schema.cpp:1840-1848).
  if (specType === 'variant' && definition.appliesTo.has('prims')) return definition.typeName
  return undefined
}

export function _sdfTransformMetadataValue(
  value: unknown, typeName: string | undefined, transformTime: (time: number) => number,
  durationScale = transformTime(1) - transformTime(0),
): unknown {
  // usd/stage.cpp:691-708 transforms held Duration values relatively even in
  // nested dictionaries. Callers with a layer offset supply its exact scale.
  const duration = (item: unknown): unknown => item instanceof GfDuration || typeof item === 'number'
    ? new GfDuration(Number(item) * durationScale) : item
  if (value instanceof GfDuration || typeName === 'duration') return duration(value)
  if (typeName === 'duration[]' || value instanceof VtArray && value.getElementType().getTypeName() === 'GfDuration') {
    if (value instanceof VtArray) return new VtArray(value.toArray().map(duration), value.getElementType())
    return Array.isArray(value) ? value.map(duration) : value
  }
  if (typeName === 'timecode') {
    return typeof value === 'number' ? transformTime(value) : value
  }
  if (typeName === 'timecode[]') {
    const transform = (item: unknown) => typeof item === 'number' ? transformTime(item) : item
    if (value instanceof VtArray) return new VtArray(value.toArray().map(transform), value.getElementType())
    return Array.isArray(value) ? value.map(transform) : value
  }
  if (typeName !== 'dictionary' || !isDictionary(value)) return value
  const types = dictionaryValueTypes.get(value)
  const transformed: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    transformed[key] = _sdfTransformMetadataValue(item, types?.get(key), transformTime, durationScale)
  }
  if (types) dictionaryValueTypes.set(transformed, types)
  return transformed
}

export function _sdfVisitTypedValue(
  value: unknown,
  typeName: string | undefined,
  visit: (value: unknown, typeName: string | undefined) => void,
): void {
  if (typeName === 'dictionary' && isDictionary(value)) {
    const types = dictionaryValueTypes.get(value)
    for (const [key, item] of Object.entries(value)) {
      _sdfVisitTypedValue(item, types?.get(key), visit)
    }
    return
  }
  visit(value, typeName)
}

export function _sdfMapTypedValue(
  value: unknown,
  typeName: string | undefined,
  map: (value: unknown, typeName: string | undefined) => unknown,
): unknown {
  if (typeName !== 'dictionary' || !isDictionary(value)) return map(value, typeName)
  const types = dictionaryValueTypes.get(value)
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = _sdfMapTypedValue(item, types?.get(key), map)
  }
  if (types) dictionaryValueTypes.set(result, types)
  return result
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return _sdfIsDictionary(value)
}

/** Whether `value` is a Gf vector, matrix or quaternion value. */
// The C++ value types of the registered value type names (types.cpp).
let sceneDescriptionCppTypes: Set<string> | undefined

// SdfSchemaBase::FindType(const VtValue&) succeeds (schema.cpp:1264-1268).
// JS primitives and arrays carry the scalar and array value types; class
// instances must be of a registered value type.
function _sdfIsSceneDescriptionValueType(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  if (Array.isArray(value)) return value.every(item => _sdfIsSceneDescriptionValueType(item))
  if (value instanceof VtArray || _sdfIsGfValue(value)) return true
  sceneDescriptionCppTypes ??= new Set(Object.values(ValueTypeNames).map(t => t.cppTypeName))
  const ctorName = (value.constructor as { name?: string } | undefined)?.name
  return ctorName !== undefined && sceneDescriptionCppTypes.has(ctorName)
}

function _sdfValueTypeNameForError(value: unknown): string {
  if (value === null || typeof value !== 'object') return typeof value
  return (value.constructor as { name?: string } | undefined)?.name ?? 'object'
}

// A Gf vector, matrix or quaternion: the Vt type kind their bases install
// (vt typeInfo.ts), one property lookup.
export function _sdfIsGfValue(value: unknown): value is GfVecBase | GfMatrixBase | GfQuatBase {
  return value !== null && typeof value === 'object' && vtTypeKind(value) === 'gf'
}

/**
 * Whether `value` is a dictionary value (VtDictionary). Dictionaries are plain
 * JS objects; Gf values, VtArrays, list ops' classes and other value objects
 * have their own prototypes and are never dictionaries.
 */
export function _sdfIsDictionary(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
