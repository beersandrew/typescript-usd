// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorTargetPathFixup.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorTargetPathFixup.py (registered
// as testUsdNamespaceEditorTargetPathFixup), with its testenv basic/ layers.
// The test runs with the testenv as the working directory, so relative
// identifiers name the fixture.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AttributeSpec, Layer, ListOp, RelationshipSpec, sdfNormalizeListOp,
  type NormalizedListOp,
} from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdNamespaceEditorTargetPathFixup')

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

// Stage.Open(layer).
const openLayer = (layer: Layer): Promise<Stage> =>
  Stage.openMasked(layer, StagePopulationMask.all())

// UsdPrim.GetChildrenNames()
function childrenNames(stage: Stage, primPath: string): string[] {
  return stage.getPrim(primPath)!.getChildren().map(child => child.path.slice(child.path.lastIndexOf('/') + 1))
}
// stage.GetAttributeAtPath / GetPropertyAtPath for an attribute.
function getAttr(stage: Stage, propPath: string) {
  const dot = propPath.lastIndexOf('.')
  return stage.getPrim(propPath.slice(0, dot))!.getAttr(propPath.slice(dot + 1))!
}
// stage.GetRelationshipAtPath
function getRel(stage: Stage, propPath: string) {
  const dot = propPath.lastIndexOf('.')
  return stage.getPrim(propPath.slice(0, dot))!.rel(propPath.slice(dot + 1))
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
// These expected contentss indicate that a layer is expected to have a root 
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

describe('TestUsdNamespaceEditorTargetPathFixup', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => process.chdir(cwd))

  let stage: Stage
  let rootLayer: Layer
  let sub1Layer: Layer
  let sub2Layer: Layer

  // Opens the basic stage and verifies its initial contents.
  const openBasicStage = async (): Promise<void> => {
    stage = (await Stage.open("basic/root.usda"))!
    await stage.reload()
    const stageLayers = stage.getUsedLayers()

    // The stage has three layers whose contents we'll verify. Store each
    // of these layers and verify their original contents.

    // Root layer
    rootLayer = Layer.find("basic/root.usda")!
    expect(rootLayer).toBeTruthy()
    expect(stageLayers).toContain(rootLayer)
    verifyLayerContents(rootLayer, {
      "/Root" : {
        "/A" : {
          ".otherAttr" : explicit([
            "/Root/A.targetAttr"]),
          "/B" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A/B.targetAttr"]})
          },                       
          "/C" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A/C.targetAttr"]}),
            ".targetAttr" : create({
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A.targetAttr"]})
          },
        },
        "/OtherPrim" : {
          ".otherAttr" : explicit([
            "/Root/A.targetAttr"]),
          ".otherRel" : create({
            deletedItems: [
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr"],
            prependedItems: ["/Root/A"],
            appendedItems: [
              "/Root/A/B",
              "/Root/A/C"
            ]})
        }
      }
    })
    
    // First sublayer
    sub1Layer = Layer.find("basic/sub1.usda")!
    expect(sub1Layer).toBeTruthy()
    expect(stageLayers).toContain(sub1Layer)
    verifyLayerContents(sub1Layer, {
      "/Root" : {
        "/A" : {
          ".otherAttr" : create({
            prependedItems: ["/Root/A.targetAttr"]}),
          "/B" : {
            ".targetAttr" : create({
              prependedItems: [
                "/Root/A.targetAttr",
                "/Root/A/C.targetAttr"]})
          }
        },
        "/OtherPrim" :  {
          ".otherAttr" : create({
            deletedItems: ["/Root/A.targetAttr"],
            prependedItems: ["/Root/A/B.targetAttr"],
            appendedItems: ["/Root/A/C.targetAttr"]}),
          ".otherRel" : create({
            deletedItems: [
              "/Root/A",
              "/Root/A/B",
              "/Root/A/C"],
            prependedItems: ["/Root/A.targetAttr"],
            appendedItems: [
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"]}),
        }
      }
    })

    // Second sublayer
    sub2Layer = Layer.find("basic/sub2.usda")!
    expect(sub2Layer).toBeTruthy()
    expect(stageLayers).toContain(sub2Layer)
    verifyLayerContents(sub2Layer, {
      "/Root" : {
        "/A" : {
          ".targetAttr" : explicit([
            "/Root/A/B.targetAttr",
            "/Root/A/C.targetAttr"])
        },
        "/OtherPrim" : {
          ".otherAttr" : explicit([
            "/Root/A.targetAttr",
            "/Root/A/B.targetAttr",
            "/Root/A/C.targetAttr"]),
          ".otherRel" : create({
            deletedItems: ["/Root/A"],
            prependedItems: ["/Root/A/B"],
            appendedItems: ["/Root/A/C"]}),
        }
      }
    })
     
  }

  const applyCompareAndReset = async (editor: NamespaceEditor, rootContents: ExpectedContents,
    sub1Contents: ExpectedContents, sub2Contents: ExpectedContents): Promise<void> => {
    const result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(result.warnings).toEqual([])
    expect(editor.applyEdits()).toBe(true)
    verifyLayerContents(rootLayer, rootContents)
    verifyLayerContents(sub1Layer, sub1Contents)
    verifyLayerContents(sub2Layer, sub2Contents)
    await stage.reload()
  }

  it('test_DeletePrimWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root. This is the only root prim so it deletes everything.
    // This is mostly a sanity check that deleting everything at the root
    // doesn't cause any issues with respect to found target path 
    // dependencies
    expect(editor.deletePrimAtPath("/Root")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {},
      /* sub1Contents */ {},
      /* sub2Contents */ {})

    // Delete /Root/A. This deletes it and its descendants. All connections
    // and relationship target listOps in /Root/OtherPrim are cleaned up to 
    // remove targets to objects under /Root/A. Note all listOp items are 
    // removed (including listOp deletes) and that fully cleared explicit 
    // list ops become an explicit empty listOp (i.e. None) while 
    // non-explicit list ops end up with no opinion.
    expect(editor.deletePrimAtPath("/Root/A")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([]),
            ".otherRel" : listOp()
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/OtherPrim" :  {
            ".otherAttr" : listOp(),
            ".otherRel" : listOp(),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([]),
            ".otherRel" : listOp(),
          }
        }
      })

    // Delete /Root/A/B. All connections and relationship target listOps that
    // list prim /Root/A/B or property /Root/A/B.targetAttr have those paths
    // removed.
    expect(editor.deletePrimAtPath("/Root/A/B")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: ["/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: ["/Root/A/C"]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Delete /Root/A/C. All connections and relationship target listOps that
    // list prim /Root/A/C or property /Root/A/C.targetAttr have those paths
    // removed.
    expect(editor.deletePrimAtPath("/Root/A/C")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: ["/Root/A/B"]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: ["/Root/A.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/B.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"]}),
          }
        }
      })

  })
  it('test_DeletePropertyWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root/A.targetAttr. All connections and relationship target 
    // listOps that list the property /Root/A.targetAttr have that path
    // removed.
    expect(editor.deletePropertyAtPath("/Root/A.targetAttr")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: ["/Root/A/B.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([]),
            ".otherRel" : create({
              deletedItems: ["/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : listOp(),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {},
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })
      
    // Delete /Root/A/B.targetAttr. All connections and relationship target 
    // listOps that list the property /Root/A/B.targetAttr have that path
    // removed.
    expect(editor.deletePropertyAtPath("/Root/A/B.targetAttr")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: ["/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {}
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })
      
    // Delete /Root/A/C.targetAttr. All connections and relationship target 
    // listOps that list the property /Root/A/C.targetAttr have that path
    // removed.
    expect(editor.deletePropertyAtPath("/Root/A/C.targetAttr")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: ["/Root/A.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: ["/Root/A/B.targetAttr",]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

  })
  it('test_RenamePrimWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Test renaming various prims on the stage. Any connection or 
    // relationship target paths that refer to the prim or any of its 
    // descendants will be fixed to use the path with the rename applied.

    // Rename /Root/A
    expect(editor.renamePrim(
      stage.getPrim("/Root/A")!, "Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/Foo" : {
            ".otherAttr" : explicit([
              "/Root/Foo.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/Foo/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/Foo/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/Foo/B.targetAttr",
                  "/Root/Foo.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/Foo.targetAttr",
                "/Root/Foo/B.targetAttr"],
              prependedItems: ["/Root/Foo"],
              appendedItems: [
                "/Root/Foo/B",
                "/Root/Foo/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/Foo" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/Foo.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/Foo.targetAttr",
                  "/Root/Foo/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/Foo.targetAttr"],
              prependedItems: ["/Root/Foo/B.targetAttr"],
              appendedItems: ["/Root/Foo/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/Foo",
                "/Root/Foo/B",
                "/Root/Foo/C"],
              prependedItems: ["/Root/Foo.targetAttr"],
              appendedItems: [
                "/Root/Foo/B.targetAttr",
                "/Root/Foo/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/Foo" : {
            ".targetAttr" : explicit([
              "/Root/Foo/B.targetAttr",
              "/Root/Foo/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/Foo.targetAttr",
              "/Root/Foo/B.targetAttr",
              "/Root/Foo/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/Foo"],
              prependedItems: ["/Root/Foo/B"],
              appendedItems: ["/Root/Foo/C"]}),
          }
        }
      })
      
    // Rename /Root/A/B
    expect(editor.renamePrim(
      stage.getPrim("/Root/A/B")!, "Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/Foo" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/Foo.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/Foo.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/Foo.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/Foo",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/Foo" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/Foo.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/Foo",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/Foo.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/Foo.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/Foo.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/Foo"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })
      
    // Rename /Root/A/C
    expect(editor.renamePrim(
      stage.getPrim("/Root/A/C")!, "Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/Foo" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/Foo.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/B.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/Foo"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A/Foo.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/Foo.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/Foo"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/Foo.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A/Foo.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/A/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/Foo"]}),
          }
        }
      })
      
    // Rename /Root
    expect(editor.renamePrim(
      stage.getPrim("/Root")!, "Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Foo" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Foo/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Foo/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Foo/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Foo/A/B.targetAttr",
                  "/Foo/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Foo/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Foo/A.targetAttr",
                "/Foo/A/B.targetAttr"],
              prependedItems: ["/Foo/A"],
              appendedItems: [
                "/Foo/A/B",
                "/Foo/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Foo" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Foo/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Foo/A.targetAttr",
                  "/Foo/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Foo/A.targetAttr"],
              prependedItems: ["/Foo/A/B.targetAttr"],
              appendedItems: ["/Foo/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Foo/A",
                "/Foo/A/B",
                "/Foo/A/C"],
              prependedItems: ["/Foo/A.targetAttr"],
              appendedItems: [
                "/Foo/A/B.targetAttr",
                "/Foo/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Foo" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Foo/A/B.targetAttr",
              "/Foo/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Foo/A.targetAttr",
              "/Foo/A/B.targetAttr",
              "/Foo/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Foo/A"],
              prependedItems: ["/Foo/A/B"],
              appendedItems: ["/Foo/A/C"]}),
          }
        }
      })
      
  })
  it('test_RenamePropertyWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Test renaming various properties on the stage. Any connection or 
    // relationship target paths that refer to the property will be fixed to 
    // use the new property name

    // Rename /Root/A.targetAttr
    expect(editor.renameProperty(
      getAttr(stage, "/Root/A.targetAttr"), "foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.foo"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/B.targetAttr",
                  "/Root/A.foo"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.foo"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.foo",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.foo"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.foo",
                  "/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.foo"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.foo"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".foo" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.foo",
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Rename /Root/A/B.targetAttr
    expect(editor.renameProperty(
      getAttr(stage, "/Root/A/B.targetAttr"), "foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.foo"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/B.foo",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.foo"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".foo" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.foo"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.foo",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.foo",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.foo",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Rename /Root/A/C.targetAttr
    expect(editor.renameProperty(
      getAttr(stage, "/Root/A/C.targetAttr"), "foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.foo"]}),
              ".foo" : create({
                appendedItems: [
                  "/Root/A/B.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A/C.foo"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/C.foo"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/C.foo"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A/C.foo"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/A/C.foo"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

  })
  it('test_ReparentPrimWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Test moving various prims on the stage to new parent prims. Any 
    // connection or relationship target paths that refer to the prim or any
    // of its descendants will be fixed to use the prim's new path within
    // the namespace hierarchy.

    // Move /Root/A to be a root level prim /A
    expect(editor.movePrimAtPath("/Root/A", "/A")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/A" : {
          ".otherAttr" : explicit([
            "/A.targetAttr"]),
          "/B" : {
            ".otherAttr" : create({
              prependedItems: ["/A/B.targetAttr"]})
          },                       
          "/C" : {
            ".otherAttr" : create({
              prependedItems: ["/A/C.targetAttr"]}),
            ".targetAttr" : create({
              appendedItems: [
                "/A/B.targetAttr",
                "/A.targetAttr"]})
          },
        },
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/A.targetAttr",
                "/A/B.targetAttr"],
              prependedItems: ["/A"],
              appendedItems: [
                "/A/B",
                "/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/A" : {
          ".otherAttr" : create({
            prependedItems: ["/A.targetAttr"]}),
          "/B" : {
            ".targetAttr" : create({
              prependedItems: [
                "/A.targetAttr",
                "/A/C.targetAttr"]})
          }
        },
        "/Root" : {
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/A.targetAttr"],
              prependedItems: ["/A/B.targetAttr"],
              appendedItems: ["/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/A",
                "/A/B",
                "/A/C"],
              prependedItems: ["/A.targetAttr"],
              appendedItems: [
                "/A/B.targetAttr",
                "/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/A" : {
          ".targetAttr" : explicit([
            "/A/B.targetAttr",
            "/A/C.targetAttr"])
        },
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/A.targetAttr",
              "/A/B.targetAttr",
              "/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/A"],
              prependedItems: ["/A/B"],
              appendedItems: ["/A/C"]}),
          }
        }
      })

    // Move /Root/A to be a root level prim while also renaming it to "Foo"
    expect(editor.movePrimAtPath("/Root/A", "/Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Foo" : {
          ".otherAttr" : explicit([
            "/Foo.targetAttr"]),
          "/B" : {
            ".otherAttr" : create({
              prependedItems: ["/Foo/B.targetAttr"]})
          },                       
          "/C" : {
            ".otherAttr" : create({
              prependedItems: ["/Foo/C.targetAttr"]}),
            ".targetAttr" : create({
              appendedItems: [
                "/Foo/B.targetAttr",
                "/Foo.targetAttr"]})
          },
        },
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Foo.targetAttr",
                "/Foo/B.targetAttr"],
              prependedItems: ["/Foo"],
              appendedItems: [
                "/Foo/B",
                "/Foo/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Foo" : {
          ".otherAttr" : create({
            prependedItems: ["/Foo.targetAttr"]}),
          "/B" : {
            ".targetAttr" : create({
              prependedItems: [
                "/Foo.targetAttr",
                "/Foo/C.targetAttr"]})
          }
        },
        "/Root" : {
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Foo.targetAttr"],
              prependedItems: ["/Foo/B.targetAttr"],
              appendedItems: ["/Foo/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Foo",
                "/Foo/B",
                "/Foo/C"],
              prependedItems: ["/Foo.targetAttr"],
              appendedItems: [
                "/Foo/B.targetAttr",
                "/Foo/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Foo" : {
          ".targetAttr" : explicit([
            "/Foo/B.targetAttr",
            "/Foo/C.targetAttr"])
        },
        "/Root" : {
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Foo.targetAttr",
              "/Foo/B.targetAttr",
              "/Foo/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Foo"],
              prependedItems: ["/Foo/B"],
              appendedItems: ["/Foo/C"]}),
          }
        }
      })

    // Move /Root/A/B to be a root level prim /B
    expect(editor.movePrimAtPath("/Root/A/B", "/B")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/B" : {
          ".otherAttr" : create({
            prependedItems: ["/B.targetAttr"]})
        },                       
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/B.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/B" : {
          ".targetAttr" : create({
            prependedItems: [
              "/Root/A.targetAttr",
              "/Root/A/C.targetAttr"]})
        },
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),

          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/B.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })
      
    // Move /Root/A/B one hierarchy depth level up to be a direct child of 
    // /Root.
    expect(editor.movePrimAtPath("/Root/A/B", "/Root/B")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/B" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/B.targetAttr"]})
          },                       
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/B.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/B" : {
            ".targetAttr" : create({
              prependedItems: [
                "/Root/A.targetAttr",
                "/Root/A/C.targetAttr"]})
          },
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/B.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Move /Root/A/B to be a child of its sibling /Root/A/C
    expect(editor.movePrimAtPath("/Root/A/B", "/Root/A/C/B")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/C/B.targetAttr",
                  "/Root/A.targetAttr"]}),
              "/B" : {
                ".otherAttr" : create({
                  prependedItems: ["/Root/A/C/B.targetAttr"]})
              },
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/C/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/C/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/C" : {
              "/B" : {
                ".targetAttr" : create({
                  prependedItems: [
                    "/Root/A.targetAttr",
                    "/Root/A/C.targetAttr"]})
              }
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/C/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/C/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/C/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/C/B.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/C/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/C/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Move /Root/A/C to be a root level prim while also renaming it to "Foo"
    expect(editor.movePrimAtPath("/Root/A/C", "/Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Foo" : {
          ".otherAttr" : create({
            prependedItems: ["/Foo.targetAttr"]}),
          ".targetAttr" : create({
            appendedItems: [
              "/Root/A/B.targetAttr",
              "/Root/A.targetAttr"]})
        },
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Foo"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Foo.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Foo.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Foo"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Foo.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Foo.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Foo"]}),
          }
        }
      })

    // Move /Root/A/C one hierarchy depth level up to be a direct child of 
    // /Root while also renaming it to "Foo".
    expect(editor.movePrimAtPath("/Root/A/C", "/Root/Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/Foo" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/Foo.targetAttr"]}),
            ".targetAttr" : create({
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A.targetAttr"]})
          },
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/Foo"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/Foo.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/Foo.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/Foo"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/Foo.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/Foo.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/Foo"]}),
          }
        }
      })
      
    // Move /Root/A/C to be a child of its sibling /Root/A/B while also 
    // renaming it to "Foo"
    expect(editor.movePrimAtPath("/Root/A/C", "/Root/A/B/Foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]}),
              "/Foo" : {
                ".otherAttr" : create({
                  prependedItems: [
                    "/Root/A/B/Foo.targetAttr"]}),
                ".targetAttr" : create({
                  appendedItems: [
                    "/Root/A/B.targetAttr",
                    "/Root/A.targetAttr"]})
              },
            },                       
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/B/Foo"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A/B/Foo.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/B/Foo.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/B/Foo"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/B/Foo.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A/B/Foo.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/A/B/Foo.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/B/Foo"]}),
          }
        }
      })

  })
  it('test_ReparentPropertyWithTargets', async () => {
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Test moving various properties on the stage to new parent prims. Any 
    // connection or relationship target paths that refer to the property 
    // will be fixed to use the property's new path within the namespace 
    // hierarchy.

    // Move targetAttr from /Root/A to be a property of /Root instead
    expect(editor.movePropertyAtPath(
      "/Root/A.targetAttr", "/Root.targetAttr")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/B.targetAttr",
                  "/Root.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root.targetAttr",
                  "/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          ".targetAttr" : explicit([
            "/Root/A/B.targetAttr",
            "/Root/A/C.targetAttr"]),
          "/A" : {},
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Move targetAttr from /Root/A/B to be a property of /Root instead
    expect(editor.movePropertyAtPath(
      "/Root/A/B.targetAttr", "/Root.targetAttr")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root.targetAttr",
                  "/Root/A.targetAttr"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          ".targetAttr" : create({
            prependedItems: [
              "/Root/A.targetAttr",
              "/Root/A/C.targetAttr"]}),
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root.targetAttr",
              "/Root/A/C.targetAttr"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Move targetAttr from /Root/A/C to be a property of /Root/A instead 
    // while also renaming it to "foo"
    expect(editor.movePropertyAtPath(
      "/Root/A/C.targetAttr", "/Root/A.foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".foo" : create({
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A.targetAttr"]}),
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A.foo"]}),
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A.targetAttr",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A.targetAttr"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A.targetAttr",
                  "/Root/A.foo"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A.targetAttr"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A.foo"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A.targetAttr"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A.foo"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            ".targetAttr" : explicit([
              "/Root/A/B.targetAttr",
              "/Root/A.foo"])
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A.targetAttr",
              "/Root/A/B.targetAttr",
              "/Root/A.foo"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

    // Move targetAttr from /Root/A to be a property of /Root/A/C instead 
    // while also renaming it to "foo"
    expect(editor.movePropertyAtPath(
      "/Root/A.targetAttr", "/Root/A/C.foo")).toBe(true)
    await applyCompareAndReset(editor,
      /* rootContents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : explicit([
              "/Root/A/C.foo"]),
            "/B" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/B.targetAttr"]})
            },                       
            "/C" : {
              ".otherAttr" : create({
                prependedItems: ["/Root/A/C.targetAttr"]}),
              ".targetAttr" : create({
                appendedItems: [
                  "/Root/A/B.targetAttr",
                  "/Root/A/C.foo"]})
            },
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A/C.foo"]),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A/C.foo",
                "/Root/A/B.targetAttr"],
              prependedItems: ["/Root/A"],
              appendedItems: [
                "/Root/A/B",
                "/Root/A/C"
              ]})
          }
        }
      },
      /* sub1Contents */ {
        "/Root" : {
          "/A" : {
            ".otherAttr" : create({
              prependedItems: ["/Root/A/C.foo"]}),
            "/B" : {
              ".targetAttr" : create({
                prependedItems: [
                  "/Root/A/C.foo",
                  "/Root/A/C.targetAttr"]})
            }
          },
          "/OtherPrim" :  {
            ".otherAttr" : create({
              deletedItems: ["/Root/A/C.foo"],
              prependedItems: ["/Root/A/B.targetAttr"],
              appendedItems: ["/Root/A/C.targetAttr"]}),
            ".otherRel" : create({
              deletedItems: [
                "/Root/A",
                "/Root/A/B",
                "/Root/A/C"],
              prependedItems: ["/Root/A/C.foo"],
              appendedItems: [
                "/Root/A/B.targetAttr",
                "/Root/A/C.targetAttr"]}),
          }
        }
      },
      /* sub2Contents */ {
        "/Root" : {
          "/A" : {
            "/C" : {
              ".foo" : explicit([
                "/Root/A/B.targetAttr",
                "/Root/A/C.targetAttr"])
            }
          },
          "/OtherPrim" : {
            ".otherAttr" : explicit([
              "/Root/A/C.foo",
              "/Root/A/B.targetAttr",
              "/Root/A/C.targetAttr"]),
            ".otherRel" : create({
              deletedItems: ["/Root/A"],
              prependedItems: ["/Root/A/B"],
              appendedItems: ["/Root/A/C"]}),
          }
        }
      })

  })
  it('test_TargetsFromCompositionArcs', async () => {

    // Setup: Layer to be referenced with prims that have relationship and 
    // attributes with targets and connections. /Model/A has targets to 
    // /Model/B (which exists). /Model/B has targets to /Model/A (which 
    // exists) and /Model/C (which does NOT exists but will speculatively 
    // map to a prim in the root layer that will exist.)
    const refLayer = Layer.createAnonymous("ref.usda")
    refLayer.importFromString(`#usda 1.0
      def "Model" 
      {
        def "A"
        {
          rel a_rel = [</Model/B>]
          int a_attr
          int a_attr.connect = [</Model/B.b_attr>]
        }
        
        def "B"
        {
          rel b_rel = [</Model/A>, </Model/C>]
          int b_attr
          int b_attr.connect = [</Model/A.a_attr>, </Model/C.c_attr>]
        }
      }
    `)

    // Root layer which references the above. Defines /Root/C which has 
    // targets to A and B (brought in by the reference) and is also the 
    // prim that is speculatively targeted by /Model/B. Also provides an
    // over to A that adds targets to /Root/C.
    const rootLayer = Layer.createAnonymous("root.usda")
    const rootLayerString = `#usda 1.0
      def "Root" (
        references = @${refLayer.identifier}@</Model>
      )
      {
        def "C"
        {
          rel c_rel = [</Root/A>, </Root/B>]
          int c_attr
          int c_attr.connect = [</Root/A.a_attr>, </Root/B.b_attr>]
        }

        over "A"
        {
          append rel a_rel = [</Root/C>]
          append int a_attr.connect = [</Root/C.c_attr>]
        }
      }
    `
    rootLayer.importFromString(rootLayerString)

    // Create a stage and editor.
    const stage = await openLayer(rootLayer)
    const editor = new NamespaceEditor(stage)

    // Verify initial prims
    expect(childrenNames(stage, "/Root")).toEqual(["A", "B", "C"])
    // Verify no relocates
    expect(rootLayer.getRelocates()).toEqual([])

    // /Root/A properties target B and C 
    expect(getRel(stage, "/Root/A.a_rel").getTargets()).toEqual(["/Root/B", "/Root/C"])
    expect(getAttr(stage, "/Root/A.a_attr").getConnections()).toEqual(["/Root/B.b_attr", "/Root/C.c_attr"])

    // /Root/B properties target A and C 
    expect(getRel(stage, "/Root/B.b_rel").getTargets()).toEqual(["/Root/A", "/Root/C"])
    expect(getAttr(stage, "/Root/B.b_attr").getConnections()).toEqual(["/Root/A.a_attr", "/Root/C.c_attr"])

    // /Root/C properties target A and B
    expect(getRel(stage, "/Root/C.c_rel").getTargets()).toEqual(["/Root/A", "/Root/B"])
    expect(getAttr(stage, "/Root/C.c_attr").getConnections()).toEqual(["/Root/A.a_attr", "/Root/B.b_attr"])
    
    // Rename /Root to /Moved_Root
    // This is to check that editing a parent of a referenced connection
    // does not produce any warnings.
    expect(editor.movePrimAtPath("/Root", "/Moved_Root")).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify the prim was renamed and retains children.
    expect(childrenNames(stage, "/Moved_Root")).toEqual(["A", "B", "C"])
    // Verify no relocates
    expect(rootLayer.getRelocates()).toEqual([])

    // /Moved_Root/A properties have been updated to target Moved_A
    expect(getRel(stage, "/Moved_Root/A.a_rel").getTargets()).toEqual(["/Moved_Root/B", "/Moved_Root/C"])
    expect(getAttr(stage, "/Moved_Root/A.a_attr").getConnections()).toEqual(["/Moved_Root/B.b_attr", "/Moved_Root/C.c_attr"])

    // /Moved_Root/B properties have been updated to target Moved_A
    expect(getRel(stage, "/Moved_Root/B.b_rel").getTargets()).toEqual(["/Moved_Root/A", "/Moved_Root/C"])
    expect(getAttr(stage, "/Moved_Root/B.b_attr").getConnections()).toEqual(["/Moved_Root/A.a_attr", "/Moved_Root/C.c_attr"])

    // /Moved_Root/C properties have been updated to target Moved_A
    expect(getRel(stage, "/Moved_Root/C.c_rel").getTargets()).toEqual(["/Moved_Root/A", "/Moved_Root/B"])
    expect(getAttr(stage, "/Moved_Root/C.c_attr").getConnections()).toEqual(["/Moved_Root/A.a_attr", "/Moved_Root/B.b_attr"])

    // Reset edit for the following tests
    rootLayer.importFromString(rootLayerString)

    // Rename /Root/A to Moved_A
    expect(editor.movePrimAtPath("/Root/A", "/Root/Moved_A")).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify the prim was renamed.
    expect(childrenNames(stage, "/Root")).toEqual(["Moved_A", "B", "C"])
    // Verify A was relocated.
    expect(rootLayer.getRelocates()).toEqual([["/Root/A", "/Root/Moved_A"]])

    // Moved_A has the same targets as before the rename.
    expect(getRel(stage, "/Root/Moved_A.a_rel").getTargets()).toEqual(["/Root/B", "/Root/C"])
    expect(getAttr(stage, "/Root/Moved_A.a_attr").getConnections()).toEqual(["/Root/B.b_attr", "/Root/C.c_attr"])

    // /Root/B properties have been updated to target Moved_A
    expect(getRel(stage, "/Root/B.b_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/C"])
    expect(getAttr(stage, "/Root/B.b_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/C.c_attr"])

    // /Root/C properties have been updated to target Moved_A
    expect(getRel(stage, "/Root/C.c_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/B"])
    expect(getAttr(stage, "/Root/C.c_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/B.b_attr"])

    // Rename /Root/B to Moved_B
    expect(editor.movePrimAtPath("/Root/B", "/Root/Moved_B")).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify that B is now also renamed.
    expect(childrenNames(stage, "/Root")).toEqual(["Moved_A", "Moved_B", "C"])
    // Verify B is now also relocated.
    expect(rootLayer.getRelocates()).toEqual([
      ["/Root/A", "/Root/Moved_A"],
      ["/Root/B", "/Root/Moved_B"]])

    // /Root/Moved_A properties have been updated to target Moved_B
    expect(getRel(stage, "/Root/Moved_A.a_rel").getTargets()).toEqual(["/Root/Moved_B", "/Root/C"])
    expect(getAttr(stage, "/Root/Moved_A.a_attr").getConnections()).toEqual(["/Root/Moved_B.b_attr", "/Root/C.c_attr"])

    // Moved_B has the same targets as before the rename.
    expect(getRel(stage, "/Root/Moved_B.b_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/C"])
    expect(getAttr(stage, "/Root/Moved_B.b_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/C.c_attr"])

    // /Root/Moved_C properties have been updated to target Moved_B
    expect(getRel(stage, "/Root/C.c_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/Moved_B"])
    expect(getAttr(stage, "/Root/C.c_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/Moved_B.b_attr"])

    // Rename /Root/C to Moved_C
    expect(editor.movePrimAtPath("/Root/C", "/Root/Moved_C")).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(2)
    expect(editor.applyEdits()).toBe(true)

    // Verify that C is now also renamed.
    expect(childrenNames(stage, "/Root")).toEqual(["Moved_A", "Moved_B", "Moved_C"])
    // Verify that the relocates haven't changed as moving /Root/C does not
    // require relocates.
    expect(rootLayer.getRelocates()).toEqual([
      ["/Root/A", "/Root/Moved_A"],
      ["/Root/B", "/Root/Moved_B"]])

    // /Root/Moved_A properties have been updated to target Moved_C because
    // the opinions that target C are in the root layer and can be edited.
    expect(getRel(stage, "/Root/Moved_A.a_rel").getTargets()).toEqual(["/Root/Moved_B", "/Root/Moved_C"])
    expect(getAttr(stage, "/Root/Moved_A.a_attr").getConnections()).toEqual(["/Root/Moved_B.b_attr", "/Root/Moved_C.c_attr"])

    // /Root/Moved_B properties have NOT been updated to target Moved_C 
    // because these opinions are in the reference and /Root/C cannot be
    // relocated as it has no opinions across the reference itself.
    expect(getRel(stage, "/Root/Moved_B.b_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/C"])
    expect(getAttr(stage, "/Root/Moved_B.b_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/C.c_attr"])

    // Moved_C has the same targets as before the rename.
    expect(getRel(stage, "/Root/Moved_C.c_rel").getTargets()).toEqual(["/Root/Moved_A", "/Root/Moved_B"])
    expect(getAttr(stage, "/Root/Moved_C.c_attr").getConnections()).toEqual(["/Root/Moved_A.a_attr", "/Root/Moved_B.b_attr"])

    // Delete /Root/Moved_A
    expect(editor.deletePrimAtPath("/Root/Moved_A")).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify Moved_A is no longer a prim
    expect(childrenNames(stage, "/Root")).toEqual(["Moved_B", "Moved_C"])
    // Verify the relocates have been updates so /Root/A now maps to empty
    expect(rootLayer.getRelocates()).toEqual([
      ["/Root/A", ''], 
      ["/Root/B", "/Root/Moved_B"]])

    // /Root/Moved_B properties have been updated but instead of 
    // /Root/Moved_A being removed from its targets, it has returned to 
    // using the unrelocated path of /Root/A. This is because Pcp doesn't 
    // removed composed targets that have been relocated.
    // 
    // XXX: This really should remove the deleted targets to /Root/A but we
    // don't currently add the mapping to empty in the map function for 
    // /Root/A. This is because the PcpTargetIndex computation uses the
    // map function to map the target path and it will produce a composition
    // error if the path is not mappable. An unmappable target path that is
    // due to a "relocate to delete" should not be an error, but any other 
    // case where it's not mappable is an error. Unfortunately, we don't have
    // an easy way of distinguishing between these two cases in the target
    // index so for now we have to let deleted prims map to avoid false 
    // errors in the presence of a relocate to delete.
    expect(getRel(stage, "/Root/Moved_B.b_rel").getTargets()).toEqual(["/Root/A", "/Root/C"])
    expect(getAttr(stage, "/Root/Moved_B.b_attr").getConnections()).toEqual(["/Root/A.a_attr", "/Root/C.c_attr"])

    // /Root/Moved_C, on the other hand, does have targets to Moved_A removed
    // because the opinions are local to the root layer.
    expect(getRel(stage, "/Root/Moved_C.c_rel").getTargets()).toEqual(["/Root/Moved_B"])
    expect(getAttr(stage, "/Root/Moved_C.c_attr").getConnections()).toEqual(["/Root/Moved_B.b_attr"])

  })
  it('test_NonDefaultPrims', async () => {
    // The goal of this test is to verify that relationships and attribute 
    // connections located on prims that are abstract, undefined, unloaded, 
    // or inactive are correctly updated when the targets are changed.

    const _EditAndVerifyNonDefaultPrims = (layer: Layer, stage: Stage): void => {
      const editor = new NamespaceEditor(stage)

      // Reparent and rename /Root/PrimA -> /Foo
      expect(editor.movePrimAtPath("/Root/PrimA", "/Foo")).toBe(true)
      const result = editor.canApplyEdits()
      expect(result.ok, result.errors.join('; ')).toBe(true)
      expect(result.warnings).toEqual([])
      expect(editor.applyEdits()).toBe(true)
      
      verifyLayerContents(layer, {
        "/Foo" : {
          ".otherAttr" : create({
            prependedItems: ["/Foo.targetAttr"]}),
        },
        "/Root" : {
          "/PrimB" : {
            ".otherRel" : create({
              appendedItems: [
                "/Foo"
              ]})
          }
        }
      })
    
    }
    const undefinedLayer = Layer.createAnonymous()
    undefinedLayer.importFromString(`#usda 1.0
    over "Root"
    {
      over "PrimA"
      {
        custom int otherAttr
        prepend int otherAttr.connect = [<.targetAttr>]
      }

      over "PrimB"
      {
        custom rel otherRel
        append rel otherRel = </Root/PrimA>
      }
    }
    `)
    _EditAndVerifyNonDefaultPrims(undefinedLayer, await openLayer(undefinedLayer))

    const abstractLayer = Layer.createAnonymous()
    abstractLayer.importFromString(`#usda 1.0
    class "Root"
    {
      class "PrimA"
      {
        custom int otherAttr
        prepend int otherAttr.connect = [<.targetAttr>]
      }

      class "PrimB"
      { 
        custom rel otherRel
        append rel otherRel = </Root/PrimA>
      }
    }
    `)
    _EditAndVerifyNonDefaultPrims(abstractLayer, await openLayer(abstractLayer))

    const inactiveLayer = Layer.createAnonymous()
    inactiveLayer.importFromString(`#usda 1.0
    def "Root"
    {
      def "PrimA"
      {
        custom int otherAttr
        prepend int otherAttr.connect = [<.targetAttr>]
      }

      def "PrimB"
      { 
        custom rel otherRel
        append rel otherRel = </Root/PrimA>
      }
    }
    `)

    const inactiveStage = await openLayer(inactiveLayer)
    await inactiveStage.getPrim("/Root/PrimA")!.setActive(false)
    await inactiveStage.getPrim("/Root/PrimB")!.setActive(false)

    _EditAndVerifyNonDefaultPrims(inactiveLayer, inactiveStage)

    // A prim with an unloaded payload (/Root/PrimB) has a connection
    // for which the target has changed path (/Root/PrimA -> /Foo). Verify
    // that the target path is updated correctly.
    const payloadLayer = Layer.createAnonymous()
    payloadLayer.importFromString(`#usda 1.0
    def "Payload"
    {
    }
    `)

    const unloadedLayer = Layer.createAnonymous("abstract.usda")
    unloadedLayer.importFromString(`#usda 1.0
    def "Root" 
    {
      def "PrimA"
      {
        custom int otherAttr
        prepend int otherAttr.connect = [<.targetAttr>]
      }

      def "PrimB" (
        payload = @${payloadLayer.identifier}@</Payload>
      )
      { 
        custom rel otherRel
        append rel otherRel = </Root/PrimA>
      }
    }
    `)

    const unloadedStage = await openLayer(unloadedLayer)
    const bPrim = unloadedStage.getPrim("/Root/PrimB")!
    expect(bPrim.hasAuthoredMetadata('payload')).toBe(true)
    await unloadedStage.unload(bPrim.path)

    _EditAndVerifyNonDefaultPrims(unloadedLayer, unloadedStage)

  })
})
