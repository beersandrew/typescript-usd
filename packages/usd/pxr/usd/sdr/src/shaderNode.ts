// Ported from OpenUSD 26.11.1: pxr/usd/sdr/shaderNode.cpp,
//  pxr/usd/sdr/shaderNode.h, pxr/usd/sdr/shaderNodeDiscoveryResult.h,
//  pxr/usd/sdr/shaderProperty.h
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// FAITHFULNESS-DEBT(sdr-shader-types-fusion): this TypeScript unit covers
// pxr/usd/sdr/shaderProperty.h and pxr/usd/sdr/shaderNodeDiscoveryResult.h;
// split those value types along the upstream file boundaries.
import { findValueTypeName } from 'typescript-usd/sdf'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { SdrVersion } from './declare.ts'

// Ports the node/property ownership in shaderNode.cpp:31-248 and
// shaderProperty.cpp:639-846.

export type SdrPropertyType =
  | 'Bool' | 'Int' | 'String' | 'Float' | 'Color' | 'Color4' | 'Point'
  | 'Vector' | 'Normal' | 'Matrix' | 'Terminal' | 'Unknown' | 'Struct' | 'Vstruct'
  | 'bool' | 'int' | 'string' | 'float' | 'color' | 'color4' | 'point' | 'vector'
  | 'normal' | 'matrix' | 'terminal' | 'unknown' | 'struct' | 'vstruct'
export type SdrMetadata = Record<string, string>

export interface SdrShaderNodeDiscoveryResult {
  identifier: string
  version: SdrVersion
  name: string
  function: string
  discoveryType: string
  sourceType: string
  uri: string
  resolvedUri: string
  metadata?: SdrMetadata
  blindData?: string
  sourceCode?: string
  subIdentifier?: string
}

// SdrPropertyMetadata (shaderPropertyMetadata.h:22-45): the named property
// metadata keys, spelled as upstream stores them.
export const SdrPropertyMetadata = {
  Label: 'label', Help: 'help', Page: 'page', RenderType: 'renderType', Role: 'role',
  Widget: 'widget', Hints: 'hints', Options: 'options', IsDynamicArray: 'isDynamicArray',
  TupleSize: 'tupleSize', Connectable: 'connectable', Tag: 'tag', ShownIf: 'shownIf',
  ValidConnectionTypes: 'validConnectionTypes', VstructMemberOf: 'vstructMemberOf',
  VstructMemberName: 'vstructMemberName', VstructConditionalExpr: 'vstructConditionalExpr',
  IsAssetIdentifier: '__SDR__isAssetIdentifier', ImplementationName: '__SDR__implementationName',
  SdrUsdDefinitionType: 'sdrUsdDefinitionType', DefaultInput: '__SDR__defaultinput',
  Target: '__SDR__target', Colorspace: '__SDR__colorspace',
} as const

// The metadata is held in its legacy (string) encoding, as
// SdrShaderProperty::GetMetadata returns it. SdrShaderPropertyMetadata's
// constructor from a legacy map and _EncodeLegacyMetadata
// (shaderPropertyMetadata.cpp:73-81, 168-186, 245-277) round-trip the bool
// and int items, which this applies to the given map.
function encodeLegacyPropertyMetadata(metadata: SdrMetadata): SdrMetadata {
  const out: SdrMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    switch (key) {
      case SdrPropertyMetadata.IsDynamicArray: case SdrPropertyMetadata.Connectable:
      case SdrPropertyMetadata.IsAssetIdentifier: case SdrPropertyMetadata.DefaultInput: {
        // _LegacyStringToBool, then _LegacyStringFromBool.
        const boolStr = value.toLowerCase()
        out[key] = boolStr === '0' || boolStr === 'false' || boolStr === 'f' ? '0' : '1'
        break
      }
      case SdrPropertyMetadata.TupleSize: {
        // _LegacyStringToInt (std::stoi; 0 when unparseable).
        const parsed = Number.parseInt(value, 10)
        out[key] = String(Number.isNaN(parsed) ? 0 : parsed)
        break
      }
      default: out[key] = value
    }
  }
  return out
}

const isTrueItem = (metadata: SdrMetadata, key: string): boolean => metadata[key] === '1'

// _GetTokenTypeToSdfType / _GetTokenTypeToSdfArrayType
// (shaderProperty.cpp:28-58): the exact Sdr -> Sdf type mappings.
const tokenTypeToSdfType: Record<string, string> = {
  int: 'int', string: 'string', float: 'float', color: 'color3f', color4: 'color4f',
  point: 'point3f', normal: 'normal3f', vector: 'vector3f', matrix: 'matrix4d',
}

// SdrSdfTypeIndicator (sdfTypeIndicator.h:20-75).
export class SdrSdfTypeIndicator {
  constructor(
    private readonly _sdfType = '',
    private readonly _sdrType = '',
    private readonly _hasSdfTypeMapping = true,
  ) {}
  getSdrType(): string { return this._sdrType }
  hasSdfType(): boolean { return this._hasSdfTypeMapping }
  /** The Sdf value type name (e.g. 'color3f'). */
  getSdfType(): string { return this._sdfType }
}

// _GetSdrUsdDefinitionType (shaderProperty.cpp:136-157): the value type
// named by sdrUsdDefinitionType, by name or alias.
function getSdrUsdDefinitionType(metadata: SdrMetadata): string {
  const sdrUsdDefinitionType = metadata[SdrPropertyMetadata.SdrUsdDefinitionType] ?? ''
  if (!sdrUsdDefinitionType) return ''
  const typeName = findValueTypeName(sdrUsdDefinitionType)
  if (!typeName) {
    TfDiagnosticMgr.GetInstance().postWarning('Invalid SdfValueTypeName or alias provided for ' +
      `sdrUsdDefinitionType metadata: ${sdrUsdDefinitionType}`)
    return ''
  }
  return typeName.name
}

// _IsArray (shaderProperty.cpp:159-165).
const isArrayProperty = (arraySize: number, metadata: SdrMetadata): boolean =>
  arraySize > 0 || isTrueItem(metadata, SdrPropertyMetadata.IsDynamicArray)

// _GetTypeIndicatorFromDefaultMapping (shaderProperty.cpp:167-183).
function getTypeIndicatorFromDefaultMapping(type: string, isArray: boolean): SdrSdfTypeIndicator {
  const sdfType = tokenTypeToSdfType[type]
  if (sdfType !== undefined) return new SdrSdfTypeIndicator(isArray ? `${sdfType}[]` : sdfType, type)
  // Return an indicator that there is no clean mapping.
  return new SdrSdfTypeIndicator('token', type, false)
}

// _Encoding_0::GetTypeAsSdfType (shaderProperty.cpp:190-226).
function getTypeAsSdfTypeEncoding0(type: string, arraySize: number, metadata: SdrMetadata): SdrSdfTypeIndicator {
  const isArray = isArrayProperty(arraySize, metadata)
  // There is one Sdf type (Asset) that is not included in the type mapping
  // because it is determined dynamically.
  if (isTrueItem(metadata, SdrPropertyMetadata.IsAssetIdentifier)) {
    return new SdrSdfTypeIndicator(isArray ? 'string[]' : 'string', type)
  }
  if (type === 'terminal') return new SdrSdfTypeIndicator('token', type, false)
  if (type === 'struct') return new SdrSdfTypeIndicator('string', type)
  if (type === 'vstruct') return new SdrSdfTypeIndicator(isArray ? 'float[]' : 'float', type)
  return getTypeIndicatorFromDefaultMapping(type, isArray)
}

// _Encoding_1::GetTypeAsSdfType (shaderProperty.cpp:229-289).
function getTypeAsSdfTypeEncoding1(type: string, arraySize: number, metadata: SdrMetadata): SdrSdfTypeIndicator {
  const sdfValueTypeName = getSdrUsdDefinitionType(metadata)
  if (sdfValueTypeName) return new SdrSdfTypeIndicator(sdfValueTypeName, type)
  const isArray = isArrayProperty(arraySize, metadata)
  if (isTrueItem(metadata, SdrPropertyMetadata.IsAssetIdentifier)) {
    return new SdrSdfTypeIndicator(isArray ? 'asset[]' : 'asset', type)
  }
  // Several special SdrPropertyTypes map to 'token', the type otherwise
  // reserved for unknown types.
  if (type === 'terminal' || type === 'struct' || type === 'vstruct') {
    return new SdrSdfTypeIndicator(isArray ? 'token[]' : 'token', type)
  }
  // Prefer fixed-dimension int or float types for array sizes 2, 3 and 4.
  if ((type === 'int' || type === 'float') && arraySize >= 2 && arraySize <= 4) {
    return new SdrSdfTypeIndicator(`${type}${arraySize}`, type)
  }
  return getTypeIndicatorFromDefaultMapping(type, isArray)
}

// _UsdEncodingVersions (shaderProperty.cpp:291-296).
const USD_ENCODING_VERSION_CURRENT = 1

// _GetTypeAsSdfType (shaderProperty.cpp:301-319).
function getTypeAsSdfTypeForEncoding(
  type: string, arraySize: number, metadata: SdrMetadata, usdEncodingVersion: number,
): SdrSdfTypeIndicator {
  switch (usdEncodingVersion) {
    case 0: return getTypeAsSdfTypeEncoding0(type, arraySize, metadata)
    case 1: return getTypeAsSdfTypeEncoding1(type, arraySize, metadata)
    // Invalid/unsupported usdEncodingVersion (a TF_DEBUG(SDR_PARSING) message).
    default: return new SdrSdfTypeIndicator('token', type, false)
  }
}

// _GetConvertedSdrTypes and _ConvertSdrPropertyTypeAndArraySize
// (shaderProperty.cpp:96-131, 326-350): a "role" of "none" turns the
// float-tuple types into float arrays. GetRoleFromMetadata
// (shaderMetadataHelpers.cpp:254-268) accepts only SdrPropertyRole tokens.
function convertSdrPropertyTypeAndArraySize(
  type: string, arraySize: number, metadata: SdrMetadata,
): [string, number] {
  const role = metadata[SdrPropertyMetadata.Role] === 'none' ? 'none' : ''
  if (type && role === 'none') {
    if (type === 'color' || type === 'point' || type === 'normal' || type === 'vector') return ['float', 3]
    if (type === 'color4') return ['float', 4]
  }
  return [type, arraySize]
}

export class SdrShaderProperty {
  private _type: string
  private readonly _arraySize: number
  private readonly _metadata: SdrMetadata
  private _usdEncodingVersion = USD_ENCODING_VERSION_CURRENT

  // SdrShaderProperty::SdrShaderProperty (shaderProperty.cpp:631-683). The
  // SdrPropertyTypes tokens are lower case; the type may be given in the
  // capitalized spelling of their C++ identifiers.
  constructor(
    private readonly _name: string,
    type: SdrPropertyType,
    private readonly _defaultValue: unknown,
    private readonly _isOutput: boolean,
    arraySize = 0,
    metadata: SdrMetadata = {},
    private readonly _sourceCode = '',
    // The SdrOptionVec constructor argument (shaderProperty.h:69-78). When
    // it is not given, the options are read from the 'options' metadata.
    private readonly _options?: readonly [string, string][],
  ) {
    this._metadata = encodeLegacyPropertyMetadata(metadata)
    const [convertedType, convertedArraySize] =
      convertSdrPropertyTypeAndArraySize(type.toLowerCase(), arraySize, this._metadata)
    this._type = convertedType
    this._arraySize = convertedArraySize
  }
  getName(): string { return this._name }
  getType(): SdrPropertyType { return this._type as SdrPropertyType }
  isOutput(): boolean { return this._isOutput }
  getArraySize(): number { return this._arraySize }
  isArray(): boolean { return isArrayProperty(this._arraySize, this._metadata) }
  isDynamicArray(): boolean { return isTrueItem(this._metadata, SdrPropertyMetadata.IsDynamicArray) }
  getDefaultValue(): unknown { return this._defaultValue }
  getMetadata(): SdrMetadata { return { ...this._metadata } }
  getMetadataByKey(key: string): string | undefined { return this._metadata[key] }
  isAssetIdentifier(): boolean { return isTrueItem(this._metadata, SdrPropertyMetadata.IsAssetIdentifier) }
  isDefaultInput(): boolean { return isTrueItem(this._metadata, SdrPropertyMetadata.DefaultInput) }
  // Outputs are always connectable (shaderProperty.cpp:652-659).
  isConnectable(): boolean {
    return this._isOutput || this._metadata[SdrPropertyMetadata.Connectable] !== '0'
  }
  // SdrShaderProperty::GetTypeAsSdfType (shaderProperty.cpp:827-832). Returns
  // the Sdf value type name; the full indicator is getTypeAsSdfTypeIndicator.
  getTypeAsSdfType(): string { return this.getTypeAsSdfTypeIndicator().getSdfType() }
  getTypeAsSdfTypeIndicator(): SdrSdfTypeIndicator {
    return getTypeAsSdfTypeForEncoding(this._type, this._arraySize, this._metadata, this._usdEncodingVersion)
  }
  // SdrShaderProperty::_SetUsdEncodingVersion (shaderProperty.cpp:846-850).
  _setUsdEncodingVersion(usdEncodingVersion: number): void { this._usdEncodingVersion = usdEncodingVersion }
  // SdrShaderProperty::_ConvertToVStruct (shaderProperty.cpp:852-860).
  // FAITHFULNESS-DEBT(sdr-default-value-vtvalue): upstream also resets the
  // default value to the resulting Sdf type's default; the raw default is
  // kept here.
  _convertToVStruct(): void { this._type = 'vstruct' }
  // SdrShaderProperty::GetOptions (shaderProperty.h:198).
  getOptions(): [string, string][] {
    if (this._options) return this._options.map(([name, value]) => [name, value])
    return (this._metadata['options'] ?? '').split('|').filter(Boolean).map(option => {
      const separator = option.indexOf('=')
      return separator < 0
        ? [option, '']
        : [option.slice(0, separator), option.slice(separator + 1)]
    })
  }
  getHelp(): string { return this._metadata['help'] ?? '' }
  getLabel(): string { return this._metadata['label'] ?? '' }
  getPage(): string { return this._metadata['page'] ?? '' }
  // SdrShaderProperty::GetImplementationName (shaderProperty.cpp:715-720).
  getImplementationName(): string {
    return this._metadata[SdrPropertyMetadata.ImplementationName] ?? this._name
  }
  // shaderProperty.cpp:813-824 and shaderProperty.h:228-241: vstruct
  // membership comes from the vstructMemberOf / vstructMemberName metadata.
  isVStructMember(): boolean { return 'vstructMemberName' in this._metadata }
  isVStruct(): boolean { return this.getType() === 'vstruct' }
  getVStructMemberOf(): string { return this._metadata['vstructMemberOf'] ?? '' }
  getVStructMemberName(): string { return this._metadata['vstructMemberName'] ?? '' }
  getShownIf(): string { return this._metadata['shownIf'] ?? shownIfFromConditional(this._metadata) }
}

// _LegacyStringToSdrUsdEncodingVersion (shaderNodeMetadata.cpp:76-86):
// std::stoi, with bogus values defaulted to -1.
function sdrUsdEncodingVersionFromLegacy(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    TfDiagnosticMgr.GetInstance().postWarning('_LegacyStringToSdrUsdEncodingVersion: unable to parse ' +
      `int from given string '${value}', setting -1`)
    return -1
  }
  return parsed
}

function shownIfFromConditional(metadata: SdrMetadata): string {
  const operation = (prefix: string): string => {
    const op = metadata[`${prefix}Op`]
    if (op === 'and' || op === 'or') {
      const left = operation(metadata[`${prefix}Left`] ?? '')
      const right = operation(metadata[`${prefix}Right`] ?? '')
      return left && right ? `${left} ${op === 'and' ? '&&' : '||'} ${right}` : ''
    }
    const symbols: Record<string, string> = { greaterThanOrEqualTo: '>=', greaterThan: '>', lessThanOrEqualTo: '<=', lessThan: '<', equalTo: '==', notEqualTo: '!=' }
    const symbol = op ? symbols[op] : undefined
    const property = metadata[`${prefix}Path`]?.split('/').filter(Boolean).at(-1)
    const value = metadata[`${prefix}Value`]
    return symbol && property !== undefined && value !== undefined ? `${property} ${symbol} ${value}` : ''
  }
  return operation('conditionalVis')
}

export class SdrShaderNode {
  private readonly _inputs = new Map<string, SdrShaderProperty>()
  private readonly _outputs = new Map<string, SdrShaderProperty>()
  constructor(
    private readonly _identifier: string,
    private readonly _version: SdrVersion,
    private readonly _name: string,
    private readonly _function: string,
    private readonly _context: string,
    private readonly _sourceType: string,
    private readonly _definitionURI: string,
    private readonly _implementationURI: string,
    properties: SdrShaderProperty[] = [],
    private readonly _metadata: SdrMetadata = {},
    private readonly _sourceCode = '',
  ) {
    for (const property of properties) {
      (property.isOutput() ? this._outputs : this._inputs).set(property.getName(), property)
    }
    this._postProcessProperties()
    this._initializePrimvars()
  }

  // SdrShaderNode::_PostProcessProperties (shaderNode.cpp:95-132): the
  // node's sdrUsdEncodingVersion goes to every property, and properties
  // named as vstructs become vstructs.
  private _usdEncodingVersion = -1
  private _postProcessProperties(): void {
    const DEFAULT_ENCODING = -1
    const usdEncodingVersion = this._metadata['sdrUsdEncodingVersion'] !== undefined
      ? sdrUsdEncodingVersionFromLegacy(this._metadata['sdrUsdEncodingVersion']) : DEFAULT_ENCODING
    this._usdEncodingVersion = usdEncodingVersion
    const vsNames = this.getAllVstructNames()
    for (const property of [...this._inputs.values(), ...this._outputs.values()]) {
      if (usdEncodingVersion !== DEFAULT_ENCODING) property._setUsdEncodingVersion(usdEncodingVersion)
      if (vsNames.includes(property.getName())) property._convertToVStruct()
    }
  }

  private _primvars: string[] = []
  private _primvarNamingProperties: string[] = []

  // SdrShaderNode::_InitializePrimvars (shaderNode.cpp:353-386). The raw
  // list is the '|'-separated primvars metadata
  // (shaderNodeMetadata.cpp:96-98); "$name" entries name string inputs whose
  // values hold more primvar names.
  private _initializePrimvars(): void {
    const raw = this._metadata['primvars']
    const rawPrimvars = raw ? raw.split('|') : []
    for (const primvar of rawPrimvars) {
      if (primvar.startsWith('$')) {
        const propertyName = primvar.replace(/^\$+/, '')
        const input = this.getShaderInput(propertyName)
        if (input && input.getType() === 'string') this._primvarNamingProperties.push(propertyName)
      } else {
        this._primvars.push(primvar)
      }
    }
  }

  // shaderNode.cpp:139-149.
  getInfoString(): string {
    return `${this._identifier} (context: '${this._context}', version: '${this._version.getString()}', ` +
      `function: '${this._function}'); definition URI: '${this._definitionURI}'; ` +
      `implementation URI: '${this._implementationURI}'`
  }
  // shaderNode.h:295-346: named node metadata.
  getLabel(): string { return this._metadata['label'] ?? '' }
  getCategory(): string { return this._metadata['category'] ?? '' }
  getDepartments(): string[] {
    const value = this._metadata['departments']
    return value ? value.split('|') : []
  }
  getPrimvars(): string[] { return [...this._primvars] }
  getAdditionalPrimvarProperties(): string[] { return [...this._primvarNamingProperties] }

  // SdrShaderNode::GetAllVstructNames (shaderNode.cpp:261-310): properties
  // tagged "vstruct" and the heads that vstruct members name.
  getAllVstructNames(): string[] {
    const vstructs = new Set<string>()
    const hasVstructMetadata = (property: SdrShaderProperty) => property.getMetadataByKey('tag') === 'vstruct'
    for (const properties of [this._inputs, this._outputs]) {
      for (const [name, property] of properties) {
        if (hasVstructMetadata(property)) {
          vstructs.add(name)
          continue
        }
        if (!property.isVStructMember()) continue
        const head = property.getVStructMemberOf()
        if (properties.has(head)) vstructs.add(head)
      }
    }
    return [...vstructs]
  }
  // OpenUSD v26.11.1 shaderNode.cpp:65-67: successful parsing produces properties.
  isValid(): boolean { return this._inputs.size + this._outputs.size > 0 }
  getIdentifier(): string { return this._identifier }
  getShaderVersion(): SdrVersion { return this._version }
  getName(): string { return this._name }
  // shaderNode.cpp:231-236, SdrNodeMetadata->ImplementationName
  // (shaderNodeMetadata.h:40).
  getImplementationName(): string { return this._metadata['__SDR__implementationName'] ?? this._name }
  getFunction(): string { return this._function }
  getContext(): string { return this._context }
  getShadingSystem(): string { return this._sourceType }
  getSourceCode(): string { return this._sourceCode }
  getSourceType(): string { return this._sourceType }
  getResolvedDefinitionURI(): string { return this._definitionURI }
  getResolvedImplementationURI(): string { return this._implementationURI }
  getShaderInputNames(): string[] { return [...this._inputs.keys()] }
  getShaderOutputNames(): string[] { return [...this._outputs.keys()] }
  getShaderInput(name: string): SdrShaderProperty | undefined { return this._inputs.get(name) }
  getShaderOutput(name: string): SdrShaderProperty | undefined { return this._outputs.get(name) }
  getRole(): string { return this._metadata['role'] ?? this._name }
  getHelp(): string { return this._metadata['help'] ?? '' }
  getAssetIdentifierInputNames(): string[] { return this.getShaderInputNames().filter(name => this._inputs.get(name)!.isAssetIdentifier()) }
  getDefaultInput(): SdrShaderProperty | undefined { return [...this._inputs.values()].find(input => input.isDefaultInput()) }
  getPages(): string[] {
    return [...new Set([
      ...this._inputs.values(), ...this._outputs.values(),
    ].map(property => property.getPage()))]
  }
  getPropertyNamesForPage(page: string): string[] {
    return [...this._inputs.values(), ...this._outputs.values()]
      .filter(property => property.getPage() === page)
      .map(property => property.getName())
  }
  getMetadata(): SdrMetadata { return { ...this._metadata, sdrUsdEncodingVersion: String(this._usdEncodingVersion), domain: this._metadata['domain'] ?? 'rendering' } }
  getDataForKey(key: string): unknown {
    const fields: Record<string, unknown> = {
      identifier: this._identifier, version: this._version, name: this._name,
      function: this._function, context: this._context, sourceType: this._sourceType,
      definitionURI: this._definitionURI, implementationURI: this._implementationURI,
    }
    return key in fields ? fields[key] : this._metadata[key]
  }
}
