// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/arrayAttributeView.py,
//  pxr/usdImaging/usdviewq/common.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { inspectLayerStack } from './layer-stack-inspection'
import { inspectCompositionTree } from './composition-inspection'
import { inspectMetadata, metadataValueText } from './metadata-inspection'
import { PrimCompositionQuery, type Stage } from 'typescript-usd/usd'
import { PrimvarsAPI } from 'typescript-usd/usdGeom'
import { arrayEntryToString, scalarToString, targetsToString, pyStr } from './python-format'
import { computedValueText, isComputedProperty, isRelationship } from './property-view'
import { ArcType } from 'typescript-usd/pcp'
import type { InspectionSnapshot, InspectionOptions, InspectionArray } from './inspection-types'

export function formatInspectionValue(value: unknown): string {
  if (value === undefined) return '—'
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (item && typeof item === 'object') {
        const usd = item as { toArray?: () => unknown; data?: unknown }
        if (typeof usd.toArray === 'function') return usd.toArray()
        if (Array.isArray(usd.data)) return usd.data
        if (ArrayBuffer.isView(item)) return Array.from(item as unknown as ArrayLike<number>)
      }
      return item
    }) ?? String(value)
  } catch { return String(value) }
}
// usdviewq/arrayAttributeView.py:25-110 exposes indexed typed values and
// publishes rows incrementally. Browser pages cap work at100 values per query.
function arrayAccess(value: unknown, typeName: string): { length: number; at(index: number): unknown } | undefined {
  if (!typeName.endsWith('[]') || value == null || typeof value !== 'object') return
  const array = value as { length?: number; get?: (index: number) => unknown; [index: number]: unknown }
  if (!Number.isSafeInteger(array.length) || array.length! < 0) return
  return { length: array.length!, at: index => typeof array.get === 'function' ? array.get(index) : array[index] }
}
export function inspectArray(value: unknown, typeName: string, options: InspectionOptions = {}): InspectionArray | undefined {
  const array = arrayAccess(value, typeName)
  if (!array) return
  const limit = Math.min(100, Math.max(1, Number.isFinite(options.arrayLimit) ? Math.trunc(options.arrayLimit!) : 100))
  const requested = Number.isFinite(options.arrayStart) ? Math.max(0, Math.trunc(options.arrayStart!)) : 0
  const start = Math.min(requested, Math.max(0, array.length - 1))
  return { typeName, length: array.length, start, entries: Array.from({length: Math.min(limit, array.length - start)}, (_, i) => {
    const item = array.at(start + i)
    return {index: start + i, value: typeName==='asset[]'?scalarToString(item,'asset'):formatInspectionValue(item), text: arrayEntryToString(start + i, item, typeName)}
  }) }
}
export function formatPropertyValue(value: unknown, typeName: string): string {
  const array = arrayAccess(value, typeName)
  if (!array) return formatInspectionValue(value)
  const preview = Array.from({length: Math.min(8, array.length)}, (_, i) => formatInspectionValue(array.at(i))).join(', ')
  return `[${preview}${array.length > 8 ? ', …' : ''}] (${array.length} elements)`
}

const arcNames: Record<number, string> = {
  [ArcType.Root]: 'root', [ArcType.Inherit]: 'inherit', [ArcType.Variant]: 'variant',
  [ArcType.Relocate]: 'relocate', [ArcType.Reference]: 'reference',
  [ArcType.Payload]: 'payload', [ArcType.Specialize]: 'specialize',
}

// OpenUSD v26.11.1 usdviewq/appController.py:4284,4427,4590 uses composed
// metadata, prim-index composition and strongest-first spec stacks. The consumer
// presents query arcs as a table, not the native recursive composition/layer tree.
export function inspectObject(stage: Stage, path: string, propertyName?: string, time = 0, options: InspectionOptions = {}): InspectionSnapshot | null {
  let prim = stage.getPrim(path)
  if (!prim) return null
  // customAttributes.py computed properties: a Value tab only; the other tabs have no
  // USD object to show (appController.py:4126-4146 _getSelectedObject is invalid).
  if (propertyName && isComputedProperty(propertyName)) {
    const valueText = computedValueText(stage, path, propertyName, time)
    return valueText === undefined ? null : { objectPath: `${path}.${propertyName}`, metadata: [], layers: [], composition: [], targets: [], valueText, computed: true }
  }
  let inherited = false
  if (propertyName && !prim.getPropertyNames().includes(propertyName)) {
    // appController.py:4141-4145: an inherited primvar inspects the ancestor's attribute.
    const primvar = path === '/' ? null : new PrimvarsAPI(prim, stage).findPrimvarWithInheritance(propertyName.replace(/^primvars:/, ''))
    const owner = primvar && primvar.primPath !== path ? stage.getPrim(primvar.primPath) : undefined
    if (!owner) return null
    prim = owner; path = owner.path; inherited = true
  }
  const property = propertyName ? prim.getAttr(propertyName) : undefined
  const relationship = !!property && isRelationship(prim, property)
  const objectPath = property ? `${path}.${propertyName}` : path
  const metadata = (property ?? prim).getAllMetadata()
  const propertyStack = property ? stage.getPropertyStackWithLayerOffsets(objectPath,time) : undefined
  const primStack = property ? undefined : stage.getPrimStack(path)
  const layers = property
    ? propertyStack!.map(row => {
      // usdviewq/common.py:244-291: Sdf specs at numeric time show a sample
      // count and authored sample pairs, not interpolated per-layer values.
      // Times remain layer-local; cumulative offsets are a separate column.
      const count = row.timeSamples?.length ?? 0
      return {
        layer: row.layerIdentifier, specPath: row.specPath, arc: row.arc,
        ...row.offset,
        value: count ? `${count} time sample${count === 1 ? '' : 's'}` : formatPropertyValue(row.value, property.typeName),
        ...(count ? { sampleCount: count, samples: row.timeSamples!.slice(0, 100).map(([time, value]) => ({ time, value: formatPropertyValue(value, property.typeName) })) } : {}),
      }
    })
    : primStack!.map(row => ({
      layer: row.layerIdentifier, specPath: row.specPath, arc: row.arc,
      ...row.offset, value: formatInspectionValue(row.metadata),
    }))
  const composition = new PrimCompositionQuery(prim).getCompositionArcs().map(arc => ({
    arc: arcNames[arc.getArcType()] ?? String(arc.getArcType()),
    targetLayer: arc.getTargetLayer().identifier, targetPath: arc.getTargetPrimPath().pathString,
    introducingLayer: arc.getIntroducingLayer()?.identifier ?? '',
    introducingPath: arc.getIntroducingPrimPath().pathString,
    ancestral: arc.isAncestral(), hasSpecs: arc.hasSpecs(),
  }))
  const targets: InspectionSnapshot['targets'] = []
  if (property) {
    const kind = relationship ? 'relationship' : 'connection'
    for (const target of relationship ? property.getTargets() : property.getConnections()) {
      const dot = target.indexOf('.')
      const primPath = dot < 0 ? target : target.slice(0, dot)
      const name = dot < 0 ? undefined : target.slice(dot + 1)
      const targetPrim = stage.getPrim(primPath)
      targets.push({ kind, path: target, primPath, ...(name ? { propertyName: name } : {}),
        exists: !!targetPrim && (!name || targetPrim.getPropertyNames().includes(name)) })
    }
  }
  const compositionTree = options.includeCompositionTree ? inspectCompositionTree(stage, path) : undefined
  const details = options.includeMetadataDetails ? inspectMetadata(stage, path, propertyName) : null
  const metadataDetails = details ? {...details, rows:details.rows.map(row => ({...row, value:metadataValueText(row.value,row.name)}))} : undefined
  const value = property && !relationship ? property.getValueAtTime(time) : undefined
  // attributeValueEditor.py:76-118: arrays use the array view (no value: no rows);
  // an attribute of another prim (inherited primvar) shows no value.
  const array = property && !relationship && !inherited && property.typeName.endsWith('[]')
    ? inspectArray(value, property.typeName, options) ?? { typeName: property.typeName, length: 0, start: 0, entries: [] } : undefined
  const valueText = !property || array ? undefined : inherited ? '' : relationship ? targetsToString(property.getTargets()) : scalarToString(value, property.typeName)
  const copyValueText = !property ? undefined : relationship ? targetsToString(property.getTargets()).replace(/\n\s*/g,' ') : value == null ? '' : pyStr(value,property.typeName)
  return { layerStackView:inspectLayerStack(stage,path,propertyName,time,propertyStack??primStack), ...(copyValueText !== undefined ? {copyValueText} : {}), ...(compositionTree ? {compositionTree} : {}), ...(metadataDetails ? {metadataDetails} : {}), ...(array ? { array } : {}), ...(valueText !== undefined ? { valueText } : {}), ...(inherited ? { inheritedFrom: path } : {}), objectPath, metadata: Object.keys(metadata).sort().map(name => ({ name, value: formatInspectionValue(metadata[name]) })), layers, composition, targets }
}
