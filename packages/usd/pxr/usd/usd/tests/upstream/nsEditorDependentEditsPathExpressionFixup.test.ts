// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsPathExpressionFixup.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsPathExpressionFixup.py:
// tests downstream dependency path-expression fixup when a prim or property
// is renamed, reparented, or deleted on the edited stage.

import { describe, expect, it } from 'vitest'
import { AttributeSpec, Layer, PathExpression, sdfChangeBlock } from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask } from 'typescript-usd/usd'
import { NsEditorDependentEditsBase } from '../support/nsEditorDependentEditsBase.ts'

type ExpectedValue = PathExpression | PathExpression[]
type Expected = { [key: string]: any }

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

// Usd.Stage.Open(layer[, sessionLayer]).
async function openStage(layer: Layer, sessionLayer?: Layer): Promise<Stage> {
  return await Stage.openMasked(layer, StagePopulationMask.all(),
    sessionLayer ? { sessionLayerPath: sessionLayer.identifier } : undefined)
}

const base = new NsEditorDependentEditsBase()

// Verifies the expected layer contents of a layer in relation to the
// prim and property hierarchies, the pathExpression-valued default
// field on attributes, and the pathExpression-valued customData
// entries on prim and property specs.
//
// The format of the expected contents is a nested dictionary
// representing the full prim hierarchy as demonstrated in the example:
//
// {
//     "/Root" : {
//         "customData" : {
//             "primExpr" : Sdf.PathExpression("/Root/A"),
//         },
//         "/A" : {
//             ".expr" : {
//                 "default" : Sdf.PathExpression("/Root/A//Mesh*"),
//                 "customData" : {
//                     "propExpr" : Sdf.PathExpression("/Root/A.attr"),
//                 },
//             },
//             ".attr" : None,
//         },
//     }
// }
//
// Keys starting with '/' indicate prim children.
// Keys starting with '.' indicate property children. A property's
//   expected value is either:
//     - None, or
//     - a dict that may contain a 'default' key (Sdf.PathExpression,
//       Sdf.PathExpressionArray, or None meaning "no default
//       authored") and a 'customData' key (a dict of customData
//       name -> pathExpression-valued data; absent means "no
//       customData authored").
// The key 'customData' on a prim's contents dict indicates
//   that the prim spec must carry the given customData entries.
//
function verifyLayerContents(layer: Layer, expectedContentsDict: Expected): void {
  verifyExpectedLayerContentsFormat(expectedContentsDict)

  expect(layer.getRootPrims().keys().length,
    `The expected number of root prims in ${Object.keys(expectedContentsDict)} doesn't match the ` +
    `number of root prims ${layer.getRootPrims().keys()} on layer ${layer.identifier}`)
    .toBe(Object.keys(expectedContentsDict).length)

  for (const [rootPrimPath, expectedChild] of Object.entries(expectedContentsDict)) {
    verifyPrimContents(layer, rootPrimPath, expectedChild)
  }
}

// Validates expectedContents has the correct shape so test writing bugs
// show up as setup errors rather than assertion failures.
function verifyExpectedLayerContentsFormat(expectedContents: Expected, pathKey?: string): void {
  const isDict = (v: unknown): boolean =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof PathExpression)
  expect(isDict(expectedContents),
    `Expected contents for prim key '${pathKey ?? 'None'}' is not a dictionary`).toBe(true)
  for (const [k, v] of Object.entries(expectedContents)) {
    if (k === 'customData') {
      expect(isDict(v), `Value for 'customData' on prim key '${pathKey ?? 'None'}' is not a ` +
        'dictionary').toBe(true)
    } else if (k.startsWith('.')) {
      expect(v === null || isDict(v), `Value '${String(v)}' for property key '${k}' is invalid; it ` +
        "must be None or a dict with optional 'default' and 'customData' entries").toBe(true)
      if (isDict(v)) {
        for (const vk of Object.keys(v)) {
          expect(['default', 'customData'], `Invalid key '${vk}' in property '${k}' expected ` +
            "dict; only 'default' and 'customData' are allowed").toContain(vk)
        }
      }
    } else if (k.startsWith('/')) {
      verifyExpectedLayerContentsFormat(v, k)
    } else {
      expect(false, `Invalid expected contents dictionary key '${k}'; it must start with '/' ` +
        "for prim children, '.' for property children, or be 'customData' for the " +
        "prim's customData").toBe(true)
    }
  }
}

// Verifies the contents of a prim in the layer has the expected contents
// indicated by the expectedContentsDict
function verifyPrimContents(layer: Layer, primPath: string, expectedContentsDict: Expected): void {
  const prim = layer.getPrimAtPath(primPath)
  expect(prim, `Expected to find prim at path ${primPath} in layer ${layer.identifier}`).toBeTruthy()
  if (!prim) return

  // Separate the prim's expected customData from its children
  const expectedCustomData = expectedContentsDict['customData'] ?? null
  const expectedChildren = Object.entries(expectedContentsDict).filter(([k]) => k !== 'customData')

  // Verify the prim spec's customData match expectations. Absent
  // entry means we require the spec to have no customData authored.
  verifyCustomData(layer, primPath, expectedCustomData)

  // Prim must have the same number of prim and property children as
  // indicated in the expected child entries.
  expect(prim.getProperties().keys().length + prim.getNameChildren().keys().length,
    `The expected number of prims and properties in ${expectedChildren.map(([k]) => k)} doesn't ` +
    `match the combined number of child properties ${prim.getProperties().keys()} and prims ` +
    `${prim.getNameChildren().keys()} on the prim at ${primPath} in layer ${layer.identifier}`)
    .toBe(expectedChildren.length)

  for (const [childName, expectedChildContent] of expectedChildren) {
    const childPath = primPath + childName
    if (childName.startsWith('.')) {
      verifyPropertyContents(layer, childPath, expectedChildContent)
    } else {
      verifyPrimContents(layer, childPath, expectedChildContent)
    }
  }
}

// Verifies the contents of a property in the layer has the expected
// default and customData values for path-expression-bearing fields.
function verifyPropertyContents(layer: Layer, propPath: string,
  expectedValue: { default?: ExpectedValue | null, customData?: Record<string, ExpectedValue> } | null): void {
  const prop = layer.getPropertyAtPath(propPath)
  expect(prop, `Expected to find property at path ${propPath} in layer ${layer.identifier}`).toBeTruthy()
  if (!prop) return

  if (expectedValue === null) return

  // Verify default if specified.
  if ('default' in expectedValue) {
    const expectedDefault = expectedValue.default
    expect(prop instanceof AttributeSpec, `Property at ${propPath} in layer ${layer.identifier} ` +
      'is not an attribute but a default value was specified').toBe(true)
    const actualDefault = prop.getDefaultValue()
    expectPathExpr(actualDefault, expectedDefault,
      `Attribute at ${propPath} in layer ${layer.identifier} has default value ` +
      `'${String(actualDefault)}' which does not match the expected value '${String(expectedDefault)}'`)
  } else if (prop instanceof AttributeSpec) {
    expect(prop.hasInfo('default'), `Attribute at ${propPath} in layer ${layer.identifier} ` +
      'unexpectedly has a default value authored').toBe(false)
  }

  // Verify customData.
  verifyCustomData(layer, propPath, expectedValue.customData ?? null)
}

// Verifies the spec at specPath in the given layer has a customData
// field whose entries match expectedCustomData exactly. If
// expectedCustomData is None, the spec must have no customData
// authored.
function verifyCustomData(layer: Layer, specPath: string,
  expectedCustomData: Record<string, ExpectedValue> | null): void {
  const spec = layer.getObjectAtPath(specPath)
  expect(spec, `Expected to find spec at path ${specPath} in layer ${layer.identifier}`).toBeTruthy()
  if (!spec) return

  // If no expected customData was given, the spec must have no
  // customData authored at all.
  if (expectedCustomData === null) {
    expect(spec.hasInfo('customData'), `Spec at ${specPath} in layer ${layer.identifier} ` +
      'unexpectedly has customData authored').toBe(false)
    return
  }

  const actualCustomData = (spec.getInfo('customData') ?? {}) as Record<string, unknown>
  expect(Object.keys(actualCustomData).sort(),
    `customData keys on spec at ${specPath} in layer ${layer.identifier}`)
    .toEqual(Object.keys(expectedCustomData).sort())
  for (const [key, expectedValue] of Object.entries(expectedCustomData)) {
    const actualValue = actualCustomData[key]
    expectPathExpr(actualValue, expectedValue,
      `customData['${key}'] on spec at ${specPath} in layer ${layer.identifier} is ` +
      `'${String(actualValue)}' which does not match the expected value '${String(expectedValue)}'`)
  }
}

describe('TestUsdNamespaceEditorDependentEditsPathExpressionFixup', () => {

  it('test_BasicReferences', async () => {
    // Tests path expression fixup after downstream dependency namespace
    // edits across a reference.

    // Layer 1 defines /Ref/Child (the prim to edit) and
    // /Ref/Child.attr (the property to edit), /RefSibling (the
    // reparent destination), and /Local which carries path-
    // expression-bearing fields targeting both /Ref/Child* and
    // /InternalRef/Child*.
    const layer1 = Layer.createAnonymous('layer1.usda')
    const layer1ImportString = `#usda 1.0
            def "Ref" {
                def "Child" {
                    custom int attr
                }
            }

            def "RefSibling" {
            }

            def "Local" (
                customData = {
                    pathExpression primExpr = "/Ref/Child /InternalRef/Child"
                }
            ) {
                pathExpression expr = "/Ref/Child /InternalRef/Child" (
                    customData = {
                        pathExpression propExpr = "/Ref/Child.attr /InternalRef/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Ref/Child /InternalRef/Child",
                    "/Ref/Child.attr /InternalRef/Child.attr"]
            }

            def "InternalRef" (
                references = </Ref>
            ) {
            }
        `
    layer1.importFromString(layer1ImportString)

    // Layer 2 references /Ref from /Prim and defines /Other with
    // the same path-expression-bearing fields, targeting /Prim/Child*.
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            def "Prim" (
                references = @` + layer1.identifier + `@</Ref>
            ) {
            }

            def "Other" (
                customData = {
                    pathExpression primExpr = "/Prim/Child /Prim/Child.attr"
                }
            ) {
                pathExpression expr = "/Prim/Child" (
                    customData = {
                        pathExpression propExpr = "/Prim/Child /Prim/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Prim/Child",
                    "/Prim/Child.attr"]
            }
        `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2)

    // Create an editor for stage 1 with stage 2 as a dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /InternalRef/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child /InternalRef/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child.attr /InternalRef/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Ref/Child /InternalRef/Child'),
            PE('/Ref/Child.attr /InternalRef/Child.attr'),
          ]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.renamed': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /InternalRef/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child /InternalRef/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child.renamed /InternalRef/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Ref/Child /InternalRef/Child'),
            PE('/Ref/Child.renamed /InternalRef/Child.renamed'),
          ]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.renamed')]),
        },
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {
          '.renamed': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Renamed /InternalRef/Renamed'),
        },
        '.expr': {
          'default': PE('/Ref/Renamed /InternalRef/Renamed'),
          'customData': {
            'propExpr': PE('/Ref/Renamed.renamed /InternalRef/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Ref/Renamed /InternalRef/Renamed'),
            PE('/Ref/Renamed.renamed /InternalRef/Renamed.renamed'),
          ]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PE('/Prim/Renamed.renamed')]),
        },
      },
    })

    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed.renamed -> /RefSibling.moved', () => {
      expect(editor.movePropertyAtPath('/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)
    })

    // Path expressions targeting /Ref/Renamed.renamed directly can be
    // updated to the new path. However, those targeting it across a
    // reference (internal or not) no longer get the new .moved attribute
    // composed in, so path expressions containing /InternalRef/Renamed.renamed
    // (layer 1) or /Prim/Renamed.renamed (layer 2) have that path removed
    // instead.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {},
      },
      '/RefSibling': {
        '.moved': null,
      },
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Renamed /InternalRef/Renamed'),
        },
        '.expr': {
          'default': PE('/Ref/Renamed /InternalRef/Renamed'),
          'customData': {
            'propExpr': PE('/RefSibling.moved'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Renamed /InternalRef/Renamed'), PE('/RefSibling.moved')]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PathExpression.Nothing()]),
        },
      },
    })

    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed -> /RefSibling/Moved', () => {
      expect(editor.movePrimAtPath('/Ref/Renamed', '/RefSibling/Moved')).toBe(true)
    })

    // For the same reason as above, path expressions containing
    // /InternalRef/Renamed (layer 1) or /Prim/Renamed (layer 2) have that
    // path removed, while path expressions containing /Ref/Renamed are
    // updated to /RefSibling/Moved.
    verifyLayerContents(layer1, {
      '/Ref': {},
      '/RefSibling': {
        '.moved': null,
        '/Moved': {},
      },
      '/Local': {
        'customData': {
          'primExpr': PE('/RefSibling/Moved'),
        },
        '.expr': {
          'default': PE('/RefSibling/Moved'),
          'customData': {
            'propExpr': PE('/RefSibling.moved'),
          },
        },
        '.arr': {
          'default': PEA([PE('/RefSibling/Moved'), PE('/RefSibling.moved')]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })

    // Reparent: /RefSibling/Moved -> /Ref/Child
    base.applyEdits(editor, 'Reparent /RefSibling/Moved -> /Ref/Child', () => {
      expect(editor.movePrimAtPath('/RefSibling/Moved', '/Ref/Child')).toBe(true)
    })

    // Reparent: /RefSibling.moved -> /Ref/Child.attr
    base.applyEdits(editor, 'Reparent /RefSibling.moved -> /Ref/Child.attr', () => {
      expect(editor.movePropertyAtPath('/RefSibling.moved', '/Ref/Child.attr')).toBe(true)
    })

    // The prim/property structure returns to its original state with
    // one notable exception: the path-expressions that don't directly target
    // /Ref/Child are NOT restored.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })

    // Reinitialize to reset the path expressions.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Verify the initial layer contents have been restored.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /InternalRef/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child /InternalRef/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child.attr /InternalRef/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Ref/Child /InternalRef/Child'),
            PE('/Ref/Child.attr /InternalRef/Child.attr'),
          ]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })

    // Delete: /Ref/Child.attr
    base.applyEdits(editor, 'Delete /Ref/Child.attr', () => {
      expect(editor.deletePropertyAtPath('/Ref/Child.attr')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /InternalRef/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child /InternalRef/Child'),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child /InternalRef/Child'), PathExpression.Nothing()]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PathExpression.Nothing()]),
        },
      },
    })

    // Delete: /Ref/Child
    base.applyEdits(editor, 'Delete /Ref/Child', () => {
      expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {},
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
      '/InternalRef': {},
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })
  })

  it('test_BasicPayloads', async () => {
    // Test path expression fixup after downstream dependency namespace edits
    // across a payload. This also verifies that path expression fixup on a
    // dependent stage is skipped when the payload is unloaded.

    // Layer 1 defines /Ref/Child (the prim to edit) and
    // /Ref/Child.attr (the property to edit), /RefSibling (the
    // reparent destination), and /Local with path-expression-bearing fields.
    const layer1 = Layer.createAnonymous('layer1.usda')
    const layer1ImportString = `#usda 1.0
            def "Ref" {
                def "Child" {
                    custom int attr
                }
            }

            def "RefSibling" {
            }

            def "Local" (
                customData = {
                    pathExpression primExpr = "/Ref/Child /Ref/Child.attr"
                }
            ) {
                pathExpression expr = "/Ref/Child" (
                    customData = {
                        pathExpression propExpr = "/Ref/Child /Ref/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Ref/Child",
                    "/Ref/Child.attr"]
            }
        `
    layer1.importFromString(layer1ImportString)

    // Layer 2 payloads /Ref from /Prim and defines /Other with the
    // same path-expression-bearing fields, targeting /Prim/Child*.
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            def "Prim" (
                payload = @` + layer1.identifier + `@</Ref>
            ) {
            }

            def "Other" (
                customData = {
                    pathExpression primExpr = "/Prim/Child /Prim/Child.attr"
                }
            ) {
                pathExpression expr = "/Prim/Child" (
                    customData = {
                        pathExpression propExpr = "/Prim/Child /Prim/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Prim/Child",
                    "/Prim/Child.attr"]
            }
        `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2)

    // Create an editor for stage 1 with stage 2 as an additional
    // dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Ref/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child /Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.renamed': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /Ref/Child.renamed'),
        },
        '.expr': {
          'default': PE('/Ref/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child /Ref/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child'), PE('/Ref/Child.renamed')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.renamed')]),
        },
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {
          '.renamed': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Renamed /Ref/Renamed.renamed'),
        },
        '.expr': {
          'default': PE('/Ref/Renamed'),
          'customData': {
            'propExpr': PE('/Ref/Renamed /Ref/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Renamed'), PE('/Ref/Renamed.renamed')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PE('/Prim/Renamed.renamed')]),
        },
      },
    })

    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed.renamed -> /RefSibling.moved', () => {
      expect(editor.movePropertyAtPath('/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)
    })

    // Path expressions targeting /Ref/Renamed.renamed directly can be
    // updated to the new path. However, those targeting it across a
    // payload no longer get the new .moved attribute composed in, so path
    // expressions containing /Prim/Renamed.renamed (layer 2) have that path
    // removed instead.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {},
      },
      '/RefSibling': {
        '.moved': null,
      },
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Renamed /RefSibling.moved'),
        },
        '.expr': {
          'default': PE('/Ref/Renamed'),
          'customData': {
            'propExpr': PE('/Ref/Renamed /RefSibling.moved'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Renamed'), PE('/RefSibling.moved')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PathExpression.Nothing()]),
        },
      },
    })

    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed -> /RefSibling/Moved', () => {
      expect(editor.movePrimAtPath('/Ref/Renamed', '/RefSibling/Moved')).toBe(true)
    })

    // For the same reason as above, path expressions containing
    // /Prim/Renamed (layer 2) have that path removed, while path expressions
    // containing /Ref/Renamed are updated to /RefSibling/Moved.
    verifyLayerContents(layer1, {
      '/Ref': {},
      '/RefSibling': {
        '.moved': null,
        '/Moved': {},
      },
      '/Local': {
        'customData': {
          'primExpr': PE('/RefSibling/Moved /RefSibling.moved'),
        },
        '.expr': {
          'default': PE('/RefSibling/Moved'),
          'customData': {
            'propExpr': PE('/RefSibling/Moved /RefSibling.moved'),
          },
        },
        '.arr': {
          'default': PEA([PE('/RefSibling/Moved'), PE('/RefSibling.moved')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })

    // Reinitialize to reset for the delete cases.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Verify the layers have been returned to their initial state.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child /Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Ref/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child /Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })

    // Delete: /Ref/Child.attr
    base.applyEdits(editor, 'Delete /Ref/Child.attr', () => {
      expect(editor.deletePropertyAtPath('/Ref/Child.attr')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {},
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Child'),
        },
        '.expr': {
          'default': PE('/Ref/Child'),
          'customData': {
            'propExpr': PE('/Ref/Child'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Child'), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PathExpression.Nothing()]),
        },
      },
    })

    // Delete: /Ref/Child
    base.applyEdits(editor, 'Delete /Ref/Child', () => {
      expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {},
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })

    // Reset both layers.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Unload /Prim on stage 2 so the payload contents are not composed into
    // the dependent stage's namespace. When /Prim is unloaded on stage 2,
    // /Prim/Child does not compose into the stage's namespace, so
    // the dependent stage path expression fixup cannot reach the
    // /Other expression entries that point at /Prim/Child* paths.
    // Layer 1's own path expressions on /Local are still fixed up
    // because the rename happens on stage 1.
    await stage2.unload('/Prim')

    // Rename: /Ref/Child -> /Ref/Renamed (with /Prim unloaded)
    base.applyEdits(editor, 'Rename /Ref/Child -> /Ref/Renamed (/Prim unloaded)', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })

    // Layer 1 is fixed up as usual since the rename is on stage 1.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {
          '.attr': null,
        },
      },
      '/RefSibling': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Ref/Renamed /Ref/Renamed.attr'),
        },
        '.expr': {
          'default': PE('/Ref/Renamed'),
          'customData': {
            'propExpr': PE('/Ref/Renamed /Ref/Renamed.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Ref/Renamed'), PE('/Ref/Renamed.attr')]),
        },
      },
    })

    // Layer 2 expressions are NOT fixed up because /Prim is unloaded on
    // stage 2 and /Prim/Child does not compose to anything.
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })

    // Reload /Prim and observe the broken state: /Other expressions
    // still point at /Prim/Child paths even though the payload now
    // composes /Prim/Renamed.
    await stage2.load('/Prim')
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })
  })

  it('test_BasicSublayers', async () => {
    // Tests path expression fixup after downstream dependency namespace
    // edits across sublayers.
    //
    // This test sets up a four stage hierarchy and registers ONLY
    // stage3 as a dependent of the stage 1 editor to show that:
    //
    // - layer1 is fixed up directly because it's the edit target.
    // - layer2 and layer3Sub are fixed up because they sit in
    // stage3's layer stack (transitively or directly).
    // - layer3 is fixed up because stage3 is registered as a
    // dependent stage.
    // - layer4 is NOT fixed up: stage4 was never registered as a
    // dependent stage even though layer4 sublayers layer3.

    // Reusable USDA snippet for the /OtherN prim spec body that
    // carries the four path-expression-bearing fields targeting
    // /Ref/Child*. Each /OtherN is a root prim in its own layer
    // so fixup is per-layer.
    const _OtherSpec = (name: any) => {
      return `
            def "` + name + `" (
                customData = {
                    pathExpression primExpr = "/Ref/Child /Ref/Child.attr"
                }
            ) {
                pathExpression expr = "/Ref/Child" (
                    customData = {
                        pathExpression propExpr = "/Ref/Child /Ref/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Ref/Child",
                    "/Ref/Child.attr"]
            }
            `
    }

    // Layer 1 is the edited base layer. It defines /Ref/Child,
    // /Ref/Child.attr, /RefSibling, and /Local with the four path-
    // expression-bearing fields.
    const layer1 = Layer.createAnonymous('layer1.usda')
    const layer1ImportString = `#usda 1.0
            def "Ref" {
                def "Child" {
                    custom int attr
                }
            }

            def "RefSibling" {
            }
        ` + _OtherSpec('Local')
    layer1.importFromString(layer1ImportString)

    // Layer 2 sublayers layer1 and defines /Other2.
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            (
                subLayers = [@` + layer1.identifier + `@]
            )
        ` + _OtherSpec('Other2')
    layer2.importFromString(layer2ImportString)

    // Layer 3 Sub will be a sublayer of layer3 and defines /Other3Sub.
    const layer3Sub = Layer.createAnonymous('layer3-sub.usda')
    const layer3SubImportString = `#usda 1.0
        ` + _OtherSpec('Other3Sub')
    layer3Sub.importFromString(layer3SubImportString)

    // Layer 3 sublayers layer2 (which sublayers layer1) and
    // layer3Sub. Defines /Other3.
    const layer3 = Layer.createAnonymous('layer3.usda')
    const layer3ImportString = `#usda 1.0
            (
                subLayers = [
                    @` + layer2.identifier + `@,
                    @` + layer3Sub.identifier + `@
                ]
            )
        ` + _OtherSpec('Other3')
    layer3.importFromString(layer3ImportString)

    // Layer 4 sublayers layer3. Stage 4 is intentionally not
    // registered as a dependent, so layer 4 stays untouched
    // throughout the test.
    const layer4 = Layer.createAnonymous('layer4.usda')
    const layer4ImportString = `#usda 1.0
            (
                subLayers = [@` + layer3.identifier + `@]
            )
        ` + _OtherSpec('Other4')
    layer4.importFromString(layer4ImportString)

    // Open all four layers as stages.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2)
    const stage3 = await openStage(layer3)
    const stage4 = await openStage(layer4)

    // Create an editor for stage1 and add ONLY stage3 as a
    // dependent stage. Stage 2 and stage 4 are intentionally left
    // unregistered.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage3)

    // Every layer in stage3's layer stack other than layer1
    // holds its /OtherN prim with the same path-expression-bearing
    // fields, so they all get verified together against the same
    // expected values at each step of the test.
    const _VerifyOtherLayerExprs = (expectedPrimExpr: any, expectedExprDefault: any, expectedPropExpr: any, expectedArr: any) => {
      const _Contents = (name: any) => {
        return {
          ['/' + name]: {
            'customData': {
              'primExpr': expectedPrimExpr,
            },
            '.expr': {
              'default': expectedExprDefault,
              'customData': {
                'propExpr': expectedPropExpr,
              },
            },
            '.arr': {
              'default': expectedArr,
            },
          },
        }
      }
      verifyLayerContents(layer2, _Contents('Other2'))
      verifyLayerContents(layer3Sub, _Contents('Other3Sub'))
      verifyLayerContents(layer3, _Contents('Other3'))
    }

    // Verify layer4 keeps its original path expressions -- stage4
    // was not registered as a dependent stage so /Other4 is never
    // updated regardless of what edits are applied via stage1.
    const _VerifyLayer4Unchanged = () => {
      verifyLayerContents(layer4, {
        '/Other4': {
          'customData': {
            'primExpr': PE('/Ref/Child /Ref/Child.attr'),
          },
          '.expr': {
            'default': PE('/Ref/Child'),
            'customData': {
              'propExpr': PE('/Ref/Child /Ref/Child.attr'),
            },
          },
          '.arr': {
            'default': PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]),
          },
        },
      })
    }

    // Helper to verify layer1 contents at each step. layer1 carries /Ref,
    // /RefSibling, and /Local. /Local's expressions get the same
    // fixup treatment as the /OtherN prims since /Local is
    // essentially the same shape on the edited stage.
    const _VerifyLayer1Contents = (refContents: any, refSiblingContents: any, localPrimExpr: any, localExprDefault: any, localPropExpr: any, localArr: any) => {
      verifyLayerContents(layer1, {
        '/Ref': refContents,
        '/RefSibling': refSiblingContents,
        '/Local': {
          'customData': {
            'primExpr': localPrimExpr,
          },
          '.expr': {
            'default': localExprDefault,
            'customData': {
              'propExpr': localPropExpr,
            },
          },
          '.arr': {
            'default': localArr,
          },
        },
      })
    }

    // Verify the initial layer contents.
    _VerifyLayer1Contents({
      '/Child': {
        '.attr': null,
      },
    }, {}, PE('/Ref/Child /Ref/Child.attr'), PE('/Ref/Child'), PE('/Ref/Child /Ref/Child.attr'), PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]))
    _VerifyOtherLayerExprs(PE('/Ref/Child /Ref/Child.attr'), PE('/Ref/Child'), PE('/Ref/Child /Ref/Child.attr'), PEA([PE('/Ref/Child'), PE('/Ref/Child.attr')]))
    _VerifyLayer4Unchanged()

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)
    })
    _VerifyLayer1Contents({
      '/Child': {
        '.renamed': null,
      },
    }, {}, PE('/Ref/Child /Ref/Child.renamed'), PE('/Ref/Child'), PE('/Ref/Child /Ref/Child.renamed'), PEA([PE('/Ref/Child'), PE('/Ref/Child.renamed')]))
    _VerifyOtherLayerExprs(PE('/Ref/Child /Ref/Child.renamed'), PE('/Ref/Child'), PE('/Ref/Child /Ref/Child.renamed'), PEA([PE('/Ref/Child'), PE('/Ref/Child.renamed')]))
    _VerifyLayer4Unchanged()

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })
    _VerifyLayer1Contents({
      '/Renamed': {
        '.renamed': null,
      },
    }, {}, PE('/Ref/Renamed /Ref/Renamed.renamed'), PE('/Ref/Renamed'), PE('/Ref/Renamed /Ref/Renamed.renamed'), PEA([PE('/Ref/Renamed'), PE('/Ref/Renamed.renamed')]))
    _VerifyOtherLayerExprs(PE('/Ref/Renamed /Ref/Renamed.renamed'), PE('/Ref/Renamed'), PE('/Ref/Renamed /Ref/Renamed.renamed'), PEA([PE('/Ref/Renamed'), PE('/Ref/Renamed.renamed')]))
    _VerifyLayer4Unchanged()

    // Reparent: /Ref/Renamed.renamed -> /RefSibling.moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed.renamed -> /RefSibling.moved', () => {
      expect(editor.movePropertyAtPath('/Ref/Renamed.renamed', '/RefSibling.moved')).toBe(true)
    })
    _VerifyLayer1Contents({
      '/Renamed': {},
    }, {
      '.moved': null,
    }, PE('/Ref/Renamed /RefSibling.moved'), PE('/Ref/Renamed'), PE('/Ref/Renamed /RefSibling.moved'), PEA([PE('/Ref/Renamed'), PE('/RefSibling.moved')]))
    _VerifyOtherLayerExprs(PE('/Ref/Renamed /RefSibling.moved'), PE('/Ref/Renamed'), PE('/Ref/Renamed /RefSibling.moved'), PEA([PE('/Ref/Renamed'), PE('/RefSibling.moved')]))
    _VerifyLayer4Unchanged()

    // Reparent: /Ref/Renamed -> /RefSibling/Moved
    base.applyEdits(editor, 'Reparent /Ref/Renamed -> /RefSibling/Moved', () => {
      expect(editor.movePrimAtPath('/Ref/Renamed', '/RefSibling/Moved')).toBe(true)
    })
    _VerifyLayer1Contents({}, {
      '.moved': null,
      '/Moved': {},
    }, PE('/RefSibling/Moved /RefSibling.moved'), PE('/RefSibling/Moved'), PE('/RefSibling/Moved /RefSibling.moved'), PEA([PE('/RefSibling/Moved'), PE('/RefSibling.moved')]))
    _VerifyOtherLayerExprs(PE('/RefSibling/Moved /RefSibling.moved'), PE('/RefSibling/Moved'), PE('/RefSibling/Moved /RefSibling.moved'), PEA([PE('/RefSibling/Moved'), PE('/RefSibling.moved')]))
    _VerifyLayer4Unchanged()

    // Reinitialize all layers so the deletes start from the
    // original path expressions without the previous reparent
    // edits.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)
    layer3Sub.importFromString(layer3SubImportString)
    layer3.importFromString(layer3ImportString)
    layer4.importFromString(layer4ImportString)

    // Delete: /Ref/Child.attr
    base.applyEdits(editor, 'Delete /Ref/Child.attr', () => {
      expect(editor.deletePropertyAtPath('/Ref/Child.attr')).toBe(true)
    })
    _VerifyLayer1Contents({
      '/Child': {},
    }, {}, PE('/Ref/Child'), PE('/Ref/Child'), PE('/Ref/Child'), PEA([PE('/Ref/Child'), PathExpression.Nothing()]))
    _VerifyOtherLayerExprs(PE('/Ref/Child'), PE('/Ref/Child'), PE('/Ref/Child'), PEA([PE('/Ref/Child'), PathExpression.Nothing()]))
    _VerifyLayer4Unchanged()

    // Delete: /Ref/Child
    base.applyEdits(editor, 'Delete /Ref/Child', () => {
      expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })
    _VerifyLayer1Contents({}, {}, PathExpression.Nothing(), PathExpression.Nothing(), PathExpression.Nothing(), PEA([PathExpression.Nothing(), PathExpression.Nothing()]))
    _VerifyOtherLayerExprs(PathExpression.Nothing(), PathExpression.Nothing(), PathExpression.Nothing(), PEA([PathExpression.Nothing(), PathExpression.Nothing()]))
    _VerifyLayer4Unchanged()
  })

  // _RunTestBasicGlobalClassArcs
  async function runTestBasicGlobalClassArcs(classArcType: string): Promise<void> {
    // Helper for testing path expression fixup after downstream dependency
    // namespace edits across global class arcs and their implied class specs.
    // classArcType can be either 'inherits' or 'specializes

    // Layer 1 defines /Class/Child and /Class/Child.attr,
    // /ClassSibling, /Prim which inherits or specializes /Class,
    // and /Local with path-expression-bearing fields that target
    // /Prim/Child* (the path translated through /Prim's class arc).
    const layer1 = Layer.createAnonymous('layer1.usda')
    const layer1ImportString = `#usda 1.0
            def "Class" {
                def "Child" {
                    custom int attr
                }
            }

            def "ClassSibling" {
            }

            def "Prim" (
                ` + classArcType + ` = </Class>
            ) {
            }

            def "Local" (
                customData = {
                    pathExpression primExpr = "/Prim/Child /Prim/Child.attr"
                }
            ) {
                pathExpression expr = "/Prim/Child" (
                    customData = {
                        pathExpression propExpr = "/Prim/Child /Prim/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Prim/Child",
                    "/Prim/Child.attr"]
            }
        `
    layer1.importFromString(layer1ImportString)

    // Layer 2 references /Prim from layer1 as /Prim2 (so the global
    // class arc on /Prim propagates as an implied class arc to
    // /Class in layer2's namespace) and defines /Other with path-
    // expression-bearing fields that include both /Prim2/Child*
    // paths (via the reference plus class arc) and /Class/Child*
    // paths (directly through the class spec, which composes via
    // the implied class arc).
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            def "Prim2" (
                references = @` + layer1.identifier + `@</Prim>
            ) {
            }

            over "Class" {
                over "Child" {
                    custom int attr
                }
            }

            def "Other" (
                customData = {
                    pathExpression primExpr = "/Prim2/Child /Prim2/Child.attr /Class/Child /Class/Child.attr"
                }
            ) {
                pathExpression expr = "/Prim2/Child /Class/Child" (
                    customData = {
                        pathExpression propExpr = "/Prim2/Child /Prim2/Child.attr /Class/Child /Class/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Prim2/Child /Class/Child",
                    "/Prim2/Child.attr /Class/Child.attr"]
            }
        `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2)

    // Create an editor for stage 1 with stage 2 as an additional
    // dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {
          '.attr': null,
        },
      },
      '/ClassSibling': {},
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.attr')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {
          '.attr': null,
        },
      },
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim2/Child /Prim2/Child.attr /Class/Child /Class/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim2/Child /Class/Child'),
          'customData': {
            'propExpr': PE('/Prim2/Child /Prim2/Child.attr /Class/Child /Class/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim2/Child /Class/Child'), PE('/Prim2/Child.attr /Class/Child.attr')]),
        },
      },
    })

    // Rename: /Class/Child.attr -> /Class/Child.renamed
    base.applyEdits(editor, '/Class/Child.attr -> /Class/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Class/Child.attr', '/Class/Child.renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {
          '.renamed': null,
        },
      },
      '/ClassSibling': {},
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PE('/Prim/Child.renamed')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {
          '.renamed': null,
        },
      },
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim2/Child /Prim2/Child.renamed /Class/Child /Class/Child.renamed'),
        },
        '.expr': {
          'default': PE('/Prim2/Child /Class/Child'),
          'customData': {
            'propExpr': PE('/Prim2/Child /Prim2/Child.renamed /Class/Child /Class/Child.renamed'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Prim2/Child /Class/Child'),
            PE('/Prim2/Child.renamed /Class/Child.renamed'),
          ]),
        },
      },
    })

    // Rename: /Class/Child -> /Class/Renamed
    base.applyEdits(editor, '/Class/Child -> /Class/Renamed', () => {
      expect(editor.movePrimAtPath('/Class/Child', '/Class/Renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Renamed': {
          '.renamed': null,
        },
      },
      '/ClassSibling': {},
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed /Prim/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PE('/Prim/Renamed.renamed')]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Renamed': {
          '.renamed': null,
        },
      },
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim2/Renamed /Prim2/Renamed.renamed /Class/Renamed /Class/Renamed.renamed'),
        },
        '.expr': {
          'default': PE('/Prim2/Renamed /Class/Renamed'),
          'customData': {
            'propExpr': PE('/Prim2/Renamed /Prim2/Renamed.renamed /Class/Renamed /Class/Renamed.renamed'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Prim2/Renamed /Class/Renamed'),
            PE('/Prim2/Renamed.renamed /Class/Renamed.renamed'),
          ]),
        },
      },
    })

    // Reparent: /Class/Renamed.renamed -> /ClassSibling.moved
    base.applyEdits(editor, 'Reparent /Class/Renamed.renamed -> /ClassSibling.moved', () => {
      expect(editor.movePropertyAtPath('/Class/Renamed.renamed', '/ClassSibling.moved')).toBe(true)
    })

    // /ClassSibling is not inherited or specialized by /Prim, so the
    // property is no longer reachable through /Prim's class arc and
    // the /Prim/Renamed.renamed (and /Class/Renamed.renamed)
    // operands are stripped from the path expressions.
    verifyLayerContents(layer1, {
      '/Class': {
        '/Renamed': {},
      },
      '/ClassSibling': {
        '.moved': null,
      },
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Prim/Renamed'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed'),
          'customData': {
            'propExpr': PE('/Prim/Renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Renamed'), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Renamed': {},
      },
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim2/Renamed /Class/Renamed'),
        },
        '.expr': {
          'default': PE('/Prim2/Renamed /Class/Renamed'),
          'customData': {
            'propExpr': PE('/Prim2/Renamed /Class/Renamed'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim2/Renamed /Class/Renamed'), PathExpression.Nothing()]),
        },
      },
    })

    // Reparent: /Class/Renamed -> /ClassSibling/Moved
    base.applyEdits(editor, 'Reparent /Class/Renamed -> /ClassSibling/Moved', () => {
      expect(editor.movePrimAtPath('/Class/Renamed', '/ClassSibling/Moved')).toBe(true)
    })

    // The prim itself is moved out from under /Class so /Prim/Renamed
    // is no longer reachable via the class arc and the remaining
    // operands are stripped too.
    verifyLayerContents(layer1, {
      '/Class': {},
      '/ClassSibling': {
        '.moved': null,
        '/Moved': {},
      },
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })

    // Reinitialize to reset the path expressions for the delete cases.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Delete: /Class/Child.attr
    base.applyEdits(editor, 'Delete /Class/Child.attr', () => {
      expect(editor.deletePropertyAtPath('/Class/Child.attr')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Class': {
        '/Child': {},
      },
      '/ClassSibling': {},
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PE('/Prim/Child'),
        },
        '.expr': {
          'default': PE('/Prim/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child'), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {
        '/Child': {},
      },
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim2/Child /Class/Child'),
        },
        '.expr': {
          'default': PE('/Prim2/Child /Class/Child'),
          'customData': {
            'propExpr': PE('/Prim2/Child /Class/Child'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim2/Child /Class/Child'), PathExpression.Nothing()]),
        },
      },
    })

    // Delete: /Class/Child
    base.applyEdits(editor, 'Delete /Class/Child', () => {
      expect(editor.deletePrimAtPath('/Class/Child')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Class': {},
      '/ClassSibling': {},
      '/Prim': {},
      '/Local': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim2': {},
      '/Class': {},
      '/Other': {
        'customData': {
          'primExpr': PathExpression.Nothing(),
        },
        '.expr': {
          'default': PathExpression.Nothing(),
          'customData': {
            'propExpr': PathExpression.Nothing(),
          },
        },
        '.arr': {
          'default': PEA([PathExpression.Nothing(), PathExpression.Nothing()]),
        },
      },
    })
  }

  it('test_BasicInherits', async () => {
    await runTestBasicGlobalClassArcs('inherits')
  })

  it('test_BasicSpecializes', async () => {
    await runTestBasicGlobalClassArcs('specializes')
  })

  it('test_BasicVariants', async () => {
    // Tests path expression fixup from downstream dependency namespace edits
    // across a reference contained within a variant both when the variant is
    // selected and when it is not.

    // Layer 1 defines /Ref/Child and /Ref/Child.attr (the prim and
    // property to edit).
    const layer1 = Layer.createAnonymous('layer1.usda')
    const layer1ImportString = `#usda 1.0
            def "Ref" {
                def "Child" {
                    custom int attr
                }
            }
        `
    layer1.importFromString(layer1ImportString)

    // Layer 2 defines /Variant with a variant set "v" whose
    // "selected" variant references /Ref from layer1, /Prim which
    // references /Variant, and /Other with path-expression-bearing
    // fields whose operands list both /Prim/Child* and /Variant/Child*
    // (which does NOT compose on stage2 because the variant has no
    // selection). Only the /Prim/Child* operands get fixed up:
    // /Variant/Child* operands are left alone.
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            def "Variant" (
                variantSets = ["v"]
            ) {
                variantSet "v" = {
                    "selected" (
                        references = @` + layer1.identifier + `@</Ref>
                    ) {
                    }
                }
            }

            def "Prim" (
                references = </Variant>
            ) {
            }

            def "Other" (
                customData = {
                    pathExpression primExpr = "/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr"
                }
            ) {
                pathExpression expr = "/Prim/Child /Variant/Child" (
                    customData = {
                        pathExpression propExpr = "/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Prim/Child /Variant/Child",
                    "/Prim/Child.attr /Variant/Child.attr"]
            }
        `
    layer2.importFromString(layer2ImportString)

    // Session layer authors the variant selection on /Prim so the
    // reference inside the variant composes when stage 2 is opened.
    const sessionLayer = Layer.createAnonymous('session.usda')
    sessionLayer.importFromString(`#usda 1.0
            over "Prim" (
                variants = {
                    string v = "selected"
                }
            ) {
            }
        `)

    // Open both layers as stages. Stage 2 uses the session layer to
    // provide the variant selection.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2, sessionLayer)

    // Create an editor for stage 1 with stage 2 as an additional
    // dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.attr': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child /Variant/Child'), PE('/Prim/Child.attr /Variant/Child.attr')]),
        },
      },
    })

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, '/Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)
    })

    // Only /Prim/Child.attr is fixed up. /Variant/Child.attr has no
    // composed dependency because the variant selection is only authored
    // on /Prim, and not on /Variant and therefore is left alone.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.renamed': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.renamed /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.renamed /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Prim/Child /Variant/Child'),
            PE('/Prim/Child.renamed /Variant/Child.attr'),
          ]),
        },
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    base.applyEdits(editor, '/Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })

    // Only /Prim/Child is fixed up for the same reason as above.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {
          '.renamed': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Renamed /Prim/Renamed.renamed /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Renamed /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Renamed /Prim/Renamed.renamed /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Prim/Renamed /Variant/Child'),
            PE('/Prim/Renamed.renamed /Variant/Child.attr'),
          ]),
        },
      },
    })

    // Reinitialize the path expressions for the delete cases.
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Delete: /Ref/Child.attr
    base.applyEdits(editor, 'Delete /Ref/Child.attr', () => {
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
        'customData': {
          'primExpr': PE('/Prim/Child /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child /Variant/Child'), PE('/Variant/Child.attr')]),
        },
      },
    })

    // Delete: /Ref/Child
    base.applyEdits(editor, 'Delete /Ref/Child', () => {
      expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/Ref': {},
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Variant/Child'),
          'customData': {
            'propExpr': PE('/Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Variant/Child'), PE('/Variant/Child.attr')]),
        },
      },
    })

    // Reinitialize layers and mute the session layer so /Prim has
    // no variant selection on stage 2. Now neither /Prim/Child* nor
    // /Variant/Child* composes on stage 2; the path expressions in
    // /Other have no composed dependency on /Ref/Child* and stay
    // untouched.
    sdfChangeBlock(() => {
      layer1.importFromString(layer1ImportString)
      layer2.importFromString(layer2ImportString)
    })
    await stage2.muteLayer(sessionLayer.identifier)

    // Rename: /Ref/Child.attr -> /Ref/Child.renamed
    base.applyEdits(editor, 'Muted: /Ref/Child.attr -> /Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/Ref/Child.attr', '/Ref/Child.renamed')).toBe(true)
    })

    // Now that there is no variant selection, layer1 is updated, but all the
    // path expressions on /Other are unchanged.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Child': {
          '.renamed': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child /Variant/Child'), PE('/Prim/Child.attr /Variant/Child.attr')]),
        },
      },
    })

    // Rename: /Ref/Child -> /Ref/Renamed
    // layer1 is updated; layer2 /Other expressions remain unchanged.
    base.applyEdits(editor, 'Muted: /Ref/Child -> /Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/Ref/Child', '/Ref/Renamed')).toBe(true)
    })

    // Now that there is no variant selection, layer1 is updated, but all the
    // path expressions on /Other are unchanged.
    verifyLayerContents(layer1, {
      '/Ref': {
        '/Renamed': {
          '.renamed': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Variant': {},
      '/Prim': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Child /Variant/Child'),
          'customData': {
            'propExpr': PE('/Prim/Child /Prim/Child.attr /Variant/Child /Variant/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Child /Variant/Child'), PE('/Prim/Child.attr /Variant/Child.attr')]),
        },
      },
    })
  })

  it('test_BasicRelocates', async () => {
    // Tests path expression fixup after downstream dependency namespace edits
    // across a reference where a child of the referencing prim is then
    // relocated.

    // Layer 1 defines /World/Ref/Child (the prim to edit) and
    // /World/Ref/Child.attr (the property to edit), plus
    // /World/RefSibling (the reparent destination outside /Ref).
    const layer1 = Layer.createAnonymous('layer1.usda')
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

    // Layer 2 defines /Prim which references /World plus a
    // relocates that moves /Prim/Ref to /Relocated. /Other carries
    // path-expression-bearing fields whose operands list both
    // /Relocated/Child* (which composes on stage 2 via the
    // relocate) and /Prim/Ref/Child* (which is the tombstone relocate
    // source path: it does not exist on stage 2, so those paths are
    // NOT fixed up).
    const layer2 = Layer.createAnonymous('layer2.usda')
    const layer2ImportString = `#usda 1.0
            (
                relocates = {
                    </Prim/Ref> : </Relocated>,
                }
            )

            def "Prim" (
                references = @` + layer1.identifier + `@</World>
            ) {
            }

            def "Relocated" {
            }

            def "Other" (
                customData = {
                    pathExpression primExpr = "/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr"
                }
            ) {
                pathExpression expr = "/Relocated/Child /Prim/Ref/Child" (
                    customData = {
                        pathExpression propExpr = "/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr"
                    }
                )
                pathExpression[] arr = [
                    "/Relocated/Child /Prim/Ref/Child",
                    "/Relocated/Child.attr /Prim/Ref/Child.attr"]
            }
        `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await openStage(layer1)
    const stage2 = await openStage(layer2)

    // Create an editor for stage 1 with stage 2 as an additional
    // dependent stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial layer contents.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {
            '.attr': null,
          },
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Child /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Relocated/Child /Prim/Ref/Child'),
            PE('/Relocated/Child.attr /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Rename: /World/Ref/Child.attr -> /World/Ref/Child.renamed
    base.applyEdits(editor, '/World/Ref/Child.attr -> /World/Ref/Child.renamed', () => {
      expect(editor.movePropertyAtPath('/World/Ref/Child.attr', '/World/Ref/Child.renamed')).toBe(true)
    })

    // On stage 2 the relocated property /Relocated/Child.attr
    // renames to /Relocated/Child.renamed; the /Prim/Ref/Child.attr
    // operand has no composed dependency (relocate source) and is
    // left untouched.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {
            '.renamed': null,
          },
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Relocated/Child /Relocated/Child.renamed /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Child /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Child /Relocated/Child.renamed /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Relocated/Child /Prim/Ref/Child'),
            PE('/Relocated/Child.renamed /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Rename: /World/Ref/Child -> /World/Ref/Renamed
    base.applyEdits(editor, '/World/Ref/Child -> /World/Ref/Renamed', () => {
      expect(editor.movePrimAtPath('/World/Ref/Child', '/World/Ref/Renamed')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Renamed': {
            '.renamed': null,
          },
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Relocated/Renamed /Relocated/Renamed.renamed /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Renamed /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Renamed /Relocated/Renamed.renamed /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Relocated/Renamed /Prim/Ref/Child'),
            PE('/Relocated/Renamed.renamed /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Reparent: /World/Ref/Renamed.renamed -> /World/RefSibling.moved
    base.applyEdits(editor, 'Reparent /World/Ref/Renamed.renamed -> /World/RefSibling.moved', () => {
      expect(editor.movePropertyAtPath('/World/Ref/Renamed.renamed', '/World/RefSibling.moved')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Renamed': {},
        },
        '/RefSibling': {
          '.moved': null,
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Relocated/Renamed /Prim/RefSibling.moved /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Renamed /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Renamed /Prim/RefSibling.moved /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Relocated/Renamed /Prim/Ref/Child'),
            PE('/Prim/RefSibling.moved /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Reparent: /World/Ref/Renamed -> /World/RefSibling/Moved
    base.applyEdits(editor, 'Reparent /World/Ref/Renamed -> /World/RefSibling/Moved', () => {
      expect(editor.movePrimAtPath('/World/Ref/Renamed', '/World/RefSibling/Moved')).toBe(true)
    })
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {},
        '/RefSibling': {
          '.moved': null,
          '/Moved': {},
        },
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Prim/RefSibling/Moved /Prim/RefSibling.moved /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/RefSibling/Moved /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Prim/RefSibling/Moved /Prim/RefSibling.moved /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Prim/RefSibling/Moved /Prim/Ref/Child'),
            PE('/Prim/RefSibling.moved /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Edit: Move /World/RefSibling/Moved back to its original path
    // /World/Ref/Child.
    base.applyEdits(editor, 'Reparent /World/RefSibling/Moved -> /World/Ref/Child', () => {
      expect(editor.movePrimAtPath('/World/RefSibling/Moved', '/World/Ref/Child')).toBe(true)
    })

    // Edit: Move /World/RefSibling.moved back to its original path
    // /World/Ref/Child.attr.
    base.applyEdits(editor, 'Reparent /World/RefSibling.moved -> /World/Ref/Child.attr', () => {
      expect(editor.movePropertyAtPath('/World/RefSibling.moved', '/World/Ref/Child.attr')).toBe(true)
    })

    // Verify the layers are fully back to their initial contents.
    // Unlike the references test, no operands were stripped through
    // the reparent sequence: each move kept a valid composed path
    // on stage 2, so reparenting back fully restores both layers.
    verifyLayerContents(layer1, {
      '/World': {
        '/Ref': {
          '/Child': {
            '.attr': null,
          },
        },
        '/RefSibling': {},
      },
    })
    verifyLayerContents(layer2, {
      '/Prim': {},
      '/Relocated': {},
      '/Other': {
        'customData': {
          'primExpr': PE('/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Child /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Child /Relocated/Child.attr /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([
            PE('/Relocated/Child /Prim/Ref/Child'),
            PE('/Relocated/Child.attr /Prim/Ref/Child.attr'),
          ]),
        },
      },
    })

    // Delete: /World/Ref/Child.attr
    base.applyEdits(editor, 'Delete /World/Ref/Child.attr', () => {
      expect(editor.deletePropertyAtPath('/World/Ref/Child.attr')).toBe(true)
    })

    // On stage 2 the property at /Relocated/Child.attr disappears;
    // operands referencing it are stripped. /Prim/Ref/Child.attr
    // (relocate-source path) has no composed dependency and stays.
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
        'customData': {
          'primExpr': PE('/Relocated/Child /Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Relocated/Child /Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Relocated/Child /Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Relocated/Child /Prim/Ref/Child'), PE('/Prim/Ref/Child.attr')]),
        },
      },
    })

    // Delete: /World/Ref/Child
    base.applyEdits(editor, 'Delete /World/Ref/Child', () => {
      expect(editor.deletePrimAtPath('/World/Ref/Child')).toBe(true)
    })

    // On stage 2 the relocated prim /Relocated/Child disappears;
    // the remaining /Relocated/Child operand is stripped.
    // /Prim/Ref/Child* operands remain.
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
        'customData': {
          'primExpr': PE('/Prim/Ref/Child /Prim/Ref/Child.attr'),
        },
        '.expr': {
          'default': PE('/Prim/Ref/Child'),
          'customData': {
            'propExpr': PE('/Prim/Ref/Child /Prim/Ref/Child.attr'),
          },
        },
        '.arr': {
          'default': PEA([PE('/Prim/Ref/Child'), PE('/Prim/Ref/Child.attr')]),
        },
      },
    })
  })
})
