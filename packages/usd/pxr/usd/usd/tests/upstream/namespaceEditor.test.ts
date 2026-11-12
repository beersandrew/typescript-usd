// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdNamespaceEditor.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/testenv/testUsdNamespaceEditor.py
// (registered as testUsdNamespaceEditor), with its testenv fixture
// directories basic/, composition_arcs/ and instancing/. The test runs with
// the testenv as the working directory, so relative identifiers name the
// fixtures.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Error as TfError, Notice as TfNotice } from 'typescript-usd/tf'
import {
  NamespaceEditor as UsdNamespaceEditor, Notice as UsdNotice, Stage, StagePopulationMask,
  type Prim,
} from 'typescript-usd/usd'
import { _setResolverForTest } from 'typescript-usd/usd/_internal'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdNamespaceEditor')

// Assign the Objects changed PrimResyncType enum to reduce namespace
// clutter in the test cases.
const PrimResyncType = UsdNotice.PrimResyncType
type PrimResyncType = UsdNotice.PrimResyncType
type ExpectedResyncs = Record<string, [PrimResyncType, string]>

// Python's refcounting releases a stage's layers when the test drops the
// stage, so the next Usd.Stage.Open reads the fixtures from disk again.
// Replacing the resolver clears the layer registry to the same effect.
function releaseLayers(): void {
  _setResolverForTest(ArGetResolver())
}

// Usd.Stage.Open(layer[, sessionLayer]).
function openLayer(layer: Layer, sessionLayer?: Layer): Promise<Stage> {
  return Stage.openMasked(layer, StagePopulationMask.all(),
    sessionLayer ? { sessionLayerPath: sessionLayer.identifier } : undefined)
}

// bool(prim)
function valid(prim: Prim | undefined): boolean {
  return prim !== undefined && prim.isValid()
}

// prim.GetChild(name)
function getChild(prim: Prim, name: string): Prim | undefined {
  return prim.getStage().getPrim(prim.path === '/' ? `/${name}` : `${prim.path}/${name}`)
}

// prim.GetPrimStack(), as layer identifier and spec path.
function primStack(prim: Prim): string[] {
  return prim.getStage().getPrimStack(prim.path).map(e => `@${e.layerIdentifier}@<${e.specPath}>`)
}

// [layer.GetPrimAtPath(path), ...]: a missing spec is None.
function specs(...pairs: Array<[Layer, string]>): Array<string | undefined> {
  return pairs.map(([layer, specPath]) =>
    layer.getPrimAtPath(specPath) ? `@${layer.identifier}@<${specPath}>` : undefined)
}

// Calls CanApplyEdits and ApplyEdits on the given editor and verifies both
// succeed. If expectedResyncNotices is provided, this also verifies that
// listening the ObjectsChanged notice will hold the expected resyncs of the
// expected resync types specified.
function applyEditWithVerification(editor: UsdNamespaceEditor, opts: {
  expectedResyncNotices?: ExpectedResyncs | undefined
  expectedLayersToEdit?: string[] | undefined
  expectedWarnings?: string[] | undefined
} = {}): void {
  const { expectedResyncNotices, expectedLayersToEdit, expectedWarnings = [] } = opts

  // receivedObjectsChanged is used for sanity checking that the notice
  // handler was indeed called as expected.
  let receivedObjectsChanged = false
  const receivedResyncs: Array<Record<string, [PrimResyncType, string]>> = []
  const onObjectsChanged = (notice: UsdNotice.ObjectsChanged): void => {
    receivedObjectsChanged = true
    if (expectedResyncNotices !== undefined) {
      // Convert the list of resynced paths from the notice into a
      // dictionary of the path (as string) to the prim resync type for
      // that path. This is what we verify against the expected resyncs
      // dictionary.
      const resyncedObjects: Record<string, [PrimResyncType, string]> = {}
      for (const resyncedPath of notice.getResyncedPaths().toArray()) {
        resyncedObjects[String(resyncedPath)] = notice.getPrimResyncType(resyncedPath)
      }
      receivedResyncs.push(resyncedObjects)
    }
  }

  // Register the ObjectsChange listener; we revoke it after applying the
  // edits
  const objectsChanged = TfNotice.registerGlobally(UsdNotice.ObjectsChanged, onObjectsChanged)

  try {
    // Verify CanApply, GetLayersToEdit, and Apply
    const result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)

    // Some warning messages are too long to check explicitly or include
    // specific data like layer identifiers, so we check if a substring of
    // the warning matches instead.
    expect(result.warnings.length, result.warnings.join('\n')).toBe(expectedWarnings.length)
    expectedWarnings.forEach((expectedWarn, i) => expect(result.warnings[i]).toContain(expectedWarn))
    if (expectedLayersToEdit) {
      const layersToEdit = editor.getLayersToEdit().map(layer => layer.getDisplayName())
      expect(layersToEdit).toEqual(expectedLayersToEdit)
    }
    expect(editor.applyEdits()).toBe(true)
    // Sanity check on the notice listener being called.
    expect(receivedObjectsChanged).toBe(true)
    for (const resyncedObjects of receivedResyncs) {
      expect(resyncedObjects).toEqual(expectedResyncNotices)
    }
  } finally {
    objectsChanged.revoke()
  }
}

// Verifies children, properties, and metadata of the prim named "A" when
// the basic test stage is loaded.
function verifyBasicStagePrimAValues(prim: Prim | undefined): void {
  expect(valid(prim)).toBe(true)
  prim = prim!
  expect(prim.typeName).toBe('PrimTypeA')
  expect(valid(getChild(prim, 'A_Root_Prim'))).toBe(true)
  expect(valid(getChild(prim, 'A_Sub1_Prim'))).toBe(false)
  expect(valid(getChild(prim, 'A_Sub2_Prim'))).toBe(false)
  expect(prim.getPropertyNames()).toEqual(['A_Root_Attr'])
  expect(prim.getMetadata('documentation')).toBe('Root')
  expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['A_Root_API'])
}

// Verifies children (other than "A"), properties, and metadata of the prim
// named "B" when the basic test stage is loaded. This function specifically
// doesn't check for a child named "A" so that this function can still
// used after namespace operations in the following tests that will move "A".
function verifyBasicStagePrimBValues(prim: Prim | undefined): void {
  expect(valid(prim)).toBe(true)
  prim = prim!
  expect(prim.typeName).toBe('PrimTypeB')
  expect(valid(getChild(prim, 'B_Root_Prim'))).toBe(true)
  expect(valid(getChild(prim, 'B_Sub1_Prim'))).toBe(true)
  expect(valid(getChild(prim, 'B_Sub2_Prim'))).toBe(false)
  expect(prim.getPropertyNames()).toEqual(['B_Root_Attr', 'B_Sub1_Attr'])
  expect(prim.getMetadata('documentation')).toBe('Root')
  expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['B_Root_API', 'B_Sub1_API'])
}

// Verifies children (other than "B"), properties, and metadata of the prim
// named "B" when the basic test stage is loaded. This function specifically
// doesn't check for a child named "B" so that this function can still
// used after namespace operations in the following tests that will move "B".
function verifyBasicStagePrimCValues(prim: Prim | undefined): void {
  expect(valid(prim)).toBe(true)
  prim = prim!
  expect(prim.typeName).toBe('PrimTypeC')
  expect(valid(getChild(prim, 'C_Root_Prim'))).toBe(true)
  expect(valid(getChild(prim, 'C_Sub1_Prim'))).toBe(true)
  expect(valid(getChild(prim, 'C_Sub2_Prim'))).toBe(true)
  expect(prim.getPropertyNames()).toEqual(['C_Root_Attr', 'C_Sub1_Attr', 'C_Sub2_Attr'])
  expect(prim.getMetadata('documentation')).toBe('Root')
  expect(prim.getPrimTypeInfo().getAppliedAPISchemas())
    .toEqual(['C_Root_API', 'C_Sub1_API', 'C_Sub2_API'])
}

// Verifies that the result is false and provides the expected messages.
function verifyFalseResult(result: { ok: boolean, errors: string[], warnings: string[] },
  expectedErrors: string[], expectedWarnings: string[] = []): void {
  expect(result.ok).toBe(false)
  expect(result.errors).toEqual(expectedErrors)

  // Some warning messages are too long to check explicitly or include
  // specific data like layer identifiers, so we check if a substring of
  // the warning matches instead.
  expect(result.warnings.length, result.warnings.join('\n')).toBe(expectedWarnings.length)
  expectedWarnings.forEach((expectedWarn, i) => expect(result.warnings[i]).toContain(expectedWarn))
}

interface BasicStage {
  stage: Stage
  rootLayer: Layer
  subLayer1: Layer
  subLayer2: Layer
  primA: Prim
  primB: Prim
  primC: Prim
}

// Setup function for many of the basic test cases. Loads the "basic" stage
// and gets and returns the needed layers and initial prims from this stage.
// Also verifies the initial state of the stage and its prims match the
// expected unedited state of the stage.
async function setupBasicStage(): Promise<BasicStage> {
  releaseLayers()
  // Open the root layer
  const stage = (await Stage.open('basic/root.usda'))!
  expect(stage).toBeTruthy()

  // Get the layers that the stage should have opened.
  const rootLayer = Layer.find('basic/root.usda')
  const subLayer1 = Layer.find('basic/sub_1.usda')
  const subLayer2 = Layer.find('basic/sub_2.usda')
  expect(rootLayer).toBeTruthy()
  expect(subLayer1).toBeTruthy()
  expect(subLayer2).toBeTruthy()

  // The stage defines three prims.
  const primA = stage.getPrim('/C/B/A')
  const primB = stage.getPrim('/C/B')
  const primC = stage.getPrim('/C')
  expect(valid(primA)).toBe(true)
  expect(valid(primB)).toBe(true)
  expect(valid(primC)).toBe(true)

  // Verify the expected data of these prims.
  verifyBasicStagePrimAValues(primA)
  verifyBasicStagePrimBValues(primB)
  verifyBasicStagePrimCValues(primC)

  // Assert the expected specs comprising these prims
  // /A is only defined in the root layer
  expect(primStack(primA!)).toEqual(specs([rootLayer!, '/C/B/A']))
  // /B is defined in the root and sub_1 layers
  expect(primStack(primB!)).toEqual(specs([rootLayer!, '/C/B'], [subLayer1!, '/C/B']))
  // /C is defined in the root and both sub layers
  expect(primStack(primC!)).toEqual(
    specs([rootLayer!, '/C'], [subLayer1!, '/C'], [subLayer2!, '/C']))

  return {
    stage, rootLayer: rootLayer!, subLayer1: subLayer1!, subLayer2: subLayer2!,
    primA: primA!, primB: primB!, primC: primC!,
  }
}

describe('testUsdNamespaceEditor', () => {
  let cwd: string
  let testenv: string
  beforeAll(() => {
    // The test writes runtime-session-layer.usda into its working
    // directory, so it runs in a scratch copy of the testenv.
    cwd = process.cwd()
    testenv = mkdtempSync(path.join(tmpdir(), 'testUsdNamespaceEditor-'))
    cpSync(TESTENV, testenv, { recursive: true })
    process.chdir(testenv)
  })
  afterAll(() => {
    process.chdir(cwd)
    rmSync(testenv, { recursive: true, force: true })
  })

  it('test_BasicDeletePrim', async () => {
    // Test basic USD prim deletion through the UsdNamespaceEditor API.

    // This function allows the same tests to be performed using DeletePrim
    // and DeletePrimAtPath.
    const testDeletePrim = async (useDeletePrimAtPath: boolean): Promise<void> => {
      // Open the basic stage and the expected layers and prims that we're
      // working with.
      let { stage, primA, primB, primC } = await setupBasicStage()

      const editor = new UsdNamespaceEditor(stage)

      // Delete "/C/B/A"
      expect(valid(primA)).toBe(true)
      if (useDeletePrimAtPath) {
        expect(editor.deletePrimAtPath('/C/B/A')).toBe(true)
      } else {
        expect(editor.deletePrim(primA)).toBe(true)
      }
      expect(valid(primA)).toBe(true)
      applyEditWithVerification(editor, {
        expectedResyncNotices: { '/C/B/A': [PrimResyncType.Delete, ''] },
        expectedLayersToEdit: ['root.usda'],
      })
      expect(valid(primA)).toBe(false)
      expect(valid(stage.getPrim('/C/B/A'))).toBe(false)

      // Delete "/C/B"
      expect(valid(primB)).toBe(true)
      if (useDeletePrimAtPath) {
        expect(editor.deletePrimAtPath('/C/B')).toBe(true)
      } else {
        expect(editor.deletePrim(primB)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: { '/C/B': [PrimResyncType.Delete, ''] },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda'],
      })
      expect(valid(primB)).toBe(false)
      expect(valid(stage.getPrim('/C/B'))).toBe(false)

      // Delete "/C"
      expect(valid(primC)).toBe(true)
      if (useDeletePrimAtPath) {
        expect(editor.deletePrimAtPath('/C')).toBe(true)
      } else {
        expect(editor.deletePrim(primC)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: { '/C': [PrimResyncType.Delete, ''] },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda', 'sub_2.usda'],
      })
      expect(valid(primC)).toBe(false)
      expect(valid(stage.getPrim('/C'))).toBe(false)

      // Reset the stage for the next case.
      await stage.reload()
      primC = stage.getPrim('/C')!
      primB = stage.getPrim('/C/B')!
      primA = stage.getPrim('/C/B/A')!
      expect(valid(primC)).toBe(true)
      expect(valid(primB)).toBe(true)
      expect(valid(primA)).toBe(true)

      // Delete "/C" again. It is deleted along with its children
      if (useDeletePrimAtPath) {
        expect(editor.deletePrimAtPath('/C')).toBe(true)
      } else {
        expect(editor.deletePrim(primC)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: { '/C': [PrimResyncType.Delete, ''] },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda', 'sub_2.usda'],
      })
      expect(valid(primC)).toBe(false)
      expect(valid(primB)).toBe(false)
      expect(valid(primA)).toBe(false)
      expect(valid(stage.getPrim('/C'))).toBe(false)
      expect(valid(stage.getPrim('/C/B'))).toBe(false)
      expect(valid(stage.getPrim('/C/B/A'))).toBe(false)
    }

    // Run delete tests using both DeletePrim and DeletePrimAtPath
    await testDeletePrim(false)
    await testDeletePrim(true)
  })

  it('test_BasicRenamePrim', async () => {
    // Test basic USD prim renaming through the UsdNamespaceEditor API.

    // This function allows the same tests to be performed using RenamePrim
    // and MovePrimAtPath.
    const testRenamePrim = async (useMovePrimAtPath: boolean): Promise<void> => {
      // Open the basic stage and the expected layers and prims that we're
      // working with.
      let { stage, rootLayer, subLayer1, subLayer2, primA, primB, primC } = await setupBasicStage()

      // Before rename, verify there are no prims at the paths we intend to
      // rename to.
      expect(valid(stage.getPrim('/C/B/NewA'))).toBe(false)
      expect(valid(stage.getPrim('/C/NewB'))).toBe(false)
      expect(valid(stage.getPrim('/NewC'))).toBe(false)

      const editor = new UsdNamespaceEditor(stage)

      // Rename "/C/B/A" to "/C/B/NewA"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B/A', '/C/B/NewA')).toBe(true)
      } else {
        expect(editor.renamePrim(primA, 'NewA')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B/A': [PrimResyncType.RenameSource, '/C/B/NewA'],
          '/C/B/NewA': [PrimResyncType.RenameDestination, '/C/B/A'],
        },
        expectedLayersToEdit: ['root.usda'],
      })
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/C/B/NewA')!
      verifyBasicStagePrimAValues(primA)

      // Assert the expected specs comprising NewA
      // /C/B/A is renamed to /C/B/NewA in the in only the root layer which
      // is the only layer where it was defined
      expect(primStack(primA)).toEqual(specs([rootLayer, '/C/B/NewA']))

      // Rename "/C/B" to "/C/NewB"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B', '/C/NewB')).toBe(true)
      } else {
        expect(editor.renamePrim(primB, 'NewB')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B': [PrimResyncType.RenameSource, '/C/NewB'],
          '/C/NewB': [PrimResyncType.RenameDestination, '/C/B'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda'],
      })
      expect(valid(primB)).toBe(false)
      primB = stage.getPrim('/C/NewB')!
      verifyBasicStagePrimBValues(primB)

      // Assert the expected specs comprising NewB
      // /C/B is renamed to /C/NewB in both the root and sub_1 layers where
      // it had specs defined.
      expect(primStack(primB)).toEqual(specs([rootLayer, '/C/NewB'], [subLayer1, '/C/NewB']))

      // NewA is still a child of /C/NewB after the rename of /C/B and its
      // spec in the root layer is moved to the new path.
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/C/NewB/NewA')!
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/C/NewB/NewA']))

      // Rename "/C" to "/NewC"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C', '/NewC')).toBe(true)
      } else {
        expect(editor.renamePrim(primC, 'NewC')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C': [PrimResyncType.RenameSource, '/NewC'],
          '/NewC': [PrimResyncType.RenameDestination, '/C'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda', 'sub_2.usda'],
      })
      expect(valid(primC)).toBe(false)
      primC = stage.getPrim('/NewC')!
      verifyBasicStagePrimCValues(primC)

      // Assert the expected specs comprising NewB
      // /C is renamed to /NewC in the root and both sublayers where
      // it had specs defined.
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/NewC'], [subLayer1, '/NewC'], [subLayer2, '/NewC']))

      // NewA and NewB are still descendants of /NewC after the rename of
      // /C and all their specs are moved to the new path.
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/NewC/NewB/NewA')!
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/NewC/NewB/NewA']))

      expect(valid(primB)).toBe(false)
      primB = stage.getPrim('/NewC/NewB')!
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(specs([rootLayer, '/NewC/NewB'], [subLayer1, '/NewC/NewB']))
    }

    // Run rename tests using both RenamePrim and RenamePrimAtPath
    await testRenamePrim(false)
    await testRenamePrim(true)
  })

  it('test_BasicReparentPrim', async () => {
    // Test basic USD prim reparenting through the UsdNamespaceEditor API
    // without renaming the prims.

    // This function allows the same tests to be performed using ReparentPrim
    // and MovePrimAtPath.
    const testReparentPrim = async (useMovePrimAtPath: boolean): Promise<void> => {
      // Open the basic stage and the expected layers and prims that we're
      // working with.
      let { stage, rootLayer, subLayer1, subLayer2, primA, primB, primC } = await setupBasicStage()

      // Before reparent, verify there are no prims at the paths we intend
      // to reparent to.
      expect(valid(stage.getPrim('/A'))).toBe(false)
      expect(valid(stage.getPrim('/A/B'))).toBe(false)
      expect(valid(stage.getPrim('/A/B/C'))).toBe(false)

      const editor = new UsdNamespaceEditor(stage)

      // Reparent "/C/B/A" to be "/A"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B/A', '/A')).toBe(true)
      } else {
        expect(editor.reparentPrim(primA, stage.getPrim('/')!)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B/A': [PrimResyncType.ReparentSource, '/A'],
          '/A': [PrimResyncType.ReparentDestination, '/C/B/A'],
        },
        expectedLayersToEdit: ['root.usda'],
      })
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/A')!
      verifyBasicStagePrimAValues(primA)

      // Assert the expected specs comprising the moved prims.
      // /C/B/A is moved to /A in the in the root layer only as that's the
      // only layer it was originally defined in.
      expect(primStack(primA)).toEqual(specs([rootLayer, '/A']))

      // Assert that primB and primC are still valid and their prim specs
      // have not been moved in the layers they are defined.
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(specs([rootLayer, '/C/B'], [subLayer1, '/C/B']))

      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Reparent "/C/B" to be "/A/B"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B', '/A/B')).toBe(true)
      } else {
        expect(editor.reparentPrim(primB, primA)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B': [PrimResyncType.ReparentSource, '/A/B'],
          '/A/B': [PrimResyncType.ReparentDestination, '/C/B'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda'],
      })
      expect(valid(primB)).toBe(false)
      primB = stage.getPrim('/A/B')!
      verifyBasicStagePrimBValues(primB)

      // Assert the expected specs comprising the moved prims.
      // /C/B is moved to /A/B in the in the root and sub_1 layers as those
      // are the layers where its original specs were defined.
      expect(primStack(primB)).toEqual(specs([rootLayer, '/A/B'], [subLayer1, '/A/B']))

      // Assert that primA is still valid but now has an additional prim
      // spec sub_1 which is needed as a parent for the moved /A/B spec.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/A'], [subLayer1, '/A']))

      // Assert that primC is still valid and has unchanged prim specs
      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Reparent "/C" to be "/A/B/C"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C', '/A/B/C')).toBe(true)
      } else {
        expect(editor.reparentPrim(primC, primB)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C': [PrimResyncType.ReparentSource, '/A/B/C'],
          '/A/B/C': [PrimResyncType.ReparentDestination, '/C'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda', 'sub_2.usda'],
      })
      expect(valid(primC)).toBe(false)
      primC = stage.getPrim('/A/B/C')!
      verifyBasicStagePrimCValues(primC)

      // Assert the expected specs comprising the moved prims.
      // /C is moved to /A/B/C in the root and both sub layers
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/A/B/C'], [subLayer1, '/A/B/C'], [subLayer2, '/A/B/C']))

      // Assert that primA is still valid but now has an additional prim
      // spec in both sublayers which is needed as a parent for the moved
      // /A/B and /A/B/C specs.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(
        specs([rootLayer, '/A'], [subLayer1, '/A'], [subLayer2, '/A']))

      // Assert that primB is still valid but now has an additional prim
      // spec in sub_2 which is needed as a parent for the moved
      // /A/B/C spec.
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(
        specs([rootLayer, '/A/B'], [subLayer1, '/A/B'], [subLayer2, '/A/B']))

      // Reverse the reparent operations. This is to verify the behavior
      // regarding the overs that were created to allow child specs to be
      // moved in all layers.

      // Reparent "/A/B/C" back to being "/C"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/A/B/C', '/C')).toBe(true)
      } else {
        expect(editor.reparentPrim(primC, stage.getPrim('/')!)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/A/B/C': [PrimResyncType.ReparentSource, '/C'],
          '/C': [PrimResyncType.ReparentDestination, '/A/B/C'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda', 'sub_2.usda'],
      })
      expect(valid(primC)).toBe(false)
      primC = stage.getPrim('/C')!
      verifyBasicStagePrimCValues(primC)

      // Assert the expected specs comprising /A/B/C
      // is moved back to /C in the root and both sub layers
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Assert that primA is still valid but now the "inert" prim spec in
      // sub_2 has been removed since it is no longer needed as an ancestor
      // for /A/B/C.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/A'], [subLayer1, '/A']))

      // Assert that primB is still valid but now the "inert" prim spec in
      // sub_2 has been removed since it is no longer needed as a parent
      // for /A/B/C.
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(specs([rootLayer, '/A/B'], [subLayer1, '/A/B']))

      // Reparent "/A/B" back to being "/C/B"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/A/B', '/C/B')).toBe(true)
      } else {
        expect(editor.reparentPrim(primB, primC)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/A/B': [PrimResyncType.ReparentSource, '/C/B'],
          '/C/B': [PrimResyncType.ReparentDestination, '/A/B'],
        },
        expectedLayersToEdit: ['root.usda', 'sub_1.usda'],
      })
      expect(valid(primB)).toBe(false)
      primB = stage.getPrim('/C/B')!
      verifyBasicStagePrimBValues(primB)

      // Assert the expected specs comprising
      // /A/B are moved back to /C/B in the in the root and sub_1 layers
      expect(primStack(primB)).toEqual(specs([rootLayer, '/C/B'], [subLayer1, '/C/B']))

      // Assert that primA is still valid but now the "inert" prim spec in
      // sub_1 has also been removed since it is no longer needed as an
      // ancestor for /A/B.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/A']))

      // Assert that primC is still valid and has unchanged prim specs
      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Reparent "/A" back to being "/C/B/A"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/A', '/C/B/A')).toBe(true)
      } else {
        expect(editor.reparentPrim(primA, primB)).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/A': [PrimResyncType.ReparentSource, '/C/B/A'],
          '/C/B/A': [PrimResyncType.ReparentDestination, '/A'],
        },
        expectedLayersToEdit: ['root.usda'],
      })
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/C/B/A')!
      verifyBasicStagePrimAValues(primA)

      // Assert the expected specs comprising
      // /A is moved back to /C/B/A in the in the root layer
      expect(primStack(primA)).toEqual(specs([rootLayer, '/C/B/A']))

      // Verify that primB and primC are still valid and have unchanged
      // prim specs
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(specs([rootLayer, '/C/B'], [subLayer1, '/C/B']))

      // Assert that primC is still valid and has unchanged prim specs
      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))
    }

    // Run reparent tests using both ReparentPrim and MovePrimAtPath
    await testReparentPrim(false)
    await testReparentPrim(true)
  })

  it('test_BasicReparentAndRenamePrim', async () => {
    // Test basic USD prim reparenting through the UsdNamespaceEditor API
    // using the overload that renames the prim as well.

    // This function allows the same tests to be performed using ReparentPrim
    // and MovePrimAtPath.
    const testReparentAndRenamePrim = async (useMovePrimAtPath: boolean): Promise<void> => {
      // Open the basic stage and the expected layers and prims that we're
      // working with.
      let { stage, rootLayer, subLayer1, subLayer2, primA, primB, primC } = await setupBasicStage()

      // Before rename, verify there are no prims at the paths we intend to
      // reparent to.
      expect(valid(stage.getPrim('/NewA'))).toBe(false)
      expect(valid(stage.getPrim('/NewA/NewB'))).toBe(false)
      expect(valid(stage.getPrim('/NewA/NewB/NewC'))).toBe(false)

      const editor = new UsdNamespaceEditor(stage)

      // Reparent and rename "/C/B/A" to be "/NewA"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B/A', '/NewA')).toBe(true)
      } else {
        expect(editor.reparentPrim(primA, stage.getPrim('/')!, 'NewA')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B/A': [PrimResyncType.RenameAndReparentSource, '/NewA'],
          '/NewA': [PrimResyncType.RenameAndReparentDestination, '/C/B/A'],
        },
      })
      expect(valid(primA)).toBe(false)
      primA = stage.getPrim('/NewA')!
      verifyBasicStagePrimAValues(primA)

      // Assert the expected specs comprising the moved prims.
      // /C/B/A is moved to /NewA in the in the root layer only as that's
      // the only layer it was originally defined in.
      expect(primStack(primA)).toEqual(specs([rootLayer, '/NewA']))

      // Assert that primB and primC are still valid and their prim specs
      // have not been moved in the layers they are defined.
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(specs([rootLayer, '/C/B'], [subLayer1, '/C/B']))

      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Reparent and rename "/C/B" to be "/NewA/NewB"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C/B', '/NewA/NewB')).toBe(true)
      } else {
        expect(editor.reparentPrim(primB, primA, 'NewB')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C/B': [PrimResyncType.RenameAndReparentSource, '/NewA/NewB'],
          '/NewA/NewB': [PrimResyncType.RenameAndReparentDestination, '/C/B'],
        },
      })
      expect(valid(primB)).toBe(false)
      primB = stage.getPrim('/NewA/NewB')!
      verifyBasicStagePrimBValues(primB)

      // Assert the expected specs comprising the moved prims.
      // /C/B is moved to /NewA/NewB in the in the root and sub_1 layers as
      // those are the layers where its original specs were defined.
      expect(primStack(primB)).toEqual(specs([rootLayer, '/NewA/NewB'], [subLayer1, '/NewA/NewB']))

      // Assert that primA is still valid but now has an additional prim
      // spec sub_1 which is needed as a parent for the moved /NewA/NewB
      // spec.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(specs([rootLayer, '/NewA'], [subLayer1, '/NewA']))

      // Assert that primC is still valid and has unchanged prim specs
      verifyBasicStagePrimCValues(primC)
      expect(primStack(primC)).toEqual(
        specs([rootLayer, '/C'], [subLayer1, '/C'], [subLayer2, '/C']))

      // Reparent and rename "/C" to be "/NewA/NewB/NewC"
      if (useMovePrimAtPath) {
        expect(editor.movePrimAtPath('/C', '/NewA/NewB/NewC')).toBe(true)
      } else {
        expect(editor.reparentPrim(primC, primB, 'NewC')).toBe(true)
      }
      applyEditWithVerification(editor, {
        expectedResyncNotices: {
          '/C': [PrimResyncType.RenameAndReparentSource, '/NewA/NewB/NewC'],
          '/NewA/NewB/NewC': [PrimResyncType.RenameAndReparentDestination, '/C'],
        },
      })
      expect(valid(primC)).toBe(false)
      primC = stage.getPrim('/NewA/NewB/NewC')!
      verifyBasicStagePrimCValues(primC)

      // Assert the expected specs comprising these prims
      // /C is moved to /NewA/NewB/NewC in the root and both sub layers
      expect(primStack(primC)).toEqual(specs([rootLayer, '/NewA/NewB/NewC'],
        [subLayer1, '/NewA/NewB/NewC'], [subLayer2, '/NewA/NewB/NewC']))

      // Assert that primA is still valid but now has an additional prim
      // spec in both sublayers which is needed as a parent for the moved
      // /NewA/NewB and /NewA/NewB/NewC specs.
      verifyBasicStagePrimAValues(primA)
      expect(primStack(primA)).toEqual(
        specs([rootLayer, '/NewA'], [subLayer1, '/NewA'], [subLayer2, '/NewA']))

      // Assert that primB is still valid but now has an additional prim
      // spec in both sub_2 which is needed as a parent for the moved
      // /NewA/NewB/NewC spec.
      verifyBasicStagePrimBValues(primB)
      expect(primStack(primB)).toEqual(
        specs([rootLayer, '/NewA/NewB'], [subLayer1, '/NewA/NewB'], [subLayer2, '/NewA/NewB']))
    }

    // Run reparent and rename tests using both ReparentPrim and
    // MovePrimAtPath
    await testReparentAndRenamePrim(false)
    await testReparentAndRenamePrim(true)
  })

  it('test_BasicCanEditPrim', async () => {
    // Tests the basic usage of the CanApplyEdits in cases where namespace
    // editing should fail. Also tests that calling ApplyEdits in cases where
    // CanApplyEdits returns false will not change any layer content.

    // Load the basic stage and get its layers and prims
    let { stage, rootLayer, subLayer1, subLayer2, primA, primB, primC } = await setupBasicStage()

    const editor = new UsdNamespaceEditor(stage)

    // Helper to verify that none of the stage's layers have changed after
    // an expected failed edit.
    const verifyNoLayersHaveChanged = (): void => {
      expect(rootLayer.isDirty()).toBe(false)
      expect(subLayer1.isDirty()).toBe(false)
      expect(subLayer2.isDirty()).toBe(false)
    }

    // Helper to verify that CanApplyEdits returns false with the expected
    // message and that ApplyEdits fails and doesn't edit any layers.
    const verifyCannotApplyEdits = (expectedErrors: string[], expectedWarnings: string[] = []): void => {
      verifyFalseResult(editor.canApplyEdits(), expectedErrors, expectedWarnings)
      expect(() => editor.getLayersToEdit()).toThrow(TfError)
      expect(() => editor.applyEdits()).toThrow(TfError)
      verifyNoLayersHaveChanged()
    }

    // Helpers to verify that a valid edit operation (of the function's
    // particular type) can be added but cannot be applied to the editor's
    // stage for the expected reason.
    const verifyCannotApplyDeletePrim = (
      prim: Prim, expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.deletePrim(prim)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    const verifyCannotApplyRenamePrim = (
      prim: Prim, newName: string, expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.renamePrim(prim, newName)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    const verifyCannotApplyReparentPrim = (
      prim: Prim, newParent: Prim, expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.reparentPrim(prim, newParent)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    const verifyCannotApplyReparentAndRenamePrim = (prim: Prim, newParent: Prim, newName: string,
      expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.reparentPrim(prim, newParent, newName)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    const verifyCannotApplyDeletePrimAtPath = (
      primPath: string, expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.deletePrimAtPath(primPath)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    const verifyCannotApplyMovePrimAtPath = (primPath: string, newPath: string,
      expectedErrors: string[], expectedWarnings: string[] = []): void => {
      expect(editor.movePrimAtPath(primPath, newPath)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)
    }

    // First verify we can't apply edits if we haven't added any yet.
    verifyCannotApplyEdits(['There are no valid edits to perform'])

    // Test invalid edit operations that can't even be added because they
    // do not produce valid absolute prim paths.

    // Test valid SdfPaths that are not absolute prim paths. These non-prim
    // paths will emit a coding error if provided to any of the add prim
    // edit at path functions.
    const invalidPrimPaths = [
      '/C.C_Root_Attr', // property
      '/C{x=y}', // variant selection
      '/C{x=y}B', // prim path with ancestor variant selection
      '/', // pseudo-root
      'C', // relative prim path
      '.', // relative prim path
      '..', // relative prim path
      '../B', // relative prim path
      '.C_Root_Attr', // relative property path
      '/C/B.B_Rel[/Foo].attr', // target path
    ]
    for (const pathString of invalidPrimPaths) {
      // Verify it is a valid SdfPath
      const primPath = SdfPath.fromString(pathString)
      expect(primPath.isEmpty(), pathString).toBe(false)

      // Cannot use path for delete.
      expect(() => editor.deletePrimAtPath(primPath)).toThrow(TfError)
      // Cannot use path for source or destination of move
      expect(() => editor.movePrimAtPath(primPath, '/Foo')).toThrow(TfError)
      expect(() => editor.movePrimAtPath('/C', primPath)).toThrow(TfError)
    }

    // Test fully invalid SdfPaths that will also emit a coding error if
    //provided to any of the add prim edit at path functions.
    const invalidPaths = [
      '',
      '//A',
      '123',
      '$',
      '/Foo:Bar',
      '/.foo',
    ]
    for (const pathString of invalidPaths) {
      // Verify it is a valid SdfPath
      const primPath = SdfPath.fromString(pathString)
      expect(primPath.isEmpty(), pathString).toBe(true)

      // Cannot use path for delete.
      expect(() => editor.deletePrimAtPath(primPath)).toThrow(TfError)
      // Cannot use path for source or destination of move
      expect(() => editor.movePrimAtPath(primPath, '/Foo')).toThrow(TfError)
      expect(() => editor.movePrimAtPath('/C', primPath)).toThrow(TfError)
    }

    // GetPrimAtPath('/A') does not return a valid prim. We cannot add edits for
    // this invalid prim.
    let invalidPrim = stage.getPrim('/Bogus') as Prim
    expect(valid(invalidPrim)).toBe(false)
    expect(() => editor.deletePrim(invalidPrim)).toThrow(TfError)
    expect(() => editor.renamePrim(invalidPrim, 'NewA')).toThrow(TfError)
    expect(() => editor.reparentPrim(invalidPrim, primC)).toThrow(TfError)
    expect(() => editor.reparentPrim(primC, invalidPrim)).toThrow(TfError)

    // We cannot add edits for the empty prim.
    // (Usd.Prim(): typescript-usd has no default-constructed prim handle; an absent
    // prim is undefined.)
    invalidPrim = undefined as unknown as Prim
    expect(valid(invalidPrim)).toBe(false)
    expect(() => editor.deletePrim(invalidPrim)).toThrow(TfError)
    expect(() => editor.renamePrim(invalidPrim, 'NewA')).toThrow(TfError)
    expect(() => editor.reparentPrim(invalidPrim, primC)).toThrow(TfError)
    expect(() => editor.reparentPrim(primC, invalidPrim)).toThrow(TfError)

    // We cannot add rename edits with invalid prim names.

    // Empty name
    expect(() => editor.renamePrim(primA, '')).toThrow(TfError)
    // Invalid prim name
    expect(() => editor.renamePrim(primA, '/A')).toThrow(TfError)
    expect(() => editor.renamePrim(primA, 'C.foo')).toThrow(TfError)
    expect(() => editor.renamePrim(primA, 'C{x=y}')).toThrow(TfError)

    // We cannot add reparent edits with a new name that isn't a valid prim name.

    // Empty name when reparenting with a new name
    expect(() => editor.reparentPrim(primA, primC, '')).toThrow(TfError)
    // Invalid prim name when reparenting with a new name
    expect(() => editor.reparentPrim(primA, primC, '/A')).toThrow(TfError)
    expect(() => editor.reparentPrim(primA, primC, 'C.foo')).toThrow(TfError)
    expect(() => editor.reparentPrim(primA, primC, 'C{x=y}')).toThrow(TfError)

    // At this point we've only failed to add any edits so we still cannot apply
    // edits since there are no edits to perform
    verifyCannotApplyEdits(['There are no valid edits to perform'])

    // /A is not a prim on the stage. We cannot edit a prim at this path.
    verifyCannotApplyDeletePrimAtPath('/A', ['The prim to edit is not a valid prim'])
    verifyCannotApplyMovePrimAtPath('/A', '/NewA', ['The prim to edit is not a valid prim'])
    verifyCannotApplyMovePrimAtPath('/A', '/C/A', ['The prim to edit is not a valid prim'])

    // Renames fail when an object already exists at the renamed path.
    verifyCannotApplyRenamePrim(primB, 'C_Root_Prim', ['An object already exists at the new path'])
    verifyCannotApplyMovePrimAtPath('/C/B', '/C/C_Root_Prim', ['An object already exists at the new path'])

    verifyCannotApplyRenamePrim(primA, 'B_Sub1_Prim', ['An object already exists at the new path'])
    verifyCannotApplyMovePrimAtPath('/C/B/A', '/C/B/B_Sub1_Prim', ['An object already exists at the new path'])

    verifyCannotApplyRenamePrim(primC, 'C', ['An object already exists at the new path'])
    verifyCannotApplyMovePrimAtPath('/C', '/C', ['An object already exists at the new path'])

    // Test invalid reparent destinations.

    // New parent prim does not exist
    expect(() => editor.reparentPrim(primA, stage.getPrim('/D') as Prim)).toThrow(TfError)
    verifyCannotApplyMovePrimAtPath('/C/B/A', '/D/A', ['The new parent prim is not a valid prim'])

    // New parent prim is the prim itself
    verifyCannotApplyReparentPrim(primA, primA, ['The new parent prim is the same as the prim to move'])
    verifyCannotApplyMovePrimAtPath('/C/B/A', '/C/B/A/A', ['The new parent prim is the same as the prim to move'])

    // New parent prim is a descendant of the prim itself
    verifyCannotApplyReparentPrim(primB, primA, ['The new parent prim is a descendant of the prim to move'])
    verifyCannotApplyMovePrimAtPath('/C/B', '/C/B/A/B', ['The new parent prim is a descendant of the prim to move'])

    // Reparents fail when an object already exists at the reparented path.
    // These reparent cases rename the prim to cause the path collision.
    verifyCannotApplyReparentAndRenamePrim(primA, primB, 'B_Root_Prim',
      ['An object already exists at the new path'])
    verifyCannotApplyMovePrimAtPath('/C/B/A', '/C/B/B_Root_Prim', ['An object already exists at the new path'])
    verifyCannotApplyReparentAndRenamePrim(primA, primC, 'C_Sub1_Prim',
      ['An object already exists at the new path'])
    verifyCannotApplyMovePrimAtPath('/C/B/A', '/C/C_Sub1_Prim', ['An object already exists at the new path'])

    // Open one of the sublayers as a stage to test that the stage of the
    // prim doesn't matter when adding edits.
    const subLayerStage = await openLayer(subLayer1)
    // Create another namespace editor for the sublayer stage.
    const subLayerEditor = new UsdNamespaceEditor(subLayerStage)
    // The sublayer stage has a prim at /C but does not have a prim at /C/B/A
    // unlike the root stage.
    expect(valid(subLayerStage.getPrim('/C'))).toBe(true)
    expect(valid(subLayerStage.getPrim('/C/B/A'))).toBe(false)

    // It's valid to add reparent operations to both editors using UsdPrims
    // from either stage as we only use the prims to determine the paths to objects
    // to edit, not to determine the objects themselves.
    expect(editor.reparentPrim(stage.getPrim('/C/B/A')!, subLayerStage.getPrim('/C')!)).toBe(true)
    expect(subLayerEditor.reparentPrim(stage.getPrim('/C/B/A')!, subLayerStage.getPrim('/C')!)).toBe(true)
    // But only the root stage can apply this reparent edit as /C/B/A is only a valid
    // prim on the root stage and not on the sublayer stage.
    expect(editor.canApplyEdits().ok).toBe(true)
    verifyFalseResult(subLayerEditor.canApplyEdits(), ['The prim to edit is not a valid prim'])

    // Make sublayer1 uneditable. Prims /C and /C/B cannot be edited because
    // they have specs on sublayer1. Prim /C/B/A can still be edited since it
    // has no specs on sublayer1.
    subLayer1.setPermissionToEdit(false)

    // Get the current working directory as it would be in the layer
    // identifier regardless of platform
    const getFormattedCwd = (): string => process.cwd().replace(/\\/g, '/')

    // Cannot delete or rename /C (there are no valid reparent targets for
    // /C on this stage currently regardless of layer permission)
    let expectedMsg = [`The spec @${getFormattedCwd()}/basic/sub_1.usda@</C> cannot be edited ` +
      'because the layer is not editable']
    verifyCannotApplyDeletePrim(primC, expectedMsg)
    verifyCannotApplyDeletePrimAtPath('/C', expectedMsg)
    verifyCannotApplyRenamePrim(primC, 'NewC', expectedMsg)
    verifyCannotApplyMovePrimAtPath('/C', '/NewC', expectedMsg)

    // Cannot delete, rename, or reparent /C/B
    expectedMsg = [`The spec @${getFormattedCwd()}/basic/sub_1.usda@</C/B> cannot be edited ` +
      'because the layer is not editable']
    verifyCannotApplyDeletePrim(primB, expectedMsg)
    verifyCannotApplyDeletePrimAtPath('/C/B', expectedMsg)
    verifyCannotApplyRenamePrim(primB, 'NewB', expectedMsg)
    verifyCannotApplyMovePrimAtPath('/C/B', '/C/NewB', expectedMsg)
    verifyCannotApplyReparentPrim(primB, stage.getPrim('/')!, expectedMsg)
    verifyCannotApplyMovePrimAtPath('/C/B', '/B', expectedMsg)
    verifyCannotApplyReparentAndRenamePrim(primB, stage.getPrim('/')!, 'NewB', expectedMsg)
    verifyCannotApplyMovePrimAtPath('/C/B', '/NewB', expectedMsg)

    // Simple helper for verifying that the edits to primA were performed
    // followed by resetting the stage for the next edit.
    const verifyPrimAWasEditedAndReset = async (newPathAfterMove?: string,
      expectedResyncNotices?: ExpectedResyncs): Promise<void> => {
      applyEditWithVerification(editor, { expectedResyncNotices })

      // The edit will have changed the root layer (where /C/B/A's spec) is
      // defined but will not have touched the sublayers.
      expect(rootLayer.isDirty()).toBe(true)
      expect(subLayer1.isDirty()).toBe(false)
      expect(subLayer2.isDirty()).toBe(false)

      // Prim /C/B/A will no longer exist on the stage, but if it was
      // moved or renamed, the prim at this path will exist.
      expect(valid(stage.getPrim('/C/B/A'))).toBe(false)
      if (newPathAfterMove) {
        expect(valid(stage.getPrim(newPathAfterMove))).toBe(true)
      }

      // Reload the root layer to reset and get primA again.
      await rootLayer.reload()
      await stage.flushChanges()
      primA = stage.getPrim('/C/B/A')!
      expect(valid(primA)).toBe(true)
    }

    // All valid edits for /C/B/A are still allowed since there are no
    // specs on sublayer1 for prim /C/B/A. We test them all here.

    // Can delete primA
    expect(editor.deletePrim(primA)).toBe(true)
    await verifyPrimAWasEditedAndReset(undefined, {
      '/C/B/A': [PrimResyncType.Delete, ''],
    })

    // Can rename primA
    expect(editor.renamePrim(primA, 'NewA')).toBe(true)
    await verifyPrimAWasEditedAndReset('/C/B/NewA', {
      '/C/B/A': [PrimResyncType.RenameSource, '/C/B/NewA'],
      '/C/B/NewA': [PrimResyncType.RenameDestination, '/C/B/A'],
    })

    // Can reparent primA to root.
    expect(editor.reparentPrim(primA, stage.getPrim('/')!)).toBe(true)
    await verifyPrimAWasEditedAndReset('/A', {
      '/C/B/A': [PrimResyncType.ReparentSource, '/A'],
      '/A': [PrimResyncType.ReparentDestination, '/C/B/A'],
    })

    // Can reparent primA to root and rename it..
    expect(editor.reparentPrim(primA, stage.getPrim('/')!, 'NewA')).toBe(true)
    await verifyPrimAWasEditedAndReset('/NewA', {
      '/C/B/A': [PrimResyncType.RenameAndReparentSource, '/NewA'],
      '/NewA': [PrimResyncType.RenameAndReparentDestination, '/C/B/A'],
    })

    // Can reparent primA under primC even though primC cannnot be namespace
    // edited.
    expect(editor.reparentPrim(primA, primC)).toBe(true)
    await verifyPrimAWasEditedAndReset('/C/A', {
      '/C/B/A': [PrimResyncType.ReparentSource, '/C/A'],
      '/C/A': [PrimResyncType.ReparentDestination, '/C/B/A'],
    })

    // Can reparent and rename primA under primC even though primC cannnot be
    // namespace edited.
    expect(editor.reparentPrim(primA, primC, 'NewA')).toBe(true)
    await verifyPrimAWasEditedAndReset('/C/NewA', {
      '/C/B/A': [PrimResyncType.RenameAndReparentSource, '/C/NewA'],
      '/C/NewA': [PrimResyncType.RenameAndReparentDestination, '/C/B/A'],
    })

    subLayer1.setPermissionToEdit(true)
  })

  it('test_EditPrimsWithInstancing', async () => {
    // Tests namespace edit operations on prims with native instancing.

    // Helper for verifying the contents of the prims expected in this test
    // which should be the same for all intanced and non-instanced prims in
    // this particular test case.
    const verifyInstancingStagePrimValues = (prim: Prim | undefined): void => {
      // Verify the prim's type and property names
      expect(valid(prim)).toBe(true)
      prim = prim!
      expect(prim.typeName).toBe('PrimTypeC')
      expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['C_Ref_API'])
      expect(prim.getPropertyNames()).toEqual(['C_Ref_Attr'])

      // Verify the prim has a child named "B" with expected type and
      // property names.
      const childB = getChild(prim, 'B')
      expect(valid(childB)).toBe(true)
      expect(childB!.typeName).toBe('PrimTypeB')
      expect(childB!.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['B_Ref_API'])
      expect(childB!.getPropertyNames()).toEqual(['B_Ref_Attr'])

      // Verify the prim's child "B" has a child named "A" with expected
      // type and property names.
      const childA = getChild(childB!, 'A')
      expect(valid(childA)).toBe(true)
      expect(childA!.typeName).toBe('PrimTypeA')
      expect(childA!.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['A_Ref_API'])
      expect(childA!.getPropertyNames()).toEqual(['A_Ref_Attr'])
    }

    // Opens the stage for this test case, verifies the expected prims and
    // returns the stage and these prims to test.
    const setupInstancingStage = async (): Promise<[Stage, Prim, Prim, Prim, Prim]> => {
      releaseLayers()
      const stage = (await Stage.open('instancing/root.usda'))!
      expect(stage).toBeTruthy()

      // The stage two instanced prims that have the same prototype.
      const instance1 = stage.getPrim('/Instance1')!
      expect(valid(instance1)).toBe(true)
      expect(instance1.isInstance()).toBe(true)

      const instance2 = stage.getPrim('/Instance2')!
      expect(valid(instance2)).toBe(true)
      expect(instance2.isInstance()).toBe(true)

      const prototypePrim = instance1.getPrototype()!
      expect(valid(prototypePrim)).toBe(true)
      expect(instance1.getPrototype()?.path).toBe(prototypePrim.path)
      expect(instance2.getPrototype()?.path).toBe(prototypePrim.path)

      // The stage also defines a single prim that is not instanceable but
      // uses the same reference as the instanceable prims.
      const nonInstancePrim = stage.getPrim('/NonInstancePrim')!
      expect(valid(nonInstancePrim)).toBe(true)
      expect(nonInstancePrim.isInstance()).toBe(false)
      expect(valid(nonInstancePrim.getPrototype())).toBe(false)

      // Verify all the three of these prims have the same content.
      verifyInstancingStagePrimValues(instance1)
      verifyInstancingStagePrimValues(instance2)
      verifyInstancingStagePrimValues(nonInstancePrim)

      return [stage, instance1, instance2, nonInstancePrim, prototypePrim]
    }

    // Open the stage and get the prims to test.
    let [stage, instance1, instance2, nonInstancePrim, prototypePrim] = await setupInstancingStage()

    const editor = new UsdNamespaceEditor(stage)

    // Helper to verify that CanApplyEdits returns false with the expected
    // message and that ApplyEdits fails and doesn't edit the stage.
    const verifyCannotApplyEdits = (expectedErrors: string[]): void => {
      verifyFalseResult(editor.canApplyEdits(), expectedErrors)
      expect(() => editor.applyEdits()).toThrow(TfError)
      expect(stage.getRootLayer().isDirty()).toBe(false)
    }

    // Helpers to verify that a valid [Delete|Rename|Reparent]Prim
    // operation can be added but cannot be applied to the editor's stage for
    // the expected reason.
    const verifyCannotApplyDeletePrim = (prim: Prim, expectedErrors: string[]): void => {
      expect(editor.deletePrim(prim)).toBe(true)
      verifyCannotApplyEdits(expectedErrors)
    }

    const verifyCannotApplyRenamePrim = (prim: Prim, newName: string, expectedErrors: string[]): void => {
      expect(editor.renamePrim(prim, newName)).toBe(true)
      verifyCannotApplyEdits(expectedErrors)
    }

    const verifyCannotApplyReparentPrim = (prim: Prim, newParent: Prim, expectedErrors: string[]): void => {
      expect(editor.reparentPrim(prim, newParent)).toBe(true)
      verifyCannotApplyEdits(expectedErrors)
    }

    // We have to account for this function being called on instance
    // prims. If the prim is an instance and its prim index was chosen
    // to be used for the prototype, then the prototype has to be
    // recomposed to use a remaining instance's prim index instead
    // and we end up with a resync notifications for the prototype path
    // as well. We account for that here by adding the prototype resync
    // to the expected resync notices if necessary. Note that which
    // instance is chosen to represent the prototype is nondeterministic.
    const addPrototypeResyncIfNeeded = (prim: Prim, primPath: string,
      expectedResyncNotices: ExpectedResyncs | undefined): void => {
      if (expectedResyncNotices !== undefined && prim.isInstance()) {
        const prototype = prim.getPrototype()!
        // Check if the prototype prim index matches this instance's
        // prim index; we expect a prototype resync if it does.
        if (prototype._prim.getSourcePrimIndex().getRootNode().path.pathString === primPath) {
          expectedResyncNotices[prototype.path] = [PrimResyncType.Other, '']
        }
      }
    }

    // Helper to verify that the prim at that path can be successfully
    // deleted. Resets the stage to be unedited afterward and returns
    // the original prim.
    const verifyCanDeletePrimAtPath = async (primPath: string,
      expectedResyncNotices?: ExpectedResyncs): Promise<Prim> => {
      // Verify the prim actually exists first
      let prim = stage.getPrim(primPath)!
      expect(valid(prim)).toBe(true)

      addPrototypeResyncIfNeeded(prim, primPath, expectedResyncNotices)

      // Verify that we can delete the prim, delete it, and make sure it
      // no longer exists on the stage.
      expect(editor.deletePrim(prim)).toBe(true)
      applyEditWithVerification(editor, { expectedResyncNotices })
      expect(valid(stage.getPrim(primPath))).toBe(false)

      // Reset the stage for the next case.
      await stage.reload()
      prim = stage.getPrim(primPath)!
      expect(valid(prim)).toBe(true)
      return prim
    }

    // Helper to verify that the prim at that path can be successfully moved
    // to a new path. Resets the stage to be unedited afterward and returns
    // the original prim.
    const verifyCanMovePrimAtPath = async (primPath: string, newPrimPath: string,
      expectedResyncNotices?: ExpectedResyncs): Promise<Prim> => {
      // Verify the prim actually exists first
      let prim = stage.getPrim(primPath)!
      expect(valid(prim)).toBe(true)

      addPrototypeResyncIfNeeded(prim, primPath, expectedResyncNotices)

      // Verify that we can move the prim, move it, and make sure it
      // no longer exists at the old path but does exist at the new path.
      expect(editor.movePrimAtPath(primPath, newPrimPath)).toBe(true)
      applyEditWithVerification(editor, { expectedResyncNotices })
      expect(valid(stage.getPrim(primPath))).toBe(false)
      expect(valid(stage.getPrim(newPrimPath))).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
      prim = stage.getPrim(primPath)!
      expect(valid(prim)).toBe(true)
      return prim
    }

    // We can delete any of the instance and non-instance prims.
    instance1 = await verifyCanDeletePrimAtPath('/Instance1', {
      '/Instance1': [PrimResyncType.Delete, ''],
    })
    instance2 = await verifyCanDeletePrimAtPath('/Instance2', {
      '/Instance2': [PrimResyncType.Delete, ''],
    })
    nonInstancePrim = await verifyCanDeletePrimAtPath('/NonInstancePrim', {
      '/NonInstancePrim': [PrimResyncType.Delete, ''],
    })

    // But we can't delete any of the children of the instance prims as they
    // are proxies from the prototype.
    verifyCannotApplyDeletePrim(getChild(instance1, 'B')!,
      ['The prim to edit is a prototype proxy descendant of an instance prim'])
    verifyCannotApplyDeletePrim(getChild(instance2, 'B')!,
      ['The prim to edit is a prototype proxy descendant of an instance prim'])
    // We can delete a child of the non-instance prim but only if relocates
    // authoring is allowed as it is defined across a reference.
    await verifyCanDeletePrimAtPath('/NonInstancePrim/B', {
      // XXX: While it would be expected that the only resync notice
      // would be a removal of /NonInstancePrim/B, that's not the case
      // here because the edit adds the first relocates arc to the
      // layer stack. When a first relocates is added we resync the
      // absolute root so that all prim index map functions can be
      // rebuilt to account for possible relocates.
      //
      // '/NonInstancePrim/B' : (self.PrimResyncType.Delete,
      //                         Sdf.Path())
      '/': [PrimResyncType.Other, ''],
    })

    // Like with delete, we can rename any of the instance and non-instance
    // prims (as long as the new name is valid).
    instance1 = await verifyCanMovePrimAtPath('/Instance1', '/NewInstance1', {
      '/Instance1': [PrimResyncType.RenameSource, '/NewInstance1'],
      '/NewInstance1': [PrimResyncType.RenameDestination, '/Instance1'],
    })
    instance2 = await verifyCanMovePrimAtPath('/Instance2', '/NewInstance2', {
      '/Instance2': [PrimResyncType.RenameSource, '/NewInstance2'],
      '/NewInstance2': [PrimResyncType.RenameDestination, '/Instance2'],
    })
    nonInstancePrim = await verifyCanMovePrimAtPath('/NonInstancePrim', '/NewNonInstancePrim', {
      '/NonInstancePrim': [PrimResyncType.RenameSource, '/NewNonInstancePrim'],
      '/NewNonInstancePrim': [PrimResyncType.RenameDestination, '/NonInstancePrim'],
    })

    // And just like with delete, we can't rename any of the children of the
    // instance prims because they are proxies into the prototype.
    verifyCannotApplyRenamePrim(getChild(instance1, 'B')!, 'NewB',
      ['The prim to edit is a prototype proxy descendant of an instance prim'])
    verifyCannotApplyRenamePrim(getChild(instance2, 'B')!, 'NewB',
      ['The prim to edit is a prototype proxy descendant of an instance prim'])
    // But we can rename a child of the non-instance prim but only if
    // relocates authoring is allowed as it is defined across a reference.
    await verifyCanMovePrimAtPath('/NonInstancePrim/B', '/NonInstancePrim/NewB', {
      // XXX: While it would be expected that the only resync notices
      // would be a rename of /NonInstancePrim/B, that's not the case
      // here because the edit adds the first relocates arc to the
      // layer stack. When a first relocates is added we resync the
      // absolute root so that all prim index map functions can be
      // rebuilt to account for possible relocates.
      //
      // '/NonInstancePrim/B' : (self.PrimResyncType.RenameSource,
      //                         Sdf.Path('/NonInstancePrim/NewB')),
      // '/NonInstancePrim/NewB' : (self.PrimResyncType.RenameDestination,
      //                            Sdf.Path('/NonInstancePrim/B')),
      '/': [PrimResyncType.Other, ''],
    })

    // We can reparent an instance prim under a non-instance prim
    instance1 = await verifyCanMovePrimAtPath('/Instance1', '/NonInstancePrim/Instance1', {
      '/Instance1': [PrimResyncType.ReparentSource, '/NonInstancePrim/Instance1'],
      '/NonInstancePrim/Instance1': [PrimResyncType.ReparentDestination, '/Instance1'],
    })

    // We can reparent and rename an instance prim under a non-instance prim
    instance2 = await verifyCanMovePrimAtPath('/Instance2', '/NonInstancePrim/NewInstance2', {
      '/Instance2': [PrimResyncType.RenameAndReparentSource, '/NonInstancePrim/NewInstance2'],
      '/NonInstancePrim/NewInstance2': [PrimResyncType.RenameAndReparentDestination, '/Instance2'],
    })

    // We can also reparent an instance prim under a child of a non-instance
    // prim
    instance1 = await verifyCanMovePrimAtPath('/Instance1', '/NonInstancePrim/B/Instance1', {
      '/Instance1': [PrimResyncType.ReparentSource, '/NonInstancePrim/B/Instance1'],
      '/NonInstancePrim/B/Instance1': [PrimResyncType.ReparentDestination, '/Instance1'],
    })

    // As well as reparent and rename an instance prim under a child of a
    // non-instance prim
    instance2 = await verifyCanMovePrimAtPath('/Instance2', '/NonInstancePrim/B/NewInstance2', {
      '/Instance2': [PrimResyncType.RenameAndReparentSource, '/NonInstancePrim/B/NewInstance2'],
      '/NonInstancePrim/B/NewInstance2': [PrimResyncType.RenameAndReparentDestination, '/Instance2'],
    })

    // But we cannot reparent any prims under an another instance prim
    // regardless of whether they're instanced on non-instanced
    verifyCannotApplyReparentPrim(instance1, instance2,
      ['The new parent prim is an instance prim whose children are provided exclusively by its prototype'])
    verifyCannotApplyReparentPrim(nonInstancePrim, instance2,
      ['The new parent prim is an instance prim whose children are provided exclusively by its prototype'])

    // No editing operations can be performed with a prototype prim or its
    // children ever
    prototypePrim = instance1.getPrototype()!
    verifyCannotApplyDeletePrim(prototypePrim, ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyDeletePrim(getChild(prototypePrim, 'B')!, ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyRenamePrim(prototypePrim, 'NewPrototype', ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyRenamePrim(getChild(prototypePrim, 'B')!, 'NewB',
      ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyReparentPrim(prototypePrim, nonInstancePrim, ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyReparentPrim(getChild(prototypePrim, 'B')!, nonInstancePrim,
      ['The prim to edit belongs to a prototype prim'])
    verifyCannotApplyReparentPrim(nonInstancePrim, prototypePrim,
      ['The new parent prim belongs to a prototype prim'])
    verifyCannotApplyReparentPrim(nonInstancePrim, getChild(prototypePrim, 'B')!,
      ['The new parent prim belongs to a prototype prim'])
  })

  const runEditPrimsWithCompositionArcs = async (allowRelocatesAuthoring: boolean,
    forceInitialRelocates = true): Promise<void> => {
    releaseLayers()

    // Work around so that we can test both the behavior of making an edit
    // that requires relocates in both the case where are no relocates to
    // begin with and when the layer stack already has at least one relocate.
    // We use a session layer with a bogus relocate to force the "already has
    // relocates case".
    let sessionLayer: Layer | undefined
    if (forceInitialRelocates) {
      // We write the session layer as a real layer on disk so that we
      // can reload the stage without wiping its contents.
      sessionLayer = await Layer.findOrOpen('runtime-session-layer.usda').catch(() => undefined)
      if (!sessionLayer) {
        // Sdf.Layer.CreateNew: typescript-usd has no SdfLayer::CreateNew; the new
        // layer is written with Export and opened.
        const newLayer = Layer.createAnonymous()
        newLayer.importFromString(`#usda 1.0
                    (
                        relocates = {
                            </bogus/nonexistant/path> : <>
                        }
                    )
                `)
        await newLayer.export('runtime-session-layer.usda')
        sessionLayer = (await Layer.findOrOpen('runtime-session-layer.usda'))!
      }
    }

    // This stage has few variety of composition arcs on the root prims.
    const rootLayer = (await Layer.findOrOpen('composition_arcs/root.usda'))!
    const stage = await openLayer(rootLayer, sessionLayer)
    expect(stage).toBeTruthy()

    const editor = new UsdNamespaceEditor(stage, { allowRelocatesAuthoring })

    // Helper functions for testing prims that we expect to be able to
    // successfully edit.

    // Helper to verify that the prim at that path can be successfully
    // deleted.
    const verifyCanDeletePrimAtPath = async (primPath: string, expectNewRelocates: boolean): Promise<void> => {
      // Verify the prim actually exists first
      const prim = stage.getPrim(primPath)!
      expect(valid(prim), primPath).toBe(true)

      const expectedResyncNotices: ExpectedResyncs = expectNewRelocates
        ? { '/': [PrimResyncType.Other, ''] }
        : { [primPath]: [PrimResyncType.Delete, ''] }

      // Verify that we can delete the prim, delete it, and make sure it
      // no longer exists on the stage.
      expect(editor.deletePrim(prim)).toBe(true)
      applyEditWithVerification(editor, { expectedResyncNotices })
      expect(valid(stage.getPrim(primPath))).toBe(false)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the prim at that path can be successfully moved
    // to a new path.
    const verifyCanMovePrimAtPath = async (primPath: string, newPrimPath: string,
      expectNewRelocates: boolean): Promise<void> => {
      // Verify the prim actually exists first
      const prim = stage.getPrim(primPath)
      expect(valid(prim), primPath).toBe(true)

      let expectedResyncNotices: ExpectedResyncs
      if (expectNewRelocates) {
        // XXX: This is a workaround for an unfortunate side effect of
        // adding a relocates to a PcpCache that did not have them
        // to start with. Due to a memory optimization related to Pcp map
        // functions in caches without relocates, adding a relocates for
        // the first time will always trigger a full resync of the
        // PcpCache from the root. This full resync does not occur if the
        // cache already had relocates.
        expectedResyncNotices = { '/': [PrimResyncType.Other, ''] }
      } else if (SdfPath.fromString(newPrimPath).getParentPath()
        .equals(SdfPath.fromString(primPath).getParentPath())) {
        expectedResyncNotices = {
          [primPath]: [PrimResyncType.RenameSource, newPrimPath],
          [newPrimPath]: [PrimResyncType.RenameDestination, primPath],
        }
      } else {
        expectedResyncNotices = {
          [primPath]: [PrimResyncType.RenameAndReparentSource, newPrimPath],
          [newPrimPath]: [PrimResyncType.RenameAndReparentDestination, primPath],
        }
      }

      // Verify that we can move the prim, move it, and make sure it
      // no longer exists at the old path but does exist at the new path.
      expect(editor.movePrimAtPath(primPath, newPrimPath)).toBe(true)
      applyEditWithVerification(editor, { expectedResyncNotices })
      expect(valid(stage.getPrim(primPath))).toBe(false)
      expect(valid(stage.getPrim(newPrimPath))).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the prim can be both deleted and moved.
    const verifyCanEditPrimAtPath = async (primPath: string, expectNewRelocates = false): Promise<void> => {
      await verifyCanDeletePrimAtPath(primPath, expectNewRelocates)
      await verifyCanMovePrimAtPath(primPath, '/Foo', expectNewRelocates)
    }

    // Helper functions for testing prims that we expect to NOT be able to
    // successfully edit.

    // Helper for extra verification that delete shouldn't work. This
    // function finds all the specs for the prim in the stage's root layer
    // stack and deletes these specs from the layer. This is what delete
    // operation would do if it were performed without first checking that
    // it would succeed. We can call this to prove that deleting the root
    // layer stack specs is not sufficient for deleting the prim from the
    // stage.
    const verifyDeletingRootLayerStackSpecsDoesNotDeletePrim = async (primPath: string): Promise<void> => {
      for (const layer of stage.getLayerStack()) {
        const spec = layer.getPrimAtPath(primPath)
        if (spec) {
          spec.getRealNameParent()!.getNameChildren().erase(spec.getPath().name)
        }
        // No spec should exist for the prim in this layer because it
        // either didn't exist to begin with or we just deleted it.
        expect(layer.getPrimAtPath(primPath)).toBeFalsy()
      }
      await stage.flushChanges()

      // Verify the stage still has a prim at the path after deleting all
      // root layer stack specs
      expect(valid(stage.getPrim(primPath))).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
    }

    const verifyCannotApplyEdits = (expectedErrors: string[], expectedWarnings: string[] = []): void => {
      verifyFalseResult(editor.canApplyEdits(), expectedErrors, expectedWarnings)
      expect(() => editor.applyEdits()).toThrow(TfError)
      expect(stage.getRootLayer().isDirty()).toBe(false)
    }

    // Helper to verify that the prim at that path cannot be deleted and
    // fails with the expected error message.
    const verifyCannotApplyDeletePrimAtPath = async (primPath: string, expectedErrors: string[],
      expectedWarnings: string[] = []): Promise<void> => {
      // Verify the prim actually exists first
      const prim = stage.getPrim(primPath)!
      expect(valid(prim), primPath).toBe(true)

      // Verify that we cannot delete the prim.
      expect(editor.deletePrim(prim)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)

      // Verify that the deleting root layer stack specs would indeed not
      // delete the prim.
      await verifyDeletingRootLayerStackSpecsDoesNotDeletePrim(primPath)
    }

    // Helper to verify that the prim at that path cannot be moved and fails
    // with the expected error message.
    const verifyCannotApplyMovePrimAtPath = (primPath: string, newPrimPath: string,
      expectedErrors: string[], expectedWarnings: string[] = []): void => {
      // Verify the prim actually exists first
      const prim = stage.getPrim(primPath)
      expect(valid(prim), primPath).toBe(true)

      // Verify that we cannot move the prim.
      expect(editor.movePrimAtPath(primPath, newPrimPath)).toBe(true)
      verifyCannotApplyEdits(expectedErrors, expectedWarnings)

      // No need to verify that moving specs in the root layer stack would
      // not move the prim; the delete case is sufficient for proving this.
    }

    // Helper to verify that the prim cannot be deleted nor moved.
    const verifyCannotEditPrimAtPath = async (primPath: string, expectedWarnings: string[] = []): Promise<void> => {
      const expectedErrors = ['The prim to edit requires authoring relocates ' +
        'since it composes opinions introduced by ancestral ' +
        'composition arcs; relocates authoring must be enabled to ' +
        'perform this edit']
      await verifyCannotApplyDeletePrimAtPath(primPath, expectedErrors, expectedWarnings)
      verifyCannotApplyMovePrimAtPath(primPath, '/Foo', expectedErrors, expectedWarnings)
    }

    // A prim with a direct reference to another prim can be edited.
    await verifyCanEditPrimAtPath('/PrimWithReference')

    // But children of the prim which were defined across the reference
    // (i.e. brought in by an ancestral reference) cannot be edited without
    // relocates.
    if (allowRelocatesAuthoring) {
      await verifyCanEditPrimAtPath('/PrimWithReference/ClassChild', !forceInitialRelocates)
      await verifyCanEditPrimAtPath('/PrimWithReference/B', !forceInitialRelocates)
      await verifyCanEditPrimAtPath('/PrimWithReference/B/A', !forceInitialRelocates)
    } else {
      await verifyCannotEditPrimAtPath('/PrimWithReference/ClassChild')
      await verifyCannotEditPrimAtPath('/PrimWithReference/B', ['found conflicting specs at node'])
      await verifyCannotEditPrimAtPath('/PrimWithReference/B/A')
    }

    // But a child prim that was added entirely in the root layer stack, even
    // though its parent is defined across the reference, can still be edited
    // since there are no specs across the ancestral reference.
    await verifyCanEditPrimAtPath('/PrimWithReference/B/B_Root_Child')

    // Relocates sources and targets are updated when edits that implicitly
    // affect them are applied.
    if (allowRelocatesAuthoring) {
      // Author an edit that will create a relocates arc.
      expect(editor.movePrimAtPath('/PrimWithReference/B', '/PrimWithReference/Moved_B')).toBe(true)
      applyEditWithVerification(editor)
      // Verify a relocate was authored.
      expect(rootLayer.getRelocates()).toEqual([
        ['/PrimWithReference/B', '/PrimWithReference/Moved_B'],
      ])

      // Author an edit to an ancestor of the relocates source
      expect(editor.movePrimAtPath('/PrimWithReference', '/Moved_PrimWithReference')).toBe(true)
      applyEditWithVerification(editor)
      // Verify the relocate was updated.
      expect(rootLayer.getRelocates()).toEqual([
        ['/Moved_PrimWithReference/B', '/Moved_PrimWithReference/Moved_B'],
      ])
    }

    // A prim with a subroot prim reference behaves the same way as a prim
    // with a root prim reference.
    await verifyCanEditPrimAtPath('/PrimWithSubrootReference')
    if (allowRelocatesAuthoring) {
      await verifyCanEditPrimAtPath('/PrimWithSubrootReference/A', !forceInitialRelocates)
    } else {
      await verifyCannotEditPrimAtPath('/PrimWithSubrootReference/A', ['found conflicting specs at node'])
    }
    await verifyCanEditPrimAtPath('/PrimWithSubrootReference/A/A_Root_Child')

    // A prim with a variant selection can be edited given the variant is
    // still a direct arc.
    await verifyCanEditPrimAtPath('/PrimWithVariant')

    // But children of the prim which were defined across the reference
    // within the selected variant cannot be edited without relocates.
    if (allowRelocatesAuthoring) {
      await verifyCanEditPrimAtPath('/PrimWithVariant/ClassChild', !forceInitialRelocates)
      await verifyCanEditPrimAtPath('/PrimWithVariant/B', !forceInitialRelocates)
      await verifyCanEditPrimAtPath('/PrimWithVariant/B/A', !forceInitialRelocates)
    } else {
      await verifyCannotEditPrimAtPath('/PrimWithVariant/ClassChild')
      await verifyCannotEditPrimAtPath('/PrimWithVariant/B')
      await verifyCannotEditPrimAtPath('/PrimWithVariant/B/A')
    }

    // But also a child defined fully in the root layer stack but inside
    // the variant self still cannot be edited without relocates or edit
    // target support as it has specs across an ancestral variant arc.
    if (allowRelocatesAuthoring) {
      await verifyCanEditPrimAtPath('/PrimWithVariant/V1_Root_Child', !forceInitialRelocates)
    } else {
      await verifyCannotEditPrimAtPath('/PrimWithVariant/V1_Root_Child')
    }
  }

  it('test_EditPrimsWithCompositionArcs', async () => {
    // Tests namespace edit operations on prims with specs that contribute
    // opinions across composition arcs.

    // Run with allowing relocates twice, once with initial relocates on the
    // stage and once without. The behavior is the same in both case with
    // the exception that prim resyncs that result from the edits (as
    // reported by ObjectsChanged) will be different.
    await runEditPrimsWithCompositionArcs(true, false)
    await runEditPrimsWithCompositionArcs(true, true)
    // Run without allowing relocates.
    await runEditPrimsWithCompositionArcs(false)
  })

  it('test_RelocatesAndProhibitedChildren', async () => {
    // Tests how relocates and prohibited children affect allowed namespace
    // edits.

    // Layer with a prim with two children
    const ref2Layer = Layer.createAnonymous('ref2.usda')
    ref2Layer.importFromString(`#usda 1.0

            def "Ref2Prim"
            {
                def MadeUpTypeName_2 "ChildInRef2"
                {
                    float a = 2.5
                }

                def MadeUpTypeName_1 "Child" {
                    int foo = 3
                }
            }
            `)

    // Layer with a prim that references the above layer and relocates
    // one the prim's children (with over opinions.)
    const ref1Layer = Layer.createAnonymous('ref1.usda')
    ref1Layer.importFromString(`#usda 1.0
            (
                relocates = {
                    </Ref1Prim/ChildInRef2> : </Ref1Prim/RelocatedFromRef2>
                }
            )

            def "Ref1Prim" (
                references = @${ref2Layer.identifier}@</Ref2Prim>
            ) {
                over "RelocatedFromRef2" {
                    string b = "hello"
                }
            }
            `)

    // Root layer with a prim that references the above layer
    const rootLayer = Layer.createAnonymous('root.usda')
    rootLayer.importFromString(`#usda 1.0

            def "PrimWithReference" (
                references = @${ref1Layer.identifier}@</Ref1Prim>
            ) {
                over "Child" {
                    int bar = 5
                }

                def "RootChild" {
                }
            }
            `)

    // Create our test stage and namespace editor which allows relocates (by
    // default).
    const stage = await openLayer(rootLayer)
    const editor = new UsdNamespaceEditor(stage)

    // Helper for verifying the contents on the composed
    // /PrimWithReference/Child as we move it around. Tested on the initial
    // prim
    const verifyChildContents = (prim: Prim): void => {
      expect(prim.typeName).toBe('MadeUpTypeName_1')
      expect(prim.getPropertyNames()).toEqual(['bar', 'foo'])
      expect(prim.getAttr('foo')!.get()).toBe(3)
      expect(prim.getAttr('bar')!.get()).toBe(5)
    }
    verifyChildContents(stage.getPrim('/PrimWithReference/Child')!)

    // Helper for verifying the contents on the composed
    // /PrimWithReference/RelocatedFromRef2 as we move it around. Tested on
    // the initial prim
    const verifyRelocatedFromRef2Contents = (prim: Prim): void => {
      expect(prim.typeName).toBe('MadeUpTypeName_2')
      expect(prim.getPropertyNames()).toEqual(['a', 'b'])
      expect(prim.getAttr('a')!.get()).toBe(2.5)
      expect(prim.getAttr('b')!.get()).toBe('hello')
    }
    verifyRelocatedFromRef2Contents(stage.getPrim('/PrimWithReference/RelocatedFromRef2')!)

    // Performs and verifies the move of the prim at primPath to newPrimPath.
    // Runs to the given verifyContentsFunc to confirm the composed prim was
    // indeed moved in its entirety
    const verifyCanMovePrimAtPath = (primPath: string, newPrimPath: string,
      verifyContentsFunc: (prim: Prim) => void): void => {
      // Verify the initial prim exists has the expected contents.
      const prim = stage.getPrim(primPath)
      expect(valid(prim), primPath).toBe(true)
      verifyContentsFunc(prim!)

      // Verify the new path does not exist.
      expect(valid(stage.getPrim(newPrimPath))).toBe(false)

      // Apply the move edit.
      expect(editor.movePrimAtPath(primPath, newPrimPath)).toBe(true)
      applyEditWithVerification(editor)

      // Verify that no prim exists at the original path.
      expect(valid(stage.getPrim(primPath))).toBe(false)

      // Verify the prim does exist at the new path and has the expected
      // contents
      const newPrim = stage.getPrim(newPrimPath)
      expect(valid(newPrim), newPrimPath).toBe(true)
      verifyContentsFunc(newPrim!)
    }

    // Verifies that the prim at primPath cannot be moved to newPrimPath
    // because the new path is a prohibited child of its parent
    const verifyCannotApplyMovePrimAtPath = (primPath: string, newPrimPath: string): void => {
      // Verify the prim actually exists first
      const prim = stage.getPrim(primPath)
      expect(valid(prim), primPath).toBe(true)

      // Verify that we cannot move the prim for the expected reason
      expect(editor.movePrimAtPath(primPath, newPrimPath)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(),
        ['The new path is a prohibited child of its parent path because of existing relocates.'])
      expect(() => editor.applyEdits()).toThrow(TfError)
    }

    // We can move a child prim from across a reference with local relocates.
    expect(rootLayer.getRelocates()).toEqual([])
    verifyCanMovePrimAtPath('/PrimWithReference/Child', '/MovedChild', verifyChildContents)
    expect(rootLayer.getRelocates()).toEqual([['/PrimWithReference/Child', '/MovedChild']])

    // We cannot move a different prim to the now empty pre-relocation path
    // even though there is no prim there. This is because relocation
    // tombstones do not allow a prim to exist at this path.
    verifyCannotApplyMovePrimAtPath('/PrimWithReference/RootChild', '/PrimWithReference/Child')

    // We can move the moved prim again to another loacation. This updates
    // the relocation.
    verifyCanMovePrimAtPath('/MovedChild', '/RenamedMovedChild', verifyChildContents)
    expect(rootLayer.getRelocates()).toEqual([['/PrimWithReference/Child', '/RenamedMovedChild']])

    // And we can move the locally relocated prim back to its original path.
    // This is the only prim that be moved to this tombstone location and is
    // accomplished by removing the local relocate.
    verifyCanMovePrimAtPath('/RenamedMovedChild', '/PrimWithReference/Child', verifyChildContents)
    expect(rootLayer.getRelocates()).toEqual([])

    // Now try a prim that has been relocated within the reference itself.
    // This prim can still be moved in the local layer stack using local
    // relocates.
    verifyCanMovePrimAtPath('/PrimWithReference/RelocatedFromRef2', '/MovedRelocatedFromRef2',
      verifyRelocatedFromRef2Contents)
    expect(rootLayer.getRelocates()).toEqual([
      ['/PrimWithReference/RelocatedFromRef2', '/MovedRelocatedFromRef2'],
    ])

    // We cannnot move a different prim to the now empty pre-relocation path.
    verifyCannotApplyMovePrimAtPath('/PrimWithReference/RootChild', '/PrimWithReference/RelocatedFromRef2')

    // We also cannot move a prim into a location that would be the path of
    // RelocatedFromRef2 if it were not relocated in the reference layer
    // itself (namely ChildInRef2). This is because pre-relocation
    // tombstones are propagated through composition arcs.
    verifyCannotApplyMovePrimAtPath('/PrimWithReference/RootChild', '/PrimWithReference/ChildInRef2')

    // We can move the locally relocated prim back to its original
    // path within the local layer stack, RelocatedFromRef2, because we
    // can undo that relocation locally.
    verifyCanMovePrimAtPath('/MovedRelocatedFromRef2', '/PrimWithReference/RelocatedFromRef2',
      verifyRelocatedFromRef2Contents)
    expect(rootLayer.getRelocates()).toEqual([])

    // But we cannot move this prim back to it's pre-relocation path from
    // within the reference as we can't undo the reference's relocates in the
    // local layer stack.
    verifyCannotApplyMovePrimAtPath('/PrimWithReference/RelocatedFromRef2', '/PrimWithReference/ChildInRef2')
  })
})
