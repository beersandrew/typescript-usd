// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/profilesDocUtils.cpp,
//  pxr/usd/usdProfiles/profilesDocUtils.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdProfiles/profilesDocUtils.{h,cpp}: Markdown,
// Mermaid and Graphviz DOT renderings of the profile registry.

import { QueryStatus, UsdProfileRegistry } from './profileRegistry.ts'

interface PredInfo { id: string, deprecated: boolean }
interface CapInfo {
  id: string
  displayName: string
  docstring: string
  style: string
  subgraph: string
  isProfile: boolean
  predecessors: PredInfo[]
}
interface Model {
  // Buckets keyed by subgraph tag ('' = ungrouped), ordered by key.
  bySubgraph: Map<string, CapInfo[]>
  all: CapInfo[]
  // Style token -> Mermaid style string, ordered by token.
  styles: Map<string, string>
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

// _BuildModel (profilesDocUtils.cpp:72-128).
function buildModel(styleOverrides: ReadonlyMap<string, string> | Record<string, string>): Model {
  const all: CapInfo[] = []
  const bySubgraph = new Map<string, CapInfo[]>()
  for (const tok of UsdProfileRegistry.getAllCapabilities()) {
    const md = UsdProfileRegistry.getCapabilityMetadata(tok)
    const str = (key: string): string => typeof md[key] === 'string' ? md[key] as string : ''
    const info: CapInfo = {
      id: tok,
      displayName: str('name') || tok,
      docstring: str('docstring'),
      style: str('style'),
      subgraph: str('subgraph'),
      isProfile: md['isProfile'] === true,
      predecessors: UsdProfileRegistry.getPredecessors(tok)
        .map(p => ({ id: p.capability, deprecated: p.status === QueryStatus.Deprecated }))
        .sort((a, b) => compare(a.id, b.id)),
    }
    all.push(info)
    const bucket = bySubgraph.get(info.subgraph) ?? []
    bucket.push(info)
    bySubgraph.set(info.subgraph, bucket)
  }
  const cmp = (a: CapInfo, b: CapInfo): number =>
    a.displayName !== b.displayName ? compare(a.displayName, b.displayName) : compare(a.id, b.id)
  for (const bucket of bySubgraph.values()) bucket.sort(cmp)
  all.sort(cmp)
  const overrides = styleOverrides instanceof Map ? [...styleOverrides] : Object.entries(styleOverrides)
  const styles = new Map((overrides.length > 0 ? overrides : [...UsdProfileRegistry.getCapabilityStyles()])
    .sort(([a], [b]) => compare(a, b)))
  return { bySubgraph: new Map([...bySubgraph].sort(([a], [b]) => compare(a, b))), all, styles }
}

// _SanitizeId (profilesDocUtils.cpp:133-149).
function sanitizeId(id: string): string {
  let out = ''
  for (const byte of new TextEncoder().encode(id)) {
    const c = String.fromCharCode(byte)
    out += /[A-Za-z0-9_]/.test(c) ? c : '_'
  }
  if (out === '' || /^[0-9]/.test(out)) out = 'n' + out
  return out
}

// _EscapeQuotes (profilesDocUtils.cpp:152-166).
const escapeQuotes = (s: string): string => s.replace(/"/g, '\\"').replace(/\n/g, '\\n')

// _SortedSubgraphKeys (profilesDocUtils.cpp:171-187): alphabetical, the
// ungrouped bucket last.
function sortedSubgraphKeys(m: Model): string[] {
  return [...m.bySubgraph.keys()].sort((a, b) =>
    (a === '') !== (b === '') ? (a === '' ? 1 : -1) : compare(a, b))
}

const subgraphHeader = (key: string): string => key === '' ? '(ungrouped)' : key

// _RenderEntry (profilesDocUtils.cpp:197-216).
function renderEntry(c: CapInfo): string {
  let os = `#### ${c.displayName}\n\`${c.id}\`\n\n`
  if (c.docstring) os += `${c.docstring}\n\n`
  if (c.predecessors.length > 0) {
    os += '**Predecessors:** ' + c.predecessors
      .map(p => `\`${p.id}\`${p.deprecated ? ' *(deprecated)*' : ''}`).join(', ') + '\n\n'
  }
  return os
}

// _RenderMarkdown (profilesDocUtils.cpp:222-275).
function renderMarkdown(includeMermaid: boolean, model: Model): string {
  let os = '# Profile Registry\n\n'
  if (includeMermaid) os += '```mermaid\n' + renderMermaid(model) + '```\n\n'
  const keys = sortedSubgraphKeys(model)
  const emitSection = (heading: string, wantProfiles: boolean): void => {
    if (!keys.some(key => model.bySubgraph.get(key)!.some(c => c.isProfile === wantProfiles))) return
    os += `## ${heading}\n\n`
    for (const key of keys) {
      const bucket = model.bySubgraph.get(key)!.filter(c => c.isProfile === wantProfiles)
      if (bucket.length === 0) continue
      os += `### ${subgraphHeader(key)}\n\n`
      for (const c of bucket) os += renderEntry(c)
    }
  }
  emitSection('Profiles', true)
  emitSection('Capabilities', false)
  return os
}

// _RenderMermaid (profilesDocUtils.cpp:282-341).
function renderMermaid(model: Model): string {
  let os = 'graph LR\n'
  const safeIds = new Map(model.all.map(c => [c.id, sanitizeId(c.id)]))
  const emitNode = (c: CapInfo): void => {
    os += `    ${safeIds.get(c.id)}["${escapeQuotes(c.displayName)}"]`
    if (c.style) os += `:::${sanitizeId(c.style)}`
    os += '\n'
  }
  for (const key of sortedSubgraphKeys(model)) {
    const bucket = model.bySubgraph.get(key)!
    if (key === '') {
      for (const c of bucket) emitNode(c)
    } else {
      os += `    subgraph sg_${sanitizeId(key)}["${escapeQuotes(key)}"]\n`
      for (const c of bucket) {
        os += '    '
        emitNode(c)
      }
      os += '    end\n'
    }
  }
  for (const c of model.all) {
    for (const p of c.predecessors) {
      os += `    ${safeIds.get(c.id)}${p.deprecated ? ' -.-> ' : ' --> '}${safeIds.get(p.id) ?? sanitizeId(p.id)}\n`
    }
  }
  for (const [style, value] of model.styles) os += `    classDef ${sanitizeId(style)} ${value}\n`
  return os
}

// _ParseFillColor (profilesDocUtils.cpp:348-368).
function parseFillColor(style: string): string {
  const pos = style.indexOf('fill:')
  if (pos < 0) return ''
  const start = pos + 'fill:'.length
  const end = style.indexOf(',', start)
  const val = end < 0 ? style.slice(start) : style.slice(start, end)
  return val.replace(/^[ \t]+|[ \t]+$/g, '')
}

// _RenderDot (profilesDocUtils.cpp:371-434).
function renderDot(model: Model): string {
  let os = 'digraph profiles {\n    rankdir=LR;\n    node [shape=box];\n'
  const safeIds = new Map(model.all.map(c => [c.id, sanitizeId(c.id)]))
  const emitNode = (c: CapInfo, indent: string): void => {
    os += `${indent}${safeIds.get(c.id)} [label="${escapeQuotes(c.displayName)}\\n${escapeQuotes(c.id)}"`
    if (c.isProfile) os += ', peripheries=2'
    if (c.style) {
      const style = model.styles.get(c.style)
      if (style !== undefined) {
        const fill = parseFillColor(style)
        if (fill) os += `, style="filled", fillcolor="${escapeQuotes(fill)}"`
      }
    }
    os += '];\n'
  }
  let clusterIdx = 0
  for (const key of sortedSubgraphKeys(model)) {
    const bucket = model.bySubgraph.get(key)!
    if (key === '') {
      for (const c of bucket) emitNode(c, '    ')
    } else {
      os += `    subgraph cluster_${clusterIdx++} {\n        label="${escapeQuotes(key)}";\n`
      for (const c of bucket) emitNode(c, '        ')
      os += '    }\n'
    }
  }
  for (const c of model.all) {
    for (const p of c.predecessors) {
      os += `    ${safeIds.get(c.id)} -> ${safeIds.get(p.id) ?? sanitizeId(p.id)}${p.deprecated ? ' [style=dashed]' : ''};\n`
    }
  }
  return os + '}\n'
}

/**
 * UsdProfilesMarkdown (profilesDocUtils.cpp:440-453): a Markdown report of
 * the registry's profiles and capabilities, grouped by subgraph. With
 * `styles`, a Mermaid diagram of the DAG precedes the report, its classes
 * taken from `styles` or, when it is empty, from the registry.
 */
export function UsdProfilesMarkdown(styles?: ReadonlyMap<string, string> | Record<string, string>): string {
  return renderMarkdown(styles !== undefined, buildModel(styles ?? {}))
}

/** UsdProfilesMermaid (profilesDocUtils.cpp:454-459). */
export function UsdProfilesMermaid(styles: ReadonlyMap<string, string> | Record<string, string>): string {
  return renderMermaid(buildModel(styles))
}

/** UsdProfilesDot (profilesDocUtils.cpp:461-466). */
export function UsdProfilesDot(): string {
  return renderDot(buildModel({}))
}
