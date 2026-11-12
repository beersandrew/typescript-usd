// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorPathExpressionFixup.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorPathExpressionFixup.py, with its
// basic/ fixture copied to fixtures/testUsdNamespaceEditorPathExpressionFixup/.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AttributeSpec, Layer, PathExpression, ValueTypeNames, sdfCreatePrimInLayer,
} from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask, type Prim } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdNamespaceEditorPathExpressionFixup')

type Expected = { [key: string]: Expected | PathExpression | PathExpression[] | null }

const PE = (text: string): PathExpression => new PathExpression(text)
const PEA = (items: PathExpression[]): PathExpression[] => items

// Sdf.PathExpression equality: compares the expressions' text after parsing
// each value as an SdfPathExpression. Arrays compare element-wise.
function norm(v: unknown): unknown {
  if (v === undefined || v === null) return v
  if (typeof v !== 'string' && !(v instanceof PathExpression) &&
      typeof (v as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return [...(v as Iterable<unknown>)].map(norm)
  }
  const text = v instanceof PathExpression ? v.getText()
    : typeof v === 'string' ? v : ((v as { text?: string }).text ?? String(v))
  return new PathExpression(text).getText()
}
function expectPathExpr(actual: unknown, expected: unknown, msg?: string): void {
  expect(norm(actual), msg).toEqual(norm(expected))
}

// Usd.Stage.Open(layer).
async function openStage(layer: Layer | string): Promise<Stage> {
  if (typeof layer === 'string') return (await Stage.open(layer))!
  return await Stage.openMasked(layer, StagePopulationMask.all())
}
// UsdStage::GetAttributeAtPath.
function attrAt(stage: Stage, attrPath: string) {
  const dot = attrPath.lastIndexOf('.')
  return stage.getPrim(attrPath.slice(0, dot))!.getAttr(attrPath.slice(dot + 1))!
}
// UsdPrim::GetChildrenNames.
function childrenNames(prim: Prim): string[] {
  return prim.getChildren().map(child => child.path.slice(child.path.lastIndexOf('/') + 1))
}
// UsdPrim::HasAuthoredPayloads (Python's HasPayload).
function hasAuthoredPayloads(prim: Prim): boolean {
  return prim.hasAuthoredPayloads()
}

let stage: Stage
let rootLayer: Layer
let sub1Layer: Layer
let sub2Layer: Layer

// Verifies the expected layer contents of a layer in relation to the
// prim and property hierarchies and the PathExpression default values of
// path expression-valued attributes.
//
// The format of the expected contents is a nested dictionary
// representing the full prim hierarchy as demonstrated in the example:
//
// {
//     "/Root" : {
//         "/A" : {
//             ".fromRoot:test" :
//                 Sdf.PathExpression("/Root/A//Mesh*"),
//             ".attr" : None,
//         },
//         "/OtherPrim" : {
//             ".fromRoot:refs" :
//                 Sdf.PathExpression("/Root/A /Root/B"),
//         }
//     }
// }
//
// Keys starting with '/' indicate prim children.
// Keys starting with '.' indicate property children whose default value
// must match the given Sdf.PathExpression if one is provided, or whose
// existence is verified if None is given.
//
function verifyLayerContents(layer: Layer, expectedContentsDict: Expected): void {
  verifyExpectedLayerContentsFormat(expectedContentsDict)

  expect(layer.getRootPrims().keys().length,
    `The expected number of root prims in ${Object.keys(expectedContentsDict)} doesn't match the number ` +
    `of root prims ${layer.getRootPrims().keys()} on the layer`).toBe(Object.keys(expectedContentsDict).length)

  for (const [rootPrimPath, expectedChild] of Object.entries(expectedContentsDict)) {
    verifyPrimContents(layer, rootPrimPath, expectedChild as Expected)
  }
}

function verifyExpectedLayerContentsFormat(expectedContents: Expected, pathKey?: string): void {
  expect(typeof expectedContents === 'object' && !Array.isArray(expectedContents),
    `Expected contents for prim key '${pathKey ?? 'None'}' is not a dictionary`).toBe(true)
  for (const [k, v] of Object.entries(expectedContents)) {
    if (k.startsWith('.')) {
      expect(v === null || v instanceof PathExpression || Array.isArray(v),
        `Value '${String(v)}' for property key '${k}' is invalid; it must be ` +
        'an Sdf.PathExpression or None').toBe(true)
    } else if (k.startsWith('/')) {
      verifyExpectedLayerContentsFormat(v as Expected, k)
    } else {
      expect(false, `Invalid expected contents dictionary key '${k}'; it must start with '/' ` +
        "for prim children or '.' for property children").toBe(true)
    }
  }
}

function verifyPrimContents(layer: Layer, primPath: string, expectedContentsDict: Expected): void {
  const prim = layer.getPrimAtPath(primPath)
  expect(prim, `Expected to find prim at path ${primPath}`).toBeTruthy()
  if (!prim) return

  expect(prim.getProperties().keys().length + prim.getNameChildren().keys().length,
    `The expected number of prims and properties in ${Object.keys(expectedContentsDict)} doesn't match ` +
    `the combined number of child properties ${prim.getProperties().keys()} and prims ` +
    `${prim.getNameChildren().keys()} on the prim at ${primPath}`)
    .toBe(Object.keys(expectedContentsDict).length)

  for (const [childName, expectedChildContent] of Object.entries(expectedContentsDict)) {
    const childPath = primPath + childName
    if (childName.startsWith('.')) {
      verifyPropertyContents(layer, childPath, expectedChildContent as PathExpression | PathExpression[] | null)
    } else {
      verifyPrimContents(layer, childPath, expectedChildContent as Expected)
    }
  }
}

function verifyPropertyContents(layer: Layer, propPath: string,
  expectedValue: PathExpression | PathExpression[] | null): void {
  const prop = layer.getPropertyAtPath(propPath)
  expect(prop, `Expected to find property at path ${propPath}`).toBeTruthy()
  if (!prop) return

  if (expectedValue === null) return

  expect(prop instanceof AttributeSpec, `Property at ${propPath} is not an attribute`).toBe(true)

  const actualValue = prop.getDefaultValue()
  expectPathExpr(actualValue, expectedValue,
    `Attribute at ${propPath} has default value '${String(actualValue)}' which does not match the ` +
    `expected value '${String(expectedValue)}'`)
}

// Verifies that the spec at specPath in the given layer has a customData
// field whose entries match expectedCustomData exactly. The expected
// values must be Sdf.PathExpression or Sdf.PathExpressionArray instances;
// this helper is for path-expression-valued customData only.
function verifyCustomData(layer: Layer, specPath: string,
  expectedCustomData: Record<string, PathExpression | PathExpression[]>): void {
  const spec = layer.getObjectAtPath(specPath)
  expect(spec, `Expected to find spec at path ${specPath} in layer ${layer.identifier}`).toBeTruthy()
  if (!spec) return
  const actualCustomData = (spec.getInfo('customData') ?? {}) as Record<string, unknown>
  expect(Object.keys(actualCustomData).sort(),
    `customData keys on spec at ${specPath} in layer ${layer.identifier} ` +
    'match the expected keys').toEqual(Object.keys(expectedCustomData).sort())
  for (const [key, expectedValue] of Object.entries(expectedCustomData)) {
    const actualValue = actualCustomData[key]
    expectPathExpr(actualValue, expectedValue,
      `customData['${key}'] on spec at ${specPath} in layer ${layer.identifier}`)
  }
}

async function openBasicStage(): Promise<void> {
  process.chdir(TESTENV)
  stage = await openStage('basic/root.usda')
  await stage.reload()
  const stageLayers = stage.getUsedLayers()
  rootLayer = Layer.find('basic/root.usda')!
  expect(rootLayer).toBeTruthy()
  expect(stageLayers.includes(rootLayer)).toBe(true)
  sub1Layer = Layer.find('basic/sub1.usda')!
  expect(sub1Layer).toBeTruthy()
  expect(stageLayers.includes(sub1Layer)).toBe(true)
  sub2Layer = Layer.find('basic/sub2.usda')!
  expect(sub2Layer).toBeTruthy()
  expect(stageLayers.includes(sub2Layer)).toBe(true)

  // Verify initial layer contents.
  verifyLayerContents(rootLayer, {
    '/Root': {
      '/A': {
        '.fromRoot:a': PE('/Root/A//Mesh*'),
        '/B': {
          '.fromRoot:b': PE('/Root/A/B /Root/Other'),
        },
        '/C': {
          '.attr': null,
          '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
        },
      },
      '/OtherPrim': {
        '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
        '.fromRoot:global': PE('//Mesh*'),
        '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
      },
    },
  })
  verifyLayerContents(sub1Layer, {
    '/Root': {
      '/A': {
        '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
        '/B': {
          '.attr': null,
          '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
        },
      },
      '/OtherPrim': {
        '.fromLayer1:other': PE('/Root/A //Geom*'),
      },
    },
  })
  verifyLayerContents(sub2Layer, {
    '/Root': {
      '/A': {
        '.attr': null,
        '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.attr'),
      },
      '/OtherPrim': {
        '.fromLayer2:arr': PEA([
          PE('/Root/A/B'),
          PE('/Root/A/C'),
          PE('/Root/A'),
          PE('/Root/A/B.attr /Root/A/C.attr /Root/A.attr'),
        ]),
        '.fromLayer2:global': PE('//B*'),
        '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
      },
    },
  })

  // Verify the baseline path-expression customData entries authored on
  // both prim specs and property specs in each layer.
  verifyCustomData(rootLayer, '/Root/A', {
    'rootPrimExpr': PE('/Root/A//Mesh*'),
    'rootPrimArr': PEA([PE('/Root/A/B'), PE('/Root/A/C')]),
  })
  verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
    'rootPropExpr': PE('/Root/A/B /Root/A/C.attr'),
  })
  verifyCustomData(sub1Layer, '/Root/A', {
    'layer1PrimExpr': PE('/Root/A/B'),
  })
  verifyCustomData(sub1Layer, '/Root/A.fromLayer1:a', {
    'layer1PropExpr': PE('/Root/A/C'),
  })
  verifyCustomData(sub2Layer, '/Root/A', {
    'layer2PrimExpr': PE('/Root/A/B /Root/A/C'),
  })
  verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
    'layer2PropExpr': PE('/Root/A/B.attr'),
  })
}

async function applyCompareAndReset(editor: NamespaceEditor, rootContents: Expected,
  sub1Contents: Expected, sub2Contents: Expected): Promise<void> {
  const result = editor.canApplyEdits()
  expect(result.ok, result.errors.join('; ')).toBe(true)
  expect(result.warnings).toEqual([])
  expect(editor.applyEdits()).toBe(true)
  verifyLayerContents(rootLayer, rootContents)
  verifyLayerContents(sub1Layer, sub1Contents)
  verifyLayerContents(sub2Layer, sub2Contents)
  await stage.reload()
}

// Apply the editor's pending edits without performing any layer-contents
// comparison. New path-expression-field tests use this variant and verify
// the relevant customData entries inline before calling ResetStage.
function apply(editor: NamespaceEditor): void {
  const result = editor.canApplyEdits()
  expect(result.ok, result.errors.join('; ')).toBe(true)
  expect(result.warnings).toEqual([])
  expect(editor.applyEdits()).toBe(true)
}

describe('TestUsdNamespaceEditorPathExpressionFixup', () => {
  it('test_DeletePrimWithPathExpressions', async () => {
    // Test deleting prims. Path expression components on surviving prims
    // that refer to the deleted prim are removed.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root.
    // This is the only root prim so it deletes everything.
    // This is mostly a sanity check that deleting everything at the root
    // doesn't cause any issues with respect to found path expression
    // dependencies.
    expect(editor.deletePrimAtPath('/Root')).toBe(true)
    await applyCompareAndReset(editor, {}, {}, {})

    // Delete /Root/A.
    // This deletes it and its descendants. All path expressions in
    // /Root/OtherPrim containing /Root/A are cleaned up to remove
    // patterns/expression references to objects under /Root/A.
    // If all components of the path expression were under /Root/A,
    // it leaves an empty path expression (Sdf.PathExpression.Nothing()).
    expect(editor.deletePrimAtPath('/Root/A')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim'),
        },
      },
    }, {
      '/Root': {
        '/OtherPrim': {
          '.fromLayer1:other': PE('//Geom*'),
        },
      },
    }, {
      '/Root': {
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PathExpression.Nothing(),
            PathExpression.Nothing(),
            PathExpression.Nothing(),
            PathExpression.Nothing(),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PathExpression.Nothing(),
        },
      },
    })

    // Delete /Root/A/B.
    // All path expressions with components that list prim /Root/A/B or
    // property /Root/A/B.attr have those paths removed.
    expect(editor.deletePrimAtPath('/Root/A/B')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/C': {
            '.attr': null,
            '.fromRoot:c': PathExpression.Nothing(),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PathExpression.Nothing(), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/C'),
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PathExpression.Nothing(),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Delete /Root/A/C.
    // All path expressions with components that list  prim /Root/A/C or
    // property /Root/A/C.attr have those paths removed.
    expect(editor.deletePrimAtPath('/Root/A/C')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PathExpression.Nothing()]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PathExpression.Nothing(),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })
  })

  it('test_DeletePropertyWithPathExpressions', async () => {
    // Test deleting properties. Surviving path expression components that
    // refer to the deleted property are removed.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root/A.attr (spec in sub2).
    // All path expressions that list the property /Root/A.attr
    // have that path removed.
    expect(editor.deletePropertyAtPath('/Root/A.attr')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/C.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Delete /Root/A/B.attr (spec in sub1).
    // All path expressions that list the property /Root/A/B.attr
    // have that path removed.
    expect(editor.deletePropertyAtPath('/Root/A/B.attr')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Delete /Root/A/C.attr (spec in root).
    // All path expressions that list the property /Root/A/C.attr
    // have that path removed.
    expect(editor.deletePropertyAtPath('/Root/A/C.attr')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })
  })

  it('test_RenamePrimWithPathExpressions', async () => {
    // Test renaming various prims. Path expression prefixes that match
    // the renamed prim path (or are descendants) are updated.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Rename /Root/A to Foo
    expect(editor.renamePrim(stage.getPrim('/Root/A')!, 'Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/Foo': {
          '.fromRoot:a': PE('/Root/Foo//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/Foo/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/Foo/C & /Root/Foo/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/Foo/B//Geom*'), PE('/Root/Foo/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/Foo:test'),
        },
      },
    }, {
      '/Root': {
        '/Foo': {
          '.fromLayer1:a': PE('/Root/Foo/B /Root/Foo/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/Foo /Root/Foo/C /Root/Foo.attr /Root/Foo/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/Foo //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/Foo': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/Foo/B /Root/Foo/B.attr /Root/Foo/C /Root/Foo/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/Foo/B'),
            PE('/Root/Foo/C'),
            PE('/Root/Foo'),
            PE('/Root/Foo/B.attr /Root/Foo/C.attr /Root/Foo.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/Foo:fromLayer2'),
        },
      },
    })

    // Rename /Root/A/B to Foo
    expect(editor.renamePrim(stage.getPrim('/Root/A/B')!, 'Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/Foo': {
            '.fromRoot:b': PE('/Root/A/Foo /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/Foo'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/Foo//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/Foo /Root/A/C'),
          '/Foo': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/Foo /Root/A/Foo.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/Foo'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/Foo.attr /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Rename /Root/A/C to Foo
    expect(editor.renamePrim(stage.getPrim('/Root/A/C')!, 'Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/Foo': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/Foo & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/Foo')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/Foo'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/Foo /Root/A.attr /Root/A/Foo.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/Foo /Root/A/Foo.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/Foo'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/Foo.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Rename /Root to Foo
    expect(editor.renamePrim(stage.getPrim('/Root')!, 'Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Foo': {
        '/A': {
          '.fromRoot:a': PE('/Foo/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Foo/A/B /Foo/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Foo/A/C & /Foo/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Foo/A/B//Geom*'), PE('/Foo/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Foo/OtherPrim %/Foo/A:test'),
        },
      },
    }, {
      '/Foo': {
        '/A': {
          '.fromLayer1:a': PE('/Foo/A/B /Foo/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Foo/A /Foo/A/C /Foo/A.attr /Foo/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Foo/A //Geom*'),
        },
      },
    }, {
      '/Foo': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Foo/A/B /Foo/A/B.attr /Foo/A/C /Foo/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Foo/A/B'),
            PE('/Foo/A/C'),
            PE('/Foo/A'),
            PE('/Foo/A/B.attr /Foo/A/C.attr /Foo/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Foo/A:fromLayer2'),
        },
      },
    })
  })

  it('test_RenamePropertyWithPathExpressions', async () => {
    // Test renaming properties. Only property-path references matching
    // the renamed property are updated; prim-path references and properties
    // on other prims are untouched.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Rename /Root/A.attr to foo (spec in sub2)
    expect(editor.renameProperty(stage.getPrim('/Root/A')!.getAttr('attr')!, 'foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.foo /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.foo': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/C.attr /Root/A.foo'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Rename /Root/A/B.attr to foo (spec in sub1)
    expect(editor.renameProperty(stage.getPrim('/Root/A/B')!.getAttr('attr')!, 'foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.foo': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.foo /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.foo /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Rename /Root/A/C.attr to foo (spec in root)
    expect(editor.renameProperty(stage.getPrim('/Root/A/C')!.getAttr('attr')!, 'foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.foo': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.foo'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.foo'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/C.foo /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })
  })

  it('test_ReparentPrimWithPathExpressions', async () => {
    // Test reparenting prims. Path expression prefixes matching the
    // moved prim are updated to the new path.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Move /Root/A to /A (reparent to root)
    expect(editor.movePrimAtPath('/Root/A', '/A')).toBe(true)
    await applyCompareAndReset(editor, {
      '/A': {
        '.fromRoot:a': PE('/A//Mesh*'),
        '/B': {
          '.fromRoot:b': PE('/A/B /Root/Other'),
        },
        '/C': {
          '.attr': null,
          '.fromRoot:c': PE('/A/C & /A/B'),
        },
      },
      '/Root': {
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/A/B//Geom*'), PE('/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/A:test'),
        },
      },
    }, {
      '/A': {
        '.fromLayer1:a': PE('/A/B /A/C'),
        '/B': {
          '.attr': null,
          '.fromLayer1:b': PE('/A /A/C /A.attr /A/C.attr'),
        },
      },
      '/Root': {
        '/OtherPrim': {
          '.fromLayer1:other': PE('/A //Geom*'),
        },
      },
    }, {
      '/A': {
        '.attr': null,
        '.fromLayer2:a': PE('/A/B /A/B.attr /A/C /A/C.attr'),
      },
      '/Root': {
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([PE('/A/B'), PE('/A/C'), PE('/A'), PE('/A/B.attr /A/C.attr /A.attr')]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A to /Foo (reparent + rename)
    expect(editor.movePrimAtPath('/Root/A', '/Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Foo': {
        '.fromRoot:a': PE('/Foo//Mesh*'),
        '/B': {
          '.fromRoot:b': PE('/Foo/B /Root/Other'),
        },
        '/C': {
          '.attr': null,
          '.fromRoot:c': PE('/Foo/C & /Foo/B'),
        },
      },
      '/Root': {
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Foo/B//Geom*'), PE('/Foo/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Foo:test'),
        },
      },
    }, {
      '/Foo': {
        '.fromLayer1:a': PE('/Foo/B /Foo/C'),
        '/B': {
          '.attr': null,
          '.fromLayer1:b': PE('/Foo /Foo/C /Foo.attr /Foo/C.attr'),
        },
      },
      '/Root': {
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Foo //Geom*'),
        },
      },
    }, {
      '/Foo': {
        '.attr': null,
        '.fromLayer2:a': PE('/Foo/B /Foo/B.attr /Foo/C /Foo/C.attr'),
      },
      '/Root': {
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Foo/B'),
            PE('/Foo/C'),
            PE('/Foo'),
            PE('/Foo/B.attr /Foo/C.attr /Foo.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Foo:fromLayer2'),
        },
      },
    })

    // Move /Root/A/B to /B (reparent child to root)
    expect(editor.movePrimAtPath('/Root/A/B', '/B')).toBe(true)
    await applyCompareAndReset(editor, {
      '/B': {
        '.fromRoot:b': PE('/B /Root/Other'),
      },
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/B': {
        '.attr': null,
        '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
      },
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/B /Root/A/C'),
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/B /B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/B.attr /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/B to /Root/B (reparent up one level)
    expect(editor.movePrimAtPath('/Root/A/B', '/Root/B')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/B'),
          },
        },
        '/B': {
          '.fromRoot:b': PE('/Root/B /Root/Other'),
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/B /Root/A/C'),
        },
        '/B': {
          '.attr': null,
          '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/B /Root/B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/B.attr /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/B to a child of /Root/A/C (reparent under sibling)
    expect(editor.movePrimAtPath('/Root/A/B', '/Root/A/C/B')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/C/B'),
            '/B': {
              '.fromRoot:b': PE('/Root/A/C/B /Root/Other'),
            },
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/C/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/C/B /Root/A/C'),
          '/C': {
            '/B': {
              '.attr': null,
              '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
            },
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/C/B /Root/A/C/B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/C/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/C/B.attr /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/C to be a root level prim while also renaming it to "Foo"
    expect(editor.movePrimAtPath('/Root/A/C', '/Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Foo': {
        '.attr': null,
        '.fromRoot:c': PE('/Foo & /Root/A/B'),
      },
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Foo')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Foo'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Foo /Root/A.attr /Foo.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Foo /Foo.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Foo'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Foo.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/C one hierarchy depth level up to be a direct child of
    // /Root while also renaming it to "Foo".
    expect(editor.movePrimAtPath('/Root/A/C', '/Root/Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/Foo': {
          '.attr': null,
          '.fromRoot:c': PE('/Root/Foo & /Root/A/B'),
        },
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/Foo')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/Foo'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/Foo /Root/A.attr /Root/Foo.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/Foo /Root/Foo.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/Foo'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/Foo.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/C to be a child of its sibling /Root/A/B while also
    // renaming it to "Foo"
    expect(editor.movePrimAtPath('/Root/A/C', '/Root/A/B/Foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
            '/Foo': {
              '.attr': null,
              '.fromRoot:c': PE('/Root/A/B/Foo & /Root/A/B'),
            },
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/B/Foo')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/B/Foo'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/B/Foo /Root/A.attr /Root/A/B/Foo.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/B/Foo /Root/A/B/Foo.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/B/Foo'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/B/Foo.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })
  })

  it('test_ReparentPropertyWithPathExpressions', async () => {
    // Test reparenting properties. Property-path references matching
    // the moved property are updated to the new path.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Move /Root/A.attr to /Root.attr (spec in sub2)
    expect(editor.movePropertyAtPath('/Root/A.attr', '/Root.attr')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root.attr /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '.attr': null,
        '/A': {
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/C.attr /Root.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/B.attr to /Root.attr (spec in sub1)
    expect(editor.movePropertyAtPath('/Root/A/B.attr', '/Root.attr')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '.attr': null,
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root.attr /Root/A/C /Root/A/C.attr'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root.attr /Root/A/C.attr /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A/C.attr to /Root/A.foo (spec in root)
    expect(editor.movePropertyAtPath('/Root/A/C.attr', '/Root/A.foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '.foo': null,
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A.attr /Root/A.foo'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.attr': null,
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A.foo'),
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A.foo /Root/A.attr'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })

    // Move /Root/A.attr to /Root/A/C.foo (spec in sub2)
    expect(editor.movePropertyAtPath('/Root/A.attr', '/Root/A/C.foo')).toBe(true)
    await applyCompareAndReset(editor, {
      '/Root': {
        '/A': {
          '.fromRoot:a': PE('/Root/A//Mesh*'),
          '/B': {
            '.fromRoot:b': PE('/Root/A/B /Root/Other'),
          },
          '/C': {
            '.attr': null,
            '.fromRoot:c': PE('/Root/A/C & /Root/A/B'),
          },
        },
        '/OtherPrim': {
          '.fromRoot:arr': PEA([PE('/Root/A/B//Geom*'), PE('/Root/A/C')]),
          '.fromRoot:global': PE('//Mesh*'),
          '.fromRoot:exprRef': PE('/Root/OtherPrim %/Root/A:test'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer1:a': PE('/Root/A/B /Root/A/C'),
          '/B': {
            '.attr': null,
            '.fromLayer1:b': PE('/Root/A /Root/A/C /Root/A/C.foo /Root/A/C.attr'),
          },
        },
        '/OtherPrim': {
          '.fromLayer1:other': PE('/Root/A //Geom*'),
        },
      },
    }, {
      '/Root': {
        '/A': {
          '.fromLayer2:a': PE('/Root/A/B /Root/A/B.attr /Root/A/C /Root/A/C.attr'),
          '/C': {
            '.foo': null,
          },
        },
        '/OtherPrim': {
          '.fromLayer2:arr': PEA([
            PE('/Root/A/B'),
            PE('/Root/A/C'),
            PE('/Root/A'),
            PE('/Root/A/B.attr /Root/A/C.attr /Root/A/C.foo'),
          ]),
          '.fromLayer2:global': PE('//B*'),
          '.fromLayer2:exprRef': PE('%/Root/A:fromLayer2'),
        },
      },
    })
  })

  it('test_PathExpressionsFromCompositionArcs', async () => {
    // Test path expression fixup in the presence of references.
    // Local expressions are fixed up directly; expressions from referenced
    // layers cannot be edited and may require relocates.

    // Setup: Layer to be referenced with prims that have relationship and
    // attributes with targets and connections. /Model/A has a pathexpression
    // including /Model/B (which exists). /Model/B's path expression targets
    // /Model/A (which exists) and /Model/C (which does NOT exist but will
    // speculatively map to a prim in the root layer that will exist.)
    const refLayer = Layer.createAnonymous('ref.usda')
    refLayer.importFromString(`#usda 1.0
            def "Model" 
            {
                def "A"
                {
                    pathExpression expr = "/Model/B"
                }
                
                def "B"
                {
                    pathExpression[] arr = ["/Model/A", "/Model/C"]
                }
            }
        `)

    // Root layer which references the above. Defines /Root/C which has
    // a path expression mapping to A and B (brought in by the reference)
    // and is also the prim that is speculatively included by the path
    // expression on /Model/B. Also provides an over to A that adds a
    // pattern for /Root/C.
    const rootLayer = Layer.createAnonymous('root.usda')
    rootLayer.importFromString(`#usda 1.0
            def "Root" (
                references = @` + refLayer.identifier + `@</Model>
            )
            {
                def "C"
                {
                    pathExpression test = "/Root/A /Root/B"
                }

                over "A"
                {
                    pathExpression expr = "/Root/C %_"
                }
            }
        `)

    // Create a stage and editor.
    const stage = await openStage(rootLayer)
    const editor = new NamespaceEditor(stage)

    // Verify initial prims
    expect(childrenNames(stage.getPrim('/Root')!)).toEqual(['A', 'B', 'C'])

    // Verify no relocates
    expect(rootLayer.getRelocates()).toEqual([])

    // Verify initial composed expressions.
    expectPathExpr(attrAt(stage, '/Root/A.expr').get(), PE('/Root/C /Root/B'))
    expectPathExpr(attrAt(stage, '/Root/B.arr').get(), PEA([PE('/Root/A'), PE('/Root/C')]))
    expectPathExpr(attrAt(stage, '/Root/C.test').get(), PE('/Root/A /Root/B'))

    // Rename /Root/A to /Root/Moved_A.
    expect(editor.movePrimAtPath('/Root/A', '/Root/Moved_A')).toBe(true)
    let result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(result.warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify the prim was renamed.
    expect(childrenNames(stage.getPrim('/Root')!)).toEqual(['Moved_A', 'B', 'C'])

    // Verify A was relocated.
    expect(rootLayer.getRelocates()).toEqual([['/Root/A', '/Root/Moved_A']])

    // Verify the path expressions containing "/Root/A" have been updated.
    expectPathExpr(attrAt(stage, '/Root/Moved_A.expr').get(), PE('/Root/C /Root/B'))
    expectPathExpr(attrAt(stage, '/Root/B.arr').get(), PEA([PE('/Root/Moved_A'), PE('/Root/C')]))
    expectPathExpr(attrAt(stage, '/Root/C.test').get(), PE('/Root/Moved_A /Root/B'))

    // Rename /Root/B to /Root/Moved_B.
    expect(editor.movePrimAtPath('/Root/B', '/Root/Moved_B')).toBe(true)
    result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(result.warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify that B was renamed.
    expect(childrenNames(stage.getPrim('/Root')!)).toEqual(['Moved_A', 'Moved_B', 'C'])

    // Verify B is now also relocated.
    expect(rootLayer.getRelocates()).toEqual([['/Root/A', '/Root/Moved_A'], ['/Root/B', '/Root/Moved_B']])

    // Verify the path expressions containing "/Root/B" have been updated.
    expectPathExpr(attrAt(stage, '/Root/Moved_A.expr').get(), PE('/Root/C /Root/Moved_B'))
    expectPathExpr(attrAt(stage, '/Root/Moved_B.arr').get(), PEA([PE('/Root/Moved_A'), PE('/Root/C')]))
    expectPathExpr(attrAt(stage, '/Root/C.test').get(), PE('/Root/Moved_A /Root/Moved_B'))

    // Rename /Root/C to /Root/Moved_C.
    expect(editor.movePrimAtPath('/Root/C', '/Root/Moved_C')).toBe(true)
    result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(result.warnings.length).toEqual(1)
    expect(editor.applyEdits()).toBe(true)

    // Verify that C was renamed.
    expect(childrenNames(stage.getPrim('/Root')!)).toEqual(['Moved_A', 'Moved_B', 'Moved_C'])

    // Verify that the relocates haven't changed as moving /Root/C does not
    // require relocates.
    expect(rootLayer.getRelocates()).toEqual([['/Root/A', '/Root/Moved_A'], ['/Root/B', '/Root/Moved_B']])

    // /Root/Moved_A properties have been updated to target Moved_C because
    // the opinions that target C are in the root layer and can be edited.
    expectPathExpr(attrAt(stage, '/Root/Moved_A.expr').get(), PE('/Root/Moved_C /Root/Moved_B'))

    // /Root/Moved_B properties have NOT been updated to target Moved_C
    // because these opinions are in the reference and /Root/C cannot be
    // relocated as it has no opinions across the reference itself.
    expectPathExpr(attrAt(stage, '/Root/Moved_B.arr').get(), PEA([PE('/Root/Moved_A'), PE('/Root/C')]))

    // Moved_C has the same targets as before the rename.
    expectPathExpr(attrAt(stage, '/Root/Moved_C.test').get(), PE('/Root/Moved_A /Root/Moved_B'))

    // Delete /Root/Moved_A
    expect(editor.deletePrimAtPath('/Root/Moved_A')).toBe(true)
    expect(editor.canApplyEdits().warnings.length).toEqual(0)
    expect(editor.applyEdits()).toBe(true)

    // Verify Moved_A is no longer a prim
    expect(childrenNames(stage.getPrim('/Root')!)).toEqual(['Moved_B', 'Moved_C'])

    // Verify the relocates have been updated so /Root/A now maps to empty
    expect(rootLayer.getRelocates()).toEqual([['/Root/A', ''], ['/Root/B', '/Root/Moved_B']])

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
    expectPathExpr(attrAt(stage, '/Root/Moved_B.arr').get(), PEA([PE('/Root/A'), PE('/Root/C')]))

    // /Root/Moved_C, on the other hand, does have targets to Moved_A removed
    // because the opinions are local to the root layer.
    expectPathExpr(attrAt(stage, '/Root/Moved_C.test').get(), PE('/Root/Moved_B'))
  })

  it('test_NonDefaultPrims', async () => {
    // Verify that path expression fixup works on undefined (over),
    // abstract (class), inactive, and unloaded prims.
    const _EditAndVerifyNonDefaultPrims = (layer: any, stage: any) => {
      const editor = new NamespaceEditor(stage)
      expect(editor.movePrimAtPath('/Root/PrimA', '/Foo')).toBe(true)
      const result = editor.canApplyEdits()
      expect(result.ok, result.errors.join('; ')).toBe(true)
      expect(editor.applyEdits()).toBe(true)
      verifyLayerContents(layer, {
        '/Foo': {
          '.test': PE('/Root/PrimB'),
        },
        '/Root': {
          '/PrimB': {
            '.test': PE('/Foo'),
          },
        },
      })
    }
    const undefinedLayer = Layer.createAnonymous()
    undefinedLayer.importFromString(`#usda 1.0
        over "Root"
        {
            over "PrimA"
            {
                pathExpression test = "/Root/PrimB"
            }

            over "PrimB"
            {
                pathExpression test = "/Root/PrimA"
            }
        }
        `)
    _EditAndVerifyNonDefaultPrims(undefinedLayer, await openStage(undefinedLayer))
    const abstractLayer = Layer.createAnonymous()
    abstractLayer.importFromString(`#usda 1.0
        class "Root"
        {
            class "PrimA"
            {
                pathExpression test = "/Root/PrimB"
            }

            class "PrimB"
            {
                pathExpression test = "/Root/PrimA"
            }
        }
        `)
    _EditAndVerifyNonDefaultPrims(abstractLayer, await openStage(abstractLayer))
    const inactiveLayer = Layer.createAnonymous()
    inactiveLayer.importFromString(`#usda 1.0
        def "Root"
        {
            def "PrimA"
            {
                pathExpression test = "/Root/PrimB"
            }

            def "PrimB"
            {
                pathExpression test = "/Root/PrimA"
            }
        }
        `)
    const inactiveStage = await openStage(inactiveLayer)
    await inactiveStage.getPrim('/Root/PrimA')!.setActive(false)
    await inactiveStage.getPrim('/Root/PrimB')!.setActive(false)
    _EditAndVerifyNonDefaultPrims(inactiveLayer, inactiveStage)

    // A prim with an unloaded payload (/Root/PrimB) has a path expression
    // containing a prefix that has changed path (/Root/PrimA -> /Foo). Verify
    // that the path expression is updated correctly.
    const payloadLayer = Layer.createAnonymous()
    payloadLayer.importFromString(`#usda 1.0
        def "Payload"
        {
        }
        `)
    const unloadedLayer = Layer.createAnonymous('abstract.usda')
    unloadedLayer.importFromString(`#usda 1.0
        def "Root" 
        {
            def "PrimA"
            {
                pathExpression test = "/Root/PrimB"
            }

            def "PrimB" (
                payload = @` + payloadLayer.identifier + `@</Payload>
            )
            { 
                pathExpression test = "/Root/PrimA"
            }
        }
        `)
    const unloadedStage = await openStage(unloadedLayer)
    const bPrim = unloadedStage.getPrim('/Root/PrimB')!
    expect(hasAuthoredPayloads(bPrim)).toBe(true)
    await bPrim.getStage().unload(bPrim.path)
    _EditAndVerifyNonDefaultPrims(unloadedLayer, unloadedStage)
  })

  it('test_AllSyntaxForms', async () => {
    // Verify that ReplacePrefix only modifies the prefix portion of
    // every path expression syntax form, even when the renamed prim name
    // appears in non-prefix positions.
    const layer = Layer.createAnonymous()
    sdfCreatePrimInLayer(layer, '/Root')!
    sdfCreatePrimInLayer(layer, '/Root/A')!
    sdfCreatePrimInLayer(layer, '/Root/A/A')!
    const holderSpec = sdfCreatePrimInLayer(layer, '/Root/Holder')!
    const cases = {
      'exact': '/Root/A',
      'descendant': '/Root/A/A',
      'stretch': '/Root/A//A',
      'wildcard': '/Root/A/A*',
      'stretchWild': '/Root/A//*A*',
      'predicate': '/Root/A//{A}',
      'exprRef': '%/Root/A:A',
      'complement': '~/Root/A//A',
      'union': '/Root/A /Root/A//A',
      'intersection': '/Root/A/A* & /Root/A//A',
      'difference': '/Root/A - /Root/A//A',
      'noMatch': '/Root/Other/A',
      'contextIndep': '//A',
    }
    for (const [name, expr] of Object.entries(cases)) {
      const attr = AttributeSpec.new(holderSpec, name, ValueTypeNames.PathExpression)!
      attr.setDefaultValue(PE(expr))
    }
    const stage = await openStage(layer)
    const editor = new NamespaceEditor(stage)
    expect(editor.movePrimAtPath('/Root/A', '/Root/B')).toBe(true)
    const result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(editor.applyEdits()).toBe(true)
    const expected = {
      'exact': '/Root/B',
      'descendant': '/Root/B/A',
      'stretch': '/Root/B//A',
      'wildcard': '/Root/B/A*',
      'stretchWild': '/Root/B//*A*',
      'predicate': '/Root/B//{A}',
      'exprRef': '%/Root/B:A',
      'complement': '~/Root/B//A',
      'union': '/Root/B /Root/B//A',
      'intersection': '/Root/B/A* & /Root/B//A',
      'difference': '/Root/B - /Root/B//A',
      'noMatch': '/Root/Other/A',
      'contextIndep': '//A',
    }
    for (const [name, expectedExpr] of Object.entries(expected)) {
      const prop = layer.getPropertyAtPath('/Root/Holder.' + name)!
      expectPathExpr(prop.getDefaultValue(), PE(expectedExpr))
    }
  })

  // The test methods below mirror the test_*WithPathExpressions methods
  // above but verify path-expression-valued customData *fields* on prim
  // specs and on property specs, rather than path-expression-valued
  // *attribute default values*. The fixture authors customData with
  // pathExpression entries on /Root/A and on the fromRoot:a/fromLayer1:a/
  // fromLayer2:a properties; see _OpenBasicStage for the baseline.

  it('test_DeletePrimWithPathExpressionFields', async () => {
    // Test deleting prims. Path expression-valued customData fields on
    // surviving prims and properties have references to the deleted path
    // and its descendants removed.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root/A/B. The single-path entries that reference /Root/A/B
    // or its child property /Root/A/B.attr collapse to Nothing(); array
    // and union entries drop just the matching path.
    expect(editor.deletePrimAtPath('/Root/A/B')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A', {
      'rootPrimExpr': PE('/Root/A//Mesh*'),
      'rootPrimArr': PEA([PathExpression.Nothing(), PE('/Root/A/C')]),
    })
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/A/C.attr'),
    })
    verifyCustomData(sub1Layer, '/Root/A', {
      'layer1PrimExpr': PathExpression.Nothing(),
    })
    verifyCustomData(sub1Layer, '/Root/A.fromLayer1:a', {
      'layer1PropExpr': PE('/Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A', {
      'layer2PrimExpr': PE('/Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PathExpression.Nothing(),
    })
  })

  it('test_DeletePropertyWithPathExpressionFields', async () => {
    // Test deleting properties. Path expression-valued customData fields
    // have references to the deleted property removed.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Delete /Root/A/C.attr (spec in root). Only rootPropExpr references
    // this property; everything else is unchanged.
    expect(editor.deletePropertyAtPath('/Root/A/C.attr')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/A/B'),
    })

    // Prim-level customData on /Root/A is unaffected by deleting a
    // property on a sibling prim.
    verifyCustomData(rootLayer, '/Root/A', {
      'rootPrimExpr': PE('/Root/A//Mesh*'),
      'rootPrimArr': PEA([PE('/Root/A/B'), PE('/Root/A/C')]),
    })
    await stage.reload()

    // Delete /Root/A/B.attr (spec in sub1). Only layer2PropExpr references
    // it, collapsing to Nothing().
    expect(editor.deletePropertyAtPath('/Root/A/B.attr')).toBe(true)
    apply(editor)
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PathExpression.Nothing(),
    })
  })

  it('test_RenamePrimWithPathExpressionFields', async () => {
    // Test renaming prims. Path expression-valued customData fields have
    // their path prefixes updated to reflect the new prim name.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Rename /Root/A/B to Foo.
    expect(editor.renamePrim(stage.getPrim('/Root/A/B')!, 'Foo')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A', {
      'rootPrimExpr': PE('/Root/A//Mesh*'),
      'rootPrimArr': PEA([PE('/Root/A/Foo'), PE('/Root/A/C')]),
    })
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/A/Foo /Root/A/C.attr'),
    })
    verifyCustomData(sub1Layer, '/Root/A', {
      'layer1PrimExpr': PE('/Root/A/Foo'),
    })
    verifyCustomData(sub1Layer, '/Root/A.fromLayer1:a', {
      'layer1PropExpr': PE('/Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A', {
      'layer2PrimExpr': PE('/Root/A/Foo /Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PE('/Root/A/Foo.attr'),
    })
  })

  it('test_RenamePropertyWithPathExpressionFields', async () => {
    // Test renaming properties. Path expression-valued customData fields
    // have their property path components updated to the new property
    // name.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Rename /Root/A/C.attr to renamedAttr.
    expect(editor.renameProperty(stage.getPrim('/Root/A/C')!.getAttr('attr')!, 'renamedAttr')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/A/B /Root/A/C.renamedAttr'),
    })
    await stage.reload()

    // Rename /Root/A/B.attr to fooAttr (spec in sub1).
    expect(editor.renameProperty(stage.getPrim('/Root/A/B')!.getAttr('attr')!, 'fooAttr')).toBe(true)
    apply(editor)
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PE('/Root/A/B.fooAttr'),
    })
  })

  it('test_ReparentPrimWithPathExpressionFields', async () => {
    // Test reparenting prims. Path expression-valued customData fields
    // have their path prefixes updated to reflect the new prim location.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Move /Root/A/B to /Root/B (sibling of /Root/A).
    expect(editor.movePrimAtPath('/Root/A/B', '/Root/B')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A', {
      'rootPrimExpr': PE('/Root/A//Mesh*'),
      'rootPrimArr': PEA([PE('/Root/B'), PE('/Root/A/C')]),
    })
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/B /Root/A/C.attr'),
    })
    verifyCustomData(sub1Layer, '/Root/A', {
      'layer1PrimExpr': PE('/Root/B'),
    })
    verifyCustomData(sub1Layer, '/Root/A.fromLayer1:a', {
      'layer1PropExpr': PE('/Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A', {
      'layer2PrimExpr': PE('/Root/B /Root/A/C'),
    })
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PE('/Root/B.attr'),
    })
  })

  it('test_ReparentPropertyWithPathExpressionFields', async () => {
    // Test reparenting properties. Path expression-valued customData
    // fields have their property path components updated to the new
    // location.
    await openBasicStage()
    const editor = new NamespaceEditor(stage)

    // Move /Root/A/C.attr to /Root/A.movedAttr.
    expect(editor.movePropertyAtPath('/Root/A/C.attr', '/Root/A.movedAttr')).toBe(true)
    apply(editor)
    verifyCustomData(rootLayer, '/Root/A.fromRoot:a', {
      'rootPropExpr': PE('/Root/A/B /Root/A.movedAttr'),
    })
    await stage.reload()

    // Move /Root/A/B.attr to /Root.movedAttr.
    expect(editor.movePropertyAtPath('/Root/A/B.attr', '/Root.movedAttr')).toBe(true)
    apply(editor)
    verifyCustomData(sub2Layer, '/Root/A.fromLayer2:a', {
      'layer2PropExpr': PE('/Root.movedAttr'),
    })
  })

})
