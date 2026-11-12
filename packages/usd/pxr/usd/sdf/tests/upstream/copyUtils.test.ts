// Ported from OpenUSD 26.11.1: pxr/usd/sdf/copyUtils.h,
//  pxr/usd/sdf/testenv/testSdfCopyUtils.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfCopyUtils.py.
//
// Python's Sdf.CopySpec callbacks return True/False, (True, value) or
// (True, srcChildren, dstChildren); the C++ API they wrap (copyUtils.h:88-92,
// 140-145) reports the replacement through std::optional<VtValue>* out
// parameters, which sdfCopySpec's callbacks receive as SdfOptionalValue
// holders.

import { describe, expect, it } from 'vitest'
import {
  AttributeSpec, Layer, ListOp, Payload, PrimSpec, Reference, RelationshipSpec, ValueTypeNames,
  sdfCopySpec, sdfCreatePrimInLayer, sdfCreateVariantInLayer,
  type ShouldCopyChildrenFn, type ShouldCopyValueFn,
} from '../../src/index.ts'

// Mirrors the textwrap.dedent()ed layer strings.
function dedent(text: string): string {
  const lines = text.split('\n')
  const indents = lines.filter(line => line.trim() !== '').map(line => /^ */.exec(line)![0].length)
  const indent = Math.min(...indents)
  return lines.map(line => line.slice(indent)).join('\n')
}

// _VerifyExpectedData (testSdfCopyUtils.py:12-21).
function verifyExpectedData(layer: Layer, expected: Record<string, Record<string, unknown>>): void {
  for (const [path, fieldValues] of Object.entries(expected)) {
    const spec = layer.getObjectAtPath(path)
    expect(spec, path).toBeTruthy()
    for (const [field, value] of Object.entries(fieldValues)) {
      expect(spec!.getInfo(field), `${path} ${field}`).toEqual(value)
    }
    for (const field of spec!.listInfoKeys()) {
      expect(Object.keys(fieldValues), `${path} ${field}`).toContain(field)
    }
  }
}

const pathItem = (item: unknown): string => String(item)

function expectPathListOp(actual: unknown, explicitItems: string[]): void {
  expect(ListOp.fromValue(actual, pathItem).toValue())
    .toEqual(ListOp.createExplicit(explicitItems).toValue())
}

const String_ = ValueTypeNames.String.name
const Float = ValueTypeNames.Float.name
const Double = ValueTypeNames.Double.name

const allTrue = (): boolean => true

describe('TestSdfCopyUtils', () => {
  it('test_Basic', () => {
    // Tests basic spec copying functionality
    const srcLayer = Layer.createAnonymous()
    const srcLayerStr = `\
        #usda 1.0

        def Scope "Root"
        {
            custom string attr = "root_attr"
            custom rel rel

            over "Child"
            {
            }
            variantSet "vset" = {
                "x" (documentation = "testing") {
                    over "VariantChild"
                    {
                    }
                }
            }
        }
        `
    srcLayer.importFromString(dedent(srcLayerStr))

    const dstLayer = Layer.createAnonymous()

    // Copy the entire /Root prim spec.
    expect(sdfCopySpec(srcLayer, '/Root', dstLayer, '/RootCopy')).toBe(true)
    verifyExpectedData(dstLayer, {
      '/RootCopy': { specifier: 'def', typeName: 'Scope' },
      '/RootCopy.attr': { custom: true, typeName: String_, default: 'root_attr', variability: 'varying' },
      '/RootCopy.rel': { custom: true, variability: 'uniform' },
      '/RootCopy/Child': { specifier: 'over' },
      '/RootCopy{vset=}': {},
      '/RootCopy{vset=x}': { specifier: 'over', documentation: 'testing' },
      '/RootCopy{vset=x}VariantChild': { specifier: 'over' },
    })

    // Create a parent prim spec to test copying property and variant specs.
    sdfCreatePrimInLayer(dstLayer, '/NewRoot')

    // Copy the /Root.attr attribute spec.
    expect(sdfCopySpec(srcLayer, '/Root.attr', dstLayer, '/NewRoot.attr2')).toBe(true)
    verifyExpectedData(dstLayer, {
      '/NewRoot.attr2': { custom: true, typeName: String_, default: 'root_attr', variability: 'varying' },
    })

    // Copy the /Root.rel relationship spec.
    expect(sdfCopySpec(srcLayer, '/Root.rel', dstLayer, '/NewRoot.rel2')).toBe(true)
    verifyExpectedData(dstLayer, {
      '/NewRoot.rel2': { custom: true, variability: 'uniform' },
    })

    // Copy the /Root{vset=} variant set spec.
    expect(sdfCopySpec(srcLayer, '/Root{vset=}', dstLayer, '/NewRoot{zset=}')).toBe(true)
    verifyExpectedData(dstLayer, {
      '/NewRoot{zset=}': {},
      '/NewRoot{zset=x}': { specifier: 'over', documentation: 'testing' },
      '/NewRoot{zset=x}VariantChild': { specifier: 'over' },
    })

    // Copy the /Root{vset=x} variant spec.
    expect(sdfCopySpec(srcLayer, '/Root{vset=x}', dstLayer, '/NewRoot{zset=y}')).toBe(true)
    verifyExpectedData(dstLayer, {
      '/NewRoot{zset=y}': { specifier: 'over', documentation: 'testing' },
      '/NewRoot{zset=y}VariantChild': { specifier: 'over' },
    })
  })

  it('test_Overwrite', () => {
    // Tests that copying a spec will overwrite a pre-existing spec completely.
    const srcLayer = Layer.createAnonymous()
    const srcLayerStr = `\
        #usda 1.0

        def "Empty"
        {
        }

        def Scope "Root"
        {
            custom string attr = "root_attr"
            custom rel rel

            over "Child"
            {
            }
            variantSet "vset" = {
                "x" (documentation = "root") {
                    over "RootVariantChild"
                    {
                    }
                }
            }
        }

        def Scope "Copy"
        {
            double attr = 1.0
            rel rel

            over "Child"
            {
            }
            variantSet "vset" = {
                "y" (kind = "model") {
                    over "CopyVariantChild"
                    {
                    }
                }
            }
        }
        `
    srcLayer.importFromString(dedent(srcLayerStr))

    // Copy the /Root{vset=x} variant spec over /Copy{vset=y}
    expect(sdfCopySpec(srcLayer, '/Root{vset=x}', srcLayer, '/Copy{vset=y}')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Copy{vset=y}': { specifier: 'over', documentation: 'root' },
      '/Copy{vset=y}RootVariantChild': { specifier: 'over' },
    })
    expect(srcLayer.getObjectAtPath('/Copy{vset=y}CopyVariantChild')).toBeFalsy()

    // Copy the /Root{vset=} variant set spec over /Copy{vset=}
    expect(sdfCopySpec(srcLayer, '/Root{vset=}', srcLayer, '/Copy{vset=}')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Copy{vset=}': {},
      '/Copy{vset=x}': { specifier: 'over', documentation: 'root' },
      '/Copy{vset=x}RootVariantChild': { specifier: 'over' },
    })
    expect(srcLayer.getObjectAtPath('/Copy{vset=y}')).toBeFalsy()

    // Copy the /Root.attr attribute spec over /Copy.attr
    expect(sdfCopySpec(srcLayer, '/Root.attr', srcLayer, '/Copy.attr')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Copy.attr': { custom: true, typeName: String_, default: 'root_attr', variability: 'varying' },
    })

    // Copy the /Root.rel relationship spec over /Copy.rel
    expect(sdfCopySpec(srcLayer, '/Root.rel', srcLayer, '/Copy.rel')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Copy.rel': { custom: true, variability: 'uniform' },
    })

    // Copy the /Empty relationship spec over /Copy
    expect(sdfCopySpec(srcLayer, '/Empty', srcLayer, '/Copy')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Copy': { specifier: 'def' },
    })
    const dstSpec = srcLayer.getPrimAtPath('/Copy')!
    expect(dstSpec.getNameChildren().values()).toEqual([])
    expect(dstSpec.getProperties().values()).toEqual([])
  })

  it('test_CopyPrimsAndVariant', () => {
    // Tests that a prim spec can be copied to a variant and vice-versa.
    const srcLayer = Layer.createAnonymous()
    const srcLayerStr = `\
        #usda 1.0

        def SourceType "Source"
        {
            double attr = 1.0
            def "Child"
            {
            }

            variantSet "y" = {
                "a" {
                    double attr = 1.0
                    def "Child"
                    {
                    }
                }
            }
        }

        over "OverSource"
        {
            variantSet "x" = {
                "a" {
                    def "Child"
                    {
                    }
                }
            }
        }

        def "Dest"
        {
            variantSet "x" = {
                "a" {
                }
            }
        }

        def "Dest2"
        {
        }
        `
    srcLayer.importFromString(dedent(srcLayerStr))

    const doubleAttr = { typeName: Double, default: 1.0, variability: 'varying', custom: false }

    // Copy the /Source prim over /Dest{x=a}
    expect(sdfCopySpec(srcLayer, '/Source', srcLayer, '/Dest{x=a}')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Dest{x=a}': { specifier: 'over' },
      '/Dest{x=a}.attr': doubleAttr,
      '/Dest{x=a}Child': { specifier: 'def' },
      '/Dest{x=a}{y=a}': { specifier: 'over' },
      '/Dest{x=a}{y=a}.attr': doubleAttr,
      '/Dest{x=a}{y=a}Child': { specifier: 'def' },
    })

    // Copy the /Source prim into a new variant /Dest{x=b}
    expect(sdfCopySpec(srcLayer, '/Source', srcLayer, '/Dest{x=b}')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Dest{x=b}': { specifier: 'over' },
      '/Dest{x=b}.attr': doubleAttr,
      '/Dest{x=b}Child': { specifier: 'def' },
      '/Dest{x=b}{y=a}': { specifier: 'over' },
      '/Dest{x=b}{y=a}.attr': doubleAttr,
      '/Dest{x=b}{y=a}Child': { specifier: 'def' },
    })

    // Copy the /Source{y=a} variant over /Dest2
    // Note the specifier and typename from the source variant's owning
    // prim are copied over to the destination prim.
    expect(sdfCopySpec(srcLayer, '/Source{y=a}', srcLayer, '/Dest2')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Dest2': { specifier: 'def', typeName: 'SourceType' },
      '/Dest2.attr': doubleAttr,
      '/Dest2/Child': { specifier: 'def' },
    })

    // Copy the /Source{y=a} variant into a new prim /Dest3
    // Note the specifier and typename from the source variant's owning
    // prim are copied over to the to the destination prim.
    expect(sdfCopySpec(srcLayer, '/Source{y=a}', srcLayer, '/Dest3')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Dest3': { specifier: 'def', typeName: 'SourceType' },
      '/Dest3.attr': doubleAttr,
      '/Dest3/Child': { specifier: 'def' },
    })

    // Copy the /OverSource variant into a new prim /Dest4.
    // Note the specifier and typename from the source variant's owning
    // prim are copied over to the to the destination prim.
    expect(sdfCopySpec(srcLayer, '/OverSource{x=a}', srcLayer, '/Dest4')).toBe(true)
    verifyExpectedData(srcLayer, {
      '/Dest4': { specifier: 'over' },
      '/Dest4/Child': { specifier: 'def' },
    })
  })

  it('test_AttributeConnectionRemapping', () => {
    // Tests that attribute connections that point to a child of the source
    // path are remapped to the destination path.
    const layer = Layer.createAnonymous()
    const primSpec = sdfCreatePrimInLayer(layer, '/Test/Child')!
    const attrSpec = AttributeSpec.new(primSpec, 'attr', ValueTypeNames.Float)!
    attrSpec.getConnectionPathList().getExplicitItems().assign(
      ['/Test/Child.attr2', '/Test/Child/Subchild.attr3', '/Test/Sibling.attr'])

    // Copy root prim and verify that connections on the child prim that
    // point to objects beneath /Test are remapped to /TestCopy.
    expect(sdfCopySpec(layer, '/Test', layer, '/TestCopy')).toBe(true)

    let dstAttrSpec = layer.getAttributeAtPath('/TestCopy/Child.attr')
    expect(dstAttrSpec).toBeTruthy()
    expectPathListOp(dstAttrSpec!.getInfo('connectionPaths'),
      ['/TestCopy/Child.attr2', '/TestCopy/Child/Subchild.attr3', '/TestCopy/Sibling.attr'])

    // Copy prim with attribute and verify that connections that point to
    // objects beneath the source /Test/Child prim are remapped to /Dest.
    expect(sdfCopySpec(layer, '/Test/Child', layer, '/Dest')).toBe(true)

    dstAttrSpec = layer.getAttributeAtPath('/Dest.attr')
    expect(dstAttrSpec).toBeTruthy()
    expectPathListOp(dstAttrSpec!.getInfo('connectionPaths'),
      ['/Dest.attr2', '/Dest/Subchild.attr3', '/Test/Sibling.attr'])

    // Same as above, but copy to variant to ensure that variant selection
    // paths aren't authored into the connection list.
    sdfCreateVariantInLayer(layer, '/Variant', 'version', 'a')
    expect(sdfCopySpec(layer, '/Test/Child', layer, '/Variant{version=a}')).toBe(true)

    dstAttrSpec = layer.getAttributeAtPath('/Variant{version=a}.attr')
    expect(dstAttrSpec).toBeTruthy()
    const expected = ['/Variant.attr2', '/Variant/Subchild.attr3', '/Test/Sibling.attr']
    expectPathListOp(dstAttrSpec!.getInfo('connectionPaths'), expected)

    // Copy from variant to variant, again to ensure that variant selection
    // paths aren't authored into the connection list.
    sdfCreateVariantInLayer(layer, '/Variant', 'version', 'b')
    expect(sdfCopySpec(layer, '/Variant{version=a}', layer, '/Variant{version=b}')).toBe(true)

    dstAttrSpec = layer.getAttributeAtPath('/Variant{version=b}.attr')
    expect(dstAttrSpec).toBeTruthy()
    expectPathListOp(dstAttrSpec!.getInfo('connectionPaths'), expected)
  })

  it('test_RelationshipTargetRemapping', () => {
    // Tests that relationship targets that point to a child of the source
    // path are remapped to the destination path.
    const layer = Layer.createAnonymous()
    const primSpec = sdfCreatePrimInLayer(layer, '/Test/Child')!
    const relSpec = RelationshipSpec.new(primSpec, 'rel')!
    relSpec.getTargetPathList().getExplicitItems().assign(
      ['/Test/Child.attr2', '/Test/Child/Subchild.attr3', '/Test/Sibling.attr'])

    // Copy root prim and verify that targets on the child prim that point to
    // objects beneath /Test are remapped to /TestCopy.
    expect(sdfCopySpec(layer, '/Test', layer, '/TestCopy')).toBe(true)

    let dstRelSpec = layer.getRelationshipAtPath('/TestCopy/Child.rel')
    expect(dstRelSpec).toBeTruthy()
    expectPathListOp(dstRelSpec!.getInfo('targetPaths'),
      ['/TestCopy/Child.attr2', '/TestCopy/Child/Subchild.attr3', '/TestCopy/Sibling.attr'])

    // Copy prim with relationship and verify that targets that point to
    // objects beneath the source /Test/Child prim are remapped to /Dest.
    expect(sdfCopySpec(layer, '/Test/Child', layer, '/Dest')).toBe(true)

    dstRelSpec = layer.getRelationshipAtPath('/Dest.rel')
    expect(dstRelSpec).toBeTruthy()
    expectPathListOp(dstRelSpec!.getInfo('targetPaths'),
      ['/Dest.attr2', '/Dest/Subchild.attr3', '/Test/Sibling.attr'])

    // Same as above, but copy to variant to ensure that variant selection
    // paths aren't authored into the connection list.
    sdfCreateVariantInLayer(layer, '/Variant', 'version', 'a')
    expect(sdfCopySpec(layer, '/Test/Child', layer, '/Variant{version=a}')).toBe(true)

    dstRelSpec = layer.getRelationshipAtPath('/Variant{version=a}.rel')
    expect(dstRelSpec).toBeTruthy()
    const expected = ['/Variant.attr2', '/Variant/Subchild.attr3', '/Test/Sibling.attr']
    expectPathListOp(dstRelSpec!.getInfo('targetPaths'), expected)

    // Copy from variant to variant, again to ensure that variant selection
    // paths aren't authored into the connection list.
    sdfCreateVariantInLayer(layer, '/Variant', 'version', 'b')
    expect(sdfCopySpec(layer, '/Variant{version=a}', layer, '/Variant{version=b}')).toBe(true)

    dstRelSpec = layer.getRelationshipAtPath('/Variant{version=b}.rel')
    expect(dstRelSpec).toBeTruthy()
    expectPathListOp(dstRelSpec!.getInfo('targetPaths'), expected)
  })

  it('test_InheritsAndSpecializesRemapping', () => {
    const testRemapping = (fieldName: string): void => {
      const layer = Layer.createAnonymous()
      const srcPrimSpec = sdfCreatePrimInLayer(layer, '/Root/Instance')!

      const listOp = ListOp.createExplicit(['/GlobalClass', '/Root/LocalClass'])
      srcPrimSpec.setInfo(fieldName, listOp.toValue())

      // Copy the root prim spec. The paths in the listOp on the child prim
      // that are beneath the root will be remapped to the new destination.
      expect(sdfCopySpec(layer, '/Root', layer, '/RootCopy')).toBe(true)

      expectPathListOp(layer.getPrimAtPath('/RootCopy/Instance')!.getInfo(fieldName),
        ['/GlobalClass', '/RootCopy/LocalClass'])

      // Copy the child prim spec on which the inherit or specializes list is
      // authored. Since the paths in the listOp are outside the root of the
      // copy operation, none of them will be remapped.
      expect(sdfCopySpec(layer, '/Root/Instance', layer, '/InstanceCopy')).toBe(true)

      expectPathListOp(layer.getPrimAtPath('/InstanceCopy')!.getInfo(fieldName),
        ['/GlobalClass', '/Root/LocalClass'])
    }

    testRemapping('inheritPaths')
    testRemapping('specializes')
  })

  it('test_ReferenceRemapping', () => {
    const layer = Layer.createAnonymous()
    const srcPrimSpec = sdfCreatePrimInLayer(layer, '/Root/Child')!
    srcPrimSpec.getReferenceList().getExplicitItems().assign([
      // External reference
      new Reference('./test.usda', '/Ref'),
      // External sub-root reference
      new Reference('./test.usda', '/Root/Ref'),
      // Internal reference
      new Reference('', '/Ref'),
      // Internal sub-root reference
      new Reference('', '/Root/Ref'),
    ])

    const expectRefs = (actual: unknown, expected: Reference[]): void => {
      expect(ListOp.fromValue(actual, Reference._from).toValue())
        .toEqual(ListOp.createExplicit(expected).toValue())
    }

    // Copy the root prim spec and verify that the internal sub-root
    // references on the child prim that target a prim beneath /Root are
    // remapped to /RootCopy.
    expect(sdfCopySpec(layer, '/Root', layer, '/RootCopy')).toBe(true)

    expectRefs(layer.getPrimAtPath('/RootCopy/Child')!.getInfo('references'), [
      new Reference('./test.usda', '/Ref'),
      new Reference('./test.usda', '/Root/Ref'),
      new Reference('', '/Ref'),
      new Reference('', '/RootCopy/Ref'),
    ])

    // Copy the child prim spec. Since all of the internal sub-root
    // references point outside the root of the copy operation, none of them
    // will be remapped.
    expect(sdfCopySpec(layer, '/Root/Child', layer, '/ChildCopy')).toBe(true)

    expectRefs(layer.getPrimAtPath('/ChildCopy')!.getInfo('references'), [
      new Reference('./test.usda', '/Ref'),
      new Reference('./test.usda', '/Root/Ref'),
      new Reference('', '/Ref'),
      new Reference('', '/Root/Ref'),
    ])
  })

  it('test_PayloadRemapping', () => {
    const layer = Layer.createAnonymous()
    const srcPrimSpec = sdfCreatePrimInLayer(layer, '/Root/Child')!
    srcPrimSpec.getPayloadList().getExplicitItems().assign([
      // External payload
      new Payload('./test.usda', '/Ref'),
      // External sub-root payload
      new Payload('./test.usda', '/Root/Ref'),
      // Internal payload
      new Payload('', '/Ref'),
      // Internal sub-root payload
      new Payload('', '/Root/Ref'),
    ])

    const expectPayloads = (actual: unknown, expected: Payload[]): void => {
      expect(ListOp.fromValue(actual, Payload._from).toValue())
        .toEqual(ListOp.createExplicit(expected).toValue())
    }

    // Copy the root prim spec and verify that the internal sub-root payloads
    // on the child prim that target a prim beneath /Root are remapped to
    // /RootCopy.
    expect(sdfCopySpec(layer, '/Root', layer, '/RootCopy')).toBe(true)

    expectPayloads(layer.getPrimAtPath('/RootCopy/Child')!.getInfo('payload'), [
      new Payload('./test.usda', '/Ref'),
      new Payload('./test.usda', '/Root/Ref'),
      new Payload('', '/Ref'),
      new Payload('', '/RootCopy/Ref'),
    ])

    // Copy the child prim spec. Since all of the internal sub-root payloads
    // point outside the root of the copy operation, none of them will be
    // remapped.
    expect(sdfCopySpec(layer, '/Root/Child', layer, '/ChildCopy')).toBe(true)

    expectPayloads(layer.getPrimAtPath('/ChildCopy')!.getInfo('payload'), [
      new Payload('./test.usda', '/Ref'),
      new Payload('./test.usda', '/Root/Ref'),
      new Payload('', '/Ref'),
      new Payload('', '/Root/Ref'),
    ])
  })

  it('test_Relocates', () => {
    // Tests that relocates are remapped to destination prim on copy. Not in
    // 26.11.1's testSdfCopyUtils.py, which dropped prim relocates from Sdf;
    // copyUtils.cpp:720-724 still remaps a legacy prim `relocates` field, so
    // it is authored here as a plain field.
    const layer = Layer.createAnonymous()
    PrimSpec.new(layer, 'Root', 'over')
    layer.setField('/Root', 'relocates', { '/Root/A': '/Root/B' })

    expect(sdfCopySpec(layer, '/Root', layer, '/Copy')).toBe(true)
    // `relocates` is not prim metadata (no getInfo/listInfoKeys), so the
    // copied field is read directly.
    verifyExpectedData(layer, { '/Copy': { specifier: 'over' } })
    expect(layer.getField('/Copy', 'relocates')).toEqual({ '/Copy/A': '/Copy/B' })
  })

  it('test_Overlapping', () => {
    // Tests cases where src & dst overlap in the same layer.
    const initialState = dedent(`\
            #usda 1.0
            def "A"
            {
                def "B"
                {
                    def "C"
                    {
                        rel child = </A/B/C/D>
                        rel parent = </A/B>
                        def "D"
                        {
                        }
                    }
                }
            }
            `)
    const specDef = { specifier: 'def' }

    // Copy /A to /A/B/A.
    const layer = Layer.createAnonymous()
    layer.importFromString(initialState)
    expect(sdfCopySpec(layer, '/A', layer, '/A/B/A')).toBe(true)
    verifyExpectedData(layer, {
      '/A': specDef,
      '/A/B': specDef,
      '/A/B/C': specDef,
      '/A/B/C/D': specDef,
      '/A/B/A': specDef,
      '/A/B/A/B': specDef,
      '/A/B/A/B/C': specDef,
      '/A/B/A/B/C/D': specDef,
    })

    expectPathListOp(layer.getRelationshipAtPath('/A/B/A/B/C.child')!.getInfo('targetPaths'),
      ['/A/B/A/B/C/D'])
    expectPathListOp(layer.getRelationshipAtPath('/A/B/A/B/C.parent')!.getInfo('targetPaths'),
      ['/A/B/A/B'])

    // Copy /A/B/C to /A. Note that since Sdf.CopySpec replaces completely,
    // the result is just /A/D.
    layer.importFromString(initialState)
    expect(sdfCopySpec(layer, '/A/B/C', layer, '/A')).toBe(true)

    verifyExpectedData(layer, {
      '/A': specDef,
      '/A/D': specDef,
    })
    expect(layer.getPrimAtPath('/A/B')).toBeFalsy()

    // The 'child' rel gets fixed since it points within the src, but the
    // 'parent' rel does not, because it points outside of src.
    expectPathListOp(layer.getRelationshipAtPath('/A.child')!.getInfo('targetPaths'), ['/A/D'])
    expectPathListOp(layer.getRelationshipAtPath('/A.parent')!.getInfo('targetPaths'), ['/A/B'])
  })

  it('test_Advanced', () => {
    // Test using callbacks to control spec copying via advanced API
    const l = Layer.createAnonymous()
    const primSpec = PrimSpec.new(l, 'Root', 'over')!
    primSpec.setDocumentation('prim docs')
    primSpec.setKind('model')

    // If callbacks just return True, all values and children are copied.
    expect(sdfCopySpec(l, '/Root', l, '/Copy', allTrue, allTrue)).toBe(true)
    verifyExpectedData(l, {
      '/Copy': { specifier: 'over', documentation: 'prim docs', kind: 'model' },
    })

    // Set up a value callback that skips copying a field and replaces the
    // value of another field during the copy.
    const shouldCopyValue: ShouldCopyValueFn = (...args) => {
      if (args[1] === 'documentation') return false
      if (args[1] === 'kind') {
        args[8].value = 'prop'
        return true
      }
      return true
    }

    expect(sdfCopySpec(l, '/Root', l, '/Copy2', shouldCopyValue, allTrue)).toBe(true)
    verifyExpectedData(l, {
      '/Copy2': { specifier: 'over', kind: 'prop' },
    })

    // Set up a children callback that skips copying properties.
    const attrSpecA = AttributeSpec.new(primSpec, 'A', ValueTypeNames.Float)!
    attrSpecA.setCustom(true)
    attrSpecA.setDefaultValue(1.0)

    const attrSpecB = AttributeSpec.new(primSpec, 'B', ValueTypeNames.Float)!
    attrSpecB.setCustom(true)
    attrSpecB.setDefaultValue(2.0)

    const skipProperties: ShouldCopyChildrenFn = (...args) => args[0] !== 'properties'

    expect(sdfCopySpec(l, '/Root', l, '/Copy3', allTrue, skipProperties)).toBe(true)

    let dstPrimSpec = l.getPrimAtPath('/Copy3')!
    expect(dstPrimSpec.getProperties().values()).toEqual([])

    // Set up a children callback that copies the property named "A" to a
    // property named "C" under the destination spec.
    const renameProperty: ShouldCopyChildrenFn = (...args) => {
      if (args[0] === 'properties') {
        args[7].value = ['A']
        args[8].value = ['C']
        return true
      }
      return true
    }

    expect(sdfCopySpec(l, '/Root', l, '/Copy4', allTrue, renameProperty)).toBe(true)
    dstPrimSpec = l.getPrimAtPath('/Copy4')!
    expect(dstPrimSpec.getProperties().values().map(p => p.getPath().pathString))
      .toEqual([l.getAttributeAtPath('/Copy4.C')!.getPath().pathString])
    verifyExpectedData(l, {
      '/Copy4.C': { custom: true, default: 1.0, typeName: Float, variability: 'varying' },
    })
  })
})
