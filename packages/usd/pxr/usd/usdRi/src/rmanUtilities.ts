// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/rmanUtilities.cpp,
//  pxr/usd/usdRi/rmanUtilities.h, pxr/usd/usdGeom/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdRi/rmanUtilities.{h,cpp}: utilities for
// converting between USD encodings and RenderMan encodings in cases where
// there is a difference. Token values are the UsdGeomTokens of
// pxr/usd/usdGeom/tokens.h.
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType, TfStringEndsWith, TfStringTokenize } from 'typescript-usd/tf'
import { ListOp } from 'typescript-usd/sdf'

function codingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

// rmanUtilities.cpp:16-30.
export function convertToRManInterpolateBoundary(token: string): number {
  if (token === 'none') return 0
  else if (token === 'edgeAndCorner') return 1
  else if (token === 'edgeOnly') return 2
  else {
    codingError(`Invalid InterpolateBoundary Token: ${token}`)
    return 0
  }
}

// rmanUtilities.cpp:32-46.
export function convertFromRManInterpolateBoundary(i: number): string {
  switch (i) {
    case 0: return 'none'
    case 1: return 'edgeAndCorner'
    case 2: return 'edgeOnly'
    default:
      codingError(`Invalid InterpolateBoundary int: ${i}`)
      return 'none'
  }
}

// rmanUtilities.cpp:48-71.
export function convertToRManFaceVaryingLinearInterpolation(token: string): number {
  if (token === 'all') {
    return 0
  } else if (token === 'cornersOnly' || token === 'cornersPlus1' || token === 'cornersPlus2') {
    return 1
  } else if (token === 'none') {
    return 2
  } else if (token === 'boundaries') {
    return 3
  } else {
    codingError(`Invalid FaceVaryingLinearInterpolation Token: ${token}`)
    return 1
  }
}

// rmanUtilities.cpp:73-89.
export function convertFromRManFaceVaryingLinearInterpolation(i: number): string {
  switch (i) {
    case 0: return 'all'
    case 1: return 'cornersPlus1'
    case 2: return 'none'
    case 3: return 'boundaries'
    default:
      codingError(`Invalid FaceVaryingLinearInterpolation int: ${i}`)
      return 'none'
  }
}

// rmanUtilities.cpp:91-105.
export function convertToRManTriangleSubdivisionRule(token: string): number {
  // XXX A value of 2 is needed in order for the smoothing algorithm to work.
  if (token === 'catmullClark') {
    return 0
  } else if (token === 'smooth') return 2
  else {
    codingError(`Invalid TriangleSubdivisionRule Token: ${token}`)
    return 0
  }
}

// rmanUtilities.cpp:107-120.
export function convertFromRManTriangleSubdivisionRule(i: number): string {
  // XXX A value of 2 is needed in order for the smoothing algorithm to work.
  switch (i) {
    case 0: return 'catmullClark'
    case 2: return 'smooth'
    default:
      codingError(`Invalid TriangleSubdivisionRule int: ${i}`)
      return 'catmullClark'
  }
}

// rmanUtilities.cpp:122-141: convert a RenderMan set specification
// ("+A B", "-A,B", "A B C") to an SdfStringListOp.
export function convertRManSetSpecificationToListOp(repr: string): ListOp<string> {
  const delimeters = ' \t\n,'
  const result = new ListOp<string>()
  if (repr.length > 0) {
    let elements: string[]
    if (repr[0] === '+') {
      elements = TfStringTokenize(repr.slice(1), delimeters)
      result.setAppendedItems(elements)
    } else if (repr[0] === '-') {
      elements = TfStringTokenize(repr.slice(1), delimeters)
      result.setDeletedItems(elements)
    } else {
      elements = TfStringTokenize(repr, delimeters)
      result.setExplicitItems(elements)
    }
  }
  return result
}

// rmanUtilities.cpp:143-153: whether the given attribute takes a RenderMan
// set specification.
export function doesAttributeUseSetSpecification(attrName: string): boolean {
  // Use endswidth to be robust with regard to various namespacing,
  // e.g. primvars:ri:attributes, ri:attributes, or none at all.
  return TfStringEndsWith(attrName, 'grouping:membership')
    || TfStringEndsWith(attrName, 'lighting:excludesubset')
    || TfStringEndsWith(attrName, 'lighting:subset')
    || TfStringEndsWith(attrName, 'lightfilter:subset')
    || TfStringEndsWith(attrName, 'identifier:lpegroup')
}
