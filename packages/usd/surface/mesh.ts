// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface Mesh: the pilot of the generated schema surface (style guide rule
// 10), written by hand. Each attribute property is the core UsdGeomMesh's
// Get…Attr (pxr/usd/usdGeom/src/mesh.ts, pointBased.ts, boundable.ts),
// typed by the attribute's declared value type in OpenUSD's
// pxr/usd/usdGeom/schema.usda. The next step generates these from the same
// generator as the core.
import { Mesh as UsdGeomMesh } from 'typescript-usd/usdGeom'
import { Attribute } from './attribute.ts'
import { ensure, guard } from './error.ts'
import { Prim } from './prim.ts'
import type { Stage } from './stage.ts'

/**
 * A polygon or subdivision mesh.
 *
 * ```ts
 * const mesh = new Mesh(stage.prim('/World/Ball')!)
 * const points = mesh.points.get()        // Float32Array view, 3 floats per point
 * mesh.points.set([[0, 0, 0], [1, 0, 0], [0, 1, 0]], 24)
 * ```
 *
 * @upstream UsdGeomMesh
 */
export class Mesh {
  readonly #core: UsdGeomMesh

  /**
   * The Mesh schema on `prim`. The attribute properties throw UsdError when
   * the prim's type does not define them (it is not a Mesh).
   *
   * @upstream UsdGeomMesh::UsdGeomMesh
   */
  constructor(prim: Prim) {
    this.#core = new UsdGeomMesh(prim.core, prim.core.getStage())
  }

  /**
   * Defines a `Mesh` prim at `path` on the stage's edit target.
   *
   * @throws UsdError when the prim cannot be defined.
   * @upstream UsdGeomMesh::Define
   */
  static define(stage: Stage, path: string): Mesh {
    const core = guard('Mesh.define', () => UsdGeomMesh.define(stage.core, path))
    return new Mesh(ensure('Mesh.define', Prim.fromCore(core.prim)))
  }

  /**
   * The core schema object this wraps, for APIs the surface does not cover
   * yet.
   *
   * @upstream none
   */
  get core(): UsdGeomMesh {
    return this.#core
  }

  /**
   * The prim the schema is applied to.
   *
   * @upstream UsdSchemaBase::GetPrim
   */
  get prim(): Prim {
    return ensure('Mesh.prim', Prim.fromCore(this.#core.prim))
  }

  /**
   * `point3f[] points`: vertex positions, 3 floats per point.
   *
   * @upstream UsdGeomPointBased::GetPointsAttr
   */
  get points(): Attribute<Float32Array> {
    return ensure('Mesh.points', Attribute.fromCore<Float32Array>(this.#core.getPointsAttr()))
  }

  /**
   * `normal3f[] normals`: 3 floats per normal.
   *
   * @upstream UsdGeomPointBased::GetNormalsAttr
   */
  get normals(): Attribute<Float32Array> {
    return ensure('Mesh.normals', Attribute.fromCore<Float32Array>(this.#core.getNormalsAttr()))
  }

  /**
   * `float3[] extent`: the bounds, as min then max.
   *
   * @upstream UsdGeomBoundable::GetExtentAttr
   */
  get extent(): Attribute<Float32Array> {
    return ensure('Mesh.extent', Attribute.fromCore<Float32Array>(this.#core.getExtentAttr()))
  }

  /**
   * `int[] faceVertexCounts`: the number of vertices of each face.
   *
   * @upstream UsdGeomMesh::GetFaceVertexCountsAttr
   */
  get faceVertexCounts(): Attribute<Int32Array> {
    return ensure('Mesh.faceVertexCounts', Attribute.fromCore<Int32Array>(this.#core.getFaceVertexCountsAttr()))
  }

  /**
   * `int[] faceVertexIndices`: the point index of each face vertex.
   *
   * @upstream UsdGeomMesh::GetFaceVertexIndicesAttr
   */
  get faceVertexIndices(): Attribute<Int32Array> {
    return ensure('Mesh.faceVertexIndices', Attribute.fromCore<Int32Array>(this.#core.getFaceVertexIndicesAttr()))
  }
}
