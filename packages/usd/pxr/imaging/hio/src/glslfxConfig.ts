// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfxConfig.cpp,
//  pxr/imaging/hio/glslfxConfig.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/glslfxConfig.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - Out-params (std::string *errorStr) are `{ value: string }` boxes.
// - VtValue(std::vector<float>(4, 0.0f)) (glslfxConfig.cpp:128,137,198) holds
//   a JS number[] tagged with the TfType declared by name
//   'std::vector<float>', since vt has no TfType for that C++ type.
// - TRACE_FUNCTION scopes (glslfxConfig.cpp:102,222) are omitted.

import {
  Debug as TfDebug,
  MakeTokens as TfMakeTokens,
  TfEnvSetting,
  TfGetEnvSetting,
  Type as TfType,
  type Token as TfToken,
} from 'typescript-usd/tf'
import {
  Dictionary as VtDictionary,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { HioDebugCodes } from './debugCodes.ts'
import { Hio_GetDictionaryFromInput, Hio_VtValueVectorType } from './dictionary.ts'

// glslfxConfig.cpp:23-37
const _tokens = TfMakeTokens({
  attributes: 'attributes',
  techniques: 'techniques',
  metadata: 'metadata',
  parameters: 'parameters',
  parameterOrder: 'parameterOrder',
  textures: 'textures',
  documentation: 'documentation',
  role: 'role',
  color: 'color',
  defVal: 'default',
  source: 'source',
  type: 'type',
})

// glslfxConfig.cpp:39-41
export const HIO_GLSLFX_DEFAULT_VALUE_VALIDATION = new TfEnvSetting<boolean>(
  'HIO_GLSLFX_DEFAULT_VALUE_VALIDATION', true,
  'If true, there is no check that the default value of an attribute matches ' +
  'the type declared in the glslfx config section.')

const _floatVectorType = TfType.declare('std::vector<float>')

/** TfMapLookup (tf/stl.h): the value at `key`, or undefined. */
function _MapLookup(dict: VtDictionary, key: string): VtValue | undefined {
  return dict.get(key)
}

const _isHoldingString = (v: VtValue) => v.IsHolding(VtValueTypes.string)
const _isHoldingDict = (v: VtValue) => v.IsHolding(VtValueTypes.dictionary)
const _isHoldingVector = (v: VtValue) => v.IsHolding(Hio_VtValueVectorType)

// glslfxConfig.cpp:43-48
function _IsFloatOrDouble(v: VtValue): boolean {
  return v.IsHolding(VtValueTypes.float) || v.IsHolding(VtValueTypes.double)
}

// glslfxConfig.cpp:50-55
function _IsInt(v: VtValue): boolean {
  return v.IsHolding(VtValueTypes.int)
}

// glslfxConfig.cpp:57-79: is VtValue holding a vector of floats or doubles
// of length n.
function _IsVec(n: number): (v: VtValue) => boolean {
  return (v: VtValue) => {
    if (!_isHoldingVector(v)) return false
    const vec = v.UncheckedGet<VtValue[]>()
    if (vec.length !== n) return false
    for (let i = 0; i < n; i++) {
      if (!_IsFloatOrDouble(vec[i]!)) return false
    }
    return true
  }
}

const _fourFloats = () => VtValue.create([0, 0, 0, 0], _floatVectorType)
const _vecOfFloats = (n: number) =>
  VtValue.create(Array.from({ length: n }, () => VtValue.create(0, VtValueTypes.float)),
    Hio_VtValueVectorType)

/**
 * _GetDefaultValue (glslfxConfig.cpp:81-199): extract the default value from
 * the attribute dictionary, checking it against the 'type' key.
 */
function _GetDefaultValue(
  attributeName: string,
  attributeDataDict: VtDictionary,
  errorStr: { value: string },
): VtValue {
  // Get default key
  const defaultValue = _MapLookup(attributeDataDict, _tokens.defVal)
  const hasDefaultValue = defaultValue !== undefined

  // Old behavior - so that assets where the default value and the
  // type do not match still work.
  if (hasDefaultValue && !TfGetEnvSetting(HIO_GLSLFX_DEFAULT_VALUE_VALIDATION)) {
    return defaultValue
  }

  // Get type key
  const typeNameValue = _MapLookup(attributeDataDict, _tokens.type)

  if (typeNameValue === undefined) {
    if (hasDefaultValue) {
      // If value but not type specified, just use it.
      return defaultValue
    }
    errorStr.value = `No type or default value for ${attributeName}`
    return _fourFloats()
  }

  if (!_isHoldingString(typeNameValue)) {
    errorStr.value = `Type name for ${attributeName} is not a string`
    if (hasDefaultValue) return defaultValue
    return _fourFloats()
  }

  // glslfxConfig.cpp:140-166
  const typeInfos: Array<{ name: string; defaultValue: () => VtValue; predicate: (v: VtValue) => boolean }> = [
    { name: 'float', defaultValue: () => VtValue.create(0, VtValueTypes.float), predicate: _IsFloatOrDouble },
    { name: 'double', defaultValue: () => VtValue.create(0, VtValueTypes.double), predicate: _IsFloatOrDouble },
    { name: 'int', defaultValue: () => VtValue.create(0, VtValueTypes.int), predicate: _IsInt },
    { name: 'vec2', defaultValue: () => _vecOfFloats(2), predicate: _IsVec(2) },
    { name: 'vec3', defaultValue: () => _vecOfFloats(3), predicate: _IsVec(3) },
    { name: 'vec4', defaultValue: () => _vecOfFloats(4), predicate: _IsVec(4) },
  ]

  const typeName = typeNameValue.UncheckedGet<string>()

  // Find respective typeInfo
  for (const typeInfo of typeInfos) {
    if (typeInfo.name === typeName) {
      if (hasDefaultValue) {
        // Check that our default value matches
        if (typeInfo.predicate(defaultValue)) return defaultValue
        errorStr.value = `Default value for ${attributeName} is not of type ${typeName}`
      }
      // If no default value, use one based on the type.
      return typeInfo.defaultValue()
    }
  }

  // Invalid type name, use or construct default value.
  if (hasDefaultValue) {
    errorStr.value = `Invalid type ${typeName} for ${attributeName}`
    return defaultValue
  }

  errorStr.value = `Invalid type and no default value for ${attributeName}`
  return _fourFloats()
}

/** HioGlslfxConfig::Role (glslfxConfig.h:31-34). */
export enum HioGlslfxConfigRole {
  RoleNone = 0,
  RoleColor = 1,
}

/** HioGlslfxConfig::Parameter (glslfxConfig.h:40-55). */
export class HioGlslfxConfigParameter {
  constructor(
    public name: string,
    public defaultValue: VtValue,
    public docString = '',
    public role: HioGlslfxConfigRole = HioGlslfxConfigRole.RoleNone,
  ) {}
}

/** HioGlslfxConfig::Texture (glslfxConfig.h:63-75). */
export class HioGlslfxConfigTexture {
  constructor(
    public name: string,
    public defaultValue: VtValue,
    public docString = '',
  ) {}
}

/** HioGlslfxConfig::Attribute (glslfxConfig.h:83-95). */
export class HioGlslfxConfigAttribute {
  constructor(
    public name: string,
    public defaultValue: VtValue,
    public docString = '',
  ) {}
}

export type HioGlslfxConfigParameters = HioGlslfxConfigParameter[]
export type HioGlslfxConfigTextures = HioGlslfxConfigTexture[]
export type HioGlslfxConfigAttributes = HioGlslfxConfigAttribute[]
export type HioGlslfxConfigSourceKeys = string[]
export type HioGlslfxConfigMetadataDictionary = VtDictionary

// glslfxConfig.cpp:349-359
function _GetRoleFromString(roleString: string, errorStr: { value: string }): HioGlslfxConfigRole {
  if (roleString === _tokens.color) return HioGlslfxConfigRole.RoleColor
  errorStr.value = `Unknown role specification: ${roleString}`
  return HioGlslfxConfigRole.RoleNone
}

/** HioGlslfxConfig (glslfxConfig.h:21-162). */
export class HioGlslfxConfig {
  static readonly RoleNone = HioGlslfxConfigRole.RoleNone
  static readonly RoleColor = HioGlslfxConfigRole.RoleColor
  static readonly Parameter = HioGlslfxConfigParameter
  static readonly Texture = HioGlslfxConfigTexture
  static readonly Attribute = HioGlslfxConfigAttribute

  readonly #technique: TfToken
  #params: HioGlslfxConfigParameters = []
  #textures: HioGlslfxConfigTextures = []
  #attributes: HioGlslfxConfigAttributes = []
  #metadata: HioGlslfxConfigMetadataDictionary = new VtDictionary()
  // std::map<std::string, SourceKeys>
  #sourceKeyMap = new Map<string, HioGlslfxConfigSourceKeys>()

  /**
   * Create a new HioGlslfxConfig from an input string (glslfxConfig.cpp:
   * 201-209). The `filename` parameter is only used for error reporting.
   */
  static Read(
    technique: TfToken,
    input: string,
    filename: string,
    errorStr: { value: string },
  ): HioGlslfxConfig {
    return new HioGlslfxConfig(technique,
      Hio_GetDictionaryFromInput(input, filename, errorStr), errorStr)
  }

  // private ctor. should only be called by ::Read (glslfxConfig.cpp:211-217)
  private constructor(technique: TfToken, dict: VtDictionary, errors: { value: string }) {
    this.#technique = technique
    this._init(dict, errors)
  }

  // glslfxConfig.cpp:219-229
  private _init(dict: VtDictionary, errors: { value: string }): void {
    this.#params = this._getParameters(dict, errors)
    this.#textures = this._getTextures(dict, errors)
    this.#attributes = this._getAttributes(dict, errors)
    this.#metadata = this._getMetadata(dict, errors)
    this.#sourceKeyMap = this._getSourceKeyMap(dict, errors)
  }

  /** Return the set of source keys for a particular shader stage
   *  (glslfxConfig.cpp:231-237). */
  getSourceKeys(shaderStageKey: TfToken | string): HioGlslfxConfigSourceKeys {
    return [...(this.#sourceKeyMap.get(shaderStageKey) ?? [])]
  }

  // glslfxConfig.cpp:239-347
  private _getSourceKeyMap(dict: VtDictionary, errorStr: { value: string }): Map<string, HioGlslfxConfigSourceKeys> {
    const ret = new Map<string, HioGlslfxConfigSourceKeys>()

    // verify that techiniques is specified
    const techniques = _MapLookup(dict, _tokens.techniques)
    if (techniques === undefined) {
      errorStr.value = `Configuration does not specify ${_tokens.techniques}`
      return ret
    }

    // verify that it holds a VtDictionary
    if (!_isHoldingDict(techniques)) {
      errorStr.value = `${_tokens.techniques} declaration expects a dictionary value`
      return ret
    }

    // allow only one technique for now, but we plan on supporting more in
    // the future
    const techniquesDict = techniques.UncheckedGet<VtDictionary>()

    if (techniquesDict.size === 0) {
      errorStr.value = `No ${_tokens.techniques} specified`
      return ret
    }

    const entry = techniquesDict.find(this.#technique)
    if (entry === undefined) {
      errorStr.value = `No entry for ${_tokens.techniques}: ${this.#technique}`
      return ret
    }

    // get the value of the technique spec
    const techniqueSpec = entry[1]

    // verify that it also holds a VtDictionary
    if (!_isHoldingDict(techniqueSpec)) {
      errorStr.value = `${_tokens.techniques} spec for ${entry[0]} expects a dictionary value`
      return ret
    }

    const specDict = techniqueSpec.UncheckedGet<VtDictionary>()
    // get all of the shader stages specified in the spec
    for (const [shaderStageKey, shaderStageSpec] of specDict) {
      // verify that the shaderStageSpec also holds a VtDictionary
      if (!_isHoldingDict(shaderStageSpec)) {
        errorStr.value = `${entry[0]} spec for ${shaderStageKey} expects a dictionary value`
        return ret
      }

      // get the source value for the shader stage
      const shaderStageDict = shaderStageSpec.UncheckedGet<VtDictionary>()
      const source = _MapLookup(shaderStageDict, _tokens.source)
      if (source === undefined) {
        errorStr.value = `${entry[0]} spec doesn't define ${_tokens.source} for ${shaderStageKey}`
        return ret
      }

      // verify that source holds a list
      if (!_isHoldingVector(source)) {
        errorStr.value = `${_tokens.source} of ${shaderStageKey} for spec ${entry[0]} expects a list`
        return ret
      }

      const sourceList = source.UncheckedGet<VtValue[]>()
      for (const val of sourceList) {
        // verify that this value is a string
        if (!_isHoldingString(val)) {
          errorStr.value = `${_tokens.source} of ${shaderStageKey} for spec ${entry[0]} expects a list of strings`
          return ret
        }

        let keys = ret.get(shaderStageKey)
        if (!keys) ret.set(shaderStageKey, keys = [])
        keys.push(val.UncheckedGet<string>())
      }
    }

    return ret
  }

  /** Return the parameters specified in the configuration
   *  (glslfxConfig.cpp:362-366). */
  getParameters(): HioGlslfxConfigParameters {
    return [...this.#params]
  }

  // glslfxConfig.cpp:368-502
  private _getParameters(dict: VtDictionary, errorStr: { value: string }): HioGlslfxConfigParameters {
    const ret: HioGlslfxConfigParameters = []

    // look for the params section
    const params = _MapLookup(dict, _tokens.parameters)
    if (params === undefined) return ret

    // verify that it holds a VtDictionary
    if (!_isHoldingDict(params)) {
      errorStr.value = `${_tokens.parameters} declaration expects a dictionary value`
      return ret
    }

    // look for the parameterOrder section:
    const paramOrder: string[] = []
    const paramOrderAny = _MapLookup(dict, _tokens.parameterOrder) ?? VtValue.getEmpty()

    if (!paramOrderAny.IsEmpty()) {
      // verify the type
      if (!_isHoldingVector(paramOrderAny)) {
        errorStr.value = `${_tokens.parameterOrder} declaration expects a list of strings`
        return ret
      }

      const paramOrderList = paramOrderAny.UncheckedGet<VtValue[]>()
      for (const val of paramOrderList) {
        // verify that this value is a string
        if (!_isHoldingString(val)) {
          errorStr.value = `${_tokens.parameterOrder} declaration expects a list of strings`
          return ret
        }

        const paramName = val.UncheckedGet<string>()
        if (!paramOrder.includes(paramName)) paramOrder.push(paramName)
      }
    }

    const paramsDict = params.UncheckedGet<VtDictionary>()
    // pre-process the paramsDict in order to get the merged ordering
    for (const [paramName] of paramsDict) {
      if (!paramOrder.includes(paramName)) paramOrder.push(paramName)
    }

    // now go through the params in the specified order
    for (const paramName of paramOrder) {
      // ignore anything specified in the order that isn't in the actual dict
      const paramData = paramsDict.get(paramName)
      if (paramData === undefined) continue

      if (!_isHoldingDict(paramData)) {
        errorStr.value = `${_tokens.parameters} declaration for ${paramName} expects a dictionary value`
        return ret
      }

      // get the default value out
      const paramDataDict = paramData.UncheckedGet<VtDictionary>()
      const defVal = _MapLookup(paramDataDict, _tokens.defVal)
      if (defVal === undefined) {
        errorStr.value = `${_tokens.parameters} declaration for ${paramName} must specify a default value`
        return ret
      }

      // optional documentation string
      let docString = ''
      const docVal = _MapLookup(paramDataDict, _tokens.documentation)
      if (docVal !== undefined) {
        if (!_isHoldingString(docVal)) {
          errorStr.value = `Value for ${_tokens.documentation} for ${paramName} is not a string`
          return ret
        }
        docString = docVal.UncheckedGet<string>()
      }

      // optional role specification
      let role = HioGlslfxConfigRole.RoleNone
      const roleVal = _MapLookup(paramDataDict, _tokens.role)
      if (roleVal !== undefined) {
        if (!_isHoldingString(roleVal)) {
          errorStr.value = `Value for ${_tokens.role} for ${paramName} is not a string`
          return ret
        }

        const roleString = roleVal.UncheckedGet<string>()
        role = _GetRoleFromString(roleString, errorStr)
        if (errorStr.value.length !== 0) return ret
      }

      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `        param: ${paramName}\n`)

      ret.push(new HioGlslfxConfigParameter(paramName, defVal, docString, role))
    }

    return ret
  }

  /** Return the textures specified in the configuration
   *  (glslfxConfig.cpp:505-509). */
  getTextures(): HioGlslfxConfigTextures {
    return [...this.#textures]
  }

  // glslfxConfig.cpp:511-573
  private _getTextures(dict: VtDictionary, errorStr: { value: string }): HioGlslfxConfigTextures {
    const ret: HioGlslfxConfigTextures = []

    // look for the params section
    const textures = _MapLookup(dict, _tokens.textures)
    if (textures === undefined) return ret

    // verify that it holds a VtDictionary
    if (!_isHoldingDict(textures)) {
      errorStr.value = `${_tokens.textures} declaration expects a dictionary value`
      return ret
    }

    const texturesDict = textures.UncheckedGet<VtDictionary>()
    for (const [textureName, textureData] of texturesDict) {
      if (!_isHoldingDict(textureData)) {
        errorStr.value = `${_tokens.textures} declaration for ${textureName} expects a dictionary value`
        return ret
      }

      const textureDataDict = textureData.UncheckedGet<VtDictionary>()

      // optional default color
      const defVal = _MapLookup(textureDataDict, _tokens.defVal) ?? VtValue.getEmpty()

      // optional documentation string
      let docString = ''
      const docVal = _MapLookup(textureDataDict, _tokens.documentation)
      if (docVal !== undefined) {
        if (!_isHoldingString(docVal)) {
          errorStr.value = `Value for ${_tokens.documentation} for ${textureName} is not a string`
          return ret
        }
        docString = docVal.UncheckedGet<string>()
      }

      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `        texture: ${textureName}\n`)

      ret.push(new HioGlslfxConfigTexture(textureName, defVal, docString))
    }

    return ret
  }

  /** Returns the attributes specified in the configuration
   *  (glslfxConfig.cpp:575-579). */
  getAttributes(): HioGlslfxConfigAttributes {
    return [...this.#attributes]
  }

  // glslfxConfig.cpp:581-645
  private _getAttributes(dict: VtDictionary, errorStr: { value: string }): HioGlslfxConfigAttributes {
    const ret: HioGlslfxConfigAttributes = []

    // look for the attribute section
    const attributes = _MapLookup(dict, _tokens.attributes)
    if (attributes === undefined) return ret

    // verify that it holds a VtDictionary
    if (!_isHoldingDict(attributes)) {
      errorStr.value = `${_tokens.attributes} declaration expects a dictionary value`
      return ret
    }

    const attributesDict = attributes.UncheckedGet<VtDictionary>()
    for (const [attributeName, attributeData] of attributesDict) {
      if (!_isHoldingDict(attributeData)) {
        errorStr.value = `${_tokens.attributes} declaration for ${attributeName} expects a dictionary value`
        return ret
      }

      const attributeDataDict = attributeData.UncheckedGet<VtDictionary>()

      // optional documentation string
      let docString = ''
      const docVal = _MapLookup(attributeDataDict, _tokens.documentation)
      if (docVal !== undefined) {
        if (!_isHoldingString(docVal)) {
          errorStr.value = `Value for ${_tokens.documentation} for ${attributeName} is not a string`
          return ret
        }
        docString = docVal.UncheckedGet<string>()
      }

      TfDebug.msg(HioDebugCodes.HIO_DEBUG_GLSLFX, `        attribute: ${attributeName}\n`)

      ret.push(new HioGlslfxConfigAttribute(attributeName,
        _GetDefaultValue(attributeName, attributeDataDict, errorStr),
        docString))
    }

    return ret
  }

  /** Returns the metadata specified in the configuration
   *  (glslfxConfig.cpp:647-651). */
  getMetadata(): HioGlslfxConfigMetadataDictionary {
    return new VtDictionary(this.#metadata)
  }

  // glslfxConfig.cpp:653-674
  private _getMetadata(dict: VtDictionary, errorStr: { value: string }): HioGlslfxConfigMetadataDictionary {
    const ret = new VtDictionary()

    // look for the metadata section
    const metadata = _MapLookup(dict, _tokens.metadata)
    if (metadata === undefined) return ret

    // verify that it holds a VtDictionary
    if (!_isHoldingDict(metadata)) {
      errorStr.value = `${_tokens.metadata} declaration expects a dictionary value`
      return ret
    }

    return metadata.UncheckedGet<VtDictionary>()
  }
}
