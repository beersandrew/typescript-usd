// Ported from OpenUSD 26.11.1: pxr/usd/pcp/diagnostic.cpp,
//  pxr/usd/pcp/diagnostic.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Text graph serialization. Port of OpenUSD v26.08
// pxr/usd/pcp/diagnostic.cpp:44-231 (Pcp_Dump / PcpDump).

import { PcpArcType } from './arc.ts'
import { pcpClassifyNodeDependency, pcpDependencyFlagsToString } from './dependency.ts'
import type { PcpMapExpression } from './mapExpression.ts'
import type { PcpNodeRef } from './node.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import { pcpLayerStackIdentifierString } from './site.ts'
import { _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'

const ARC_NAMES: Record<PcpArcType, string> = {
  [PcpArcType.Root]: 'root',
  [PcpArcType.Inherit]: 'inherit',
  [PcpArcType.Variant]: 'variant',
  [PcpArcType.Relocate]: 'relocate',
  [PcpArcType.Reference]: 'reference',
  [PcpArcType.Payload]: 'payload',
  [PcpArcType.Specialize]: 'specialize',
}

const bool = (value: boolean): string => value ? 'TRUE' : 'FALSE'

function formatDouble(value: number): string {
  return String(Number(value.toPrecision(6)))
}

// PcpMapFunction::GetString (mapFunction.cpp:1430-1449).
function mapString(expr: PcpMapExpression): string {
  const map = expr.evaluate()
  const lines: string[] = []
  const offset = map.getTimeOffset()
  if (offset.offset !== 0 || offset.scale !== 1) {
    lines.push(`SdfLayerOffset(${formatDouble(offset.offset)}, ${formatDouble(offset.scale)})`)
  }
  const entries = [...map.getSourceToTargetMap()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  for (const [source, target] of entries) lines.push(`${source} -> ${target}`)
  return lines.join('\n')
}

function baseName(identifier: string): string {
  const { assetPath } = _sdfSplitLayerIdentifier(identifier)
  const normalized = assetPath.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function dumpNode(
  node: PcpNodeRef, order: Map<PcpNodeRef, number>,
  specSites: Map<PcpNodeRef, Array<{ layer: { filePath: string }; path: string }>>,
  includeMaps: boolean,
): string {
  const parent = node.getParentNode()
  let s = `Node ${order.get(node) ?? 0}:\n`
  s += `    Parent node:              ${parent ? String(order.get(parent) ?? 0) : 'NONE'}\n`
  s += `    Type:                     ${ARC_NAMES[node.getArcType()]}\n`
  s += `    DependencyType:           ${pcpDependencyFlagsToString(pcpClassifyNodeDependency(node))}\n`
  s += `    Source path:              <${node.getPath().pathString}>\n`
  s += `    Source layer stack:       ${pcpLayerStackIdentifierString(node.getLayerStack().identifier)}\n`
  s += `    Target path:              <${parent ? parent.getPath().pathString : 'NONE'}>\n`
  s += `    Target layer stack:       ${parent
    ? pcpLayerStackIdentifierString(parent.getLayerStack().identifier) : 'NONE'}\n`
  const origin = node.getOriginNode()
  if (origin !== parent) {
    s += `    Origin node:              ${origin ? order.get(origin) ?? 0 : 0}\n`
    s += `    Sibling # at origin:      ${node.getSiblingNumAtOrigin()}\n`
  }
  if (includeMaps) {
    s += `    Map to parent:\n        ${mapString(node.getMapToParent()).replaceAll('\n', '\n        ')}\n`
    s += `    Map to root:\n        ${mapString(node.getMapToRoot()).replaceAll('\n', '\n        ')}\n`
  }
  s += `    Namespace depth:          ${node.getNamespaceDepth()}\n`
  s += `    Depth below introduction: ${node.getDepthBelowIntroduction()}\n`
  s += `    Is due to ancestor:       ${bool(node.isDueToAncestor())}\n`
  s += `    Permission:               ${node.getPermission() === 'private' ? 'Private' : 'Public'}\n`
  s += `    Is restricted:            ${bool(node.isRestricted)}\n`
  s += `    Is inert:                 ${bool(node.isInert)}\n`
  s += `    Contribute specs:         ${bool(node.canContributeSpecs())}\n`
  s += `        Restricted at depth:  ${node.getSpecContributionRestrictedDepth()}\n`
  s += `    Has specs:                ${bool(node.hasSpecs)}\n`
  s += `    Has symmetry:             ${bool(node.hasSymmetry)}\n`
  const sites = specSites.get(node)
  if (sites) {
    s += '    Prim stack:\n'
    for (const site of sites) {
      s += `      <${site.path}> ${baseName(site.layer.filePath)} - @${site.layer.filePath}@\n`
    }
  }
  for (const child of node.getChildren()) s += dumpNode(child, order, specSites, includeMaps)
  s += '\n'
  return s
}

// PcpDump(PcpPrimIndex) (diagnostic.cpp:182-225).
export function pcpDump(
  primIndex: PcpPrimIndex, _includeInheritOriginInfo = true, includeMaps = true,
): string {
  if (!primIndex.isValid()) return ''
  const order = new Map<PcpNodeRef, number>()
  const specSites = new Map<PcpNodeRef, Array<{ layer: { filePath: string }; path: string }>>()
  const nodes = primIndex.getNodeRange()
  nodes.forEach((node, index) => order.set(node, index))
  for (const node of nodes) {
    if (!node.hasSpecs || !node.canContributeSpecs()) continue
    const path = node.getPath().pathString
    for (const { layer } of node.getLayerStack().layers) {
      if (!layer.hasSpec(path)) continue
      let list = specSites.get(node)
      if (!list) specSites.set(node, list = [])
      list.push({ layer, path })
    }
  }
  return dumpNode(primIndex.getRootNode(), order, specSites, includeMaps)
}
