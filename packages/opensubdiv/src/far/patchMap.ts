// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchMap.h,
//  opensubdiv/far/patchMap.cpp
// Copyright 2013 Pixar. Copyright 2014 DreamWorks Animation LLC. Modified
//  Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/patchMap.h:49-231 and
// patchMap.cpp:38-202 -- Far::PatchMap, the quadtree locating the sub-patch
// of a ptex face containing a (u,v). Local source addition (see
// PROVENANCE.md).

import type { PatchHandle, PatchTable } from './patchTable.ts'
import { PatchHandle as Handle } from './patchTable.ts'

// patchMap.h:85-89
class Child {
  isSet = false // true if the child has been set
  isLeaf = false // true if the child is a QuadNode
  index = 0 // child index (either QuadNode or Handle)
}

// patchMap.h:82-98
class QuadNode {
  children: [Child, Child, Child, Child] = [new Child(), new Child(), new Child(), new Child()]

  // patchMap.cpp:38-47 -- sets all the children to point to the patch of
  // given index
  setChildren(index: number): void {
    for (let i = 0; i < 4; ++i) {
      this.children[i]!.isSet = true
      this.children[i]!.isLeaf = true
      this.children[i]!.index = index
    }
  }

  // patchMap.cpp:49-57 -- sets the child in "quadrant" to point to the node
  // or patch of the given index
  setChild(quadrant: number, index: number, isLeaf: boolean): void {
    const child = this.children[quadrant]!
    if (child.isSet) throw new Error('PatchMap: quadtree child assigned twice')
    child.isSet = true
    child.isLeaf = isLeaf
    child.index = index
  }
}

// A (u,v) pair being descended through the quadtree; the C++ transforms u and
// v in place through references.
interface UV {
  u: number
  v: number
}

//  Given a median value for both U and V, these methods transform a (u,v)
//  pair into the quadrant that contains them and return the quadrant index
//  (patchMap.h:121-189). The triangular case also takes and updates the
//  rotation of the quadrant being searched (quadrant 3 imparts a rotation).
function transformUVToQuadQuadrant(median: number, uv: UV): number {
  const uHalf = uv.u >= median ? 1 : 0
  if (uHalf) uv.u -= median

  const vHalf = uv.v >= median ? 1 : 0
  if (vHalf) uv.v -= median

  return (vHalf << 1) | uHalf
}

function transformUVToTriQuadrant(median: number, uv: UV, rotated: { value: boolean }): number {
  if (!rotated.value) {
    if (uv.u >= median) {
      uv.u -= median
      return 1
    }
    if (uv.v >= median) {
      uv.v -= median
      return 2
    }
    if (uv.u + uv.v >= median) {
      rotated.value = true
      return 3
    }
    return 0
  } else {
    if (uv.u < median) {
      uv.v -= median
      return 1
    }
    if (uv.v < median) {
      uv.u -= median
      return 2
    }
    uv.u -= median
    uv.v -= median
    if (uv.u + uv.v < median) {
      rotated.value = false
      return 3
    }
    return 0
  }
}

export class PatchMap {
  _patchesAreTriangular: boolean // tri and quad assembly and search requirements differ
  _minPatchFace = -1 // minimum patch face index supported by the map
  _maxPatchFace = -1 // maximum patch face index supported by the map
  _maxDepth = 0 // maximum depth of a patch in the tree
  _handles: PatchHandle[] = [] // all the patches in the PatchTable
  _quadtree: QuadNode[] = [] // quadtree nodes

  // patchMap.cpp:89-99
  constructor(patchTable: PatchTable) {
    this._patchesAreTriangular = patchTable.getVaryingPatchDescriptor().getNumControlVertices() === 3

    if (patchTable.getNumPatchesTotal() > 0) {
      this.initializeHandles(patchTable)
      this.initializeQuadtree(patchTable)
    }
  }

  // patchMap.h:192-231 -- returns null where the C++ returns 0.
  findPatch(faceid: number, u: number, v: number): PatchHandle | null {
    //  Reject patch faces not supported by this map, or those corresponding
    //  to holes or otherwise unassigned:
    if (faceid < this._minPatchFace || faceid > this._maxPatchFace) return null

    let node = this._quadtree[faceid - this._minPatchFace]!

    if (!node.children[0].isSet) return null

    if (!(u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0)) {
      throw new Error('PatchMap.FindPatch(): (u,v) outside [0,1]')
    }

    let median = 0.5
    const triRotated = { value: false }
    const uv = { u, v }

    for (let depth = 0; depth <= this._maxDepth; ++depth, median *= 0.5) {
      const quadrant = this._patchesAreTriangular
        ? transformUVToTriQuadrant(median, uv, triRotated)
        : transformUVToQuadQuadrant(median, uv)

      //  holes should have been rejected at the root node of the face
      const child = node.children[quadrant]!
      if (!child.isSet) throw new Error('PatchMap.FindPatch(): unassigned quadrant')

      if (child.isLeaf) {
        return this._handles[child.index]!
      } else {
        node = this._quadtree[child.index]!
      }
    }
    throw new Error('PatchMap.FindPatch(): quadtree deeper than its maximum depth')
  }

  // patchMap.cpp:59-64
  private assignRootNode(node: QuadNode, index: number): void {
    //  Assign the given index to all children of the node (all leaves)
    node.setChildren(index)
  }

  // patchMap.cpp:66-84
  private assignLeafOrChildNode(node: QuadNode, isLeaf: boolean, quadrant: number, index: number): QuadNode {
    //  Assign the node given if it is a leaf node, otherwise traverse the
    //  node -- creating/assigning a new child node if needed
    if (isLeaf) {
      node.setChild(quadrant, index, true)
      return node
    }
    if (node.children[quadrant]!.isSet) {
      return this._quadtree[node.children[quadrant]!.index]!
    } else {
      const newChildNodeIndex = this._quadtree.length
      this._quadtree.push(new QuadNode())
      node.setChild(quadrant, newChildNodeIndex, false)
      return this._quadtree[newChildNodeIndex]!
    }
  }

  // patchMap.cpp:101-135
  private initializeHandles(patchTable: PatchTable): void {
    //  Populate the vector of patch Handles.  Keep track of the min and max
    //  face indices to allocate resources accordingly and limit queries:
    this._minPatchFace = patchTable.getPatchParamTable()[0]!.getFaceId()
    this._maxPatchFace = this._minPatchFace

    const numArrays = patchTable.getNumPatchArrays()
    const numPatches = patchTable.getNumPatchesTotal()

    this._handles = new Array<PatchHandle>(numPatches)

    for (let pArray = 0, handleIndex = 0; pArray < numArrays; ++pArray) {
      const params = patchTable.getPatchParams(pArray)

      const patchSize = patchTable.getPatchArrayDescriptor(pArray).getNumControlVertices()

      for (let j = 0; j < patchTable.getNumPatches(pArray); ++j, ++handleIndex) {
        this._handles[handleIndex] = new Handle(pArray, handleIndex, j * patchSize)

        const patchFaceId = params[j]!.getFaceId()
        this._minPatchFace = Math.min(this._minPatchFace, patchFaceId)
        this._maxPatchFace = Math.max(this._maxPatchFace, patchFaceId)
      }
    }
  }

  // patchMap.cpp:137-202
  private initializeQuadtree(patchTable: PatchTable): void {
    //  Reserve quadtree nodes for the worst case and prune later.  Set the
    //  initial size to accommodate the root node of each patch face:
    const nPatchFaces = this._maxPatchFace - this._minPatchFace + 1

    const nHandles = this._handles.length

    this._quadtree = []
    for (let i = 0; i < nPatchFaces; ++i) this._quadtree.push(new QuadNode())

    const params = patchTable.getPatchParamTable()

    for (let handle = 0; handle < nHandles; ++handle) {
      const param = params[handle]!

      const depth = param.getDepth()
      const rootDepth = param.nonQuadRoot() ? 1 : 0

      this._maxDepth = Math.max(this._maxDepth, depth)

      let node = this._quadtree[param.getFaceId() - this._minPatchFace]!

      if (depth === rootDepth) {
        this.assignRootNode(node, handle)
        continue
      }

      if (!this._patchesAreTriangular) {
        //  Use the UV bits of the PatchParam directly for quad patches:
        const u = param.getU()
        const v = param.getV()

        for (let j = rootDepth + 1; j <= depth; ++j) {
          const uBit = (u >> (depth - j)) & 1
          const vBit = (v >> (depth - j)) & 1

          const quadrant = (vBit << 1) | uBit

          node = this.assignLeafOrChildNode(node, j === depth, quadrant, handle)
        }
      } else {
        //  Use an interior UV point of triangles to identify quadrants:
        const [u, v] = param.unnormalizeTriangle(0.25, 0.25)
        const uv = { u, v }

        let median = 0.5
        const triRotated = { value: false }

        for (let j = rootDepth + 1; j <= depth; ++j, median *= 0.5) {
          const quadrant = transformUVToTriQuadrant(median, uv, triRotated)

          node = this.assignLeafOrChildNode(node, j === depth, quadrant, handle)
        }
      }
    }
  }
}
