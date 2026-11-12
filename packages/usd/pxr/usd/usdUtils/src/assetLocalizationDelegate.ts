// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/assetLocalizationDelegate.cpp,
//  pxr/usd/usdUtils/assetLocalizationDelegate.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/assetLocalizationDelegate.{h,cpp}
// (OpenUSD 26.11.1).
//
// The localization clients UsdUtils_LocalizationContext hands each
// discovered asset path to: a read-only client that reports processed paths,
// and a writable client that writes processed paths back to the layers (or to
// anonymous copies of them).
//
// Asynchrony: processing a dependency can call a user processing function,
// resolve paths and open layers, which are asynchronous in this port, so the
// methods that process paths return Promises where upstream returns the
// vectors directly. Methods that only record or write values stay
// synchronous.
//
// Values: typescript-usd values carry no C++ type, so the VtValues upstream
// passes (holding SdfAssetPath, VtArray<SdfAssetPath> or VtDictionary) are
// UsdUtils_Value records naming the held type, which the context reads from
// where Sdf keeps it (the attribute's typeName, the field's fallback, or the
// dictionary's recorded value types). An asset path is held as the authored
// string or an SdfAssetPath; an asset path array as a VtArray or array of
// either.

import {
  AssetPath as SdfAssetPath, Layer, ListOp as SdfListOp,
  type PrimSpec as SdfPrimSpec, VariableExpression as SdfVariableExpression,
  sdfIsVariableExpression, sdfGetDictionaryValueTypes,
} from 'typescript-usd/sdf'
import {
  _sdfCloneValue, _sdfIsDictionary, _sdfRecordDictionaryValueTypes, _sdfValuesEqual,
} from 'typescript-usd/sdf/_internal'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { IsPackageRelativePath as ArIsPackageRelativePath } from 'typescript-usd/ar'
import { Array as VtArray } from 'typescript-usd/vt'
import { TF_CODING_ERROR, TF_WARN, Type as TfType } from 'typescript-usd/tf'
import { UsdUtilsDependencyInfo } from './userProcessingFunc.ts'

/** Enum representing the type of dependency (assetLocalizationDelegate.h:23-29). */
export enum UsdUtils_DependencyType {
  Reference,
  Sublayer,
  Payload,
  ClipTemplateAssetPath,
}

// ---------------------------------------------------------------------------
// Typed values (see the header).
// ---------------------------------------------------------------------------

/** The VtValue types asset localization processes
 *  (UsdUtils_LocalizationContext::_ValueTypeIsRelevant,
 *  assetLocalization.cpp:666-673). */
export type UsdUtils_ValueKind = 'asset' | 'asset[]' | 'dictionary'

/** A VtValue holding an SdfAssetPath, a VtArray<SdfAssetPath> or a
 *  VtDictionary. */
export interface UsdUtils_Value {
  readonly kind: UsdUtils_ValueKind
  readonly value: unknown
}

const assetPathType = (): TfType => TfType.findByName('SdfAssetPath')

/** @internal The asset path an SdfAssetPath value holds
 *  (SdfAssetPath::GetAssetPath). */
export function _assetPathOf(value: unknown): string {
  if (value instanceof SdfAssetPath) return value.getAssetPath()
  return typeof value === 'string' ? value : ''
}

/** @internal The elements of an SdfAssetPath array value. */
export function _assetPathArrayElements(value: unknown): unknown[] {
  if (value instanceof VtArray) return value.toArray() as unknown[]
  return Array.isArray(value) ? value : []
}

function isAssetPathArray(value: unknown): boolean {
  if (value instanceof VtArray) return value.getElementType() === assetPathType()
  return Array.isArray(value) && value.length > 0 && value.every(item => item instanceof SdfAssetPath)
}

/**
 * @internal The value as asset localization sees it: a value holding an
 * SdfAssetPath, a VtArray<SdfAssetPath> or a VtDictionary, or undefined for
 * any other value. `declaredType` is the value's Sdf type name where Sdf
 * keeps it apart from the value ('asset' or 'asset[]').
 */
export function _usdUtilsValue(value: unknown, declaredType?: string): UsdUtils_Value | undefined {
  if (value === undefined || value === null) return undefined
  if (value instanceof SdfAssetPath) return { kind: 'asset', value }
  if (_sdfIsDictionary(value)) return { kind: 'dictionary', value }
  if (declaredType === 'asset' && typeof value === 'string') return { kind: 'asset', value }
  if (declaredType === 'asset[]' && (value instanceof VtArray || Array.isArray(value))) {
    return { kind: 'asset[]', value }
  }
  if (isAssetPathArray(value)) return { kind: 'asset[]', value }
  return undefined
}

/** @internal The entries of a dictionary value, in VtDictionary (std::map)
 *  order, each as asset localization sees it. */
export function _dictionaryEntries(dictionary: unknown): [string, UsdUtils_Value | undefined][] {
  const dict = dictionary as Record<string, unknown>
  const types = sdfGetDictionaryValueTypes(dict)
  return Object.keys(dict).sort(byteCompare)
    .map(key => [key, _usdUtilsValue(dict[key], types?.get(key))])
}

function byteCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// An SdfAssetPath value of the same representation as `original`.
function assetPathValueLike(original: unknown, assetPath: string): unknown {
  return original instanceof SdfAssetPath ? new SdfAssetPath(assetPath) : assetPath
}

// A VtArray<SdfAssetPath> value of the same representation as `original`.
function assetPathArrayLike(original: unknown, assetPaths: readonly string[]): unknown {
  const elements = _assetPathArrayElements(original)
  const asAssetPath = elements.length > 0 && elements[0] instanceof SdfAssetPath
  const items = assetPaths.map(path => asAssetPath ? new SdfAssetPath(path) : path)
  return new VtArray(items, assetPathType())
}

// ---------------------------------------------------------------------------
// VtDictionary key path editing (vt/dictionary.cpp:253-331) on Sdf's
// dictionary values, keeping each dictionary's recorded value types.
// ---------------------------------------------------------------------------

function setDictionaryEntry(
  dict: Record<string, unknown>, key: string, value: unknown, type: string | undefined,
): void {
  dict[key] = value
  const types = new Map(sdfGetDictionaryValueTypes(dict) ?? [])
  if (type === undefined) types.delete(key)
  else types.set(key, type)
  _sdfRecordDictionaryValueTypes(dict, types)
}

function eraseDictionaryEntry(dict: Record<string, unknown>, key: string): void {
  delete dict[key]
  const types = sdfGetDictionaryValueTypes(dict)
  if (types?.has(key)) {
    const remaining = new Map(types)
    remaining.delete(key)
    _sdfRecordDictionaryValueTypes(dict, remaining)
  }
}

// VtDictionary::SetValueAtPath (dictionary.cpp:253-293), ':' delimited.
function dictionarySetValueAtPath(
  dict: Record<string, unknown>, keyPath: string, value: unknown, type: string,
): void {
  const keyElems = keyPath.split(':').filter(elem => elem !== '')
  if (keyElems.length === 0) return
  let current = dict
  for (let i = 0; i < keyElems.length - 1; ++i) {
    const existing = current[keyElems[i]!]
    if (!_sdfIsDictionary(existing)) {
      const newDict: Record<string, unknown> = {}
      setDictionaryEntry(current, keyElems[i]!, newDict, 'dictionary')
      current = newDict
    } else {
      current = existing as Record<string, unknown>
    }
  }
  setDictionaryEntry(current, keyElems[keyElems.length - 1]!, value, type)
}

// VtDictionary::EraseValueAtPath (dictionary.cpp:304-350), ':' delimited:
// a subdictionary left empty is erased too.
function dictionaryEraseValueAtPath(dict: Record<string, unknown>, keyPath: string): void {
  const keyElems = keyPath.split(':').filter(elem => elem !== '')
  if (keyElems.length === 0) return
  const erase = (current: Record<string, unknown>, index: number): void => {
    const key = keyElems[index]!
    if (index === keyElems.length - 1) {
      eraseDictionaryEntry(current, key)
      return
    }
    const sub = current[key]
    if (_sdfIsDictionary(sub)) {
      erase(sub as Record<string, unknown>, index + 1)
      if (Object.keys(sub as object).length === 0) eraseDictionaryEntry(current, key)
    }
  }
  erase(dict, 0)
}

// VtDictionary::GetValueAtPath (dictionary.cpp:225-251), ':' delimited.
function dictionaryGetValueAtPath(dict: Record<string, unknown>, keyPath: string): unknown {
  let current: unknown = dict
  for (const elem of keyPath.split(':').filter(e => e !== '')) {
    if (!_sdfIsDictionary(current)) return undefined
    current = (current as Record<string, unknown>)[elem]
  }
  return current
}

/** @internal VtDictionary::GetValueAtPath with the default ':' delimiter. */
export const _dictionaryGetValueAtPath = dictionaryGetValueAtPath

// ---------------------------------------------------------------------------

/**
 * Evaluates any variable expressions in a path. This function should be
 * called before paths are passed to any processing functions. If this
 * function returns an empty string, it signals to the delegate that the path
 * should be skipped for further processing
 * (assetLocalizationDelegate.cpp:20-61).
 */
export function UsdUtils_EvaluateVariableExpressionInPath(
  expressionVariables: Readonly<Record<string, unknown>>, path: string,
): string {
  if (!sdfIsVariableExpression(path)) return path

  const expression = new SdfVariableExpression(path)
  const parseErrors = expression.getErrors()
  if (parseErrors.length > 0) {
    TF_WARN(`Failed to parse variable expression '${path}': ${parseErrors.join(', ')}`)
    return ''
  }

  const result = expression.evaluateTyped(expressionVariables as Record<string, never>, 'string')
  if (result.errors.length > 0) {
    TF_WARN(`Failed to evaluate variable expression '${path}': ${result.errors.join(', ')}`)
    return ''
  }

  // The expression evaluated to None, this is not an error, and we should
  // return an empty string so the path is skipped.
  if (result.value === undefined || result.value === null) return ''
  return result.value as string
}

// _AllDependenciesForInfo (assetLocalizationDelegate.cpp:74-86): the info's
// dependencies followed by its asset path.
function allDependenciesForInfo(depInfo: UsdUtilsDependencyInfo): string[] {
  return [...depInfo.getDependencies(), depInfo.getAssetPath()]
}

/**
 * The base class for localization clients: the interface
 * UsdUtils_LocalizationContext uses to process scene description
 * (assetLocalizationDelegate.h:31-133). The methods that process asset
 * paths return the additional asset paths the context should enqueue for
 * traversal.
 */
export abstract class UsdUtils_LocalizationClient {
  processSublayers(
    _layer: Layer, _expressionVariables: Readonly<Record<string, unknown>>,
  ): Promise<string[]> { return Promise.resolve([]) }

  processPayloads(
    _layer: Layer, _expressionVariables: Readonly<Record<string, unknown>>, _primSpec: SdfPrimSpec,
  ): Promise<string[]> { return Promise.resolve([]) }

  processReferences(
    _layer: Layer, _expressionVariables: Readonly<Record<string, unknown>>, _primSpec: SdfPrimSpec,
  ): Promise<string[]> { return Promise.resolve([]) }

  /** Signals the start of a new value. This will only be triggered if the
   *  value is relevant for localization (assetLocalizationDelegate.h:66-71). */
  beginProcessValue(_layer: Layer, _val: UsdUtils_Value): void {}

  processValuePath(
    _layer: Layer, _expressionVariables: Readonly<Record<string, unknown>>, _keyPath: string,
    _authoredPath: string, _dependencies: readonly string[],
    _processingMetadata = false, _processingDictionary = false,
  ): Promise<string[]> { return Promise.resolve([]) }

  processValuePathArrayElement(
    _layer: Layer, _expressionVariables: Readonly<Record<string, unknown>>, _keyPath: string,
    _authoredPath: string, _dependencies: readonly string[],
  ): Promise<string[]> { return Promise.resolve([]) }

  /** Signals that an asset path array value has been processed. It is safe
   *  to modify the array in this callback (assetLocalizationDelegate.h:88-92). */
  endProcessingValuePathArray(_layer: Layer, _keyPath: string): void {}

  endProcessTimeSampleValue(_layer: Layer, _path: SdfPath, _t: number, _val: UsdUtils_Value): void {}

  endProcessValue(_layer: Layer, _path: SdfPath, _key: string, _val: UsdUtils_Value): void {}

  processClipTemplateAssetPath(
    _layer: Layer, _primSpec: SdfPrimSpec, _clipSetName: string, _templateAssetPath: string,
    _dependencies: readonly string[],
  ): Promise<string[]> { return Promise.resolve([]) }

  /** Returns true if the supplied path is expected to resolve. An example
   *  case where resolution would not be expected is if it is a remapped path
   *  (such as in a USDZ archive) (assetLocalizationDelegate.h:112-115). */
  pathShouldResolve(_path: string): boolean { return true }

  protected abstract _processDependency(
    layer: Layer, dependencyInfo: UsdUtilsDependencyInfo, dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo>

  /** Use this function to create UsdUtilsDependencyInfo using the private
   *  constructor containing the raw asset path and expression variables
   *  (assetLocalizationDelegate.cpp:63-72). */
  protected static _createUsdUtilsDependencyInfo(
    assetPath: string, dependencies: readonly string[], rawAssetPath: string,
    expressionVariables: Readonly<Record<string, unknown>> | undefined,
  ): UsdUtilsDependencyInfo {
    return UsdUtilsDependencyInfo._create(assetPath, dependencies, rawAssetPath, expressionVariables)
  }
}

const createInfo = (
  assetPath: string, dependencies: readonly string[], rawAssetPath: string,
  expressionVariables: Readonly<Record<string, unknown>> | undefined,
): UsdUtilsDependencyInfo =>
  UsdUtilsDependencyInfo._create(assetPath, dependencies, rawAssetPath, expressionVariables)

/**
 * Base class for clients which would like to cache the results of the pure
 * virtual _processDependency method (assetLocalizationDelegate.h:135-155).
 */
export abstract class UsdUtils_CachedPathLocalizationClient extends UsdUtils_LocalizationClient {
  // Keyed by the layer's real path and the dependency's asset path.
  readonly #cachedPaths = new Map<string, string>()

  /** assetLocalizationDelegate.cpp:88-108: a cached result keeps only the
   *  processed asset path. */
  async getProcessedInfo(
    layer: Layer, dependencyInfo: UsdUtilsDependencyInfo, dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo> {
    const depKey = `${layer.realPath}\0${dependencyInfo.getAssetPath()}`
    const result = this.#cachedPaths.get(depKey)
    if (result === undefined) {
      const depInfo = await this._processDependency(layer, dependencyInfo, dependencyType)
      this.#cachedPaths.set(depKey, depInfo.getAssetPath())
      return depInfo
    }
    return new UsdUtilsDependencyInfo(result)
  }
}

/**
 * A delegate which allows for modification and optional removal of asset
 * path values. It invokes a user supplied processing function on every asset
 * path it encounters and updates the path with the returned value; an empty
 * value removes the asset path from the layer
 * (assetLocalizationDelegate.h:157-291).
 */
export abstract class UsdUtils_WritableLocalizationClient extends UsdUtils_CachedPathLocalizationClient {
  #currentValuePath = ''
  #currentValuePathArray: string[] = []
  // Holds the current state of the dictionary value that is being processed.
  // Note that this is a copy of the original value dictionary that was
  // passed in to BeginProcessValue.
  #currentValueDictionary: Record<string, unknown> = {}
  // Current state of the asset[] being processed
  #currentPathArray: string[] = []
  #editLayersInPlace = false
  #keepEmptyPathsInArrays = false
  // Maps source layers to their writable counterparts.
  // If _editLayersInPlace is true, the layers will map to themselves,
  // ensuring they stay alive for the duration of the localization process.
  // Otherwise, source layers will map to an anonymous copy that will be
  // used for all edits that would apply to the source layer
  readonly #writableLayerMap = new Map<Layer, Layer>()

  /** Processes sublayer paths, removing duplicates and only updates the
   *  paths in the writable layer if the processed list differs from the
   *  source list (assetLocalizationDelegate.cpp:110-159). */
  override async processSublayers(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>,
  ): Promise<string[]> {
    const sublayerPaths = layer.getSubLayerPaths()
    const processedPaths: string[] = [], dependencies: string[] = []

    for (const sublayerPath of sublayerPaths) {
      const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, sublayerPath)
      if (processedPath === '') continue

      const depInfo = createInfo(processedPath, [], sublayerPath, expressionVariables)
      const info = await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Sublayer)
      if (info.getAssetPath() === '') continue

      // duplicate paths are not allowed when calling SetSubLayerPaths
      if (processedPaths.includes(info.getAssetPath())) continue

      processedPaths.push(info.getAssetPath())
      dependencies.push(info.getAssetPath(), ...info.getDependencies())
    }

    if (processedPaths.length !== sublayerPaths.length ||
        processedPaths.some((path, i) => path !== sublayerPaths[i])) {
      const writableLayer = this._getOrCreateWritableLayer(layer)
      if (writableLayer) writableLayer.setSubLayerPaths(processedPaths)
    }

    return dependencies
  }

  override processPayloads(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, primSpec: SdfPrimSpec,
  ): Promise<string[]> {
    // assetLocalizationDelegate.cpp:161-170
    return this.#processReferencesOrPayloads(
      layer, expressionVariables, primSpec, 'payload', UsdUtils_DependencyType.Payload)
  }

  override processReferences(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, primSpec: SdfPrimSpec,
  ): Promise<string[]> {
    // assetLocalizationDelegate.cpp:172-181
    return this.#processReferencesOrPayloads(
      layer, expressionVariables, primSpec, 'references', UsdUtils_DependencyType.Reference)
  }

  // Processes references or payloads for a prim. Will only attempt to get a
  // writable layer if asset path processing modifies existing list ops
  // (assetLocalizationDelegate.cpp:184-229).
  async #processReferencesOrPayloads(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, primSpec: SdfPrimSpec,
    listOpToken: 'references' | 'payload', depType: UsdUtils_DependencyType,
  ): Promise<string[]> {
    const dependencies: string[] = []
    const field = primSpec.getField(listOpToken)
    if (field === undefined) return dependencies
    type Item = { assetPath: string }
    const processedListOps = SdfListOp.fromValue<Item>(_sdfCloneValue(field))

    // SdfListOp::ModifyOperations takes a synchronous callback; the
    // asynchronous processing of each item is done first, in the order
    // ModifyOperations visits the items (listOp.cpp:729-790), and its results
    // are then applied.
    const processed = new Map<Item, Item | undefined>()
    for (const type of ['explicit', 'added', 'prepended', 'appended', 'deleted', 'ordered'] as const) {
      for (const item of processedListOps.getItems(type)) {
        processed.set(item, await this.#processRefOrPayload(
          layer, expressionVariables, item, depType, dependencies))
      }
    }
    const modified = processedListOps.modifyOperations(item => processed.get(item))
    if (!modified) return dependencies

    const writableLayer = this._getOrCreateWritableLayer(layer)
    if (!writableLayer) return dependencies

    const writablePrim = writableLayer.getPrimAtPath(primSpec.getPath())!
    if (processedListOps.hasKeys()) writablePrim.setField(listOpToken, processedListOps.toValue())
    else writablePrim.clearField(listOpToken)

    return dependencies
  }

  // assetLocalizationDelegate.cpp:231-274
  async #processRefOrPayload<Item extends { assetPath: string }>(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, refOrPayload: Item,
    depType: UsdUtils_DependencyType, dependencies: string[],
  ): Promise<Item | undefined> {
    // If the asset path is empty this is a local payload. We can ignore
    // these since they refer to the same layer where the payload was
    // authored.
    if (refOrPayload.assetPath === '') return refOrPayload

    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(
      expressionVariables, refOrPayload.assetPath)

    // if we have a variable expression that evaluates to nothing, then we do
    // not want to do anything special here.
    if (processedPath === '') return refOrPayload

    const depInfo = createInfo(processedPath, [], refOrPayload.assetPath, expressionVariables)
    const info = await this.getProcessedInfo(layer, depInfo, depType)
    if (info.getAssetPath() === '') return undefined

    const processedRefOrPayload = { ...refOrPayload, assetPath: info.getAssetPath() }

    // Add the processed info to the list of paths the system will need
    // to further traverse
    dependencies.push(info.getAssetPath(), ...info.getDependencies())

    return processedRefOrPayload
  }

  /** When beginning to process a value, if the value is a dictionary,
   *  explicitly make a copy of it. As asset paths are encountered and
   *  updated, they will be updated in this copied dictionary
   *  (assetLocalizationDelegate.cpp:276-288). */
  override beginProcessValue(_layer: Layer, val: UsdUtils_Value): void {
    if (val.kind === 'dictionary') {
      this.#currentValueDictionary = _sdfCloneValue(val.value) as Record<string, unknown>
    }
  }

  // assetLocalizationDelegate.cpp:290-333
  override async processValuePath(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, keyPath: string,
    authoredPath: string, dependencies: readonly string[],
    processingMetadata = false, processingDictionary = false,
  ): Promise<string[]> {
    if (authoredPath === '') return []

    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, authoredPath)
    if (processedPath === '') return []

    const depInfo = createInfo(processedPath, dependencies, authoredPath, expressionVariables)
    const info = await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Reference)

    const relativeKeyPath = UsdUtils_WritableLocalizationClient._getRelativeKeyPath(keyPath)

    if (relativeKeyPath === '' ||
        (processingMetadata && !processingDictionary && info.getAssetPath() !== '')) {
      this.#currentValuePath = info.getAssetPath()
    } else if (info.getAssetPath() === '') {
      dictionaryEraseValueAtPath(this.#currentValueDictionary, relativeKeyPath)
      return []
    } else {
      dictionarySetValueAtPath(this.#currentValueDictionary, relativeKeyPath, info.getAssetPath(), 'asset')
    }

    return allDependenciesForInfo(info)
  }

  // assetLocalizationDelegate.cpp:335-369
  override async processValuePathArrayElement(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, _keyPath: string,
    authoredPath: string, dependencies: readonly string[],
  ): Promise<string[]> {
    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, authoredPath)
    if (processedPath === '') return []

    const depInfo = createInfo(processedPath, dependencies, authoredPath, expressionVariables)
    const info = await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Reference)

    if (info.getAssetPath() !== '') {
      this.#currentPathArray.push(info.getAssetPath())
      return allDependenciesForInfo(info)
    }
    // We don't want to remove empty paths from arrays. They may be
    // meaningful, for example in primvar attributes that need to be
    // a certain length.
    if (this.#keepEmptyPathsInArrays) this.#currentPathArray.push('')
    return []
  }

  // assetLocalizationDelegate.cpp:371-391
  override endProcessingValuePathArray(_layer: Layer, keyPath: string): void {
    const relativeKeyPath = UsdUtils_WritableLocalizationClient._getRelativeKeyPath(keyPath)

    if (relativeKeyPath === '') {
      this.#currentValuePathArray = this.#currentPathArray
    } else if (this.#currentPathArray.length === 0) {
      dictionaryEraseValueAtPath(this.#currentValueDictionary, relativeKeyPath)
    } else {
      dictionarySetValueAtPath(this.#currentValueDictionary, relativeKeyPath,
        new VtArray([...this.#currentPathArray], assetPathType()), 'asset[]')
    }

    this.#currentPathArray = []
  }

  // assetLocalizationDelegate.cpp:393-426: the processed value, or undefined
  // (an empty VtValue) when it was removed. VtValue::Take leaves the current
  // value empty for the next value.
  #getUpdatedValue(val: UsdUtils_Value): unknown {
    let updatedValue: unknown
    if (val.kind === 'asset') {
      const current = this.#currentValuePath
      this.#currentValuePath = ''
      updatedValue = current === '' && _assetPathOf(val.value) !== ''
        ? undefined : assetPathValueLike(val.value, current)
    } else if (val.kind === 'asset[]') {
      const current = this.#currentValuePathArray
      this.#currentValuePathArray = []
      updatedValue = current.length === 0 && _assetPathArrayElements(val.value).length !== 0
        ? undefined : assetPathArrayLike(val.value, current)
    } else {
      const current = this.#currentValueDictionary
      this.#currentValueDictionary = {}
      updatedValue = Object.keys(current).length === 0 &&
        Object.keys(val.value as object).length !== 0 ? undefined : current
    }
    return updatedValue
  }

  // VtValue equality of the original and processed value.
  static #valuesEqual(val: UsdUtils_Value, updatedValue: unknown): boolean {
    if (updatedValue === undefined) return false
    if (val.kind === 'asset') return _assetPathOf(val.value) === _assetPathOf(updatedValue)
    if (val.kind === 'asset[]') {
      const a = _assetPathArrayElements(val.value), b = _assetPathArrayElements(updatedValue)
      return a.length === b.length && a.every((item, i) => _assetPathOf(item) === _assetPathOf(b[i]))
    }
    return _sdfValuesEqual(val.value, updatedValue)
  }

  // assetLocalizationDelegate.cpp:428-451
  override endProcessValue(layer: Layer, path: SdfPath, key: string, val: UsdUtils_Value): void {
    const updatedValue = this.#getUpdatedValue(val)
    if (UsdUtils_WritableLocalizationClient.#valuesEqual(val, updatedValue)) return

    const writableLayer = this._getOrCreateWritableLayer(layer)
    if (writableLayer) {
      if (updatedValue === undefined) writableLayer.eraseField(path.pathString, key)
      else writableLayer.setField(path.pathString, key, updatedValue)
    }
  }

  // assetLocalizationDelegate.cpp:453-475
  override endProcessTimeSampleValue(layer: Layer, path: SdfPath, t: number, val: UsdUtils_Value): void {
    const updatedValue = this.#getUpdatedValue(val)
    if (UsdUtils_WritableLocalizationClient.#valuesEqual(val, updatedValue)) return

    const writableLayer = this._getOrCreateWritableLayer(layer)
    if (writableLayer) {
      if (updatedValue === undefined) writableLayer.eraseTimeSample(path, t)
      else writableLayer.setAttrTimeSample(path.getPrimPath().pathString, path.name, t, updatedValue)
    }
  }

  // assetLocalizationDelegate.cpp:477-511
  override async processClipTemplateAssetPath(
    layer: Layer, primSpec: SdfPrimSpec, clipSetName: string, templateAssetPath: string,
    dependencies: readonly string[],
  ): Promise<string[]> {
    const depInfo = new UsdUtilsDependencyInfo(templateAssetPath, dependencies)
    const info = await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Reference)

    if (info.getAssetPath() === templateAssetPath) return allDependenciesForInfo(info)

    const writableLayer = this._getOrCreateWritableLayer(layer)
    if (!writableLayer) return allDependenciesForInfo(info)

    const writablePrim = writableLayer.getPrimAtPath(primSpec.getPath())!
    const clipsDict = _sdfCloneValue(writablePrim.getInfo('clips')) as Record<string, unknown>
    // UsdClipsAPIInfoKeys->templateAssetPath
    const keyPath = `${clipSetName}:templateAssetPath`
    dictionarySetValueAtPath(clipsDict, keyPath, info.getAssetPath(), 'string')
    writablePrim.setInfo('clips', clipsDict)

    return allDependenciesForInfo(info)
  }

  /** Controls whether layers are edited in place. If this is enabled, the
   *  source layers will be written to directly. If disabled, anonymous
   *  copies of layers will be created before writing any changes
   *  (assetLocalizationDelegate.h:216-224). */
  setEditLayersInPlace(editLayersInPlace: boolean): void {
    this.#editLayersInPlace = editLayersInPlace
  }

  /** Controls whether empty asset paths are kept in arrays
   *  (assetLocalizationDelegate.h:226-236). */
  setKeepEmptyPathsInArrays(keep: boolean): void {
    this.#keepEmptyPathsInArrays = keep
  }

  /** Returns the layer that was used for writing the passed in layer. Note
   *  that if _editLayersInPlace is true, or there were no edits to the
   *  particular layer, the passed in value will be returned
   *  (assetLocalizationDelegate.cpp:566-581). */
  getLayerUsedForWriting(layer: Layer): Layer {
    if (this.#editLayersInPlace) return layer
    return this.#writableLayerMap.get(layer) ?? layer
  }

  /** Removes the reference to the layer used for writing changes to the
   *  source layer (assetLocalizationDelegate.cpp:583-588). */
  clearLayerUsedForWriting(layer: Layer): void {
    this.#writableLayerMap.delete(layer)
  }

  // assetLocalizationDelegate.cpp:513-524
  static _getRelativeKeyPath(fullPath: string): string {
    const pos = fullPath.indexOf(':')
    return pos < 0 ? fullPath : fullPath.slice(pos + 1)
  }

  /** Creates or retrieves the anonymous layer used for writing changes to
   *  the source layer. If _editLayersInPlace is true then the passed in
   *  layer will be returned (assetLocalizationDelegate.cpp:526-564). */
  protected _getOrCreateWritableLayer(layer: Layer | undefined): Layer | undefined {
    if (!layer) return undefined

    // We do not allow writing to package layers or layers contained within
    // existing packages. Doing so would require us to expand and rebuild
    // the existing package.
    if (layer.getFileFormat()?.isPackage() || ArIsPackageRelativePath(layer.identifier)) {
      TF_CODING_ERROR(`Unable to edit asset path in package layer: ${layer.identifier}`)
      return undefined
    }

    // Even when editing layers in place we still want to insert them into
    // the map. This ensures that they will remain alive for the duration of
    // the localization process.
    const existing = this.#writableLayerMap.get(layer)
    if (existing) return existing
    this.#writableLayerMap.set(layer, layer)
    if (this.#editLayersInPlace) return layer

    const format = layer.getFileFormat()
    const copiedLayer = format
      ? Layer.createAnonymous(layer.getDisplayName(), format, layer.getFileFormatArguments())
      : Layer.createAnonymous(layer.getDisplayName(), layer.getFileFormatArguments())
    copiedLayer.transferContent(layer)
    this.#writableLayerMap.set(layer, copiedLayer)
    return copiedLayer
  }
}

/**
 * This delegate provides clients with read-only access to processed asset
 * references. This delegate does not maintain any state
 * (assetLocalizationDelegate.h:293-339).
 */
export abstract class UsdUtils_ReadOnlyLocalizationClient extends UsdUtils_CachedPathLocalizationClient {
  // assetLocalizationDelegate.cpp:590-621
  override async processSublayers(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>,
  ): Promise<string[]> {
    const dependencies: string[] = []
    for (const path of layer.getSubLayerPaths()) {
      const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, path)
      if (processedPath === '') continue

      const depInfo = createInfo(processedPath, [], path, expressionVariables)
      const info = await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Sublayer)
      if (info.getAssetPath() === '') continue

      dependencies.push(info.getAssetPath(), ...info.getDependencies())
    }
    return dependencies
  }

  // assetLocalizationDelegate.cpp:623-632
  override processPayloads(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, primSpec: SdfPrimSpec,
  ): Promise<string[]> {
    return this.#processReferencesOrPayloads(layer, expressionVariables,
      primSpec.getPayloadList().getAppliedItems(), UsdUtils_DependencyType.Payload)
  }

  // assetLocalizationDelegate.cpp:634-643
  override processReferences(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, primSpec: SdfPrimSpec,
  ): Promise<string[]> {
    return this.#processReferencesOrPayloads(layer, expressionVariables,
      primSpec.getReferenceList().getAppliedItems(), UsdUtils_DependencyType.Reference)
  }

  // assetLocalizationDelegate.cpp:646-689
  async #processReferencesOrPayloads(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>,
    appliedItems: readonly { assetPath: string }[], dependencyType: UsdUtils_DependencyType,
  ): Promise<string[]> {
    const dependencies: string[] = []
    for (const refOrPayload of appliedItems) {
      // If the asset path is empty this is a local reference or payload.
      // We can ignore these since they refer to the same layer where it was
      // authored.
      if (refOrPayload.assetPath === '') continue

      const processedPath = UsdUtils_EvaluateVariableExpressionInPath(
        expressionVariables, refOrPayload.assetPath)

      // if an expression variable evaluated to nothing, then we do not need
      // to take any action here
      if (processedPath === '') continue

      const depInfo = createInfo(processedPath, [], refOrPayload.assetPath, expressionVariables)
      const info = await this.getProcessedInfo(layer, depInfo, dependencyType)
      if (info.getAssetPath() === '') continue

      dependencies.push(info.getAssetPath(), ...info.getDependencies())
    }
    return dependencies
  }

  // assetLocalizationDelegate.cpp:691-716
  override async processValuePath(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, _keyPath: string,
    authoredPath: string, dependencies: readonly string[],
  ): Promise<string[]> {
    if (authoredPath === '') return []

    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, authoredPath)
    if (processedPath === '') return []

    const depInfo = createInfo(processedPath, dependencies, authoredPath, expressionVariables)
    return allDependenciesForInfo(
      await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Reference))
  }

  // assetLocalizationDelegate.cpp:718-743
  override async processValuePathArrayElement(
    layer: Layer, expressionVariables: Readonly<Record<string, unknown>>, _keyPath: string,
    authoredPath: string, dependencies: readonly string[],
  ): Promise<string[]> {
    // We may get passed an empty authored path if an array has some
    // explicitly empty elements.
    if (authoredPath === '') return []

    const processedPath = UsdUtils_EvaluateVariableExpressionInPath(expressionVariables, authoredPath)
    if (processedPath === '') return []

    const depInfo = createInfo(processedPath, dependencies, authoredPath, expressionVariables)
    return allDependenciesForInfo(
      await this.getProcessedInfo(layer, depInfo, UsdUtils_DependencyType.Reference))
  }

  // assetLocalizationDelegate.cpp:745-756
  override async processClipTemplateAssetPath(
    layer: Layer, _primSpec: SdfPrimSpec, _clipSetName: string, templateAssetPath: string,
    dependencies: readonly string[],
  ): Promise<string[]> {
    return allDependenciesForInfo(await this.getProcessedInfo(
      layer, new UsdUtilsDependencyInfo(templateAssetPath, dependencies),
      UsdUtils_DependencyType.ClipTemplateAssetPath))
  }
}
