// Ported from OpenUSD 26.11.1: pxr/imaging/pxOsd/meshTopologyValidation.cpp,
//  pxr/imaging/pxOsd/meshTopologyValidation.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/pxOsd/meshTopologyValidation.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - `explicit operator bool` is IsValid(); iteration over invalidations is
//   [Symbol.iterator] / GetInvalidations().
// - The TfEnum name registration (meshTopologyValidation.cpp:20-55) is
//   PxOsdMeshTopologyValidationCodeGetName (TfEnum::GetName). Upstream
//   registers no name for InvalidHoleIndicesElement, so its name is ''.

import type { PxOsdMeshTopology } from './meshTopology.ts'
import { PxOsdOpenSubdivTokens } from './tokens.ts'

/** meshTopologyValidation.h:46-65 Code */
export enum PxOsdMeshTopologyValidationCode {
  InvalidScheme = 'InvalidScheme',
  InvalidOrientation = 'InvalidOrientation',
  InvalidTriangleSubdivision = 'InvalidTriangleSubdivision',
  InvalidVertexInterpolationRule = 'InvalidVertexInterpolationRule',
  InvalidFaceVaryingInterpolationRule = 'InvalidFaceVaryingInterpolationRule',
  InvalidCreaseMethod = 'InvalidCreaseMethod',
  InvalidCreaseLengthElement = 'InvalidCreaseLengthElement',
  InvalidCreaseIndicesSize = 'InvalidCreaseIndicesSize',
  InvalidCreaseIndicesElement = 'InvalidCreaseIndicesElement',
  InvalidCreaseWeightsSize = 'InvalidCreaseWeightsSize',
  NegativeCreaseWeights = 'NegativeCreaseWeights',
  InvalidCornerIndicesElement = 'InvalidCornerIndicesElement',
  NegativeCornerWeights = 'NegativeCornerWeights',
  InvalidCornerWeightsSize = 'InvalidCornerWeightsSize',
  InvalidHoleIndicesElement = 'InvalidHoleIndicesElement',
  InvalidFaceVertexCountsElement = 'InvalidFaceVertexCountsElement',
  InvalidFaceVertexIndicesElement = 'InvalidFaceVertexIndicesElement',
  InvalidFaceVertexIndicesSize = 'InvalidFaceVertexIndicesSize',
}

// meshTopologyValidation.cpp:20-55 TF_ADD_ENUM_NAME registrations
// (InvalidHoleIndicesElement is not registered upstream).
const _registeredCodeNames = new Set<PxOsdMeshTopologyValidationCode>(
  Object.values(PxOsdMeshTopologyValidationCode).filter(
    code => code !== PxOsdMeshTopologyValidationCode.InvalidHoleIndicesElement))

/** TfEnum::GetName for a validation code: '' when not registered. */
export function PxOsdMeshTopologyValidationCodeGetName(code: PxOsdMeshTopologyValidationCode): string {
  return _registeredCodeNames.has(code) ? code : ''
}

/** meshTopologyValidation.h:68-71 */
export interface PxOsdMeshTopologyValidationInvalidation {
  code: PxOsdMeshTopologyValidationCode
  message: string
}

/** meshTopologyValidation.h:40-205 */
export class PxOsdMeshTopologyValidation {
  static readonly Code = PxOsdMeshTopologyValidationCode

  private _invalidations: PxOsdMeshTopologyValidationInvalidation[] | null = null

  /** The default constructor (valid), or the topology-validating constructor
   * that upstream keeps private to PxOsdMeshTopology
   * (meshTopologyValidation.cpp:57-71). */
  constructor(topology?: PxOsdMeshTopology) {
    if (topology === undefined) return
    this._validateScheme(topology)
    this._validateOrientation(topology)
    this._validateTriangleSubdivision(topology)
    this._validateVertexInterpolation(topology)
    this._validateFaceVaryingInterpolation(topology)
    this._validateCreaseMethod(topology)
    this._validateCreasesAndCorners(topology)
    this._validateHoles(topology)
    this._validateFaceVertexCounts(topology)
    this._validateFaceVertexIndices(topology)
  }

  /** meshTopologyValidation.h:164-166 explicit operator bool */
  isValid(): boolean {
    return this._invalidations === null || this._invalidations.length === 0
  }

  getInvalidations(): readonly PxOsdMeshTopologyValidationInvalidation[] {
    return this._invalidations ?? []
  }

  [Symbol.iterator](): Iterator<PxOsdMeshTopologyValidationInvalidation> {
    return this.getInvalidations()[Symbol.iterator]()
  }

  private _appendInvalidation(invalidation: PxOsdMeshTopologyValidationInvalidation): void {
    if (!this._invalidations) this._invalidations = []
    this._invalidations.push(invalidation)
  }

  /** meshTopologyValidation.cpp:73-88 */
  private _validateToken(code: PxOsdMeshTopologyValidationCode, name: string,
    token: string, validTokens: readonly string[]): void {
    if (!validTokens.some(validToken => token === validToken)) {
      this._appendInvalidation({ code, message: `'${token}' is not a valid '${name}' token.` })
    }
  }

  /** meshTopologyValidation.cpp:90-99 */
  private _validateScheme(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidScheme, 'scheme',
      topology.getScheme(), [PxOsdOpenSubdivTokens.catmullClark,
        PxOsdOpenSubdivTokens.loop, PxOsdOpenSubdivTokens.bilinear])
  }

  /** meshTopologyValidation.cpp:101-110 */
  private _validateOrientation(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidOrientation, 'orientation',
      topology.getOrientation(), [PxOsdOpenSubdivTokens.rightHanded,
        PxOsdOpenSubdivTokens.leftHanded])
  }

  /** meshTopologyValidation.cpp:112-123 */
  private _validateTriangleSubdivision(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidTriangleSubdivision,
      'triangle subdivision', topology.getSubdivTags().getTriangleSubdivision(),
      [PxOsdOpenSubdivTokens.catmullClark, PxOsdOpenSubdivTokens.smooth, ''])
  }

  /** meshTopologyValidation.cpp:125-137 */
  private _validateVertexInterpolation(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidVertexInterpolationRule,
      'vertex interpolation rule', topology.getSubdivTags().getVertexInterpolationRule(),
      [PxOsdOpenSubdivTokens.none, PxOsdOpenSubdivTokens.edgeAndCorner,
        PxOsdOpenSubdivTokens.edgeOnly, ''])
  }

  /** meshTopologyValidation.cpp:139-153 */
  private _validateFaceVaryingInterpolation(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidFaceVaryingInterpolationRule,
      'face varying interpolation rule',
      topology.getSubdivTags().getFaceVaryingInterpolationRule(),
      [PxOsdOpenSubdivTokens.none, PxOsdOpenSubdivTokens.all,
        PxOsdOpenSubdivTokens.boundaries, PxOsdOpenSubdivTokens.cornersOnly,
        PxOsdOpenSubdivTokens.cornersPlus1, PxOsdOpenSubdivTokens.cornersPlus2, ''])
  }

  /** meshTopologyValidation.cpp:155-166 */
  private _validateCreaseMethod(topology: PxOsdMeshTopology): void {
    this._validateToken(PxOsdMeshTopologyValidationCode.InvalidCreaseMethod,
      'crease method', topology.getSubdivTags().getCreaseMethod(),
      [PxOsdOpenSubdivTokens.uniform, PxOsdOpenSubdivTokens.chaikin, ''])
  }

  /** meshTopologyValidation.cpp:168-255 */
  private _validateCreasesAndCorners(topology: PxOsdMeshTopology): void {
    const tags = topology.getSubdivTags()
    const creaseIndices = tags.getCreaseIndices()
    const creaseLengths = tags.getCreaseLengths()
    const creaseSharpness = tags.getCreaseWeights()
    const cornerIndices = tags.getCornerIndices()
    const cornerSharpness = tags.getCornerWeights()
    const Code = PxOsdMeshTopologyValidationCode

    if (creaseLengths.some(creaseLength => creaseLength < 2)) {
      this._appendInvalidation({ code: Code.InvalidCreaseLengthElement,
        message: 'Crease lengths must be greater than or equal to 2.' })
    }
    const totalCreaseIndices = creaseLengths.reduce((a, b) => a + b, 0)
    const totalCreases = creaseLengths.length
    const totalCreaseEdges = totalCreaseIndices - totalCreases
    if (creaseIndices.length !== totalCreaseIndices) {
      this._appendInvalidation({ code: Code.InvalidCreaseIndicesSize,
        message: `Crease indices size '${creaseIndices.length}' doesn't match expected '${totalCreaseIndices}'.` })
    }
    if (creaseSharpness.length !== totalCreaseEdges && creaseSharpness.length !== totalCreases) {
      this._appendInvalidation({ code: Code.InvalidCreaseWeightsSize,
        message: `Crease weights size '${creaseSharpness.length}' doesn't match either per edge `
          + `'${totalCreaseEdges}' or per crease '${totalCreases}' sizes.` })
    }
    if (cornerIndices.length !== cornerSharpness.length) {
      this._appendInvalidation({ code: Code.InvalidCornerWeightsSize,
        message: `Corner weights size '${cornerIndices.length}' doesn't match expected '${cornerSharpness.length}'.` })
    }
    if (creaseSharpness.some(weight => weight < 0)) {
      this._appendInvalidation({ code: Code.NegativeCreaseWeights, message: 'Negative crease weights.' })
    }
    if (cornerSharpness.some(weight => weight < 0)) {
      this._appendInvalidation({ code: Code.NegativeCornerWeights, message: 'Negative corner weights.' })
    }
    // meshTopologyValidation.cpp:226-254 binary-searches the sorted face
    // vertex indices; set membership is equivalent.
    const faceIndices = new Set(topology.getFaceVertexIndices())
    if (cornerIndices.some(index => !faceIndices.has(index))) {
      this._appendInvalidation({ code: Code.InvalidCornerIndicesElement,
        message: 'Corner index element missing from face vertex indices array.' })
    }
    if (creaseIndices.some(index => !faceIndices.has(index))) {
      this._appendInvalidation({ code: Code.InvalidCreaseIndicesElement,
        message: 'Crease index element missing from face vertex indices array.' })
    }
  }

  /** meshTopologyValidation.cpp:257-275 */
  private _validateHoles(topology: PxOsdMeshTopology): void {
    const holeIndices = topology.getHoleIndices()
    if (holeIndices.length === 0) return
    let min = holeIndices[0]!, max = holeIndices[0]!
    for (const h of holeIndices) { if (h < min) min = h; if (h > max) max = h }
    if (min < 0) {
      this._appendInvalidation({ code: PxOsdMeshTopologyValidationCode.InvalidHoleIndicesElement,
        message: 'Hole indices cannot be negative.' })
    }
    if (max >= topology.getFaceVertexCounts().length) {
      this._appendInvalidation({ code: PxOsdMeshTopologyValidationCode.InvalidHoleIndicesElement,
        message: `Hole indices must be less than face count '${topology.getFaceVertexCounts().length}'.` })
    }
  }

  /** meshTopologyValidation.cpp:277-287 */
  private _validateFaceVertexCounts(topology: PxOsdMeshTopology): void {
    if (topology.getFaceVertexCounts().some(faceVertexCount => faceVertexCount <= 2)) {
      this._appendInvalidation({ code: PxOsdMeshTopologyValidationCode.InvalidFaceVertexCountsElement,
        message: 'Face vertex counts must be greater than 2.' })
    }
  }

  /** meshTopologyValidation.cpp:289-308 */
  private _validateFaceVertexIndices(topology: PxOsdMeshTopology): void {
    if (topology.getFaceVertexIndices().some(i => i < 0)) {
      this._appendInvalidation({ code: PxOsdMeshTopologyValidationCode.InvalidFaceVertexIndicesElement,
        message: 'Face vertex indices element must be greater than 0.' })
    }
    const vertexCount = topology.getFaceVertexCounts().reduce((a, b) => a + b, 0)
    if (topology.getFaceVertexIndices().length !== vertexCount) {
      this._appendInvalidation({ code: PxOsdMeshTopologyValidationCode.InvalidFaceVertexIndicesSize,
        message: `Face vertex indices size '${topology.getFaceVertexIndices().length}' does not match `
          + `expected size '${vertexCount}'.` })
    }
  }
}
