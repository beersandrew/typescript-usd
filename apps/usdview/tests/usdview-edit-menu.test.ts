// USD-semantics tests for the Edit menu, prim context menu and Stage Interpolation.
// Expected values: native OpenUSD 26.11.1 usdviewq code (AppController edit methods,
// _updateEditMenu, PrimViewItem.setLoaded, primContextMenuItems) captured by
// the capture tooling kept outside this repository into tests/fixtures/usdviewEditMenu
// (FIXTURES.md). Tests never invoke native USD.
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Imageable } from 'typescript-usd/usdGeom'
import type { PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { CompositionReview } from '../src/composition-review'
import { createHttpResolverContext } from '../src/http-resolver'
import { editMenuItems, primContextMenuItems, editStatusMessage, editCommand, type EditAction } from '../src/edit-menu'
import type { CompositionCommand } from '../src/composition-types'
import expected from './fixtures/usdviewEditMenu/expected.json' with { type: 'json' }

async function open() {
  const base = 'https://edit-menu.example/root.usda', root = new URL('./fixtures/usdviewEditMenu/assets/', import.meta.url)
  const fetcher: typeof fetch = async input => { try { return new Response(await readFile(new URL(new URL(String(input)).pathname.slice(1), root), 'utf8')) } catch { return new Response('', { status: 404 }) } }
  return (await Stage.open(base, { resolverContext: createHttpResolverContext(base, undefined, fetcher) }))!
}
const rebuild = async () => {}
const specifiers = { def: 'SpecifierDef', over: 'SpecifierOver', class: 'SpecifierClass' } as const
/** Mirrors the capture script's session() (FIXTURES.md): every session prim spec, sorted by path. */
function session(stage: Stage) {
  const layer = stage.getSessionLayer(), out: unknown[] = []
  const visit = (spec: SdfPrimSpec) => {
    const path = String(spec.getPath())
    const attributes = Object.fromEntries([...spec.getAttributes()].map(a => [a.getName(), {
      typeName: a.getTypeName()?.name, hasDefault: a.hasDefaultValue(),
      default: a.hasDefaultValue() ? String(a.getDefaultValue()) : null,
      timeSamples: layer.listTimeSamplesForPath(`${path}.${a.getName()}`).length }]))
    out.push({ path, specifier: specifiers[spec.getSpecifier()], active: spec.hasActive() ? spec.getActive() : null, attributes })
    for (const child of spec.getNameChildren()) visit(child)
  }
  for (const spec of layer.getRootPrims()) visit(spec)
  return out.sort((a, b) => String((a as {path:string}).path).localeCompare((b as {path:string}).path))
}
const sorted = (rows: {path:string}[]) => [...rows].sort((a, b) => a.path.localeCompare(b.path))
function composed(stage: Stage) {
  const rows: Record<string, unknown> = {}
  const visit = (path: string) => {
    const prim = stage.getPrim(path)!
    rows[path] = { active: prim.isActive, loaded: prim.isLoaded, visibility: prim.isA('Imageable') ? Imageable.computeVisibility(stage, path) : null }
    for (const child of stage.getAllChildPrimPaths(path)) visit(child)
  }
  for (const root of stage.getAllChildPrimPaths('/')) visit(root)
  return rows
}
const nativeEditActions: Record<string, EditAction> = {
  actionLoad: 'load', actionUnload: 'unload', actionActivate: 'activate', actionDeactivate: 'deactivate',
  actionMake_Visible: 'makeVisible', actionVis_Only: 'visOnly', actionMake_Invisible: 'makeInvisible',
  actionRemove_Session_Visibility: 'removeSessionVisibility' }
function editEnablement(review: CompositionReview, path: string) {
  const items = editMenuItems(review.editState(path === '/' ? null : path))
  return Object.fromEntries(Object.entries(nativeEditActions).map(([name, action]) => [name, items.find(item => item.action === action)!.enabled]))
}
const contextMenu = (review: CompositionReview, path: string) => primContextMenuItems(review.editState(path), null)
  .map(item => item === '---' ? item : { text: item.text, enabled: item.enabled })
const nativeMethods: Record<string, EditAction> = {
  visSelectedPrims: 'makeVisible', invisSelectedPrims: 'makeInvisible', visOnlySelectedPrims: 'visOnly',
  removeVisSelectedPrims: 'removeSessionVisibility', resetSessionVisibility: 'resetAllSessionVisibility',
  deactivateSelectedPrims: 'deactivate', activateSelectedPrims: 'activate', loadSelectedPrims: 'load', unloadSelectedPrims: 'unload' }

describe('usdview Edit menu (native 26.11.1 oracle)', () => {
  it('is captured from the pinned native build', () => { expect(expected.native).toBe('0.26.11') })
  it('enables Edit menu actions from the selection exactly as _updateEditMenu does', async () => {
    const stage = await open(), review = new CompositionReview(stage, () => undefined)
    try {
      expect(composed(stage)).toEqual(expected.initial.composed)
      for (const path of expected.selections) expect([path, editEnablement(review, path)]).toEqual([path, (expected.initial.editMenu as Record<string, unknown>)[path]])
    } finally { stage.dispose() }
  })
  it('builds the prim context menu with native labels, order and enablement', async () => {
    const stage = await open(), review = new CompositionReview(stage, () => undefined)
    try {
      for (const path of expected.selections.filter(p => p !== '/'))
        expect([path, contextMenu(review, path)]).toEqual([path, (expected.initial.contextMenu as Record<string, unknown>)[path]])
    } finally { stage.dispose() }
  })
  it('navigates to enclosing models and bound materials as appController does', async () => {
    const stage = await open(), review = new CompositionReview(stage, () => undefined)
    try {
      for (const path of expected.selections) {
        const state = review.editState(path === '/' ? null : path)
        expect([path, {
          enclosingModel: [state.enclosingModel || path],
          boundPreviewMaterial: state.boundPreviewMaterial ? [state.boundPreviewMaterial.path] : [],
          boundFullMaterial: state.boundFullMaterial ? [state.boundFullMaterial.path] : [],
        }]).toEqual([path, (expected.navigation as Record<string, unknown>)[path]])
      }
    } finally { stage.dispose() }
  })
  for (const [name, scenario] of Object.entries(expected.scenarios)) {
    it(`${name}: authors the native session layer and composed result`, async () => {
      const stage = await open(), review = new CompositionReview(stage, () => undefined)
      try {
        const messages: string[] = []
        let selection: string | null = null
        for (const step of scenario.steps) {
          const action = nativeMethods[step.method]!, path = step.path === '/' || !step.path ? null : step.path
          const state = review.editState(path)
          const command: CompositionCommand | string = editCommand(action, state)
          if (typeof command !== 'string') await review.apply(command, rebuild)
          messages.push(editStatusMessage(action, state))
          selection = action === 'deactivate' ? null : path
        }
        expect(messages).toEqual(scenario.messages)
        expect(selection ? [selection] : []).toEqual(scenario.selectionAfter)
        expect(session(stage)).toEqual(sorted(scenario.session))
        expect(composed(stage)).toEqual(scenario.composed)
        for (const [path, enablement] of Object.entries(scenario.editMenuAfter)) expect([path, editEnablement(review, path)]).toEqual([path, enablement])
        for (const [path, menu] of Object.entries(scenario.contextMenuAfter)) expect([path, contextMenu(review, path)]).toEqual([path, menu])
      } finally { stage.dispose() }
    })
  }
  it('switches Stage Interpolation between Held and Linear without authoring', async () => {
    const stage = await open(), review = new CompositionReview(stage, () => undefined)
    try {
      expect(review.editState(null).interpolation).toBe(expected.interpolation.default)
      for (const name of expected.interpolation.menu as ('Held' | 'Linear')[]) {
        await review.apply({ kind: 'interpolation', interpolation: name }, rebuild)
        expect(review.editState(null).interpolation).toBe(name)
        const attr = stage.getPrim('/World/Animated')!.getAttr('xformOp:translate')!
        const samples = expected.interpolation.samples[name]
        for (const [time, value] of Object.entries(samples)) expect(Array.from((attr.getValueAtTime(Number(time)) as { data: ArrayLike<number> }).data)).toEqual(value)
        expect(session(stage)).toEqual(expected.interpolation.sessionAfter[name])
      }
    } finally { stage.dispose() }
  })
  it('restores the previous interpolation when the renderer rejects the change', async () => {
    const stage = await open(), review = new CompositionReview(stage, () => undefined)
    try {
      await expect(review.apply({ kind: 'interpolation', interpolation: 'Held' }, async () => { throw new Error('GPU rejected') })).rejects.toThrow('GPU rejected')
      expect(review.editState(null).interpolation).toBe('Linear')
      await expect(review.apply({ kind: 'activation', path: '/World/Group/Model', active: false }, async () => { throw new Error('GPU rejected') })).rejects.toThrow('GPU rejected')
      expect(stage.getPrim('/World/Group/Model')!.isActive).toBe(true)
      expect(session(stage)).toEqual([])
    } finally { stage.dispose() }
  })
})
