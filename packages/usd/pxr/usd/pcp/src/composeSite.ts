// Ported from OpenUSD 26.11.1: pxr/usd/pcp/composeSite.cpp,
//  pxr/usd/pcp/composeSite.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Single-site composition: compose the opinions authored at one
// (layer stack, path) site. Port of OpenUSD v26.08
// pxr/usd/pcp/composeSite.{h,cpp}.

import {
  sdfApplyListOpToVector, sdfApplyListOrdering, sdfNormalizeListOp,
  NormalizedListOp as SdfNormalizedListOp,
} from 'typescript-usd/sdf'
import type { PcpError } from './errors.ts'
import type { PcpLayerStack } from './layerStack.ts'
import { pcpReadField, type PcpLayer } from './layerStackIdentifier.ts'
import type { PcpPermission } from './primIndex_Graph.ts'
import { pcpEvaluateVariableExpression, pcpIsVariableExpression } from './utils.ts'
import type { SdfLayerOffset } from 'typescript-usd/sdf/layerOffset'
import { SDF_LAYER_OFFSET_IDENTITY } from 'typescript-usd/sdf/layerOffset'
import { SdfPath } from 'typescript-usd/sdf/path'
import { _sdfCreateLayerIdentifier, _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'

// PcpArcInfo (composeSite.h:58-70).
export class PcpArcInfo {
  constructor(
    public sourceLayer: PcpLayer,
    public sourceLayerStackOffset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY,
    public authoredAssetPath = '',
    public arcNum = 0,
  ) {}
}

// An SdfReference / SdfPayload value.
export interface PcpReference {
  assetPath: string
  primPath: string
  layerOffset: SdfLayerOffset
  customData?: Record<string, unknown>
}

type SitePath = SdfPath | string
const key = (path: SitePath): string => typeof path === 'string' ? path : path.pathString
const toSdfPath = (path: SitePath): SdfPath =>
  typeof path === 'string' ? SdfPath.fromString(path) : path

// A bare reference object as written by some readers is a one-item explicit
// list op.
function asRefListOp(raw: unknown): SdfNormalizedListOp<PcpReference> {
  const op = sdfNormalizeListOp<Partial<PcpReference>>(raw) ?? {
    isExplicit: true, explicitItems: [raw as Partial<PcpReference>],
    addedItems: [], deletedItems: [], prependedItems: [], appendedItems: [], orderedItems: [],
  }
  const toRef = (r: Partial<PcpReference>): PcpReference => ({
    assetPath: r.assetPath ?? '', primPath: r.primPath ?? '',
    layerOffset: r.layerOffset ?? SDF_LAYER_OFFSET_IDENTITY,
    ...(r.customData !== undefined ? { customData: r.customData } : {}),
  })
  const map = (items: readonly Partial<PcpReference>[]): PcpReference[] => items.map(toRef)
  return {
    isExplicit: op.isExplicit, explicitItems: map(op.explicitItems),
    addedItems: map(op.addedItems),
    deletedItems: map(op.deletedItems), prependedItems: map(op.prependedItems),
    appendedItems: map(op.appendedItems), orderedItems: map(op.orderedItems),
  }
}

// SdfReference / SdfPayload equality: asset path, prim path, layer offset and
// (references only) custom data.
const refKey = (r: PcpReference): string =>
  `${r.assetPath}\0${r.primPath}\0${r.layerOffset.offset}\0${r.layerOffset.scale}\0${
    r.customData === undefined ? '' : JSON.stringify(r.customData)}`

// SdfComputeAssetPathRelativeToLayer: anchor the asset path to the layer,
// keeping any embedded file format arguments.
function computeAssetPathRelativeToLayer(layer: PcpLayer, assetPath: string): string {
  const { assetPath: path, args } = _sdfSplitLayerIdentifier(assetPath)
  const anchored = layer.resolveAsset(path)
  return anchored ? _sdfCreateLayerIdentifier(anchored, args) : ''
}

// _PcpComposeSiteReferencesOrPayloads (composeSite.cpp:47-118).
function composeSiteReferencesOrPayloads(
  field: 'references' | 'payload',
  layerStack: PcpLayerStack, path: SitePath,
  info?: PcpArcInfo[], exprVarDependencies?: Set<string>, errors?: PcpError[],
): PcpReference[] {
  const sitePath = key(path)
  const infoMap = new Map<string, PcpArcInfo>()
  const layers = layerStack.layers
  let result: PcpReference[] = []
  for (let i = layers.length - 1; i >= 0; i--) {
    const { layer, offset } = layers[i]!
    const raw = pcpReadField(layer, sitePath, field)
    if (raw === undefined || raw === null) continue
    const op = asRefListOp(raw)
    // ApplyOperations callback: anchor asset paths to the authoring layer,
    // evaluating variable expressions first; an expression that evaluates to
    // nothing drops the item.
    const apply = (item: PcpReference): PcpReference | undefined => {
      let authoredAssetPath = item.assetPath
      let assetPath = ''
      if (pcpIsVariableExpression(authoredAssetPath)) {
        authoredAssetPath = pcpEvaluateVariableExpression(
          authoredAssetPath, layerStack.expressionVariables,
          field === 'references' ? 'reference' : 'payload',
          layer, toSdfPath(path), exprVarDependencies, errors)
        if (authoredAssetPath === '') return undefined
        assetPath = computeAssetPathRelativeToLayer(layer, authoredAssetPath)
      } else if (authoredAssetPath !== '') {
        assetPath = computeAssetPathRelativeToLayer(layer, authoredAssetPath)
      }
      const mapped: PcpReference = {
        assetPath, primPath: item.primPath, layerOffset: item.layerOffset,
        ...(field === 'references' && item.customData !== undefined
          ? { customData: item.customData } : {}),
      }
      infoMap.set(refKey(mapped), new PcpArcInfo(layer, offset, authoredAssetPath))
      return mapped
    }
    const mapItems = (items: readonly PcpReference[]): PcpReference[] => {
      const out: PcpReference[] = []
      for (const item of items) {
        const mapped = apply(item)
        if (mapped) out.push(mapped)
      }
      return out
    }
    result = sdfApplyListOpToVector(result, {
      isExplicit: op.isExplicit,
      explicitItems: mapItems(op.explicitItems),
      addedItems: mapItems(op.addedItems),
      deletedItems: mapItems(op.deletedItems),
      prependedItems: mapItems(op.prependedItems),
      appendedItems: mapItems(op.appendedItems),
      orderedItems: mapItems(op.orderedItems),
    }, { key: refKey })
  }
  if (info) {
    info.length = 0
    for (let i = 0; i < result.length; i++) {
      const arcInfo = infoMap.get(refKey(result[i]!))!
      info.push(new PcpArcInfo(
        arcInfo.sourceLayer, arcInfo.sourceLayerStackOffset, arcInfo.authoredAssetPath, i))
    }
  }
  return result
}

// PcpComposeSiteReferences (composeSite.cpp:120-131).
export function pcpComposeSiteReferences(
  layerStack: PcpLayerStack, path: SitePath,
  info?: PcpArcInfo[], exprVarDependencies?: Set<string>, errors?: PcpError[],
): PcpReference[] {
  return composeSiteReferencesOrPayloads(
    'references', layerStack, path, info, exprVarDependencies, errors)
}

// PcpComposeSitePayloads (composeSite.cpp:133-144).
export function pcpComposeSitePayloads(
  layerStack: PcpLayerStack, path: SitePath,
  info?: PcpArcInfo[], exprVarDependencies?: Set<string>, errors?: PcpError[],
): PcpReference[] {
  return composeSiteReferencesOrPayloads(
    'payload', layerStack, path, info, exprVarDependencies, errors)
}

// PcpComposeSitePermission (composeSite.cpp:146-156).
export function pcpComposeSitePermission(
  layerStack: PcpLayerStack, path: SitePath,
): PcpPermission {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    const value = pcpReadField(layer, sitePath, 'permission')
    if (value !== undefined && value !== null) {
      return value === 'private' || value === 1 ? 'private' : 'public'
    }
  }
  return 'public'
}

// PcpComposeSiteHasSpecs (composeSite.cpp:158-182).
export function pcpComposeSiteHasSpecs(
  layerStack: PcpLayerStack, path: SitePath, layersToIgnore?: ReadonlySet<PcpLayer>,
): boolean {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    if (layer.hasSpec(sitePath) && !layersToIgnore?.has(layer)) return true
  }
  return false
}

// PcpComposeSiteHasSymmetry (composeSite.cpp:184-196).
export function pcpComposeSiteHasSymmetry(layerStack: PcpLayerStack, path: SitePath): boolean {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    if (pcpReadField(layer, sitePath, 'symmetryFunction') != null ||
        pcpReadField(layer, sitePath, 'symmetryArguments') != null) return true
  }
  return false
}

// PcpComposeSiteHasValueClips (composeSite.cpp:198-208).
export function pcpComposeSiteHasValueClips(layerStack: PcpLayerStack, path: SitePath): boolean {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    if (pcpReadField(layer, sitePath, 'clips') != null) return true
  }
  return false
}

// PcpComposeSitePrimSites (composeSite.cpp:210-220).
export function pcpComposeSitePrimSites(
  layerStack: PcpLayerStack, path: SitePath,
): Array<{ layer: PcpLayer; path: string }> {
  const sitePath = key(path)
  const result: Array<{ layer: PcpLayer; path: string }> = []
  for (const { layer } of layerStack.layers) {
    if (layer.hasSpec(sitePath)) result.push({ layer, path: sitePath })
  }
  return result
}

// SdfPath list-op values are absolute by the time Pcp folds them; the parser
// here keeps relative spellings, so anchor them to the owning prim.
function absolutePathItem(sitePath: string, authored: string): string {
  if (authored.startsWith('/')) return authored
  const parts = sitePath.split('/').filter(Boolean)
  for (const component of authored.split('/')) {
    if (!component || component === '.') continue
    if (component === '..') {
      if (parts.length === 0) return ''
      parts.pop()
    } else {
      parts.push(component)
    }
  }
  return `/${parts.join('/')}`
}

// _ComposeSiteListOpWithSourceInfo / the plain overloads
// (composeSite.cpp:222-336) for SdfPath list ops.
function composeSitePathListOp(
  layerStack: PcpLayerStack, path: SitePath, field: string, info?: PcpArcInfo[],
): string[] {
  const sitePath = key(path)
  const sources = new Map<string, PcpLayer>()
  let result: string[] = []
  for (let i = layerStack.layers.length - 1; i >= 0; i--) {
    const { layer } = layerStack.layers[i]!
    const raw = pcpReadField(layer, sitePath, field)
    if (raw === undefined || raw === null) continue
    const op = sdfNormalizeListOp<string>(raw)
    if (!op) continue
    const items = (values: readonly unknown[]): string[] => {
      const out: string[] = []
      for (const v of values) {
        if (typeof v !== 'string') continue
        const p = absolutePathItem(sitePath, v)
        sources.set(p, layer)
        out.push(p)
      }
      return out
    }
    result = sdfApplyListOpToVector(result, {
      ...op,
      explicitItems: items(op.explicitItems), addedItems: items(op.addedItems),
      deletedItems: items(op.deletedItems),
      prependedItems: items(op.prependedItems), appendedItems: items(op.appendedItems),
      orderedItems: items(op.orderedItems),
    })
  }
  if (info) {
    info.length = 0
    result.forEach((p, i) => info.push(new PcpArcInfo(sources.get(p)!, undefined, '', i)))
  }
  return result
}

function composeSiteStringListOp(
  layerStack: PcpLayerStack, path: SitePath, field: string, info?: PcpArcInfo[],
): string[] {
  const sitePath = key(path)
  const sources = new Map<string, PcpLayer>()
  let result: string[] = []
  for (let i = layerStack.layers.length - 1; i >= 0; i--) {
    const { layer } = layerStack.layers[i]!
    const raw = pcpReadField(layer, sitePath, field)
    if (raw === undefined || raw === null) continue
    const op = sdfNormalizeListOp<string>(raw)
    if (!op) continue
    for (const list of [op.explicitItems, op.addedItems, op.prependedItems, op.appendedItems]) {
      for (const item of list) sources.set(item, layer)
    }
    result = sdfApplyListOpToVector(result, op)
  }
  if (info) {
    info.length = 0
    result.forEach((name, i) => info.push(new PcpArcInfo(sources.get(name)!, undefined, '', i)))
  }
  return result
}

// PcpComposeSiteInherits (composeSite.cpp:262-286).
export function pcpComposeSiteInherits(
  layerStack: PcpLayerStack, path: SitePath, info?: PcpArcInfo[],
): string[] {
  return composeSitePathListOp(layerStack, path, 'inheritPaths', info)
}

// PcpComposeSiteSpecializes (composeSite.cpp:288-312).
export function pcpComposeSiteSpecializes(
  layerStack: PcpLayerStack, path: SitePath, info?: PcpArcInfo[],
): string[] {
  return composeSitePathListOp(layerStack, path, 'specializes', info)
}

// PcpComposeSiteVariantSets (composeSite.cpp:314-336).
export function pcpComposeSiteVariantSets(
  layerStack: PcpLayerStack, path: SitePath, info?: PcpArcInfo[],
): string[] {
  return composeSiteStringListOp(layerStack, path, 'variantSetNames', info)
}

// PcpComposeSiteVariantSetOptions (composeSite.cpp:338-354).
export function pcpComposeSiteVariantSetOptions(
  layerStack: PcpLayerStack, path: SitePath, vsetName: string,
): Set<string> {
  const vsetPath = toSdfPath(path).appendVariantSelection(vsetName, '').pathString
  const result = new Set<string>()
  for (const { layer } of layerStack.layers) {
    const names = pcpReadField(layer, vsetPath, 'variantChildren') as string[] | undefined
    if (names) for (const name of names) result.add(name)
  }
  return result
}

function variantSelectionMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [set, sel] of Object.entries(value as Record<string, unknown>)) {
    const v = Array.isArray(sel) ? sel[0] : sel
    if (typeof v === 'string') out[set] = v
  }
  return out
}

// PcpComposeSiteVariantSelection (composeSite.cpp:356-399). Returns the
// selection, or undefined when none is authored.
export function pcpComposeSiteVariantSelection(
  layerStack: PcpLayerStack, path: SitePath, vsetName: string,
  exprVarDependencies?: Set<string>, errors?: PcpError[],
): string | undefined {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    const vselMap = variantSelectionMap(pcpReadField(layer, sitePath, 'variantSelection'))
    if (!vselMap) continue
    let vsel = vselMap[vsetName]
    if (vsel === undefined) continue
    if (pcpIsVariableExpression(vsel)) {
      const exprErrors: PcpError[] = []
      vsel = pcpEvaluateVariableExpression(
        vsel, layerStack.expressionVariables, 'variant', layer, toSdfPath(path),
        exprVarDependencies, exprErrors)
      if (exprErrors.length > 0) {
        errors?.push(...exprErrors)
        continue
      }
    }
    return vsel
  }
  return undefined
}

// PcpComposeSiteVariantSelections (composeSite.cpp:401-441).
export function pcpComposeSiteVariantSelections(
  layerStack: PcpLayerStack, path: SitePath,
  exprVarDependencies?: Set<string>, errors?: PcpError[],
): Record<string, string> {
  const sitePath = key(path)
  const result: Record<string, string> = {}
  for (const { layer } of layerStack.layers) {
    const vselMap = variantSelectionMap(pcpReadField(layer, sitePath, 'variantSelection'))
    if (!vselMap) continue
    for (let [set, vsel] of Object.entries(vselMap)) {
      if (pcpIsVariableExpression(vsel)) {
        const exprErrors: PcpError[] = []
        vsel = pcpEvaluateVariableExpression(
          vsel, layerStack.expressionVariables, 'variant', layer, toSdfPath(path),
          exprVarDependencies, exprErrors)
        if (exprErrors.length > 0) {
          errors?.push(...exprErrors)
          continue
        }
      }
      if (!(set in result)) result[set] = vsel
    }
  }
  return result
}

// PcpComposeSiteHasVariantSelections (composeSite.cpp:443-454).
export function pcpComposeSiteHasVariantSelections(
  layerStack: PcpLayerStack, path: SitePath,
): boolean {
  const sitePath = key(path)
  for (const { layer } of layerStack.layers) {
    if (pcpReadField(layer, sitePath, 'variantSelection') != null) return true
  }
  return false
}

// PcpComposeSiteChildNames (composeSite.cpp:456-516): compose a children
// field weak-to-strong over `nameOrder`/`nameSet`, applying `orderField`.
export function pcpComposeSiteChildNames(
  layers: readonly { layer: PcpLayer }[], path: SitePath, namesField: string,
  nameOrder: string[], nameSet: Set<string>, orderField?: string,
): void {
  const sitePath = key(path)
  for (let i = layers.length - 1; i >= 0; i--) {
    const { layer } = layers[i]!
    const names = pcpReadField(layer, sitePath, namesField)
    if (Array.isArray(names)) {
      for (const name of names as string[]) {
        if (!nameSet.has(name)) {
          nameSet.add(name)
          nameOrder.push(name)
        }
      }
    }
    if (orderField) {
      const order = pcpReadField(layer, sitePath, orderField)
      if (Array.isArray(order) && order.length > 0) {
        const reordered = sdfApplyListOrdering(nameOrder, order as string[])
        nameOrder.splice(0, nameOrder.length, ...reordered)
      }
    }
  }
}
