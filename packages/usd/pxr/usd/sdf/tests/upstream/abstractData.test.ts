// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfAbstractData.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfAbstractData.cpp
//
// SCOPE NOTE — read-side partial.
// The current upstream testSdfAbstractData.cpp exercises exactly ONE method of
// the SdfAbstractData interface: GetPreviousTimeSampleForPath (the time-sample
// neighbor query). typescript-usd has no public query API for that — time samples are
// stored on a spec as the `timeSamples` field and read back through
// `Layer.getField(path, 'timeSamples')`; there is no SdfAbstractData polymorphic
// surface and no previous/next-sample lookup. That single C++ axiom is therefore
// BLOCKED at the API level (see report). What typescript-usd DOES expose is the READ side
// of the SdfAbstractData *data-access contract* on `Layer` over its parsed Scene:
//   - HasSpec        -> a spec exists at a path           (getFieldNames(p).length)
//   - List specs     -> SdfAbstractData::VisitSpecs       (getSpecPaths)
//   - List fields    -> SdfAbstractData::List             (getFieldNames)
//   - Has  field     -> SdfAbstractData::Has              (getField !== undefined)
//   - Get  field     -> SdfAbstractData::Get              (getField)
//   - spec-type      -> SdfAbstractData::GetSpecType      (inferred from fields)
// This suite ports that read-side subset. Every golden was captured from the
// Pixar build (usd-2605, Python 3.9.21) by authoring the fixture layer in
// pxr.Sdf and reading ListInfoKeys()/GetInfo()/Traverse()/ListTimeSamplesForPath.

import { describe, it, expect } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

// Fixture authored in pxr.Sdf and round-tripped through ExportToString(); this is
// the exact USDA the Pixar build emits for the captured spec/field goldens below.
const FIXTURE = `#usda 1.0

def Xform "World"
{
    def Sphere "Prim"
    {
        custom rel material:binding = </World/Mat>
        custom color3f myColor = (1, 0, 0)
        double radius = 2
        double3 xformOp:translate.timeSamples = {
            1: (0, 0, 0),
            2: (1, 0, 0),
            3: (2, 0, 0),
        }
    }
}
`

const layer = (): Layer => Layer.createInMemory('abstractData.usda', FIXTURE)

// typescript-usd's parsed Scene stores two structural bookkeeping keys on every spec
// (`form`, the SdfSpecType discriminator slot, and `fields`, the canonical
// ValueRep map) alongside the flattened fields getField() reads. Neither is a
// real authored field — getField returns undefined for both — so the
// SdfAbstractData::List analog drops them.
const listFields = (l: Layer, path: string): string[] =>
  l.getFieldNames(path).filter((f) => f !== 'form' && f !== 'fields')

// SdfAbstractData::HasSpec analog.
const hasSpec = (l: Layer, path: string): boolean => l.getFieldNames(path).length > 0

describe('testSdfAbstractData_Cpp — read-side contract (Layer over parsed Scene)', () => {
  describe('HasSpec', () => {
    it('reports true for every authored spec', () => {
      const l = layer()
      // Captured from Sdf.Layer.Traverse('/') on the Pixar build (prim + property
      // specs; the relationship-target spec and pseudo-root are handled below).
      for (const p of [
        '/World',
        '/World/Prim',
        '/World/Prim.material:binding',
        '/World/Prim.myColor',
        '/World/Prim.radius',
        '/World/Prim.xformOp:translate',
      ]) {
        expect(hasSpec(l, p)).toBe(true)
      }
    })

    it('reports false for a path with no spec', () => {
      const l = layer()
      expect(hasSpec(l, '/World/Nope')).toBe(false)
      expect(hasSpec(l, '/World/Prim.bogus')).toBe(false)
    })
  })

  describe('VisitSpecs (list all spec paths)', () => {
    it('enumerates the pseudo-root, prim, and property specs', () => {
      const l = layer()
      // Pixar Traverse('/') yields: /, /World, /World/Prim, the four
      // property specs and the relationship-target spec.
      expect(l.getSpecPaths().sort()).toEqual([
        '/',
        '/World',
        '/World/Prim',
        '/World/Prim.material:binding',
        '/World/Prim.material:binding[/World/Mat]',
        '/World/Prim.myColor',
        '/World/Prim.radius',
        '/World/Prim.xformOp:translate',
      ])
    })
  })

  describe('Get field (SdfAbstractData::Get)', () => {
    it('reads prim specifier + typeName', () => {
      const l = layer()
      // Pixar: GetInfo('specifier') = Sdf.SpecifierDef, GetInfo('typeName') = 'Xform'/'Sphere'.
      expect(l.getField('/World', 'specifier')).toBe('def')
      expect(l.getField('/World', 'typeName')).toBe('Xform')
      expect(l.getField('/World/Prim', 'specifier')).toBe('def')
      expect(l.getField('/World/Prim', 'typeName')).toBe('Sphere')
    })

    it('reads attribute typeName + default', () => {
      const l = layer()
      // Pixar: radius GetInfo('typeName')='double', GetInfo('default')=2.0.
      expect(l.getField('/World/Prim.radius', 'typeName')).toBe('double')
      expect(l.getField('/World/Prim.radius', 'default')).toBe(2)
      // Pixar: myColor GetInfo('typeName')='color3f', default=Gf.Vec3f(1,0,0), custom=True.
      expect(l.getField('/World/Prim.myColor', 'typeName')).toBe('color3f')
      expect(l.getField('/World/Prim.myColor', 'default')).toEqual([1, 0, 0])
      expect(l.getField('/World/Prim.myColor', 'custom')).toBe(true)
    })

    it('reads relationship targets', () => {
      const l = layer()
      // Pixar: material:binding is a RelationshipSpec (HasInfo('typeName') is
      // False), custom=True, targetPaths = SdfPathListOp(Explicit [/World/Mat]).
      expect(l.getSpecType('/World/Prim.material:binding')).toBe('relationship')
      expect(l.getField('/World/Prim.material:binding', 'typeName')).toBeUndefined()
      expect(l.getField('/World/Prim.material:binding', 'custom')).toBe(true)
      expect(l.getField('/World/Prim.material:binding', 'targetPaths')).toMatchObject({
        isExplicit: true, explicitItems: ['/World/Mat'],
      })
    })

    it('reads prim child + property name lists', () => {
      const l = layer()
      // The primChildren/properties fields are part of SdfAbstractData::List
      // (the namespace bookkeeping the high-level ListInfoKeys filters out).
      expect(l.getField('/World', 'primChildren')).toEqual(['Prim'])
      expect(l.getField('/World/Prim', 'properties')).toEqual([
        'material:binding',
        'myColor',
        'radius',
        'xformOp:translate',
      ])
    })

    it('returns undefined for an unauthored field (Has=false)', () => {
      const l = layer()
      expect(l.getField('/World', 'kind')).toBeUndefined()
      expect(l.getField('/World/Prim.radius', 'timeSamples')).toBeUndefined()
    })
  })

  describe('List / Has field (SdfAbstractData::List, ::Has)', () => {
    it('lists the authored fields on each spec', () => {
      const l = layer()
      // Pixar ListInfoKeys (plus the primChildren children field): the text
      // parser authors custom and variability on every attribute.
      expect(listFields(l, '/World').sort()).toEqual(['primChildren', 'specifier', 'typeName'])
      expect(listFields(l, '/World/Prim.radius').sort()).toEqual([
        'custom', 'default', 'typeName', 'variability',
      ])
      expect(listFields(l, '/World/Prim.myColor').sort()).toEqual([
        'custom', 'default', 'typeName', 'variability',
      ])
    })

    it('Has(field) is true exactly for listed fields', () => {
      const l = layer()
      const names = listFields(l, '/World/Prim.myColor')
      expect(names).toContain('custom')
      expect(names).toContain('default')
      expect(names).toContain('variability')
      expect(names).not.toContain('timeSamples')
    })

    it('an absent spec lists no fields', () => {
      const l = layer()
      expect(l.getFieldNames('/World/Nope')).toEqual([])
    })
  })

  describe('GetSpecType (inferred from authored fields)', () => {
    // typescript-usd does not store an explicit SdfSpecType; the read contract infers it
    // the way the writer/composer do — prims carry `specifier`, properties are
    // addressed with a `.`, and relationships set typeName === 'rel'.
    const isPrim = (l: Layer, p: string) =>
      !p.includes('.') && l.getField(p, 'specifier') !== undefined
    const isProperty = (p: string) => p.includes('.')
    const isRelationship = (l: Layer, p: string) => l.getSpecType(p) === 'relationship'

    it('classifies prim vs property vs relationship specs', () => {
      const l = layer()
      expect(isPrim(l, '/World')).toBe(true)
      expect(isPrim(l, '/World/Prim')).toBe(true)
      expect(isProperty('/World/Prim.radius')).toBe(true)
      expect(isProperty('/World/Prim.material:binding')).toBe(true)
      expect(isRelationship(l, '/World/Prim.material:binding')).toBe(true)
      expect(isRelationship(l, '/World/Prim.radius')).toBe(false)
    })
  })

  describe('time-sample storage', () => {
    // Pixar ListTimeSamplesForPath gave [1.0, 2.0, 3.0] with values
    // (0,0,0)/(1,0,0)/(2,0,0).
    it('reads the authored time samples keyed by time', () => {
      const l = layer()
      const path = '/World/Prim.xformOp:translate'
      expect(l.listTimeSamplesForPath(path)).toEqual([1, 2, 3])
      expect(l.queryTimeSample(path, 1)).toEqual([0, 0, 0])
      expect(l.queryTimeSample(path, 2)).toEqual([1, 0, 0])
      expect(l.queryTimeSample(path, 3)).toEqual([2, 0, 0])
    })
  })
})
