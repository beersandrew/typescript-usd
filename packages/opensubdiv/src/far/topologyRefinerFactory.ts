// Ported from OpenSubdiv 3.7.0: opensubdiv/far/topologyRefinerFactory.h,
//  opensubdiv/far/topologyRefinerFactory.cpp,
//  opensubdiv/far/topologyDescriptor.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// With additions ported from OpenSubdiv 3.6.1:
//  opensubdiv/far/topologyRefinerFactory.h,
//  opensubdiv/far/topologyRefinerFactory.cpp, opensubdiv/vtr/level.cpp
// Copyright 2014 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE,
//  LICENSE-OpenSubdiv-3.6.1.txt and NOTICE.

// Mirrors opensubdiv/far/topologyRefinerFactory.{h,cpp} +
// topologyDescriptor.cpp (the TopologyDescriptor specialization) —
// Far::TopologyRefinerFactoryBase, Far::TopologyRefinerFactory<MESH> and
// Far::TopologyRefinerFactory<TopologyDescriptor>.
//
// Local change (see PROVENANCE.md): the factory follows OpenSubdiv 3.6.1's
// template structure so that clients can specialize it for their own mesh
// type, as pxr/imaging/pxOsd/refinerFactory.cpp does. A C++ specialization of
// the protected static hooks (resizeComponentTopology,
// assignComponentTopology, assignComponentTags, assignFaceVaryingTopology,
// reportInvalidTopology) is a TopologyRefinerFactorySpecialization<MESH>
// object passed to CreateTopologyRefiner; the protected base-level accessors
// (setNumBaseFaces, getBaseFaceVertices, ...) are the TopologyRefinerFactoryAccess
// functions. The base class methods (prepareComponentTopologySizing,
// prepareComponentTopologyAssignment, prepareComponentTagsAndSharpness,
// prepareFaceVaryingChannels) follow far/topologyRefinerFactory.cpp:46-451.
//
// The TopologyDescriptor specialization keeps this port's descriptor
// contract (topologyDescriptor.ts: USD-run creases are accepted and
// normalized). TopologyRefinerFactory.Create(desc, opts) throws where
// upstream would return null, since its callers have always relied on a
// non-null refiner.

import { Level } from '../vtr/level.ts'
import { INDEX_INVALID, VALENCE_LIMIT } from '../vtr/types.ts'
import { Options, VtxBoundaryInterpolation } from '../sdc/options.ts'
import { SchemeType, SchemeTypeTraits } from '../sdc/types.ts'
import { Crease, Rule, SHARPNESS_INFINITE, IsInfinite, IsSharp, IsSemiSharp } from '../sdc/crease.ts'
import { TopologyRefiner } from './topologyRefiner.ts'
import { normalizeCreases, type TopologyDescriptor } from './topologyDescriptor.ts'
import { ErrorType, FarError } from './error.ts'
import type { Index } from './types.ts'

/** vtr/level.h:290-311 Level::TopologyError */
export enum TopologyError {
  TOPOLOGY_MISSING_EDGE_FACES = 0,
  TOPOLOGY_MISSING_EDGE_VERTS,
  TOPOLOGY_MISSING_FACE_EDGES,
  TOPOLOGY_MISSING_FACE_VERTS,
  TOPOLOGY_MISSING_VERT_FACES,
  TOPOLOGY_MISSING_VERT_EDGES,

  TOPOLOGY_FAILED_CORRELATION_EDGE_FACE,
  TOPOLOGY_FAILED_CORRELATION_FACE_VERT,
  TOPOLOGY_FAILED_CORRELATION_FACE_EDGE,

  TOPOLOGY_FAILED_ORIENTATION_INCIDENT_EDGE,
  TOPOLOGY_FAILED_ORIENTATION_INCIDENT_FACE,
  TOPOLOGY_FAILED_ORIENTATION_INCIDENT_FACES_EDGES,

  TOPOLOGY_DEGENERATE_EDGE,
  TOPOLOGY_NON_MANIFOLD_EDGE,

  TOPOLOGY_INVALID_CREASE_EDGE,
  TOPOLOGY_INVALID_CREASE_VERT,
}

/** topologyRefinerFactory.h:121-145 TopologyRefinerFactory<MESH>::Options */
export class TopologyRefinerFactoryOptions {
  schemeType: SchemeType
  schemeOptions: Options
  validateFullTopology = false

  constructor(sdcType: SchemeType = SchemeType.CATMARK, sdcOptions: Options = new Options()) {
    this.schemeType = sdcType
    this.schemeOptions = sdcOptions
  }
}

/** The client-specialized static hooks of TopologyRefinerFactory<MESH>
 *  (topologyRefinerFactory.h:181-239). Omitted optional hooks take the
 *  unspecialized defaults (topologyRefinerFactory.h:668-705). */
export interface TopologyRefinerFactorySpecialization<MESH> {
  resizeComponentTopology(newRefiner: TopologyRefiner, mesh: MESH): boolean
  assignComponentTopology(newRefiner: TopologyRefiner, mesh: MESH): boolean
  assignComponentTags?(newRefiner: TopologyRefiner, mesh: MESH): boolean
  assignFaceVaryingTopology?(newRefiner: TopologyRefiner, mesh: MESH): boolean
  reportInvalidTopology?(errCode: TopologyError, msg: string, mesh: MESH): void
}

/** The protected base-level accessors of TopologyRefinerFactory<MESH>
 *  (topologyRefinerFactory.h:245-310, inline definitions :481-664). */
export const TopologyRefinerFactoryAccess = {
  setNumBaseFaces(newRefiner: TopologyRefiner, count: number): void {
    newRefiner._levels[0]!.resizeFaces(count)
  },
  setNumBaseEdges(newRefiner: TopologyRefiner, count: number): void {
    newRefiner._levels[0]!.resizeEdges(count)
  },
  setNumBaseVertices(newRefiner: TopologyRefiner, count: number): void {
    newRefiner._levels[0]!.resizeVertices(count)
  },
  getNumBaseFaces(newRefiner: TopologyRefiner): number {
    return newRefiner._levels[0]!.getNumFaces()
  },
  getNumBaseEdges(newRefiner: TopologyRefiner): number {
    return newRefiner._levels[0]!.getNumEdges()
  },
  getNumBaseVertices(newRefiner: TopologyRefiner): number {
    return newRefiner._levels[0]!.getNumVertices()
  },
  setNumBaseFaceVertices(newRefiner: TopologyRefiner, f: Index, count: number): void {
    newRefiner._levels[0]!.resizeFaceVerticesAt(f, count)
    newRefiner._hasIrregFaces = newRefiner._hasIrregFaces || (count !== newRefiner._regFaceSize)
  },
  setNumBaseEdgeFaces(newRefiner: TopologyRefiner, e: Index, count: number): void {
    newRefiner._levels[0]!.resizeEdgeFacesAt(e, count)
  },
  setNumBaseVertexFaces(newRefiner: TopologyRefiner, v: Index, count: number): void {
    newRefiner._levels[0]!.resizeVertexFacesAt(v, count)
  },
  setNumBaseVertexEdges(newRefiner: TopologyRefiner, v: Index, count: number): void {
    newRefiner._levels[0]!.resizeVertexEdgesAt(v, count)
  },
  getBaseFaceVertices(newRefiner: TopologyRefiner, f: Index): Int32Array {
    return newRefiner._levels[0]!.getFaceVertices(f)
  },
  getBaseFaceEdges(newRefiner: TopologyRefiner, f: Index): Int32Array {
    return newRefiner._levels[0]!.getFaceEdges(f)
  },
  getBaseEdgeVertices(newRefiner: TopologyRefiner, e: Index): Int32Array {
    return newRefiner._levels[0]!.getEdgeVertices(e)
  },
  getBaseEdgeFaces(newRefiner: TopologyRefiner, e: Index): Int32Array {
    return newRefiner._levels[0]!.getEdgeFaces(e)
  },
  getBaseVertexFaces(newRefiner: TopologyRefiner, v: Index): Int32Array {
    return newRefiner._levels[0]!.getVertexFaces(v)
  },
  getBaseVertexEdges(newRefiner: TopologyRefiner, v: Index): Int32Array {
    return newRefiner._levels[0]!.getVertexEdges(v)
  },
  findBaseEdge(newRefiner: TopologyRefiner, v0: Index, v1: Index): Index {
    return newRefiner._levels[0]!.findEdge(v0, v1)
  },
  setBaseEdgeNonManifold(newRefiner: TopologyRefiner, e: Index, b: boolean): void {
    newRefiner._levels[0]!.setEdgeNonManifold(e, b)
  },
  setBaseVertexNonManifold(newRefiner: TopologyRefiner, v: Index, b: boolean): void {
    newRefiner._levels[0]!.setVertexNonManifold(v, b)
  },
  setBaseEdgeSharpness(newRefiner: TopologyRefiner, e: Index, s: number): void {
    newRefiner._levels[0]!.setEdgeSharpness(e, s)
  },
  setBaseVertexSharpness(newRefiner: TopologyRefiner, v: Index, s: number): void {
    newRefiner._levels[0]!.setVertexSharpness(v, s)
  },
  setBaseFaceHole(newRefiner: TopologyRefiner, f: Index, b: boolean): void {
    newRefiner._levels[0]!.setFaceHole(f, b)
    newRefiner._hasHoles = newRefiner._hasHoles || b
  },
  /** topologyRefinerFactory.h:637-650 (both overloads) */
  createBaseFVarChannel(newRefiner: TopologyRefiner, numValues: number, fvarOptions?: Options): number {
    if (fvarOptions === undefined) {
      return newRefiner._levels[0]!.createFVarChannel(numValues, newRefiner._subdivOptions)
    }
    // Sdc::Options newOptions = newRefiner._subdivOptions (a value copy)
    const src = newRefiner._subdivOptions
    const newOptions = new Options()
    newOptions.setVtxBoundaryInterpolation(src.getVtxBoundaryInterpolation())
    newOptions.setFVarLinearInterpolation(src.getFVarLinearInterpolation())
    newOptions.setCreasingMethod(src.getCreasingMethod())
    newOptions.setTriangleSubdivision(src.getTriangleSubdivision())
    newOptions.setFVarLinearInterpolation(fvarOptions.getFVarLinearInterpolation())
    return newRefiner._levels[0]!.createFVarChannel(numValues, newOptions)
  },
  getBaseFaceFVarValues(newRefiner: TopologyRefiner, face: Index, channel = 0): Int32Array {
    return newRefiner._levels[0]!.getFaceFVarValues(face, channel)
  },
}

// ---------------------------------------------------------------------------
// TopologyRefinerFactoryBase (topologyRefinerFactory.cpp:46-451)

/** topologyRefinerFactory.cpp:46-131 */
function prepareComponentTopologySizing(refiner: TopologyRefiner): boolean {
  const baseLevel = refiner.getLevel(0)

  //  At minimum we require face-vertices (the total count of which can be
  //  determined from the offsets accumulated during sizing pass) and we
  //  need to resize members related to them to be populated during
  //  assignment:
  const vCount = baseLevel.getNumVertices()
  const fCount = baseLevel.getNumFaces()

  if (vCount === 0) {
    FarError(ErrorType.FAR_RUNTIME_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      'mesh contains no vertices.')
    return false
  }
  if (fCount === 0) {
    FarError(ErrorType.FAR_RUNTIME_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      'meshes without faces not yet supported.')
    return false
  }

  //  Make sure no face was defined that would lead to a valence overflow --
  //  the max valence has been initialized with the maximum number of
  //  face-vertices:
  if (baseLevel.getMaxValence() > VALENCE_LIMIT) {
    FarError(ErrorType.FAR_RUNTIME_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      `face with ${baseLevel.getMaxValence()} vertices > ${VALENCE_LIMIT} max.`)
    return false
  }

  const fVertCount = baseLevel.getNumFaceVertices(fCount - 1) +
                     baseLevel.getOffsetOfFaceVertices(fCount - 1)

  if (fVertCount === 0) {
    FarError(ErrorType.FAR_RUNTIME_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      'mesh contains no face-vertices.')
    return false
  }
  if ((refiner.getSchemeType() === SchemeType.LOOP) &&
      (fVertCount !== (3 * fCount))) {
    FarError(ErrorType.FAR_RUNTIME_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      'non-triangular faces not supported by Loop scheme.')
    return false
  }
  baseLevel.resizeFaceVertices(fVertCount)

  //  If edges were sized, all other topological relations must be sized
  //  with it, in which case we allocate those members to be populated.
  //  Otherwise, sizing of the other topology members is deferred until
  //  the face-vertices are assigned and the resulting relationships
  //  determined:
  const eCount = baseLevel.getNumEdges()

  if (eCount > 0) {
    baseLevel.resizeFaceEdges(baseLevel.getNumFaceVerticesTotal())
    baseLevel.resizeEdgeVertices()
    baseLevel.resizeEdgeFaces(baseLevel.getNumEdgeFaces(eCount - 1) +
                              baseLevel.getOffsetOfEdgeFaces(eCount - 1))
    baseLevel.resizeVertexFaces(baseLevel.getNumVertexFaces(vCount - 1) +
                                baseLevel.getOffsetOfVertexFaces(vCount - 1))
    baseLevel.resizeVertexEdges(baseLevel.getNumVertexEdges(vCount - 1) +
                                baseLevel.getOffsetOfVertexEdges(vCount - 1))
  }
  return true
}

/** topologyRefinerFactory.cpp:133-181 */
function prepareComponentTopologyAssignment(
  refiner: TopologyRefiner, fullValidation: boolean,
): boolean {
  const baseLevel = refiner.getLevel(0)

  const completeMissingTopology = (baseLevel.getNumEdges() === 0)
  if (completeMissingTopology) {
    if (!baseLevel.completeTopologyFromFaceVertices()) {
      FarError(ErrorType.FAR_RUNTIME_ERROR,
        'Failure in TopologyRefinerFactory<>::Create() -- ' +
        `vertex with valence ${baseLevel.getMaxValence()} > ${VALENCE_LIMIT} max.`)
      return false
    }
  } else {
    if (baseLevel.getMaxValence() === 0) {
      FarError(ErrorType.FAR_RUNTIME_ERROR,
        'Failure in TopologyRefinerFactory<>::Create() -- ' +
        'maximum valence not assigned.')
      return false
    }
  }

  if (fullValidation) {
    // DIVERGENCE: Vtr::Level::validateTopology (vtr/level.cpp:263-437) is
    // not ported; full validation is refused rather than skipped.
    FarError(ErrorType.FAR_CODING_ERROR,
      'Failure in TopologyRefinerFactory<>::Create() -- ' +
      'full topology validation is not available in this port.')
    return false
  }

  //  Now that we have a valid base level, initialize the Refiner's
  //  component inventory: refiner.initializeInventory() -- this port's
  //  TopologyRefiner sums its inventory on demand (topologyRefiner.ts).
  return true
}

/** topologyRefinerFactory.cpp:183-422 */
function prepareComponentTagsAndSharpness(refiner: TopologyRefiner): boolean {
  //  This method combines the initialization of internal component tags
  //  with the sharpening of edges and vertices according to the given
  //  boundary interpolation rule in the Options.
  //  Since both involve traversing the edge and vertex lists and noting
  //  the presence of boundaries -- best to do both at once...
  const baseLevel: Level = refiner.getLevel(0)

  const options = refiner.getSchemeOptions()
  const creasing = new Crease(options)

  const makeBoundaryFacesHoles =
    (options.getVtxBoundaryInterpolation() === VtxBoundaryInterpolation.NONE) &&
    (SchemeTypeTraits.getLocalNeighborhoodSize(refiner.getSchemeType()) > 0)

  const sharpenCornerVerts =
    (options.getVtxBoundaryInterpolation() === VtxBoundaryInterpolation.EDGE_AND_CORNER)

  const sharpenNonManFeatures = true

  //  Before initializing edge and vertex tags, tag any qualifying boundary
  //  faces as holes before the sharpness of incident vertices and edges is
  //  affected by boundary interpolation rules.
  //
  //  Faces will be excluded (tagged as holes) if they contain a vertex on a
  //  boundary that did not have all of its incident boundary edges sharpened
  //  (not just the boundary edges within the face), so inspect the vertices
  //  and tag their incident faces when necessary:
  if (makeBoundaryFacesHoles) {
    for (let vIndex = 0; vIndex < baseLevel.getNumVertices(); ++vIndex) {
      const vEdges = baseLevel.getVertexEdges(vIndex)
      const vFaces = baseLevel.getVertexFaces(vIndex)

      //  Ignore manifold interior vertices:
      if ((vEdges.length === vFaces.length) &&
          !baseLevel.getVertexTag(vIndex)._nonManifold) {
        continue
      }

      let excludeFaces = false
      for (let i = 0; !excludeFaces && (i < vEdges.length); ++i) {
        excludeFaces = (baseLevel.getNumEdgeFaces(vEdges[i]!) === 1) &&
          !IsInfinite(baseLevel.getEdgeSharpness(vEdges[i]!))
      }
      if (excludeFaces) {
        for (let i = 0; i < vFaces.length; ++i) {
          baseLevel.getFaceTag(vFaces[i]!)._hole = true
        }
        //  Need to tag Refiner (the Level does not keep track of this)
        refiner._hasHoles = true
      }
    }
  }

  //  Process the Edge tags first, as Vertex tags (notably the Rule) are
  //  dependent on properties of their incident edges.
  for (let eIndex = 0; eIndex < baseLevel.getNumEdges(); ++eIndex) {
    const eTag = baseLevel.getEdgeTag(eIndex)

    let eSharpness = baseLevel.getEdgeSharpness(eIndex)

    eTag._boundary = (baseLevel.getNumEdgeFaces(eIndex) < 2)
    if (eTag._boundary || (eTag._nonManifold && sharpenNonManFeatures)) {
      eSharpness = SHARPNESS_INFINITE
      baseLevel.setEdgeSharpness(eIndex, eSharpness)
    }
    eTag._infSharp = IsInfinite(eSharpness)
    eTag._semiSharp = IsSharp(eSharpness) && !eTag._infSharp
  }

  //  Process the Vertex tags now -- for some tags (semi-sharp and its rule)
  //  we need to inspect all incident edges:
  const schemeRegularInteriorValence =
    SchemeTypeTraits.getRegularVertexValence(refiner.getSchemeType())
  const schemeRegularBoundaryValence = (schemeRegularInteriorValence / 2) | 0

  for (let vIndex = 0; vIndex < baseLevel.getNumVertices(); ++vIndex) {
    const vTag = baseLevel.getVertexTag(vIndex)

    let vSharpness = baseLevel.getVertexSharpness(vIndex)

    const vEdges = baseLevel.getVertexEdges(vIndex)
    const vFaces = baseLevel.getVertexFaces(vIndex)

    //  Take inventory of properties of incident edges that affect this
    //  vertex:
    let boundaryEdgeCount = 0
    let infSharpEdgeCount = 0
    let semiSharpEdgeCount = 0
    let nonManifoldEdgeCount = 0
    for (let i = 0; i < vEdges.length; ++i) {
      const eTag = baseLevel.getEdgeTag(vEdges[i]!)

      boundaryEdgeCount += eTag._boundary ? 1 : 0
      infSharpEdgeCount += eTag._infSharp ? 1 : 0
      semiSharpEdgeCount += eTag._semiSharp ? 1 : 0
      nonManifoldEdgeCount += eTag._nonManifold ? 1 : 0
    }
    const sharpEdgeCount = infSharpEdgeCount + semiSharpEdgeCount

    //  Sharpen the vertex before using it in conjunction with incident edge
    //  properties to determine the semi-sharp tag and rule:
    const isTopologicalCorner = (vFaces.length === 1) && (vEdges.length === 2)
    const isSharpenedCorner = isTopologicalCorner && sharpenCornerVerts
    if (isSharpenedCorner) {
      vSharpness = SHARPNESS_INFINITE
      baseLevel.setVertexSharpness(vIndex, vSharpness)
    } else if (vTag._nonManifold && sharpenNonManFeatures &&
               !IsInfinite(vSharpness)) {
      //  We avoid sharpening non-manifold vertices when they occur on
      //  interior non-manifold creases, i.e. a pair of opposing non-
      //  manifold edges with more than two incident faces.  In these
      //  cases there are more incident faces than edges (1 more for
      //  each additional "fin") and no boundaries. Closer inspection
      //  of manifold subsets around the vertex is required to truly
      //  determine the crease case, so avoid it using pre-conditions
      //  that are available here:
      const isNonManCrease = (nonManifoldEdgeCount === 2) &&
                             (boundaryEdgeCount === 0) &&
                             (vFaces.length > vEdges.length) &&
                             testVertexNonManifoldCrease(baseLevel, vIndex)
      if (!isNonManCrease) {
        vSharpness = SHARPNESS_INFINITE
        baseLevel.setVertexSharpness(vIndex, vSharpness)
      }
    }

    vTag._infSharp = IsInfinite(vSharpness)
    vTag._semiSharp = IsSemiSharp(vSharpness)
    vTag._semiSharpEdges = (semiSharpEdgeCount > 0)

    vTag._rule = creasing.determineVertexVertexRule(vSharpness, sharpEdgeCount)

    //  Assign topological tags -- note that the "xordinary" tag is not
    //  assigned if non-manifold:
    vTag._boundary = (boundaryEdgeCount > 0)
    vTag._corner = isTopologicalCorner && vTag._infSharp
    if (vTag._nonManifold) {
      vTag._xordinary = false
    } else if (vTag._corner) {
      vTag._xordinary = false
    } else if (vTag._boundary) {
      vTag._xordinary = (vFaces.length !== schemeRegularBoundaryValence)
    } else {
      vTag._xordinary = (vFaces.length !== schemeRegularInteriorValence)
    }
    vTag._incomplete = false

    //  Assign tags specific to inf-sharp features to identify regular
    //  topologies partitioned by inf-sharp creases -- must be no semi-
    //  harp features here (and manifold for now):
    vTag._infSharpEdges = (infSharpEdgeCount > 0)
    vTag._infSharpCrease = false
    vTag._infIrregular = vTag._infSharp || vTag._infSharpEdges

    if (vTag._infSharpEdges) {
      //  Ignore semi-sharp vertex sharpness when computing the
      //  inf-sharp Rule:
      const infRule = creasing.determineVertexVertexRule(
        (vTag._infSharp ? vSharpness : 0.0), infSharpEdgeCount)

      if (infRule === Rule.CREASE) {
        vTag._infSharpCrease = true

        //  A "regular" inf-crease can only occur along a manifold
        //  regular boundary or by bisecting a manifold interior
        //  region (it is also possible along non-manifold vertices
        //  in some cases, but that requires much more effort to
        //  detect -- perhaps later...)
        if (!vTag._xordinary && !vTag._nonManifold) {
          if (vTag._boundary) {
            vTag._infIrregular = false
          } else {
            if (schemeRegularInteriorValence === 4) {
              vTag._infIrregular =
                (baseLevel.getEdgeTag(vEdges[0]!)._infSharp !==
                 baseLevel.getEdgeTag(vEdges[2]!)._infSharp)
            } else if (schemeRegularInteriorValence === 6) {
              vTag._infIrregular =
                (baseLevel.getEdgeTag(vEdges[0]!)._infSharp !==
                 baseLevel.getEdgeTag(vEdges[3]!)._infSharp) ||
                (baseLevel.getEdgeTag(vEdges[1]!)._infSharp !==
                 baseLevel.getEdgeTag(vEdges[4]!)._infSharp)
            }
          }
        }
      } else if (infRule === Rule.CORNER) {
        //  A regular set of inf-corners occurs when all edges are
        //  sharp and not a smooth corner:
        if ((infSharpEdgeCount === vEdges.length &&
            ((vEdges.length > 2) || vTag._infSharp))) {
          vTag._infIrregular = false
        }
      }
    }

    //  If any irregular faces are present, mark whether or not a vertex
    //  is incident any irregular face:
    if (refiner._hasIrregFaces) {
      const regSize = refiner._regFaceSize
      for (let i = 0; i < vFaces.length; ++i) {
        if (baseLevel.getFaceVertices(vFaces[i]!).length !== regSize) {
          vTag._incidIrregFace = true
          break
        }
      }
    }
  }
  return true
}

/** topologyRefinerFactory.cpp:424-445 */
function prepareFaceVaryingChannels(refiner: TopologyRefiner): boolean {
  const baseLevel = refiner.getLevel(0)

  const regVertexValence =
    SchemeTypeTraits.getRegularVertexValence(refiner.getSchemeType())
  const regBoundaryValence = (regVertexValence / 2) | 0

  for (let channel = 0; channel < refiner.getNumFVarChannels(); ++channel) {
    if (baseLevel.getNumFVarValues(channel) === 0) {
      FarError(ErrorType.FAR_RUNTIME_ERROR,
        'Failure in TopologyRefinerFactory<>::Create() -- ' +
        `face-varying channel ${channel} has no values.`)
      return false
    }
    baseLevel.completeFVarChannelTopology(channel, regBoundaryValence)
  }
  return true
}

/** vtr/level.cpp:2032-2101 Level::testVertexNonManifoldCrease. Kept here
 *  (it is only called by prepareComponentTagsAndSharpness) so this port's
 *  vtr/level.ts stays unchanged. */
function testVertexNonManifoldCrease(level: Level, vIndex: Index): boolean {
  //  Identify the two non-manifold edges for closer inspection -- the
  //  two edges must have more than two incident faces and the same
  //  number of incident faces. All other edges are manifold interior:
  const nonManEdges = [-1, -1]

  const vEdges = level.getVertexEdges(vIndex)
  for (let i = 0; i < vEdges.length; ++i) {
    if (level.isEdgeNonManifold(vEdges[i]!)) {
      if (nonManEdges[1]! >= 0) return false
      nonManEdges[nonManEdges[0]! >= 0 ? 1 : 0] = vEdges[i]!
    } else if (level.getEdgeFaces(vEdges[i]!).length !== 2) {
      return false
    }
  }
  if (level.getEdgeFaces(nonManEdges[0]!).length !== level.getEdgeFaces(nonManEdges[1]!).length) {
    return false
  }

  //  For each of the two non-manifold edges, inspect their incident faces
  //  to confirm that the manifold subset connected to each is delimited by
  //  the two edges (not one):
  let numFacesTraversed = 0

  for (let i = 0; i < 2; ++i) {
    const eIndex = nonManEdges[i]!
    const eStart = nonManEdges[i !== 0 ? 1 : 0]!
    const eEnd = nonManEdges[i === 0 ? 1 : 0]!

    const eFaces = level.getEdgeFaces(eIndex)
    const eInFace = level.getEdgeFaceLocalIndices(eIndex)

    //  For each face incident the two non-manifold edges, identify
    //  manifold subset of faces associated with each. First test
    //  the orientation of the edge in the starting face -- skipping
    //  this face if the edge is reversed as it should be at the end
    //  of a subset starting from the other crease edge:
    for (let j = 0; j < eFaces.length; ++j) {
      const fStart = eFaces[j]!

      const fVerts = level.getFaceVertices(fStart)
      if (fVerts[eInFace[j]!] !== vIndex) continue

      //  For each successive leading edge of a manifold sequence of
      //  faces, identify the face following that edge (if not the
      //  first) and edge that precedes it in the face -- continuing
      //  until the ending edge is reached:
      for (let eNext = eStart, fNext = fStart; eNext !== eEnd;) {
        if (eNext !== eStart) {
          const fPair = level.getEdgeFaces(eNext)
          fNext = fPair[fPair[0] === fNext ? 1 : 0]!
        }
        numFacesTraversed++

        const fEdges = level.getFaceEdges(fNext)
        const iNext = fEdges.indexOf(eNext)

        eNext = fEdges[iNext ? (iNext - 1) : (fEdges.length - 1)]!
        if (eNext === eStart) return false
      }
    }
  }
  return (numFacesTraversed === level.getVertexFaces(vIndex).length)
}

// ---------------------------------------------------------------------------
// TopologyRefinerFactory<MESH> (topologyRefinerFactory.h:115-479)

/** topologyRefinerFactory.h:452-479 populateBaseLevel */
function populateBaseLevel<MESH>(
  refiner: TopologyRefiner, mesh: MESH, options: TopologyRefinerFactoryOptions,
  spec: TopologyRefinerFactorySpecialization<MESH>,
): boolean {
  //  Construction of a specialized topology refiner involves four steps, each of which
  //  involves a method specialized for MESH followed by one that takes an action in
  //  response to it or in preparation for the next step.
  //
  //  Both the specialized methods and those that follow them may find fault in the
  //  construction and trigger failure at any time:

  //  Sizing of the topology -- this is a required specialization for MESH.  This defines
  //  an inventory of all components and their relations that is used to allocate buffers
  //  to be efficiently populated in the subsequent topology assignment step.
  if (!spec.resizeComponentTopology(refiner, mesh)) return false
  if (!prepareComponentTopologySizing(refiner)) return false

  //  Assignment of the topology -- this is a required specialization for MESH.  If edges
  //  are specified, all other topological relations are expected to be defined for them.
  //  Otherwise edges and remaining topology will be completed from the face-vertices:
  const validate = options.validateFullTopology

  if (!spec.assignComponentTopology(refiner, mesh)) return false
  if (!prepareComponentTopologyAssignment(refiner, validate)) return false

  //  User assigned and internal tagging of components -- an optional specialization for
  //  MESH.  Allows the specification of sharpness values, holes, etc.
  if (spec.assignComponentTags && !spec.assignComponentTags(refiner, mesh)) return false
  if (!prepareComponentTagsAndSharpness(refiner)) return false

  //  Defining channels of face-varying primvar data -- an optional specialization for MESH.
  if (spec.assignFaceVaryingTopology && !spec.assignFaceVaryingTopology(refiner, mesh)) return false
  if (!prepareFaceVaryingChannels(refiner)) return false

  return true
}

/** topologyRefinerFactory.h:427-441 TopologyRefinerFactory<MESH>::Create:
 *  null where upstream returns 0. */
export function CreateTopologyRefiner<MESH>(
  spec: TopologyRefinerFactorySpecialization<MESH>,
  mesh: MESH,
  options: TopologyRefinerFactoryOptions = new TopologyRefinerFactoryOptions(),
): TopologyRefiner | null {
  const refiner = new TopologyRefiner(options.schemeType, options.schemeOptions)

  if (!populateBaseLevel(refiner, mesh, options, spec)) {
    return null
  }

  //  Eventually want to move the Refiner's inventory initialization here.  Currently it
  //  is handled after topology assignment, but if the inventory is to include additional
  //  features (e.g. holes, etc.) it is better off deferred to here.

  return refiner
}

// ---------------------------------------------------------------------------
// TopologyRefinerFactory<TopologyDescriptor> (topologyDescriptor.cpp)

const _descriptorSpecialization: TopologyRefinerFactorySpecialization<TopologyDescriptor> = {
  resizeComponentTopology(refiner, desc) {
    const numFaces = desc.numFaces ?? desc.vertsPerFace.length
    TopologyRefinerFactoryAccess.setNumBaseVertices(refiner, desc.numVertices)
    TopologyRefinerFactoryAccess.setNumBaseFaces(refiner, numFaces)
    for (let f = 0; f < numFaces; ++f) {
      TopologyRefinerFactoryAccess.setNumBaseFaceVertices(refiner, f, desc.vertsPerFace[f]!)
    }
    return true
  },

  assignComponentTopology(refiner, desc) {
    const numFaces = TopologyRefinerFactoryAccess.getNumBaseFaces(refiner)
    const leftHanded = desc.isLeftHanded ?? false
    let idx = 0
    for (let f = 0; f < numFaces; ++f) {
      const dst = TopologyRefinerFactoryAccess.getBaseFaceVertices(refiner, f)
      if (leftHanded) {
        dst[0] = desc.vertIndicesPerFace[idx++]!
        for (let v = dst.length - 1; v > 0; --v) dst[v] = desc.vertIndicesPerFace[idx++]!
      } else {
        for (let v = 0; v < dst.length; ++v) dst[v] = desc.vertIndicesPerFace[idx++]!
      }
    }
    return true
  },

  assignComponentTags(refiner, desc) {
    const base = refiner.getLevel(0)
    const { indexPairs, weights } = normalizeCreases(desc)
    for (let e = 0; e < weights.length; ++e) {
      const v0 = indexPairs[2 * e]!
      const v1 = indexPairs[2 * e + 1]!
      const edge = TopologyRefinerFactoryAccess.findBaseEdge(refiner, v0, v1)
      if (edge !== INDEX_INVALID) {
        TopologyRefinerFactoryAccess.setBaseEdgeSharpness(refiner, edge, weights[e]!)
      }
      // (invalid crease edges are silently skipped, matching reportInvalidTopology's warning path)
    }

    if (desc.cornerIndices && desc.cornerWeights) {
      for (let i = 0; i < desc.cornerIndices.length; ++i) {
        const v = desc.cornerIndices[i]!
        if (v >= 0 && v < base.getNumVertices()) {
          TopologyRefinerFactoryAccess.setBaseVertexSharpness(refiner, v, desc.cornerWeights[i]!)
        }
      }
    }

    if (desc.holeIndices) {
      for (let i = 0; i < desc.holeIndices.length; ++i) {
        TopologyRefinerFactoryAccess.setBaseFaceHole(refiner, desc.holeIndices[i]!, true)
      }
    }
    return true
  },

  assignFaceVaryingTopology(refiner, desc) {
    if (!desc.fvarChannels || desc.fvarChannels.length === 0) return true
    const numFaces = TopologyRefinerFactoryAccess.getNumBaseFaces(refiner)
    const leftHanded = desc.isLeftHanded ?? false
    for (let c = 0; c < desc.fvarChannels.length; ++c) {
      const ch = desc.fvarChannels[c]!
      const channel = TopologyRefinerFactoryAccess.createBaseFVarChannel(refiner, ch.numValues)
      let srcNext = 0
      for (let f = 0; f < numFaces; ++f) {
        const dst = TopologyRefinerFactoryAccess.getBaseFaceFVarValues(refiner, f, channel)
        if (leftHanded) {
          dst[0] = ch.valueIndices[srcNext++]!
          for (let v = dst.length - 1; v > 0; --v) dst[v] = ch.valueIndices[srcNext++]!
        } else {
          for (let v = 0; v < dst.length; ++v) dst[v] = ch.valueIndices[srcNext++]!
        }
      }
    }
    return true
  },
}

export interface CreateOptions {
  schemeType: SchemeType
  schemeOptions: Options
}

export const TopologyRefinerFactory = {
  /** TopologyRefinerFactory<TopologyDescriptor>::Create. Throws where
   *  upstream returns null (see the header note). */
  create(desc: TopologyDescriptor, opts: CreateOptions): TopologyRefiner {
    const refiner = CreateTopologyRefiner(
      _descriptorSpecialization, desc,
      new TopologyRefinerFactoryOptions(opts.schemeType, opts.schemeOptions))
    if (!refiner) {
      throw new Error('TopologyRefinerFactory<TopologyDescriptor>::Create() failed')
    }
    return refiner
  },
}
