// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/pipeline.cpp,
//  pxr/usd/usdUtils/pipeline.h, pxr/usd/usdUtils/wrapPipeline.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/pipeline.{h,cpp} (OpenUSD 26.11.1).
//
// Pipeline conventions: companion alpha attribute names, the model name of a
// root layer, registered variantSets, instance forwarding and uninstancing,
// and the plugInfo-configurable materials scope and primary camera names.
//
// The plugInfo values are read from each plugin's metadata
// (PlugPlugin::GetMetadata), the "UsdUtilsPipeline" dictionary, as upstream
// does. The Python-only wrapPipeline.cpp helper
// _BooleanExpressionRenameVariables (a workaround for an unwrapped
// SdfBooleanExpression) has no counterpart.

import {
  TF_CODING_ERROR, TF_VERIFY, TfEnvSetting, TfGetBaseName, TfGetEnvSetting, TfRegistryManager,
} from 'typescript-usd/tf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import type { Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Prim as UsdPrim, Stage as UsdStage } from 'typescript-usd/usd'
import {
  UsdUtilsRegisteredVariantSet,
  type UsdUtilsRegisteredVariantSetSelectionExportPolicy,
} from './registeredVariantSet.ts'

// pipeline.cpp:33-38
export const USD_FORCE_DEFAULT_MATERIALS_SCOPE_NAME = new TfEnvSetting(
  'USD_FORCE_DEFAULT_MATERIALS_SCOPE_NAME',
  false,
  'Disables the ability to configure the materials scope name with a ' +
  'plugInfo.json value and forces the use of the built-in default instead. ' +
  'This is primarily used for unit testing purposes as a way to ignore any ' +
  'site-based configuration.')

// pipeline.cpp:40-44
export const USD_POPULATE_LEGACY_ALLOWED_TOKENS = new TfEnvSetting(
  'USD_POPULATE_LEGACY_ALLOWED_TOKENS',
  true,
  'Enable population of allowedTokens for shader parameters even when ' +
  'valueLabels are also written.')

// pipeline.cpp:47-61
const _tokens = {
  UsdUtilsPipeline: 'UsdUtilsPipeline',
  MaterialsScopeName: 'MaterialsScopeName',
  PrimaryCameraName: 'PrimaryCameraName',
  ProvidesRegisteredVariantSetsFromPlugin: 'ProvidesRegisteredVariantSetsFromPlugin',
  RegisteredVariantSets: 'RegisteredVariantSets',
  selectionExportPolicy: 'selectionExportPolicy',
  DefaultMaterialsScopeName: 'Looks',
  DefaultPrimaryCameraName: 'main_cam',
  pref: 'pref',
  st: 'st',
} as const

type JsObject = Record<string, unknown>
// JsValue::IsObject / Is<JsObject>
const isJsObject = (value: unknown): value is JsObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The shading pipeline's name for the companion alpha/opacity attribute of
 * a color-valued attribute (pipeline.cpp:64-67).
 */
export function UsdUtilsGetAlphaAttributeNameForColor(colorAttrName: string): string {
  return colorAttrName + '_A'
}

/**
 * The model name of a root layer: its defaultPrim, else a root prim named
 * like the file (before the first '.'), else the first non-class root prim
 * (pipeline.cpp:69-101).
 */
export function UsdUtilsGetModelNameFromRootLayer(rootLayer: SdfLayer): string {
  // First check if if we have the metadata.
  let modelName = rootLayer.getDefaultPrim()
  if (modelName !== '') return modelName

  // If no default prim, see if there is a prim w/ the same "name" as the
  // file.  "name" here means the string before the first ".".
  const filePath = rootLayer.realPath
  const baseName = TfGetBaseName(filePath)
  const dot = baseName.indexOf('.')
  modelName = dot < 0 ? baseName : baseName.slice(0, dot)

  if (modelName !== '' &&
      SdfPath.isValidIdentifier(modelName) &&
      rootLayer.getPrimAtPath(SdfPath.absoluteRootPath.appendChild(modelName))) {
    return modelName
  }

  // Otherwise, fallback to getting the first non-class child in the layer.
  for (const rootPrim of rootLayer.getRootPrims()) {
    if (rootPrim.getSpecifier() !== 'class') return rootPrim.getNameToken()
  }

  return modelName
}

// pipeline.cpp:103-105: the registered set, kept by name as std::set
// orders UsdUtilsRegisteredVariantSet (registeredVariantSet.h:71-75).
const _regVarSets = new Map<string, UsdUtilsRegisteredVariantSet>()

// pipeline.cpp:107-168
function _RegisterVariantSetsFromPlugInfos(): void {
  for (const plug of PlugRegistry.GetInstance().getAllPlugins()) {
    const metadata = plug.getMetadata()
    if (!(_tokens.UsdUtilsPipeline in metadata)) continue
    const pipelineUtilsDictValue = metadata[_tokens.UsdUtilsPipeline]
    if (!isJsObject(pipelineUtilsDictValue)) {
      TF_CODING_ERROR(`${plug.getName()}[UsdUtilsPipeline] was not a dictionary.`)
      continue
    }

    const pipelineUtilsDict = pipelineUtilsDictValue
    if (!(_tokens.RegisteredVariantSets in pipelineUtilsDict)) continue
    const registeredVariantSetsValue = pipelineUtilsDict[_tokens.RegisteredVariantSets]
    if (!isJsObject(registeredVariantSetsValue)) {
      TF_CODING_ERROR(
        `${plug.getName()}[UsdUtilsPipeline][RegisteredVariantSets] was not a dictionary.`)
      continue
    }

    // JsObject is a std::map: entries in key order.
    const registeredVariantSets = Object.entries(registeredVariantSetsValue)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    for (const [variantSetName, v] of registeredVariantSets) {
      if (!isJsObject(v)) {
        TF_CODING_ERROR(
          `${plug.getName()}[UsdUtilsPipeline][RegisteredVariantSets][${variantSetName}] ` +
          'was not a dictionary.')
        continue
      }

      // info[...].GetString() is empty for a missing or non-string value.
      const policyValue = v[_tokens.selectionExportPolicy]
      const variantSetType = typeof policyValue === 'string' ? policyValue : ''

      const selectionExportPolicy =
        UsdUtilsRegisteredVariantSet.getSelectionExportPolicyFromString(variantSetType)
      if (selectionExportPolicy === undefined) {
        TF_CODING_ERROR(
          `${plug.getName()}[UsdUtilsPipeline][RegisteredVariantSets][${variantSetName}] ` +
          'was not valid.')
        continue
      }
      UsdUtilsRegisterVariantSet(variantSetName, selectionExportPolicy)
    }
  }
}

// pipeline.cpp:170-201
function _LoadPluginsThatRegisterVariantSets(): void {
  for (const plug of PlugRegistry.GetInstance().getAllPlugins()) {
    const metadata = plug.getMetadata()
    if (!(_tokens.UsdUtilsPipeline in metadata)) continue
    const pipelineUtilsDictValue = metadata[_tokens.UsdUtilsPipeline]
    if (!isJsObject(pipelineUtilsDictValue)) {
      TF_CODING_ERROR(`${plug.getName()}[UsdUtilsPipeline] was not a dictionary.`)
      continue
    }

    const pipelineUtilsDict = pipelineUtilsDictValue
    if (!(_tokens.ProvidesRegisteredVariantSetsFromPlugin in pipelineUtilsDict)) continue
    const registersVariantSets = pipelineUtilsDict[_tokens.ProvidesRegisteredVariantSetsFromPlugin]
    if (typeof registersVariantSets !== 'boolean') {
      TF_CODING_ERROR(
        `${plug.getName()}[UsdUtilsPipeline][ProvidesRegisteredVariantSetsFromPlugin] was not a bool.`)
    }

    // JsValue::GetBool is false for a non-bool value.
    // PlugPlugin::Load is synchronous only for a plugin that is already
    // loaded (plugin.ts Load); a module plugin must be loaded with
    // loadAsync first, as everywhere in this port.
    if (registersVariantSets === true) plug.Load()
  }
}

let _registeredVariantSetsPopulated = false

/**
 * The variantSets registered with the pipeline, ordered by name
 * (pipeline.cpp:203-220). They come from the "RegisteredVariantSets"
 * dictionaries in plugInfo "UsdUtilsPipeline" metadata, then from plugins
 * whose metadata sets "ProvidesRegisteredVariantSetsFromPlugin" (loaded
 * here), then from functions registered with TfRegistryManager under
 * UsdUtilsRegisteredVariantSet (TF_REGISTRY_FUNCTION) that call
 * UsdUtilsRegisterVariantSet. Populated once, on first use.
 */
export function UsdUtilsGetRegisteredVariantSets(): readonly UsdUtilsRegisteredVariantSet[] {
  // Lazy population on first use.
  if (!_registeredVariantSetsPopulated) {
    _registeredVariantSetsPopulated = true
    // First, we'll populate from any plugInfos that provide this information.
    _RegisterVariantSetsFromPlugInfos()

    // Now, we load any plugins that may want register variantSets as well.
    _LoadPluginsThatRegisterVariantSets()

    // Invoke any code for UsdUtilsRegisteredVariantSet.
    TfRegistryManager.GetInstance().subscribeTo(UsdUtilsRegisteredVariantSet)
  }

  return [..._regVarSets.values()].sort((a, b) => (a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0))
}

/**
 * Registers `variantSetName` with `selectionExportPolicy`; a name already
 * registered keeps its first policy, as std::set::emplace does
 * (pipeline.cpp:222-229).
 */
export function UsdUtilsRegisterVariantSet(
  variantSetName: string,
  selectionExportPolicy: UsdUtilsRegisteredVariantSetSelectionExportPolicy,
): void {
  if (!_regVarSets.has(variantSetName)) {
    _regVarSets.set(variantSetName, new UsdUtilsRegisteredVariantSet(variantSetName, selectionExportPolicy))
  }
}

const _pathString = (path: SdfPath | string): string =>
  typeof path === 'string' ? path : path.pathString

/**
 * The prim at `path`, or, for a path beneath an instance, the corresponding
 * prototype prim; undefined when there is neither (pipeline.cpp:231-241).
 * Never authors scene description.
 */
export function UsdUtilsGetPrimAtPathWithForwarding(
  stage: UsdStage, path: SdfPath | string,
): UsdPrim | undefined {
  // If the given path refers to a prim beneath an instance,
  // UsdStage::GetPrimAtPath will return an instance proxy
  // from which we can retrieve the corresponding prim in
  // the prototype.
  const p = stage.getPrim(_pathString(path))
  return p && p.isInstanceProxy() ? p.getPrimInPrototype() : p
}

/**
 * Uninstances every instance in the namespace chain of `path` and returns
 * the prim then at `path`; undefined when there is none
 * (pipeline.cpp:243-280).
 */
export function UsdUtilsUninstancePrimAtPath(
  stage: UsdStage, path: SdfPath | string,
): UsdPrim | undefined {
  // If a valid prim exists at the requested path, simply return it.
  // If the prim is an instance proxy, it means this path indicates
  // a prim beneath an instance. In order to uninstance it, we need
  // to uninstance all ancestral instances.
  const pathString = _pathString(path)
  let p = stage.getPrim(pathString)
  if (!p || !p.isInstanceProxy()) return p

  // Skip the last element in prefixes, since that's our own
  // path and we only want to uninstance ancestors.
  const prefixes = SdfPath.fromString(pathString).getPrefixes()
  if (prefixes.length) prefixes.pop()

  for (const prefixPath of prefixes) {
    const prim = stage.getPrim(prefixPath.pathString)
    if (!prim) break
    if (prim.isInstance()) prim.setInstanceable(false)
  }

  // Uninstancing should ensure that the prim at the given
  // path, if it exists, is no longer inside an instance.
  p = stage.getPrim(pathString)
  TF_VERIFY(!p || !p.isInstanceProxy(), '!p || !p.IsInstanceProxy()')
  return p
}

/** The primary UV set name on meshes and nurbs, "st" (pipeline.cpp:282-285). */
export function UsdUtilsGetPrimaryUVSetName(): string {
  return _tokens.st
}

/** The reference position name on meshes and nurbs, "pref" (pipeline.cpp:287-290). */
export function UsdUtilsGetPrefName(): string {
  return _tokens.pref
}

// pipeline.cpp:294-364: the first valid identifier string found for each
// key under [UsdUtilsPipeline][<identifierKey>] in the plugins' metadata.
function _GetPipelineIdentifierTokens(identifierKeys: readonly string[]): Map<string, string> {
  const metadataDictKey = _tokens.UsdUtilsPipeline
  const identifierMap = new Map<string, string>()

  const plugs = PlugRegistry.GetInstance().getAllPlugins()
  for (const plug of plugs) {
    const metadata = plug.getMetadata()
    if (!(metadataDictKey in metadata)) continue
    const metadataDictValue = metadata[metadataDictKey]

    if (!isJsObject(metadataDictValue)) {
      TF_CODING_ERROR(`${plug.getName()}[${metadataDictKey}] was not a dictionary.`)
      continue
    }

    const metadataDict = metadataDictValue

    for (const identifierKey of identifierKeys) {
      if (!(identifierKey in metadataDict)) continue
      const stringJsValue = metadataDict[identifierKey]

      if (typeof stringJsValue !== 'string') {
        TF_CODING_ERROR(
          `${plug.getName()}[${metadataDictKey}][${identifierKey}] was not a string.`)
        continue
      }

      const valueString = stringJsValue
      if (!SdfPath.isValidIdentifier(valueString)) {
        TF_CODING_ERROR(
          `${plug.getName()}[${metadataDictKey}][${identifierKey}] was not a valid ` +
          `identifier: "${valueString}".`)
        continue
      }

      // TfHashMap::insert keeps an existing entry.
      if (!identifierMap.has(identifierKey)) identifierMap.set(identifierKey, valueString)
    }

    if (identifierMap.size === identifierKeys.length) {
      // We got an identifier for all of the given keys, so stop looking
      // through plugin metadata.
      break
    }
  }

  return identifierMap
}

// pipeline.cpp:366-373: computed on first use (TF_MAKE_STATIC_DATA).
let _pipelineIdentifiersMap: Map<string, string> | undefined
function _getPipelineIdentifiersMap(): Map<string, string> {
  return _pipelineIdentifiersMap ??= _GetPipelineIdentifierTokens([
    _tokens.MaterialsScopeName,
    _tokens.PrimaryCameraName,
  ])
}

/**
 * The name of the prim under which materials are expected to be authored:
 * plugInfo [UsdUtilsPipeline][MaterialsScopeName], else "Looks"; the
 * default when `forceDefault` or USD_FORCE_DEFAULT_MATERIALS_SCOPE_NAME is
 * set (pipeline.cpp:375-387).
 */
export function UsdUtilsGetMaterialsScopeName(forceDefault = false): string {
  if (TfGetEnvSetting(USD_FORCE_DEFAULT_MATERIALS_SCOPE_NAME) || forceDefault) {
    return _tokens.DefaultMaterialsScopeName
  }

  return _getPipelineIdentifiersMap().get(_tokens.MaterialsScopeName) ??
    _tokens.DefaultMaterialsScopeName
}

/**
 * The name of the primary camera prim: plugInfo
 * [UsdUtilsPipeline][PrimaryCameraName], else "main_cam"; the default when
 * `forceDefault` (pipeline.cpp:389-400).
 */
export function UsdUtilsGetPrimaryCameraName(forceDefault = false): string {
  if (forceDefault) {
    return _tokens.DefaultPrimaryCameraName
  }

  return _getPipelineIdentifiersMap().get(_tokens.PrimaryCameraName) ??
    _tokens.DefaultPrimaryCameraName
}
