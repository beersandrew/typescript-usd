// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/testenv/testUsdUIHints.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdUI/testenv/testUsdUIHints.py
//
// Fixture: fixtures/testUsdUIHints/hints.usda, copied verbatim from
// pxr/usd/usdUI/testenv/testUsdUIHints/hints.usda.
//
// Python's RuntimeError (Tf.ErrorException) from a TF_CODING_ERROR is a
// thrown TfError here; invalid Usd.Prim() / Usd.Attribute() objects are
// `undefined`; VtDictionary values are plain objects and VtTokenArray values
// string arrays. UsdObject::GetDisplayName / UsdProperty::GetDisplayGroup /
// UsdObject::IsHidden (legacy fields) read the displayName / displayGroup /
// hidden metadata.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Error as TfError, TfGetEnvSetting } from 'typescript-usd/tf'
import { Stage, type Attribute, type Prim } from 'typescript-usd/usd'
import {
  AttributeHints, ObjectHints, PrimHints, PropertyHints, USDUI_WRITE_LEGACY_UI_HINTS,
  type UsdUIObject, type UsdUIProperty,
} from 'typescript-usd/usdUI'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'testUsdUIHints', 'hints.usda')

// UsdObject equality / IsValid() over possibly-invalid (undefined) objects.
function samePath(a: UsdUIObject | undefined, b: UsdUIObject | undefined): boolean {
  const path = (o: UsdUIObject | undefined) =>
    o === undefined ? undefined : 'getPath' in o ? o.getPath() : o.path
  return path(a) === path(b)
}

function toList(v: unknown): unknown[] {
  return v === undefined ? [] : Array.from(v as Iterable<unknown>)
}

describe('TestUsdUIHints', () => {
  let stage: Stage

  beforeEach(async () => {
    stage = (await Stage.open(FIXTURE))!
    expect(stage).toBeTruthy()
  })

  //
  // Helpers
  //

  function _ValidateObjectHints(
    hints: ObjectHints, obj: UsdUIObject | undefined, displayName: string, hidden: boolean,
  ): void {
    // Make sure we either get the expected object back from `hints`, or
    // that they're both invalid.
    expect(samePath(hints.getObject(), obj)).toBe(true)

    expect(hints.getDisplayName()).toBe(displayName)
    expect(hints.getHidden()).toBe(hidden)
  }

  function _ValidatePrimHints(
    hints: PrimHints, prim: Prim | undefined,
    expandedDict: Record<string, boolean>, shownIfDict: Record<string, string>,
  ): void {
    expect(samePath(hints.getPrim(), prim)).toBe(true)

    // Group expansion state
    expect(hints.getDisplayGroupsExpanded()).toEqual(expandedDict)
    for (const [k, v] of Object.entries(expandedDict)) {
      expect(hints.getDisplayGroupExpanded(k)).toBe(v)
    }
    expect(hints.getDisplayGroupExpanded('non-existent')).toBe(false)

    // Group shownIf
    expect(hints.getDisplayGroupsShownIf()).toEqual(shownIfDict)
    for (const [k, v] of Object.entries(shownIfDict)) {
      expect(hints.getDisplayGroupShownIf(k)).toBe(v)
    }
    expect(hints.getDisplayGroupShownIf('non-existent')).toBe('')
  }

  function _ValidatePropertyHints(
    hints: PropertyHints, prop: UsdUIProperty | undefined, displayGroup: string, shownIf: string,
  ): void {
    // Make sure we either get the expected property back from `hints`, or
    // that they're both invalid.
    expect(samePath(hints.getProperty(), prop)).toBe(true)

    expect(hints.getDisplayGroup()).toBe(displayGroup)
    expect(hints.getShownIf()).toBe(shownIf)
  }

  function _ValidateAttributeHints(
    hints: AttributeHints, attr: Attribute | undefined,
    valueLabels: Record<string, unknown>, valueLabelsOrder: string[],
  ): void {
    expect(samePath(hints.getAttribute(), attr)).toBe(true)

    // Value labels
    expect(hints.getValueLabels()).toEqual(valueLabels)
    expect(hints.getValueLabelsOrder()).toEqual(valueLabelsOrder)
  }

  //
  // Test cases
  //

  it('test_Fallbacks', () => {
    // Verify that default-constructed and blank-object hints return the
    // fallbacks for each field

    // Prim
    const hintlessPrim = stage.getPrim('/HintlessPrim')
    expect(hintlessPrim).toBeTruthy()

    const _checkPrim = (hints: PrimHints, prim: Prim | undefined) => {
      _ValidatePrimHints(hints, prim, {}, {})
      _ValidateObjectHints(hints, prim, '', false)
    }

    // Check default-constructed and empty cases
    _checkPrim(new PrimHints(), undefined)
    _checkPrim(new PrimHints(hintlessPrim), hintlessPrim)

    // Attribute
    const hintlessAttr = stage.getAttributeAtPath('/HintlessPrim.hintlessAttribute')
    expect(hintlessAttr).toBeTruthy()

    const _checkAttr = (hints: AttributeHints, attr: Attribute | undefined) => {
      _ValidateAttributeHints(hints, attr, {}, [])
      _ValidatePropertyHints(hints, attr, '', '')
      _ValidateObjectHints(hints, attr, '', false)
    }

    // Check default-constructed and empty cases
    _checkAttr(new AttributeHints(), undefined)
    _checkAttr(new AttributeHints(hintlessAttr), hintlessAttr)
  })

  it('test_InvalidHints', () => {
    // Verify that "set" operations on invalid hint objects raise exceptions

    // Object
    const objectHints = new ObjectHints()
    expect(objectHints.isValid()).toBe(false)

    expect(() => objectHints.setDisplayName('name')).toThrow(TfError)
    expect(() => objectHints.setHidden(true)).toThrow(TfError)

    // Prim
    const primHints = new PrimHints()
    expect(primHints.isValid()).toBe(false)

    expect(() => primHints.setDisplayGroupsExpanded({ 'a group': true })).toThrow(TfError)
    expect(() => primHints.setDisplayGroupExpanded('a group', true)).toThrow(TfError)
    expect(() => primHints.setDisplayGroupsShownIf({ 'a group': 'x == 5' })).toThrow(TfError)
    expect(() => primHints.setDisplayGroupShownIf('a group', 'x == 5')).toThrow(TfError)

    // Property
    const propertyHints = new PropertyHints()
    expect(propertyHints.isValid()).toBe(false)

    expect(() => propertyHints.setDisplayGroup('group')).toThrow(TfError)
    expect(() => propertyHints.setShownIf('x == 5')).toThrow(TfError)

    // Attribute
    const attributeHints = new AttributeHints()
    expect(attributeHints.isValid()).toBe(false)

    expect(() => attributeHints.setValueLabels({ a: 1 })).toThrow(TfError)
    expect(() => attributeHints.setValueLabelsOrder(['a'])).toThrow(TfError)
    expect(() => attributeHints.applyValueLabel('a')).toThrow(TfError)
  })

  it('test_Errors', () => {
    // Verify that we get errors when passing invalid data

    const prim = stage.definePrim('/test_Errors')
    expect(prim.isValid()).toBe(true)
    const attr = prim.createAttribute('attr', 'int')
    expect(attr.isValid()).toBe(true)

    const primHints = new PrimHints(prim)
    new AttributeHints(attr)

    // Set non-bool value for DisplayGroupsExpanded
    expect(() => primHints.setDisplayGroupsExpanded({ group: 'expanded' })).toThrow(TfError)

    // Set non-string value for DisplayGroupsShownIf
    expect(() => primHints.setDisplayGroupsShownIf({ group: 5 })).toThrow(TfError)
  })

  it('test_PrimHintsFromAsset', () => {
    const prim = stage.getPrim('/HintsPrim')
    expect(prim).toBeTruthy()

    const hints = new PrimHints(prim)
    expect(hints.isValid()).toBe(true)

    _ValidatePrimHints(hints, prim,
      { 'a group': true, 'a group:a nested group': false },
      { 'a group': 'x == 1' })

    _ValidateObjectHints(hints, prim, 'a prim', true)
  })

  it('test_AttributeHintsFromAsset', () => {
    const attr = stage.getAttributeAtPath('/HintsPrim.attribute')
    expect(attr).toBeTruthy()

    const hints = new AttributeHints(attr)
    expect(hints.isValid()).toBe(true)

    _ValidateAttributeHints(hints, attr,
      { low: 1, med: 2, high: 3 },
      ['low', 'med', 'high'])

    _ValidatePropertyHints(hints, attr, 'a group', 'x == 2')

    _ValidateObjectHints(hints, attr, 'an attr', true)
  })

  it('test_RelationshipHintsFromAsset', () => {
    const rel = stage.getRelationshipAtPath('/HintsPrim.relationship')
    expect(rel).toBeTruthy()

    const hints = new PropertyHints(rel)
    expect(hints.isValid()).toBe(true)

    _ValidatePropertyHints(hints, rel, 'a group:a nested group', 'x == 3')

    _ValidateObjectHints(hints, rel, 'a rel', true)
  })

  it('test_ObjectHintsSetters', () => {
    const obj = stage.definePrim('/test_ObjectHintsSetters')
    expect(obj.isValid()).toBe(true)

    const hints = new ObjectHints(obj)
    expect(hints.isValid()).toBe(true)

    expect(hints.getDisplayName()).toBe('')
    expect(hints.setDisplayName('displayName')).toBe(true)
    expect(hints.getDisplayName()).toBe('displayName')

    expect(hints.getHidden()).toBe(false)
    expect(hints.setHidden(true)).toBe(true)
    expect(hints.getHidden()).toBe(true)
  })

  it('test_PrimHintsSetters', () => {
    const prim = stage.definePrim('/test_PrimHintsSetters')
    expect(prim.isValid()).toBe(true)

    const hints = new PrimHints(prim)
    expect(hints.isValid()).toBe(true)

    // Group expansion state
    expect(hints.getDisplayGroupsExpanded()).toEqual({})
    expect(hints.getDisplayGroupExpanded('group')).toBe(false)
    expect(hints.getDisplayGroupExpanded('group:subgroup')).toBe(false)
    expect(hints.getDisplayGroupExpanded('group2')).toBe(false)

    expect(hints.setDisplayGroupsExpanded({ group: true, 'group:subgroup': true })).toBe(true)

    expect(hints.getDisplayGroupsExpanded()).toEqual({ group: true, 'group:subgroup': true })
    expect(hints.getDisplayGroupExpanded('group')).toBe(true)
    expect(hints.getDisplayGroupExpanded('group:subgroup')).toBe(true)
    expect(hints.getDisplayGroupExpanded('group2')).toBe(false)

    expect(hints.setDisplayGroupExpanded('group2', true)).toBe(true)
    expect(hints.getDisplayGroupsExpanded())
      .toEqual({ group: true, 'group:subgroup': true, group2: true })
    expect(hints.getDisplayGroupExpanded('group2')).toBe(true)

    // Group shownIf
    expect(hints.getDisplayGroupsShownIf()).toEqual({})
    expect(hints.getDisplayGroupShownIf('group')).toBe('')
    expect(hints.getDisplayGroupShownIf('group2')).toBe('')

    expect(hints.setDisplayGroupsShownIf({ group: 'x == 1' })).toBe(true)

    expect(hints.getDisplayGroupsShownIf()).toEqual({ group: 'x == 1' })
    expect(hints.getDisplayGroupShownIf('group')).toBe('x == 1')
    expect(hints.getDisplayGroupShownIf('group2')).toBe('')

    expect(hints.setDisplayGroupShownIf('group2', 'x == 2')).toBe(true)
    expect(hints.getDisplayGroupsShownIf()).toEqual({ group: 'x == 1', group2: 'x == 2' })
    expect(hints.getDisplayGroupShownIf('group2')).toBe('x == 2')
  })

  it('test_AttributeHintsSetters', () => {
    const prim = stage.definePrim('/test_AttributeHintsSetters')
    expect(prim.isValid()).toBe(true)
    const attr = prim.createAttribute('newAttribute', 'int')
    expect(attr.isValid()).toBe(true)

    const hints = new AttributeHints(attr)
    expect(hints.isValid()).toBe(true)

    // Value labels
    expect(hints.getValueLabels()).toEqual({})
    expect(hints.setValueLabels({ round: 1, square: 2 })).toBe(true)
    expect(hints.getValueLabels()).toEqual({ round: 1, square: 2 })

    expect(hints.getValueLabelsOrder()).toEqual([])
    expect(hints.setValueLabelsOrder(['square', 'round'])).toBe(true)
    expect(hints.getValueLabelsOrder()).toEqual(['square', 'round'])
  })

  it('test_AuthorValueLabels', () => {
    const _validate = (attr: Attribute | undefined, initialValue: unknown) => {
      expect(attr).toBeTruthy()
      const hints = new AttributeHints(attr)
      expect(hints.isValid()).toBe(true)

      const norm = (v: unknown) => (typeof v === 'object' && v !== null ? toList(v) : v)

      // Run through all value labels
      expect(norm(hints.getAttribute()!.getValue())).toEqual(initialValue)
      for (const [label, value] of Object.entries(hints.getValueLabels())) {
        expect(hints.applyValueLabel(label)).toBe(true)
        expect(norm(hints.getAttribute()!.getValue())).toEqual(norm(value))
      }

      // Apply a non-existent label, which should be a no-op
      const curVal = norm(attr!.getValue())
      expect(hints.applyValueLabel('non-existent')).toBe(false)
      expect(norm(attr!.getValue())).toEqual(curVal)
    }

    _validate(stage.getAttributeAtPath('/HintsPrim.attribute'), 1)
    _validate(stage.getAttributeAtPath('/HintsPrim.tokenArrayAttr'), [])
  })

  // @unittest.skipIf(not Tf.GetEnvSetting('USDUI_WRITE_LEGACY_UI_HINTS'))
  it.runIf(TfGetEnvSetting(USDUI_WRITE_LEGACY_UI_HINTS))('test_LegacyHintWrites', () => {
    const prim = stage.definePrim('/test_LegacyHintWrites')
    expect(prim.isValid()).toBe(true)
    const attr = prim.createAttribute('attr', 'int')
    expect(attr.isValid()).toBe(true)
    const hints = new PropertyHints(attr)
    expect(hints.isValid()).toBe(true)

    const getDisplayName = () => (attr.getMetadata('displayName') as string | undefined) ?? ''
    const getDisplayGroup = () => (attr.getMetadata('displayGroup') as string | undefined) ?? ''
    const isHidden = () => attr.getMetadata('hidden') === true

    // Verify initial conditions
    expect(getDisplayName()).toBe('')
    expect(getDisplayGroup()).toBe('')
    expect(isHidden()).toBe(false)

    // Set with the hints API
    expect(hints.setDisplayName('display name')).toBe(true)
    expect(hints.setDisplayGroup('display group')).toBe(true)
    expect(hints.setHidden(true)).toBe(true)

    // Legacy core fields should also have been written
    expect(getDisplayName()).toBe('display name')
    expect(getDisplayGroup()).toBe('display group')
    expect(isHidden()).toBe(true)
  })
})
