// Ported from OpenUSD 26.11.1: pxr/imaging/pxOsd/refinerFactory.cpp,
//  pxr/imaging/pxOsd/refinerFactory.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/pxOsd/refinerFactory.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - PxOsdTopologyRefinerSharedPtr (a std::shared_ptr<Far::TopologyRefiner>)
//   is a TopologyRefiner reference or null.
// - The OpenSubdiv template specialization
//   TopologyRefinerFactory<Converter> (refinerFactory.cpp:182-420) is a
//   TopologyRefinerFactorySpecialization<Converter> object, the form the
//   ported Far factory takes for specializations
//   (packages/opensubdiv/src/far/topologyRefinerFactory.ts).
// - The two Create overloads are one function with an optional
//   fvarTopologies argument; a string third argument is the name.

import { Token as TfToken, TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import {
  SchemeType,
  Options,
  VtxBoundaryInterpolation,
  FVarLinearInterpolation,
  CreasingMethod,
  TriangleSubdivision,
} from '@opensubdiv/core/sdc'
import {
  CreateTopologyRefiner,
  TopologyRefinerFactoryAccess as Access,
  TopologyRefinerFactoryOptions,
  INDEX_INVALID,
  type TopologyRefiner,
  type TopologyRefinerFactorySpecialization,
  type TopologyError,
} from '@opensubdiv/core/far'
import type { PxOsdMeshTopology } from './meshTopology.ts'
import { PxOsdOpenSubdivTokens } from './tokens.ts'

/** TF_WARN (pxr/base/tf/diagnostic.h:377-381) */
function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

/** TF_VERIFY (pxr/base/tf/diagnostic.h:399-405) */
function TF_VERIFY(cond: boolean): boolean {
  if (!cond) {
    TfDiagnosticMgr.GetInstance().postError(
      new TfError('Failed verification', TfDiagnosticType.CodingError))
  }
  return cond
}

/** refinerFactory.h:22-23 */
export type PxOsdTopologyRefinerSharedPtr = TopologyRefiner | null

/** refinerFactory.cpp:22-35 */
class Converter {
  constructor(
    readonly topology: PxOsdMeshTopology,
    readonly fvarTopologies: readonly (readonly number[])[],
    readonly name: TfToken,
  ) {}

  /** refinerFactory.cpp:37-66 */
  getType(): SchemeType {
    const scheme = this.topology.getScheme()

    let type = SchemeType.CATMARK
    if (scheme === PxOsdOpenSubdivTokens.catmullClark) {
      type = SchemeType.CATMARK
    } else if (scheme === PxOsdOpenSubdivTokens.loop) {
      type = SchemeType.LOOP
      // in loop case, all input faces have to be triangle.
      const numVerts = this.topology.getFaceVertexCounts()
      if (numVerts.every((x) => x === 3)) {
        // all triangles
      } else {
        TF_WARN(`Can't apply loop subdivision on prim ${this.name}, since ` +
                'it has non-triangle face(s).')
      }
    } else if (scheme === PxOsdOpenSubdivTokens.bilinear) {
      type = SchemeType.BILINEAR
    } else {
      TF_WARN(`Unsupported scheme (${scheme}) (${this.name})`)
    }
    return type
  }

  /** refinerFactory.cpp:68-178 */
  getOptions(): Options {
    const options = new Options()

    //
    // vertex boundary interpolation rule
    //

    // XXX: there is a bug in OpenSubdiv 3.0.0, which drops
    // boundary faces of bilinear scheme mesh when
    // boundaryInterpolationMode=None. To workaround the bug
    // override boundary interpolation mode to be edgeAndCorner.
    const scheme = this.topology.getScheme()
    const interpolateBoundary =
      scheme === PxOsdOpenSubdivTokens.bilinear
        ? PxOsdOpenSubdivTokens.edgeAndCorner
        : this.topology.getSubdivTags().getVertexInterpolationRule()

    if (interpolateBoundary) {
      if (interpolateBoundary === PxOsdOpenSubdivTokens.none) {
        options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.NONE)
      } else if (interpolateBoundary === PxOsdOpenSubdivTokens.edgeOnly) {
        options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_ONLY)
      } else if (interpolateBoundary === PxOsdOpenSubdivTokens.edgeAndCorner) {
        options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
      } else {
        TF_WARN(`Unknown vertex boundary interpolation rule (${interpolateBoundary}) (${this.name})`)
      }
    } else {
      // XXX legacy assets expect a default of "edge & corner" if no
      //     tag has been defined. this should default to Osd defaults
      //     instead
      options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
    }

    //
    // face-varying boundary interpolation rule
    //

    const faceVaryingLinearInterpolation =
      this.topology.getSubdivTags().getFaceVaryingInterpolationRule()

    if (faceVaryingLinearInterpolation) {
      if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.all) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.ALL)
      } else if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.cornersOnly) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.CORNERS_ONLY)
      } else if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.cornersPlus1) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.CORNERS_PLUS1)
      } else if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.cornersPlus2) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.CORNERS_PLUS2)
      } else if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.none) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.NONE)
      } else if (faceVaryingLinearInterpolation === PxOsdOpenSubdivTokens.boundaries) {
        options.setFVarLinearInterpolation(FVarLinearInterpolation.BOUNDARIES)
      } else {
        TF_WARN('Unknown face-varying boundary interpolation rule ' +
                `(${faceVaryingLinearInterpolation}) (${this.name})`)
      }
    } else {
      // XXX legacy assets expect a default of "edge & corner" if no
      //     tag has been defined. this should default to Osd defaults
      //     instead
      options.setFVarLinearInterpolation(FVarLinearInterpolation.NONE)
    }

    //
    // creasing method
    //

    const creaseMethod = this.topology.getSubdivTags().getCreaseMethod()

    if (creaseMethod) {
      if (creaseMethod === PxOsdOpenSubdivTokens.uniform) {
        options.setCreasingMethod(CreasingMethod.UNIFORM)
      } else if (creaseMethod === PxOsdOpenSubdivTokens.chaikin) {
        options.setCreasingMethod(CreasingMethod.CHAIKIN)
      } else {
        TF_WARN(`Unknown creasing method (${creaseMethod}) (${this.name})`)
      }
    }

    //
    // triangle subdivision
    //

    const triangleSubdivision = this.topology.getSubdivTags().getTriangleSubdivision()

    if (triangleSubdivision) {
      if (triangleSubdivision === PxOsdOpenSubdivTokens.catmullClark) {
        options.setTriangleSubdivision(TriangleSubdivision.CATMARK)
      } else if (triangleSubdivision === PxOsdOpenSubdivTokens.smooth) {
        options.setTriangleSubdivision(TriangleSubdivision.SMOOTH)
      } else {
        TF_WARN(`Unknown triangle subdivision rule (${triangleSubdivision}) (${this.name})`)
      }
    }

    return options
  }
}

// OpenSubdiv 3.x API requires that the client code provides
// template specialization for topology annotations.
const _converterSpecialization: TopologyRefinerFactorySpecialization<Converter> = {
  /** refinerFactory.cpp:182-209 */
  resizeComponentTopology(refiner, converter) {
    const topology = converter.topology

    const numFaces = topology.getFaceVertexCounts().length
    let maxVertIndex = 0

    const vertCounts = topology.getFaceVertexCounts()
    const vertIndices = topology.getFaceVertexIndices()
    let vertIndicesOffset = 0

    Access.setNumBaseFaces(refiner, numFaces)

    for (let face = 0; face < numFaces; ++face) {
      const nverts = vertCounts[face]!
      Access.setNumBaseFaceVertices(refiner, face, nverts)

      for (let vert = 0; vert < nverts; ++vert) {
        maxVertIndex = Math.max(maxVertIndex, vertIndices[vertIndicesOffset + vert]!)
      }
      vertIndicesOffset += nverts
    }
    Access.setNumBaseVertices(refiner, maxVertIndex + 1)

    return true
  },

  /** refinerFactory.cpp:211-239 */
  assignComponentTopology(refiner, converter) {
    const topology = converter.topology
    const vertIndices = topology.getFaceVertexIndices()
    const flip = (topology.getOrientation() !== PxOsdOpenSubdivTokens.rightHanded)

    for (let face = 0, idx = 0; face < refiner.GetLevel(0).getNumFaces(); ++face) {
      const dstFaceVerts = Access.getBaseFaceVertices(refiner, face)

      if (flip) {
        dstFaceVerts[0] = vertIndices[idx++]!
        for (let vert = dstFaceVerts.length - 1; vert > 0; --vert) {
          dstFaceVerts[vert] = vertIndices[idx++]!
        }
      } else {
        for (let vert = 0; vert < dstFaceVerts.length; ++vert) {
          dstFaceVerts[vert] = vertIndices[idx++]!
        }
      }
    }

    return true
  },

  /** refinerFactory.cpp:243-360 */
  assignComponentTags(refiner, converter) {
    const topology = converter.topology

    const tags = topology.getSubdivTags()

    //
    // creases
    //

    // The sharpnesses can be defined either per-crease or per-edge.
    const creaseIndices = tags.getCreaseIndices()
    const creaseLengths = tags.getCreaseLengths()
    const creaseWeights = tags.getCreaseWeights()

    let numCreaseSets = creaseLengths.length
    const perEdgeCrease = creaseWeights.length !== numCreaseSets

    if (perEdgeCrease) {
      // validate per-edge crease.
      let numEdges = 0
      for (let i = 0; i < numCreaseSets; ++i) {
        numEdges += creaseLengths[i]! - 1
      }
      if (creaseWeights.length !== numEdges) {
        TF_WARN(`Invalid length of crease sharpnesses (${converter.name})\n`)
        numCreaseSets = 0
      }
    }
    for (let i = 0, cindex = 0, sindex = 0; i < numCreaseSets; ++i) {
      const numSegments = Math.max(creaseLengths[i]! - 1, 0)

      const level = refiner.GetLevel(0)
      for (let j = 0; j < numSegments; ++j) {
        const v0 = creaseIndices[cindex + j]!
        const v1 = creaseIndices[cindex + j + 1]!

        // FindEdge is not bounds checking, and crease data could
        // be referencing outside the bounds.
        // The asset may need fixing if any of the warnings fire off.
        let validIndices = true
        if (v0 < 0 || v0 >= level.getNumVertices()) {
          TF_WARN(`creaseIndices[${cindex + j}] (${v0}) is out of bounds on ${converter.name}`)
          validIndices = false
        }
        if (v1 < 0 || v1 >= level.getNumVertices()) {
          TF_WARN(`creaseIndices[${cindex + j + 1}] (${v1}) is out of bounds on ${converter.name}`)
          validIndices = false
        }

        if (validIndices) {
          const edge = Access.findBaseEdge(refiner, v0, v1)
          if (edge === INDEX_INVALID) {
            TF_WARN(`Set edge sharpness cannot find edge (${v0}-${v1}) (${converter.name})`)
          } else {
            Access.setBaseEdgeSharpness(refiner,
              edge, Math.max(0.0, Math.fround(creaseWeights[sindex]!)))
          }
        }

        if (perEdgeCrease) {
          ++sindex
        }
      }
      if (!perEdgeCrease) {
        ++sindex
      }
      cindex += creaseLengths[i]!
    }

    //
    // corners
    //

    const cornerIndices = tags.getCornerIndices()
    const cornerWeights = tags.getCornerWeights()

    let numCorners = cornerIndices.length

    if (cornerWeights.length !== numCorners) {
      TF_WARN(`Invalid length of corner sharpnesses at prim ${converter.name}\n`)
      numCorners = 0
    }
    for (let i = 0; i < numCorners; ++i) {
      const vert = cornerIndices[i]!
      if (vert >= 0 && vert < refiner.GetLevel(0).getNumVertices()) {
        Access.setBaseVertexSharpness(refiner,
          vert, Math.max(0.0, Math.fround(cornerWeights[i]!)))
      } else {
        TF_WARN(`Set vertex sharpness cannot find vertex (${vert}) (${converter.name})`)
      }
    }

    //
    // holes
    //

    const holeIndices = topology.getHoleIndices()

    const numHoles = holeIndices.length

    for (let i = 0; i < numHoles; ++i) {
      const face = holeIndices[i]!
      if (face >= 0 && face < refiner.GetLevel(0).getNumFaces()) {
        Access.setBaseFaceHole(refiner, face, true)
      } else {
        TF_WARN(`Set hole cannot find face (${face}) (${converter.name})`)
      }
    }

    return true
  },

  /** refinerFactory.cpp:364-409 */
  assignFaceVaryingTopology(refiner, converter) {
    if (converter.fvarTopologies.length === 0) return true

    for (let i = 0; i < converter.fvarTopologies.length; ++i) {
      const fvIndices = converter.fvarTopologies[i]!

      // find fvardata size
      let maxIndex = -1
      for (let j = 0; j < fvIndices.length; ++j) {
        maxIndex = Math.max(maxIndex, fvIndices[j]!)
      }

      const nfaces = Access.getNumBaseFaces(refiner)
      const channel = Access.createBaseFVarChannel(refiner, maxIndex + 1)

      const flip = (converter.topology.getOrientation() !==
                    PxOsdOpenSubdivTokens.rightHanded)

      for (let j = 0, ofs = 0; j < nfaces; ++j) {
        const faceIndices = Access.getBaseFaceFVarValues(refiner, j, channel)
        const numVerts = faceIndices.length

        if (!TF_VERIFY(ofs + numVerts <= fvIndices.length)) {
          return false
        }

        if (flip) {
          faceIndices[0] = fvIndices[ofs++]!
          for (let k = numVerts - 1; k > 0; --k) {
            faceIndices[k] = fvIndices[ofs++]!
          }
        } else {
          for (let k = 0; k < numVerts; ++k) {
            faceIndices[k] = fvIndices[ofs++]!
          }
        }
      }
    }

    return true
  },

  /** refinerFactory.cpp:412-418 */
  reportInvalidTopology(_errCode: TopologyError, msg: string, converter: Converter): void {
    TF_WARN(`${msg} (${converter.name})`)
  },
}

/** refinerFactory.h:25-45 */
export const PxOsdRefinerFactory = {
  /** refinerFactory.cpp:430-458. Returns an OpenSubdiv TopologyRefiner
   *  (with faceVarying topology when fvarTopologies are given). */
  create(
    topology: PxOsdMeshTopology,
    fvarTopologiesOrName?: readonly (readonly number[])[] | TfToken,
    name: TfToken = TfToken(''),
  ): PxOsdTopologyRefinerSharedPtr {
    let fvarTopologies: readonly (readonly number[])[] = []
    if (typeof fvarTopologiesOrName === 'string') {
      name = fvarTopologiesOrName
    } else if (fvarTopologiesOrName !== undefined) {
      fvarTopologies = fvarTopologiesOrName
    }

    const converter = new Converter(topology, fvarTopologies, name)

    const options = new TopologyRefinerFactoryOptions(
      converter.getType(), converter.getOptions())

    return CreateTopologyRefiner(_converterSpecialization, converter, options)
  },
}
