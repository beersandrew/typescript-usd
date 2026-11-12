// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/stitchClips.cpp,
//  pxr/usd/usdUtils/stitchClips.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/stitchClips.{h,cpp} (OpenUSD 26.11.1).
//
// Creating layers that use USD Value Clips to merge the time samples of a
// set of clip layers without copying the samples: an aggregated topology
// layer, a clip manifest layer, and a result layer with the clip metadata.
//
// The functions that open, save or delete layers are asynchronous here,
// since this port's layer I/O is (Layer.findOrOpen, Layer.createNew,
// layer.save); upstream they are synchronous.

import { _deleteFile, _isFile, _isWritable } from 'typescript-usd/ar/_internal'
import { Vec2d as GfVec2d } from 'typescript-usd/gf'
import {
  AssetPath as SdfAssetPath,
  Layer,
  sdfCreatePrimInLayer,
  sdfJustCreatePrimAttributeInLayer,
  type Variability as SdfVariability,
} from 'typescript-usd/sdf'
import { _sdfCoerceValueToType, _sdfRecordDictionaryValueTypes } from 'typescript-usd/sdf/_internal'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  TF_CODING_ERROR, TF_RUNTIME_ERROR, TF_VERIFY, TfErrorMark, TfGetPathName, TfNormPath, TfStringStartsWith,
} from 'typescript-usd/tf'
import { ClipsAPI as UsdClipsAPI } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import { UsdUtilsStitchLayers, UsdUtilsStitchValueStatus } from './stitch.ts'

// UsdClipsAPIInfoKeys (clipsAPI.h) used here.
const InfoKeys = {
  active: 'active',
  assetPaths: 'assetPaths',
  interpolateMissingClipValues: 'interpolateMissingClipValues',
  manifestAssetPath: 'manifestAssetPath',
  primPath: 'primPath',
  templateActiveOffset: 'templateActiveOffset',
  templateAssetPath: 'templateAssetPath',
  templateEndTime: 'templateEndTime',
  templateStartTime: 'templateStartTime',
  templateStride: 'templateStride',
  times: 'times',
} as const

// UsdClipsAPISetNames->default_ (clipsAPI.h).
const DEFAULT_CLIP_SET = UsdClipsAPI.defaultClipSet

// constants (stitchClips.cpp:50-55)
// std::numeric_limits<double>::max().
const TIME_MAX = Number.MAX_VALUE

// We insert the topology layer as the strongest.
const TOPOLOGY_SUBLAYER_STRENGTH = 0

function toPath(path: SdfPath | string): SdfPath {
  return typeof path === 'string' ? SdfPath.fromString(path) : path
}

// SdfLayer::GetRealPath (layer.h:519-526): an anonymous layer has none.
function realPathOf(layer: Layer): string {
  return layer.isAnonymous() ? '' : layer.realPath
}

// _LayerIsWritable (stitchClips.cpp:57-71): convenience function for
// wrapping up a nice error message when checking os permissions of a
// layer's backing file.
function layerIsWritable(layer: Layer | undefined): boolean {
  if (layer && _isFile(layer.identifier) && !_isWritable(layer.identifier)) {
    TF_RUNTIME_ERROR(`Error: Layer ${layer.identifier} is unwritable.`)
    return false
  }
  return true
}

type ClipCollection = 'assetPaths' | 'times' | 'active'

// _GetUnboxedValue<T> (stitchClips.cpp:73-94): looks up a clip value at a
// prim; a value not holding the expected type is a default constructed T
// (an empty array).
function getUnboxedArray<T>(
  layer: Layer, primPath: SdfPath, key: ClipCollection, clipSet: string, typeName: 'asset[]' | 'double2[]',
): T[] {
  const boxedValue = layer.getFieldDictValueByKey(primPath.pathString, 'clips', `${clipSet}:${key}`)
  if (boxedValue instanceof VtArray &&
      boxedValue.getElementType().getTypeName() === (typeName === 'asset[]' ? 'SdfAssetPath' : 'GfVec2d')) {
    return (boxedValue as VtArray<T>).toArray()
  }
  return []
}

function getAssetPaths(layer: Layer, primPath: SdfPath, clipSet: string): (SdfAssetPath | string)[] {
  return getUnboxedArray<SdfAssetPath | string>(layer, primPath, 'assetPaths', clipSet, 'asset[]')
}

function getVec2ds(layer: Layer, primPath: SdfPath, key: 'times' | 'active', clipSet: string): GfVec2d[] {
  return getUnboxedArray<GfVec2d>(layer, primPath, key, clipSet, 'double2[]')
}

// _SetValue<T> (stitchClips.cpp:96-109).
function setValue(layer: Layer, primPath: SdfPath, key: string, value: unknown, clipSet: string): void {
  layer.setFieldDictValueByKey(primPath.pathString, 'clips', `${clipSet}:${key}`, value)
}

function setAssetPaths(layer: Layer, primPath: SdfPath, values: readonly (SdfAssetPath | string)[], clipSet: string): void {
  setValue(layer, primPath, InfoKeys.assetPaths, _sdfCoerceValueToType([...values], 'asset[]'), clipSet)
}

function setVec2ds(
  layer: Layer, primPath: SdfPath, key: 'times' | 'active', values: readonly GfVec2d[], clipSet: string,
): void {
  setValue(layer, primPath, key, _sdfCoerceValueToType([...values], 'double2[]'), clipSet)
}

// _AppendCollection<C> (stitchClips.cpp:111-138): appends the collection at
// `path` in the rhs layer to the lhs at the same prim path. This is useful
// for joining collections which can't subscribe to our notion of
// precedence in stitching.
function appendCollection(lhs: Layer, rhs: Layer, path: SdfPath, key: ClipCollection, clipSet: string): void {
  if (key === 'assetPaths') {
    setAssetPaths(lhs, path, [...getAssetPaths(lhs, path, clipSet), ...getAssetPaths(rhs, path, clipSet)], clipSet)
  } else {
    setVec2ds(lhs, path, key,
      [...getVec2ds(lhs, path, key, clipSet), ...getVec2ds(rhs, path, key, clipSet)], clipSet)
  }
}

// _RetimeClipActive (stitchClips.cpp:140-157): retime a set of clipActives
// that have been joined together with _MergeRootLayerMetadata.
function retimeClipActive(layer: Layer, path: SdfPath, clipSet: string): void {
  let timer = 0
  const result = getVec2ds(layer, path, InfoKeys.active, clipSet)
    .map(clipActive => new GfVec2d(clipActive.get(0), timer++))
  setVec2ds(layer, path, InfoKeys.active, result, clipSet)
}

// _GetRelativePathIfPossible (stitchClips.cpp:159-190): try to determine if
// we should use a relative path for this clip asset path. If the clip's
// identifier itself has no directory component, assume it's relative to
// the result layer. Otherwise, look at the real paths to see if the clip
// path can be made relative to the result layer.
function getRelativePathIfPossible(
  referencedIdentifier: string, referencedRealPath: string, resultRealPath: string,
): string {
  // Use TfNormPath to ensure consistent formatting across platforms.
  let resultingIdentifier = ''
  if (TfGetPathName(referencedIdentifier) === '') {
    resultingIdentifier = `./${TfNormPath(referencedIdentifier)}`
  } else if (resultRealPath !== '') {
    // resultRealPath may be empty if the result layer is an anonymous
    // layer. In that case, we cannot relativize referencedIdentifier.
    const normResultRealPath = TfNormPath(resultRealPath)
    const normReferencedRealPath = TfNormPath(referencedRealPath)

    const resultDir = TfGetPathName(normResultRealPath)
    if (resultDir !== '' && TfStringStartsWith(normReferencedRealPath, resultDir)) {
      resultingIdentifier = `./${normReferencedRealPath.slice(resultDir.length)}`
    }
  }

  return resultingIdentifier === '' ? referencedIdentifier : resultingIdentifier
}

// _NormalizeClipAssetPaths (stitchClips.cpp:192-233): during parallel
// generation, we generate non-relative paths for clipAssetPaths so we need
// a post-processing pass. Paths which already existed in the root layer
// are kept; the newly stitched ones are normalized.
function normalizeClipAssetPaths(
  resultLayer: Layer, clipLayers: readonly Layer[], clipPath: SdfPath, clipSet: string,
): void {
  const currentAssetPaths = getAssetPaths(resultLayer, clipPath, clipSet)
  const diff = currentAssetPaths.length - clipLayers.length

  const result: (SdfAssetPath | string)[] = []

  // keep existing paths which don't need to be normalized
  for (let i = 0; i < diff; ++i) {
    result.push(currentAssetPaths[i]!)
  }

  const resultPath = realPathOf(resultLayer)

  // update newly added clip paths which need normalizing
  for (let i = 0; i < currentAssetPaths.length - diff; ++i) {
    const path = getRelativePathIfPossible(
      clipLayers[i]!.identifier, realPathOf(clipLayers[i]!), resultPath)
    result.push(new SdfAssetPath(path))
  }

  setAssetPaths(resultLayer, clipPath, result, clipSet)
}

// _MergeRootLayerMetadata (stitchClips.cpp:235-258): merge two root
// layers' metadata by joining the collections, rather than keeping the
// stronger value as stitching does. This is useful when there are multiple
// root layers created during parallel stitching.
function mergeRootLayerMetadata(lhs: Layer, rhs: Layer, clipPath: SdfPath, clipSet: string): void {
  appendCollection(lhs, rhs, clipPath, InfoKeys.assetPaths, clipSet)
  appendCollection(lhs, rhs, clipPath, InfoKeys.times, clipSet)
  appendCollection(lhs, rhs, clipPath, InfoKeys.active, clipSet)
}

// _StitchClipPrimPath (stitchClips.cpp:260-269): add the clipPrimPath
// metadata at `stitchPath` within `resultLayer`.
function stitchClipPrimPath(resultLayer: Layer, stitchPath: SdfPath, clipSet: string): void {
  setValue(resultLayer, stitchPath, InfoKeys.primPath, stitchPath.pathString, clipSet)
}

// XXX(Frame->Time): backwards compatibility. Temporary helper functions to
// support backwards compatibility (stitchClips.cpp:271-330).

function hasStartFrame(layer: Layer): boolean {
  return layer.getPseudoRoot().hasInfo('startFrame')
}

function hasEndFrame(layer: Layer): boolean {
  return layer.getPseudoRoot().hasInfo('endFrame')
}

function getStartFrame(layer: Layer): number {
  const startFrame = layer.getPseudoRoot().getInfo('startFrame')
  return typeof startFrame === 'number' ? startFrame : 0.0
}

function getEndFrame(layer: Layer): number {
  const endFrame = layer.getPseudoRoot().getInfo('endFrame')
  return typeof endFrame === 'number' ? endFrame : 0.0
}

// SdfLayer::HasStartTimeCode / GetStartTimeCode (layer.cpp): the
// pseudo-root's startTimeCode field, 0 when unauthored.
function layerTimeCode(layer: Layer, field: 'startTimeCode' | 'endTimeCode'): number | undefined {
  if (!layer.hasField('/', field)) return undefined
  const value = layer.getField('/', field)
  return typeof value === 'number' ? value : 0.0
}

// Backwards compatible helper function for getting the startTimeCode of a
// layer.
function getStartTimeCode(layer: Layer): number {
  return layerTimeCode(layer, 'startTimeCode') ??
    (hasStartFrame(layer) ? getStartFrame(layer) : 0.0)
}

// Backwards compatible helper function for getting the endTimeCode of a
// layer.
function getEndTimeCode(layer: Layer): number {
  return layerTimeCode(layer, 'endTimeCode') ??
    (hasEndFrame(layer) ? getEndFrame(layer) : 0.0)
}

// _StitchClipActive (stitchClips.cpp:334-361).
function stitchClipActive(resultLayer: Layer, clipLayer: Layer, stitchPath: SdfPath, clipSet: string): void {
  const currentClipActive = getVec2ds(resultLayer, stitchPath, InfoKeys.active, clipSet)

  // grab the number of elements in clipAssetPaths. Note that this code is
  // contingent on _StitchClipAssetPath() being called first in
  // _StitchClipMetadata().
  const clipIndex = getAssetPaths(resultLayer, stitchPath, clipSet).length - 1

  if (resultLayer.getPrimAtPath(stitchPath)) {
    const startTimeCode = getStartTimeCode(clipLayer)
    currentClipActive.push(new GfVec2d(startTimeCode, clipIndex))
    setVec2ds(resultLayer, stitchPath, InfoKeys.active, currentClipActive, clipSet)
  }
}

// _StitchClipTime (stitchClips.cpp:363-395): add the clipTime metadata at
// `stitchPath` within `resultLayer`.
function stitchClipTime(resultLayer: Layer, clipLayer: Layer, stitchPath: SdfPath, clipSet: string): void {
  const currentClipTimes = getVec2ds(resultLayer, stitchPath, InfoKeys.times, clipSet)

  if (resultLayer.getPrimAtPath(stitchPath)) {
    const startTimeCode = getStartTimeCode(clipLayer)
    const endTimeCode = getEndTimeCode(clipLayer)
    const timeSpent = endTimeCode - startTimeCode

    // insert the sample pair into the cliptimes
    currentClipTimes.push(new GfVec2d(startTimeCode, startTimeCode))

    // We need not author duplicate pairs
    if (timeSpent !== 0) {
      currentClipTimes.push(new GfVec2d(startTimeCode + timeSpent, endTimeCode))
    }

    setVec2ds(resultLayer, stitchPath, InfoKeys.times, currentClipTimes, clipSet)
  }
}

// _StitchClipsTopologySubLayerPath (stitchClips.cpp:397-410): we only want
// to add the topology layer if it hasn't been previously sublayered into
// this result layer.
function stitchClipsTopologySubLayerPath(resultLayer: Layer, topIdentifier: string): void {
  const sublayers = resultLayer.getSubLayerPaths()
  if (!sublayers.includes(topIdentifier)) {
    resultLayer.insertSubLayerPath(topIdentifier, TOPOLOGY_SUBLAYER_STRENGTH)
  }
}

// _StitchClipAssetPath (stitchClips.cpp:412-436): add the clipAssetPath
// metadata at `stitchPath` within `resultLayer`.
function stitchClipAssetPath(resultLayer: Layer, clipLayer: Layer, stitchPath: SdfPath, clipSet: string): void {
  const currentAssets = getAssetPaths(resultLayer, stitchPath, clipSet)

  if (resultLayer.getPrimAtPath(stitchPath)) {
    const clipId = getRelativePathIfPossible(
      clipLayer.identifier, realPathOf(clipLayer), realPathOf(resultLayer))
    currentAssets.push(new SdfAssetPath(clipId))
    setAssetPaths(resultLayer, stitchPath, currentAssets, clipSet)
  }
}

// _StitchClipManifest (stitchClips.cpp:438-454): add the
// clipManifestAssetPath metadata at `stitchPath` within `resultLayer`.
function stitchClipManifest(resultLayer: Layer, manifestLayer: Layer, stitchPath: SdfPath, clipSet: string): void {
  const manifestAssetPath = getRelativePathIfPossible(
    manifestLayer.identifier, realPathOf(manifestLayer), realPathOf(resultLayer))
  setValue(resultLayer, stitchPath, InfoKeys.manifestAssetPath, new SdfAssetPath(manifestAssetPath), clipSet)
}

// _StitchClipMetadata (stitchClips.cpp:456-503): model clip stitching
// creates a set of "overs" matching the topology at `stitchPath`, then
// aggregates the clip data: clipPrimPath, clipAssetPaths, clipActive and
// clipTimes. Note that the ordering of these operations is important, as
// _StitchClipActive() and _StitchClipTime() rely on _StitchClipAssetPath()
// having been called.
function stitchClipMetadata(
  resultLayer: Layer, clipLayer: Layer, stitchPath: SdfPath, _startTimeCode: number, clipSet: string,
): void {
  // Create overs to match structure
  sdfCreatePrimInLayer(resultLayer, stitchPath)

  stitchClipPrimPath(resultLayer, stitchPath, clipSet)
  stitchClipAssetPath(resultLayer, clipLayer, stitchPath, clipSet)
  stitchClipActive(resultLayer, clipLayer, stitchPath, clipSet)
  stitchClipTime(resultLayer, clipLayer, stitchPath, clipSet)
}

// _SetTimeCodeRange (stitchClips.cpp:505-556): set the start and end time
// codes in `resultLayer` from the clip times at `clipDataPath`: the minimum
// stage time (unless one is supplied) and the maximum. If the prim has no
// clip times, neither is set.
function setTimeCodeRange(
  resultLayer: Layer, clipDataPath: SdfPath, startTimeCode: number, endTimeCode: number, clipSet: string,
): void {
  // it is a coding error to look up clip data in a non-existent path
  if (!resultLayer.getPrimAtPath(clipDataPath)) {
    TF_CODING_ERROR(`Invalid prim in path: @${resultLayer.identifier}@<${clipDataPath.pathString}>`)
    return
  }

  // obtain the current set of clip times, sorted on stage frame number
  const currentClipTimes = getVec2ds(resultLayer, clipDataPath, InfoKeys.times, clipSet)
    .sort((v1, v2) => v1.get(0) - v2.get(0))

  // exit if we have no data to set the startframes with
  if (currentClipTimes.length === 0) {
    return
  }

  // grab the min at the front and max at the back
  if (endTimeCode === TIME_MAX) {
    endTimeCode = currentClipTimes[currentClipTimes.length - 1]!.get(0)
  }
  resultLayer.setField('/', 'endTimeCode', endTimeCode)

  if (startTimeCode === TIME_MAX) {
    startTimeCode = currentClipTimes[0]!.get(0)
  }
  resultLayer.setField('/', 'startTimeCode', startTimeCode)
}

// _StitchLayersIgnoringClipData (stitchClips.cpp:558-573).
function stitchLayersIgnoringClipData(strongLayer: Layer, weakLayer: Layer): void {
  UsdUtilsStitchLayers(strongLayer, weakLayer, field =>
    field === 'timeSamples' || field === 'spline'
      ? UsdUtilsStitchValueStatus.NoStitchedValue
      : UsdUtilsStitchValueStatus.UseDefaultValue)
}

// _StitchLayersResult (stitchClips.cpp:575-614): the result of the
// successive computations done by parallel_reduce.
class StitchLayersResult {
  readonly topology = Layer.createAnonymous()
  readonly root = Layer.createAnonymous()

  constructor(readonly clipPath: SdfPath, readonly clipSet: string) {}

  // operator() (stitchClips.cpp:595-606).
  apply(clipLayers: readonly Layer[]): void {
    for (const layer of clipLayers) {
      stitchLayersIgnoringClipData(this.topology, layer)
      if (!this.clipPath.equals(SdfPath.absoluteRootPath)) {
        stitchClipMetadata(this.root, layer, this.clipPath, getStartTimeCode(layer), this.clipSet)
      }
    }
  }

  // join (stitchClips.cpp:608-613).
  join(rhs: StitchLayersResult): void {
    stitchLayersIgnoringClipData(this.topology, rhs.topology)
    if (!this.clipPath.equals(SdfPath.absoluteRootPath)) {
      mergeRootLayerMetadata(this.root, rhs.root, this.clipPath, this.clipSet)
    }
  }
}

// _AggregateDataFromClips (stitchClips.cpp:616-632).
function aggregateDataFromClips(
  _topologyLayer: Layer, clipLayers: readonly Layer[],
  clipPath: SdfPath = SdfPath.absoluteRootPath, clipSet: string = DEFAULT_CLIP_SET,
): StitchLayersResult {
  // Create a result which will store the result of the successive
  // computations done by parallel_reduce.
  // PLATFORM-DIVERGENCE(usdutils-stitch-clips-serial-reduce): tbb::
  // parallel_reduce (stitchClips.cpp:627-629) may split the clip range
  // across threads and join the partial results; JavaScript has no
  // shared-memory threads, so the whole range is reduced in one body,
  // which is the reduction of an unsplit range.
  const result = new StitchLayersResult(clipPath, clipSet)
  result.apply(clipLayers)
  return result
}

// _GenerateClipManifest (stitchClips.cpp:634-681).
function generateClipManifest(
  manifestLayer: Layer, topologyLayer: Layer, clipLayers: readonly Layer[], clipPath: SdfPath,
): void {
  const generatedManifest = UsdClipsAPI.generateClipManifestFromLayers([...clipLayers], clipPath.pathString)

  generatedManifest.traverse(clipPath.pathString, path => {
    if (!SdfPath.fromString(path).isPropertyPath()) {
      return
    }

    const generatedAttr = generatedManifest.getAttributeAtPath(path)
    if (!TF_VERIFY(generatedAttr, 'generatedAttr')) {
      return
    }

    sdfJustCreatePrimAttributeInLayer(
      manifestLayer, path,
      String(generatedManifest.getField(path, 'typeName')),
      generatedManifest.getField(path, 'variability') as SdfVariability,
      generatedManifest.getField(path, 'custom') === true)

    if (topologyLayer.hasField(path, 'default')) {
      manifestLayer.setField(path, 'default', topologyLayer.getField(path, 'default'))
    }

    // Keep the "spline" annotation in the manifest to indicate that the
    // attribute is spline-valued.
    if (generatedManifest.hasField(path, 'spline')) {
      manifestLayer.setField(path, 'spline', generatedManifest.getField(path, 'spline'))
    }
  })
}

// _StitchLayers (stitchClips.cpp:683-731): stitches the clip metadata
// aggregated from `clipLayers` (clipPrimPath, clipTimes,
// clipManifestAssetPath, clipActive and clipAssetPaths) into
// `resultLayer`, with a sublayer reference to `topologyLayer`, the
// aggregate topology of `clipLayers`.
function stitchLayers(
  resultLayer: Layer, topologyLayer: Layer, manifestLayer: Layer,
  clipLayers: readonly Layer[], clipPath: SdfPath, clipSet: string,
): void {
  const result = aggregateDataFromClips(topologyLayer, clipLayers, clipPath, clipSet)
  stitchLayersIgnoringClipData(topologyLayer, result.topology)

  // if the rootLayer has no clip-metadata authored
  if (!resultLayer.getPrimAtPath(clipPath)) {
    // we need to run traditional stitching to add the prim structure
    stitchLayersIgnoringClipData(resultLayer, result.root)
  } else {
    mergeRootLayerMetadata(resultLayer, result.root, clipPath, clipSet)
  }

  // we need to retime in either case, because the clips may be aggregated
  // in parallel, and thus will have clipActives which are out of sync with
  // one another.
  retimeClipActive(resultLayer, clipPath, clipSet)
  normalizeClipAssetPaths(resultLayer, clipLayers, clipPath, clipSet)

  generateClipManifest(manifestLayer, topologyLayer, clipLayers, clipPath)
  stitchClipManifest(resultLayer, manifestLayer, clipPath, clipSet)

  // fetch the rootPrim from the topology layer
  if (topologyLayer.getRootPrims().empty()) {
    TF_CODING_ERROR('Failed to generate topology.')
  } else {
    const topologyId = getRelativePathIfPossible(
      topologyLayer.identifier, realPathOf(topologyLayer), realPathOf(resultLayer))
    stitchClipsTopologySubLayerPath(resultLayer, topologyId)
  }
}

// TfErrorMark scope: whether `body` posted no errors (errorMark.IsClean()).
function errorMarkIsClean(body: () => void): boolean {
  const errorMark = new TfErrorMark()
  try {
    body()
    return errorMark.isClean()
  } finally {
    errorMark.dispose()
  }
}

// _UsdUtilsStitchClipsTopologyImpl (stitchClips.cpp:733-745).
function stitchClipsTopologyImpl(topologyLayer: Layer, clipLayers: readonly Layer[]): boolean {
  return errorMarkIsClean(() => {
    // Note that we don't specify a unique clipPath since we're only
    // interested in aggregating topology.
    const result = aggregateDataFromClips(topologyLayer, clipLayers)
    stitchLayersIgnoringClipData(topologyLayer, result.topology)
  })
}

// _UsdUtilsStitchClipsManifestImpl (stitchClips.cpp:747-757).
function stitchClipsManifestImpl(
  manifestLayer: Layer, topologyLayer: Layer, clipLayers: readonly Layer[], clipPath: SdfPath,
): boolean {
  return errorMarkIsClean(() => {
    generateClipManifest(manifestLayer, topologyLayer, clipLayers, clipPath)
  })
}

// _UsdUtilsStitchClipsImpl (stitchClips.cpp:759-784).
function stitchClipsImpl(
  resultLayer: Layer, topologyLayer: Layer, manifestLayer: Layer, clipLayers: readonly Layer[],
  clipPath: SdfPath, startTimeCode: number, endTimeCode: number,
  interpolateMissingClipValues: boolean, clipSet: string,
): boolean {
  return errorMarkIsClean(() => {
    stitchLayers(resultLayer, topologyLayer, manifestLayer, clipLayers, clipPath, clipSet)
    setTimeCodeRange(resultLayer, clipPath, startTimeCode, endTimeCode, clipSet)

    if (interpolateMissingClipValues) {
      setValue(resultLayer, clipPath, InfoKeys.interpolateMissingClipValues,
        interpolateMissingClipValues, clipSet)
    }
  })
}

// _ClipLayersAreValid (stitchClips.cpp:786-812).
function clipLayersAreValid(
  clipLayers: readonly (Layer | undefined)[], clipLayerFiles: readonly string[], clipPath: SdfPath,
): clipLayers is readonly Layer[] {
  let somePrimContainsPath = false

  for (let i = 0; i < clipLayerFiles.length; i++) {
    const layer = clipLayers[i]
    if (!layer) {
      TF_CODING_ERROR(`Failed to open layer ${clipLayerFiles[i]!}\n`)
      return false
    } else if (layer.getPrimAtPath(clipPath)) {
      somePrimContainsPath = true
    }
  }

  // if no clipLayers contain the primPath we want
  if (!somePrimContainsPath) {
    TF_CODING_ERROR(`Invalid clip path specified <${clipPath.pathString}>`)
    return false
  }

  return true
}

// _OpenClipLayers (stitchClips.cpp:815-836): opens the clip layer files
// concurrently (WorkParallelForN) and validates clipPath; undefined when
// opening posted errors or the layers are invalid.
async function openClipLayers(
  clipLayerFiles: readonly string[], clipPath: SdfPath,
): Promise<Layer[] | undefined> {
  const errorMark = new TfErrorMark()
  try {
    const clipLayers = await Promise.all(clipLayerFiles.map(file => Layer.findOrOpen(file)))
    return errorMark.isClean() && clipLayersAreValid(clipLayers, clipLayerFiles, clipPath)
      ? clipLayers as Layer[] : undefined
  } finally {
    errorMark.dispose()
  }
}

/**
 * Aggregates the topology of a set of `clipLayerFiles` for use in USD's
 * Value Clips system (stitchClips.h:132-145; stitchClips.cpp:841-870). The
 * aggregated scene topology includes only non-time-varying data, for use
 * with the value clip metadata in a manifest layer. `topologyLayer` is
 * cleared, filled and saved.
 *
 * Asynchronous because opening the clip layers and saving are.
 */
export async function UsdUtilsStitchClipsTopology(
  topologyLayer: Layer, clipLayerFiles: readonly string[],
): Promise<boolean> {
  // Prepare topology layer for editing
  if (!layerIsWritable(topologyLayer)) {
    return false
  } else {
    topologyLayer.clear()
  }

  // Open all clip layers and validate clipPath
  const clipLayers = await openClipLayers(clipLayerFiles, SdfPath.absoluteRootPath)

  if (!clipLayers || !stitchClipsTopologyImpl(topologyLayer, clipLayers)) {
    return false
  }

  await topologyLayer.save()

  return true
}

/**
 * Creates a clip manifest from the set of `clipLayerFiles` for use in
 * USD's Value Clips system (stitchClips.h:147-166; stitchClips.cpp:872-904).
 * The manifest declares the attributes with authored time samples in the
 * clip layers under `clipPath`; a time sampled attribute with a default in
 * `topologyLayer` gets that default in the manifest. `manifestLayer` is
 * cleared, filled and saved.
 *
 * Asynchronous because opening the clip layers and saving are.
 */
export async function UsdUtilsStitchClipsManifest(
  manifestLayer: Layer, topologyLayer: Layer, clipLayerFiles: readonly string[], clipPath: SdfPath | string,
): Promise<boolean> {
  const path = toPath(clipPath)

  // Prepare manifest layer for editing
  if (!layerIsWritable(manifestLayer)) {
    return false
  } else {
    manifestLayer.clear()
  }

  // Open all clip layers and validate clipPath
  const clipLayers = await openClipLayers(clipLayerFiles, SdfPath.absoluteRootPath)

  if (!clipLayers || !stitchClipsManifestImpl(manifestLayer, topologyLayer, clipLayers, path)) {
    return false
  }

  await manifestLayer.save()

  return true
}

/**
 * Creates layers that use USD Value Clips to effectively merge the time
 * samples in `clipLayerFiles` under `clipPath` without copying the samples
 * into a separate layer (stitchClips.h:28-130; stitchClips.cpp:906-983).
 *
 * `resultLayer` receives the clip metadata at `clipPath`, the start and end
 * time codes (`startTimeCode` / `endTimeCode`, or else the lowest and
 * highest stage times of the clips), and the topology layer as its
 * strongest sublayer. The topology and manifest layers are named
 * `<resultIdWithoutExt>.topology.<resultExt>` and
 * `<resultIdWithoutExt>.manifest.<resultExt>`, opened or created as
 * needed. Pre-existing opinions are wiped away upon success; upon failure,
 * pre-existing topology and manifest layers are preserved and newly created
 * ones deleted. An invalid clip path is a coding error.
 *
 * Asynchronous because opening, creating, saving and deleting layers are.
 */
export async function UsdUtilsStitchClips(
  resultLayer: Layer,
  clipLayerFiles: readonly string[],
  clipPath: SdfPath | string,
  startTimeCode: number = TIME_MAX,
  endTimeCode: number = TIME_MAX,
  interpolateMissingClipValues = false,
  clipSet: string = DEFAULT_CLIP_SET,
): Promise<boolean> {
  const path = toPath(clipPath)

  // Prepare result layer for editing
  if (!layerIsWritable(resultLayer)) {
    return false
  } else {
    resultLayer.clear()
  }

  // Prepare topology layer for editing, create if necessary
  let topologyPreExisting = true
  const topologyLayerId = UsdUtilsGenerateClipTopologyName(resultLayer.identifier)
  let topologyLayer = await Layer.findOrOpen(topologyLayerId)
  if (!topologyLayer) {
    topologyPreExisting = false
    topologyLayer = await Layer.createNew(topologyLayerId)
  }

  if (!layerIsWritable(topologyLayer)) {
    return false
  } else {
    // A failed SdfLayer::CreateNew leaves a null layer, which upstream
    // dereferences here.
    topologyLayer?.clear()
  }

  // Prepare manifest layer for editing, create if necessary
  let manifestPreExisting = true
  const manifestLayerId = UsdUtilsGenerateClipManifestName(resultLayer.identifier)
  let manifestLayer = await Layer.findOrOpen(manifestLayerId)
  if (!manifestLayer) {
    manifestPreExisting = false
    manifestLayer = await Layer.createNew(manifestLayerId)
  }

  if (!layerIsWritable(manifestLayer)) {
    return false
  } else {
    manifestLayer?.clear()
  }

  if (!topologyLayer || !manifestLayer) {
    return false
  }

  // Open all clip layers and validate clipPath
  const clipLayers = await openClipLayers(clipLayerFiles, path)

  if (!clipLayers ||
      !stitchClipsImpl(resultLayer, topologyLayer, manifestLayer, clipLayers, path,
        startTimeCode, endTimeCode, interpolateMissingClipValues, clipSet)) {
    if (!topologyPreExisting) {
      await _deleteFile(topologyLayer.identifier)
    }
    if (!manifestPreExisting) {
      await _deleteFile(manifestLayer.identifier)
    }
    return false
  }

  // Note that we don't apply edits until all other actions have completed.
  await topologyLayer.save()
  await manifestLayer.save()
  await resultLayer.save()
  return true
}

/**
 * Generates a topology file name based on an input file name
 * (stitchClips.h:221-232; stitchClips.cpp:985-997): 'foo.usd' gives
 * 'foo.topology.usd'. Preceding paths are kept, so '/bar/baz/foo.usd' gives
 * '/bar/baz/foo.topology.usd'; a name with no '.' gives ''.
 */
export function UsdUtilsGenerateClipTopologyName(rootLayerName: string): string {
  const delimiter = '.'
  const delimiterPos = rootLayerName.lastIndexOf('.')
  const topologyFileBaseName = 'topology'
  if (delimiterPos < 0) {
    return ''
  }

  return rootLayerName.slice(0, delimiterPos) + delimiter + topologyFileBaseName +
    rootLayerName.slice(delimiterPos)
}

/**
 * Generates a manifest file name based on an input file name
 * (stitchClips.h:234-245; stitchClips.cpp:999-1011): 'foo.usd' gives
 * 'foo.manifest.usd'. Preceding paths are kept; a name with no '.' gives ''.
 */
export function UsdUtilsGenerateClipManifestName(rootLayerName: string): string {
  const delimiter = '.'
  const delimiterPos = rootLayerName.lastIndexOf('.')
  const manifestFileBaseName = 'manifest'
  if (delimiterPos < 0) {
    return ''
  }

  return rootLayerName.slice(0, delimiterPos) + delimiter + manifestFileBaseName +
    rootLayerName.slice(delimiterPos)
}

/**
 * Authors clip template metadata on the prim at `clipPath` in
 * `resultLayer` and adds `topologyLayer` as its strongest sublayer
 * (stitchClips.h:168-219; stitchClips.cpp:1013-1078). `resultLayer` is
 * cleared first; the clip set `clipSet` gets primPath, templateAssetPath,
 * templateStartTime, templateEndTime, templateStride and
 * manifestAssetPath, plus templateActiveOffset when `activeOffset` is given
 * and interpolateMissingClipValues when true. The start and end time codes
 * are set and the layer saved.
 *
 * Asynchronous because saving is.
 */
export async function UsdUtilsStitchClipsTemplate(
  resultLayer: Layer,
  topologyLayer: Layer | undefined,
  manifestLayer: Layer | undefined,
  clipPath: SdfPath | string,
  templatePath: string,
  startTime: number,
  endTime: number,
  stride: number,
  activeOffset: number = TIME_MAX,
  interpolateMissingClipValues = false,
  clipSet: string = DEFAULT_CLIP_SET,
): Promise<boolean> {
  const path = toPath(clipPath)

  if (!layerIsWritable(resultLayer)) {
    return false
  } else {
    resultLayer.clear()
  }

  if (!topologyLayer) {
    return false
  }

  if (!manifestLayer) {
    return false
  }

  // set prim level metadata
  const prim = sdfCreatePrimInLayer(resultLayer, path)
  const topologyId = getRelativePathIfPossible(
    topologyLayer.identifier, realPathOf(topologyLayer), realPathOf(resultLayer))
  const manifestId = getRelativePathIfPossible(
    manifestLayer.identifier, realPathOf(manifestLayer), realPathOf(resultLayer))

  // set root layer metadata
  stitchClipsTopologySubLayerPath(resultLayer, topologyId)
  const clipSetDict: Record<string, unknown> = {}
  clipSetDict[InfoKeys.primPath] = path.pathString
  clipSetDict[InfoKeys.templateAssetPath] = templatePath
  clipSetDict[InfoKeys.templateStartTime] = startTime
  clipSetDict[InfoKeys.templateEndTime] = endTime
  clipSetDict[InfoKeys.templateStride] = stride
  clipSetDict[InfoKeys.manifestAssetPath] = new SdfAssetPath(manifestId)
  if (activeOffset !== TIME_MAX) {
    clipSetDict[InfoKeys.templateActiveOffset] = activeOffset
  }
  if (interpolateMissingClipValues) {
    clipSetDict[InfoKeys.interpolateMissingClipValues] = true
  }

  // The dictionary holds doubles (VtValue(double)), which a JavaScript
  // number does not say by itself.
  _sdfRecordDictionaryValueTypes(clipSetDict, new Map([
    InfoKeys.templateStartTime, InfoKeys.templateEndTime, InfoKeys.templateStride, InfoKeys.templateActiveOffset,
  ].map(key => [key, 'double'])))

  const clips: Record<string, unknown> = {}
  clips[clipSet] = clipSetDict
  prim?.setInfo('clips', clips)

  resultLayer.setField('/', 'startTimeCode', startTime)
  resultLayer.setField('/', 'endTimeCode', endTime)
  await resultLayer.save()
  return true
}
