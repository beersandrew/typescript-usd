// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/layer.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Style guide rule 20: every surface member is tested against the core call
// it wraps. Each test reads the same thing through the surface and through
// the core and compares; expectations are the core's answers, so the surface
// cannot drift from the faithful port.
import { describe, expect, it } from 'vitest'
import { Stage as CoreStage, PrimAllPrimsPredicate, PrimDefaultPredicate, TraverseInstanceProxies, Notice as UsdNotice } from 'typescript-usd/usd'
import { Layer as CoreLayer } from 'typescript-usd/sdf'
import { Error as TfError, TfDiagnosticMgr } from 'typescript-usd/tf'
import { Mesh as UsdGeomMesh } from 'typescript-usd/usdGeom'
import {
  Attribute, ChangeBlock, EditContext, InitialLoadSet, Layer, Mesh, ObjectsChangedEvent, Prim,
  PrimFlagsPredicate, Specifier, Stage, UsdError,
} from 'typescript-usd'

const SOURCE = `#usda 1.0
(
    defaultPrim = "World"
    startTimeCode = 1
    endTimeCode = 10
    timeCodesPerSecond = 30
)

def Xform "World"
{
    def Mesh "Tri"
    {
        float3[] extent = [(0, 0, 0), (1, 1, 0)]
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        normal3f[] normals = [(0, 0, 1), (0, 0, 1), (0, 0, 1)]
        double radius = 2
        double radius.timeSamples = {
            1: 1,
            5: 5,
        }
        string label = "tri"
    }
    def Scope "Off" (
        active = false
    )
    {
    }
    over "Over"
    {
    }
    class "Class"
    {
    }
    def "Proto" (
        instanceable = true
        references = </Source>
    )
    {
    }
}

def "Source"
{
    def "Inner"
    {
    }
}
`

async function open(): Promise<{ stage: Stage; core: CoreStage }> {
  const layer = CoreLayer.createAnonymous('members.usda')
  layer.importFromString(SOURCE)
  const core = await CoreStage.open(layer)
  return { stage: Stage.fromCore(core), core }
}

const vec = (value: unknown) => Array.from(value as Iterable<unknown>, v => String(v))

describe('UsdError', () => {
  it('carries the posted Tf errors and the thrown cause', () => {
    const errors = [new TfError('posted')]
    const cause = new TypeError('thrown')
    const error = new UsdError('failed', { errors, cause })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('UsdError')
    expect(error.errors).toEqual(errors)
    expect(error.cause).toBe(cause)
    expect(new UsdError('x').errors).toEqual([])
  })
})

describe('Stage', () => {
  it('fromCore and core: one wrapper per core stage', async () => {
    const { stage, core } = await open()
    expect(Stage.fromCore(core)).toBe(stage)
    expect(stage.core).toBe(core)
  })

  it('open: UsdStage::Open of a path, URL and layer (core Stage.open)', async () => {
    const path = 'pxr/usd/usdGeom/tests/upstream/fixtures/testUsdGeomPointInstancer/CubeModel.usda'
    const core = (await CoreStage.open(path))!
    const stage = await Stage.open(path)
    expect([...stage.traverse()].map(p => p.path)).toEqual([...core.traverse()])
    const layer = Layer.createAnonymous('open.usda')
    layer.importFromString(SOURCE)
    expect((await Stage.open(layer)).rootLayer).toBe(layer)
  })

  it('open: a missing file throws UsdError with the posted errors (core returns undefined)', async () => {
    const mgr = TfDiagnosticMgr.GetInstance()
    mgr.setQuiet(true)
    try {
      expect(await CoreStage.open('surface-missing.usda')).toBeUndefined()
      const error = await Stage.open(new URL('file:///surface-missing.usda')).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(UsdError)
      expect((error as UsdError).errors.map(e => e.getCommentary())).toContain('Failed to open layer @/surface-missing.usda@')
    } finally {
      mgr.setQuiet(false)
    }
  })

  it('open: load "none" is loadPayloads false; mask is OpenMasked (core Stage.openMasked)', async () => {
    const layer = CoreLayer.createAnonymous('mask.usda')
    layer.importFromString(SOURCE)
    const masked = await Stage.open(Layer.fromCore(layer), { mask: ['/World/Tri'], load: InitialLoadSet.LoadNone })
    const core = await CoreStage.openMasked(layer, new (await import('typescript-usd/usd')).StagePopulationMask(['/World/Tri']), { loadPayloads: false })
    expect([...masked.traverse()].map(p => p.path)).toEqual([...core.traverse()])
    expect(masked.core.getLoadRules().getRules()).toEqual(core.getLoadRules().getRules())
  })

  it('open: an aborted signal throws its reason', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    await expect(Stage.open('anything.usda', { signal: controller.signal })).rejects.toThrow('stop')
  })

  it('createInMemory: core Stage.createNew', () => {
    const stage = Stage.createInMemory()
    expect(stage.rootLayer.isAnonymous).toBe(true)
    expect([...stage.traverse()]).toEqual([...CoreStage.createNew().traverse()])
  })

  it('rootLayer, sessionLayer, pseudoRoot, defaultPrim, time codes', async () => {
    const { stage, core } = await open()
    expect(stage.rootLayer.core).toBe(core.getRootLayer())
    expect(stage.sessionLayer.core).toBe(core.getSessionLayer())
    expect(stage.pseudoRoot.path).toBe(core.getPrim('/')!.path)
    expect(stage.defaultPrim?.path).toBe(core.getDefaultPrim()!.path)
    expect(stage.startTimeCode).toBe(core.startTimeCode)
    expect(stage.endTimeCode).toBe(core.endTimeCode)
    expect(stage.timeCodesPerSecond).toBe(core.timeCodesPerSecond)
  })

  it('prim: core getPrim, undefined for none', async () => {
    const { stage, core } = await open()
    expect(stage.prim('/World/Tri')?.path).toBe(core.getPrim('/World/Tri')!.path)
    expect(stage.prim('/Nope')).toBeUndefined()
    expect(core.getPrim('/Nope')).toBeUndefined()
  })

  it('traverse: core traverse with each predicate', async () => {
    const { stage, core } = await open()
    const paths = (options?: Parameters<Stage['traverse']>[0]) => [...stage.traverse(options)].map(p => p.path)
    expect(paths()).toEqual([...core.traverse()])
    expect(paths({ predicate: PrimFlagsPredicate.UsdPrimAllPrimsPredicate })).toEqual([...core.traverse(PrimAllPrimsPredicate)])
    expect(paths({ instanceProxies: true })).toEqual([...core.traverse(TraverseInstanceProxies(PrimDefaultPredicate))])
    expect(paths({ instanceProxies: true })).toContain('/World/Proto/Inner')
  })

  it('definePrim: core definePrim', async () => {
    const { stage, core } = await open()
    const prim = stage.definePrim('/World/New', 'Scope')
    expect(prim.typeName).toBe(core.getPrim('/World/New')!.typeName)
    expect(() => stage.definePrim('/World/Tri', 'Xform')).not.toThrow()
    expect(core.getPrim('/World/Tri')!.typeName).toBe('Xform')
  })

  it('editTarget, setEditTarget: core getEditTarget / setEditTarget', async () => {
    const { stage, core } = await open()
    expect(stage.editTarget?.core).toBe(core.getEditTarget().getLayer())
    stage.setEditTarget(stage.sessionLayer)
    expect(core.getEditTarget().getLayer()).toBe(core.getSessionLayer())
    expect(() => stage.setEditTarget(Layer.createAnonymous('elsewhere'))).toThrow(UsdError)
  })

  it('editContext and withEditTarget: core UsdEditContext', async () => {
    const { stage, core } = await open()
    const root = core.getEditTarget().getLayer()
    {
      using context = stage.editContext(stage.sessionLayer)
      expect(context).toBeInstanceOf(EditContext)
      expect(core.getEditTarget().getLayer()).toBe(core.getSessionLayer())
    }
    expect(core.getEditTarget().getLayer()).toBe(root)
    const seen = stage.withEditTarget(stage.sessionLayer, () => core.getEditTarget().getLayer())
    expect(seen).toBe(core.getSessionLayer())
    expect(core.getEditTarget().getLayer()).toBe(root)
    const context = stage.editContext(stage.sessionLayer)
    context.close()
    expect(core.getEditTarget().getLayer()).toBe(root)
  })

  it('changeBlock: core SdfChangeBlock batches notices; events are ObjectsChanged', async () => {
    const { stage, core } = await open()
    const coreNotices: string[][] = []
    const key = (await import('typescript-usd/tf')).Notice.Register(UsdNotice.ObjectsChanged,
      (n: UsdNotice.ObjectsChanged) => coreNotices.push([...n.getChangedInfoOnlyPaths()]), core)
    const events: ObjectsChangedEvent[] = []
    const controller = new AbortController()
    stage.addEventListener('objectschanged', event => events.push(event), { signal: controller.signal })
    const label = stage.prim('/World/Tri')!.attribute('label')!
    {
      using block = stage.changeBlock()
      expect(block).toBeInstanceOf(ChangeBlock)
      label.set('a')
      label.set('b')
      expect(events).toHaveLength(0)
    }
    expect(events).toHaveLength(1)
    stage.changeBlock(() => { label.set('c'); label.set('d') })
    expect(events).toHaveLength(2)
    const block = stage.changeBlock()
    label.set('e')
    block.close()
    expect(events).toHaveLength(3)
    expect(events.map(e => e.changedInfoOnlyPaths)).toEqual(coreNotices)
    expect(events.map(e => e.resyncedPaths)).toEqual(events.map(e => [...e.core.getResyncedPaths()]))
    controller.abort()
    label.set('f')
    expect(events).toHaveLength(3)
    key.revoke()
  })

  it('flatten, exportToString: core flatten(addSourceFileComment)', async () => {
    const { stage, core } = await open()
    expect(stage.flatten().exportToString()).toBe(core.flatten(true).exportToString())
    expect(stage.exportToString()).toBe(core.flatten(true).exportToString())
    expect(stage.exportToString({ addSourceFileComment: false })).toBe(core.flatten(false).exportToString())
  })

  it('export and save: core export / save, UsdError on false', async () => {
    const { stage } = await open()
    await expect(stage.save()).rejects.toThrow(UsdError) // anonymous root: core save() is false
    expect(await stage.core.save()).toBe(false)
    // An empty file name is not exported (sdf/layer.cpp:5237-5239); an
    // unknown extension is written in the layer's format (layer.cpp:5241-5257).
    await expect(stage.export('')).rejects.toThrow(UsdError)
    expect(await stage.core.export('')).toBe(false)
  })

  it('close: core dispose', async () => {
    const { stage, core } = await open()
    const prim = core.getPrim('/World')!
    stage.close()
    expect(prim.isValid()).toBe(false)
  })
})

describe('Prim', () => {
  it('fromCore, core, path, stage, typeName, specifier', async () => {
    const { stage, core } = await open()
    const corePrim = core.getPrim('/World/Tri')!
    const prim = Prim.fromCore(corePrim)!
    expect(Prim.fromCore(undefined)).toBeUndefined()
    expect(prim.core).toBe(corePrim)
    expect(prim.path).toBe(corePrim.path)
    expect(prim.stage).toBe(stage)
    expect(prim.typeName).toBe(corePrim.typeName)
    for (const path of ['/World', '/World/Over', '/World/Class']) {
      expect(stage.prim(path)!.specifier).toBe(core.getPrim(path)!.getSpecifier())
    }
    expect(stage.prim('/World/Class')!.specifier).toBe(Specifier.SdfSpecifierClass)
  })

  it('isActive, isLoaded, isDefined', async () => {
    const { stage, core } = await open()
    for (const path of ['/World/Tri', '/World/Off', '/World/Over']) {
      const prim = stage.prim(path)!, corePrim = core.getPrim(path)!
      expect([prim.isActive, prim.isLoaded, prim.isDefined]).toEqual([corePrim.isActive, corePrim.isLoaded, corePrim.isDefined])
    }
  })

  it('parent, children: core getParent / getChildren', async () => {
    const { stage, core } = await open()
    expect(stage.prim('/World/Tri')!.parent?.path).toBe(core.getPrim('/World/Tri')!.getParent()!.path)
    expect(stage.pseudoRoot.parent).toBeUndefined()
    expect([...stage.prim('/World')!.children].map(p => p.path)).toEqual(core.getPrim('/World')!.getChildren().map(p => p.path))
  })

  it('isA: core isA', async () => {
    const { stage, core } = await open()
    for (const type of ['Mesh', 'Gprim', 'Xform']) {
      expect(stage.prim('/World/Tri')!.isA(type)).toBe(core.getPrim('/World/Tri')!.isA(type))
    }
    expect(stage.prim('/World/Tri')!.isA('Gprim')).toBe(true)
  })

  it('attribute, hasAttribute, attributes: core getAttr / hasAttribute / getAttributes', async () => {
    const { stage, core } = await open()
    const prim = stage.prim('/World/Tri')!, corePrim = core.getPrim('/World/Tri')!
    expect(prim.attribute('radius')?.path).toBe(corePrim.getAttr('radius')!.getPath())
    expect(prim.attribute('nope')).toBeUndefined()
    expect(corePrim.getAttr('nope')?.isValid()).toBeFalsy()
    expect(prim.hasAttribute('radius')).toBe(corePrim.hasAttribute('radius'))
    expect(prim.hasAttribute('nope')).toBe(corePrim.hasAttribute('nope'))
    expect(prim.attributes.map(a => a.name)).toEqual(corePrim.getAttributes().map(a => a.name))
  })

  it('createAttribute: core createAttribute', async () => {
    const { stage, core } = await open()
    const attribute = stage.prim('/World/Tri')!.createAttribute('made', 'float', { variability: 'uniform' })
    const coreAttribute = core.getPrim('/World/Tri')!.getAttr('made')!
    expect(attribute.typeName).toBe(coreAttribute.typeName)
    expect(coreAttribute.getVariability()).toBe('uniform')
    expect(coreAttribute.isCustom()).toBe(true)
  })

  it('setActive: core setActive', async () => {
    const { stage, core } = await open()
    await stage.prim('/World/Off')!.setActive(true)
    expect(core.getPrim('/World/Off')!.isActive).toBe(true)
  })
})

describe('Attribute', () => {
  it('fromCore, core, name, path, typeName, prim', async () => {
    const { core } = await open()
    const coreAttribute = core.getPrim('/World/Tri')!.getAttr('points')!
    const attribute = Attribute.fromCore(coreAttribute)!
    expect(Attribute.fromCore(core.getPrim('/World/Tri')!.getAttr('nope'))).toBeUndefined()
    expect(attribute.core).toBe(coreAttribute)
    expect(attribute.name).toBe(coreAttribute.name)
    expect(attribute.path).toBe(coreAttribute.getPath())
    expect(attribute.typeName).toBe(coreAttribute.typeName)
    expect(attribute.prim?.path).toBe(coreAttribute.getPrim()!.path)
  })

  it('get: core getValueAtTime, VtArray as its cdata() typed array', async () => {
    const { stage, core } = await open()
    const coreAttribute = (name: string) => core.getPrim('/World/Tri')!.getAttr(name)!
    const prim = stage.prim('/World/Tri')!
    const points = prim.attribute('points')!.get()
    expect(points).toBeInstanceOf(Float32Array)
    expect(points).toEqual((coreAttribute('points').getValue() as { cdata(): unknown }).cdata())
    expect(prim.attribute('faceVertexIndices')!.get()).toBeInstanceOf(Int32Array)
    expect(prim.attribute('label')!.get()).toBe(coreAttribute('label').getValue())
    expect(prim.attribute('radius')!.get()).toBe(coreAttribute('radius').getValue())
    for (const time of [0, 1, 3, 5, 9]) {
      expect(prim.attribute('radius')!.get(time)).toBe(coreAttribute('radius').getValueAtTime(time))
    }
  })

  it('set: core set / setTimeSample; Iterables; UsdError on a type mismatch', async () => {
    const { stage, core } = await open()
    const points = stage.prim('/World/Tri')!.attribute('points')!
    const corePoints = core.getPrim('/World/Tri')!.getAttr('points')!
    points.set([[1, 2, 3]])
    expect(vec(corePoints.getValue())).toEqual(['(1, 2, 3)'])
    points.set(new Float32Array([4, 5, 6]))
    expect(vec(corePoints.getValue())).toEqual(['(4, 5, 6)'])
    points.set((function* () { yield [7, 8, 9] })(), 2)
    expect(vec(corePoints.getValueAtTime(2))).toEqual(['(7, 8, 9)'])
    expect(corePoints.getTimeSampleKeys()).toEqual([2])
    const error = (() => { try { points.set('bad' as never) } catch (e) { return e } })()
    expect(error).toBeInstanceOf(UsdError)
    expect((error as UsdError).cause).toBeInstanceOf(TfError)
  })

  it('timeSamples, hasAuthoredValue, valueMightBeTimeVarying, block', async () => {
    const { stage, core } = await open()
    const radius = stage.prim('/World/Tri')!.attribute('radius')!
    const coreRadius = core.getPrim('/World/Tri')!.getAttr('radius')!
    expect(radius.timeSamples).toEqual(coreRadius.getTimeSampleKeys())
    expect(radius.hasAuthoredValue).toBe(coreRadius.hasAuthoredValue())
    expect(radius.valueMightBeTimeVarying()).toBe(coreRadius.valueMightBeTimeVarying())
    radius.block()
    expect(coreRadius.getValue()).toBeUndefined()
    expect(radius.get()).toBeUndefined()
  })
})

describe('Layer', () => {
  it('fromCore, core, identifier, displayName, isAnonymous, exportToString', () => {
    const core = CoreLayer.createAnonymous('layer.usda')
    core.importFromString(SOURCE)
    const layer = Layer.fromCore(core)
    expect(Layer.fromCore(core)).toBe(layer)
    expect(layer.core).toBe(core)
    expect(layer.identifier).toBe(core.identifier)
    expect(layer.displayName).toBe(core.getDisplayName())
    expect(layer.isAnonymous).toBe(core.isAnonymous())
    expect(layer.exportToString()).toBe(core.exportToString())
  })

  it('createAnonymous, importFromString: core createAnonymous / importFromString, UsdError on a parse error', () => {
    const layer = Layer.createAnonymous('made')
    expect(layer.isAnonymous).toBe(true)
    layer.importFromString(SOURCE)
    const core = CoreLayer.createAnonymous('made')
    core.importFromString(SOURCE)
    expect(layer.exportToString()).toBe(core.exportToString())
    const mgr = TfDiagnosticMgr.GetInstance()
    mgr.setQuiet(true)
    try {
      const bad = '#usda 1.0\ndef "X" {'
      let coreError: unknown
      try { CoreLayer.createAnonymous('x').importFromString(bad) } catch (e) { coreError = e }
      const error = (() => { try { layer.importFromString(bad) } catch (e) { return e } })()
      expect(error).toBeInstanceOf(UsdError)
      expect(String((error as UsdError).cause)).toBe(String(coreError))
    } finally {
      mgr.setQuiet(false)
    }
  })

  it('save and export: core save / export, UsdError on false', async () => {
    const layer = Layer.createAnonymous('anon')
    await expect(layer.save()).rejects.toThrow(UsdError)
    expect(await layer.core.save()).toBe(false)
    // An empty file name is not exported (sdf/layer.cpp:5237-5239).
    await expect(layer.export('')).rejects.toThrow(UsdError)
    expect(await layer.core.export('')).toBe(false)
  })
})

describe('Mesh', () => {
  it('constructor, core, prim and the attribute properties: core UsdGeomMesh Get…Attr', async () => {
    const { stage, core } = await open()
    const prim = stage.prim('/World/Tri')!
    const mesh = new Mesh(prim)
    const coreMesh = new UsdGeomMesh(core.getPrim('/World/Tri')!, core)
    expect(mesh.core).toBeInstanceOf(UsdGeomMesh)
    expect(mesh.prim.path).toBe(coreMesh.prim.path)
    expect(mesh.points.path).toBe(coreMesh.getPointsAttr().getPath())
    expect(mesh.normals.path).toBe(coreMesh.getNormalsAttr().getPath())
    expect(mesh.extent.path).toBe(coreMesh.getExtentAttr().getPath())
    expect(mesh.faceVertexCounts.path).toBe(coreMesh.getFaceVertexCountsAttr().getPath())
    expect(mesh.faceVertexIndices.path).toBe(coreMesh.getFaceVertexIndicesAttr().getPath())
    expect(mesh.faceVertexCounts.get()).toEqual(new Int32Array([3]))
  })

  it('define: core UsdGeomMesh.define', () => {
    const stage = Stage.createInMemory()
    const mesh = Mesh.define(stage, '/Made')
    const core = CoreStage.createNew()
    expect(mesh.prim.typeName).toBe(UsdGeomMesh.define(core, '/Made').prim.typeName)
    expect(mesh.points.typeName).toBe('point3f[]')
  })
})
