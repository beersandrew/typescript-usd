// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/layerStateDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E6: SdfLayerStateDelegate — the upstream hook DCC undo systems build on.
// Mirrors pxr/usd/sdf/layerStateDelegate.h semantics: every layer carries a
// delegate (SdfSimpleLayerStateDelegate by default, dirty tracking only);
// _On* callbacks fire BEFORE the data changes so a recording delegate can
// capture the outgoing value and store an invertible edit. The undo test at
// the bottom is the app-side pattern: typescript-usd ships the hook, the stack is
// application code.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Layer, SdfLayerStateDelegateBase, ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver, type SdfLayerAccess, type SdfSpecType } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> { const name = assetPath.split('/').pop() ?? assetPath; return new ArResolvedPath(files[name] === undefined ? '' : assetPath) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0
def Xform "World"
{
    def Sphere "Ball"
    {
        double radius = 5
    }
}
`

// ---- A recording delegate (the app-side undo building block) ----

type Edit =
  | { kind: 'setField'; path: string; fieldName: string; value: unknown; oldValue: unknown }
  | { kind: 'setTimeSample'; path: string; time: number; value: unknown }
  | { kind: 'createSpec'; path: string; specType: SdfSpecType }
  | { kind: 'pushChild'; parentPath: string; fieldName: string; value: string }

class RecordingDelegate extends SdfLayerStateDelegateBase {
  edits: Edit[] = []
  layerEvents: (SdfLayerAccess | null)[] = []
  private _dirty = false

  protected override _isDirty(): boolean { return this._dirty }
  protected override _markCurrentStateAsClean(): void { this._dirty = false }
  protected override _markCurrentStateAsDirty(): void { this._dirty = true }

  protected override _onSetLayer(layer: SdfLayerAccess | null): void {
    this.layerEvents.push(layer)
  }

  protected override _onSetField(path: string, fieldName: string, value: unknown): void {
    // The callback runs BEFORE the write: the layer still holds the old value.
    const oldValue = this._getLayer()?.getField(path, fieldName)
    this.edits.push({ kind: 'setField', path, fieldName, value, oldValue })
    this._dirty = true
  }

  protected override _onSetTimeSample(path: string, time: number, value: unknown): void {
    this.edits.push({ kind: 'setTimeSample', path, time, value })
    this._dirty = true
  }

  protected override _onCreateSpec(path: string, specType: SdfSpecType): void {
    this.edits.push({ kind: 'createSpec', path, specType })
    this._dirty = true
  }

  protected override _onPushChild(parentPath: string, fieldName: string, value: string): void {
    this.edits.push({ kind: 'pushChild', parentPath, fieldName, value })
    this._dirty = true
  }
}

describe('SdfSimpleLayerStateDelegate (default dirty tracking)', () => {
  it('layers start clean; authoring dirties; markCurrentStateAsClean resets', () => {
    const layer = Layer.createAnonymous()
    expect(layer.isDirty()).toBe(false)
    layer.setAttrDefault('/World', 'radius', 3)
    expect(layer.isDirty()).toBe(true)
    layer.markCurrentStateAsClean()
    expect(layer.isDirty()).toBe(false)
    layer.setField('/World.radius', 'default', 4)
    expect(layer.isDirty()).toBe(true)
  })

  it('opened layers are clean; stage authoring dirties only the edit target', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getRootLayer().isDirty()).toBe(false)
    expect(stage.getSessionLayer().isDirty()).toBe(false)

    // Default edit target = root layer
    stage.definePrim('/World/Ball').attr('radius').set(9)
    expect(stage.getRootLayer().isDirty()).toBe(true)
    expect(stage.getSessionLayer().isDirty()).toBe(false)

    // Session-layer edits dirty only the session layer
    stage.getRootLayer().markCurrentStateAsClean()
    stage.setEditTarget(stage.getSessionLayer())
    stage.definePrim('/World/Ball').attr('radius').set(11)
    expect(stage.getSessionLayer().isDirty()).toBe(true)
    expect(stage.getRootLayer().isDirty()).toBe(false)
  })
})

describe('SdfLayerStateDelegateBase (recording)', () => {
  it('setStateDelegate wires the layer; callbacks see pre-write state', () => {
    const layer = Layer.createAnonymous()
    const recorder = new RecordingDelegate()
    layer.setStateDelegate(recorder)
    expect(recorder.layerEvents).toEqual([layer])
    expect(layer.getStateDelegate()).toBe(recorder)

    layer.setAttrDefault('/World.radius'.split('.')[0]!, 'radius', 3)
    layer.setAttrDefault('/World', 'radius', 7)

    const sets = recorder.edits.filter(e => e.kind === 'setField' && e.fieldName === 'default')
    expect(sets).toEqual([
      { kind: 'setField', path: '/World.radius', fieldName: 'default', value: 3, oldValue: undefined },
      { kind: 'setField', path: '/World.radius', fieldName: 'default', value: 7, oldValue: 3 },
    ])
  })

  it('records spec creation, children pushes, and time samples distinctly', () => {
    const layer = Layer.createAnonymous()
    const recorder = new RecordingDelegate()
    layer.setStateDelegate(recorder)

    layer.definePrimSpec('/World/Ball', 'Sphere')
    layer.setAttrTimeSample('/World/Ball', 'radius', 12, 4)

    expect(recorder.edits).toContainEqual({ kind: 'createSpec', path: '/World/Ball', specType: 'prim' })
    expect(recorder.edits).toContainEqual({ kind: 'createSpec', path: '/World/Ball.radius', specType: 'attribute' })
    expect(recorder.edits).toContainEqual({ kind: 'pushChild', parentPath: '/World', fieldName: 'primChildren', value: 'Ball' })
    expect(recorder.edits).toContainEqual({ kind: 'pushChild', parentPath: '/World/Ball', fieldName: 'properties', value: 'radius' })
    expect(recorder.edits).toContainEqual({ kind: 'setTimeSample', path: '/World/Ball.radius', time: 12, value: 4 })
    // Time samples do NOT additionally fire _OnSetField
    expect(recorder.edits.some(e => e.kind === 'setField' && e.fieldName === 'timeSamples')).toBe(false)
  })

  it('replacing the delegate detaches the old one', () => {
    const layer = Layer.createAnonymous()
    const first = new RecordingDelegate()
    layer.setStateDelegate(first)
    const second = new RecordingDelegate()
    layer.setStateDelegate(second)
    expect(first.layerEvents).toEqual([layer, null])
    expect(second.layerEvents).toEqual([layer])
  })
})

describe('undo built on the hook (the application pattern)', () => {
  it('inverting recorded session edits restores the composed value', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    const session = stage.getSessionLayer()
    const recorder = new RecordingDelegate()
    session.setStateDelegate(recorder)
    stage.setEditTarget(session)

    // Two edits to the same attribute
    stage.definePrim('/World/Ball').attr('radius').set(42)
    stage.definePrim('/World/Ball').attr('radius').set(64)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(64)

    // Undo = apply recorded inverses, newest first, then recompose
    const inverses = recorder.edits
      .filter((e): e is Extract<Edit, { kind: 'setField' }> =>
        e.kind === 'setField' && e.fieldName === 'default')
      .reverse()
    for (const edit of inverses) {
      session.setField(edit.path, edit.fieldName, edit.oldValue)
    }
    await stage.muteAndUnmuteLayers(['./unrelated.usda'], [])   // trigger recompose

    // Both opinions retracted: the file value composes again
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(5)
  })
})
