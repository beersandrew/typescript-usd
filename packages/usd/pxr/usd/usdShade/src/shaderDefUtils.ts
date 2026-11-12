// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/shaderDefUtils.cpp,
//  pxr/usd/usdShade/shaderDefUtils.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdShadeShaderDefUtils port from OpenUSD v26.11.1
// pxr/usd/usdShade/shaderDefUtils.cpp.
import { _filesystemAvailable, _pathExists } from 'typescript-usd/ar/_internal'
import { type Prim, type Stage } from 'typescript-usd/usd'
import { resolveAssetPath } from 'typescript-usd/usd/_internal'
import {
  ShaderProperty as SdrShaderProperty,
  splitShaderIdentifier,
  Metadata as SdrMetadata,
  PropertyType as SdrPropertyType,
  NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { Shader } from './shader.ts'
import { ConnectableAPI, type ShadeInput, type ShadeOutput } from './connectableAPI.ts'
import { assetPathValue } from './nodeDefAPI.ts'

// _ConformStringTypeDefaultValue / _ConformIntTypeDefaultValue
// (shaderDefUtils.cpp:131-196): Sdr has no token or bool types, so token
// defaults become strings and bool defaults become ints.
function conformDefaultValue(typeName: string, defaultValue: unknown): unknown {
  if (defaultValue === undefined || defaultValue === null) return defaultValue
  if (typeName === 'bool' && typeof defaultValue === 'boolean') return defaultValue ? 1 : 0
  if (typeName === 'bool[]' && Array.isArray(defaultValue)) {
    return defaultValue.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
  }
  // Tokens and strings are both JS strings here.
  return defaultValue
}

// _GetArraySize (shaderDefUtils.cpp:198-208): the size of an array-valued
// (VtArray) default; callers only ask for array-typed properties.
function arraySizeOf(defaultValue: unknown): number {
  if (defaultValue !== undefined && defaultValue !== null && typeof defaultValue === 'object' &&
      typeof (defaultValue as { length?: unknown }).length === 'number') {
    return (defaultValue as { length: number }).length
  }
  return 0
}

// ShaderMetadataHelpers::IsPropertyATerminal (sdr/shaderMetadataHelpers.cpp:230-250):
// renderType metadata starting with "terminal".
function isPropertyATerminal(metadata: SdrMetadata): boolean {
  return (metadata['renderType'] ?? '').startsWith('terminal')
}

// _GetShaderPropertyTypeAndArraySize (shaderDefUtils.cpp:210-299). The
// default value, when given, is conformed in place (returned beside the type).
function shaderPropertyTypeAndArraySize(
  typeName: string, metadata: SdrMetadata, defaultValue: unknown, isArrayValued: boolean,
): { type: SdrPropertyType, arraySize: number, defaultValue: unknown } {
  const size = () => (isArrayValued ? arraySizeOf(defaultValue) : 0)
  // Metadata can override the type dictated by the SdfValueTypeName.
  if (isPropertyATerminal(metadata)) return { type: 'Terminal', arraySize: size(), defaultValue }
  switch (typeName) {
    case 'int': case 'int[]': case 'bool': case 'bool[]':
      defaultValue = conformDefaultValue(typeName, defaultValue)
      return { type: 'Int', arraySize: size(), defaultValue }
    case 'int2': case 'int2[]': return { type: 'Int', arraySize: 2, defaultValue }
    case 'int3': case 'int3[]': return { type: 'Int', arraySize: 3, defaultValue }
    case 'int4': case 'int4[]': return { type: 'Int', arraySize: 4, defaultValue }
    case 'string': case 'token': case 'asset': case 'string[]': case 'token[]': case 'asset[]':
      defaultValue = conformDefaultValue(typeName, defaultValue)
      return { type: 'String', arraySize: size(), defaultValue }
    case 'float': case 'float[]': return { type: 'Float', arraySize: size(), defaultValue }
    case 'float2': case 'float2[]': return { type: 'Float', arraySize: 2, defaultValue }
    case 'float3': case 'float3[]': return { type: 'Float', arraySize: 3, defaultValue }
    case 'float4': case 'float4[]': return { type: 'Float', arraySize: 4, defaultValue }
    case 'color3f': case 'color3f[]': return { type: 'Color', arraySize: size(), defaultValue }
    case 'color4f': case 'color4f[]': return { type: 'Color4', arraySize: size(), defaultValue }
    case 'point3f': case 'point3f[]': return { type: 'Point', arraySize: size(), defaultValue }
    case 'vector3f': case 'vector3f[]': return { type: 'Vector', arraySize: size(), defaultValue }
    case 'normal3f': case 'normal3f[]': return { type: 'Normal', arraySize: size(), defaultValue }
    case 'matrix4d': case 'matrix4d[]': return { type: 'Matrix', arraySize: size(), defaultValue }
    default:
      console.error(`Shader property has unsupported type '${typeName}'`)
      return { type: 'Unknown', arraySize: 0, defaultValue }
  }
}

// ShaderMetadataHelpers::OptionVecVal (sdr/shaderMetadataHelpers.cpp:161-193): a
// '|'-separated list of "name" or "name:value" options.
function optionVecVal(optionStr: string): [string, string][] {
  return (optionStr === '' ? [] : optionStr.split('|')).map(option => {
    const separator = option.indexOf(':')
    return separator < 0 ? [option, ''] : [option.slice(0, separator), option.slice(separator + 1)]
  })
}

export function _shaderDefRootLayerPath(stage: Stage): string {
  return stage.getRootLayer().filePath
}
function extensionOf(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? '' : base.slice(dot + 1)
}
// The resolved path of a source asset (SdfAssetPath::GetResolvedPath of the
// value UsdAttribute::Get returns). A browser resolver cannot synchronously
// probe a URL: on Node the path must exist, as Ar's filesystem resolver
// requires; browser-hosted assets carry the anchored identifier, whose
// availability is established when opened.
export function _shaderDefResolveSourceAsset(stage: Stage, assetPath: string): string {
  const resolved = resolveAssetPath(_shaderDefRootLayerPath(stage), assetPath)
  return !_filesystemAvailable() || _pathExists(resolved) ? resolved : ''
}

// UsdShadeInput / UsdShadeOutput::GetSdrMetadata: the sdrMetadata
// dictionary entries, stringified.
function sdrMetadataOf(attr: { getMetadata(field: string): unknown }): SdrMetadata {
  const raw = attr.getMetadata('sdrMetadata')
  const out: SdrMetadata = {}
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) out[key] = String(value)
  }
  return out
}

// _CreateSdrShaderProperty (shaderDefUtils.cpp:301-360).
function createSdrShaderProperty(
  shaderProperty: ShadeInput | ShadeOutput, isOutput: boolean,
  shaderDefaultValue: unknown, shaderMetadata: SdrMetadata,
): SdrShaderProperty {
  const attr = shaderProperty.getAttr()
  const typeName = attr.typeName
  const metadata: SdrMetadata = { ...shaderMetadata }

  // Update metadata if string should represent a SdfAssetPath.
  if (typeName === 'asset' || typeName === 'asset[]') metadata['__SDR__isAssetIdentifier'] = '1'

  // Look for sdrMetadata options field first (which overrides a schema's
  // allowedTokens list).
  let options: [string, string][] = []
  if (shaderMetadata['options'] !== undefined) options = optionVecVal(shaderMetadata['options'])
  if (options.length === 0) {
    // No options were found in sdrMetadata, look for allowedTokens on the
    // schema attr.
    const allowedTokens = attr.getMetadata('allowedTokens')
    if (Array.isArray(allowedTokens)) {
      for (const token of allowedTokens) options.push([String(token), ''])
    }
  }

  // Since sdr types are a subset of SdfValueTypeNames, the original type is
  // saved in the SdrUsdDefinitionType metadata, which can then be used by
  // SdrShaderProperty::GetTypeAsSdfType.
  metadata['sdrUsdDefinitionType'] = typeName

  const isArrayValued = typeName.endsWith('[]')
  const { type, arraySize, defaultValue } = shaderPropertyTypeAndArraySize(
    typeName, shaderMetadata, shaderDefaultValue, isArrayValued)

  return new SdrShaderProperty(
    shaderProperty.getBaseName(), type, defaultValue, isOutput, arraySize, metadata, '', options)
}

function connectableOf(shaderDefOrStage: Shader | ConnectableAPI | Stage, shaderPrimPath?: string): ConnectableAPI | undefined {
  if (shaderDefOrStage instanceof ConnectableAPI) return new ConnectableAPI(shaderDefOrStage.prim, shaderDefOrStage.stage)
  const prim = (shaderDefOrStage as Stage).getPrim(shaderPrimPath!)
  return prim ? new ConnectableAPI(prim) : undefined
}

export const ShaderDefUtils = {
  // UsdShadeShaderDefUtils::GetDiscoveryResults (shaderDefUtils.cpp:39-129).
  // The shader may be given as a Shader or as (stage, shader prim path).
  getDiscoveryResults(
    shaderDefOrStage: Shader | Stage, shaderPrimPathOrUri: string, maybeSourceUri?: string,
  ): SdrShaderNodeDiscoveryResult[] {
    const shaderDef = shaderDefOrStage instanceof Shader ? shaderDefOrStage
      : new Shader((shaderDefOrStage as Stage).getPrim(shaderPrimPathOrUri), shaderDefOrStage as Stage)
    const sourceUri = shaderDefOrStage instanceof Shader ? shaderPrimPathOrUri : maybeSourceUri!
    const result: SdrShaderNodeDiscoveryResult[] = []
    if (!shaderDef.prim) return result

    // Implementation source must be sourceAsset for the shader to represent
    // nodes in Sdr.
    if (shaderDef.getImplementationSource() !== 'sourceAsset') return result

    const shaderDefPrim: Prim = shaderDef.prim
    const identifier = shaderDefPrim.path.slice(shaderDefPrim.path.lastIndexOf('/') + 1)

    // Get the function name, shader name and version information from the
    // identifier.
    const split = splitShaderIdentifier(identifier)
    if (!split) return result

    // This vector will contain all the info:*:sourceAsset properties.
    const sourceAssetProperties = shaderDefPrim.getAuthoredPropertyNames(
      name => name.startsWith('info:') && name.endsWith(':sourceAsset'))

    const discoveryType = extensionOf(sourceUri)
    for (const propName of sourceAssetProperties) {
      const attr = shaderDefPrim.getAttr(propName)
      if (!attr?.isValid() || attr.isRelationship) continue
      const sourceAssetPath = assetPathValue(attr.getValue())
      if (!sourceAssetPath) continue
      const nameTokens = propName.split(':')
      if (nameTokens.length !== 3) continue

      // Create a discoveryResult only if the referenced sourceAsset can be
      // resolved.
      const resolvedUri = _shaderDefResolveSourceAsset(shaderDefPrim.getStage(), sourceAssetPath)
      if (resolvedUri) {
        const sourceType = nameTokens[1]!
        // Use the prim name as the identifier since it is guaranteed to be
        // unique in the file.
        result.push({
          identifier, version: split.version.getAsDefault(), name: split.name,
          function: split.function, discoveryType, sourceType,
          uri: sourceUri, resolvedUri: sourceUri,
        })
      } else {
        console.warn(`Unable to resolve info:sourceAsset <${attr.getPath()}> with value @${sourceAssetPath}@.`)
      }
    }
    return result
  },

  // UsdShadeShaderDefUtils::GetPrimvarNamesMetadataString
  // (shaderDefUtils.cpp:420-461). The shader may be given as a
  // ConnectableAPI or as (stage, shader prim path).
  getPrimvarNamesMetadataString(
    metadata: SdrMetadata | string, shaderDefOrStage: ConnectableAPI | Stage, shaderPrimPath?: string,
  ): string {
    const existingValue = typeof metadata === 'string' ? metadata : (metadata['primvars'] ?? '')
    // If there's an existing value in the definition, we must append to it.
    const primvarNames: string[] = existingValue ? [existingValue] : []
    const shaderDef = connectableOf(shaderDefOrStage, shaderPrimPath)
    for (const shdInput of shaderDef?.getInputs(/* onlyAuthored */ false) ?? []) {
      if (sdrMetadataOf(shdInput.getAttr())['primvarProperty'] !== undefined) {
        // Check if the input holds a string here and issue a warning if it
        // doesn't.
        if (shaderPropertyTypeAndArraySize(shdInput.getTypeName(), sdrMetadataOf(shdInput.getAttr()),
          undefined, false).type !== 'String') {
          console.warn(`Shader input <${shdInput.getAttr().getPath()}> is tagged as a ` +
            "primvarProperty, but isn't string-valued.")
        }
        primvarNames.push(`$${shdInput.getBaseName()}`)
      }
    }
    return primvarNames.join('|')
  },

  // UsdShadeShaderDefUtils::GetProperties (shaderDefUtils.cpp:361-419). The
  // shader may be given as a ConnectableAPI or as (stage, shader prim path).
  getProperties(shaderDefOrStage: ConnectableAPI | Stage, shaderPrimPath?: string): SdrShaderProperty[] {
    const result: SdrShaderProperty[] = []
    const shaderDef = connectableOf(shaderDefOrStage, shaderPrimPath)
    if (!shaderDef) return result
    for (const shaderInput of shaderDef.getInputs(/* onlyAuthored */ false)) {
      // Only inputs will have default value provided.
      const defaultValue = shaderInput.getAttr().getValue()
      const metadata = sdrMetadataOf(shaderInput.getAttr())

      // Only inputs might have this metadata key.
      if (metadata['defaultInput'] !== undefined) {
        metadata['__SDR__defaultinput'] = '1'
        delete metadata['defaultInput']
      }
      // Only inputs have the GetConnectability method.
      metadata['connectable'] = shaderInput.getConnectability() === 'interfaceOnly' ? '0' : '1'
      if (metadata['implementationName'] !== undefined) {
        metadata['__SDR__implementationName'] = metadata['implementationName']
        delete metadata['implementationName']
      }
      result.push(createSdrShaderProperty(shaderInput, false, defaultValue, metadata))
    }
    for (const shaderOutput of shaderDef.getOutputs(/* onlyAuthored */ false)) {
      const metadata = sdrMetadataOf(shaderOutput.getAttr())
      if (metadata['implementationName'] !== undefined) {
        metadata['__SDR__implementationName'] = metadata['implementationName']
        delete metadata['implementationName']
      }
      result.push(createSdrShaderProperty(shaderOutput, true, undefined, metadata))
    }
    return result
  },
}

export function _shaderDefSdrMetadataOf(stage: Stage, specPath: string): SdrMetadata {
  const raw = specPath.includes('.')
    ? stage.get(specPath)?.getField('sdrMetadata')
    : stage.getPrim(specPath)?.getMetadata('sdrMetadata')
  const out: SdrMetadata = {}
  if (raw && typeof raw === 'object') for (const [key, value] of Object.entries(raw as Record<string, unknown>)) out[key] = String(value)
  return out
}
