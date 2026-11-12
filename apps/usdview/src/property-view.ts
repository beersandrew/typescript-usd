// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/customAttributes.py,
//  pxr/usdImaging/usdviewq/rootDataModel.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Property view rows as native usdview builds them (OpenUSD v26.11.1):
//  appController.py:3897-3934 _getPropertiesDict: computed rows first, then attributes,
//    relationships and inheritable primvars sorted case-insensitively by name;
//  appController.py:3988-4110 _updatePropertyViewInternal: type role/icon, name font,
//    colour by value source, inherited "(i)" rows, targets/connections as children;
//  customAttributes.py:25-41,79-163 computed rows via rootDataModel.py:229-267;
//  common.py:296-420 GetShortStringForValue, GetPropertyTextFont, GetPropertyColor.
// Expected rows: tests/fixtures/usdviewPropertyView/expected.json.
import type { Attribute, Prim, Stage } from 'typescript-usd/usd'
import { ResolveInfoSource as UsdResolveInfoSource } from 'typescript-usd/usd'
import { BBoxCache, PrimvarsAPI, XformCache } from 'typescript-usd/usdGeom'
import { MaterialBindingAPI } from 'typescript-usd/usdShade'
import {LabelsAPI,LabelsQuery} from 'typescript-usd/usdSemantics'
import {formatLabels} from './labels-format'
import type { PropertySummary, PropertyValueSource } from './contracts'
import { matrix4dStr, matrix4dToString, gfStr, shortStringForTargets, shortStringForValue, targetsToString } from './python-format'

/** customAttributes.py:12-18 ComputedPropertyNames. */
export const computedPropertyNames = {
  worldBBox: 'World Bounding Box',
  localToWorldXform: 'Local to World Xform',
  resolvedPreviewMaterial: 'Resolved Preview Material',
  resolvedFullMaterial: 'Resolved Full Material',
  resolvedLabels: 'Resolved Labels',
} as const
const computedNames = new Set<string>(Object.values(computedPropertyNames))
export const isComputedProperty = (name: string) => computedNames.has(name)

const sources: Record<number, PropertyValueSource> = {
  [UsdResolveInfoSource.None]: 'none', [UsdResolveInfoSource.Fallback]: 'fallback',
  [UsdResolveInfoSource.Default]: 'default', [UsdResolveInfoSource.TimeSamples]: 'timeSamples',
  [UsdResolveInfoSource.ValueClips]: 'valueClips', [UsdResolveInfoSource.Spline]: 'spline',
}

/** Schema relationships (e.g. proxyPrim) come back from Prim.getAttr with
 * isRelationship false and no type name in typescript-usd 0.1.0. */
export function isRelationship(prim: Prim, attr: Attribute): boolean {
  if (attr.isRelationship) return true
  if (attr.typeName) return false
  const definition = prim.getPrimDefinition().getPropertyDefinition(attr.name)
  return definition.isValid() && definition.isRelationship()
}

/** common.py:347-372 GetPropertyTextFont: italic when the value is interpolated. */
function interpolated(attr: Attribute, time: number): boolean {
  const bracketing = attr.getBracketingTimeSamples(time)
  if (bracketing.length === 2 && bracketing[0] !== time) return true
  if (attr.hasSpline()) return !attr.getSpline()?.getKnots().has(time)
  return false
}

function computeOrInvalid(compute: () => string): string {
  try { return compute() } catch (error) { return 'Invalid: ' + (error instanceof Error ? error.message : String(error)) }
}

interface ComputedValue { short: string, text: string }
/** customAttributes.py computed property values: (property-view text, Value tab text). */
export function computedValue(stage: Stage, path: string, name: string, time: number): ComputedValue | undefined {
  const prim = stage.getPrim(path)
  if (!prim) return
  const both = (compute: () => ComputedValue): ComputedValue => {
    try { return compute() } catch (error) { const text = 'Invalid: ' + (error instanceof Error ? error.message : String(error)); return { short: text, text } }
  }
  if (name === computedPropertyNames.worldBBox) return both(() => {
    // rootDataModel.py:38-39: purposes default + proxy, extents hints on.
    const range = gfStr(new BBoxCache(time, ['default', 'proxy'], true).computeWorldBound(prim).ComputeAlignedRange())!
    return { short: range, text: range }
  })
  if (name === computedPropertyNames.localToWorldXform) return both(() => {
    const matrix = new XformCache(stage, time).getLocalToWorldTransform(path)
    return { short: matrix4dStr(matrix), text: matrix4dToString(matrix) }
  })
  if (name === computedPropertyNames.resolvedPreviewMaterial || name === computedPropertyNames.resolvedFullMaterial) return both(() => {
    const purpose = name === computedPropertyNames.resolvedPreviewMaterial ? 'preview' : 'full'
    const binding = MaterialBindingAPI.computeBoundMaterial(stage, path, purpose)
    // scalarTypes.ToString pretty-prints an Sdf.Path with pprint (its repr).
    return binding ? { short: binding.materialPath, text: `Sdf.Path('${binding.materialPath}')` } : { short: '<unbound>', text: '<unbound>' }
  })
  if (name === computedPropertyNames.resolvedLabels) return both(() => {
    // rootDataModel.py:258-267 creates a fresh query per taxonomy/frame.
    return formatLabels(LabelsAPI.computeInheritedTaxonomies(prim).map(taxonomy=>
      [taxonomy,Array.from(new LabelsQuery(taxonomy,time).computeUniqueInheritedLabels(prim))] as const))
  })
}

function computedRows(stage: Stage, prim: Prim, time: number): PropertySummary[] {
  // customAttributes.py:25-41: imageable or typeless prims get the imageable computations.
  const names = prim.isA('Imageable') || !prim.typeName
    ? Object.values(computedPropertyNames) : [computedPropertyNames.resolvedLabels]
  return names.map(name => ({
    name, typeName: '', value: computeOrInvalid(() => computedValue(stage, prim.path, name, time)!.short),
    role: name === computedPropertyNames.resolvedPreviewMaterial || name === computedPropertyNames.resolvedFullMaterial ? 'computedMaterial' : 'computed',
    source: null, inherited: false, interpolated: false, targets: [],
  }))
}

/** The property view rows for one selected prim ('/' is the pseudo-root). */
export function propertyRows(stage: Stage, path: string, time: number): PropertySummary[] {
  const prim = stage.getPrim(path)
  if (!prim) return []
  const rows: PropertySummary[] = []
  const add = (owner: Prim, name: string, inherited: boolean) => {
    const attr = owner.getAttr(name)
    if (!attr) return
    if (isRelationship(owner, attr)) {
      const targets = attr.getTargets()
      rows.push({ name, typeName: '', value: shortStringForTargets(targets), role: targets.length ? 'relationshipWithTargets' : 'relationship',
        source: null, inherited, interpolated: false, targets })
      return
    }
    const connections = attr.getConnections()
    rows.push({ name, typeName: attr.typeName, value: shortStringForValue(attr.getValueAtTime(time), attr.typeName),
      role: connections.length ? 'attributeWithConnections' : 'attribute',
      source: sources[attr.getResolveInfo(time).getSource()] ?? 'none', inherited,
      interpolated: interpolated(attr, time), targets: connections })
  }
  if (path !== '/') {
    for (const name of prim.getPropertyNames()) add(prim, name, false)
    // UsdGeom.PrimvarsAPI.FindInheritablePrimvars: ancestors' constant primvars not
    // shadowed by this prim's own primvars.
    for (const primvar of new PrimvarsAPI(prim, stage).findPrimvarsWithInheritance()) {
      if (primvar.primPath === path || rows.some(row => row.name === primvar.attrName)) continue
      const owner = stage.getPrim(primvar.primPath)
      if (owner) add(owner, primvar.attrName, true)
    }
  }
  const lower = (name: string) => name.toLowerCase()
  rows.sort((a, b) => lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : 0)
  return [...computedRows(stage, prim, time), ...rows]
}

/** Value tab text for a computed property (attributeValueEditor.py:94-118). */
export function computedValueText(stage: Stage, path: string, name: string, time: number): string | undefined {
  return computedValue(stage, path, name, time)?.text
}
export { targetsToString }
