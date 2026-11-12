// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/plugin/sdrGlslfx/parserPlugin.cpp,
//  pxr/usdImaging/plugin/sdrGlslfx/parserPlugin.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/plugin/sdrGlslfx/parserPlugin.{h,cpp}
// (OpenUSD 26.11.1): SdrGlslfxParserPlugin, the Sdr parser plugin for
// glslfx shader nodes (discovery type and shading system "glslfx").
//
// Divergences:
// - SdrShaderProperty takes its default values as given: this parser hands
//   it typed VtValues (see sdr/src/shaderPropertyValue.ts).
// - HioGlslfx opens a glslfx file a scene ships from what Ar read ahead
//   (hio/src/glslfx.ts, "Files and assets").

import { Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { HioGlslfx, HioGlslfxInputStream, _VtValueVectorType as Hio_VtValueVectorType } from 'typescript-usd/hio'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import {
  RegisterParserPlugin as SdrRegisterParserPlugin,
  ShaderNode as SdrShaderNode,
  ShaderProperty as SdrShaderProperty,
  type Metadata as SdrMetadata,
  type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
  type ParserPlugin as SdrParserPlugin,
  type PropertyType as SdrPropertyType,
} from 'typescript-usd/sdr'
import { RaiseWarning, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'

/** parserPlugin.cpp:25-30 */
const _tokens = {
  discoveryType: 'glslfx',
  shadingSystem: 'glslfx',
} as const

/** parserPlugin.cpp:46-180 ConvertToSdrCompatibleValueAndType. */
function ConvertToSdrCompatibleValueAndType(
  any: VtValue,
): { value: VtValue, arraySize: number, sdrType: SdrPropertyType } {
  // Unrecognized type by default
  let sdrType: SdrPropertyType = 'Unknown'

  // Not an array by default.
  let arraySize = 0

  const isDouble = (v: VtValue) => v.IsHolding(VtValueTypes.double)
  const isFloat = (v: VtValue) => v.IsHolding(VtValueTypes.float)
  const floatArray = (values: number[]) =>
    VtValue.createArray(new VtArray<number>(values.map(Math.fround), VtValueTypes.float))

  // XXX : Add support for the following sdr types:
  //       String, Struct, Terminal and Vstruct.
  // XXX : We could add some glslfx metadata to recognize if this GfVec3f
  //       is an Sdr type Vector, Color, Point or a Normal..
  if (any.IsHolding(Hio_VtValueVectorType)) {
    const anyVec = any.Get<VtValue[]>()

    // support for matrix
    if (anyVec.length === 16) {
      if (isDouble(anyVec[0]!)) {
        const m = anyVec.map((v) => v.Get<number>())
        sdrType = 'Matrix'
        return { value: VtValue.create(new GfMatrix4d(...m), VtValueTypes.GfMatrix4d), arraySize, sdrType }
      } else if (isFloat(anyVec[0]!)) {
        const m = anyVec.map((v) => v.Get<number>())
        sdrType = 'Matrix'
        return { value: VtValue.create(new GfMatrix4f(...m), TfType.declare('GfMatrix4f')), arraySize, sdrType }
      } else {
        return { value: VtValue.getEmpty(), arraySize, sdrType }
      }

    // support for vectors length 1
    } else if (anyVec.length === 1) {
      if (isDouble(anyVec[0]!)) {
        // Sdr has no doubles, converting them to floats
        sdrType = 'Float'
        return { value: VtValue.create(Math.fround(anyVec[0]!.Get<number>()), VtValueTypes.float), arraySize, sdrType }
      } else if (isFloat(anyVec[0]!)) {
        sdrType = 'Float'
        return { value: VtValue.create(anyVec[0]!.Get<number>(), VtValueTypes.float), arraySize, sdrType }
      }

    // support for vectors length 2 and 4
    } else if (anyVec.length === 2 || anyVec.length === 4) {
      const retVec: number[] = []
      for (const v of anyVec) {
        if (isDouble(v) || isFloat(v)) {
          retVec.push(v.Get<number>())
        } else {
          return { value: VtValue.getEmpty(), arraySize, sdrType }
        }
      }
      sdrType = 'Float'
      arraySize = anyVec.length
      return { value: floatArray(retVec), arraySize, sdrType }

    } else if (anyVec.length === 3) {
      // support for vectors length 3
      const retVec: number[] = []
      for (const v of anyVec) {
        if (isDouble(v) || isFloat(v)) {
          retVec.push(v.Get<number>())
        } else {
          return { value: VtValue.getEmpty(), arraySize, sdrType }
        }
      }
      sdrType = 'Color'
      return { value: VtValue.create(new GfVec3f(retVec[0]!, retVec[1]!, retVec[2]!), VtValueTypes.GfVec3f), arraySize, sdrType }
    }

  } else if (isDouble(any)) {
    // Sdr has no doubles, converting them to floats
    sdrType = 'Float'
    return { value: VtValue.create(Math.fround(any.Get<number>()), VtValueTypes.float), arraySize, sdrType }

  } else if (isFloat(any)) {
    sdrType = 'Float'
    return { value: VtValue.create(any.Get<number>(), VtValueTypes.float), arraySize, sdrType }

  } else if (any.IsHolding(VtValueTypes.int)) {
    sdrType = 'Int'
    return { value: VtValue.create(any.Get<number>(), VtValueTypes.int), arraySize, sdrType }

  } else if (any.IsHolding(VtValueTypes.bool)) {
    // Sdr has no bool, converting them to int
    sdrType = 'Int'
    return { value: VtValue.create(any.Get<boolean>() ? 1 : 0, VtValueTypes.int), arraySize, sdrType }
  }

  return { value: any, arraySize, sdrType }
}

/** parserPlugin.h / parserPlugin.cpp:32-44, 182-290. */
export class SdrGlslfxParserPlugin implements SdrParserPlugin {
  /** parserPlugin.cpp:32-37 */
  getDiscoveryTypes(): string[] {
    return [_tokens.discoveryType]
  }

  /** parserPlugin.cpp:39-43 */
  getShadingSystem(): string {
    return _tokens.shadingSystem
  }

  /** parserPlugin.cpp:182-290 */
  parseShaderNode(discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode | undefined {
    let glslfx: HioGlslfx

    const nodeIdentifier = discoveryResult.identifier
    if (discoveryResult.uri) {
      glslfx = new HioGlslfx(discoveryResult.resolvedUri)
    } else if (discoveryResult.sourceCode) {
      glslfx = new HioGlslfx(new HioGlslfxInputStream(discoveryResult.sourceCode))
    } else {
      RaiseWarning(`Invalid SdrShaderNodeDiscoveryResult with identifier ${nodeIdentifier}: ` +
        'both uri and sourceCode are empty.')
      // SdrParserPlugin::GetInvalidShaderNode (parserPlugin.cpp in sdr): a
      // node with the discovery result's identity and no properties.
      return new SdrShaderNode(nodeIdentifier, discoveryResult.version,
        discoveryResult.name, discoveryResult.function, discoveryResult.discoveryType,
        discoveryResult.sourceType, discoveryResult.uri, discoveryResult.resolvedUri)
    }

    const errorString = { value: '' }
    if (!glslfx.isValid(errorString)) {
      RaiseWarning(`Failed to parse glslfx at URI [${discoveryResult.uri}] error [${errorString.value}]`)
    }

    const nodeProperties: SdrShaderProperty[] = []

    for (const p of glslfx.getParameters()) {
      const { value: defaultValue, arraySize, sdrType } =
        ConvertToSdrCompatibleValueAndType(p.defaultValue)

      nodeProperties.push(new SdrShaderProperty(
        p.name, sdrType, defaultValue, false, arraySize, {}))
    }

    for (const t of glslfx.getTextures()) {
      let { value: defaultValue, arraySize, sdrType } =
        ConvertToSdrCompatibleValueAndType(t.defaultValue)

      // Check for a default value, or fallback to all black.
      if (defaultValue.IsEmpty()) {
        sdrType = 'Color'
        defaultValue = VtValue.create(new GfVec3f(0.0, 0.0, 0.0), VtValueTypes.GfVec3f)
      }

      nodeProperties.push(new SdrShaderProperty(
        t.name, sdrType, defaultValue, false, arraySize, {}))
    }

    const metadata: SdrMetadata = { ...(discoveryResult.metadata ?? {}) }
    const primvarNames: string[] = []
    if (metadata['primvars'] !== undefined) {
      primvarNames.push(metadata['primvars'])
    }

    for (const a of glslfx.getAttributes()) {
      primvarNames.push(a.name)
    }

    if (primvarNames.length !== 0) {
      metadata['primvars'] = primvarNames.join('|')
    }

    // NOTE: Context = "glslfx" will be removed in an upcoming release.
    metadata['context'] = _tokens.shadingSystem

    // XXX: Add support for reading metadata from glslfx and converting
    //      to node metadata

    return new SdrShaderNode(
      nodeIdentifier,
      discoveryResult.version,
      discoveryResult.name,
      discoveryResult.function,
      _tokens.shadingSystem,
      _tokens.shadingSystem,
      discoveryResult.resolvedUri,
      discoveryResult.resolvedUri,
      nodeProperties,
      metadata,
      discoveryResult.sourceCode ?? '')
  }
}

// sdrGlslfx/plugInfo.json, registered as part of this build: it declares
// the SdrGlslfxParserPlugin type that SdrRegistry finds through Plug.
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [
    {
      Info: {
        Types: {
          SdrGlslfxParserPlugin: {
            bases: ['SdrParserPlugin'],
            displayName: 'Glslfx-based shader definition parser plugin',
          },
        },
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'sdrGlslfx',
      ResourcePath: '@PLUG_INFO_RESOURCE_PATH@',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
})

// parserPlugin.cpp:23: SDR_REGISTER_PARSER_PLUGIN(SdrGlslfxParserPlugin).
SdrRegisterParserPlugin('SdrGlslfxParserPlugin', SdrGlslfxParserPlugin)
