// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsTargetPathFixup.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsTargetPathFixup.py
// (registered as testUsdNamespaceEditorDependentEditsTargetPathFixup): tests
// downstream dependency target-path fixup when a prim or property is renamed,
// reparented, or deleted on the edited stage.

import { describe, expect, it } from 'vitest'
import {
  AttributeSpec, Layer, ListOp, RelationshipSpec, sdfChangeBlock, sdfNormalizeListOp,
  type NormalizedListOp,
} from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask } from 'typescript-usd/usd'
import { NsEditorDependentEditsBase } from '../support/nsEditorDependentEditsBase.ts'

// Sdf.PathListOp value: every list of the list op plus its explicit flag,
// the fields Sdf.PathListOp's equality compares.
type PathListOp = NormalizedListOp<string>

// Sdf.PathListOp()
function listOp(): PathListOp {
  return { isExplicit: false, explicitItems: [], addedItems: [], prependedItems: [],
    appendedItems: [], deletedItems: [], orderedItems: [] }
}
// Sdf.PathListOp.CreateExplicit(items)
function explicit(explicitItems: string[] = []): PathListOp {
  return { ...listOp(), isExplicit: true, explicitItems }
}
// Sdf.PathListOp.Create(prependedItems=, appendedItems=, deletedItems=)
function create(items: { prependedItems?: string[], appendedItems?: string[],
  deletedItems?: string[] }): PathListOp {
  return { ...listOp(), prependedItems: items.prependedItems ?? [],
    appendedItems: items.appendedItems ?? [], deletedItems: items.deletedItems ?? [] }
}
// A stored path list op field value as a PathListOp.
function toPathListOp(raw: unknown): PathListOp | null {
  const op = raw instanceof ListOp ? raw.toValue() : sdfNormalizeListOp<unknown>(raw)
  if (!op) return null
  const strs = (items: readonly unknown[]): string[] => items.map(item => String(item))
  return {
    isExplicit: op.isExplicit, explicitItems: strs(op.explicitItems),
    addedItems: strs(op.addedItems), prependedItems: strs(op.prependedItems),
    appendedItems: strs(op.appendedItems), deletedItems: strs(op.deletedItems),
    orderedItems: strs(op.orderedItems),
  }
}

interface ExpectedContents { [key: string]: ExpectedContents | PathListOp }
const isPathListOp = (v: ExpectedContents | PathListOp): v is PathListOp =>
  typeof (v as PathListOp).isExplicit === 'boolean' && Array.isArray((v as PathListOp).explicitItems)

// Stage.Open(layer, Usd.Stage.LoadAll) and Stage.Open(layer, sessionLayer).
const openLayer = (layer: Layer, sessionLayer?: Layer): Promise<Stage> =>
  Stage.openMasked(layer, StagePopulationMask.all(),
    sessionLayer ? { sessionLayerPath: sessionLayer.identifier } : undefined)

// Processes the layer changes of re-imported layers on each stage, which
// Python's synchronous change processing does at ImportFromString.
async function flushChanges(...stages: Stage[]): Promise<void> {
  for (const stage of stages) await stage.flushChanges()
}

// Verifies the expected layer contents of a layer in relation to the 
// prim and property hierarchies and the PathListOp field values of the
// properties' connectionPaths or target fields (for attributes and 
// relationships respectively).
//
// The format of the expected contents is a nested dictionary 
// representing the full prim hierarchy as demonstrated in the example:
//
// {
//     "/Root" : {
//         ".rootAttr" : Sdf.PathListOp(),
//         "/A" : {
//             ".fooAttr" : Sdf.PathListOp.CreateExplicit([])
//         },
//         "/B" : {
//             ".barAttr" : Sdf.PathListOp.CreateExplicit([
//                 "/Root/A.fooAttr"]),
//             ".bazRel" : Sdf.PathListOp.Create(
//                 deletedItems = ["/Root/A"],
//                 prependedItems = ["/Root/B"])
//         }
//     }
// }
//
// These expected contents indicate that a layer is expected to have a root 
// prim at path /Root.
// The prim /Root is expected to have prim children (indicated by 
// preceding '/') "A" and "B" (paths /Root/A and /Root/B respectively).
// /Root is also expected to have a property child (indicated by preceding 
// '.') rootAttr (path /Root.rootAttr)
// /Root/A must have just the property /Root/A.fooAttr
// /Root/B must have just the properties /Root/B.barAttr and /Root/B.bazRel
// Each propery must have its connectionPaths or targets field (depending 
// on the property spec's actual type) return the matching Sdf.PathListOp
// when the field is queried from the layer.
//
function verifyLayerContents(layer: Layer, expectedContentsDict: ExpectedContents): void {
  // Verify the expected contents dictionary is a valid format first for
  // aid in debugging test failures.
  verifyExpectedLayerContentsFormat(expectedContentsDict)

  // Verify the expected number of root prims
  const rootPrimNames = layer.getRootPrims().keys()
  expect(rootPrimNames.length,
    `The expected number of root prims in ${JSON.stringify(Object.keys(expectedContentsDict))} ` +
    `doesn't match the number of root prims ${JSON.stringify(rootPrimNames)} on layer ${layer.identifier}`)
    .toBe(Object.keys(expectedContentsDict).length)

  // Verify the expected contents of eache root prim.
  for (const [rootPrimPath, expectedChild] of Object.entries(expectedContentsDict)) {
    verifyPrimContents(layer, rootPrimPath, expectedChild as ExpectedContents)
  }
}

// This is a helper for writing and updating the test. This just makes sure
// the expectedContents dictionary is in the correct format and can be called
// before using an expectedContents dictionary to actually verify any layer 
// contents. Makes it easier to distinguish between test writing error and 
// test failures.
function verifyExpectedLayerContentsFormat(expectedContents: ExpectedContents | PathListOp,
  pathKey: string | null = null): void {
  expect(!isPathListOp(expectedContents),
    `Expected contents for prim key '${pathKey ?? 'None'}' is not a dictionary`).toBe(true)
  for (const [k, v] of Object.entries(expectedContents as ExpectedContents)) {
    if (k.startsWith('.')) {
      expect(isPathListOp(v),
        `Value '${JSON.stringify(v)}' for property key '${k}' is invalid; it must be an Sdf.PathListOp`)
        .toBe(true)
    } else if (k.startsWith('/')) {
      verifyExpectedLayerContentsFormat(v, k)
    } else {
      expect(false, `Invalid expected contents dictionary key '${k}'; it must start with '/' for ` +
        `prim children or '.' for property children`).toBe(true)
    }
  }
}

// Verifies the contents of a prim in the layer has the expected contents
// indicated by the expectedContentsDict
function verifyPrimContents(layer: Layer, primPath: string, expectedContentsDict: ExpectedContents): void {
  // Prim must exist
  const prim = layer.getPrimAtPath(primPath)
  expect(prim, `Expected to find prim at path ${primPath} in layer ${layer.identifier}`).toBeTruthy()

  // Prim must have the same number of prim and property children as 
  // indicated in the expected contents.
  const propertyNames = prim!.getProperties().keys()
  const childNames = prim!.getNameChildren().keys()
  expect(propertyNames.length + childNames.length,
    `The expected number of prims and properties in ${JSON.stringify(Object.keys(expectedContentsDict))} ` +
    `doesn't match the combined number of child properties ${JSON.stringify(propertyNames)} and prims ` +
    `${JSON.stringify(childNames)} on the prim at ${primPath} in layer ${layer.identifier}`)
    .toBe(Object.keys(expectedContentsDict).length)

  // Verify each expected child.
  for (const [childName, expectedChildContent] of Object.entries(expectedContentsDict)) {
    // Create the full path of the child object which may be a prim or
    // a property
    const childPath = primPath + childName

    // Verify the contents match for the appropriate child type.
    if (childName.startsWith('.')) {
      verifyPropertyContents(layer, childPath, expectedChildContent as PathListOp)
    } else {
      verifyPrimContents(layer, childPath, expectedChildContent as ExpectedContents)
    }
  }
}

// Verifies the contents of a property in the layer has the expected 
// connections or relationship targets listOp value.
function verifyPropertyContents(layer: Layer, propPath: string, expectedListOpValue: PathListOp): void {
  // Property must exist
  const prop = layer.getPropertyAtPath(propPath)
  expect(prop, `Expected to find property at path ${propPath} in layer ${layer.identifier}`).toBeTruthy()

  if (prop instanceof AttributeSpec) {
    // Is attribute, connectionPaths field must match listOp
    const listOpValue = toPathListOp(prop.getInfo('connectionPaths'))
    expect(listOpValue, `Attribute at ${propPath} has connectionPaths value which does not match ` +
      'the expected value').toEqual(expectedListOpValue)
  } else if (prop instanceof RelationshipSpec) {
    // Is relationship, targets field must match listOp
    const listOpValue = toPathListOp(prop.getInfo('targetPaths'))
    expect(listOpValue, `Relationship at ${propPath} has targets value which does not match ` +
      'the expected value').toEqual(expectedListOpValue)
  } else {
    // Invalid property type, always fail.
    expect.fail(`Property at ${propPath} is not a valid property type`)
  }
}

describe('TestUsdNamespaceEditorDependentEditsTargetPathFixup', () => {
  // self.ApplyEdits of TestUsdNamespaceEditorDependentEditsBase.
  const base = new NsEditorDependentEditsBase()

  it('test_BasicReferences', async () => {
    // Tests target-path fixup after downstream dependency namespace edits
    // across a reference.

    // Layer 1 defines /Ref/Child (prim to edit) and /Ref/Child.attr 
    // (property to edit), /Ref/RefSibling (reparent destination), and 
    // /Local with local rel and connection references to /Ref/Child. It also
    // has an internal ref to /Ref, which /Local targets as well.
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "Ref" {
        def "Child" {
          custom int attr
        }
      }
                
      def "RefSibling" {
      }

      def "Local" {
        custom rel rel 
        append rel rel = [</Ref/Child>, </Ref/Child.attr>]
        prepend rel rel = [</InternalRef/Child>, </InternalRef/Child.attr>]
                
        custom int conn
        append int conn.connect = </Ref/Child.attr>
        prepend int conn.connect = </InternalRef/Child.attr>
      }
                
      def "InternalRef"  (
        references = </Ref>
      ) {
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 references /Ref from /Prim and defines /Other
    // with rel and connection references pointing at /Prim/Child.attr.
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      def "Prim" (
        references = @${layer1.identifier}@</Ref>
      ) {
      }

      def "Other" {
        custom rel rel = [</Prim/Child>, </Prim/Child.attr>]
        custom int conn
        int conn.connect = </Prim/Child.attr>
      }
    `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2)

    // Create an editor for stage 1 with stage 2 as a dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Child', '/InternalRef/Child.attr'],
          appendedItems: ['/Ref/Child', '/Ref/Child.attr']}),
        '.conn': create({
          prependedItems: ['/InternalRef/Child.attr'],
          appendedItems: ['/Ref/Child.attr']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })
    
    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)


    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Child', '/InternalRef/Child.renamed'],
          appendedItems: ['/Ref/Child', '/Ref/Child.renamed']}),
        '.conn': create({
          prependedItems: ['/InternalRef/Child.renamed'],
          appendedItems: ['/Ref/Child.renamed']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.renamed']),
        '.conn': explicit(['/Prim/Child.renamed']),
      },
    })
    
    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)


    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Renamed', '/InternalRef/Renamed.renamed'],
          appendedItems: ['/Ref/Renamed', '/Ref/Renamed.renamed']}),
        '.conn': create({
          prependedItems: ['/InternalRef/Renamed.renamed'],
          appendedItems: ['/Ref/Renamed.renamed']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Renamed', '/Prim/Renamed.renamed']),
        '.conn': explicit(['/Prim/Renamed.renamed']),
      },
    })
    
    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed.renamed -> /RefSibling.moved", () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)

    })
    // Target paths containing /Ref/Renamed.renamed directly can be 
    // updated to the new path. However, those targeting it across a 
    // reference (internal or not) no longer get the new .moved attribute
    // composed in, so target paths containing /InternalRef/Renamed.renamed
    // (layer 1) or /Prim/Renamed.renamed (layer 2) have that path removed 
    // instead.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {},
      },
      '/RefSibling': {
        '.moved': listOp()
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Renamed'],
          appendedItems: ['/Ref/Renamed', '/RefSibling.moved']}),
        '.conn': create({
          prependedItems: [],
          appendedItems: ['/RefSibling.moved']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Renamed']),
        '.conn': explicit(),
      },
    })
    
    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed -> /RefSibling/Moved", () => {
      expect(editor.movePrimAtPath(
        '/Ref/Renamed', '/RefSibling/Moved')).toBe(true)

    })
    // For the same reason as above, target paths containing 
    // /InternalRef/Renamed (layer 1) or /Prim/Renamed (layer 2) have that 
    // path removed, while target paths containing /Ref/Renamed are 
    // updated to /RefSibling/Moved.
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
        '.moved': listOp(),
        '/Moved': {},
      },
      '/Local': {
        '.rel': create({
          prependedItems: [],
          appendedItems: ['/RefSibling/Moved', '/RefSibling.moved']}),
        '.conn': create({
          prependedItems: [],
          appendedItems: ['/RefSibling.moved']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    
    // Reparent: /RefSibling/Moved -> /Ref/Child
    base.applyEdits(editor,
        "Reparent /RefSibling/Moved -> /Ref/Child", () => {
      expect(editor.movePrimAtPath(
        '/RefSibling/Moved', '/Ref/Child')).toBe(true)

    
    })
    // Reparent: /RefSibling.moved -> /Ref/Child.attr
    base.applyEdits(editor,
        "Reparent /RefSibling.moved -> /Ref/Child.attr", () => {
      expect(editor.movePropertyAtPath(
        '/RefSibling.moved', '/Ref/Child.attr')).toBe(true)

    })
    // The prim/property structure returns to its original state with one 
    // notable exception: the listops that don't directly target /Ref/Child 
    // are NOT restored from being emptied.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: [],
          appendedItems: ['/Ref/Child', '/Ref/Child.attr']}),
        '.conn': create({
          prependedItems: [],
          appendedItems: ['/Ref/Child.attr']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    
    // Reinitialize to reset the list ops.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    await flushChanges(stage1, stage2)
    
    // Verify the initial layer contents have been restored.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Child', '/InternalRef/Child.attr'],
          appendedItems: ['/Ref/Child', '/Ref/Child.attr']}),
        '.conn': create({
          prependedItems: ['/InternalRef/Child.attr'],
          appendedItems: ['/Ref/Child.attr']}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })
    
    // Delete: /Ref/Child.attr
    base.applyEdits(editor,
        "Delete /Ref/Child.attr", () => {
      expect(editor.deletePropertyAtPath(
        '/Ref/Child.attr')).toBe(true)
        
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: ['/InternalRef/Child'],
          appendedItems: ['/Ref/Child']}),
        '.conn': create({
          prependedItems: [],
          appendedItems: []}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child']),
        '.conn': explicit(),
      },
    })
    
    // Delete: /Ref/Child
    base.applyEdits(editor,
        "Delete /Ref/Child", () => {
      expect(editor.deletePrimAtPath(
        '/Ref/Child')).toBe(true)
        
    })
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': create({
          prependedItems: [],
          appendedItems: []}),
        '.conn': create({
          prependedItems: [],
          appendedItems: []}),
      },
      '/InternalRef': {
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit([]),
        '.conn': explicit(),
      },
    })

  })
  it('test_BasicPayloads', async () => {
    // Test target path fixup after downstream dependency namespace edits
    // across a payload. This also verifies that target path fixup on a
    // dependent stage is skipped when the payload is unloaded.

    // Layer 1 defines /Ref/Child (prim to edit) and /Ref/Child.attr
    // (property to edit), /RefSibling (reparent destination), and
    // /Local with local rel and connection references to /Ref/Child.
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "Ref" {
        def "Child" {
          custom int attr
        }
      }

      def "RefSibling" {
      }

      def "Local" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]

        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 payloads /Ref from /Prim and defines /Other
    // with rel and connection references pointing at /Prim/Child*.
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      def "Prim" (
        payload = @${layer1.identifier}@</Ref>
      ) {
      }

      def "Other" {
        custom rel rel = [</Prim/Child>, </Prim/Child.attr>]
        custom int conn
        int conn.connect = </Prim/Child.attr>
      }
    `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2)

    // Create an editor for stage 1 with stage 2 as an additional dependent
    // stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Child', '/Ref/Child.attr']),
        '.conn': explicit(['/Ref/Child.attr']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)


    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Child', '/Ref/Child.renamed']),
        '.conn': explicit(['/Ref/Child.renamed']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.renamed']),
        '.conn': explicit(['/Prim/Child.renamed']),
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)


    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Renamed', '/Ref/Renamed.renamed']),
        '.conn': explicit(['/Ref/Renamed.renamed']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Renamed', '/Prim/Renamed.renamed']),
        '.conn': explicit(['/Prim/Renamed.renamed']),
      },
    })

    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed.renamed -> /RefSibling.moved", () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)

    })
    // Target path targeting /Ref/Renamed.renamed directly can be 
    // updated to the new path. However, those targeting it across a 
    // payload no longer get the new .moved attribute composed in, so target  
    // paths containing /Prim/Renamed.renamed (layer 2) have that path 
    // removed instead.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {},
      },
      '/RefSibling': {
        '.moved': listOp()
      },
      '/Local': {
        '.rel': explicit(['/Ref/Renamed', '/RefSibling.moved']),
        '.conn': explicit(['/RefSibling.moved']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Renamed']),
        '.conn': explicit(),
      },
    })

    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed -> /RefSibling/Moved", () => {
      expect(editor.movePrimAtPath(
        '/Ref/Renamed', '/RefSibling/Moved')).toBe(true)

    })
    // For the same reason as above, target paths containing 
    // /Prim/Renamed (layer 2) have that path removed, while target paths 
    // containing /Ref/Renamed are updated to /RefSibling/Moved.
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
        '.moved': listOp(),
        '/Moved': {},
      },
      '/Local': {
        '.rel': explicit(['/RefSibling/Moved', '/RefSibling.moved']),
        '.conn': explicit(['/RefSibling.moved']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })

    // Reinitialize to reset the list ops for the next test case.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    await flushChanges(stage1, stage2)

    // Verify the layers have been returned to their initial state.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Child', '/Ref/Child.attr']),
        '.conn': explicit(['/Ref/Child.attr']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })

    // Delete: /Ref/Child.attr
    base.applyEdits(editor,
        "Delete /Ref/Child.attr", () => {
      expect(editor.deletePropertyAtPath(
        '/Ref/Child.attr')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Child']),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child']),
        '.conn': explicit(),
      },
    })

    // Delete: /Ref/Child
    base.applyEdits(editor,
        "Delete /Ref/Child", () => {
      expect(editor.deletePrimAtPath(
        '/Ref/Child')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit([]),
        '.conn': explicit(),
      },
    })

    // Reset both layers. 
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    await flushChanges(stage1, stage2)

    // Unload /Prim on stage 2 so the payload contents are not composed into 
    // the dependent stage's namespace. When /Prim is unloaded on stage 2,
    // /Prim/Child does not compose into the stage's namespace, so
    // the dependent-stage target-path fixup cannot reach the
    // /Other.rel and /Other.conn entries that point at /Prim/Child*
    // paths. Layer 1's own rel and connection on /Local are still
    // fixed up because the rename happens on stage 1.
    stage2.unload('/Prim')

    // Rename: /Ref/Child -> /Ref/Renamed (with /Prim unloaded)
    base.applyEdits(editor,
        "Rename /Ref/Child -> /Ref/Renamed (/Prim unloaded)", () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)

    })
    // Layer 1 is fixed up as usual since the rename is on stage 1.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Renamed', '/Ref/Renamed.attr']),
        '.conn': explicit(['/Ref/Renamed.attr']),
      },
    })
    // Layer 2 targets are NOT fixed up because /Prim is unloaded on
    // stage 2 and /Prim/Child does not compose to anything.
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })

    // Reload /Prim and observe the broken state: /Other.rel and
    // /Other.conn still point at /Prim/Child paths even though the
    // payload now composes /Prim/Renamed.
    stage2.load('/Prim')
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        '.rel': explicit(['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })

  })
  it('test_BasicSublayers', async () => {
    // Tests path expression fixup after downstream dependency namespace
    // edits across sublayers.
    //
    // This test sets up a four stage hierarchy and registers ONLY stage3
    // as a dependent of the stage 1 editor to show that:
    //
    // - layer1 is fixed up directly because it's the edit target.
    // - layer2 and layer3Sub are fixed up because they sit in
    // stage3's layer stack (transitively or directly).
    // - layer3 is fixed up because stage3 is registered as a dependent stage.
    // - layer4 is NOT fixed up: stage4 was never registered as a
    // dependent stage even though layer4 sublayers layer3.

    // Layer 1 is the edited base layer. It defines /Ref/Child (prim to
    // edit), /Ref/Child.attr (property to edit), /RefSibling
    // (reparent destination), and /Local with rel and connection
    // references targeting /Ref/Child.attr.
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "Ref" {
        def "Child" {
          custom int attr
        }
      }

      def "RefSibling" {
      }

      def "Local" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]

        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 sublayers layer1. It defines /Other2 with rel and
    // connection references targeting /Ref/Child.attr.
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      (
        subLayers = [@${layer1.identifier}@]
      )

      def "Other2" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]
        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer2.importFromString(layer2ImportString)

    // Layer 3 Sub will be a sublayer of layer3. It defines /Other3Sub
    // with rel and connection references targeting /Ref/Child.attr.
    const layer3Sub = Layer.createAnonymous("layer3-sub.usda")
    const layer3SubImportString = `#usda 1.0
      def "Other3Sub" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]
        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer3Sub.importFromString(layer3SubImportString)

    // Layer 3 sublayers layer2 (which sublayers layer1) and
    // layer3Sub. It defines /Other3 with rel and connection references
    // targeting /Ref/Child.attr.
    const layer3 = Layer.createAnonymous("layer3.usda")
    const layer3ImportString = `#usda 1.0
      (
        subLayers = [
          @${layer2.identifier}@,
          @${layer3Sub.identifier}@
        ]
      )

      def "Other3" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]
        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer3.importFromString(layer3ImportString)

    // Layer 4 sublayers layer3. It defines /Other4 with rel and
    // connection references targeting /Ref/Child.attr. Stage 4 is
    // intentionally not registered as a dependent, so layer 4 stays
    // untouched throughout the test.
    const layer4 = Layer.createAnonymous("layer4.usda")
    const layer4ImportString = `#usda 1.0
      (
        subLayers = [@${layer3.identifier}@]
      )

      def "Other4" {
        custom rel rel = [</Ref/Child>, </Ref/Child.attr>]
        custom int conn
        int conn.connect = </Ref/Child.attr>
      }
    `
    layer4.importFromString(layer4ImportString)

    // Open all four layers as stages.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2)
    const stage3 = await openLayer(layer3)
    const stage4 = await openLayer(layer4)

    // Create an editor for stage1 and add ONLY stage3 as a
    // dependent stage. Stage 2 and stage 4 are intentionally left
    // unregistered.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage3)

    // Every layer in stage3's layer stack other than layer1
    // holds its /OtherN prim with the same rel and conn listops, so
    // they all get verified together against the same expected
    // values at each step of the test.
    const _VerifyOtherLayerListOps = (expectedRel: PathListOp, expectedConn: PathListOp): void => {
      verifyLayerContents(layer2, {
        '/Other2': {
          '.rel': expectedRel,
          '.conn': expectedConn,
        },
      })
      verifyLayerContents(layer3Sub, {
        '/Other3Sub': {
          '.rel': expectedRel,
          '.conn': expectedConn,
        },
      })
      verifyLayerContents(layer3, {
        '/Other3': {
          '.rel': expectedRel,
          '.conn': expectedConn,
        },
      })

    }
    // Verify layer4 keeps its original target paths --
    // stage4 was not registered as a dependent stage so /Other4 is
    // never updated regardless of what edits are applied via
    // stage1.
    const _VerifyLayer4Unchanged = (): void => {
      verifyLayerContents(layer4, {
        '/Other4': {
          '.rel': explicit(
            ['/Ref/Child', '/Ref/Child.attr']),
          '.conn': explicit(
            ['/Ref/Child.attr']),
        },
      })

    }
    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Ref/Child', '/Ref/Child.attr']),
        '.conn': explicit(['/Ref/Child.attr']),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(['/Ref/Child', '/Ref/Child.attr']),
      explicit(['/Ref/Child.attr']))
    _VerifyLayer4Unchanged()

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Ref/Child', '/Ref/Child.renamed']),
        '.conn': explicit(
          ['/Ref/Child.renamed']),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(
        ['/Ref/Child', '/Ref/Child.renamed']),
      explicit(['/Ref/Child.renamed']))
    _VerifyLayer4Unchanged()

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.renamed': listOp()},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Ref/Renamed', '/Ref/Renamed.renamed']),
        '.conn': explicit(
          ['/Ref/Renamed.renamed']),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(
        ['/Ref/Renamed', '/Ref/Renamed.renamed']),
      explicit(['/Ref/Renamed.renamed']))
    _VerifyLayer4Unchanged()

    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed.renamed -> /RefSibling.moved", () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {},
      },
      '/RefSibling': {
        '.moved': listOp()
      },
      '/Local': {
        '.rel': explicit(
          ['/Ref/Renamed', '/RefSibling.moved']),
        '.conn': explicit(['/RefSibling.moved']),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(
        ['/Ref/Renamed', '/RefSibling.moved']),
      explicit(['/RefSibling.moved']))
    _VerifyLayer4Unchanged()

    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor,
        "Reparent /Ref/Renamed -> /RefSibling/Moved", () => {
      expect(editor.movePrimAtPath(
        '/Ref/Renamed', '/RefSibling/Moved')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
        '.moved': listOp(),
        '/Moved': {},
      },
      '/Local': {
        '.rel': explicit(
          ['/RefSibling/Moved', '/RefSibling.moved']),
        '.conn': explicit(['/RefSibling.moved']),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(
        ['/RefSibling/Moved', '/RefSibling.moved']),
      explicit(['/RefSibling.moved']))
    _VerifyLayer4Unchanged()

    // Reinitialize all layers so the deletes start from the
    // original list ops without the previous reparent edits.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    layer3Sub.importFromString(layer3SubImportString)
    layer3.importFromString(layer3ImportString)
    layer4.importFromString(layer4ImportString)
    await flushChanges(stage1, stage2, stage3, stage4)

    // Delete: /Ref/Child.attr
    base.applyEdits(editor,
        "Delete /Ref/Child.attr", () => {
      expect(editor.deletePropertyAtPath(
        '/Ref/Child.attr')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(['/Ref/Child']),
        '.conn': explicit(),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(['/Ref/Child']),
      explicit())
    _VerifyLayer4Unchanged()

    // Delete: /Ref/Child
    base.applyEdits(editor,
        "Delete /Ref/Child", () => {
      expect(editor.deletePrimAtPath(
        '/Ref/Child')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
      },
      '/RefSibling': {
      },
      '/Local': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    _VerifyOtherLayerListOps(
      explicit(),
      explicit())
    _VerifyLayer4Unchanged()

  })
  const _RunTestBasicGlobalClassArcs = async (classArcType: string): Promise<void> => {
    // Helper for testing downstream dependency namespace edits and
    // subsequent target path fixup across global class arcs and their
    // implied class specs. classArcType can be either 'inherits' or
    // 'specializes'

    // Layer 1 defines /Class/Child (prim to edit) and /Class/Child.attr
    // (property to edit), /ClassSibling (reparent destination), /Prim
    // which inherits or specializes /Class (so the global class arc
    // propagates as an implied class arc to any layer that references
    // /Prim), and /Local with rel and connection references targeting
    // /Prim/Child.attr (the path translated through /Prim's
    // inherits/specializes arc).
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "Class" {
        def "Child" {
          custom int attr
        }
      }

      def "ClassSibling" {
      }

      def "Prim" (
        ${classArcType} = </Class>
      ) {
      }

      def "Local" {
        custom rel rel = [</Prim/Child>, </Prim/Child.attr>]

        custom int conn
        int conn.connect = </Prim/Child.attr>
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 references /Prim from layer1 as /Prim2 so the global
    // class arc on /Prim propagates as an implied class arc to /Class
    // in layer2's namespace. /Other has rel and connection references
    // targeting /Prim2/Child.attr (the path translated through the
    // reference plus inherited/specialized class arc).
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      def "Prim2" (
        references = @${layer1.identifier}@</Prim>
      ) {
      }

      over "Class" {
        over "Child" {
          custom int attr
        }
      }

      def "Other" {
        custom rel rel 
        append rel rel = [</Prim2/Child>, </Prim2/Child.attr>]
        prepend rel rel = [</Class/Child>, </Class/Child.attr>]
        custom int conn
        int conn.connect = [</Prim2/Child.attr>, </Class/Child.attr>]
      }
    `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2)

    // Create an editor for stage 1 with stage 2 as an additional
    // dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {'.attr': listOp()},
      },
      '/ClassSibling': {
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Prim/Child', '/Prim/Child.attr']),
        '.conn': explicit(['/Prim/Child.attr']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {'.attr': listOp()},
      },
      '/Other': {
        '.rel': create({
          prependedItems: ['/Class/Child', '/Class/Child.attr'],
          appendedItems: ['/Prim2/Child', '/Prim2/Child.attr']}),
        '.conn': explicit(
          ['/Prim2/Child.attr', '/Class/Child.attr']),
      },
    })

    // Rename: /Class/Child.attr -> /Class/Child.renamed
    base.applyEdits(editor,
        '/Class/Child.attr -> /Class/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Class/Child.attr', '/Class/Child.renamed')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {'.renamed': listOp()},
      },
      '/ClassSibling': {
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Prim/Child', '/Prim/Child.renamed']),
        '.conn': explicit(
          ['/Prim/Child.renamed']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {'.renamed': listOp()},
      },
      '/Other': {
        '.rel': create({
          prependedItems: ['/Class/Child', '/Class/Child.renamed'],
          appendedItems: ['/Prim2/Child', '/Prim2/Child.renamed']}),
        '.conn': explicit(
          ['/Prim2/Child.renamed', '/Class/Child.renamed']),
      },
    })

    // Rename: /Class/Child -> /Class/Renamed
    base.applyEdits(editor, '/Class/Child -> /Class/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Class/Child', '/Class/Renamed')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Renamed': {'.renamed': listOp()},
      },
      '/ClassSibling': {
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(
          ['/Prim/Renamed', '/Prim/Renamed.renamed']),
        '.conn': explicit(
          ['/Prim/Renamed.renamed']),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Renamed': {'.renamed': listOp()},
      },
      '/Other': {
        '.rel': create({
          prependedItems: ['/Class/Renamed', '/Class/Renamed.renamed'],
          appendedItems: ['/Prim2/Renamed', '/Prim2/Renamed.renamed']}),
        '.conn': explicit(
          ['/Prim2/Renamed.renamed', '/Class/Renamed.renamed']),
      },
    })

    // Reparent: /Class/Renamed.renamed -> /ClassSibling.moved
    base.applyEdits(editor,
        "Reparent /Class/Renamed.renamed -> /ClassSibling.moved", () => {
      expect(editor.movePropertyAtPath(
        '/Class/Renamed.renamed', '/ClassSibling.moved')).toBe(true)

    })
    // /ClassSibling is not inherited or specialized by /Prim, so the
    // property is no longer reachable through /Prim's class arc and
    // /Prim/Renamed.renamed drops out of /Local's listops. /Prim/Renamed
    // is still reachable via the class arc since /Class/Renamed
    // still exists with its property removed.
    verifyLayerContents(layer1, {
      '/Class': {
        '/Renamed': {},
      },
      '/ClassSibling': {
        '.moved': listOp()
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(['/Prim/Renamed']),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Renamed': {},
      },
      '/Other': {
        '.rel': create({
          prependedItems: ['/Class/Renamed'],
          appendedItems: ['/Prim2/Renamed']}),
        '.conn': explicit(),
      },
    })

    // Reparent: /Class/Renamed -> /ClassSibling/Moved
    base.applyEdits(editor,
        "Reparent /Class/Renamed -> /ClassSibling/Moved", () => {
      expect(editor.movePrimAtPath(
        '/Class/Renamed', '/ClassSibling/Moved')).toBe(true)

    })
    // The prim itself is moved out from under /Class so /Prim/Renamed is
    // no longer reachable via the class arc and drops out of /Local's
    // listops as well.
    verifyLayerContents(layer1, {
      '/Class': {
      },
      '/ClassSibling': {
        '.moved': listOp(),
        '/Moved': {},
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {},
      '/Other': {
        '.rel': create({
          prependedItems: [],
          appendedItems: []}),
        '.conn': explicit(),
      },
    })

    // Reinitialize to reset the list ops for the next test case.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    await flushChanges(stage1, stage2)

    // Delete: /Class/Child.attr
    base.applyEdits(editor,
        "Delete /Class/Child.attr", () => {
      expect(editor.deletePropertyAtPath(
        '/Class/Child.attr')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {},
      },
      '/ClassSibling': {
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(['/Prim/Child']),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {},
      },
      '/Other': {
        '.rel': create({
          prependedItems: ['/Class/Child'],
          appendedItems: ['/Prim2/Child']}),
        '.conn': explicit(),
      },
    })

    // Delete: /Class/Child
    base.applyEdits(editor,
        "Delete /Class/Child", () => {
      expect(editor.deletePrimAtPath(
        '/Class/Child')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Class': {
      },
      '/ClassSibling': {
      },
      '/Prim': {
      },
      '/Local': {
        '.rel': explicit(),
        '.conn': explicit(),
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {},
      '/Other': {
        '.rel': create({
          prependedItems: [],
          appendedItems: []}),
        '.conn': explicit(),
      },
    })

  }
  it('test_BasicInherits', async () => {
    await _RunTestBasicGlobalClassArcs("inherits")

  })
  it('test_BasicSpecializes', async () => {
    await _RunTestBasicGlobalClassArcs("specializes")

  })
  it('test_BasicVariants', async () => {
    // Tests target path fixup from downstream dependency namespace edits
    // across a reference contained within a variant both when the variant is
    // selected and when it is not.

    // Layer 1 defines /Ref/Child (prim to edit) and /Ref/Child.attr
    // (property to edit).
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "Ref" {
        def "Child" {
          custom int attr
        }
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 defines /Variant with a variant set "v" whose "selected"
    // variant references /Ref from layer1, and /Prim which references
    // /Variant. The session layer below selects v="selected" on /Prim only
    // (not on /Variant), so on stage2:
    //   - /Prim picks up variantSet "v" via the reference, has the
    //     selection from the session layer, composes the variant body, and
    //     therefore composes /Ref via the reference inside the variant.
    //     /Prim/Child exists on stage2 and depends on /Ref/Child in layer1.
    //   - /Variant has variantSet "v" but no selection, so the variant body
    //     never activates for /Variant itself. /Variant/Child does NOT
    //     compose on stage2 and has no dependency on anything in layer1.
    // /Other's rel and conn list both target /Prim/Child* and /Variant/Child*
    // paths; only the /Prim/Child* paths have composed dependencies and so
    // only those get fixed up when /Ref/Child or /Ref/Child.attr are edited
    // on stage1.
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      def "Variant" (
        variantSets = ["v"]
      ) {
        variantSet "v" = {
          "selected" (
            references = @${layer1.identifier}@</Ref>
          ) {
          }
        }
      }

      def "Prim" (
        references = </Variant>
      ) {
      }

      def "Other" {
        custom rel rel 
        append rel rel = [</Prim/Child>, </Prim/Child.attr>]
        prepend rel rel = [</Variant/Child>, </Variant/Child.attr>]
        custom int conn
        int conn.connect = [</Prim/Child.attr>, </Variant/Child.attr>]
      }
    `
    layer2.importFromString(layer2ImportString)

    // Session layer authors the variant selection on /Prim so that the
    // reference inside the variant composes when stage2 is opened.
    const sessionLayer = Layer.createAnonymous("session.usda")
    sessionLayer.importFromString(`#usda 1.0
      over "Prim" (
        variants = {
          string v = "selected"
        }
      ) {
      }
    `)

    // Open both layers as stages. Stage 2 is opened with the session layer
    // to provide the variant selection.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2, sessionLayer)

    // Create an editor for stage 1 with stage 2 as an additional dependent
    // stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.attr': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Child', '/Prim/Child.attr']}),
        '.conn': explicit(
          ['/Prim/Child.attr', '/Variant/Child.attr']),
      },
    })

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor,
        '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)

    })
    // Only /Prim/Child.attr is fixed up. /Variant/Child.attr has no
    // composed dependency because the variant selection is only authored
    // on /Prim, and not on /Variant and therefore is left alone.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.renamed': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Child', '/Prim/Child.renamed']}),
        '.conn': explicit(
          ['/Prim/Child.renamed', '/Variant/Child.attr']),
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)

    })
    // Only /Prim/Child is fixed up for the same reason as above.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.renamed': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Renamed', '/Prim/Renamed.renamed']}),
        '.conn': explicit(
          ['/Prim/Renamed.renamed', '/Variant/Child.attr']),
      },
    })

    // Reinitialize to reset the list ops for the next test case.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    await flushChanges(stage1, stage2)

    // Delete: /Ref/Child.attr
    base.applyEdits(editor, "Delete /Ref/Child.attr", () => {
      expect(editor.deletePropertyAtPath('/Ref/Child.attr')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Child']}),
        '.conn': explicit(
          ['/Variant/Child.attr']),
      },
    })

    // Delete: /Ref/Child
    base.applyEdits(editor, "Delete /Ref/Child", () => {
      expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/Ref': {},
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: []}),
        '.conn': explicit(
          ['/Variant/Child.attr']),
      },
    })

    // Reinitialize layers and mute the session layer so /Prim has no
    // variant selection on stage2. Now, /Prim/Child no longer exists on 
    // stage2, so any paths referring to it or its children will not be 
    // fixed up by the namespace editor.
    sdfChangeBlock(() => {
      layer1.importFromString(layer1ImportString)
      layer2.importFromString(layer2ImportString)
    })
    await flushChanges(stage1, stage2)
    await stage2.muteLayer(sessionLayer.identifier)

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor,
        'Muted: /Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)

    })
    // Now that there is no variant selection, layer1 is updated, but all the
    // target paths on /Other are unchanged.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {'.renamed': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Child', '/Prim/Child.attr']}),
        '.conn': explicit(
          ['/Prim/Child.attr', '/Variant/Child.attr']),
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    // layer1 is updated; layer2 /Other rel/conn remain unchanged.
    base.applyEdits(editor, 'Muted: /Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/Ref/Child', '/Ref/Renamed')).toBe(true)

    })
    // Now that there is no variant selection, layer1 is updated, but all the
    // target paths on /Other are unchanged.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {'.renamed': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Variant/Child', '/Variant/Child.attr'],
          appendedItems: ['/Prim/Child', '/Prim/Child.attr']}),
        '.conn': explicit(
          ['/Prim/Child.attr', '/Variant/Child.attr']),
      },
    })

  })
  it('test_BasicRelocates', async () => {
    // Tests target path fixup after downstream dependency namespace edits
    // across a reference where a child of the referencing prim is then
    // relocated.

    // Layer 1 defines /World/Ref/Child (the prim to edit) and
    // /World/Ref/Child.attr (the property to edit). /World/RefSibling
    // is the reparent destination outside the /Ref subtree.
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
      def "World" {
        def "Ref" {
          def "Child" {
            custom int attr
          }
        }
        def "RefSibling" {
        }
      }
    `
    layer1.importFromString(layer1ImportString)

    // Layer 2 defines /Prim which references /World, plus a relocates 
    // that moves /Prim/Ref to /Relocated. 
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
      (
        relocates = {
          </Prim/Ref> : </Relocated>,
        }
      )

      def "Prim" (
        references = @${layer1.identifier}@</World>
      ) {
      }

      def "Relocated" {
      }

      def "Other" {
        custom rel rel
        append rel rel = [</Relocated/Child>, </Relocated/Child.attr>]
        prepend rel rel = [</Prim/Ref/Child>, </Prim/Ref/Child.attr>]
        custom int conn
        int conn.connect = [</Relocated/Child.attr>, </Prim/Ref/Child.attr>]
      }
    `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openLayer(layer1)
    const stage2 = await openLayer(layer2)

    // Create an editor for stage 1 with stage 2 as an additional dependent
    // stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {'.attr': listOp()},
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Child', '/Relocated/Child.attr']}),
        '.conn': explicit(
          ['/Relocated/Child.attr', '/Prim/Ref/Child.attr']),
      },
    })

    // Rename: /World/Ref/Child.attr -> /World/Ref/Child.renamed
    base.applyEdits(editor,
        '/World/Ref/Child.attr -> /World/Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath(
        '/World/Ref/Child.attr', '/World/Ref/Child.renamed')).toBe(true)

    })
    // On stage2 the relocated property /Relocated/Child.attr renames to
    // /Relocated/Child.renamed; the appended rel entry and the first
    // conn entry are fixed up. /Prim/Ref/Child.attr in /Other has no
    // composed dependency on /World/Ref/Child.attr and stays as-is.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {'.renamed': listOp()},
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Child', '/Relocated/Child.renamed']}),
        '.conn': explicit(
          ['/Relocated/Child.renamed', '/Prim/Ref/Child.attr']),
      },
    })

    // Rename: /World/Ref/Child -> /World/Ref/Renamed
    base.applyEdits(editor,
        '/World/Ref/Child -> /World/Ref/Renamed', () => {
      expect(editor.movePrimAtPath(
        '/World/Ref/Child', '/World/Ref/Renamed')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Renamed': {'.renamed': listOp()},
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Renamed', '/Relocated/Renamed.renamed']}),
        '.conn': explicit(
          ['/Relocated/Renamed.renamed', '/Prim/Ref/Child.attr']),
      },
    })

    // Reparent: /World/Ref/Renamed.renamed -> /World/RefSibling.moved
    base.applyEdits(editor,
        "Reparent /World/Ref/Renamed.renamed -> " +
        "/World/RefSibling.moved", () => {
      expect(editor.movePropertyAtPath(
        '/World/Ref/Renamed.renamed', '/World/RefSibling.moved')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Renamed': {},
        },
        '/RefSibling': {'.moved': listOp()},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Renamed', '/Prim/RefSibling.moved']}),
        '.conn': explicit(
          ['/Prim/RefSibling.moved', '/Prim/Ref/Child.attr']),
      },
    })

    // Reparent: /World/Ref/Renamed -> /World/RefSibling/Moved
    base.applyEdits(editor,
        "Reparent /World/Ref/Renamed -> /World/RefSibling/Moved", () => {
      expect(editor.movePrimAtPath(
        '/World/Ref/Renamed', '/World/RefSibling/Moved')).toBe(true)

    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {},
        '/RefSibling': {
          '.moved': listOp(),
          '/Moved': {},
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Prim/RefSibling/Moved', '/Prim/RefSibling.moved']}),
        '.conn': explicit(
          ['/Prim/RefSibling.moved', '/Prim/Ref/Child.attr']),
      },
    })

    // Edit: Move /World/RefSibling/Moved back to its original path 
    // /World/Ref/Child.
    base.applyEdits(editor,
        "Reparent /World/RefSibling/Moved -> /World/Ref/Child", () => {
      expect(editor.movePrimAtPath(
        '/World/RefSibling/Moved', '/World/Ref/Child')).toBe(true)

    })
    // Edit: Move /World/RefSibling/.moved back to its original path 
    // /World/Ref/Child.attr.
    base.applyEdits(editor,
        "Reparent /World/RefSibling.moved -> /World/Ref/Child.attr", () => {
      expect(editor.movePropertyAtPath(
        '/World/RefSibling.moved', '/World/Ref/Child.attr')).toBe(true)
    
    })
    // Verify the layers are back to their initial contents.
    // Unlike the references test, no target paths were stripped through
    // the reparent sequence: each move kept a valid composed path
    // on stage 2, so reparenting back fully restores both layers.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {'.attr': listOp()},
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Child', '/Relocated/Child.attr']}),
        '.conn': explicit(
          ['/Relocated/Child.attr', '/Prim/Ref/Child.attr']),
      },
    })

    // Delete: /World/Ref/Child.attr
    base.applyEdits(editor, 'Delete /World/Ref/Child.attr', () => {
      expect(editor.deletePropertyAtPath(
        '/World/Ref/Child.attr')).toBe(true)

    })
    // On stage2 the property at /Relocated/Child.attr is removed; the
    // /Relocated/Child.attr entries drop from rel and conn.
    // /Prim/Ref/Child.attr is untouched as before.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {},
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: ['/Relocated/Child']}),
        '.conn': explicit(
          ['/Prim/Ref/Child.attr']),
      },
    })

    // Delete: /World/Ref/Child
    base.applyEdits(editor, 'Delete /World/Ref/Child', () => {
      expect(editor.deletePrimAtPath('/World/Ref/Child')).toBe(true)

    })
    // On stage2 the relocated prim /Relocated/Child is removed; the
    // remaining /Relocated/Child entry drops from rel.
    // /Prim/Ref/Child* entries are untouched.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {},
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        '.rel': create({
          prependedItems: ['/Prim/Ref/Child', '/Prim/Ref/Child.attr'],
          appendedItems: []}),
        '.conn': explicit(
          ['/Prim/Ref/Child.attr']),
      },
    })



  })

})
