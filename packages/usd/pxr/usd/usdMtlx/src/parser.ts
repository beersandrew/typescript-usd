// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/parser.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.05 pxr/usd/usdMtlx/parser.cpp.
import { NodeGraph, splitString, trimSpaces, type Document, type Input, type NodeDef, type Output } from '@mtlx/core'
import {
  RegisterParserPlugin as SdrRegisterParserPlugin,
  ShaderNode as SdrShaderNode, ShaderProperty as SdrShaderProperty,
  Metadata as SdrMetadata,
  PropertyType as SdrPropertyType,
  NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { TF_VERIFY, TF_WARN } from 'typescript-usd/tf'
import { usdValue } from './utils.ts'
import { UsdMtlxGetDocument, UsdMtlxGetDocumentFromString } from './document.ts'

function propertyType(type: string): SdrPropertyType {
  switch (type) {
    case 'boolean': return 'bool'
    case 'integer': return 'int'
    case 'float': case 'vector2': case 'vector3': case 'vector4': return 'float'
    case 'color3': return 'color'
    case 'color4': return 'color4'
    case 'string': case 'filename': case 'surfaceshader': return 'string'
    case 'matrix33': case 'matrix44': return 'matrix'
    default: return 'unknown'
  }
}

function arraySize(type: string): number {
  const sizes: Record<string, number> = {
    vector2: 2, vector3: 3, vector4: 4, matrix33: 9, matrix44: 16,
  }
  return sizes[type] ?? 0
}

function metadataOf(element: Input | Output, output: boolean): SdrMetadata {
  const metadata: SdrMetadata = {}
  const map: Record<string, string> = {
    uiname: 'label', doc: 'help', uifolder: 'page',
    uimin: 'uimin', uimax: 'uimax', uisoftmin: 'uisoftmin',
    uisoftmax: 'uisoftmax', uistep: 'uistep', unit: 'unit',
    unittype: 'unittype', defaultgeomprop: 'defaultgeomprop',
  }
  for (const [attribute, key] of Object.entries(map)) {
    const value = element.getAttribute(attribute)
    if (value) metadata[key] = value
  }
  if (!metadata['help'] && metadata['unit']) {
    metadata['help'] = `Unit is ${metadata['unit']}.`
  }
  if (element.getType() === 'filename') metadata['__SDR__isAssetIdentifier'] = '1'
  if (output && element.getAttribute('defaultinput')) {
    metadata['__SDR__defaultinput'] = element.getAttribute('defaultinput')
  }
  const labels = element.getAttribute('enum')
  const values = element.getAttribute('enumvalues')
  if (labels) {
    const labelParts = labels.split(',').map(value => value.trim())
    const valueParts = values.split(',').map(value => value.trim())
    metadata['options'] = labelParts.map((label, index) =>
      `${label}=${valueParts[index] ?? ''}`).join('|')
  }
  return metadata
}

// OpenUSD v26.11.1 usdMtlx/parser.cpp:66-75 (_GetPrimaryUvSetName):
// USDMTLX_PRIMARY_UV_NAME unset, UsdUtilsGetPrimaryUVSetName() is "st".
const _primaryUvSetName = 'st'

// OpenUSD v26.11.1 usdMtlx/parser.cpp:307-325 and 474-546: the primvars a
// node references, joined with '|' into SdrNodeMetadata->Primvars.
function primvarsOf(nodeDef: NodeDef): string {
  const primvars: string[] = []

  // If the nodeDef name starts with ND_geompropvalue, it's a primvar reader
  // node and we want to add $geomprop to the list of referenced primvars.
  if (nodeDef.getName().startsWith('ND_geompropvalue')) {
    primvars.push('$geomprop')
  }
  // If the nodeDef name is ND_texcoord_vector2, it is using texture
  // coordinates and we want to add the default texturecoordinate name
  // to the list of referenced primvars.
  if (nodeDef.getName() === 'ND_texcoord_vector2') {
    primvars.push(_primaryUvSetName)
  }
  // For custom nodes that use textures or texcoords, look through the
  // implementation nodegraph to find the texcoord, geompropvalue,
  // or stdlib image/tiledimage node and add the appropriate primvar to
  // the list of referenced primvars.
  let addedTexcoordPrimvar = false
  const impl = nodeDef.getImplementation()
  if (impl && impl.isA(NodeGraph)) {
    // Add primvar name for geompropvalue nodes.
    const ng = impl.asA(NodeGraph)!
    for (const geompropNode of ng.getNodes('geompropvalue')) {
      const input = geompropNode.getInput('geomprop')
      if (input) {
        primvars.push(input.getValueString())

        // Assume a texture coordinate primvar if of vector2 type.
        if (geompropNode.getType() === 'vector2') {
          addedTexcoordPrimvar = true
        }
      }
    }
    // Add the default texturecoordinate name for texcoord nodes.
    if (ng.getNodes('texcoord').length !== 0) {
      primvars.push(_primaryUvSetName)
      addedTexcoordPrimvar = true
    }
    // Add the default texture coordinate name with an image/tiledimage
    // node if we have not yet added a texcoordPrimvar name.
    if (!addedTexcoordPrimvar) {
      if (ng.getNodes('tiledimage').length !== 0 ||
          ng.getNodes('image').length !== 0) {
        primvars.push(_primaryUvSetName)
        addedTexcoordPrimvar = true
      }
    }
  }

  // Also check internalgeomprops.
  const internalgeomprops = nodeDef.getAttribute('internalgeomprops')
  if (internalgeomprops !== '') {
    // UsdMtlxSplitStringArray (utils.cpp:613-622)
    const split = splitString(internalgeomprops, ',').map((name) => trimSpaces(name))
    // Note: MaterialX uses a default texcoord of "UV0", which we
    // inline replace with the configured default.
    primvars.push(...split.map((name) => (name === 'UV0' ? _primaryUvSetName : name)))
  }

  // Record builtin primvar references for this node's inputs
  // (parser.cpp:307-325, from AddProperty).
  for (const input of nodeDef.getActiveInputs()) {
    // If an input has "defaultgeomprop", that means it reads from the
    // primvar specified unless connected.
    const defaultgeomprop = input.getAttribute('defaultgeomprop')
    if (defaultgeomprop !== '') {
      if (defaultgeomprop === 'UV0') {
        if (!addedTexcoordPrimvar) {
          primvars.push(_primaryUvSetName)
        }
      } else {
        primvars.push(defaultgeomprop)
      }
    }
  }

  return primvars.join('|')
}

// parser.cpp:560-648 (UsdMtlxParserPlugin).
export class MtlxParserPlugin {
  // parser.cpp:629-639 (GetDiscoveryTypes).
  getDiscoveryTypes(): string[] { return ['mtlx'] }

  // parser.cpp:641-646 (GetShadingSystem).
  getShadingSystem(): string { return 'mtlx' }


  parseShaderNode(discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode {
    const invalid = () => new SdrShaderNode(
      discoveryResult.identifier, discoveryResult.version, discoveryResult.name, discoveryResult.function,
      'mtlx', 'mtlx', discoveryResult.resolvedUri, '', [], discoveryResult.metadata)
    // parser.cpp:577-597: the document of the discovery result's resolved
    // URI ("mtlx" naming the standard library document), or of its source
    // code.
    let document: Document | null
    if (discoveryResult.resolvedUri) {
      document = UsdMtlxGetDocument(discoveryResult.resolvedUri === 'mtlx'
        ? '' : discoveryResult.resolvedUri)
      if (!TF_VERIFY(document !== null, 'document')) return invalid()
    } else if (discoveryResult.sourceCode) {
      document = UsdMtlxGetDocumentFromString(discoveryResult.sourceCode)
      if (!document) {
        TF_WARN('Invalid mtlx source code.')
        return invalid()
      }
    } else {
      TF_WARN(`Invalid SdrShaderNodeDiscoveryResult for identifier '${discoveryResult.identifier}': both ` +
        'resolvedUri and sourceCode fields are empty.')
      return invalid()
    }

    let result = discoveryResult
    let nodeDef = document!.getNodeDef(discoveryResult.identifier)
    if (!nodeDef && !discoveryResult.subIdentifier) {
      TF_WARN(`Invalid MaterialX NodeDef; unknown node name ' ${discoveryResult.identifier} '`)
      return invalid()
    }

    // If a custom node was defined locally it would have specified the
    // nodeDef name as the subIdentifier (parser.cpp:607-621).
    if (discoveryResult.subIdentifier) {
      nodeDef = document!.getNodeDef(discoveryResult.subIdentifier)
      if (!nodeDef) {
        TF_WARN(`Invalid MaterialX NodeDef; unknown node name ' ${discoveryResult.subIdentifier} '`)
        return invalid()
      }
      // Pass the nodeDef name (subIdentifier) through the metadata
      result = { ...discoveryResult, metadata: { __SDR__implementationName: discoveryResult.subIdentifier } }
    }
    if (!nodeDef) return invalid()
    const properties: SdrShaderProperty[] = []
    for (const input of nodeDef.getActiveInputs()) {
      properties.push(new SdrShaderProperty(
        input.getName(), propertyType(input.getType()), usdValue(input), false,
        arraySize(input.getType()), metadataOf(input, false)))
    }
    for (const output of nodeDef.getActiveOutputs()) {
      properties.push(new SdrShaderProperty(
        output.getName() || 'out', propertyType(output.getType()),
        usdValue(output), true, arraySize(output.getType()), metadataOf(output, true)))
    }
    // parser.cpp:542-546: SdrNodeMetadata->Primvars when non-empty.
    const primvars = primvarsOf(nodeDef)
    // parser.cpp:464-472: category, mtlxNodeType, help, target and role;
    // ParseMetadata (parser.cpp:394-414) maps the 'texture2d'/'texture3d'
    // nodegroups to the 'texture' role.
    const nodeMetadata: Record<string, string> = {
      category: nodeDef.getType(),
      mtlxNodeType: nodeDef.getType(),
    }
    const parse = (key: string, attribute: string): void => {
      const value = nodeDef.getAttribute(attribute)
      if (value === '') return
      nodeMetadata[key] = key === 'role' && (value === 'texture2d' || value === 'texture3d') ? 'texture' : value
    }
    parse('help', 'doc')
    parse('__SDR__target', 'target')
    parse('role', 'nodegroup')
    return new SdrShaderNode(
      result.identifier, result.version, result.name, result.function,
      'mtlx', 'mtlx', result.resolvedUri, result.resolvedUri,
      properties, {
        ...result.metadata, ...nodeMetadata, nodecategory: nodeDef.getNodeString(),
        ...(primvars !== '' ? { primvars } : {}),
      })
  }
}

// parser.cpp:648: SDR_REGISTER_PARSER_PLUGIN(UsdMtlxParserPlugin).
// usdMtlx/plugInfo.json declares the type, so SdrRegistry finds it through Plug.
SdrRegisterParserPlugin('UsdMtlxParserPlugin', MtlxParserPlugin)
