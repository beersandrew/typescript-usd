import { describe, expect, it } from 'vitest'
import * as Usd from '../../src/index.ts'

const attributeUnion = [
  'flattenTo',
  'getPropertyStack',
  'getPropertyStackWithLayerOffsets',
  'hasFallbackValue',
  'getFallbackValue',
  'getValue',
  'hasAuthoredValue',
  'hasAuthoredValueOpinion',
  'hasValue',
  'getResolveInfo',
  'typeName',
  'isRelationship',
  'getField',
  'setMetadata',
  'getConnections',
  'getTargets',
  'getDefaultValue',
  'getDefaultValueResult',
  'getTimeSampleKeys',
  'hasSpline',
  'getSpline',
  'getTimeSamplesInInterval',
  'getUnionedTimeSamples',
  'getUnionedTimeSamplesInInterval',
  'getBracketingTimeSamples',
  'getValueAtTime',
  'getStage',
  'primPath',
  'name',
  'set',
  'setTimeSample',
  'connect',
  'setConnections',
  'addConnection',
  'removeConnection',
  'clearConnections',
  'hasColorSpace',
  'getColorSpace',
  'setColorSpace',
  'getMetadata',
  'hasMetadata',
  'hasAuthoredMetadata',
  'clearMetadata',
  'getLimits',
  'getSoftLimits',
  'getHardLimits',
  'clear',
  'block',
  'blockAnimation',
  'setSpline',
  'get',
] as const

const primUnion = [
  'getStage',
  'typeName',
  'getPrimTypeInfo',
  'getPrimDefinition',
  'getAppliedSchemas',
  'isA',
  'isInFamily',
  'getVersionIfIsInFamily',
  'hasAPI',
  'hasAPIInFamily',
  'getVersionIfHasAPIInFamily',
  'isActive',
  'isDefined',
  'isAbstract',
  'isLoaded',
  'hasDefiningSpecifier',
  'hasClassSpecifier',
  'getFilteredChildren',
  'getChildren',
  'getAllChildren',
  'getFilteredDescendants',
  'getDescendants',
  'getAllDescendants',
  'getMetadata',
  'setMetadata',
  'clearMetadata',
  'getKind',
  'setKind',
  'isKind',
  'isModel',
  'isGroup',
  'attrNames',
  'getAttr',
  'findAllAttributeConnectionPaths',
  'isInstance',
  'getPrototype',
  'isInstanceable',
  'isInstanceProxy',
  'getPrimInPrototype',
  'isPrototype',
  'isInPrototype',
  'getPropertyNames',
  'getAllMetadata',
  'hasAuthoredMetadata',
  'setTypeName',
  'attr',
  'createAttr',
  'rel',
  'createRel',
  'getReferences',
  'getPayloads',
  'getSpecializes',
  'setActive',
  'addAppliedSchema',
  'canApplyAPI',
  'applyAPI',
  'removeAPI',
] as const

describe('OpenUSD v26.08 public object shape', () => {
  it('exports one Attribute carrying the complete former read/write union', () => {
    for (const member of attributeUnion) {
      expect(
        member in Usd.Attribute.prototype || member in Usd.Attribute,
        `Attribute.${member}`,
      ).toBe(true)
    }
    expect('Attr' in Usd).toBe(false)
    expect('UsdAttr' in Usd).toBe(false)
  })

  it('exports one Prim carrying the complete former read/write union', () => {
    for (const member of primUnion) {
      expect(member in Usd.Prim.prototype, `Prim.${member}`).toBe(true)
    }
    expect('UsdPrim' in Usd).toBe(false)
  })

  it('returns authorable Prim and Attribute instances from stage reads', () => {
    const stage = Usd.Stage.createNew()
    stage.definePrim('/World', 'Xform')
    const prim = stage.getPrim('/World')!

    expect(prim).toBeInstanceOf(Usd.Prim)
    prim.setTypeName('Scope')
    prim.createAttr('answer', 42)

    const attribute = stage.get('/World.answer')!
    expect(attribute).toBeInstanceOf(Usd.Attribute)
    expect(attribute.getValue()).toBe(42)
    attribute.set(43)
    expect(attribute.getValue()).toBe(43)
  })
})
