// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/testenv/testUsdRiUtilities.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdRi/testenv/testUsdRiUtilities.py
// (registered as testUsdRiUtilities). Sdf.StringListOp values are
// SdfListOp<string>; Python == on list ops is ListOp.equals.
import { describe, expect, it } from 'vitest'
import { ListOp } from 'typescript-usd/sdf'
import {
  convertToRManFaceVaryingLinearInterpolation,
  convertFromRManFaceVaryingLinearInterpolation,
  convertRManSetSpecificationToListOp,
  doesAttributeUseSetSpecification,
} from 'typescript-usd/usdRi'

describe('TestUsdRiUtilities', () => {
  it('test_RmanConversions', () => {
    // Note that we have the old names as the first elements in the list, our
    // conversion test relies on this fact. This is only really relevant in
    // the case of Rman's '1' value, in which we have some ambiguity(it could
    // be cornersPlus1, cornersPlus2, or cornersOnly) since we don't currently
    // express the propogateCorners argument through the system.
    const faceVaryingConversionTable: [string[], number][] = [
      [['all'], 0],
      [['cornersPlus1', 'cornersPlus2', 'cornersOnly'], 1],
      [['none'], 2],
      [['boundaries'], 3]]

    for (const [tokens, rmanValue] of faceVaryingConversionTable) {
      // Check all tokens, old and new
      for (const token of tokens) {
        // Convert to renderman values
        expect(convertToRManFaceVaryingLinearInterpolation(token), token).toBe(rmanValue)
      }

      // Convert from renderman values
      // Note that we only map to the new tokens.
      expect(convertFromRManFaceVaryingLinearInterpolation(rmanValue)).toBe(tokens[0])
    }

    // Test grouping membership conversion.
    const membershipExamples: [string, ListOp<string>][] = [
      ['', new ListOp<string>()],
      ['A B C', ListOp.createExplicit(['A', 'B', 'C'])],
      ['A,B,C', ListOp.createExplicit(['A', 'B', 'C'])],
      ['+Sclera', ListOp.create<string>([], ['Sclera'])],
      ['-Sclera', ListOp.create<string>([], [], ['Sclera'])],
      ['+A B', ListOp.create<string>([], ['A', 'B'])],
      ['+A,B', ListOp.create<string>([], ['A', 'B'])],
      ['-A B', ListOp.create<string>([], [], ['A', 'B'])],
      ['-A,B', ListOp.create<string>([], [], ['A', 'B'])],
    ]
    for (const [membership, listOp] of membershipExamples) {
      const converted = convertRManSetSpecificationToListOp(membership)
      expect(converted.equals(listOp), `${membership} -> ${converted.toString()}`).toBe(true)
    }

    const setSpecAttrNames = [
      'grouping:membership',
      'lighting:excludesubset',
      'lighting:subset',
      'lightfilter:subset',
    ]
    const nonSetSpecAttrNames = [
      'visibility:camera',
      'lighting:otherthing',
    ]
    for (const attrName of setSpecAttrNames) {
      expect(doesAttributeUseSetSpecification(attrName), attrName).toBe(true)
    }
    for (const attrName of nonSetSpecAttrNames) {
      expect(doesAttributeUseSetSpecification(attrName), attrName).toBe(false)
    }
  })
})
