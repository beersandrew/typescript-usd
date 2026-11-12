// Ported from OpenUSD 26.11.1: pxr/usd/usd/flattenUtils.cpp,
//  pxr/usd/usd/flattenUtils.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdFlattenLayerStack from OpenUSD 26.11.1 pxr/usd/usd/flattenUtils.{h,cpp}:
// merges the layers of a PcpLayerStack into one anonymous layer.
//
// - flattenSpec recurses down the typed hierarchy of specs, using
//   pcpComposeSiteChildNames to discover child names of each type of spec,
//   and creating them in the output layer.
// - At each output site, flattenFields flattens field data using reduce to
//   apply composition rules for particular value types and fields, and
//   applyLayerOffset for the time remapping each field needs
//   (flattenUtils.cpp:42-55).
//
// typescript-usd values carry no C++ type, so the type dispatch of _Reduce,
// _FixAssetPaths and Usd_ApplyLayerOffsetToValue reads it where it is kept:
// list ops are { isExplicit, ... } objects, an asset-valued attribute or
// metadata field holds the authored string (its type from the spec's
// typeName or the field's SdfAssetPath fallback), and time-valued values
// take their type from the spec's typeName or the field's registered type.

import {
  Layer, AssetPath as SdfAssetPath, AnimationBlock as SdfAnimationBlock, Schema as SdfSchema,
  ValueBlock as SdfValueBlock, sdfApplyListOpOperations, sdfChangeBlock,
  AttributeSpec as SdfAttributeSpec, PrimSpec as SdfPrimSpec, RelationshipSpec as SdfRelationshipSpec,
  VariantSetSpec as SdfVariantSetSpec, VariantSpec as SdfVariantSpec,
  VariableExpression as SdfVariableExpression, sdfIsVariableExpression,
  type LayerOffset as SdfLayerOffset,
} from 'typescript-usd/sdf'
import { _sdfIsDictionary, _sdfTransformMetadataValue } from 'typescript-usd/sdf/_internal'
import { Array as VtArray } from 'typescript-usd/vt'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { RaiseWarning as TfWarn, Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import {
  ExpressionVariables as PcpExpressionVariables, pcpComposeSiteChildNames, type LayerStack as PcpLayerStack,
} from 'typescript-usd/pcp'
import { _dictOverRecursive } from './primDefinition.ts'
import { usdTransformSpline } from './interpolators.ts'

/** UsdFlattenResolveAssetPathContext (flattenUtils.h:114-139). */
export interface UsdFlattenResolveAssetPathContext {
  sourceLayer: Layer
  assetPath: string
  expressionVariables: Record<string, unknown>
}
export type UsdFlattenResolveAssetPathFn = (sourceLayer: Layer, assetPath: string) => string
export type UsdFlattenResolveAssetPathAdvancedFn = (context: UsdFlattenResolveAssetPathContext) => string

type ResolveAssetPathFn = (sourceLayer: Layer, assetPath: string) => string

type ListOp = {
  isExplicit: boolean, explicitItems: unknown[], addedItems: unknown[], prependedItems: unknown[],
  appendedItems: unknown[], deletedItems: unknown[], orderedItems: unknown[],
}

const isListOp = (value: unknown): value is ListOp =>
  !!value && typeof value === 'object' && 'isExplicit' in value && 'explicitItems' in value

const itemKey = (item: unknown): unknown =>
  item !== null && typeof item === 'object' ? JSON.stringify(item) : item
const itemEquality = { key: itemKey }

const IDENTITY: SdfLayerOffset = { offset: 0, scale: 1 }
const isIdentity = (offset: SdfLayerOffset) => offset.offset === 0 && offset.scale === 1
const applyOffset = (offset: SdfLayerOffset, time: number) => time * offset.scale + offset.offset
const composeOffsets = (a: SdfLayerOffset, b: SdfLayerOffset): SdfLayerOffset =>
  ({ offset: a.offset + a.scale * b.offset, scale: a.scale * b.scale })

// Usd_ReduceFieldContext (flattenUtils.cpp:57-86).
class ReduceFieldContext {
  currentLayerStackIndex = 0
  mostRelevantLayerStackIndex: number | undefined
  // ListOpItem -> layer index, for reference and payload list ops.
  listOpToIndexMap: Map<unknown, number> | undefined
  constructor(readonly layerStack: PcpLayerStack) {}
  markCurrentIndexAsMostRelevantIfEmpty(): void {
    if (this.mostRelevantLayerStackIndex === undefined) this.markCurrentIndexAsMostRelevant()
  }
  markCurrentIndexAsMostRelevant(): void { this.mostRelevantLayerStackIndex = this.currentLayerStackIndex }
  layerOffset(index: number): SdfLayerOffset {
    return this.layerStack.layers[index]?.offset ?? IDENTITY
  }
}

const copyListOp = (op: ListOp): ListOp => ({
  isExplicit: op.isExplicit, explicitItems: [...op.explicitItems], addedItems: [...(op.addedItems ?? [])],
  prependedItems: [...op.prependedItems], appendedItems: [...op.appendedItems],
  deletedItems: [...op.deletedItems], orderedItems: [...(op.orderedItems ?? [])],
})

// _FixListOp / _FixListOpValue (flattenUtils.cpp:97-144): discard reorders
// and convert adds to appends.
function fixListOp(op: ListOp): ListOp {
  if (op.isExplicit) return op
  const items = [...op.appendedItems]
  for (const item of op.addedItems ?? []) {
    if (!items.some(existing => itemKey(existing) === itemKey(item))) items.push(item)
  }
  return { ...copyListOp(op), appendedItems: items, addedItems: [], orderedItems: [] }
}

// SdfListOp::ApplyOperations of a composable stronger op over a weaker one.
function applyOperations(lhs: ListOp, rhs: ListOp): ListOp {
  const r = sdfApplyListOpOperations<unknown>(lhs, rhs, itemEquality)
  return {
    isExplicit: r.isExplicit, explicitItems: [...r.explicitItems], addedItems: [],
    prependedItems: [...r.prependedItems], appendedItems: [...r.appendedItems],
    deletedItems: [...r.deletedItems], orderedItems: [],
  }
}

const emptyListOp = (): ListOp => ({
  isExplicit: false, explicitItems: [], addedItems: [], prependedItems: [], appendedItems: [],
  deletedItems: [], orderedItems: [],
})

// SdfListOp::ModifyOperations over every item list.
function modifyOperations(op: ListOp, fn: (item: unknown) => unknown): ListOp {
  const map = (items: unknown[]) => items.map(fn)
  return {
    isExplicit: op.isExplicit, explicitItems: map(op.explicitItems), addedItems: map(op.addedItems ?? []),
    prependedItems: map(op.prependedItems), appendedItems: map(op.appendedItems),
    deletedItems: map(op.deletedItems), orderedItems: map(op.orderedItems ?? []),
  }
}

// _ReduceRefOrPayload (flattenUtils.cpp:146-181): records the strongest
// layer index of each item.
function reduceRefOrPayload(lhs: ListOp, rhs: ListOp, context: ReduceFieldContext): ListOp {
  const r = applyOperations(lhs, rhs)
  context.listOpToIndexMap ??= new Map()
  modifyOperations(r, item => {
    const key = itemKey(item)
    if (!context.listOpToIndexMap!.has(key)) context.listOpToIndexMap!.set(key, context.currentLayerStackIndex)
    return item
  })
  return r
}

const REF_OR_PAYLOAD = new Set(['references', 'payload'])
const RELOCATES = new Set(['relocates', 'layerRelocates'])

// The type category _Reduce dispatches on (lhs.GetType() != rhs.GetType()).
function valueKind(value: unknown): string {
  if (isListOp(value)) return 'listOp'
  if (value instanceof VtArray) return `VtArray<${value.getElementType().getTypeName()}>`
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (typeof value === 'object') return (value as object).constructor?.name ?? 'object'
  return typeof value
}

// _Reduce(VtValue, VtValue, field, context) (flattenUtils.cpp:278-363).
function reduce(lhs: unknown, rhs: unknown, field: string, context: ReduceFieldContext): unknown {
  // default behavior is to take the strongest opinion for a field.
  context.markCurrentIndexAsMostRelevantIfEmpty()
  if (lhs === undefined) {
    if (REF_OR_PAYLOAD.has(field) && isListOp(rhs)) reduceRefOrPayload(emptyListOp(), rhs, context)
    return rhs
  }
  if (rhs === undefined) return lhs
  if (lhs instanceof SdfValueBlock || rhs instanceof SdfValueBlock) return lhs
  const rhsAnimated = field === 'timeSamples' || field === 'spline' || rhs instanceof TsSpline
  if (lhs instanceof SdfAnimationBlock && rhsAnimated) return lhs
  if (lhs instanceof SdfAnimationBlock) {
    context.markCurrentIndexAsMostRelevant()
    return rhs
  }
  if (valueKind(lhs) !== valueKind(rhs)) return lhs

  if (field === 'specifier') return lhs === 'over' ? rhs : lhs
  if (isListOp(lhs) && isListOp(rhs)) {
    return REF_OR_PAYLOAD.has(field) ? reduceRefOrPayload(lhs, rhs, context) : applyOperations(lhs, rhs)
  }
  if (RELOCATES.has(field)) {
    // SdfRelocates (flattenUtils.cpp:248-257): stronger then weaker entries.
    if (Array.isArray(lhs) && Array.isArray(rhs)) return [...lhs, ...rhs]
    return { ...(rhs as Record<string, unknown>), ...(lhs as Record<string, unknown>) }
  }
  if (field === 'variantSelection') {
    // SdfVariantSelectionMap (flattenUtils.cpp:235-246).
    return { ...(rhs as Record<string, unknown>), ...(lhs as Record<string, unknown>) }
  }
  if (_sdfIsDictionary(lhs) && _sdfIsDictionary(rhs)) {
    // Dictionaries compose keys recursively (flattenUtils.cpp:224-233).
    return _dictOverRecursive(lhs as Record<string, unknown>, rhs as Record<string, unknown>)
  }
  // TypeName is a special case: empty token represents "no opinion".
  if (field === 'typeName' && typeof lhs === 'string') return lhs === '' ? rhs : lhs
  // Generic base case: take stronger opinion.
  return lhs
}

// _ApplyLayerOffsetToClipInfo (flattenUtils.cpp:365-379).
function applyLayerOffsetToClipInfo(offset: SdfLayerOffset, infoKey: string, clipInfo: Record<string, unknown>): void {
  const value = clipInfo[infoKey]
  const mapEntry = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return [applyOffset(offset, entry[0] as number), ...entry.slice(1)]
    const vec = entry as { constructor: new (...args: number[]) => unknown; get(i: number): number }
    return new vec.constructor(applyOffset(offset, vec.get(0)), vec.get(1))
  }
  if (value instanceof VtArray) {
    clipInfo[infoKey] = new VtArray(value.toArray().map(mapEntry), value.getElementType())
  } else if (Array.isArray(value)) {
    clipInfo[infoKey] = value.map(mapEntry)
  }
}

// _ApplyLayerOffsetToRefOrPayloadListOp (flattenUtils.cpp:381-430).
function applyLayerOffsetToRefOrPayloadListOp(source: ListOp, context: ReduceFieldContext): ListOp {
  if (!context.listOpToIndexMap) return source
  const listOp = modifyOperations(source, item => {
    const index = context.listOpToIndexMap!.get(itemKey(item))
    if (index === undefined) return item
    const offset = context.layerOffset(index)
    if (isIdentity(offset)) return item
    const refOrPayload = item as { layerOffset?: SdfLayerOffset }
    return { ...refOrPayload, layerOffset: composeOffsets(offset, refOrPayload.layerOffset ?? IDENTITY) }
  })
  // Deleted items keep the source's identity.
  if (!listOp.isExplicit) listOp.deletedItems = [...source.deletedItems]
  return listOp
}

// The value's Sdf type, where typescript-usd keeps it: the attribute spec's
// typeName for default and timeSamples, else the field's registered type.
interface ValueTypeSource { attrTypeName: string | undefined; specType: string }

// Usd_ApplyLayerOffsetToValue for the field's value type.
function applyLayerOffsetToValue(field: string, value: unknown, offset: SdfLayerOffset, types: ValueTypeSource): unknown {
  const mapTime = (time: number) => applyOffset(offset, time)
  if (field === 'spline' || value instanceof TsSpline) {
    return usdTransformSpline(value as TsSpline, offset)
  }
  if (field === 'timeSamples' && Array.isArray(value)) {
    return (value as Array<[number, unknown]>).map(([time, sample]) =>
      [mapTime(time), _sdfTransformMetadataValue(sample, types.attrTypeName, mapTime, offset.scale)])
  }
  if (field === 'default') {
    return _sdfTransformMetadataValue(value, types.attrTypeName, mapTime, offset.scale)
  }
  const fieldType = SdfSchema.getInstance().getFieldDefinition(field)?.getTypeName()
    || (_sdfIsDictionary(value) ? 'dictionary' : undefined)
  return _sdfTransformMetadataValue(value, fieldType, mapTime, offset.scale)
}

// _ApplyLayerOffset (flattenUtils.cpp:432-488).
function applyLayerOffset(field: string, value: unknown, context: ReduceFieldContext, types: ValueTypeSource): unknown {
  if (field === 'references' || field === 'payload') {
    if (isListOp(value)) value = applyLayerOffsetToRefOrPayloadListOp(value, context)
  }
  const offset = context.layerOffset(context.mostRelevantLayerStackIndex!)
  if (isIdentity(offset)) return value
  if (field === 'clips') {
    if (!_sdfIsDictionary(value)) return value
    const clips: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [name, clipInfoVal] of Object.entries(clips)) {
      if (!_sdfIsDictionary(clipInfoVal)) continue
      const clipInfo = { ...(clipInfoVal as Record<string, unknown>) }
      applyLayerOffsetToClipInfo(offset, 'active', clipInfo)
      applyLayerOffsetToClipInfo(offset, 'times', clipInfo)
      clips[name] = clipInfo
    }
    return clips
  }
  if (REF_OR_PAYLOAD.has(field)) return value
  return applyLayerOffsetToValue(field, value, offset, types)
}

// _FixAssetPaths (flattenUtils.cpp:502-633).
function fixAssetPaths(
  sourceLayer: Layer, field: string, resolveAssetPathFn: ResolveAssetPathFn, value: unknown,
  assetType: 'asset' | 'asset[]' | undefined,
): unknown {
  const fixOne = (path: unknown): unknown => {
    if (path instanceof SdfAssetPath) return new SdfAssetPath(resolveAssetPathFn(sourceLayer, path.getAssetPath()))
    return typeof path === 'string' ? resolveAssetPathFn(sourceLayer, path) : path
  }
  const fixArray = (array: unknown): unknown => array instanceof VtArray
    ? new VtArray((array.toArray() as unknown[]).map(fixOne), array.getElementType())
    : Array.isArray(array) ? array.map(fixOne) : array
  if (value instanceof SdfAssetPath || (assetType === 'asset' && typeof value === 'string' && field !== 'timeSamples')) {
    return fixOne(value)
  }
  if (assetType === 'asset[]' && field !== 'timeSamples') return fixArray(value)
  if (field === 'timeSamples' && Array.isArray(value) && assetType) {
    return (value as Array<[number, unknown]>).map(([time, sample]) =>
      [time, assetType === 'asset' ? fixOne(sample) : fixArray(sample)])
  }
  if (REF_OR_PAYLOAD.has(field) && isListOp(value)) {
    return modifyOperations(value, item => {
      const refOrPayload = item as { assetPath: string }
      return { ...refOrPayload, assetPath: resolveAssetPathFn(sourceLayer, refOrPayload.assetPath) }
    })
  }
  if (field === 'clips' && _sdfIsDictionary(value)) {
    const clips: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [clipSetName, clipInfoVal] of Object.entries(clips)) {
      if (!_sdfIsDictionary(clipInfoVal)) {
        TfWarn(`Expected dictionary for entry '${clipSetName}' in 'clips'`)
        continue
      }
      const clipInfo = { ...(clipInfoVal as Record<string, unknown>) }
      if (clipInfo.assetPaths !== undefined) clipInfo.assetPaths = fixArray(clipInfo.assetPaths)
      if (clipInfo.manifestAssetPath !== undefined) clipInfo.manifestAssetPath = fixOne(clipInfo.manifestAssetPath)
      clips[clipSetName] = clipInfo
    }
    return clips
  }
  return value
}

// _fieldsToSkip (flattenUtils.cpp:635-651).
const CHILDREN_KEYS = new Set([
  'connectionChildren', 'expressionChildren', 'mapperArgChildren', 'mapperChildren', 'primChildren',
  'properties', 'targetChildren', 'variantChildren', 'variantSetChildren',
])
const FIELDS_TO_SKIP = new Set([
  ...CHILDREN_KEYS, 'targetPaths', 'connectionPaths', 'subLayers', 'subLayerOffsets', 'timeSamples', 'spline',
])

function assetTypeFor(layer: Layer, path: string, field: string, specType: string): 'asset' | 'asset[]' | undefined {
  if (specType === 'attribute' && (field === 'default' || field === 'timeSamples')) {
    const typeName = layer.getField(path, 'typeName')
    return typeName === 'asset' || typeName === 'asset[]' ? typeName : undefined
  }
  return SdfSchema.getInstance().getFallback(field) instanceof SdfAssetPath ? 'asset' : undefined
}

function strongestTypeName(layers: readonly Layer[], path: string): string | undefined {
  for (const layer of layers) {
    const typeName = layer.getField(path, 'typeName')
    if (typeof typeName === 'string' && typeName !== '') return typeName
  }
  return undefined
}

// _ReduceField (flattenUtils.cpp:653-703).
function reduceField(
  layerStack: PcpLayerStack, targetLayer: Layer, path: string, field: string,
  resolveAssetPathFn: ResolveAssetPathFn,
): unknown {
  const layers = layerStack.layers.map(entry => entry.layer as Layer)
  const specType = targetLayer.getSpecType(path)
  const context = new ReduceFieldContext(layerStack)
  let val: unknown
  for (let i = 0; i < layers.length; ++i) {
    const layer = layers[i]!
    if (!layer.hasSpec(path)) continue
    // Ignore mismatched specs (which should be very rare).
    if (layer.getSpecType(path) !== specType) {
      TfWarn(`UsdFlattenLayerStack: Ignoring spec at <${path}> in @${layer.identifier}@: ` +
        `expected spec type ${specType} but found ${layer.getSpecType(path)}`)
      continue
    }
    if (!layer.hasField(path, field)) continue
    let layerVal = layer.getField(path, field)
    // Fix asset paths.
    layerVal = fixAssetPaths(layer, field, resolveAssetPathFn, layerVal,
      assetTypeFor(layer, path, field, specType))
    // Fix any list ops
    if (isListOp(layerVal)) layerVal = fixListOp(layerVal)
    context.currentLayerStackIndex = i
    val = reduce(val, layerVal, field, context)
  }
  // Apply layer offsets once, after reducing.
  if (context.mostRelevantLayerStackIndex !== undefined && val !== undefined) {
    val = applyLayerOffset(field, val, context,
      { attrTypeName: specType === 'attribute' ? strongestTypeName(layers, path) : undefined, specType })
  }
  return val
}

function setField(layer: Layer, path: string, field: string, value: unknown): void {
  // SdfLayer::SetField with an empty value erases the field.
  if (value === undefined) {
    if (layer.hasField(path, field)) layer.eraseField(path, field)
    return
  }
  layer.setField(path, field, value)
}

// _FlattenFields (flattenUtils.cpp:705-747).
function flattenFields(layerStack: PcpLayerStack, layer: Layer, path: string, resolveAssetPathFn: ResolveAssetPathFn): void {
  const layers = layerStack.layers.map(entry => entry.layer as Layer)
  const specType = layer.getSpecType(path)
  // typeName first: Layer.setField reads an attribute's typeName to hold
  // its default, which SdfLayer::SetField does not; the field order is
  // otherwise the schema's.
  const fields = SdfSchema.getInstance().getFields(specType)
  for (const field of [...fields.filter(f => f === 'typeName'), ...fields.filter(f => f !== 'typeName')]) {
    if (FIELDS_TO_SKIP.has(field)) continue
    setField(layer, path, field, reduceField(layerStack, layer, path, field, resolveAssetPathFn))
  }
  if (specType === 'attribute') {
    // Only flatten TimeSamples or Spline if not masked by stronger Defaults.
    for (const sourceLayer of layers) {
      const processField = (field: string): boolean => {
        if (!sourceLayer.hasField(path, field)) return false
        setField(layer, path, field, reduceField(layerStack, layer, path, field, resolveAssetPathFn))
        return true
      }
      if (processField('timeSamples') || processField('spline')) break
      if (sourceLayer.hasField(path, 'default')) break
    }
  }
}

// _GetSiteSpecType (flattenUtils.cpp:749-758).
function getSiteSpecType(layers: readonly Layer[], path: string): string {
  for (const l of layers) if (l.hasSpec(path)) return l.getSpecType(path)
  return 'unknown'
}

function childNames(layerStack: PcpLayerStack, path: string, namesField: string, orderField?: string): string[] {
  const nameOrder: string[] = []
  pcpComposeSiteChildNames(layerStack.layers, path, namesField, nameOrder, new Set(), orderField)
  return nameOrder
}

// _FlattenSpec for a variant set (flattenUtils.cpp:774-792).
function flattenVariantSet(layerStack: PcpLayerStack, vset: SdfVariantSetSpec, resolveAssetPathFn: ResolveAssetPathFn): void {
  for (const varName of childNames(layerStack, vset.getPath().pathString, 'variantChildren')) {
    const variant = SdfVariantSpec.new(vset, varName)
    if (!variant) continue
    flattenFields(layerStack, variant.getLayer(), variant.getPath().pathString, resolveAssetPathFn)
    // _FlattenSpec for a variant (flattenUtils.cpp:766-772).
    const variantPrim = variant.getPrimSpec()
    if (variantPrim) flattenPrim(layerStack, variantPrim, resolveAssetPathFn)
  }
}

// _FlattenTargetPaths (flattenUtils.cpp:794-819).
function flattenTargetPaths(
  layerStack: PcpLayerStack, layer: Layer, path: string, field: 'targetPaths' | 'connectionPaths',
  resolveAssetPathFn: ResolveAssetPathFn,
  targetProxy: ReturnType<SdfRelationshipSpec['getTargetPathList']>,
): void {
  const val = reduceField(layerStack, layer, path, field, resolveAssetPathFn)
  if (!isListOp(val)) return
  // Replay the operations against the proxy so that the target path specs
  // are created as a side effect.
  if (val.isExplicit) {
    targetProxy.clearEditsAndMakeExplicit()
    targetProxy.getExplicitItems().assign(val.explicitItems as never[])
  } else {
    targetProxy.clearEdits()
    targetProxy.getPrependedItems().assign(val.prependedItems as never[])
    targetProxy.getAppendedItems().assign(val.appendedItems as never[])
    targetProxy.getDeletedItems().assign(val.deletedItems as never[])
    // We deliberately do not handle reordered or added items.
  }
}

// _FlattenSpec for a prim (flattenUtils.cpp:821-901).
function flattenPrim(layerStack: PcpLayerStack, prim: SdfPrimSpec, resolveAssetPathFn: ResolveAssetPathFn): void {
  const layers = layerStack.layers.map(entry => entry.layer as Layer)
  const primPath = prim.getPath()
  const layer = prim.getLayer()

  // Child prims. SdfSpecifierDef is a placeholder fixed up by flattenFields.
  for (const childName of childNames(layerStack, primPath.pathString, 'primChildren', 'primOrder')) {
    const child = SdfPrimSpec.new(prim, childName, 'def')
    if (!child) continue
    flattenFields(layerStack, layer, child.getPath().pathString, resolveAssetPathFn)
    flattenPrim(layerStack, child, resolveAssetPathFn)
  }

  if (layer.getSpecType(primPath.pathString) === 'pseudoRoot') return

  // Variant sets
  for (const vsetName of childNames(layerStack, primPath.pathString, 'variantSetChildren')) {
    const vset = SdfVariantSetSpec.new(prim, vsetName)
    if (!vset) continue
    flattenFields(layerStack, layer, vset.getPath().pathString, resolveAssetPathFn)
    flattenVariantSet(layerStack, vset, resolveAssetPathFn)
  }

  // Properties
  for (const childName of childNames(layerStack, primPath.pathString, 'properties')) {
    const childPath = primPath.appendProperty(childName).pathString
    const specType = getSiteSpecType(layers, childPath)
    if (specType === 'attribute') {
      // Int is a (required) placeholder type updated by flattenFields.
      const attr = SdfAttributeSpec.new(prim, childName, 'int')
      if (!attr) continue
      flattenFields(layerStack, layer, childPath, resolveAssetPathFn)
      flattenTargetPaths(layerStack, layer, childPath, 'connectionPaths', resolveAssetPathFn,
        attr.getConnectionPathList())
    } else if (specType === 'relationship') {
      const rel = SdfRelationshipSpec.new(prim, childName)
      if (!rel) continue
      flattenFields(layerStack, layer, childPath, resolveAssetPathFn)
      flattenTargetPaths(layerStack, layer, childPath, 'targetPaths', resolveAssetPathFn,
        rel.getTargetPathList())
    } else {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Unknown spec type ${specType} at <${childPath}> in ${layerStack.identifier.rootLayer.filePath}\n`,
        TfDiagnosticType.RuntimeError))
    }
  }
}

// _EvaluateAssetPathExpression (flattenUtils.cpp:903-923).
function evaluateAssetPathExpression(expression: string, expressionVars: Record<string, unknown>): string {
  const r = new SdfVariableExpression(expression).evaluateTyped(expressionVars, 'string')
  if (r.errors.length > 0) {
    TfWarn(`Error evaluating expression ${expression}: ${r.errors.join('; ')}`)
  }
  return typeof r.value === 'string' ? r.value : ''
}

// UsdFlattenLayerStack with a UsdFlattenResolveAssetPathAdvancedFn
// (flattenUtils.cpp:924-966).
function flattenLayerStackImpl(
  layerStack: PcpLayerStack, resolveAssetPathFn: UsdFlattenResolveAssetPathAdvancedFn, tag: string,
): Layer {
  // The layer stack's own expression variables, as if it were a stage's
  // root layer stack (flattenUtils.cpp:930-944).
  const layerStackExprVars = PcpExpressionVariables.compute(layerStack.identifier, layerStack.identifier)
  const resolveFnWrapper: ResolveAssetPathFn = (sourceLayer, assetPath) => resolveAssetPathFn({
    sourceLayer, assetPath, expressionVariables: layerStackExprVars.getVariables() as Record<string, unknown>,
  })
  // ArResolverContextBinder(layerStack identifier's pathResolverContext): the
  // TypeScript PcpLayerStackIdentifier holds no resolver context; layers
  // anchor through their own.
  return sdfChangeBlock(() => {
    // SdfLayer::CreateAnonymous examines the tag's extension for the format.
    const hasExtension = /\.[^./]+$/.test(tag)
    const outputLayer = Layer.createAnonymous(hasExtension ? tag : `${tag}.usda`)
    flattenFields(layerStack, outputLayer, '/', resolveFnWrapper)
    flattenPrim(layerStack, outputLayer.getPseudoRoot(), resolveFnWrapper)
    return outputLayer
  })
}

/**
 * UsdFlattenLayerStack (flattenUtils.cpp:967-997; Python
 * Usd.FlattenLayerStack(layerStack, resolveAssetPathFn=, tag=)): the layer
 * stack merged into a new anonymous layer. Without resolveAssetPathFn, asset
 * paths are anchored by UsdFlattenLayerStackResolveAssetPathAdvanced; with
 * one, asset path expressions are evaluated before it sees them.
 */
export function usdFlattenLayerStack(
  layerStack: PcpLayerStack,
  options: { resolveAssetPathFn?: UsdFlattenResolveAssetPathFn, tag?: string } = {},
): Layer {
  const resolveAssetPathFn = options.resolveAssetPathFn
  if (!resolveAssetPathFn) {
    return flattenLayerStackImpl(layerStack, usdFlattenLayerStackResolveAssetPathAdvanced, options.tag ?? '')
  }
  return flattenLayerStackImpl(layerStack, ctx => sdfIsVariableExpression(ctx.assetPath)
    ? resolveAssetPathFn(ctx.sourceLayer, evaluateAssetPathExpression(ctx.assetPath, ctx.expressionVariables))
    : resolveAssetPathFn(ctx.sourceLayer, ctx.assetPath), options.tag ?? '')
}

/** UsdFlattenLayerStack with an advanced resolve function (Python Usd.FlattenLayerStackAdvanced). */
export function usdFlattenLayerStackAdvanced(
  layerStack: PcpLayerStack, resolveAssetPathFn: UsdFlattenResolveAssetPathAdvancedFn,
  options: { tag?: string } = {},
): Layer {
  return flattenLayerStackImpl(layerStack, resolveAssetPathFn, options.tag ?? '')
}

// UsdFlattenLayerStackResolveAssetPathAdvanced (flattenUtils.cpp:998-1014).
export function usdFlattenLayerStackResolveAssetPathAdvanced(ctx: UsdFlattenResolveAssetPathContext): string {
  const assetPath = sdfIsVariableExpression(ctx.assetPath)
    ? evaluateAssetPathExpression(ctx.assetPath, ctx.expressionVariables) : ctx.assetPath
  return usdFlattenLayerStackResolveAssetPath(ctx.sourceLayer, assetPath)
}

// UsdFlattenLayerStackResolveAssetPath (flattenUtils.cpp:1016-1041).
export function usdFlattenLayerStackResolveAssetPath(sourceLayer: Layer, assetPath: string): string {
  // Empty asset paths cause coding errors in
  // SdfComputeAssetPathRelativeToLayer.
  if (assetPath === '') return assetPath
  // If anchoring has no effect on asset path, return it as-is.
  const anchoredPath = sourceLayer.resolveAsset(assetPath)
  const unanchoredPath = ArGetResolver().createIdentifier(assetPath)
  if (unanchoredPath === anchoredPath) return assetPath
  return anchoredPath
}
