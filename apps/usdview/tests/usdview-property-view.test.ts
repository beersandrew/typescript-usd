// USD-semantics tests for the property view, Value tab text and prim tree rows.
// Expected values: native OpenUSD 26.11.1 usdviewq code (_updatePropertyViewInternal on a
// real QTreeWidget, AttributeValueEditor, PrimViewItem, scalarTypes.ToString) captured by
// the capture tooling kept outside this repository into tests/fixtures/usdviewPropertyView
// (FIXTURES.md). Tests never invoke native USD.
import { access,readFile } from 'node:fs/promises'
import {ResolvedPath} from 'typescript-usd/ar'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { HttpResolver,contextForResolver } from '../src/http-resolver'
import { propertyRows } from '../src/property-view'
import { primTree } from '../src/prim-tree'
import { primRowStyle, primLabel, propertyColor, propertyColors, qtDarker, primColors } from '../src/usdview-style'
import { pyFloat, frameFieldText, tfStream, cGeneral } from '../src/python-format'
import { inspectObject } from '../src/inspection'
import { CompositionReview } from '../src/composition-review'
import type { PrimSummary } from '../src/contracts'
import expected from './fixtures/usdviewPropertyView/expected.json' with { type: 'json' }

async function open() {
  const base = 'https://property-view.example/root.usda', root = new URL('./fixtures/usdviewPropertyView/assets/', import.meta.url)
  const fetcher: typeof fetch = async input => { try { return new Response(await readFile(new URL(new URL(String(input)).pathname.slice(1), root), 'utf8')) } catch { return new Response('', { status: 404 }) } }
  // Match the native filesystem capture's availability policy. The production
  // HTTP resolver intentionally resolves URLs without probing their contents.
  class FixtureResolver extends HttpResolver {
    override async resolve(path:string):Promise<ResolvedPath>{
      const url=this.createIdentifier(path)
      try{await access(new URL(new URL(url).pathname.slice(1),root));return new ResolvedPath(url)}
      catch{return new ResolvedPath()}
    }
  }
  return (await Stage.open(base, { resolverContext: contextForResolver(new FixtureResolver(base,undefined,fetcher)) }))!
}
const roles = { attribute: 'Attr', attributeWithConnections: 'Attr_', relationship: 'Rel', relationshipWithTargets: 'Rel_', computed: 'Cmp', computedMaterial: 'Rel_' }
describe('property view rows match native usdview', () => {
  for (const [key, nativeRows] of Object.entries(expected.propertyView)) it(key, async () => {
    const [path, frame] = key.split('@') as [string, string]
    const stage = await open()
    try {
      const rows = propertyRows(stage, path, Number(frame))
      expect(rows.map(row => row.name)).toEqual(nativeRows.map(row => row.name))
      rows.forEach((row, i) => {
        const native = nativeRows[i]!
        expect({ name: row.name, role: roles[row.role!], typeText: row.inherited ? '(i)' : '', value: row.value,
          color: [...propertyColor(row)], italic: !!row.interpolated, children: row.targets ?? [] })
          .toEqual({ name: native.name, role: native.role, typeText: native.typeText, value: native.value,
            color: native.nameColor, italic: native.nameFont.italic, children: native.children.map(child => child.name) })
        expect(native.valueColor).toEqual(native.nameColor)
        // Native's name font is BOLD unless interpolated (light italic).
        expect(native.nameFont.bold).toBe(!row.interpolated)
      })
    } finally { stage.dispose() }
  })
})

describe('Value tab text matches native AttributeValueEditor', () => {
  for (const [key, nativeRows] of Object.entries(expected.propertyView)) it(key, async () => {
    const [path, frame] = key.split('@') as [string, string]
    const stage = await open()
    try {
      for (const native of nativeRows) {
        const snapshot = inspectObject(stage, path, native.name, Number(frame), { arrayLimit: 8 })
        expect(snapshot, native.name).not.toBeNull()
        if ('array' in native.valueTab) {
          expect(snapshot!.array?.length, native.name).toBe(native.valueTab.length)
          expect(snapshot!.array!.entries.map(entry => entry.text), native.name).toEqual(native.valueTab.array)
        } else expect(snapshot!.valueText, native.name).toBe(native.valueTab.text)
      }
    } finally { stage.dispose() }
  })
})

describe('prim tree rows match native PrimViewItem', () => {
  const flatten = (node: PrimSummary, parentInvisible = false): [string, ReturnType<typeof primRowStyle>, PrimSummary][] => {
    const style = primRowStyle(node, parentInvisible)
    return [[node.path, style, node], ...node.children.flatMap(child => flatten(child, style.invisible))]
  }
  const check = (tree: PrimSummary, native: typeof expected.primTree['1.0']) => {
    const rows = flatten(tree)
    expect(rows.map(([path]) => path)).toEqual(Object.keys(native))
    for (const [path, style, prim] of rows) {
      const n = native[path as keyof typeof native]
      const font = style.font === 'bold' ? { weight: 700, italic: false } : style.font === 'italic' ? { weight: 300, italic: true } : { weight: 400, italic: false }
      expect({ path, text: primLabel(prim), type: prim.typeName, color: [...style.color], font, tooltip: style.tooltip.replaceAll('\n', '<br>'),
        vis: style.visText, visColor: [...style.visColor], visItalic: style.visInherited, guides: style.guidesText })
        .toEqual({ path, text: n.name.text, type: n.type.text, color: n.name.color, font: { weight: n.name.font!.weight, italic: n.name.font!.italic }, tooltip: n.name.tooltip,
          vis: n.vis.text, visColor: n.vis.color, visItalic: n.vis.font!.italic, guides: n.guides.text })
      if (n.guides.text) expect(n.guides.font!.italic).toBe(style.guidesDimmed)
    }
  }
  for (const [frame, native] of Object.entries(expected.primTree)) it(`at ${frame}`, async () => {
    const stage = await open()
    try { check(primTree(stage, Number(frame)), native) } finally { stage.dispose() }
  })
  it('toggles Vis and Guides on the session layer like primViewItem.toggleVis/toggleGuides', async () => {
    const stage = await open()
    try {
      const review = new CompositionReview(stage, () => 2)
      for (const [path, kind] of expected.toggled.toggles) await review.apply(kind === 'vis' ? { kind: 'visibility', path: path!, action: 'toggle' } : { kind: 'guides', path: path! }, async () => {})
      check(primTree(stage, 2), expected.toggled.primTree)
      const session: Record<string, { default: string | null }> = {}
      stage.getSessionLayer().traverse('/', path => {
        if (!path.includes('.')) return
        const spec = stage.getSessionLayer().getAttributeAtPath(path)
        if (spec) session[path] = { default: spec.hasDefaultValue() ? String(spec.getDefaultValue()) : null }
      })
      expect(session).toEqual(expected.toggled.session)
    } finally { stage.dispose() }
  })
})

describe('native colours and Python text', () => {
  it('derives Qt darker colours', () => {
    for (const [name, color] of Object.entries(expected.colors.primInactive)) expect([...qtDarker(primColors[({ HAS_ARCS: 'hasArcs', NORMAL: 'normal', INSTANCE: 'instance', PROTOTYPE: 'prototype' } as const)[name as 'NORMAL']], 150)]).toEqual(color)
    const sources = { FALLBACK: 'fallback', TIME_SAMPLE: 'timeSamples', DEFAULT: 'default', NONE: 'none', VALUE_CLIPS: 'valueClips', SPLINE: 'spline' } as const
    for (const [name, color] of Object.entries(expected.colors.property)) expect([...propertyColors[sources[name as 'NONE']]]).toEqual(color)
    for (const [name, color] of Object.entries(expected.colors.propertyInherited)) expect([...qtDarker(propertyColors[sources[name as 'NONE']], 115)]).toEqual(color)
    expect([...qtDarker(propertyColors.red, 115)]).toEqual(expected.colors.redInherited)
  })
  it('formats floats as Python str() and the frame field as round(frame, 2)', () => {
    for (const row of expected.pythonFloat) {
      // JSON imports lose the sign of -0.0.
      const value = row.str === '-0.0' ? -0 : row.value
      expect(pyFloat(value)).toBe(row.str); expect(frameFieldText(value)).toBe(row.frameField)
    }
  })
  it('streams Gf components like TfStreamDouble/TfStreamFloat/half', () => {
    for (const raw of expected.gfStream) {
      const row = { ...raw, value: raw.value.map((v, i) => v === 0 && raw.d.split(', ')[i]!.replace('(', '') === '-0' ? -0 : v) }
      expect(`(${row.value.map(v => tfStream(v)).join(', ')})`).toBe(row.d)
      expect(`(${row.value.map(v => tfStream(v, true)).join(', ')})`).toBe(row.f)
    }
    expect(cGeneral(0.0999755859375)).toBe('0.0999756')
  })
})
