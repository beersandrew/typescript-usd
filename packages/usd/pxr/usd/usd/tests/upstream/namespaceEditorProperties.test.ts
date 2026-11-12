// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorProperties.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorProperties.py (registered as
// testUsdNamespaceEditorProperties), with its testenv fixtures. The test runs
// with the testenv as the working directory, so relative identifiers name the
// fixture.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Error as TfError, Notice as TfNotice } from 'typescript-usd/tf'
import {
  NamespaceEditor, Notice as UsdNotice, Stage, StagePopulationMask, type Prim,
} from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdNamespaceEditorProperties')

type PathLike = string | SdfPath
const pathOf = (p: PathLike): SdfPath => (typeof p === 'string' ? SdfPath.fromString(p) : p)
const str = (p: PathLike): string => pathOf(p).pathString

// A UsdProperty handle: its path plus the stage it was fetched from. Like a
// UsdProperty, its validity is evaluated against the stage on each query.
class Property {
  constructor(private readonly _stage: Stage | undefined, private readonly _path: string) {}
  getPath(): string { return this._path }
  getPrimPath(): SdfPath { return pathOf(this._path).getPrimPath() }
  getName(): string { return pathOf(this._path).name }
  isValid(): boolean {
    if (!this._stage || this._path === '') return false
    const prim = this._stage.getPrim(this.getPrimPath().pathString)
    return prim !== undefined && prim.getPropertyNames().includes(this.getName())
  }
  attr() {
    return this._stage!.getPrim(this.getPrimPath().pathString)!.getAttr(this.getName())!
  }
  getPropertyStack(): Array<[string, string]> {
    return this._stage!.getPropertyStack(this._path).map(e => [e.layerIdentifier, e.specPath])
  }
  // UsdProperty::IsAuthored.
  isAuthored(): boolean { return this._stage!.getPropertyStack(this._path).length > 0 }
}

// UsdStage::GetPropertyAtPath: the returned property keeps its path only
// when its prim exists.
function getPropertyAtPath(stage: Stage, p: PathLike): Property {
  const propPath = pathOf(p)
  const prim = propPath.isPropertyPath() ? stage.getPrim(propPath.getPrimPath().pathString) : undefined
  return new Property(stage, prim ? propPath.pathString : '')
}
// UsdPrim::GetProperty.
const getProperty = (prim: Prim, name: string): Property =>
  new Property(prim.getStage(), pathOf(prim.path).appendProperty(name).pathString)
// UsdPrim::GetChild.
const getChild = (prim: Prim): Prim | undefined => prim.getStage().getPrim(`${prim.path}/B`)
// Usd.Prim(): an invalid prim, whose path is the empty path.
const INVALID_PRIM = { path: '' } as unknown as Prim
// UsdStage::GetPrimAtPath, returning an invalid prim when there is none.
const getPrimAtPath = (stage: Stage, p: string): Prim => stage.getPrim(p) ?? INVALID_PRIM

// Sdf.Find(layer, path): the spec, as (layer identifier, spec path).
function find(layerPath: string, specPath: PathLike): [string, string] {
  return [Layer.find(layerPath)?.identifier ?? `<no layer ${layerPath}>`, str(specPath)]
}
const primStack = (stage: Stage, p: string): Array<[string, string]> =>
  stage.getPrimStack(p).map(e => [e.layerIdentifier, e.specPath])

type CanApplyResult = ReturnType<NamespaceEditor['canApplyEdits']>

// Verifies that the result is true and provides the expected warnings, if any.
function verifyTrueResult(result: CanApplyResult, expectedWarnings: string[] = []): void {
  expect(result.ok).toBe(true)
  expect(result.warnings.length).toBe(expectedWarnings.length)
  result.warnings.forEach((warn, i) => expect(warn).toContain(expectedWarnings[i]))
}

// Verifies that the result is false and provides the expected message.
function verifyFalseResult(result: CanApplyResult, expectedMessage: string): void {
  expect(result.ok).toBe(false)
  expect(result.errors.join('; ')).toBe(expectedMessage)
}

// Calls CanApplyEdits and ApplyEdits on the given editor and verifies both
// succeed. If expectedObjectsChangedRenamedProperties is provided, this also
// verifies that listening to the ObjectsChanged notice will send a notice
// holding the expected renamed properties specified.
async function applyEditWithVerification(
  stage: Stage, editor: NamespaceEditor,
  expectedObjectsChangedRenamedProperties?: Array<[PathLike, string]>,
  expectedWarnings: string[] = [],
): Promise<void> {
  // receivedObjectsChanged is used for sanity checking that the notice
  // handler was indeed called as expected.
  let receivedObjectsChanged = false
  const renamedPerNotice: Array<Array<[string, string]>> = []
  // Register the ObjectsChange listener; we revoke it after applying the
  // edits
  // (Upstream registers globally while only the edited stage is alive; stages
  // opened by earlier cases stay alive here and share the fixture layers, so
  // the listener is registered for the edited stage.)
  const objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, notice => {
    receivedObjectsChanged = true
    renamedPerNotice.push(notice.getRenamedProperties().map(([p, n]) => [String(p), n]))
  }, stage)
  try {
    // Verify CanApply and Apply
    verifyTrueResult(editor.canApplyEdits(), expectedWarnings)
    expect(editor.applyEdits()).toBe(true)
    // Sanity check on the notice listener being called.
    expect(receivedObjectsChanged).toBe(true)
  } finally {
    objectsChanged.revoke()
  }
  // Compare the notice's renamed properties with the expected properties or
  // verify that renamed properties is empty if we don't expect renamed
  // properties
  const expected = (expectedObjectsChangedRenamedProperties ?? []).map(([p, n]) => [str(p), n])
  for (const renamed of renamedPerNotice) expect(renamed).toEqual(expected)
  await stage.flushChanges()
}

function verifyAttr(
  prop: Property, typeName: string, displayGroup: string | undefined, value: unknown,
  layers: string[],
): void {
  expect(prop.isValid()).toBe(true)
  const attr = prop.attr()
  expect(attr.typeName).toBe(typeName)
  expect(attr.getMetadata('displayGroup')).toBe(displayGroup)
  expect(attr.get()).toBe(value)
  expect(prop.getPropertyStack()).toEqual(layers.map(l => find(l, prop.getPath())))
}

// Verifies the fields and property stack of the property at path
// /C.C_Root_Attr when the basic stage is loaded. The fields we verify here
// should not change when the property is reparented and/or renamed.
const verifyBasicStageCRootAttrValues = (prop: Property): void =>
  verifyAttr(prop, 'string', undefined, 'foo', ['basic/root.usda'])
// Verifies the fields and property stack of the property at path
// /C.C_Sub1_Attr when the basic stage is loaded. The fields we verify here
// should not change when the property is reparented and/or renamed.
const verifyBasicStageCSub1AttrValues = (prop: Property): void =>
  verifyAttr(prop, 'int', 'Sub1', 3, ['basic/root.usda', 'basic/sub_1.usda'])
// Verifies the fields and property stack of the property at path
// /C.C_Sub2_Attr when the basic stage is loaded. The fields we verify here
// should not change when the property is reparented and/or renamed.
const verifyBasicStageCSub2AttrValues = (prop: Property): void =>
  verifyAttr(prop, 'double', 'Sub2', 3.0, ['basic/root.usda', 'basic/sub_1.usda', 'basic/sub_2.usda'])
// Verifies the fields and property stack of the property at path
// /C/B.B_Root_Attr when the basic stage is loaded. The fields we verify here
// should not change when the property is reparented and/or renamed.
const verifyBasicStageBRootAttrValues = (prop: Property): void =>
  verifyAttr(prop, 'string', undefined, 'bar', ['basic/root.usda'])
// Verifies the fields and property stack of the property at path
// /C/B.B_Sub1_Attr when the basic stage is loaded. The fields we verify here
// should not change when the property is reparented and/or renamed.
const verifyBasicStageBSub1AttrValues = (prop: Property): void =>
  verifyAttr(prop, 'int', 'Sub1', 2, ['basic/root.usda', 'basic/sub_1.usda'])
// Verifies the fields and property stack of the property at path
// /C/B/A.A_Root_Attr when the basic stage is loaded. The fields we verify
// here should not change when the property is reparented and/or renamed.
const verifyBasicStageARootAttrValues = (prop: Property): void =>
  verifyAttr(prop, 'string', undefined, 'baz', ['basic/root.usda'])

// Verifies the original prim stacks (i.e. at stage load time) of the three
// prims on the basic stage that hold the properties used in the basic
// property namespace editing test cases. Most property operations will not
// change these prim stacks with the exception of some reparent operations.
function verifyOriginalBasicStagePrimStacks(stage: Stage): void {
  expect(primStack(stage, '/C/B/A')).toEqual([find('basic/root.usda', '/C/B/A')])
  expect(primStack(stage, '/C/B')).toEqual([
    find('basic/root.usda', '/C/B'), find('basic/sub_1.usda', '/C/B')])
  expect(primStack(stage, '/C')).toEqual([
    find('basic/root.usda', '/C'), find('basic/sub_1.usda', '/C'), find('basic/sub_2.usda', '/C')])
}

// Upstream opens each stage after the previous test's stage (and so its
// edited layers) has been released; reloading restores the layers' on-disk
// contents the same way.
async function openStage(filePath: string): Promise<Stage> {
  const stage = (await Stage.open(filePath))!
  await stage.reload()
  return stage
}

// Setup function for many of the basic test cases. Loads the "basic" stage
// and gets and returns the needed layers and initial prims from this stage.
// Also verifies the initial state of the stage and its prim and properties
// match the expected unedited state of the stage.
async function setupBasicStage(): Promise<[Stage, Prim, Prim, Prim]> {
  // Open the root layer
  const stage = await openStage('basic/root.usda')

  // The stage defines three prims.
  const primA = stage.getPrim('/C/B/A')
  const primB = stage.getPrim('/C/B')
  const primC = stage.getPrim('/C')
  expect(primA).toBeTruthy()
  expect(primB).toBeTruthy()
  expect(primC).toBeTruthy()

  // Verify prim /C's three properties
  expect(primC!.getPropertyNames()).toEqual(['C_Root_Attr', 'C_Sub1_Attr', 'C_Sub2_Attr'])
  verifyBasicStageCRootAttrValues(getProperty(primC!, 'C_Root_Attr'))
  verifyBasicStageCSub1AttrValues(getProperty(primC!, 'C_Sub1_Attr'))
  verifyBasicStageCSub2AttrValues(getProperty(primC!, 'C_Sub2_Attr'))

  // Verify prim /C/B's two properties
  expect(primB!.getPropertyNames()).toEqual(['B_Root_Attr', 'B_Sub1_Attr'])
  verifyBasicStageBRootAttrValues(getProperty(primB!, 'B_Root_Attr'))
  verifyBasicStageBSub1AttrValues(getProperty(primB!, 'B_Sub1_Attr'))

  // Verify prim /C/B/A's single property
  expect(primA!.getPropertyNames()).toEqual(['A_Root_Attr'])
  verifyBasicStageARootAttrValues(getProperty(primA!, 'A_Root_Attr'))

  return [stage, primA!, primB!, primC!]
}

const RELOCATES_MESSAGE = 'The property to edit requires authoring ' +
  'relocates since it composes opinions introduced by ' +
  'ancestral composition arcs; authoring relocates is not ' +
  'supported for properties'

describe('TestUsdNamespaceEditorProperties', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => process.chdir(cwd))

  // Test basic USD property deletion through the UsdNamespaceEditor API.
  it('test_BasicDeleteProperty', async () => {
    // This function allows the same tests to be performed using
    // DeleteProperty and DeletePropertyAtPath.
    const testDeleteProperty = async (useDeletePropertyAtPath: boolean): Promise<void> => {
      // Open the basic stage and verify it's starting state.
      const [stage] = await setupBasicStage()

      const editor = new NamespaceEditor(stage)

      // Verify the prim stacks for the stage's prims in their pre-edited
      // state
      verifyOriginalBasicStagePrimStacks(stage)

      // Paths to each property on the stage. We will perform delete on
      // each of them.
      const propPaths = [
        '/C/B/A.A_Root_Attr', '/C/B.B_Root_Attr', '/C/B.B_Sub1_Attr',
        '/C.C_Root_Attr', '/C.C_Sub1_Attr', '/C.C_Sub2_Attr',
      ]

      for (const propPath of propPaths) {
        // Get the property; it must exist.
        const prop = getPropertyAtPath(stage, propPath)
        expect(prop.isValid()).toBe(true)

        // Verify the property can be deleted and delete it.
        if (useDeletePropertyAtPath) {
          expect(editor.deletePropertyAtPath(propPath)).toBe(true)
        } else {
          expect(editor.deleteProperty(prop)).toBe(true)
        }
        await applyEditWithVerification(stage, editor)

        // Verify the property no longer exists.
        expect(prop.isValid()).toBe(false)
        expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      }

      // Verify the prim stacks for the stage's prims are still the same
      // after all the delete operations
      verifyOriginalBasicStagePrimStacks(stage)
    }

    // Run delete tests using both DeleteProperty and DeletePropertyAtPath
    await testDeleteProperty(false)
    await testDeleteProperty(true)
  })

  // Test basic USD property renaming through the UsdNamespaceEditor API.
  it('test_BasicRenameProperty', async () => {
    // This function allows the same tests to be performed using
    // RenameProperty and MovePropertyAtPath.
    const testRenameProperty = async (useMovePropertyAtPath: boolean): Promise<void> => {
      // Open the basic stage and verify it's starting state.
      const [stage] = await setupBasicStage()

      // Create a namespace editor for the stage
      const editor = new NamespaceEditor(stage)

      // Paths to each property on the stage along with the new name to
      // rename it to and the verify function to call on the property to
      // verify that it was fully moved to the new name.
      const propPaths: Array<[string, string, (p: Property) => void]> = [
        ['/C/B/A.A_Root_Attr', 'New_A_Root_Attr', verifyBasicStageARootAttrValues],
        ['/C/B.B_Root_Attr', 'New_B_Root_Attr', verifyBasicStageBRootAttrValues],
        ['/C/B.B_Sub1_Attr', 'New_B_Sub1_Attr', verifyBasicStageBSub1AttrValues],
        ['/C.C_Root_Attr', 'New_C_Root_Attr', verifyBasicStageCRootAttrValues],
        ['/C.C_Sub1_Attr', 'New_C_Sub1_Attr', verifyBasicStageCSub1AttrValues],
        ['/C.C_Sub2_Attr', 'New_C_Sub2_Attr', verifyBasicStageCSub2AttrValues],
      ]

      // Verify the prim stacks for the stage's prims in their pre-edited
      // state
      verifyOriginalBasicStagePrimStacks(stage)

      for (const [propPath, newName, verifyValuesFunc] of propPaths) {
        // Get the property; it must exist.
        const prop = getPropertyAtPath(stage, propPath)
        expect(prop.isValid()).toBe(true)

        // Get the expected path of the property after the rename.
        const newPropPath = prop.getPrimPath().appendProperty(newName).pathString

        // Verify the property can be renamed and rename it.
        if (useMovePropertyAtPath) {
          expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
        } else {
          expect(editor.renameProperty(prop, newName)).toBe(true)
        }
        await applyEditWithVerification(stage, editor, [[propPath, newName]])

        // Verify the original property no longer exists.
        expect(prop.isValid()).toBe(false)
        expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)

        // Verify the property exists at the renamed path and has the
        // same values as the original property
        expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)
        verifyValuesFunc(getPropertyAtPath(stage, newPropPath))
      }

      // Verify the prim stacks for the stage's prims are still the same
      // after all the rename operations
      verifyOriginalBasicStagePrimStacks(stage)
    }

    // Run rename tests using both RenameProperty and MovePropertyAtPath
    await testRenameProperty(false)
    await testRenameProperty(true)
  })

  // Test basic USD property reparenting through the UsdNamespaceEditor
  // API without renaming the properties.
  it('test_BasicReparentProperty', async () => {
    // This function allows the same tests to be performed using
    // ReparentProperty and MovePropertyAtPath.
    const testReparentProperty = async (useMovePropertyAtPath: boolean): Promise<void> => {
      // Open the basic stage and verify it's starting state.
      const [stage, primA, primB, primC] = await setupBasicStage()

      const editor = new NamespaceEditor(stage)

      // Paths to each property on the stage along with the new parent prim
      // to reparent it to and the verify function to call on the property
      // to verify that it was fully moved to the new name.
      let propPaths: Array<[string, Prim, (p: Property) => void]> = [
        ['/C/B/A.A_Root_Attr', primC, verifyBasicStageARootAttrValues],
        ['/C/B.B_Root_Attr', primA, verifyBasicStageBRootAttrValues],
        ['/C/B.B_Sub1_Attr', primA, verifyBasicStageBSub1AttrValues],
        ['/C.C_Root_Attr', primA, verifyBasicStageCRootAttrValues],
        ['/C.C_Sub1_Attr', primA, verifyBasicStageCSub1AttrValues],
        ['/C.C_Sub2_Attr', primA, verifyBasicStageCSub2AttrValues],
      ]

      // Verify the prim stacks for the stage's prims in their pre-edited
      // state
      verifyOriginalBasicStagePrimStacks(stage)

      const performReparent = async (paths: typeof propPaths): Promise<void> => {
        for (const [propPath, newParent, verifyValuesFunc] of paths) {
          // Get the property; it must exist.
          const prop = getPropertyAtPath(stage, propPath)
          expect(prop.isValid()).toBe(true)

          // Get the expected path of the property after the reparent.
          const newPropPath = pathOf(newParent.path).appendProperty(prop.getName()).pathString

          // Verify the property can be reparented and reparent it.
          if (useMovePropertyAtPath) {
            expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
          } else {
            expect(editor.reparentProperty(prop, newParent)).toBe(true)
          }
          await applyEditWithVerification(stage, editor)

          // Verify the original property no longer exists.
          expect(prop.isValid()).toBe(false)
          expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)

          // Verify the property exists at the reparented path and has
          // the same values as the original property
          expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)
          verifyValuesFunc(getPropertyAtPath(stage, newPropPath))
        }
      }

      await performReparent(propPaths)

      // Verify the prim stacks for the stage's prims have change after the
      // reparent, in particular new overs have been added for /C/B and
      // /C/B/A on the sublayers in order to hold some of the moved specs
      // for the reparented properties.
      expect(primStack(stage, '/C/B/A')).toEqual([
        find('basic/root.usda', '/C/B/A'), find('basic/sub_1.usda', '/C/B/A'),
        find('basic/sub_2.usda', '/C/B/A')])
      expect(primStack(stage, '/C/B')).toEqual([
        find('basic/root.usda', '/C/B'), find('basic/sub_1.usda', '/C/B'),
        find('basic/sub_2.usda', '/C/B')])
      expect(primStack(stage, '/C')).toEqual([
        find('basic/root.usda', '/C'), find('basic/sub_1.usda', '/C'),
        find('basic/sub_2.usda', '/C')])

      // Paths to each of the moved properties at their moved paths along
      // with the original prim they were reparented from. Performing the
      // reparent with this set will return the stage back to its state
      // before the edits.
      propPaths = [
        ['/C.A_Root_Attr', primA, verifyBasicStageARootAttrValues],
        ['/C/B/A.B_Root_Attr', primB, verifyBasicStageBRootAttrValues],
        ['/C/B/A.B_Sub1_Attr', primB, verifyBasicStageBSub1AttrValues],
        ['/C/B/A.C_Root_Attr', primC, verifyBasicStageCRootAttrValues],
        ['/C/B/A.C_Sub1_Attr', primC, verifyBasicStageCSub1AttrValues],
        ['/C/B/A.C_Sub2_Attr', primC, verifyBasicStageCSub2AttrValues],
      ]

      // Perform and verify the "undo" reparent operations
      await performReparent(propPaths)

      // Verify the prim stacks for the stage's prims are back in their
      // pre-edited state as the reparent will removed unneeded overs that
      // left behind after moving a property.
      verifyOriginalBasicStagePrimStacks(stage)
    }

    // Run reparent tests using both ReparentProperty and MovePropertyAtPath
    await testReparentProperty(true)
    await testReparentProperty(false)
  })

  // Test basic USD property reparenting through the UsdNamespaceEditor
  // API using the overload that renames the property as well.
  it('test_BasicReparentAndRenameProperty', async () => {
    // This function allows the same tests to be performed using
    // ReparentProperty and MovePropertyAtPath.
    const testReparentAndRenameProperty = async (useMovePropertyAtPath: boolean): Promise<void> => {
      // Open the basic stage and verify it's starting state.
      const [stage, primA, primB, primC] = await setupBasicStage()

      const editor = new NamespaceEditor(stage)

      // Paths to each property on the stage along with the new parent prim
      // and new name to reparent and rename it to and the verify function
      // to call on the property to verify that it was fully moved its new
      // path
      let propPaths: Array<[string, Prim, string, (p: Property) => void]> = [
        ['/C/B/A.A_Root_Attr', primC, 'New_A_Root_Attr', verifyBasicStageARootAttrValues],
        ['/C/B.B_Root_Attr', primA, 'New_B_Root_Attr', verifyBasicStageBRootAttrValues],
        ['/C/B.B_Sub1_Attr', primA, 'New_B_Sub1_Attr', verifyBasicStageBSub1AttrValues],
        ['/C.C_Root_Attr', primA, 'New_C_Root_Attr', verifyBasicStageCRootAttrValues],
        ['/C.C_Sub1_Attr', primA, 'New_C_Sub1_Attr', verifyBasicStageCSub1AttrValues],
        ['/C.C_Sub2_Attr', primA, 'New_C_Sub2_Attr', verifyBasicStageCSub2AttrValues],
      ]

      // Verify the prim stacks for the stage's prims in their pre-edited
      // state
      verifyOriginalBasicStagePrimStacks(stage)

      const performReparentAndRename = async (paths: typeof propPaths): Promise<void> => {
        for (const [propPath, newParent, newName, verifyValuesFunc] of paths) {
          // Get the property; it must exist.
          const prop = getPropertyAtPath(stage, propPath)
          expect(prop.isValid()).toBe(true)

          // Get the expected path of the property after the reparent
          // and rename.
          const newPropPath = pathOf(newParent.path).appendProperty(newName).pathString

          // Verify the property can be reparented and reparent it.
          if (useMovePropertyAtPath) {
            expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
          } else {
            expect(editor.reparentProperty(prop, newParent, newName)).toBe(true)
          }
          await applyEditWithVerification(stage, editor)

          // Verify the original property no longer exists.
          expect(prop.isValid()).toBe(false)
          expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)

          // Verify the property exists at the new path and has
          // the same values as the original property
          expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)
          verifyValuesFunc(getPropertyAtPath(stage, newPropPath))
        }
      }

      await performReparentAndRename(propPaths)

      // Verify the prim stacks for the stage's prims have change after the
      // reparent, in particular new overs have been added for /C/B and
      // /C/B/A on the sublayers in order to hold some of the moved specs
      // for the reparented properties.
      expect(primStack(stage, '/C/B/A')).toEqual([
        find('basic/root.usda', '/C/B/A'), find('basic/sub_1.usda', '/C/B/A'),
        find('basic/sub_2.usda', '/C/B/A')])
      expect(primStack(stage, '/C/B')).toEqual([
        find('basic/root.usda', '/C/B'), find('basic/sub_1.usda', '/C/B'),
        find('basic/sub_2.usda', '/C/B')])
      expect(primStack(stage, '/C')).toEqual([
        find('basic/root.usda', '/C'), find('basic/sub_1.usda', '/C'),
        find('basic/sub_2.usda', '/C')])

      // Paths to each of the moved properties at their moved paths along
      // with the original prim and name they were reparented and renamed
      // from. Performing the reparent with this set will return the stage
      // back to its state before the edits.
      propPaths = [
        ['/C.New_A_Root_Attr', primA, 'A_Root_Attr', verifyBasicStageARootAttrValues],
        ['/C/B/A.New_B_Root_Attr', primB, 'B_Root_Attr', verifyBasicStageBRootAttrValues],
        ['/C/B/A.New_B_Sub1_Attr', primB, 'B_Sub1_Attr', verifyBasicStageBSub1AttrValues],
        ['/C/B/A.New_C_Root_Attr', primC, 'C_Root_Attr', verifyBasicStageCRootAttrValues],
        ['/C/B/A.New_C_Sub1_Attr', primC, 'C_Sub1_Attr', verifyBasicStageCSub1AttrValues],
        ['/C/B/A.New_C_Sub2_Attr', primC, 'C_Sub2_Attr', verifyBasicStageCSub2AttrValues],
      ]

      // Perform and verify the "undo" reparent operations
      await performReparentAndRename(propPaths)

      // Verify the prim stacks for the stage's prims are back in their
      // pre-edited state as the reparent will removed unneeded overs that
      // left behind after moving a property.
      verifyOriginalBasicStagePrimStacks(stage)
    }

    // Run reparent and rename tests using both ReparentProperty and
    // MovePropertyAtPath
    await testReparentAndRenameProperty(true)
    await testReparentAndRenameProperty(false)
  })

  // Tests the basic usage of the CanApplyEdits in cases where namespace
  // editing should fail. Also tests that calling ApplyEdits in cases where
  // CanApplyEdits returns false will not change any layer content.
  it('test_BasicCanEditProperty', async () => {
    // Load the basic stage and get its prims
    const [stage, primA, primB, primC] = await setupBasicStage()

    const editor = new NamespaceEditor(stage)

    // Helper to verify that none of the layers used by the stage have
    // changed after an expected failed edit.
    const verifyNoLayersHaveChanged = (): void => {
      // The basic stage should have 4 layers: the session layer, the root
      // layer, and its two sublayers.
      const stageLayers = stage.getUsedLayers()
      expect(stageLayers.length).toBe(4)
      for (const layer of stageLayers) expect(layer.isDirty()).toBe(false)
    }

    // Helper to verify that CanApplyEdits returns false with the expected
    // message and that ApplyEdits fails and doesn't edit any layers.
    const verifyCannotApplyEdits = (expectedMessage: string): void => {
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)
      verifyNoLayersHaveChanged()
    }

    // Helpers to verify that a valid edit operation (of the function's
    // particular type) can be added but cannot be applied to the editor's
    // stage for the expected reason.
    const verifyCannotApplyDeleteProperty = (property: Property, expectedMessage: string): void => {
      expect(editor.deleteProperty(property)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyRenameProperty = (
      property: Property, newName: string, expectedMessage: string): void => {
      expect(editor.renameProperty(property, newName)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyReparentProperty = (
      property: Property, newParent: Prim, expectedMessage: string): void => {
      expect(editor.reparentProperty(property, newParent)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotReparentAndRenameProperty = (
      property: Property, newParent: Prim, newName: string, expectedMessage: string): void => {
      expect(editor.reparentProperty(property, newParent, newName)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyDeletePropertyAtPath = (p: PathLike, expectedMessage: string): void => {
      expect(editor.deletePropertyAtPath(p)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyMovePropertyAtPath = (
      p: PathLike, newPath: PathLike, expectedMessage: string): void => {
      expect(editor.movePropertyAtPath(p, newPath)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }

    // First verify we can't apply edits if we haven't added any yet.
    verifyCannotApplyEdits('There are no valid edits to perform')

    // Test invalid edit operations that can't even be added because they
    // do not produce valid absolute property paths.

    // Test valid SdfPaths that are not absolute property paths. These
    // non-property paths will emit a coding error if provided to any of the
    // add property edit at path functions.
    const invalidPrimPaths = [
      '/C', // prim path
      '/C{x=y}.Attr', // property path with ancestor variant selection
      '/', // pseudo-root
      '.Attr', // relative property path
      'C.Attr', // relative property path
      '../B.Attr', // relative property path
      '../.Attr', // relative property path
      'C', // relative prim path
      '/C/B.B_Rel[/Foo].attr', // target path
    ]
    for (const pathString of invalidPrimPaths) {
      // Verify it is a valid SdfPath
      const p = SdfPath.fromString(pathString)
      expect(p.isEmpty()).toBe(false)

      // Cannot use path for delete.
      expect(() => editor.deletePropertyAtPath(p)).toThrow(TfError)
      // Cannot use path for source or destination of move
      expect(() => editor.movePropertyAtPath(p, '/Foo.foo')).toThrow(TfError)
      expect(() => editor.movePropertyAtPath('/C.foo', p)).toThrow(TfError)
    }

    // Test fully invalid SdfPaths that will also emit a coding error if
    //provided to any of the add prim edit at path functions.
    const invalidPaths = ['', '//A', '/C.123', '/C.$', '/Foo:Bar.Attr', '/.foo']
    for (const pathString of invalidPaths) {
      // Verify it is a valid SdfPath
      const p = SdfPath.fromString(pathString)
      expect(p.isEmpty()).toBe(true)

      // Cannot use path for delete.
      expect(() => editor.deletePropertyAtPath(p)).toThrow(TfError)
      // Cannot use path for source or destination of move
      expect(() => editor.movePropertyAtPath(p, '/Foo.foo')).toThrow(TfError)
      expect(() => editor.movePropertyAtPath('/C.foo', p)).toThrow(TfError)
    }

    // GetPropertyAtPath('/Bogus.bogus') does not return a valid property
    // because /Bogus is not a valid property. We cannot add edits for this
    // invalid property.
    let invalidProperty = getPropertyAtPath(stage, '/Bogus.foo')
    expect(invalidProperty.isValid()).toBe(false)
    expect(invalidProperty.getPath()).toBe(SdfPath.emptyPath.pathString)
    expect(() => editor.deleteProperty(invalidProperty)).toThrow(TfError)
    expect(() => editor.renameProperty(invalidProperty, 'NewA')).toThrow(TfError)
    expect(() => editor.reparentProperty(invalidProperty, primC)).toThrow(TfError)

    // GetPropertyAtPath('/C.bogus') also does not return a valid property.
    // However, because /C is a valid prim the UsdProperty is still able to
    // return a valid property path so we can add edits for this property.
    // The edits cannot be applied though.
    invalidProperty = getPropertyAtPath(stage, '/C.Bogus')
    expect(invalidProperty.isValid()).toBe(false)
    expect(invalidProperty.getPath()).toBe('/C.Bogus')
    verifyCannotApplyDeleteProperty(invalidProperty,
      'The property to edit is not a valid property')
    verifyCannotApplyRenameProperty(invalidProperty, 'New_bogus',
      'The property to edit is not a valid property')
    verifyCannotApplyReparentProperty(invalidProperty, primA,
      'The property to edit is not a valid property')

    // We cannot add edits for the empty property.
    invalidProperty = new Property(undefined, '')
    expect(invalidProperty.isValid()).toBe(false)
    expect(() => editor.deleteProperty(invalidProperty)).toThrow(TfError)
    expect(() => editor.renameProperty(invalidProperty, 'NewA')).toThrow(TfError)
    expect(() => editor.reparentProperty(invalidProperty, primC)).toThrow(TfError)

    // We also can't add edits that try to reparent a valid property to
    // to an invalid prim
    let validProperty = getPropertyAtPath(stage, '/C.C_Root_Attr')
    expect(validProperty.isValid()).toBe(true)
    expect(() => editor.reparentProperty(validProperty, INVALID_PRIM)).toThrow(TfError)

    // We cannot add rename edits with invalid property names.

    // Empty name
    expect(() => editor.renameProperty(validProperty, '')).toThrow(TfError)
    // Invalid property name
    expect(() => editor.renameProperty(validProperty, '/A')).toThrow(TfError)
    expect(() => editor.renameProperty(validProperty, 'C.foo')).toThrow(TfError)
    expect(() => editor.renameProperty(validProperty, 'C{x=y}')).toThrow(TfError)

    // We cannot add reparent edits with a new name that isn't a valid
    // property name.

    // Empty name when reparenting with a new name
    expect(() => editor.reparentProperty(validProperty, primA, '')).toThrow(TfError)
    // Invalid property name when reparenting with a new name
    expect(() => editor.reparentProperty(validProperty, primA, '/A')).toThrow(TfError)
    expect(() => editor.reparentProperty(validProperty, primA, 'C.foo')).toThrow(TfError)
    expect(() => editor.reparentProperty(validProperty, primA, 'C{x=y}')).toThrow(TfError)

    // At this point the last edit we attempted to add failed so there are no
    // edits to perform
    verifyCannotApplyEdits('There are no valid edits to perform')

    // /C.bogus is not a prim on the stage. We cannot edit a prim at this path.
    verifyCannotApplyDeletePropertyAtPath('/C.bogus',
      'The property to edit is not a valid property')
    verifyCannotApplyMovePropertyAtPath('/C.bogus', '/C.New_bogus',
      'The property to edit is not a valid property')
    verifyCannotApplyMovePropertyAtPath('/C.bogus', '/C/B.bogus',
      'The property to edit is not a valid property')

    // Test invalid rename destinations.

    expect(validProperty.isValid()).toBe(true)

    // Renames fail when an object already exists at the renamed path.
    verifyCannotApplyRenameProperty(validProperty, 'C_Sub1_Attr',
      'An object already exists at the new path')
    verifyCannotApplyMovePropertyAtPath('/C.C_Root_Attr', '/C.C_Sub1_Attr',
      'An object already exists at the new path')

    verifyCannotApplyRenameProperty(validProperty, 'C_Root_Attr',
      'An object already exists at the new path')
    verifyCannotApplyMovePropertyAtPath('/C.C_Root_Attr', '/C.C_Root_Attr',
      'An object already exists at the new path')

    // Test invalid reparent destinations.

    validProperty = getProperty(primA, 'A_Root_Attr')
    expect(validProperty.isValid()).toBe(true)

    // Properties cannot be reparented to the pseusdo-root
    verifyCannotApplyReparentProperty(validProperty, stage.getPrim('/')!,
      'The new parent prim for a property cannot be the pseudo-root')

    // New parent prim does not exist
    expect(() => editor.reparentProperty(validProperty, getPrimAtPath(stage, '/D'))).toThrow(TfError)
    verifyCannotApplyMovePropertyAtPath('/C/B/A.A_Root_Attr', '/D.A_Root_Attr',
      'The new parent prim is not a valid prim')

    // New parent prim is the same parent prim.
    verifyCannotApplyReparentProperty(validProperty, primA,
      'An object already exists at the new path')
    verifyCannotApplyMovePropertyAtPath('/C/B/A.A_Root_Attr', '/C/B/A.A_Root_Attr',
      'An object already exists at the new path')

    // Reparents fail when an object already exists at the reparented path.
    // These reparent cases rename the prim to cause the path collision.
    verifyCannotReparentAndRenameProperty(validProperty, primB, 'B_Root_Attr',
      'An object already exists at the new path')
    verifyCannotApplyMovePropertyAtPath('/C/B/A.A_Root_Attr', '/C/B.B_Root_Attr',
      'An object already exists at the new path')

    const subLayer1 = Layer.find('basic/sub_1.usda')
    expect(subLayer1).toBeTruthy()

    // Open one of the sublayers as a stage to test that the stage of the
    // prim doesn't matter when adding edits.
    const subLayerStage = await Stage.openMasked(subLayer1!, StagePopulationMask.all())
    // Create another namespace editor for the sublayer stage.
    const subLayerEditor = new NamespaceEditor(subLayerStage)
    // The sublayer stage has a property at /C.C_Sub1_Attr but does not have
    // a prim at /C/B/A unlike the root stage.
    expect(getPropertyAtPath(subLayerStage, '/C.C_Sub1_Attr').isValid()).toBe(true)
    expect(subLayerStage.getPrim('/C/B/A')).toBeFalsy()

    // It's valid to add reparent operations to both editors using UsdObjects
    // from either stage as we only use the prims to determine the paths to
    // objects to edit, not to determine the objects themselves.
    expect(editor.reparentProperty(
      getPropertyAtPath(subLayerStage, '/C.C_Sub1_Attr'), stage.getPrim('/C/B/A')!)).toBe(true)
    expect(subLayerEditor.reparentProperty(
      getPropertyAtPath(subLayerStage, '/C.C_Sub1_Attr'), stage.getPrim('/C/B/A')!)).toBe(true)
    // But only the root stage can apply this reparent edit as /C/B/A is only
    // a valid parent prim on the root stage and not on the sublayer stage.
    verifyTrueResult(editor.canApplyEdits())
    verifyFalseResult(subLayerEditor.canApplyEdits(),
      'The new parent prim is not a valid prim')

    // Make sublayer1 uneditable to test can edit functions when not all
    // contributing specs in a layer stack can be edited.
    subLayer1!.setPermissionToEdit(false)
    try {
      // Name, path of properties on the basic stage that have specs in
      // sublayer1. These properties will not be editable.
      const propsWithSpecsInSub1: Array<[string, string]> = [
        ['C_Sub1_Attr', '/C.C_Sub1_Attr'],
        ['C_Sub2_Attr', '/C.C_Sub2_Attr'],
        ['B_Sub1_Attr', '/C/B.B_Sub1_Attr']]

      for (const [propName, propPath] of propsWithSpecsInSub1) {
        const propToEdit = getPropertyAtPath(stage, propPath)
        expect(propToEdit.isValid()).toBe(true)

        // Get the current working directory as it would be in the layer
        // identifier regardless of platform
        const getFormattedCwd = (): string => process.cwd().replace(/\\/g, '/')

        const uneditableLayerMessage =
          `The spec @${getFormattedCwd()}/basic/sub_1.usda@<${propPath}> cannot be ` +
          'edited because the layer is not editable'

        // Cannot delete
        verifyCannotApplyDeleteProperty(propToEdit, uneditableLayerMessage)
        verifyCannotApplyDeletePropertyAtPath(propPath, uneditableLayerMessage)

        // Cannot rename
        verifyCannotApplyRenameProperty(propToEdit, 'New_Attr', uneditableLayerMessage)
        verifyCannotApplyMovePropertyAtPath(propPath,
          SdfPath.fromString(propPath).replaceName('New_Attr'), uneditableLayerMessage)

        // Cannot reparent
        verifyCannotApplyReparentProperty(propToEdit, primA, uneditableLayerMessage)
        verifyCannotApplyMovePropertyAtPath(propPath,
          pathOf(primA.path).appendProperty(propName), uneditableLayerMessage)

        // Cannot reparent and rename
        verifyCannotReparentAndRenameProperty(propToEdit, primA, 'New_Attr',
          uneditableLayerMessage)
        verifyCannotApplyMovePropertyAtPath(propPath,
          pathOf(primA.path).appendProperty('New_Attr'), uneditableLayerMessage)
      }

      // Name, path, and reparent target of properties on the basic stage that
      // do NOT have specs in sublayer1. These properties are still editable
      // even though sublayer1 can't be edited.
      const propsWithoutSpecsInSub1: Array<[string, string, string]> = [
        ['C_Root_Attr', '/C.C_Root_Attr', '/C/B/A'],
        ['B_Root_Attr', '/C/B.B_Root_Attr', '/C'],
        ['A_Root_Attr', '/C/B/A.A_Root_Attr', '/C/B']]

      for (const [propName, propPath, newParentPath] of propsWithoutSpecsInSub1) {
        let prop = getPropertyAtPath(stage, propPath)
        expect(prop.isValid()).toBe(true)

        // Helper for verifying that the following edits to the properties
        // that aren't affected by sublayer1 were performed followed by
        // resetting the stage for the next edit.
        const verifyPropertyWasEditedAndReset = async (
          editedPropPath: string, newPropPath?: string,
          expectedObjectsChangedRenamedProperties?: Array<[PathLike, string]>,
        ): Promise<void> => {
          await applyEditWithVerification(stage, editor, expectedObjectsChangedRenamedProperties)

          // The successful edits on these properties will affect the root
          // layer but won't affect sublayer1
          expect(stage.getRootLayer().isDirty()).toBe(true)
          expect(subLayer1!.isDirty()).toBe(false)

          // No object will exist at the original path but for a move edit,
          // the property will exist at a new path.
          expect(getPropertyAtPath(stage, editedPropPath).isValid()).toBe(false)
          if (newPropPath) expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)

          // Reset by reloading the root layer and get the property back
          // again
          await stage.getRootLayer().reload()
          await stage.flushChanges()
          prop = getPropertyAtPath(stage, editedPropPath)
          expect(prop.isValid()).toBe(true)
        }

        // Can delete the property
        expect(editor.deleteProperty(prop)).toBe(true)
        await verifyPropertyWasEditedAndReset(propPath)

        const newPropName = `${propName}_New`
        const newParentPrim = stage.getPrim(newParentPath)!

        // Can rename the property
        let newPropPath = `${propPath}_New`
        expect(editor.renameProperty(prop, newPropName)).toBe(true)
        await verifyPropertyWasEditedAndReset(propPath, newPropPath, [[propPath, newPropName]])

        // Can reparent property without rename
        newPropPath = pathOf(newParentPrim.path).appendProperty(propName).pathString
        expect(editor.reparentProperty(prop, newParentPrim)).toBe(true)
        await verifyPropertyWasEditedAndReset(propPath, newPropPath)

        // Can reparent property with rename
        newPropPath = pathOf(newParentPrim.path).appendProperty(newPropName).pathString
        expect(editor.reparentProperty(prop, newParentPrim, newPropName)).toBe(true)
        await verifyPropertyWasEditedAndReset(propPath, newPropPath)
      }
    } finally {
      subLayer1!.setPermissionToEdit(true)
    }
  })

  // Tests that we can't namespace edit properties that are built-in
  // properties of a prim's schema type.
  it('test_CanEditBuiltinProperties', async () => {
    // Open the basic stage for this test.
    const rootLayer = (await Layer.findOrOpen('basic/root.usda'))!
    let stage = await Stage.openMasked(rootLayer, StagePopulationMask.all())
    await stage.reload()

    let editor = new NamespaceEditor(stage)

    // The basic stage a root prim named "PrimWithCollection" that has an
    // instance of CollectionAPI named "foo" applied. Note that we use
    // CollectionAPI as its the only schema entirely defined in libUsd that
    // can be used to apply built-in properties to prim
    const primWithCollectionPath = SdfPath.fromString('/PrimWithCollection')
    let primWithCollection = stage.getPrim(primWithCollectionPath.pathString)
    expect(primWithCollection).toBeTruthy()
    expect(primWithCollection!.hasAPI('CollectionAPI', 'foo')).toBe(true)

    // Helper for verifying that a built-in property cannot be namespace
    // edited.
    const verifyCannotEditBuiltinProperty = (prop: Property): void => {
      expect(prop.isValid()).toBe(true)

      // The same error message will occur for any operation that would
      // only fail because the property is built-in.
      const expectedMessage = 'The property to edit is a built-in property of its prim'

      // Cannot delete
      expect(editor.deleteProperty(prop)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)

      // Cannot rename
      const newName = 'NewName'
      expect(editor.renameProperty(prop, newName)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)

      // Cannot reparent
      const newParent = stage.getPrim('/C')!
      expect(editor.reparentProperty(prop, newParent)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)

      // The basic stage should have 4 layers: the session layer, the root
      // layer, and its two sublayers. After all the failed edits, none of
      // the stage's layers should have been edited
      const stageLayers = stage.getUsedLayers()
      expect(stageLayers.length).toBe(4)
      for (const layer of stageLayers) expect(layer.isDirty()).toBe(false)
    }

    // Helper for verifying that a custom property (not built-in) at the
    // given path can be edited
    const verifyCanEditCustomPropertyAtPath = async (propPath: SdfPath): Promise<void> => {
      // Get and verify the property at path
      let prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)
      expect(prop.isAuthored()).toBe(true)

      // Verify we can delete the property
      expect(editor.deleteProperty(prop)).toBe(true)
      await applyEditWithVerification(stage, editor)

      // Verify the property is deleted then reset
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      await stage.reload()

      // Get and verify the property at path
      prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)
      expect(prop.isAuthored()).toBe(true)

      // Verify we can renanme the property
      const newName = 'NewName'
      expect(editor.renameProperty(prop, newName)).toBe(true)
      await applyEditWithVerification(stage, editor, [[prop.getPath(), newName]])

      // Verify the property is moved then reset
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      expect(getPropertyAtPath(stage, propPath.replaceName(newName)).isValid()).toBe(true)
      await stage.reload()

      // Get and verify the property at path
      prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)
      expect(prop.isAuthored()).toBe(true)

      // Verify we can renparent the property
      const newParent = stage.getPrim('/C')!
      expect(editor.reparentProperty(prop, newParent)).toBe(true)
      await applyEditWithVerification(stage, editor)

      // Verify the property is moved then reset
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      expect(getProperty(newParent, propPath.name).isValid()).toBe(true)
      await stage.reload()
    }

    // The following built-in properties are provided only by the prim's
    // applied schema and have no authored opinions on the stage at all.
    // These properties can not be edited.
    const builtinFallbackProps = [
      'collection:foo',
      'collection:foo:excludes',
      'collection:foo:expansionRule',
      'collection:foo:membershipExpression']
    for (const propName of builtinFallbackProps) {
      const propPath = primWithCollectionPath.appendProperty(propName)
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isAuthored()).toBe(false)
      verifyCannotEditBuiltinProperty(prop)
    }

    // These built-in properties DO have authored opinions on the stage, but
    // since they're also built-in properties of the applied schema, they
    // still cannot be namespace edited.
    const builtinAuthoredProps = ['collection:foo:includeRoot', 'collection:foo:includes']
    for (const propName of builtinAuthoredProps) {
      const propPath = primWithCollectionPath.appendProperty(propName)
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isAuthored()).toBe(true)
      verifyCannotEditBuiltinProperty(prop)
    }

    // These properties are not built-in to the API schema and only exist
    // as opinions on the stage. These properties CAN be edited.
    const customProps = ['nonCollectionAttr']
    for (const propName of customProps) {
      await verifyCanEditCustomPropertyAtPath(primWithCollectionPath.appendProperty(propName))
    }

    // Reopen the stage but with a session layer that removes the
    // CollectionAPI:foo applied schema from "PrimWithCollection"
    stage = await Stage.openMasked(rootLayer, StagePopulationMask.all(),
      { sessionLayerPath: 'basic/session.usda' })

    // We have to recreate the namespace editor with the newly opened stage
    // as the previous editor was attached to the stage without the session
    // layer.
    editor = new NamespaceEditor(stage)

    // Verify the prim no longer has the API schema applied.
    primWithCollection = stage.getPrim(primWithCollectionPath.pathString)
    expect(primWithCollection).toBeTruthy()
    expect(primWithCollection!.hasAPI('CollectionAPI', 'foo')).toBe(false)

    // The built-in only properties now no longer exist because there were
    // no opinions on the stage.
    for (const propName of builtinFallbackProps) {
      const propPath = primWithCollectionPath.appendProperty(propName)
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
    }

    // The built-in properties that had authored opinions on the stage are
    // no longer built-in and can now be edited as custom properties.
    for (const propName of builtinAuthoredProps) {
      await verifyCanEditCustomPropertyAtPath(primWithCollectionPath.appendProperty(propName))
    }

    // The custom properties that were never built-ins can still be edited.
    for (const propName of customProps) {
      await verifyCanEditCustomPropertyAtPath(primWithCollectionPath.appendProperty(propName))
    }
  })

  // Tests namespace edit operations on properties with native instancing.
  it('test_EditPropertiesWithInstancing', async () => {
    // Opens the stage for this test case, verifies the expected prims and
    // returns the stage and these prims to test.
    const setupInstancingStage = async (): Promise<[Stage, Prim, Prim, Prim, Prim]> => {
      const stage = await openStage('instancing/root.usda')
      expect(stage).toBeTruthy()

      // The stage two instanced prims that have the same prototype.
      const instance1 = stage.getPrim('/Instance1')
      expect(instance1).toBeTruthy()
      expect(instance1!.isInstance()).toBe(true)

      const instance2 = stage.getPrim('/Instance2')
      expect(instance2).toBeTruthy()
      expect(instance2!.isInstance()).toBe(true)

      const prototypePrim = instance1!.getPrototype()
      expect(prototypePrim).toBeTruthy()
      expect(instance1!.getPrototype()?.path).toBe(prototypePrim!.path)
      expect(instance2!.getPrototype()?.path).toBe(prototypePrim!.path)

      // The stage also defines a single prim that is not instanceable but
      // uses the same reference as the instanceable prims.
      const nonInstancePrim = stage.getPrim('/NonInstancePrim')
      expect(nonInstancePrim).toBeTruthy()
      expect(nonInstancePrim!.isInstance()).toBe(false)
      expect(nonInstancePrim!.getPrototype()).toBeFalsy()

      return [stage, instance1!, instance2!, nonInstancePrim!, prototypePrim!]
    }

    // Open the stage and get the prims to test.
    const [stage, instance1, instance2, nonInstancePrim, prototypePrim] =
      await setupInstancingStage()

    // Simple root prim to be target for some reparent cases.
    const basicRootPrim = stage.getPrim('/BasicRootPrim')
    expect(basicRootPrim).toBeTruthy()

    const editor = new NamespaceEditor(stage)

    // Helper to verify that CanApplyEdits returns false with the expected
    // message and that ApplyEdits fails and doesn't edit the stage.
    const verifyCannotApplyEdits = (expectedMessage: string): void => {
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)
      expect(stage.getRootLayer().isDirty()).toBe(false)
    }

    // Helpers to verify that a valid [Delete|Rename|Reparent]Property
    // operation can be added but cannot be applied to the editor's stage for
    // the expected reason.
    const verifyCannotApplyDeleteProperty = (prop: Property, expectedMessage: string): void => {
      expect(editor.deleteProperty(prop)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyRenameProperty = (
      prop: Property, newName: string, expectedMessage: string): void => {
      expect(editor.renameProperty(prop, newName)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }
    const verifyCannotApplyReparentProperty = (
      prop: Property, newParent: Prim, expectedMessage: string): void => {
      expect(editor.reparentProperty(prop, newParent)).toBe(true)
      verifyCannotApplyEdits(expectedMessage)
    }

    // Helper to verify that the prim at that path can be successfully
    // deleted. Resets the stage to be unedited afterward.
    const verifyCanDeletePropertyAtPath = async (propPath: string): Promise<void> => {
      // Verify the property actually exists first
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)

      // Verify that we can delete the property, delete it, and make sure
      // it no longer exists on the stage.
      expect(editor.deleteProperty(prop)).toBe(true)
      await applyEditWithVerification(stage, editor)
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the property at that path can be successfully
    // moved to a new path. Resets the stage to be unedited afterward.
    const verifyCanMovePropertyAtPath = async (
      propPath: string, newPropPath: string,
      expectedObjectsChangedRenamedProperties?: Array<[PathLike, string]>,
    ): Promise<void> => {
      // Verify the property actually exists first, and make sure the
      // new property does not exist.
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)
      expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(false)

      // Verify that we can move the property, move it, and make sure it
      // no longer exists at the old path but does exist at the new path.
      expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
      await applyEditWithVerification(stage, editor, expectedObjectsChangedRenamedProperties)
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper for verifying a property that is invalid to edit because of
    // necessitating relocates as opposed to any requirements related to
    // instancing.
    const verifyCannotEditPropertyWithoutRelocates = (prop: Property): void => {
      verifyCannotApplyDeleteProperty(prop, RELOCATES_MESSAGE)
      verifyCannotApplyRenameProperty(prop, 'New_Attr', RELOCATES_MESSAGE)
      verifyCannotApplyReparentProperty(prop, basicRootPrim!, RELOCATES_MESSAGE)
    }

    // First verify that we can't edit ReferencePrim_Attr from any of
    // instance and non-instance prims without relocates as it is defined
    // across a reference.
    verifyCannotEditPropertyWithoutRelocates(getProperty(instance1, 'ReferencePrim_Attr'))
    verifyCannotEditPropertyWithoutRelocates(getProperty(instance2, 'ReferencePrim_Attr'))
    verifyCannotEditPropertyWithoutRelocates(getProperty(nonInstancePrim, 'ReferencePrim_Attr'))

    // We can delete local properties of both the instance and non-instance
    // prims as long as they are not defined across the reference (i.e.
    // would need relocates).
    await verifyCanDeletePropertyAtPath('/Instance1.Instance1_Attr')
    await verifyCanDeletePropertyAtPath('/Instance2.Instance2_Attr')
    await verifyCanDeletePropertyAtPath('/NonInstancePrim.NonInstance_Attr')

    // Like with delete, we can rename these same instance and non-instance
    // properties (as long as the new name is valid).
    await verifyCanMovePropertyAtPath('/Instance1.Instance1_Attr', '/Instance1.NewAttr',
      [['/Instance1.Instance1_Attr', 'NewAttr']])
    await verifyCanMovePropertyAtPath('/Instance2.Instance2_Attr', '/Instance2.NewAttr',
      [['/Instance2.Instance2_Attr', 'NewAttr']])
    await verifyCanMovePropertyAtPath('/NonInstancePrim.NonInstance_Attr', '/NonInstancePrim.NewAttr',
      [['/NonInstancePrim.NonInstance_Attr', 'NewAttr']])

    // We can also reparent these properties...
    // ...from an instance to another instance
    await verifyCanMovePropertyAtPath('/Instance1.Instance1_Attr', '/Instance2.Instance1_Attr')

    // ...from an instance to a non-instance prim
    await verifyCanMovePropertyAtPath('/Instance2.Instance2_Attr', '/NonInstancePrim.Instance2_Attr')

    // ...from a non-instance prim to an instance prim.
    await verifyCanMovePropertyAtPath('/NonInstancePrim.NonInstance_Attr', '/Instance1.NonInstance_Attr')

    // We can't delete, rename, or reparent any of the properties of the
    // instance prim's children as they are proxies from the prototype.
    let prop = getProperty(getChild(instance1)!, 'B_Attr')
    verifyCannotApplyDeleteProperty(prop,
      'The property to edit belongs to an instance prototype proxy')
    verifyCannotApplyRenameProperty(prop, 'New_Attr',
      'The property to edit belongs to an instance prototype proxy')
    verifyCannotApplyReparentProperty(prop, basicRootPrim!,
      'The property to edit belongs to an instance prototype proxy')

    prop = getProperty(getChild(instance2)!, 'B_Attr')
    verifyCannotApplyDeleteProperty(prop,
      'The property to edit belongs to an instance prototype proxy')
    verifyCannotApplyRenameProperty(prop, 'New_Attr',
      'The property to edit belongs to an instance prototype proxy')
    verifyCannotApplyReparentProperty(prop, basicRootPrim!,
      'The property to edit belongs to an instance prototype proxy')

    // We also can't edit the same child prim properties of the non-instance
    // prim but it's because of relocates as they're still defined across a
    // reference.
    verifyCannotEditPropertyWithoutRelocates(getProperty(getChild(nonInstancePrim)!, 'B_Attr'))

    // We also can't reparent an otherwise valid property under the child of
    // an instance prim as instance proxies can't have local property
    // opinions.
    const newParentPrim = getChild(instance1)!
    verifyCannotApplyReparentProperty(getProperty(instance1, 'Instance1_Attr'), newParentPrim,
      'The new parent prim is a prototype proxy descendant of an instance prim')
    verifyCannotApplyReparentProperty(getProperty(instance2, 'Instance2_Attr'), newParentPrim,
      'The new parent prim is a prototype proxy descendant of an instance prim')
    verifyCannotApplyReparentProperty(getProperty(nonInstancePrim, 'NonInstance_Attr'), newParentPrim,
      'The new parent prim is a prototype proxy descendant of an instance prim')

    // But these same properties can still be reparented under the child
    // of the non-instance prim as there is no such local property opinion
    // restriction.
    await verifyCanMovePropertyAtPath('/Instance1.Instance1_Attr', '/NonInstancePrim/B.Instance1_Attr')
    await verifyCanMovePropertyAtPath('/Instance2.Instance2_Attr', '/NonInstancePrim/B.Instance2_Attr')
    await verifyCanMovePropertyAtPath('/NonInstancePrim.NonInstance_Attr',
      '/NonInstancePrim/B.NonInstance_Attr')

    // No editing operations can be performed with a prototype prim or its
    // children ever. The prototype prim itself can't have its own properties
    expect(prototypePrim.getPropertyNames()).toEqual([])

    const protoTypeChildProp = getProperty(getChild(prototypePrim)!, 'B_Attr')
    verifyCannotApplyDeleteProperty(protoTypeChildProp,
      'The property to edit belongs to a prototype prim')
    verifyCannotApplyRenameProperty(protoTypeChildProp, 'New_Attr',
      'The property to edit belongs to a prototype prim')
    verifyCannotApplyReparentProperty(protoTypeChildProp, basicRootPrim!,
      'The property to edit belongs to a prototype prim')

    verifyCannotApplyReparentProperty(getProperty(instance1, 'Instance1_Attr'), prototypePrim,
      'The new parent prim belongs to a prototype prim')
    verifyCannotApplyReparentProperty(getProperty(nonInstancePrim, 'NonInstance_Attr'), prototypePrim,
      'The new parent prim belongs to a prototype prim')
    verifyCannotApplyReparentProperty(getProperty(nonInstancePrim, 'NonInstance_Attr'),
      getChild(prototypePrim)!,
      'The new parent prim belongs to a prototype prim')
  })

  // Tests namespace edit operations on properties with specs that
  // contribute opinions across composition arcs.
  it('test_EditPropertiesWithCompositionArcs', async () => {
    // This stage has few variety of composition arcs on the root prims with
    // properties defined both the local layer stack and across these arcs.
    const stage = await openStage('composition_arcs/root.usda')
    expect(stage).toBeTruthy()

    const editor = new NamespaceEditor(stage)

    // Helper functions for testing properties that we expect to be able to
    // successfully edit.

    // Helper to verify that the property at that path can be successfully
    // deleted. Resets the stage to be unedited afterward.
    const verifyCanDeletePropertyAtPath = async (propPath: SdfPath): Promise<void> => {
      // Verify the property actually exists first
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)

      // Verify that we can delete the property, delete it, and make sure
      // it no longer exists on the stage.
      expect(editor.deleteProperty(prop)).toBe(true)
      await applyEditWithVerification(stage, editor)
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the property at that path can be successfully
    // moved to a new path. Resets the stage to be unedited afterward.
    const verifyCanMovePropertyAtPath = async (
      propPath: SdfPath, newPropPath: SdfPath,
      expectedObjectsChangedRenamedProperties?: Array<[PathLike, string]>,
    ): Promise<void> => {
      // Verify the property actually exists first, and make sure the
      // new property does not exist.
      const prop = getPropertyAtPath(stage, propPath)
      expect(prop.isValid()).toBe(true)
      expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(false)

      // Verify that we can move the property, move it, and make sure it
      // no longer exists at the old path but does exist at the new path.
      expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
      await applyEditWithVerification(stage, editor, expectedObjectsChangedRenamedProperties)
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(false)
      expect(getPropertyAtPath(stage, newPropPath).isValid()).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the prim can be both deleted and moved.
    const verifyCanEditPropertyAtPath = async (propPathString: string): Promise<void> => {
      const propPath = SdfPath.fromString(propPathString)
      const renamedPropPath = propPath.replaceName('NewPropName')
      const reparentedPropPath = SdfPath.fromString('/BasicRootPrim').appendProperty(propPath.name)
      await verifyCanDeletePropertyAtPath(propPath)
      await verifyCanMovePropertyAtPath(propPath, renamedPropPath, [[propPath, 'NewPropName']])
      await verifyCanMovePropertyAtPath(propPath, reparentedPropPath)
    }

    // Helper functions for testing prims that we expect to NOT be able to
    // successfully edit.

    // Helper for extra verification that delete shouldn't work. This
    // function finds all the specs for the property in the stage's root
    // layer stack and deletes these specs from the layer. This is what
    // delete operation would do if it were performed without first checking
    // that it would succeed. We can call this to prove that deleting the
    // root layer stack specs is not sufficient for deleting the prim from
    // the stage.
    const verifyDeletingRootLayerStackSpecsDoesNotDeleteProperty = async (
      propPath: SdfPath): Promise<void> => {
      for (const layer of stage.getLayerStack()) {
        const spec = layer.getPropertyAtPath(propPath)
        if (spec) layer.getPrimAtPath(propPath.getPrimPath())!.removeProperty(spec)
        // No spec should exist for the property in this layer because it
        // either didn't exist to begin with or we just deleted it.
        expect(layer.getPropertyAtPath(propPath)).toBeFalsy()
      }
      await stage.flushChanges()

      // Verify the stage still has a property at the path after deleting
      // all root layer stack specs
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(true)

      // Reset the stage for the next case.
      await stage.reload()
    }

    // Helper to verify that the property at that path cannot be deleted and
    // fails with the expected error message.
    const verifyCannotApplyDeletePropertyAtPath = async (
      propPath: SdfPath, expectedMessage: string): Promise<void> => {
      // Verify the property actually exists first
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(true)

      // Verify that we cannot delete the property.
      expect(editor.deletePropertyAtPath(propPath)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)

      // Verify that the deleting root layer stack specs would indeed not
      // delete the property.
      await verifyDeletingRootLayerStackSpecsDoesNotDeleteProperty(propPath)
    }

    // Helper to verify that the property at that path cannot be moved and
    // fails with the expected error message.
    const verifyCannotApplyMovePropertyAtPath = (
      propPath: SdfPath, newPropPath: SdfPath, expectedMessage: string): void => {
      // Verify the property actually exists first
      expect(getPropertyAtPath(stage, propPath).isValid()).toBe(true)

      // Verify that we cannot move the property.
      expect(editor.movePropertyAtPath(propPath, newPropPath)).toBe(true)
      verifyFalseResult(editor.canApplyEdits(), expectedMessage)
      expect(() => editor.applyEdits()).toThrow(TfError)

      // No need to verify that moving specs in the root layer stack would
      // not move the property; the delete case is sufficient for proving
      // this.
    }

    // Helper to verify that the property cannot be deleted nor moved.
    const verifyCannotEditPropertyAtPath = async (propPathString: string): Promise<void> => {
      const propPath = SdfPath.fromString(propPathString)
      const renamedPropPath = propPath.replaceName('NewPropName')
      const reparentedPropPath = SdfPath.fromString('/BasicRootPrim').appendProperty(propPath.name)

      await verifyCannotApplyDeletePropertyAtPath(propPath, RELOCATES_MESSAGE)
      verifyCannotApplyMovePropertyAtPath(propPath, renamedPropPath, RELOCATES_MESSAGE)
      verifyCannotApplyMovePropertyAtPath(propPath, reparentedPropPath, RELOCATES_MESSAGE)
    }

    // /PrimWithReference has a direct reference to @ref.usda@</ReferencePrim>

    // Can still edit property Root_PrimWithReference_Attr which only has
    // specs in the root layer stack.
    await verifyCanEditPropertyAtPath('/PrimWithReference.Root_PrimWithReference_Attr')

    // Cannot edit Ref_ReferencePrim_Attr which has specs in referenced prim
    await verifyCannotEditPropertyAtPath('/PrimWithReference.Ref_ReferencePrim_Attr')

    // Cannot edit Ref_RefClass_Attr which has specs in a class prim that is
    // inherited by the referenced prim.
    await verifyCannotEditPropertyAtPath('/PrimWithReference.Ref_RefClass_Attr')

    // Cannot edit ClassChild.ClassChild.Ref_ClassChild_Attr which has specs
    // in the child prim of the class inherited by the referenced prim.
    await verifyCannotEditPropertyAtPath('/PrimWithReference/ClassChild.Ref_ClassChild_Attr')

    // Cannot edit ClassChild.ClassChild.Root_ClassChild_Attr even though the
    // specs are only in the root layer as they are defined in a prim that
    // is an implied inherit propagated from the referenced prim..
    await verifyCannotEditPropertyAtPath('/PrimWithReference/ClassChild.Root_ClassChild_Attr')

    // Can still edit property Root_B_Attr of the child prim "B" as it only
    // has specs in the root layer stack.
    await verifyCanEditPropertyAtPath('/PrimWithReference/B.Root_B_Attr')

    // Cannot edit Ref_B_Attr of child prim "B" which has specs in the
    // ancestrally referenced prim.
    await verifyCannotEditPropertyAtPath('/PrimWithReference/B.Ref_B_Attr')

    // Cannot edit Ref_A_Attr of grandchild prim "B/A" which has specs in the
    // ancestrally referenced prim.
    await verifyCannotEditPropertyAtPath('/PrimWithReference/B/A.Ref_A_Attr')

    // /PrimWithSubrootReference has a direct reference to
    // @ref.usda@</ReferencePrim/B> which is a subroot reference.

    // Can still edit property Root_B_Attr as it only has specs in the root
    // layer stack.
    await verifyCanEditPropertyAtPath('/PrimWithSubrootReference.Root_B_Attr')

    // Cannot edit Ref_B_Attr which has specs in referenced prim
    await verifyCannotEditPropertyAtPath('/PrimWithSubrootReference.Ref_B_Attr')

    // Can still edit property Root_A_Attr of the child prim "A" as it only
    // has specs in the root layer stack.
    await verifyCanEditPropertyAtPath('/PrimWithSubrootReference/A.Root_A_Attr')

    // Cannot edit Ref_A_Attr of child prim "A" which has specs in the
    // ancestrally referenced prim.
    await verifyCannotEditPropertyAtPath('/PrimWithSubrootReference/A.Ref_A_Attr')

    // /PrimWithVariant has a variant selection of {v=one} of which this
    // variant has a reference to @ref.usda@</ReferencePrim>

    // Can edit Root_OutsideTheVariant_Attr which only has specs in the local
    // layer stack and they are outside the variant.
    await verifyCanEditPropertyAtPath('/PrimWithVariant.Root_OutsideTheVariant_Attr')

    // Cannot edit Root_VariantOne_Attr even though it only has specs in the
    // local layer stack as these specs are defined inside the variant
    // itself.
    await verifyCannotEditPropertyAtPath('/PrimWithVariant.Root_VariantOne_Attr')

    // Cannot edit the attributes that has specs defined inside the reference
    // or the class it inherits.
    await verifyCannotEditPropertyAtPath('/PrimWithVariant.Ref_ReferencePrim_Attr')
    await verifyCannotEditPropertyAtPath('/PrimWithVariant.Ref_RefClass_Attr')
    await verifyCannotEditPropertyAtPath('/PrimWithVariant/ClassChild.Root_ClassChild_Attr')
    await verifyCannotEditPropertyAtPath('/PrimWithVariant/ClassChild.Ref_ClassChild_Attr')
  })
})
