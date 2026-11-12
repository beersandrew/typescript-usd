// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.cpp, pxr/usd/usd/prim.h,
//  pxr/usd/usd/stage.cpp, pxr/usd/usd/testenv/testUsdPayloads.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdPayloads.py (registered
// as testUsdPayloads; no testenv directory). Upstream runs every test method
// for both the usda and usdc formats; here each method is a describe.each
// over the same format list, and the long test_InstancesWithPayloads
// scenario is split into phases (each phase replays the preceding steps
// without asserting them) so one gap does not hide the others.
//
// API mapping:
//   - Usd.Stage.CreateInMemory(tag) is UsdStage::Open on a new anonymous
//     layer (stage.cpp:1189-1219); spelled Stage.open(Layer.createAnonymous).
//   - UsdPrim::Load/Unload forward straight to the stage
//     (pxr/usd/usd/prim.h:1953-1963); spelled stage.load/unload(prim.path).
//   - UsdPrim::HasPayload is the deprecated spelling of HasAuthoredPayloads
//     (prim.h); spelled hasAuthoredPayloads().
//   - UsdPrim::GetChild is GetStage()->GetPrimAtPath(path.AppendChild)
//     (prim.cpp:72-76); spelled stage.getPrim(child path).
//   - UsdPayloads::AddPayload / AddInternalPayload / SetPayloads /
//     ClearPayloads are UsdReferences addReference / addReference('') /
//     setReferences / clear on prim.getPayloads().
//   - Python's falsy expired UsdPrim is Prim.isValid() === false.
import { describe, expect, it } from 'vitest'
import { Layer, ListOp, Payload, PrimSpec, Reference, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Stage, type Prim } from 'typescript-usd/usd'

const allFormats = ['usda', 'usdc']

const createInMemory = (tag: string): Promise<Stage> => Stage.open(Layer.createAnonymous(tag))

// UsdPrim::Load / Unload (prim.h:1953-1963).
const load = (prim: Prim): Promise<void> => prim.getStage().load(prim.path)
const unload = (prim: Prim): Promise<void> => prim.getStage().unload(prim.path)

const childNames = (prim: Prim): string[] =>
  prim.getChildren().map(child => child.path.split('/').pop()!)
const childPaths = (prims: Prim[]): string[] => prims.map(prim => prim.path)

function payloadItems(
  value: unknown, field: 'prependedItems' | 'explicitItems',
): Payload[] {
  const items = (value as Record<string, unknown> | undefined)?.[field]
  return ((items ?? []) as { assetPath: string; primPath: string }[])
    .map(item => new Payload(item.assetPath, item.primPath))
}

// PayloadedScene (testUsdPayloads.py:15-114).
async function payloadedScene(fmt: string) {
  // Create payload1.fmt
  const payload1 = await createInMemory(`payload1.${fmt}`)
  payload1.definePrim('/Sad/Panda', 'Scope')

  // Create payload3.fmt
  const payload3 = await createInMemory(`payload3.${fmt}`)
  payload3.definePrim('/Garply/Qux', 'Scope')

  // Create payload2.fmt
  // Intentionally using the metadata API.
  const payload2 = await createInMemory(`payload2.${fmt}`)
  let p = payload2.definePrim('/Baz/Garply', 'Scope')
  const payloadListOp = ListOp.createExplicit([
    new Payload(payload3.getRootLayer().identifier, '/Garply')])
  p.setMetadata('payload', payloadListOp.toValue())

  // Create payload4.fmt
  const payload4 = await createInMemory(`payload4.${fmt}`)
  payload4.definePrim('/Corge/Waldo/Fred', 'Scope')

  // Create payload5.fmt
  const payload5 = await createInMemory(`payload5.${fmt}`)
  payload5.definePrim('/Bear/Market', 'Scope')

  // Create payload6.fmt
  const payload6 = await createInMemory(`payload6.${fmt}`)
  payload6.definePrim('/Adams/Onis', 'Scope')

  for (const payload of [payload1, payload2, payload3, payload4, payload5, payload6]) {
    await payload.flushChanges()
  }

  // Create the scene that references payload1 and payload2
  // Intentionally using the prim-payload API.
  const stage = await createInMemory(`scene.${fmt}`)
  p = stage.definePrim('/Sad', 'Scope')
  await p.getPayloads().addReference(payload1.getRootLayer().identifier, '/Sad')

  // Intentionally using the overloaded prim-payload API.
  p = stage.definePrim('/Foo/Baz', 'Scope')
  await p.getPayloads().addReference(payload2.getRootLayer().identifier, '/Baz')

  // Create a sub-root payload.
  p = stage.definePrim('/Bar', 'Scope')
  await p.getPayloads().addReference(payload4.getRootLayer().identifier, '/Corge/Waldo')

  // Create a list of payloads.
  p = stage.definePrim('/Grizzly', 'Scope')
  await p.getPayloads().setReferences([
    { assetPath: payload5.getRootLayer().identifier, primPath: '/Bear' },
    { assetPath: payload6.getRootLayer().identifier, primPath: '/Adams' }])

  stage.definePrim('/IntBase/IntContents', 'Scope')
  p = stage.definePrim('/IntPayload', 'Scope')
  await p.getPayloads().addReference('', '/IntBase')

  // Test expects initial state to be all unloaded.
  await stage.unload()

  return { stage, payload1, payload2, payload3, payload4, payload5, payload6 }
}

// InstancedAndPayloadedScene (testUsdPayloads.py:116-215).
async function instancedAndPayloadedScene(fmt: string) {
  const scene = await payloadedScene(fmt)
  const { stage, payload1, payload2, payload4, payload5, payload6 } = scene

  const sad = stage.getPrim('/Sad')!
  const sad1 = stage.definePrim('/Sad_1', 'Scope')
  await sad1.getPayloads().addReference(payload1.getRootLayer().identifier, '/Sad')
  sad.setInstanceable(true)
  sad1.setInstanceable(true)

  const baz = stage.getPrim('/Foo/Baz')!
  const baz1 = stage.definePrim('/Foo/Baz_1', 'Scope')
  await baz1.getPayloads().addReference(payload2.getRootLayer().identifier, '/Baz')
  baz.setInstanceable(true)
  baz1.setInstanceable(true)

  const bar = stage.getPrim('/Bar')!
  const bar1 = stage.definePrim('/Bar_1', 'Scope')
  await bar1.getPayloads().addReference(payload4.getRootLayer().identifier, '/Corge/Waldo')
  bar.setInstanceable(true)
  bar1.setInstanceable(true)

  // Declare /Baz/Garply as instanceable within the payload itself.
  payload2.getPrim('/Baz/Garply')!.setInstanceable(true)
  await payload2.flushChanges()

  const grizzly = stage.getPrim('/Grizzly')!
  const grizzly1 = stage.definePrim('/Grizzly_1', 'Scope')
  await grizzly1.getPayloads().setReferences([
    { assetPath: payload5.getRootLayer().identifier, primPath: '/Bear' },
    { assetPath: payload6.getRootLayer().identifier, primPath: '/Adams' }])
  grizzly.setInstanceable(true)
  grizzly1.setInstanceable(true)

  const intPayload = stage.getPrim('/IntPayload')!
  const intPayload1 = stage.definePrim('/IntPayload_1', 'Scope')
  await intPayload1.getPayloads().addReference('', '/IntBase')
  intPayload.setInstanceable(true)
  intPayload1.setInstanceable(true)
  await stage.flushChanges()

  // Test expects initial state to be all unloaded.
  await stage.unload()
  return scene
}

describe.each(allFormats)('test_InstancesWithPayloads (%s)', (fmt) => {
  const instancePairs = [
    ['/Sad', '/Sad_1'], ['/Bar', '/Bar_1'],
    ['/Grizzly', '/Grizzly_1'], ['/IntPayload', '/IntPayload_1'],
  ] as const

  it('initial state: every instance is loadable, unloaded and has no prototype', async () => {
    const p = await instancedAndPayloadedScene(fmt)

    expect(new Set(p.stage.findLoadable())).toEqual(new Set([
      '/Sad', '/Sad_1', '/Foo/Baz', '/Foo/Baz_1', '/Bar', '/Bar_1',
      '/Grizzly', '/Grizzly_1', '/IntPayload', '/IntPayload_1']))

    for (const [a, b] of instancePairs) {
      const prim = p.stage.getPrim(a)!
      const prim1 = p.stage.getPrim(b)!
      // All instances should report that they have payloads authored
      // directly on them, but have not yet been loaded.
      expect(prim.hasAuthoredPayloads()).toBe(true)
      expect(prim1.hasAuthoredPayloads()).toBe(true)
      expect(prim.isLoaded).toBe(false)
      expect(prim1.isLoaded).toBe(false)
    }
    for (const [a, b] of instancePairs) {
      // Since there is no composition arc to instanceable data (due to the
      // payloads not being loaded), these prims have no prototype.
      expect(p.stage.getPrim(a)!.getPrototype()).toBeUndefined()
      expect(p.stage.getPrim(b)!.getPrototype()).toBeUndefined()
    }
  })

  it('instances are independently loadable, each creating a prototype', async () => {
    const p = await instancedAndPayloadedScene(fmt)
    for (const [a, b] of instancePairs) {
      const prim = p.stage.getPrim(a)!
      const prim1 = p.stage.getPrim(b)!
      // Instances should be independently loadable. This should cause a
      // prototype to be created for the loaded prim.
      await load(prim)
      expect(prim.isLoaded).toBe(true)
      expect(prim1.isLoaded).toBe(false)
      expect(prim.getPrototype()).toBeDefined()
      expect(prim1.getPrototype()).toBeUndefined()
    }
  })

  it('prototypes report no loadable payload and carry the payload children', async () => {
    const p = await instancedAndPayloadedScene(fmt)
    for (const [a] of instancePairs) await load(p.stage.getPrim(a)!)

    // The prototype prim should not report that it has a loadable payload.
    // Its load state cannot be independently controlled.
    const expectedChildren: Record<string, string[]> = {
      '/Sad': ['Panda'],
      '/Bar': ['Fred'],
      '/Grizzly': ['Onis', 'Market'],
      '/IntPayload': ['IntContents'],
    }
    for (const [a] of instancePairs) {
      const prototype = p.stage.getPrim(a)!.getPrototype()!
      expect(prototype.hasAuthoredPayloads()).toBe(false)
      expect(p.stage.findLoadable()).not.toContain(prototype.path)
      expect(childNames(prototype)).toEqual(expectedChildren[a])
    }
  })

  it('loading the second instance shares the prototype; unloading both expires it', async () => {
    const p = await instancedAndPayloadedScene(fmt)
    for (const [a] of instancePairs) await load(p.stage.getPrim(a)!)

    for (const [a, b] of instancePairs) {
      const prim = p.stage.getPrim(a)!
      const prim1 = p.stage.getPrim(b)!
      const prototype = prim.getPrototype()!

      // Loading the second instance will cause Usd to assign it to the
      // first instance's prototype.
      await load(prim1)
      expect(prim1.getPrototype()?.path).toBe(prim.getPrototype()?.path)

      await unload(prim)
      await unload(prim1)
      expect(prim.isLoaded).toBe(false)
      expect(prim1.isLoaded).toBe(false)
      expect(prim.getPrototype()).toBeUndefined()
      expect(prim1.getPrototype()).toBeUndefined()
      expect(prototype.isValid()).toBe(false)
    }
  })

  it('loading an instanceable prim loads payloads nested in its prototype', async () => {
    const p = await instancedAndPayloadedScene(fmt)

    // Loading the payload for an instanceable prim will cause payloads
    // nested in descendants of that prim's prototype to be loaded as well.
    const baz = p.stage.getPrim('/Foo/Baz')!
    const baz1 = p.stage.getPrim('/Foo/Baz_1')!

    await load(baz)
    expect(baz.isLoaded).toBe(true)
    expect(baz.getPrototype()).toBeDefined()

    let prototype = baz.getPrototype()!
    expect(childNames(prototype)).toEqual(['Garply'])

    const garply = p.stage.getPrim(`${prototype.path}/Garply`)!
    expect(garply.hasAuthoredPayloads()).toBe(true)
    expect(garply.isLoaded).toBe(true)
    expect(garply.getPrototype()).toBeDefined()

    prototype = garply.getPrototype()!
    expect(childNames(prototype)).toEqual(['Qux'])

    await load(baz1)
    expect(baz1.getPrototype()?.path).toBe(baz.getPrototype()?.path)
  })

  it('prims in prototypes cannot be individually (un)loaded', async () => {
    const p = await instancedAndPayloadedScene(fmt)
    const baz = p.stage.getPrim('/Foo/Baz')!
    await load(baz)
    const garply = p.stage.getPrim(`${baz.getPrototype()!.path}/Garply`)!
    await expect(unload(garply)).rejects.toThrow()
  })
})

describe.each(allFormats)('test_Payloads (%s)', (fmt) => {
  // These assertions will be used several times.
  function assertBaseAssumptions(p: Awaited<ReturnType<typeof payloadedScene>>) {
    expect(p.stage.getPrim('/')!.hasAuthoredPayloads()).toBe(false)
    expect(p.stage.getPrim('/Sad')!.hasAuthoredPayloads()).toBe(true)
    expect(p.stage.getPrim('/Foo/Baz')!.hasAuthoredPayloads()).toBe(true)
    expect(p.stage.getPrim('/Grizzly')!.hasAuthoredPayloads()).toBe(true)
    expect(p.stage.getPrim('/IntPayload')!.hasAuthoredPayloads()).toBe(true)
    expect(payloadItems(p.stage.getPrim('/Foo/Baz')!.getMetadata('payload'), 'prependedItems'))
      .toEqual([new Payload(p.payload2.getRootLayer().identifier, '/Baz')])
    expect(payloadItems(p.stage.getPrim('/Sad')!.getMetadata('payload'), 'prependedItems'))
      .toEqual([new Payload(p.payload1.getRootLayer().identifier, '/Sad')])
    expect(payloadItems(p.stage.getPrim('/Grizzly')!.getMetadata('payload'), 'explicitItems'))
      .toEqual([
        new Payload(p.payload5.getRootLayer().identifier, '/Bear'),
        new Payload(p.payload6.getRootLayer().identifier, '/Adams')])
    expect(payloadItems(p.stage.getPrim('/IntPayload')!.getMetadata('payload'), 'prependedItems'))
      .toEqual([new Payload('', '/IntBase')])
  }

  it('base assumptions hold before load', async () => {
    const p = await payloadedScene(fmt)
    assertBaseAssumptions(p)
  })

  it('loaded payload contents report their own payloads', async () => {
    const p = await payloadedScene(fmt)
    // The following prims must be loaded to be reachable.
    await p.stage.load()
    expect(p.stage.getPrim('/Sad/Panda')!.hasAuthoredPayloads()).toBe(false)
    expect(p.stage.getPrim('/Foo/Baz/Garply')!.hasAuthoredPayloads()).toBe(true)
    expect(payloadItems(p.stage.getPrim('/Foo/Baz/Garply')!.getMetadata('payload'), 'explicitItems'))
      .toEqual([new Payload(p.payload3.getRootLayer().identifier, '/Garply')])
    expect(p.stage.getPrim('/Grizzly/Market')!.hasAuthoredPayloads()).toBe(false)
    expect(p.stage.getPrim('/Grizzly/Onis')!.hasAuthoredPayloads()).toBe(false)
    expect(p.stage.getPrim('/IntPayload/IntContents')!.hasAuthoredPayloads()).toBe(false)
  })

  it('base assumptions do not change with load state', async () => {
    const p = await payloadedScene(fmt)
    await p.stage.load()
    // We do not expect the previous assertions to change based on load state.
    assertBaseAssumptions(p)
    await p.stage.unload()
    assertBaseAssumptions(p)
  })
})

describe.each(allFormats)('test_ClearPayload (%s)', (fmt) => {
  async function loadedScene() {
    const p = await payloadedScene(fmt)
    await p.stage.load()
    // We expect these prims to survive the edits below, so hold handles to
    // them to verify this assumption.
    const prims = {
      sad: p.stage.getPrim('/Sad')!,
      baz: p.stage.getPrim('/Foo/Baz')!,
      grizzly: p.stage.getPrim('/Grizzly')!,
      intPayload: p.stage.getPrim('/IntPayload')!,
    }
    expect(prims.sad.hasAuthoredPayloads()).toBe(true)
    expect(prims.baz.hasAuthoredPayloads()).toBe(true)
    expect(prims.grizzly.hasAuthoredPayloads()).toBe(true)
    expect(prims.intPayload.hasAuthoredPayloads()).toBe(true)
    return { p, ...prims }
  }

  it('clearing the payload while the prim is unloaded leaves it loaded', async () => {
    const { p, sad } = await loadedScene()
    expect(sad.isLoaded).toBe(true)
    expect(sad.getMetadata('payload')).toBeTruthy()
    await p.stage.unload(sad.path)
    expect(sad.getMetadata('payload')).toBeTruthy()
    expect(sad.isLoaded).toBe(false)
    await sad.getPayloads().clear()
    expect(sad.hasAuthoredPayloads()).toBe(false)
    expect(sad.getMetadata('payload')).toBeUndefined()
    // Assert that it's loaded because anything without a payload is
    // considered loaded.
    expect(sad.isLoaded).toBe(true)
  })

  for (const name of ['baz', 'grizzly', 'intPayload'] as const) {
    it(`clearing the payload of loaded ${name} leaves it loaded`, async () => {
      const scene = await loadedScene()
      const prim = scene[name]
      expect(prim.isLoaded).toBe(true)
      expect(prim.getMetadata('payload')).toBeTruthy()
      await prim.getPayloads().clear()
      expect(prim.hasAuthoredPayloads()).toBe(false)
      expect(prim.getMetadata('payload')).toBeUndefined()
      // Again, assert that it's loaded because anything without a payload is
      // considered loaded.
      expect(prim.isLoaded).toBe(true)
    })
  }

  it('SetPayloads([]) authors an explicit empty payload list op', async () => {
    const { intPayload } = await loadedScene()
    await intPayload.getPayloads().clear()
    // Set the list of payloads to explicitly empty from cleared verifying
    // that it is indeed set to explicit.empty list op
    await intPayload.getPayloads().setReferences([])
    // XXX (upstream): HasAuthoredPayloads is false for an explicit empty
    // payload list op, unlike the other arcs' HasAuthored* queries.
    expect(intPayload.hasAuthoredPayloads()).toBe(false)
    const explicitEmpty = new ListOp<Payload>()
    explicitEmpty.clearAndMakeExplicit()
    expect(ListOp.fromValue<Payload>(intPayload.getMetadata('payload')).equals(explicitEmpty)).toBe(true)
  })
})

describe.each(allFormats)('test_Bug160419 (%s)', (fmt) => {
  it('a payload beneath a sub-root reference target is loaded on both paths', async () => {
    const payloadLayer = Layer.createAnonymous(`payload.${fmt}`)
    sdfCreatePrimInLayer(payloadLayer, '/Payload/Cube')

    const rootLayer = Layer.createAnonymous(`root.${fmt}`)
    let refPrim = PrimSpec.new(rootLayer, 'Ref', 'def')!
    refPrim = PrimSpec.new(refPrim, 'Child', 'def')!
    refPrim.getPayloadList().prepend(new Payload(payloadLayer.identifier, '/Payload'))

    const rootPrim = PrimSpec.new(rootLayer, 'Root', 'def')!
    rootPrim.getReferenceList().prepend(new Reference('', '/Ref/Child'))

    const stage = await Stage.open(rootLayer)
    expect(new Set(stage.getLoadSet())).toEqual(new Set(['/Ref/Child', '/Root']))
    expect(stage.getPrim('/Root')!.isLoaded).toBe(true)
    expect(stage.getPrim('/Ref/Child')!.isLoaded).toBe(true)
  })
})

describe.each(allFormats)('test_SubrootReferencePayloads (%s)', (fmt) => {
  // Tests the behavior of subroot references to prims with both direct and
  // ancestral payloads.
  async function setup() {
    // Layer1 prim /A
    const layer1 = Layer.createAnonymous(`layer1.${fmt}`)
    const primA = PrimSpec.new(layer1, 'A', 'def')!
    PrimSpec.new(primA, 'AChild', 'def')

    // Layer2, prims /B/C
    const layer2 = Layer.createAnonymous(`layer2.${fmt}`)
    const primB = PrimSpec.new(layer2, 'B', 'def')!
    PrimSpec.new(primB, 'BChild', 'def')
    const primC = PrimSpec.new(primB, 'C', 'def')!
    PrimSpec.new(primC, 'CChild', 'def')

    // Layer3, prim /D
    const layer3 = Layer.createAnonymous(`layer3.${fmt}`)
    const primD = PrimSpec.new(layer3, 'D', 'def')!
    PrimSpec.new(primD, 'DChild', 'def')

    // Root layer, prim /E
    const root = Layer.createAnonymous(`root.${fmt}`)
    const primE = PrimSpec.new(root, 'E', 'def')!
    PrimSpec.new(primE, 'EChild', 'def')

    // Prim /A has a payload to prim /B
    primA.getPayloadList().prepend(new Payload(layer2.identifier, '/B'))

    // Root prim /E has a subroot reference to /A/C which comes from /A's
    // reference to /B
    primE.getReferenceList().prepend(new Reference(layer1.identifier, '/A/C'))

    // Open the stage and get the root prim /E
    const stage = await Stage.open(root)
    return { stage, primC, layer3 }
  }

  it('an ancestral payload internal to a subroot reference is not loadable', async () => {
    const { stage } = await setup()
    const rootPrim = stage.getPrim('/E')!

    // Prim /E has no payloads for load/unload: the ancestral payload arc
    // from /A to /B brought in by the subroot reference does not mark /E's
    // prim index as having a payload.
    expect(rootPrim).toBeDefined()
    expect(rootPrim.hasAuthoredPayloads()).toBe(false)
    expect(rootPrim.isLoaded).toBe(true)

    // Verify the children come from root E and referenced C.
    expect(childPaths(rootPrim.getChildren())).toEqual(['/E/CChild', '/E/EChild'])
    expect(childPaths(stage.getPrim('/E')!.getAllChildren())).toEqual(['/E/CChild', '/E/EChild'])

    // Unload rootPrim /E and note that it can't be unloaded. Children and
    // load state stay the same.
    await stage.unload(rootPrim.path)
    expect(rootPrim.isLoaded).toBe(true)
    expect(childPaths(rootPrim.getChildren())).toEqual(['/E/CChild', '/E/EChild'])
    expect(childPaths(stage.getPrim('/E')!.getAllChildren())).toEqual(['/E/CChild', '/E/EChild'])
  })

  it('a direct payload on the subroot reference target makes the prim loadable', async () => {
    const { stage, primC, layer3 } = await setup()
    await stage.unload('/E')

    // Now add a payload from the prim /B/C in layer1 to the prim /D.
    primC.getPayloadList().prepend(new Payload(layer3.identifier, '/D'))
    await stage.flushChanges()

    // Root prim now DOES have a payload as the payload to /D from /B/C is a
    // direct payload of /B/C. /E now a payload and should not be loaded
    let rootPrim = stage.getPrim('/E')!
    expect(rootPrim).toBeDefined()
    expect(rootPrim.hasAuthoredPayloads()).toBe(true)
    expect(rootPrim.isLoaded).toBe(false)

    // Because /E is unloaded, GetChildren() returns empty, now
    // GetAllChildren still returns the CChild and EChild as this does not
    // unload the ancestral payload from the reference.
    expect(stage.getPrim('/E')).toBeDefined()
    expect(childPaths(stage.getPrim('/E')!.getChildren())).toEqual([])
    expect(childPaths(stage.getPrim('/E')!.getAllChildren())).toEqual(['/E/CChild', '/E/EChild'])

    // Now load /E. GetChildren() and GetAllChildren() return the same and
    // both lists now include the DChild from the extra payload.
    rootPrim = stage.getPrim('/E')!
    await stage.load(rootPrim.path)
    expect(rootPrim.isLoaded).toBe(true)
    expect(stage.getPrim('/E')).toBeDefined()
    expect(childPaths(stage.getPrim('/E')!.getChildren()))
      .toEqual(['/E/DChild', '/E/CChild', '/E/EChild'])
    expect(childPaths(stage.getPrim('/E')!.getAllChildren()))
      .toEqual(['/E/DChild', '/E/CChild', '/E/EChild'])
  })
})
