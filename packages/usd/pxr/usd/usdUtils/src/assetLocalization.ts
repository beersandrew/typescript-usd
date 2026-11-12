// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/assetLocalization.cpp,
//  pxr/usd/usdUtils/assetLocalization.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/assetLocalization.{h,cpp} (OpenUSD 26.11.1).
//
// UsdUtils_LocalizationContext recursively computes an asset's
// dependencies. It is responsible for layer traversal and asset path
// discovery only; as asset paths are discovered they are handed to the
// context's client, where all specific processing logic lives
// (assetLocalization.h:30-33).
//
// Asynchrony: traversal opens layers (SdfLayer::FindOrOpen), resolves asset
// paths and UDIM tiles, and calls the client, all asynchronous in this port,
// so Process returns a Promise.

import {
  AssetPath as SdfAssetPath, Layer, type PrimSpec as SdfPrimSpec,
  Schema as SdfSchema, SdfComputeAssetPathRelativeToLayer,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { _sdfIsDictionary, _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { _isDir, _listDir, _pathExists } from 'typescript-usd/ar/_internal'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UdimUtils as UsdShadeUdimUtils } from 'typescript-usd/usdShade'
import {
  TF_CODING_ERROR, TF_WARN, TfGetBaseName, TfGetPathName, TfStringCatPaths, TfStringReplace,
  Type as TfType,
} from 'typescript-usd/tf'
import { Array as VtArray } from 'typescript-usd/vt'
import {
  type UsdUtils_LocalizationClient, type UsdUtils_Value, UsdUtils_DependencyType,
  UsdUtils_EvaluateVariableExpressionInPath, UsdUtils_ReadOnlyLocalizationClient,
  _assetPathArrayElements, _assetPathOf, _dictionaryEntries, _dictionaryGetValueAtPath, _usdUtilsValue,
} from './assetLocalizationDelegate.ts'
import type { UsdUtilsDependencyInfo } from './userProcessingFunc.ts'
import { UsdUtilsExtractExternalReferencesParams } from './dependencies.ts'

/** Enum class representing the external reference types that must be
 *  included in the search for external dependencies
 *  (assetLocalization.h:36-46). */
export enum UsdUtils_LocalizationReferenceType {
  /** Include only references that affect composition. */
  CompositionOnly,
  /** Include all external references including asset-valued attributes and
   *  non-composition metadata containing SdfAssetPath values. */
  All,
}

// PLATFORM-DIVERGENCE(usdutils-host-filesystem): upstream queries the file
// system directly for clip template globbing (TfIsDir, TfGlob) and external
// asset dependencies (TfPathExists, std::filesystem::relative), and writes
// temporary layer exports there (ArchMakeTmpFileName, TfDeleteFile). Here
// those queries go to the host's file system through Ar's platform file
// system seam; a browser has none, so there they find nothing, as for a
// non-filesystem resolver upstream.

/** VtDictionaryOver(strong, weak) (vt/dictionary.cpp:356-372): the strong
 *  dictionary with the weak one's other keys. */
function dictionaryOver(
  strong: Readonly<Record<string, unknown>>, weak: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...weak, ...strong }
}

// The Sdf type of an asset path valued metadata field: the field's fallback
// is an SdfAssetPath or VtArray<SdfAssetPath>.
function metadataFieldType(key: string): string | undefined {
  const fallback = SdfSchema.getInstance().getFallback(key)
  if (fallback instanceof SdfAssetPath) return 'asset'
  if (fallback instanceof VtArray && fallback.getElementType() === TfType.findByName('SdfAssetPath')) {
    return 'asset[]'
  }
  return undefined
}

// glob(3) pattern matching (fnmatch with FNM_PERIOD for one path component).
function globComponentRegExp(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; ++i) {
    const c = pattern[i]!
    if (c === '*') source += '[^/]*'
    else if (c === '?') source += '[^/]'
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2)
      if (end < 0) { source += '\\['; continue }
      let set = pattern.slice(i + 1, end)
      if (set.startsWith('!')) set = `^${set.slice(1)}`
      source += `[${set.replace(/\\/g, '\\\\')}]`
      i = end
    } else source += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

/**
 * TfGlob(path) with ARCH_GLOB_DEFAULT (ARCH_GLOB_NOCHECK | ARCH_GLOB_MARK;
 * tf/pathUtils.cpp:258-287, arch/fileSystem.h:66-71): the sorted paths
 * matching the pattern, directories marked with a trailing '/', or the
 * pattern itself when nothing matches. See
 * PLATFORM-DIVERGENCE(usdutils-host-filesystem).
 */
function tfGlob(pattern: string): string[] {
  const absolute = pattern.startsWith('/')
  const components = pattern.split('/').filter(component => component !== '')
  let matches = [absolute ? '/' : '']
  for (const component of components) {
    const next: string[] = []
    for (const base of matches) {
      const join = (name: string) => base === '' ? name : base.endsWith('/') ? base + name : `${base}/${name}`
      if (!/[*?[]/.test(component)) {
        next.push(join(component))
        continue
      }
      const regExp = globComponentRegExp(component)
      for (const name of _listDir(base === '' ? '.' : base).sort()) {
        // A leading period must be matched explicitly.
        if (name.startsWith('.') && !component.startsWith('.')) continue
        if (regExp.test(name)) next.push(join(name))
      }
    }
    matches = next
  }
  const existing = matches.filter(path => path !== '' && _pathExists(path))
  if (existing.length === 0) return [pattern]
  return existing.sort().map(path => _isDir(path) && !path.endsWith('/') ? `${path}/` : path)
}

interface QueueItem {
  anchoredPath: string
  parentExpressionVariablesIndex: number
  composeExpressionVariables: boolean
}

/**
 * Recursively computes the given asset's dependencies
 * (assetLocalization.h:30-200).
 */
export class UsdUtils_LocalizationContext {
  readonly #delegate: UsdUtils_LocalizationClient
  #rootLayer: Layer | undefined
  // holds a list of assets that needs to be recursively processed; this
  // queue is used in order to preserve the processing order of the previous
  // localization code.
  #queue: QueueItem[] = []
  // holds the list of paths that have already been processed
  readonly #encounteredPaths = new Set<string>()
  #refTypesToInclude = UsdUtils_LocalizationReferenceType.All
  // Specifies if layer dependencies should be followed when processing the
  // root asset.
  #recurseLayerDependencies = true
  // Specifies if metadata filtering should be enabled
  #metadataFilteringEnabled = false
  // Specifies if udim paths should be resolved during processing.
  #resolveUdimPaths = true
  // user supplied list of dependencies that will be skipped when processing
  // the asset
  #dependenciesToSkip = new Set<string>()
  // tracks the sets of expression variables that are composed during
  // dependency traversal.
  #composedExpressionVariables: Readonly<Record<string, unknown>>[] = []

  constructor(client: UsdUtils_LocalizationClient) {
    this.#delegate = client
  }

  /** Begins recursive dependency analysis on the supplied layer
   *  (assetLocalization.cpp:40-82). */
  async process(layer: Layer | undefined): Promise<boolean> {
    if (!layer) {
      TF_CODING_ERROR('Unable to process null layer')
      return false
    }

    this.#rootLayer = layer

    this.#composedExpressionVariables = [layer.getExpressionVariables()]

    this.#encounteredPaths.add(this.#rootLayer.identifier)
    await this.#processLayer(this.#rootLayer, 0)

    while (this.#queue.length > 0) {
      const item = this.#queue.pop()!

      if (!UsdStage.isSupportedFile(item.anchoredPath)) continue

      const queuedLayer = await Layer.findOrOpen(item.anchoredPath)
      if (!queuedLayer) continue

      // Depending how this layer was enqueued (i.e. from a reference) we
      // may need to compute the composed set of expression variables.
      const expressionVariablesIndex = item.composeExpressionVariables
        ? this.#composeExpressionVariables(item.parentExpressionVariablesIndex, queuedLayer)
        : item.parentExpressionVariablesIndex

      await this.#processLayer(queuedLayer, expressionVariablesIndex)
    }

    return true
  }

  /** Returns the root layer of the asset (assetLocalization.h:56-59). */
  getRootLayer(): Layer | undefined { return this.#rootLayer }

  /** Toggles metadata filtering. When active, non-relevant metadata keys
   *  will be ignored (assetLocalization.h:61-66). */
  setMetadataFilteringEnabled(filteringEnabled: boolean): void {
    this.#metadataFilteringEnabled = filteringEnabled
  }

  /** Sets whether all layer dependencies should be recursively traversed
   *  (assetLocalization.h:68-74). */
  setRecurseLayerDependencies(recurseLayerDependencies: boolean): void {
    this.#recurseLayerDependencies = recurseLayerDependencies
  }

  /** Sets the reference types that will be included for processing
   *  (assetLocalization.h:76-81). */
  setRefTypesToInclude(refTypesToInclude: UsdUtils_LocalizationReferenceType): void {
    this.#refTypesToInclude = refTypesToInclude
  }

  /** Sets a list of dependencies to skip during packaging. The paths
   *  contained in this array should be fully resolved
   *  (assetLocalization.h:83-91). */
  setDependenciesToSkip(dependenciesToSkip: readonly string[]): void {
    this.#dependenciesToSkip = new Set(dependenciesToSkip)
  }

  /** Controls udim path resolution (assetLocalization.h:93-98). */
  setResolveUdimPaths(resolveUdimPaths: boolean): void {
    this.#resolveUdimPaths = resolveUdimPaths
  }

  // assetLocalization.cpp:84-95
  async #enqueueDependencies(
    layer: Layer, expressionVariablesIndex: number, dependencies: readonly string[],
    composeExpressionVariables = false,
  ): Promise<void> {
    for (const dependency of dependencies) {
      await this.#enqueueDependency(layer, expressionVariablesIndex, dependency, composeExpressionVariables)
    }
  }

  // assetLocalization.cpp:97-158
  async #enqueueDependency(
    layer: Layer, expressionVariablesIndex: number, assetPath: string,
    composeExpressionVariables = false,
  ): Promise<void> {
    if (!this.#recurseLayerDependencies || assetPath === '') return

    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(
      this.#composedExpressionVariables[expressionVariablesIndex]!, assetPath)
    if (processedPath === '') return

    const anchoredPath = SdfComputeAssetPathRelativeToLayer(layer, processedPath)

    if (this.#encounteredPaths.has(anchoredPath) || this.#dependenciesToSkip.has(anchoredPath)) return

    this.#encounteredPaths.add(anchoredPath)

    const splitIdentifier = _sdfSplitLayerIdentifier(anchoredPath)

    if (!this.#delegate.pathShouldResolve(splitIdentifier.assetPath)) return

    const resolvedPath = await ArGetResolver().resolve(splitIdentifier.assetPath)
    if (!resolvedPath.valid) {
      TF_WARN(`Failed to resolve reference @${processedPath}@ with computed asset path ` +
        `@${anchoredPath}@ found in layer @${layer.realPath}@.`)
      return
    }

    this.#queue.push({
      anchoredPath,
      parentExpressionVariablesIndex: expressionVariablesIndex,
      composeExpressionVariables,
    })
  }

  // assetLocalization.cpp:160-197
  async #processLayer(layer: Layer, expressionVariablesIndex: number): Promise<void> {
    await this.#processSublayers(layer, expressionVariablesIndex)

    const pseudoRoot = layer.getPseudoRoot()
    const dfs: SdfPrimSpec[] = [pseudoRoot]

    while (dfs.length > 0) {
      const curr = dfs.pop()!

      // Metadata is processed even on the pseudoroot, which ensures
      // we process layer metadata properly.
      await this.#processMetadata(layer, expressionVariablesIndex, curr)
      if (!curr.getPath().equals(pseudoRoot.getPath())) {
        await this.#processPayloads(layer, expressionVariablesIndex, curr)
        await this.#processProperties(layer, expressionVariablesIndex, curr)
        await this.#processReferences(layer, expressionVariablesIndex, curr)
      }

      // variants "children"
      for (const variantSet of curr.getVariantSets()) {
        for (const variantSpec of variantSet.getVariantList()) {
          const variantPrim = variantSpec.getPrimSpec()
          if (variantPrim) dfs.push(variantPrim)
        }
      }

      // children
      for (const child of curr.getNameChildren()) dfs.push(child)
    }
  }

  // Computes the new set of expression variables for a layer with respect
  // to its parent layer. In the case that this layer does not have any
  // expression variables, we do not need to do anything here
  // (assetLocalization.cpp:199-221).
  #composeExpressionVariables(parentExpressionVarIndex: number, layer: Layer): number {
    const layerVariables = layer.getExpressionVariables()
    if (Object.keys(layerVariables).length === 0) return parentExpressionVarIndex

    const index = this.#composedExpressionVariables.length
    const parentVariables = this.#composedExpressionVariables[parentExpressionVarIndex]!
    this.#composedExpressionVariables.push(dictionaryOver(layerVariables, parentVariables))
    return index
  }

  // assetLocalization.cpp:223-242
  async #processSublayers(layer: Layer, expressionVariablesIndex: number): Promise<void> {
    const sublayers = layer.getSubLayerPaths()
    if (sublayers.length === 0) return

    for (const sublayerPath of sublayers) {
      await this.#enqueueDependency(layer, expressionVariablesIndex, sublayerPath)
    }

    const processedDeps = await this.#delegate.processSublayers(
      layer, this.#composedExpressionVariables[expressionVariablesIndex]!)
    await this.#enqueueDependencies(layer, expressionVariablesIndex, processedDeps)
  }

  // assetLocalization.cpp:290-336
  async #processMetadata(layer: Layer, expressionVariablesIndex: number, primSpec: SdfPrimSpec): Promise<void> {
    if (this.#refTypesToInclude === UsdUtils_LocalizationReferenceType.All) {
      for (const infoKey of primSpec.getMetaDataInfoKeys()) {
        const value = _usdUtilsValue(primSpec.getInfo(infoKey), metadataFieldType(infoKey))
        if (!value) continue

        this.#delegate.beginProcessValue(layer, value)
        await this.#processAssetValue(layer, expressionVariablesIndex, infoKey, value,
          /* processingMetadata */ true, /* processingDictionary */ false)
        this.#delegate.endProcessValue(layer, primSpec.getPath(), infoKey, value)
      }
    }

    // Process clips["templateAssetPath"], which is a string value
    // containing one or more #'s. See
    // UsdClipsAPI::GetClipTemplateAssetPath for details.
    for (const clipSet of getClipSets(primSpec)) {
      const templatePath = getTemplateAssetPathForClipSet(primSpec, clipSet)
      if (templatePath === '') continue

      const clipFiles = UsdUtils_LocalizationContext.#getTemplatedClips(layer, templatePath)

      const dependencies = await this.#delegate.processClipTemplateAssetPath(
        layer, primSpec, clipSet, templatePath, clipFiles)

      await this.#enqueueDependencies(layer, expressionVariablesIndex, dependencies)
    }
  }

  // Searches for the clips of a given templated string. XXX: this method is
  // currently only implemented for filesystem paths and uses globbing to
  // find the clips (assetLocalization.cpp:339-387).
  static #getTemplatedClips(layer: Layer, templateAssetPath: string): string[] {
    const clipsDir = TfGetPathName(templateAssetPath)
    // Resolve clipsDir relative to this layer.
    if (clipsDir === '') {
      TF_WARN(`Invalid template asset path '${templateAssetPath}'.`)
      return []
    }
    const clipsDirAssetPath = SdfComputeAssetPathRelativeToLayer(layer, clipsDir)

    // This acts as a guard against non-filesystem based resolvers
    if (!_isDir(clipsDirAssetPath)) {
      TF_WARN(`Clips directory '${clipsDirAssetPath}' is not a valid directory on the filesystem.`)
      return []
    }

    const clipsBaseName = TfGetBaseName(templateAssetPath)
    const globPattern = TfStringCatPaths(clipsDirAssetPath, TfStringReplace(clipsBaseName, '#', '*'))
    let clipAssetRefs = tfGlob(globPattern)

    if (clipAssetRefs.length === 1 && clipAssetRefs[0] === globPattern) clipAssetRefs = []

    // Reconstruct the raw, unresolved clip reference, for which the
    // dependency must be processed.
    //
    // clipsDir contains a '/' in the end, but clipsDirAssetPath does not.
    // Hence, add a '/' to clipsDirAssetPath before doing the replace.
    return clipAssetRefs.map(clipAsset => TfStringReplace(clipAsset, `${clipsDirAssetPath}/`, clipsDir))
  }

  // assetLocalization.cpp:390-414
  async #processPayloads(layer: Layer, expressionVariablesIndex: number, primSpec: SdfPrimSpec): Promise<void> {
    const payloads = primSpec.getPayloadList()
    if (!payloads.hasKeys()) return

    for (const payload of payloads.getAppliedItems()) {
      if (payload.assetPath !== '') {
        await this.#enqueueDependency(layer, expressionVariablesIndex, payload.assetPath,
          /* composeExpressionVariables */ true)
      }
    }

    const processedDeps = await this.#delegate.processPayloads(
      layer, this.#composedExpressionVariables[expressionVariablesIndex]!, primSpec)
    await this.#enqueueDependencies(layer, expressionVariablesIndex, processedDeps,
      /* composeExpressionVariables */ true)
  }

  // assetLocalization.cpp:416-440
  async #processReferences(layer: Layer, expressionVariablesIndex: number, primSpec: SdfPrimSpec): Promise<void> {
    const references = primSpec.getReferenceList()
    if (!references.hasKeys()) return

    for (const reference of references.getAppliedItems()) {
      if (reference.assetPath !== '') {
        await this.#enqueueDependency(layer, expressionVariablesIndex, reference.assetPath,
          /* composeExpressionVariables */ true)
      }
    }

    const processedDeps = await this.#delegate.processReferences(
      layer, this.#composedExpressionVariables[expressionVariablesIndex]!, primSpec)
    await this.#enqueueDependencies(layer, expressionVariablesIndex, processedDeps,
      /* composeExpressionVariables */ true)
  }

  // assetLocalization.cpp:442-526
  async #processProperties(layer: Layer, expressionVariablesIndex: number, primSpec: SdfPrimSpec): Promise<void> {
    // Include external references in property values and metadata only if
    // the client is interested in all reference types. i.e. return early if
    // _refTypesToInclude is CompositionOnly.
    if (this.#refTypesToInclude === UsdUtils_LocalizationReferenceType.CompositionOnly) return

    // XXX:2016-04-14 Note that we use the field access API here rather than
    // calling GetAttributes, as creating specs for large numbers of
    // attributes, most of which are *not* asset path-valued and therefore
    // not useful here, is expensive.
    const propertyNames = primSpec.getField('properties')
    if (!Array.isArray(propertyNames)) return

    for (const name of propertyNames as string[]) {
      // For every property
      // Build an SdfPath to the property
      const path: SdfPath = primSpec.getPath().appendProperty(name)
      const pathString = path.pathString

      // Check property metadata
      for (const infoKey of layer.listFields(pathString)) {
        if (infoKey !== 'default' && infoKey !== 'timeSamples') {
          const value = _usdUtilsValue(layer.getField(pathString, infoKey), metadataFieldType(infoKey))
          if (!value) continue

          this.#delegate.beginProcessValue(layer, value)
          await this.#processAssetValue(layer, expressionVariablesIndex, '', value)
          this.#delegate.endProcessValue(layer, path, infoKey, value)
        }
      }

      // Check property existence
      const typeName = layer.getField(pathString, 'typeName')
      if (typeof typeName !== 'string') continue

      if (typeName === 'asset' || typeName === 'asset[]') {
        // Check default value
        const defValue = _usdUtilsValue(layer.getField(pathString, 'default'), typeName)
        if (defValue) {
          this.#delegate.beginProcessValue(layer, defValue)
          await this.#processAssetValue(layer, expressionVariablesIndex, '', defValue)
          this.#delegate.endProcessValue(layer, path, 'default', defValue)
        }

        // Check timeSample values
        for (const t of layer.listTimeSamplesForPath(pathString)) {
          const timeSampleVal = _usdUtilsValue(layer.queryTimeSample(pathString, t), typeName)
          if (!timeSampleVal) continue

          this.#delegate.beginProcessValue(layer, timeSampleVal)
          await this.#processAssetValue(layer, expressionVariablesIndex, '', timeSampleVal)
          this.#delegate.endProcessTimeSampleValue(layer, path, t, timeSampleVal)
        }
      }
    }
  }

  // assetLocalization.cpp:528-612
  async #processAssetValue(
    layer: Layer, expressionVariablesIndex: number, keyPath: string, val: UsdUtils_Value,
    processingMetadata = false, processingDictionary = false,
  ): Promise<void> {
    if (this.#shouldFilterAssetPath(keyPath, processingMetadata)) return

    const expressionVariables = this.#composedExpressionVariables[expressionVariablesIndex]!

    if (val.kind === 'asset') {
      const rawAssetPath = _assetPathOf(val.value)

      const dependencies = await this.#getDependencies(layer, rawAssetPath)

      const processedDeps = await this.#delegate.processValuePath(
        layer, expressionVariables, keyPath, rawAssetPath, dependencies,
        processingMetadata, processingDictionary)

      await this.#enqueueDependency(layer, expressionVariablesIndex, rawAssetPath)
      await this.#enqueueDependencies(layer, expressionVariablesIndex, processedDeps)
    } else if (val.kind === 'asset[]') {
      const originalArray = _assetPathArrayElements(val.value)

      // ensure explicit empty array value is preserved
      if (originalArray.length === 0) return

      for (const assetPath of originalArray) {
        const rawAssetPath = _assetPathOf(assetPath)
        const dependencies = await this.#getDependencies(layer, rawAssetPath)

        const processedDeps = await this.#delegate.processValuePathArrayElement(
          layer, expressionVariables, keyPath, rawAssetPath, dependencies)

        await this.#enqueueDependency(layer, expressionVariablesIndex, rawAssetPath)
        await this.#enqueueDependencies(layer, expressionVariablesIndex, processedDeps)
      }

      this.#delegate.endProcessingValuePathArray(layer, keyPath)
    } else if (_sdfIsDictionary(val.value)) {
      const entries = _dictionaryEntries(val.value)

      // ensure explicit empty dictionary value is preserved
      if (entries.length === 0) return

      for (const [key, entry] of entries) {
        const dictKey = keyPath === '' ? key : `${keyPath}:${key}`
        if (!entry) continue
        await this.#processAssetValue(layer, expressionVariablesIndex, dictKey, entry,
          processingMetadata, /* processingDictionary */ true)
      }
    }
  }

  // XXX: If we are going to add support for automatically processing
  // additional dependencies, they should be added here
  // (assetLocalization.cpp:614-622).
  #getDependencies(layer: Layer, assetPath: string): Promise<string[]> {
    return this.#getUdimTiles(layer, assetPath)
  }

  // Searches for udim tiles associated with the given asset path
  // (assetLocalization.cpp:624-651).
  async #getUdimTiles(layer: Layer, assetPath: string): Promise<string[]> {
    const additionalPaths: string[] = []

    if (!this.#resolveUdimPaths || !UsdShadeUdimUtils.isUdimIdentifier(assetPath)) return additionalPaths

    const resolvedUdimPath = await UsdShadeUdimUtils.resolveUdimPath(assetPath, layer)
    if (resolvedUdimPath === '') return additionalPaths

    const resolvedPaths = await UsdShadeUdimUtils.resolveUdimTilePaths(resolvedUdimPath, undefined)
    for (const [, tile] of resolvedPaths) {
      additionalPaths.push(UsdShadeUdimUtils.replaceUdimPattern(assetPath, tile))
    }

    return additionalPaths
  }

  // assetLocalization.cpp:653-664
  #shouldFilterAssetPath(key: string, processingMetadata: boolean): boolean {
    if (!processingMetadata || !this.#metadataFilteringEnabled) return false

    // We explicitly filter this key when the feature is enabled
    return key === 'assetInfo:identifier'
  }
}

// _GetClipSets (assetLocalization.cpp:244-265).
function getClipSets(primSpec: SdfPrimSpec): string[] {
  const clipSets: string[] = []
  const clipsValue = primSpec.getInfo('clips')
  if (!_sdfIsDictionary(clipsValue)) return clipSets
  for (const [clipSet, value] of _dictionaryEntries(clipsValue)) {
    if (value?.kind === 'dictionary') clipSets.push(clipSet)
  }
  return clipSets
}

// _GetTemplateAssetPathForClipSet (assetLocalization.cpp:267-287).
function getTemplateAssetPathForClipSet(primSpec: SdfPrimSpec, clipSetName: string): string {
  const clipsDict = primSpec.getInfo('clips') as Record<string, unknown>
  // UsdClipsAPIInfoKeys->templateAssetPath
  const value = _dictionaryGetValueAtPath(clipsDict, `${clipSetName}:templateAssetPath`)
  return typeof value === 'string' ? value : ''
}

// assetLocalization.cpp:675-732
class UsdUtils_ExtractExternalReferencesClient extends UsdUtils_ReadOnlyLocalizationClient {
  sublayers: string[] = []
  references: string[] = []
  payloads: string[] = []

  protected override async _processDependency(
    _layer: Layer, depInfo: UsdUtilsDependencyInfo, dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo> {
    if (depInfo.getDependencies().length === 0) {
      this.#placeAsset(depInfo.getAssetPath(), dependencyType)
    } else {
      for (const dependency of depInfo.getDependencies()) this.#placeAsset(dependency, dependencyType)
    }
    return UsdUtils_ExtractExternalReferencesClient._createUsdUtilsDependencyInfo('', [], '', undefined)
  }

  #placeAsset(dependency: string, dependencyType: UsdUtils_DependencyType): void {
    switch (dependencyType) {
      case UsdUtils_DependencyType.Sublayer:
        this.sublayers.push(dependency)
        break
      case UsdUtils_DependencyType.Reference:
      case UsdUtils_DependencyType.ClipTemplateAssetPath:
        this.references.push(dependency)
        break
      case UsdUtils_DependencyType.Payload:
        this.payloads.push(dependency)
        break
    }
  }

  sortAndRemoveDuplicates(): void {
    const sortUnique = (paths: string[]) => [...new Set(paths)].sort(byteOrder)
    this.sublayers = sortUnique(this.sublayers)
    this.references = sortUnique(this.references)
    this.payloads = sortUnique(this.payloads)
  }
}

// std::string operator< ordering.
function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * UsdUtils_ExtractExternalReferences (assetLocalization.h:202-208;
 * assetLocalization.cpp:734-762): the output arrays, when given, are
 * replaced with the sorted, deduplicated results.
 */
export async function UsdUtils_ExtractExternalReferences(
  filePath: string,
  refTypesToInclude: UsdUtils_LocalizationReferenceType,
  outSublayers: string[] | undefined,
  outReferences: string[] | undefined,
  outPayloads: string[] | undefined,
  params: UsdUtilsExtractExternalReferencesParams = new UsdUtilsExtractExternalReferencesParams(),
): Promise<void> {
  const client = new UsdUtils_ExtractExternalReferencesClient()
  const context = new UsdUtils_LocalizationContext(client)
  context.setRefTypesToInclude(refTypesToInclude)
  context.setRecurseLayerDependencies(false)
  context.setResolveUdimPaths(params.getResolveUdimPaths())

  await context.process(await Layer.findOrOpen(filePath))
  client.sortAndRemoveDuplicates()

  if (outSublayers) outSublayers.splice(0, outSublayers.length, ...client.sublayers)
  if (outReferences) outReferences.splice(0, outReferences.length, ...client.references)
  if (outPayloads) outPayloads.splice(0, outPayloads.length, ...client.payloads)
}
