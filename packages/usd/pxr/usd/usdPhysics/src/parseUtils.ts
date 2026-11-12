// Ported from OpenUSD 26.11.1: pxr/usd/usdPhysics/parseUtils.cpp,
//  pxr/usd/usdPhysics/parseUtils.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Physics parsing utilities: UsdPhysicsLoadStageFromPrimRange.
// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/parseUtils.h and
// pxr/usd/usdPhysics/parseUtils.cpp.
//
// Divergences, each kept at its site as well:
// - WorkParallelForN / WorkParallelForEach batches run sequentially; the
//   per-item work is identical and upstream's results do not depend on the
//   batch order (bodies' collision lists are sorted after the parallel loop,
//   parseUtils.cpp:2062-2079).
// - Attributes are read through UsdPrim::GetAttribute(...).Get() rather than
//   the usdGeom schema accessors: the hand-written usdGeom Get*Attr accessors
//   here declare the property on the edit target, which a read-only parse
//   must not do (and cannot do on instance proxies).
// - SdfPath values are path strings ('' is SdfPath()). std::map<SdfPath, ...>
//   and std::set<SdfPath> iteration order is reproduced by sorting with
//   SdfPath::operator< (SdfPath.compare).
// - TF_CODING_ERROR posts a coding error upstream and the parse continues;
//   here it posts a warning through TfDiagnosticMgr and the parse continues.

import {
  Matrix4d as GfMatrix4d, Quatf as GfQuatf, Transform as GfTransform,
  Vec3d as GfVec3d, Vec3f as GfVec3f, rotationToQuat,
} from 'typescript-usd/gf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { RaiseWarning as TfRaiseWarning } from 'typescript-usd/tf'
import {
  type Attribute, type Prim, PrimRange, type Stage, TraverseInstanceProxies,
} from 'typescript-usd/usd'
import { getStageMetersPerUnit, getStageUpAxis, XformCache } from 'typescript-usd/usdGeom'
import { Material, MaterialBindingAPI } from 'typescript-usd/usdShade'
import { ArticulationRootAPI } from './articulationRootAPI.ts'
import { CollisionAPI } from './collisionAPI.ts'
import { CollisionGroup } from './collisionGroup.ts'
import { DistanceJoint } from './distanceJoint.ts'
import { DriveAPI } from './driveAPI.ts'
import { FilteredPairsAPI } from './filteredPairsAPI.ts'
import { FixedJoint } from './fixedJoint.ts'
import { Joint } from './joint.ts'
import { LimitAPI } from './limitAPI.ts'
import { MaterialAPI } from './materialAPI.ts'
import { MeshCollisionAPI } from './meshCollisionAPI.ts'
import {
  ArticulationDesc, Axis, Capsule1ShapeDesc, CapsuleShapeDesc, CollisionGroupDesc,
  ConeShapeDesc, CubeShapeDesc, CustomJointDesc, CustomShapeDesc, Cylinder1ShapeDesc,
  CylinderShapeDesc, D6JointDesc, DistanceJointDesc, FixedJointDesc, JointDesc,
  JointDOF, JointDrive, JointLimit, MeshShapeDesc, type ObjectDesc, ObjectType,
  PlaneShapeDesc, PrismaticJointDesc, RevoluteJointDesc, RigidBodyDesc,
  RigidBodyMaterialDesc, SceneDesc, ShapeDesc, SphereShapeDesc, SpherePoint,
  SpherePointsShapeDesc, SphericalJointDesc, usdPhysicsSentinelLimit,
} from './parseDesc.ts'
import { PrismaticJoint } from './prismaticJoint.ts'
import { RevoluteJoint } from './revoluteJoint.ts'
import { RigidBodyAPI } from './rigidBodyAPI.ts'
import { Scene } from './scene.ts'
import { SphericalJoint } from './sphericalJoint.ts'
import { UsdPhysicsTokens } from './tokens.ts'

// -------------------------------------------------------------------------- //
// PHYSICSPARSEUTILS (parseUtils.h)                                           //
// -------------------------------------------------------------------------- //

// Report function that reports parsed data (parseUtils.h:35-48). The descs
// array holds descriptors of the concrete type named by `type`.
export type ReportFn = (
  type: ObjectType,
  primPaths: readonly string[],
  objectDescs: readonly ObjectDesc[],
  userData: unknown,
) => void

// Token lists for custom joints, shapes and instancers (parseUtils.h:50-62).
export interface CustomTokens {
  // Custom joints to be reported by parsing
  jointTokens: string[]
  // Custom shapes to be reported by parsing
  shapeTokens: string[]
  // Custom physics instancers to be skipped by parsing
  instancerTokens: string[]
}

// parseUtils.cpp:67-68
const infSentinel = Math.fround(0.5e38)
const defaultGravity = Math.fround(9.81)

const f = Math.fround

function _codingError(message: string): void {
  TfRaiseWarning(message)
}

function _get(attr: Attribute | undefined): unknown {
  return attr && attr.isValid() ? attr.get() : undefined
}

function _attr(prim: Prim, name: string): Attribute | undefined {
  const attr = prim.getAttr(name)
  return attr && attr.isValid() ? attr : undefined
}

function _num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function _bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function _str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function _vec3f(v: unknown, fallback: GfVec3f): GfVec3f {
  if (v instanceof GfVec3f) return new GfVec3f(v)
  if (v !== null && typeof v === 'object' && 'data' in v) return new GfVec3f((v as { data: number[] }).data)
  if (Array.isArray(v) && v.length === 3) return new GfVec3f(v as number[])
  return fallback
}

function _quatf(v: unknown, fallback: GfQuatf): GfQuatf {
  if (v !== null && typeof v === 'object' && 'GetReal' in v) return new GfQuatf(v as GfQuatf)
  return fallback
}

function _quatfFromQuat(q: readonly number[]): GfQuatf {
  return new GfQuatf(q[0]!, q[1]!, q[2]!, q[3]!)
}

function _parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

function _pathCompare(a: string, b: string): number {
  return SdfPath.compare(
    a === '' ? SdfPath.emptyPath : SdfPath.fromString(a),
    b === '' ? SdfPath.emptyPath : SdfPath.fromString(b))
}

// std::map<SdfPath, T> iteration order.
function _sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort((x, y) => _pathCompare(x[0], y[0]))
}

// std::set<SdfPath> iteration order.
function _sortedPaths(set: Set<string>): string[] {
  return [...set].sort(_pathCompare)
}

// UsdGeomXformable::ComputeLocalToWorldTransform(UsdTimeCode::Default()).
function _computeLocalToWorldTransform(prim: Prim): GfMatrix4d {
  return new GfMatrix4d(...new XformCache(prim.getStage()).getLocalToWorldTransform(prim))
}

// UsdGeomPrimvar::ComputeFlattened (pxr/usd/usdGeom/primvar.h): the value
// expanded through its indices when indexed, the value itself otherwise.
function _computeFlattenedPrimvar(prim: Prim, name: string): unknown[] {
  const value = _get(_attr(prim, `primvars:${name}`))
  const values = value && typeof value === 'object' && Symbol.iterator in value ? Array.from(value as Iterable<unknown>) : []
  const indicesValue = _get(_attr(prim, `primvars:${name}:indices`))
  const indices = indicesValue && typeof indicesValue === 'object' && Symbol.iterator in indicesValue
    ? Array.from(indicesValue as Iterable<number>) : []
  if (indices.length === 0) return values
  return indices.map(i => values[i])
}

// Gather the filtered pairs from UsdPhysicsFilteredPairsAPI if applied to a prim
// (parseUtils.cpp:70-82)
function _parseFilteredPairs(usdPrim: Prim, outFilteredPairs: string[]): void {
  if (usdPrim.hasAPI(FilteredPairsAPI.typeName)) {
    const filteredPairsAPI = new FilteredPairsAPI(usdPrim)
    outFilteredPairs.push(...filteredPairsAPI.getFilteredPairsRel().getTargets())
  }
}

// Parse base descriptor for given UsdPhysicsArticulationRootAPI
// (parseUtils.cpp:84-102)
function _parseArticulationDesc(articulationAPI: Prim, outArticulationDesc: ArticulationDesc): boolean {
  if (articulationAPI.hasAPI(ArticulationRootAPI.typeName)) {
    _parseFilteredPairs(articulationAPI, outArticulationDesc.filteredCollisions)

    outArticulationDesc.primPath = articulationAPI.path
  } else {
    _codingError('Provided UsdPhysicsArticulationRootAPI or UsdPhysicsArticulationDesc is not valid.')
    return false
  }
  return true
}

// Get collision type for given prim, collision type is determined based on
// the UsdGeom type (parseUtils.cpp:104-200). `customGeometryToken` is the
// upstream out-parameter.
function _getCollisionType(prim: Prim, customTokens: readonly string[] | undefined,
  customGeometryToken: { value: string } | undefined): ObjectType {
  let retVal = ObjectType.Undefined

  // Custom shape handling, custom shape can be defined by the user
  // we need to check whether a custom collisionAPI or type is on a prim
  if (customTokens) {
    const apis = prim.getPrimTypeInfo().getAppliedAPISchemas()

    const primType = prim.typeName
    for (let i = 0; i < customTokens.length; i++) {
      for (let j = 0; j < apis.length; j++) {
        if (apis[j] === customTokens[i]) {
          retVal = ObjectType.CustomShape
          if (customGeometryToken) {
            customGeometryToken.value = apis[j]!
          }
          break
        }
      }
      if (retVal === ObjectType.CustomShape) {
        break
      }
      if (primType === customTokens[i]) {
        retVal = ObjectType.CustomShape
        if (customGeometryToken) {
          customGeometryToken.value = primType
        }
        break
      }
    }
  }

  if (retVal === ObjectType.CustomShape) {
    return retVal
  }

  // geomgprim that belongs to that collisionm define type based on that
  if (prim.isA('Gprim')) {
    if (prim.isA('Mesh')) {
      retVal = ObjectType.MeshShape
    } else if (prim.isA('Cube')) {
      retVal = ObjectType.CubeShape
    } else if (prim.isA('Sphere')) {
      retVal = ObjectType.SphereShape
    } else if (prim.isA('Capsule')) {
      retVal = ObjectType.CapsuleShape
    } else if (prim.isA('Capsule_1')) {
      retVal = ObjectType.Capsule1Shape
    } else if (prim.isA('Cylinder')) {
      retVal = ObjectType.CylinderShape
    } else if (prim.isA('Cylinder_1')) {
      retVal = ObjectType.Cylinder1Shape
    } else if (prim.isA('Cone')) {
      retVal = ObjectType.ConeShape
    } else if (prim.isA('Plane')) {
      retVal = ObjectType.PlaneShape
    } else if (prim.isA('Points')) {
      retVal = ObjectType.SpherePointsShape
    }
  }

  return retVal
}

// Gather material binding, where the expected puporse token is "physics"
// (parseUtils.cpp:202-221)
function _getMaterialBinding(usdPrim: Prim): string {
  let materialPath = ''

  const physicsPurpose = 'physics'
  if (usdPrim.hasAPI('MaterialBindingAPI')) {
    const bound = MaterialBindingAPI.computeBoundMaterial(usdPrim.getStage(), usdPrim.path, physicsPurpose)
    const material = bound ? usdPrim.getStage().getPrim(bound.materialPath) : undefined
    if (material && material.isA(Material.typeName)) {
      materialPath = material.path
    }
  }

  return materialPath
}

// Finalize collision descriptor (parseUtils.cpp:223-246)
function _finalizeCollisionDesc(colAPI: Prim, outDesc: ShapeDesc): void {
  // Get material information for the collider
  const materialPath = _getMaterialBinding(colAPI)
  if (materialPath !== '') {
    const materialPrim = colAPI.getStage().getPrim(materialPath)
    if (materialPrim && materialPrim.hasAPI(MaterialAPI.typeName)) {
      outDesc.materials.push(materialPath)
    }
  }

  _parseFilteredPairs(colAPI, outDesc.filteredCollisions)
  const collisionAPI = new CollisionAPI(colAPI)
  outDesc.collisionEnabled = _bool(_get(collisionAPI.getCollisionEnabledAttr()), outDesc.collisionEnabled)
  outDesc.simulationOwners = collisionAPI.getSimulationOwnerRel().getTargets()
}

function _scale(prim: Prim): GfVec3d {
  return new GfTransform(_computeLocalToWorldTransform(prim)).getScale()
}

// Parse sphere shape desc (parseUtils.cpp:248-297)
function _parseSphereShapeDesc(collisionAPI: Prim, outSphereShapeDesc: SphereShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA('Sphere')) {
    let radius = 1.0

    // Check scale, its part of the collision size
    {
      const sc = _scale(usdPrim)
      radius = Math.max(Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(0)))),
        Math.abs(f(sc.get(2))))
    }

    // Get shape parameters
    {
      const radiusAttr = _num(_get(_attr(usdPrim, 'radius')), 0)
      radius = f(radius * f(radiusAttr))
    }

    outSphereShapeDesc.radius = Math.abs(radius)
    outSphereShapeDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outSphereShapeDesc)
  } else {
    _codingError('Provided UsdPhysicsCollisionAPI is not applied to a UsdGeomSphere.')
    return false
  }
  return true
}

// Parse cube shape desc (parseUtils.cpp:299-352)
function _parseCubeShapeDesc(collisionAPI: Prim, outCubeShapeDesc: CubeShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA('Cube')) {
    // Add scale
    // scale is taken, its a part of the cube size, as the physics
    // does not support scale
    let halfExtents = new GfVec3f(_scale(usdPrim))

    // Get shape parameters
    {
      let sizeAttr = _num(_get(_attr(usdPrim, 'size')), 0)
      // convert cube edge length to half extend
      sizeAttr = Math.abs(sizeAttr) * 0.5
      halfExtents = halfExtents.getScaled(f(sizeAttr))
    }

    outCubeShapeDesc.halfExtents = halfExtents
    outCubeShapeDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outCubeShapeDesc)
  } else {
    _codingError('Provided UsdPhysicsCollisionAPI is not applied to a UsdGeomCube.')
    return false
  }
  return true
}

function _axisFromToken(prim: Prim, current: Axis): Axis {
  const axisAttr = _attr(prim, 'axis')
  if (axisAttr) {
    const capAxis = _str(_get(axisAttr), '')
    if (capAxis === UsdPhysicsTokens.y) {
      return Axis.Y
    } else if (capAxis === UsdPhysicsTokens.z) {
      return Axis.Z
    }
  }
  return current
}

// parseUtils.cpp:354-402. `out` carries the upstream out-parameters.
function _getAxisRadiusHalfHeight(shape: Prim, sc: GfVec3d,
  out: { axis: Axis, radius: number, halfHeight: number }): void {
  // Get shape parameters
  {
    const radiusAttr = _num(_get(_attr(shape, 'radius')), 0)
    const heightAttr = _num(_get(_attr(shape, 'height')), 0)
    out.radius = f(radiusAttr)
    out.halfHeight = f(f(heightAttr) * 0.5)

    out.axis = _axisFromToken(shape, out.axis)
  }

  {
    // scale the radius and height based on the given axis token
    if (out.axis === Axis.X) {
      out.halfHeight = f(out.halfHeight * f(sc.get(0)))
      out.radius = f(out.radius * Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(2)))))
    } else if (out.axis === Axis.Y) {
      out.halfHeight = f(out.halfHeight * f(sc.get(1)))
      out.radius = f(out.radius * Math.max(Math.abs(f(sc.get(0))), Math.abs(f(sc.get(2)))))
    } else {
      out.halfHeight = f(out.halfHeight * f(sc.get(2)))
      out.radius = f(out.radius * Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(0)))))
    }
  }
}

// parseUtils.cpp:404-458. `out` carries the upstream out-parameters.
function _getAxisTopBottomRadiusHalfHeight(shape: Prim, sc: GfVec3d,
  out: { axis: Axis, topRadius: number, bottomRadius: number, halfHeight: number }): void {
  // Get shape parameters
  {
    const topRadiusAttr = _num(_get(_attr(shape, 'radiusTop')), 0)
    const bottomRadiusAttr = _num(_get(_attr(shape, 'radiusBottom')), 0)
    const heightAttr = _num(_get(_attr(shape, 'height')), 0)
    out.topRadius = f(topRadiusAttr)
    out.bottomRadius = f(bottomRadiusAttr)
    out.halfHeight = f(f(heightAttr) * 0.5)

    out.axis = _axisFromToken(shape, out.axis)
  }

  {
    // scale the radius and height based on the given axis token
    if (out.axis === Axis.X) {
      out.halfHeight = f(out.halfHeight * f(sc.get(0)))
      const s = Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(2))))
      out.topRadius = f(out.topRadius * s)
      out.bottomRadius = f(out.bottomRadius * s)
    } else if (out.axis === Axis.Y) {
      out.halfHeight = f(out.halfHeight * f(sc.get(1)))
      const s = Math.max(Math.abs(f(sc.get(0))), Math.abs(f(sc.get(2))))
      out.topRadius = f(out.topRadius * s)
      out.bottomRadius = f(out.bottomRadius * s)
    } else {
      out.halfHeight = f(out.halfHeight * f(sc.get(2)))
      const s = Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(0))))
      out.topRadius = f(out.topRadius * s)
      out.bottomRadius = f(out.bottomRadius * s)
    }
  }
}

// Parse cylinder / capsule / cone shape descs (parseUtils.cpp:460-502,
// 504-546, 640-682): identical bodies over UsdGeomCylinder, UsdGeomCapsule
// and UsdGeomCone.
function _parseRadiusHalfHeightShapeDesc(geomType: string, collisionAPI: Prim,
  outDesc: CylinderShapeDesc | CapsuleShapeDesc | ConeShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA(geomType)) {
    const out = { axis: Axis.X, radius: 1.0, halfHeight: 1.0 }

    _getAxisRadiusHalfHeight(usdPrim, _scale(usdPrim), out)

    outDesc.radius = Math.abs(out.radius)
    outDesc.axis = out.axis
    outDesc.halfHeight = Math.abs(out.halfHeight)
    outDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outDesc)
  } else {
    _codingError(`Provided UsdPhysicsCollisionAPI is not applied to a UsdGeom${geomType}.`)
    return false
  }
  return true
}

// Parse capsule1 / cylinder1 shape descs (parseUtils.cpp:548-592, 594-638):
// identical bodies over UsdGeomCapsule_1 and UsdGeomCylinder_1.
function _parseTopBottomRadiusShapeDesc(geomType: string, collisionAPI: Prim,
  outDesc: Capsule1ShapeDesc | Cylinder1ShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA(geomType)) {
    const out = { axis: Axis.X, topRadius: 1.0, bottomRadius: 1.0, halfHeight: 1.0 }

    _getAxisTopBottomRadiusHalfHeight(usdPrim, _scale(usdPrim), out)

    outDesc.topRadius = Math.abs(out.topRadius)
    outDesc.bottomRadius = Math.abs(out.bottomRadius)
    outDesc.axis = out.axis
    outDesc.halfHeight = Math.abs(out.halfHeight)
    outDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outDesc)
  } else {
    _codingError(`Provided UsdPhysicsCollisionAPI is not applied to a UsdGeom${geomType}.`)
    return false
  }
  return true
}

// Parse mesh shape desc (parseUtils.cpp:684-752)
function _parseMeshShapeDesc(collisionAPI: Prim, outMeshShapeDesc: MeshShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA('Mesh')) {
    outMeshShapeDesc.meshScale = new GfVec3f(_scale(usdPrim))

    // Get approximation type
    outMeshShapeDesc.approximation = UsdPhysicsTokens.none
    if (usdPrim.hasAPI(MeshCollisionAPI.typeName)) {
      const physicsColMeshAPI = new MeshCollisionAPI(usdPrim)
      outMeshShapeDesc.approximation = _str(_get(physicsColMeshAPI.getApproximationAttr()), outMeshShapeDesc.approximation)
    }

    outMeshShapeDesc.doubleSided = _bool(_get(_attr(usdPrim, 'doubleSided')), outMeshShapeDesc.doubleSided)

    // Gather materials through subsets
    // UsdGeomSubset::GetGeomSubsets(shape, UsdGeomTokens->face)
    const stage = usdPrim.getStage()
    for (const child of usdPrim.getChildren()) {
      if (!child.isA('GeomSubset')) continue
      if (_str(_get(_attr(child, 'elementType')), 'face') !== 'face') continue
      const material = _getMaterialBinding(child)
      if (material !== '') {
        const materialPrim = stage.getPrim(material)
        if (materialPrim && materialPrim.hasAPI(MaterialAPI.typeName)) {
          outMeshShapeDesc.materials.push(material)
        }
      }
    }

    outMeshShapeDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outMeshShapeDesc)
  } else {
    _codingError('Provided UsdPhysicsCollisionAPI is not applied to a UsdGeomMesh.')
    return false
  }
  return true
}

// Parse plane shape desc (parseUtils.cpp:754-797)
function _parsePlaneShapeDesc(collisionAPI: Prim, outPlaneShapeDesc: PlaneShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA('Plane')) {
    let axis = Axis.X

    const tfAxis = _str(_get(_attr(usdPrim, 'axis')), '')
    if (tfAxis === UsdPhysicsTokens.y) {
      axis = Axis.Y
    } else if (tfAxis === UsdPhysicsTokens.z) {
      axis = Axis.Z
    }

    outPlaneShapeDesc.axis = axis
    outPlaneShapeDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outPlaneShapeDesc)
  } else {
    _codingError('Provided UsdPhysicsCollisionAPI is not applied to a UsdGeomPlane.')
    return false
  }
  return true
}

// Parse sphere points shape desc (parseUtils.cpp:799-874)
function _parseSpherePointsShapeDesc(collisionAPI: Prim, outSpherePointsShapeDesc: SpherePointsShapeDesc): boolean {
  const usdPrim = collisionAPI
  if (usdPrim.isA('Points')) {
    const sc = _scale(usdPrim)

    const pointsValue = _get(_attr(usdPrim, 'points'))
    const positions = pointsValue && typeof pointsValue === 'object' && Symbol.iterator in pointsValue
      ? Array.from(pointsValue as Iterable<unknown>) : []

    let widths: unknown[]
    const widthsPrimvar = _attr(usdPrim, 'primvars:widths')
    if (widthsPrimvar && widthsPrimvar.hasAuthoredValue()) {
      widths = _computeFlattenedPrimvar(usdPrim, 'widths')
    } else {
      const widthsValue = _get(_attr(usdPrim, 'widths'))
      widths = widthsValue && typeof widthsValue === 'object' && Symbol.iterator in widthsValue
        ? Array.from(widthsValue as Iterable<unknown>) : []
    }

    if (widths.length && positions.length === widths.length) {
      let sphereScale = 1.0
      {
        sphereScale = Math.max(Math.max(Math.abs(f(sc.get(1))), Math.abs(f(sc.get(0)))),
          Math.abs(f(sc.get(2))))
      }

      const scount = positions.length
      outSpherePointsShapeDesc.spherePoints = []
      for (let i = 0; i < scount; i++) {
        const point = new SpherePoint()
        point.radius = f(f(sphereScale * _num(widths[i], 0)) * 0.5)
        point.center = _vec3f(positions[i], new GfVec3f(0.0))
        outSpherePointsShapeDesc.spherePoints.push(point)
      }
    } else {
      outSpherePointsShapeDesc.isValid = false
    }

    outSpherePointsShapeDesc.primPath = usdPrim.path

    _finalizeCollisionDesc(collisionAPI, outSpherePointsShapeDesc)
  } else {
    _codingError('Provided UsdPhysicsCollisionAPI is not applied to a UsdGeomPoints.')
    return false
  }
  return true
}

// Parse custom shape desc (parseUtils.cpp:876-894)
function _parseCustomShapeDesc(collisionAPI: Prim, outCustomShapeDesc: CustomShapeDesc): boolean {
  outCustomShapeDesc.primPath = collisionAPI.path

  _finalizeCollisionDesc(collisionAPI, outCustomShapeDesc)
  return true
}

// Parse collision group desc (parseUtils.cpp:896-923)
function _parseCollisionGroupDesc(prim: Prim, outCollisionGroupDesc: CollisionGroupDesc): boolean {
  const collisionGroup = new CollisionGroup(prim)
  if (collisionGroup.isValid()) {
    outCollisionGroupDesc.filteredGroups = collisionGroup.getFilteredGroupsRel().getTargets()

    outCollisionGroupDesc.invertFilteredGroups =
      _bool(_get(collisionGroup.getInvertFilteredGroupsAttr()), outCollisionGroupDesc.invertFilteredGroups)
    outCollisionGroupDesc.mergeGroupName =
      _str(_get(collisionGroup.getMergeGroupNameAttr()), outCollisionGroupDesc.mergeGroupName)

    outCollisionGroupDesc.primPath = prim.path
  } else {
    _codingError('Provided UsdPhysicsCollisionGroup or UsdPhysicsCollisionGroupDesc is not valid.')
    return false
  }

  return true
}

// Get joint rel target (parseUtils.cpp:925-936)
function _getRel(targets: readonly string[]): string {
  if (targets.length === 0) {
    return ''
  }
  return targets[0]!
}

// Get body for a given path, the body can be on a parent prim
// (parseUtils.cpp:938-968). Returns [body, relPrim].
function _getBodyPrim(stage: Stage, relPath: string): [Prim | undefined, Prim | undefined] {
  let parent = stage.getPrim(relPath)
  const relPrim = parent
  let collisionPrim: Prim | undefined = undefined
  while (parent && parent.path !== '/') {
    if (parent.hasAPI(RigidBodyAPI.typeName)) {
      const rigidBodyAPI = new RigidBodyAPI(parent)
      // A disabled body takes no part in simulation and does not own
      // this prim, so keep searching the ancestors as though the API
      // were not applied at all.
      const rigidBodyEnabled = _bool(_get(rigidBodyAPI.getRigidBodyEnabledAttr()), true)
      if (rigidBodyEnabled) {
        return [parent, relPrim]
      }
    }
    if (parent.hasAPI(CollisionAPI.typeName)) {
      collisionPrim = parent
    }
    parent = stage.getPrim(_parentPath(parent.path))
  }

  return [collisionPrim, relPrim]
}

// Get joint local pose base on provided body rel path
// (parseUtils.cpp:970-1029). `pose` carries the upstream outT / outQ.
function _getLocalPose(stage: Stage, relPath: string, pose: { t: GfVec3f, q: GfQuatf }): string {
  const [body, relPrim] = _getBodyPrim(stage, relPath)

  // get scale and apply it into localPositions vectors
  const worldRel = relPrim ? _computeLocalToWorldTransform(relPrim) : new GfMatrix4d(1.0)

  // we need to apply scale to the localPose, the scale comes from the rigid
  // body
  let sc: GfVec3f
  // if we had a rel not to rigid body, we need to recompute the localPose
  if (relPrim?.path !== body?.path) {
    const localAnchor = new GfMatrix4d()
    localAnchor.setIdentity()
    localAnchor.setTranslate(new GfVec3d(pose.t))
    // SetRotateOnly(GfQuatd(*outQ))
    const qi = pose.q.GetImaginary()
    localAnchor.setRotateOnly([pose.q.GetReal(), qi.get(0), qi.get(1), qi.get(2)])

    let bodyMat: GfMatrix4d
    if (body) {
      bodyMat = _computeLocalToWorldTransform(body)
    } else {
      bodyMat = new GfMatrix4d()
      bodyMat.setIdentity()
    }

    const worldAnchor = localAnchor.getMultiply(worldRel)
    let bodyLocalAnchor = worldAnchor.getMultiply(bodyMat.getInverse())
    bodyLocalAnchor = bodyLocalAnchor.removeScaleShear() as GfMatrix4d

    pose.t = new GfVec3f(bodyLocalAnchor.extractTranslation())
    pose.q = _quatfFromQuat(bodyLocalAnchor.extractRotationQuat())
    pose.q.Normalize()

    const tr = new GfTransform(bodyMat)
    sc = new GfVec3f(tr.getScale())
  } else {
    const tr = new GfTransform(worldRel)
    sc = new GfVec3f(tr.getScale())
  }

  // apply the scale, this is not obvious, but in physics there is no scale,
  // so we need to apply it before its send to physics
  for (let i = 0; i < 3; i++) {
    pose.t.setComponent(i, pose.t.get(i) * sc.get(i))
  }

  return body ? body.path : ''
}

// Finalize joint desc (parseUtils.cpp:1031-1065)
function _finalizeJoint(jointPrim: Joint, outJointDesc: JointDesc): void {
  // joint bodies anchor point local transforms
  const pose0 = {
    t: _vec3f(_get(jointPrim.getLocalPos0Attr()), new GfVec3f(0.0)),
    q: _quatf(_get(jointPrim.getLocalRot0Attr()), new GfQuatf(1.0)),
  }
  const pose1 = {
    t: _vec3f(_get(jointPrim.getLocalPos1Attr()), new GfVec3f(0.0)),
    q: _quatf(_get(jointPrim.getLocalRot1Attr()), new GfQuatf(1.0)),
  }

  pose0.q.Normalize()
  pose1.q.Normalize()

  const stage = jointPrim.prim.getStage()

  // get scale and apply it into localPositions vectors
  if (outJointDesc.rel0 !== '') {
    outJointDesc.body0 = _getLocalPose(stage, outJointDesc.rel0, pose0)
  }

  if (outJointDesc.rel1 !== '') {
    outJointDesc.body1 = _getLocalPose(stage, outJointDesc.rel1, pose1)
  }

  outJointDesc.localPose0Position = pose0.t
  outJointDesc.localPose0Orientation = pose0.q
  outJointDesc.localPose1Position = pose1.t
  outJointDesc.localPose1Orientation = pose1.q
}

// Parse common joint parameters (parseUtils.cpp:1067-1089)
function _parseCommonJointDesc(jointPrim: Joint, outJointDesc: JointDesc): boolean {
  const prim = jointPrim.prim

  outJointDesc.primPath = prim.path

  // parse the joint common parameters
  outJointDesc.jointEnabled = _bool(_get(jointPrim.getJointEnabledAttr()), outJointDesc.jointEnabled)
  outJointDesc.collisionEnabled = _bool(_get(jointPrim.getCollisionEnabledAttr()), outJointDesc.collisionEnabled)
  outJointDesc.breakForce = _num(_get(jointPrim.getBreakForceAttr()), outJointDesc.breakForce)
  outJointDesc.breakTorque = _num(_get(jointPrim.getBreakTorqueAttr()), outJointDesc.breakTorque)
  outJointDesc.excludeFromArticulation =
    _bool(_get(jointPrim.getExcludeFromArticulationAttr()), outJointDesc.excludeFromArticulation)

  outJointDesc.rel0 = _getRel(jointPrim.getBody0Rel().getTargets())
  outJointDesc.rel1 = _getRel(jointPrim.getBody1Rel().getTargets())

  _finalizeJoint(jointPrim, outJointDesc)

  return true
}

// Parse distance joint desc (parseUtils.cpp:1091-1127)
function _parseDistanceJointDesc(prim: Prim, outDistanceJointDesc: DistanceJointDesc): boolean {
  const distanceJoint = new DistanceJoint(prim)
  if (distanceJoint.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(distanceJoint, outDistanceJointDesc)) {
      return false
    }

    outDistanceJointDesc.maxEnabled = false
    outDistanceJointDesc.minEnabled = false
    outDistanceJointDesc.limit.minDist = _num(_get(distanceJoint.getMinDistanceAttr()), outDistanceJointDesc.limit.minDist)
    outDistanceJointDesc.limit.maxDist = _num(_get(distanceJoint.getMaxDistanceAttr()), outDistanceJointDesc.limit.maxDist)

    if (outDistanceJointDesc.limit.minDist >= 0.0) {
      outDistanceJointDesc.minEnabled = true
    }
    if (outDistanceJointDesc.limit.maxDist >= 0.0) {
      outDistanceJointDesc.maxEnabled = true
    }
  } else {
    _codingError('Provided UsdPhysicsDistanceJoint or UsdPhysicsDistanceJointDesc is not valid.')
    return false
  }

  return true
}

// Parse joint drive (parseUtils.cpp:1129-1158)
function _parseDrive(drive: DriveAPI, outJointDrive: JointDrive): boolean {
  if (drive.isValid()) {
    outJointDrive.targetPosition = _num(_get(drive.getTargetPositionAttr()), outJointDrive.targetPosition)
    outJointDrive.targetVelocity = _num(_get(drive.getTargetVelocityAttr()), outJointDrive.targetVelocity)
    outJointDrive.forceLimit = _num(_get(drive.getMaxForceAttr()), outJointDrive.forceLimit)

    outJointDrive.damping = _num(_get(drive.getDampingAttr()), outJointDrive.damping)
    outJointDrive.stiffness = _num(_get(drive.getStiffnessAttr()), outJointDrive.stiffness)

    const typeToken = _str(_get(drive.getTypeAttr()), '')
    if (typeToken === UsdPhysicsTokens.acceleration) {
      outJointDrive.acceleration = true
    }
    outJointDrive.enabled = true
  } else {
    _codingError('Provided UsdPhysicsDriveAPI or UsdPhysicsJointDrive is not valid.')
    return false
  }

  return true
}

// Parse fixed joint desc (parseUtils.cpp:1160-1180)
function _parseFixedJointDesc(prim: Prim, outFixedJointDesc: FixedJointDesc): boolean {
  const fixedJoint = new FixedJoint(prim)
  if (fixedJoint.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(fixedJoint, outFixedJointDesc)) {
      return false
    }
  } else {
    _codingError('Provided UsdPhysicsFixedJoint or UsdPhysicsFixedJointDesc is not valid.')
    return false
  }

  return true
}

// Parse joint limit (parseUtils.cpp:1182-1206)
function _parseLimit(limit: LimitAPI, outJointLimit: JointLimit): boolean {
  if (limit.isValid()) {
    outJointLimit.lower = _num(_get(limit.getLowAttr()), outJointLimit.lower)
    outJointLimit.upper = _num(_get(limit.getHighAttr()), outJointLimit.upper)
    if ((Number.isFinite(outJointLimit.lower) &&
      outJointLimit.lower > -usdPhysicsSentinelLimit) ||
      (Number.isFinite(outJointLimit.upper) &&
        outJointLimit.upper < usdPhysicsSentinelLimit)) {
      outJointLimit.enabled = true
    }
  } else {
    _codingError('Provided UsdPhysicsLimitAPI or UsdPhysicsJointLimit is not valid.')
    return false
  }

  return true
}

// Parse generic D6 joint desc (parseUtils.cpp:1208-1274)
function _parseD6JointDesc(prim: Prim, outJointDesc: D6JointDesc): boolean {
  const jointPrim = new Joint(prim)
  if (jointPrim.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(jointPrim, outJointDesc)) {
      return false
    }

    // D6 joint
    const axisVector: Array<[JointDOF, string]> = [
      [JointDOF.Distance, UsdPhysicsTokens.distance],
      [JointDOF.TransX, UsdPhysicsTokens.transX],
      [JointDOF.TransY, UsdPhysicsTokens.transY],
      [JointDOF.TransZ, UsdPhysicsTokens.transZ],
      [JointDOF.RotX, UsdPhysicsTokens.rotX],
      [JointDOF.RotY, UsdPhysicsTokens.rotY],
      [JointDOF.RotZ, UsdPhysicsTokens.rotZ],
    ]

    for (let i = 0; i < axisVector.length; i++) {
      const axisToken = axisVector[i]![1]

      const limitAPI = LimitAPI.get(prim, axisToken)
      if (limitAPI.isValid()) {
        const limit = new JointLimit()
        if (_parseLimit(limitAPI, limit)) {
          outJointDesc.jointLimits.push([axisVector[i]![0], limit])
        }
      }

      const driveAPI = DriveAPI.get(prim, axisToken)
      if (driveAPI.isValid()) {
        const drive = new JointDrive()
        if (_parseDrive(driveAPI, drive)) {
          outJointDesc.jointDrives.push([axisVector[i]![0], drive])
        }
      }
    }
  } else {
    _codingError('Provided UsdPhysicsJoint or UsdPhysicsJointDesc is not valid.')
    return false
  }

  return true
}

// Parse custom joint desc (parseUtils.cpp:1276-1296)
function _parseCustomJointDesc(prim: Prim, outCustomJointDesc: CustomJointDesc): boolean {
  const jointPrim = new Joint(prim)
  if (jointPrim.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(jointPrim, outCustomJointDesc)) {
      return false
    }
  } else {
    _codingError('Provided UsdPhysicsJoint or UsdPhysicsJointDesc is not valid.')
    return false
  }

  return true
}

// Parse rigid body material desc (parseUtils.cpp:1298-1323)
function _parseRigidBodyMaterialDesc(prim: Prim, outRbMaterialDesc: RigidBodyMaterialDesc): boolean {
  if (prim.hasAPI(MaterialAPI.typeName)) {
    const usdMaterial = new MaterialAPI(prim)
    outRbMaterialDesc.dynamicFriction = _num(_get(usdMaterial.getDynamicFrictionAttr()), outRbMaterialDesc.dynamicFriction)
    outRbMaterialDesc.staticFriction = _num(_get(usdMaterial.getStaticFrictionAttr()), outRbMaterialDesc.staticFriction)

    outRbMaterialDesc.restitution = _num(_get(usdMaterial.getRestitutionAttr()), outRbMaterialDesc.restitution)

    outRbMaterialDesc.density = _num(_get(usdMaterial.getDensityAttr()), outRbMaterialDesc.density)

    outRbMaterialDesc.primPath = prim.path
  } else {
    _codingError('Provided UsdPhysicsMaterialAPI or UsdPhysicsRigidBodyMaterialDesc is not valid.')
    return false
  }
  return true
}

// Parse linear drive (parseUtils.cpp:1325-1337)
function _parseLinearDrive(usdPrim: Prim, outDst: JointDrive): boolean {
  outDst.enabled = false
  const driveAPI = DriveAPI.get(usdPrim, UsdPhysicsTokens.linear)
  if (driveAPI.isValid()) {
    return _parseDrive(driveAPI, outDst)
  }

  return true
}

function _jointAxis(attr: Attribute | undefined): Axis {
  let jointAxis = Axis.X
  const axis = _str(_get(attr), UsdPhysicsTokens.x)

  if (axis === UsdPhysicsTokens.y)
    jointAxis = Axis.Y
  else if (axis === UsdPhysicsTokens.z)
    jointAxis = Axis.Z
  return jointAxis
}

// Parse prismatic joint desc (parseUtils.cpp:1339-1387)
function _parsePrismaticJointDesc(prim: Prim, outPrismaticJointDesc: PrismaticJointDesc): boolean {
  const prismaticJoint = new PrismaticJoint(prim)
  if (prismaticJoint.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(prismaticJoint, outPrismaticJointDesc)) {
      return false
    }

    outPrismaticJointDesc.axis = _jointAxis(prismaticJoint.getAxisAttr())

    outPrismaticJointDesc.limit.enabled = false
    outPrismaticJointDesc.limit.lower = _num(_get(prismaticJoint.getLowerLimitAttr()), outPrismaticJointDesc.limit.lower)
    outPrismaticJointDesc.limit.upper = _num(_get(prismaticJoint.getUpperLimitAttr()), outPrismaticJointDesc.limit.upper)
    if ((Number.isFinite(outPrismaticJointDesc.limit.lower) &&
      (outPrismaticJointDesc.limit.lower > -usdPhysicsSentinelLimit)) ||
      (Number.isFinite(outPrismaticJointDesc.limit.upper) &&
        (outPrismaticJointDesc.limit.upper < usdPhysicsSentinelLimit))) {
      outPrismaticJointDesc.limit.enabled = true
    }

    if (!_parseLinearDrive(prim, outPrismaticJointDesc.drive)) {
      return false
    }
  } else {
    _codingError('Provided UsdPhysicsPrismaticJoint or UsdPhysicsPrismaticJointDesc is not valid.')
    return false
  }

  return true
}

// Parse angular drive (parseUtils.cpp:1389-1401)
function _parseAngularDrive(usdPrim: Prim, outDst: JointDrive): boolean {
  outDst.enabled = false
  const driveAPI = DriveAPI.get(usdPrim, UsdPhysicsTokens.angular)
  if (driveAPI.isValid()) {
    return _parseDrive(driveAPI, outDst)
  }

  return true
}

// Parse revolute joint desc (parseUtils.cpp:1404-1452)
function _parseRevoluteJointDesc(prim: Prim, outRevoluteJointDesc: RevoluteJointDesc): boolean {
  const revoluteJoint = new RevoluteJoint(prim)
  if (revoluteJoint.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(revoluteJoint, outRevoluteJointDesc)) {
      return false
    }

    outRevoluteJointDesc.axis = _jointAxis(revoluteJoint.getAxisAttr())

    outRevoluteJointDesc.limit.enabled = false

    outRevoluteJointDesc.limit.lower = _num(_get(revoluteJoint.getLowerLimitAttr()), outRevoluteJointDesc.limit.lower)
    outRevoluteJointDesc.limit.upper = _num(_get(revoluteJoint.getUpperLimitAttr()), outRevoluteJointDesc.limit.upper)
    if (Number.isFinite(outRevoluteJointDesc.limit.lower) &&
      Number.isFinite(outRevoluteJointDesc.limit.upper) &&
      outRevoluteJointDesc.limit.lower > -usdPhysicsSentinelLimit &&
      outRevoluteJointDesc.limit.upper < usdPhysicsSentinelLimit) {
      outRevoluteJointDesc.limit.enabled = true
    }

    if (!_parseAngularDrive(prim, outRevoluteJointDesc.drive)) {
      return false
    }
  } else {
    _codingError('Provided UsdPhysicsJoint or UsdPhysicsJointDesc is not valid.')
    return false
  }

  return true
}

// Compute the rigid body transformation and store to the desc
// (parseUtils.cpp:1454-1469)
function _getRigidBodyTransformation(bodyPrim: Prim, outDesc: RigidBodyDesc): void {
  const mat = _computeLocalToWorldTransform(bodyPrim)
  const tr = new GfTransform(mat)
  const pos = tr.getTranslation()
  const rot = rotationToQuat(tr.getRotation())
  const sc = tr.getScale()

  outDesc.position = new GfVec3f(pos)
  outDesc.rotation = _quatfFromQuat(rot)
  outDesc.scale = new GfVec3f(sc)
}

// Parse rigid body desc (parseUtils.cpp:1471-1516)
function _parseRigidBodyDesc(prim: Prim, outRigidBodyDesc: RigidBodyDesc): boolean {
  if (prim.hasAPI(RigidBodyAPI.typeName)) {
    const rigidBodyAPI = new RigidBodyAPI(prim)
    // transformation
    _getRigidBodyTransformation(prim, outRigidBodyDesc)

    // filteredPairs
    _parseFilteredPairs(prim, outRigidBodyDesc.filteredCollisions)

    // velocity
    outRigidBodyDesc.linearVelocity = _vec3f(_get(rigidBodyAPI.getVelocityAttr()), outRigidBodyDesc.linearVelocity)
    outRigidBodyDesc.angularVelocity = _vec3f(_get(rigidBodyAPI.getAngularVelocityAttr()), outRigidBodyDesc.angularVelocity)

    // rigid body flags
    outRigidBodyDesc.rigidBodyEnabled = _bool(_get(rigidBodyAPI.getRigidBodyEnabledAttr()), outRigidBodyDesc.rigidBodyEnabled)
    outRigidBodyDesc.kinematicBody = _bool(_get(rigidBodyAPI.getKinematicEnabledAttr()), outRigidBodyDesc.kinematicBody)
    outRigidBodyDesc.startsAsleep = _bool(_get(rigidBodyAPI.getStartsAsleepAttr()), outRigidBodyDesc.startsAsleep)

    // simulation owner
    const owners = rigidBodyAPI.getSimulationOwnerRel().getTargets()
    if (owners.length !== 0) {
      outRigidBodyDesc.simulationOwners = owners
    }
    outRigidBodyDesc.primPath = prim.path
  } else {
    _codingError('Provided UsdPhysicsRigidBodyAPI or UsdPhysicsRigidBodyDesc is not valid.')
    return false
  }
  return true
}

// Parse spherical joint desc (parseUtils.cpp:1518-1562)
function _parseSphericalJointDesc(prim: Prim, outSphericalJointDesc: SphericalJointDesc): boolean {
  const sphericalJoint = new SphericalJoint(prim)
  if (sphericalJoint.isValid()) {
    // parse the joint common parameters
    if (!_parseCommonJointDesc(sphericalJoint, outSphericalJointDesc)) {
      return false
    }

    outSphericalJointDesc.axis = _jointAxis(sphericalJoint.getAxisAttr())

    outSphericalJointDesc.limit.enabled = false
    outSphericalJointDesc.limit.angle0 = _num(_get(sphericalJoint.getConeAngle0LimitAttr()), outSphericalJointDesc.limit.angle0)
    outSphericalJointDesc.limit.angle1 = _num(_get(sphericalJoint.getConeAngle1LimitAttr()), outSphericalJointDesc.limit.angle1)

    if (Number.isFinite(outSphericalJointDesc.limit.angle0) &&
      Number.isFinite(outSphericalJointDesc.limit.angle1) &&
      outSphericalJointDesc.limit.angle0 >= 0.0 &&
      outSphericalJointDesc.limit.angle1 >= 0.0) {
      outSphericalJointDesc.limit.enabled = true
    }
  } else {
    _codingError('Provided UsdPhysicsSphericalJoint or UsdPhysicsSphericalJointDesc is not valid.')
    return false
  }

  return true
}

// Parse scene desc (parseUtils.cpp:1564-1608)
function _parseSceneDesc(prim: Prim, outSceneDesc: SceneDesc): boolean {
  const scene = new Scene(prim)
  if (scene.isValid()) {
    const stage = prim.getStage()

    let gravityDirection = _vec3f(_get(scene.getGravityDirectionAttr()), new GfVec3f(0.0))
    if (gravityDirection.equals(new GfVec3f(0.0))) {
      const upAxis = getStageUpAxis(stage)
      if ((upAxis as string) === 'X')
        gravityDirection = new GfVec3f(-1.0, 0.0, 0.0)
      else if (upAxis === 'Y')
        gravityDirection = new GfVec3f(0.0, -1.0, 0.0)
      else
        gravityDirection = new GfVec3f(0.0, 0.0, -1.0)
    } else {
      gravityDirection.Normalize()
    }

    let gravityMagnitude = _num(_get(scene.getGravityMagnitudeAttr()), -Infinity)
    if (gravityMagnitude < -infSentinel) {
      const metersPerUnit = f(getStageMetersPerUnit(stage))
      gravityMagnitude = f(defaultGravity / metersPerUnit)
    }

    outSceneDesc.gravityMagnitude = gravityMagnitude
    outSceneDesc.gravityDirection = gravityDirection
    outSceneDesc.primPath = prim.path
  } else {
    _codingError('Provided UsdPhysicsScene or UsdPhysicsSceneDesc is not valid.')
    return false
  }
  return true
}

// Helper flags to store APIs (parseUtils.cpp:1610-1617)
const _SchemaAPIFlag = {
  ArticulationRootAPI: 1 << 0,
  CollisionAPI: 1 << 1,
  RigidBodyAPI: 1 << 2,
  MaterialAPI: 1 << 3,
} as const

// parseUtils.cpp:1619
type RigidBodyMap = Map<string, RigidBodyDesc>

// Check if body is dynamic accessing parsed data (parseUtils.cpp:1621-1639)
function _isDynamicBody(usdPrim: Prim, bodyMap: RigidBodyMap, outPhysicsAPIFound: { value: boolean }): boolean {
  const it = bodyMap.get(usdPrim.path)
  if (it !== undefined) {
    const isAPISchemaEnabled = it.rigidBodyEnabled

    // Prim is dynamic body off PhysicsAPI is present and enabled
    outPhysicsAPIFound.value = true
    return isAPISchemaEnabled
  }

  outPhysicsAPIFound.value = false
  return false
}

// Check if prim has a dynamic body as a parent (parseUtils.cpp:1641-1670)
function _hasDynamicBodyParent(usdPrim: Prim, bodyMap: RigidBodyMap, outBodyPrim: { value: Prim | undefined }): boolean {
  const physicsAPIFound = { value: false }
  let parent: Prim | undefined = usdPrim
  const stage = usdPrim.getStage()
  while (parent && parent.path !== '/') {
    if (_isDynamicBody(parent, bodyMap, physicsAPIFound)) {
      outBodyPrim.value = parent
      return true
    }

    if (physicsAPIFound.value) {
      // A disabled rigid body takes no part in simulation and owns no
      // colliders. Keep searching the ancestors: a nested disabled body
      // may still have an enabled body above it, which this prim
      // belongs to.
      parent = stage.getPrim(_parentPath(parent.path))
      continue
    }

    parent = stage.getPrim(_parentPath(parent.path))
  }

  // No enabled body above this prim, so it is a static collision.
  return false
}

// Helper function to process descriptors (parseUtils.cpp:1672-1699).
// WorkParallelForN runs sequentially here.
function _processPhysicsPrims<DescType extends ObjectDesc>(physicsPrims: readonly Prim[],
  physicsDesc: DescType[], makeDesc: () => DescType,
  processDescFn: (prim: Prim, desc: DescType) => boolean): void {
  if (physicsPrims.length !== 0) {
    const numPrims = physicsPrims.length
    physicsDesc.length = 0
    for (let i = 0; i < numPrims; i++) physicsDesc.push(makeDesc())

    for (let i = 0; i < numPrims; i++) {
      const ret = processDescFn(physicsPrims[i]!, physicsDesc[i]!)
      if (!ret) {
        physicsDesc[i]!.isValid = false
      }
    }
  }
}

// Helper function to call report function (parseUtils.cpp:1701-1720)
function _callReportFn<DescType extends ObjectDesc>(descType: ObjectType, physicsPrims: readonly Prim[],
  physicsDesc: readonly DescType[], reportFn: ReportFn, userData: unknown): void {
  if (physicsPrims.length !== 0 && physicsPrims.length === physicsDesc.length) {
    const primPathsVector = physicsPrims.map(prim => prim.path)
    reportFn(descType, primPathsVector, physicsDesc, userData)
  }
}

// Swap-with-back removal shared by the _Check*SimulationOwner helpers.
function _removeAt<A, B>(a: A[], b: B[], i: number): void {
  a[i] = a[a.length - 1]!
  a.pop()
  b[i] = b[b.length - 1]!
  b.pop()
}

// parseUtils.cpp:1723-1763
function _checkRigidBodySimulationOwner(rigidBodyPrims: Prim[], rigidBodyDescs: RigidBodyDesc[],
  defaultSimulationOwner: boolean, simulationOwnersSet: Set<string>, outReportedBodies: Set<string>): void {
  for (let i = rigidBodyDescs.length; i--;) {
    let ownerFound = false
    const desc = rigidBodyDescs[i]!
    if (desc.isValid) {
      if (desc.simulationOwners.length === 0 && defaultSimulationOwner) {
        outReportedBodies.add(desc.primPath)
        ownerFound = true
      } else {
        for (const owner of desc.simulationOwners) {
          if (simulationOwnersSet.has(owner)) {
            outReportedBodies.add(desc.primPath)
            ownerFound = true
            break
          }
        }
      }
    }
    if (!ownerFound) {
      _removeAt(rigidBodyDescs, rigidBodyPrims, i)
    }
  }
}

// if collision belongs to a body that we care about include it
// if collision does not belong to a body we care about its not included
// if collision does not have a body set, we check its own simulationOwners
// (parseUtils.cpp:1765-1847; the redundant inner branch of the body case
// always ends with ownerFound = true, parseUtils.cpp:1784-1813).
function _checkCollisionSimulationOwner<DescType extends ShapeDesc>(collisionPrims: Prim[], shapeDesc: DescType[],
  defaultSimulationOwner: boolean, rigidBodiesSet: Set<string>, simulationOwnersSet: Set<string>): void {
  for (let i = shapeDesc.length; i--;) {
    let ownerFound = false
    const desc = shapeDesc[i]!
    if (desc.isValid) {
      if (desc.rigidBody !== '' && rigidBodiesSet.has(desc.rigidBody)) {
        ownerFound = true
      } else {
        if (desc.rigidBody === '') {
          if (desc.simulationOwners.length === 0 && defaultSimulationOwner) {
            ownerFound = true
          } else {
            for (const owner of desc.simulationOwners) {
              if (simulationOwnersSet.has(owner)) {
                ownerFound = true
                break
              }
            }
          }
        }
      }
    }

    if (!ownerFound) {
      _removeAt(shapeDesc, collisionPrims, i)
    }
  }
}

// Both bodies need to have simulation owners valid (parseUtils.cpp:1849-1881)
function _checkJointSimulationOwner<DescType extends JointDesc>(jointPrims: Prim[], jointDesc: DescType[],
  _defaultSimulationOwner: boolean, rigidBodiesSet: Set<string>, _simulationOwnersSet: Set<string>): void {
  for (let i = jointDesc.length; i--;) {
    const desc = jointDesc[i]!

    let ownersValid = false
    if (desc.isValid) {
      if ((desc.body0 === '' || rigidBodiesSet.has(desc.body0)) &&
        (desc.body1 === '' || rigidBodiesSet.has(desc.body1))) {
        ownersValid = true
      }
    }

    if (!ownersValid) {
      _removeAt(jointDesc, jointPrims, i)
    }
  }
}

// all bodies must have valid owner (parseUtils.cpp:1883-1916)
function _checkArticulationSimulationOwner(articulationPrims: Prim[], articulationDescs: ArticulationDesc[],
  _defaultSimulationOwner: boolean, rigidBodiesSet: Set<string>, _simulationOwnersSet: Set<string>): void {
  for (let i = articulationDescs.length; i--;) {
    const desc = articulationDescs[i]!

    let ownersValid = true
    if (desc.isValid) {
      for (const body of desc.articulatedBodies) {
        if (body !== '' && !rigidBodiesSet.has(body)) {
          ownersValid = false
          break
        }
      }
    }

    if (!ownersValid) {
      _removeAt(articulationDescs, articulationPrims, i)
    }
  }
}

// Get body for the usdPrim can be a parent (parseUtils.cpp:1918-1929)
function _getRigidBody(usdPrim: Prim, bodyMap: RigidBodyMap): string {
  const bodyPrim = { value: undefined as Prim | undefined }
  if (_hasDynamicBodyParent(usdPrim, bodyMap, bodyPrim)) {
    return bodyPrim.value!.path
  }

  // No enabled body above the collision, so it is a static collision.
  return ''
}

// Compute the relative pose between the collision and the rigid body
// (parseUtils.cpp:1931-1979). `bodyPrim` undefined is the pseudo-root, whose
// local-to-world transform is the identity.
function _getCollisionShapeLocalTransfrom(collisionPrim: Prim, bodyPrim: Prim | undefined, outDesc: ShapeDesc): void {
  // body transform
  const bodyLocalToWorldMatrix = bodyPrim ? _computeLocalToWorldTransform(bodyPrim) : new GfMatrix4d(1.0)

  // compute the shape rel transform to a body and store it.
  let localPos = new GfVec3f(0.0)
  if (collisionPrim.path !== bodyPrim?.path) {
    const collisionLocalToWorldMatrix = _computeLocalToWorldTransform(collisionPrim)

    const mat = collisionLocalToWorldMatrix.getMultiply(bodyLocalToWorldMatrix.getInverse())
    const colLocalTransform = new GfTransform(mat)

    localPos = new GfVec3f(colLocalTransform.getTranslation())
    outDesc.localRot = _quatfFromQuat(rotationToQuat(colLocalTransform.getRotation()))
    outDesc.localScale = new GfVec3f(colLocalTransform.getScale())
  } else {
    outDesc.localRot = new GfQuatf(1.0)
    outDesc.localScale = new GfVec3f(1.0)
  }

  // now apply the body scale to localPos
  // physics does not support scales, so a rigid body scale has to be baked
  // into the localPos
  const tr = new GfTransform(bodyLocalToWorldMatrix)
  const sc = tr.getScale()

  for (let i = 0; i < 3; i++) {
    localPos.setComponent(i, localPos.get(i) * f(sc.get(i)))
  }

  outDesc.localPos = localPos
}

// Finalize the collision, requires the bodies (parseUtils.cpp:1981-1998)
function _finalizeCollision(stage: Stage, bodyDesc: RigidBodyDesc | undefined, outShapeDesc: ShapeDesc): void {
  // get shape local pose
  const shapePrim = stage.getPrim(outShapeDesc.primPath)!
  _getCollisionShapeLocalTransfrom(
    shapePrim,
    bodyDesc ? stage.getPrim(bodyDesc.primPath) : undefined,
    outShapeDesc)

  if (bodyDesc) {
    outShapeDesc.rigidBody = bodyDesc.primPath
  }
}

// Finalize the collision descs (parseUtils.cpp:2000-2080)
function _finalizeCollisionDescs<DescType extends ShapeDesc>(physicsPrims: readonly Prim[],
  physicsDesc: DescType[], bodyMap: RigidBodyMap, collisionGroups: Map<string, Set<string>>): void {
  // Collect (body, collision path) pairs, merged into bodyDesc->collisions
  // after the loop.
  const bodyCollisionPairs: Array<[RigidBodyDesc, string]> = []
  const sortedGroups = _sortedEntries(collisionGroups)

  for (let i = 0; i < physicsPrims.length; i++) {
    const colDesc = physicsDesc[i]!
    if (colDesc.isValid) {
      const prim = physicsPrims[i]!
      // get the body
      const bodyPath = _getRigidBody(prim, bodyMap)
      let bodyDesc: RigidBodyDesc | undefined = undefined
      if (bodyPath !== '') {
        const bodyIt = bodyMap.get(bodyPath)
        if (bodyIt !== undefined) {
          bodyDesc = bodyIt
          bodyCollisionPairs.push([bodyDesc, colDesc.primPath])
        }
      }

      // check if collision belongs to collision groups
      for (const [groupPath, members] of sortedGroups) {
        if (members.has(colDesc.primPath)) {
          colDesc.collisionGroups.push(groupPath)
        }
      }

      // finalize the collision, fill up the local transform etc
      _finalizeCollision(prim.getStage(), bodyDesc, colDesc)
    }
  }

  // Merge into bodyDesc->collisions. Sort by body path so all collisions for
  // the same body are consecutive and by collision path for deterministic
  // ordering.
  if (bodyCollisionPairs.length !== 0) {
    bodyCollisionPairs.sort((a, b) => {
      const c = _pathCompare(a[0].primPath, b[0].primPath)
      if (c !== 0) return c
      return _pathCompare(a[1], b[1])
    })
    for (const pair of bodyCollisionPairs) {
      pair[0].collisions.push(pair[1])
    }
  }
}

// parseUtils.cpp:2082-2090
interface ArticulationLink {
  children: string[]
  rootJoint: string
  weight: number
  index: number
  hasFixedJoint: boolean
  joints: string[]
}

// parseUtils.cpp:2092-2096
type ArticulationLinkMap = Map<string, ArticulationLink>
type BodyJointMap = Map<string, JointDesc[]>
type JointMap = Map<string, JointDesc>
type ArticulationMap = Map<string, ArticulationDesc>

// parseUtils.cpp:2098-2110
function _isInLinkMap(path: string, linkMaps: ReadonlyArray<[string, ArticulationLinkMap]>): boolean {
  for (let i = 0; i < linkMaps.length; i++) {
    if (linkMaps[i]![1].has(path))
      return true
  }

  return false
}

// Recursive traversal of the hierarchy, adding weight for the links based on number
// of children and if it belongs to a joint to world
// Each child adds 100 weight, while if link belongs to a MC joint it adds 1000 weight
// if link belong to a joint to world it adds 10000 weight. The weight is used
// if an articulation root has to be decided automatically.
// (parseUtils.cpp:2112-2178)
function _traverseHierarchy(linkPath: string, articulationLinkMap: ArticulationLinkMap,
  bodyJointMap: BodyJointMap, index: { value: number }, outLinkOrderVector: string[]): void {
  // check if we already parsed this link
  if (articulationLinkMap.has(linkPath))
    return

  outLinkOrderVector.push(linkPath)

  const bjIt = bodyJointMap.get(linkPath)
  if (bjIt !== undefined) {
    const link: ArticulationLink = {
      children: [], rootJoint: '', weight: 0, index: index.value++, hasFixedJoint: false, joints: [],
    }
    articulationLinkMap.set(linkPath, link)
    const joints = bjIt
    for (let i = 0; i < joints.length; i++) {
      const desc = joints[i]!
      link.joints.push(desc.primPath)
      if (desc.body0 === '' ||
        !bodyJointMap.has(desc.body0) ||
        desc.body1 === '' ||
        !bodyJointMap.has(desc.body1)) {
        if (desc.excludeFromArticulation) {
          link.weight += 1000
        } else {
          link.weight += 100000
          link.rootJoint = desc.primPath
          link.hasFixedJoint = true
        }
        link.children.push('')
      } else {
        if (desc.excludeFromArticulation) {
          link.children.push(desc.body0 === linkPath ? desc.body1 : desc.body0)
          link.weight += 1000
        } else {
          link.children.push(desc.body0 === linkPath ? desc.body1 : desc.body0)
          link.weight += 100
          _traverseHierarchy(link.children[link.children.length - 1]!,
            articulationLinkMap, bodyJointMap, index, outLinkOrderVector)
        }
      }
    }
  }
}

// Traversal that marks distances, this is used for finding the center of the graph
// (parseUtils.cpp:2180-2202)
function _traverseChilds(link: ArticulationLink, map: ArticulationLinkMap, startIndex: number,
  distance: number, pathMatrix: Int32Array): void {
  const mapSize = map.size
  const currentIndex = link.index
  pathMatrix[startIndex + currentIndex * mapSize] = distance

  for (let i = 0; i < link.children.length; i++) {
    const it = map.get(link.children[i]!)
    if (it !== undefined) {
      const childIndex = it.index
      if (pathMatrix[startIndex + childIndex * mapSize]! < 0) {
        _traverseChilds(it, map, startIndex, distance + 1, pathMatrix)
      }
    }
  }
}

// If all links are nested under the topPath return the topPath
// else return an empty path, signifying the articulation is not nested
// (parseUtils.cpp:2204-2237)
function _isNestedArticulation(topPath: string, map: ArticulationLinkMap): string {
  let nestedBodies = true
  for (const [linkPath] of _sortedEntries(map)) {
    let parentFound = false
    // SdfPath::GetAncestorsRange: the path itself, then each ancestor.
    for (let p = linkPath; ; p = _parentPath(p)) {
      if (p === topPath) {
        parentFound = true
        break
      }
      if (p === '/') break
    }

    if (!parentFound) {
      nestedBodies = false
      break
    }
  }

  if (nestedBodies) {
    return topPath
  }

  return ''
}

// Get the center of graph (parseUtils.cpp:2239-2313)
function _getCenterOfGraph(map: ArticulationLinkMap, linkOrderVector: readonly string[]): string {
  const size = map.size
  const pathMatrix = new Int32Array(size * size).fill(-1)

  const entries = _sortedEntries(map)
  for (const [, link] of entries) {
    const startIndex = link.index
    const distance = 0
    _traverseChilds(link, map, startIndex, distance, pathMatrix)
  }

  let shortestDistance = 2147483647 // INT_MAX
  let numChilds = 0
  let primpath = ''
  for (const [refPath, link] of entries) {
    const startIndex = link.index
    let longestPath = 0
    for (let i = 0; i < size; i++) {
      if (pathMatrix[startIndex + i * size]! > longestPath) {
        longestPath = pathMatrix[startIndex + i * size]!
      }
    }

    // this needs to be deterministic, get the shortest path if there are
    // more paths with same length, pick the one with more children if there
    // are more with same path and same amount of children, pick the one
    // with lowest hash The lowest hash is not right, this is wrong, it has
    // to be the first link ordered by the traversal
    if (longestPath < shortestDistance) {
      shortestDistance = longestPath
      numChilds = link.children.length
      primpath = refPath
    } else if (longestPath === shortestDistance) {
      if (numChilds < link.children.length) {
        numChilds = link.children.length
        primpath = refPath
      } else if (numChilds === link.children.length) {
        for (const orderPath of linkOrderVector) {
          if (orderPath === primpath) {
            break
          } else if (orderPath === refPath) {
            primpath = refPath
          }
        }
      }
    }
  }

  return primpath
}

// Finalize articulations (parseUtils.cpp:2315-2537). WorkParallelForEach
// runs sequentially here.
function _finalizeArticulations(stage: Stage, articulationMap: ArticulationMap,
  rigidBodyMap: RigidBodyMap, jointMap: JointMap): void {
  const bodyJointMap: BodyJointMap = new Map()
  if (articulationMap.size !== 0) {
    // construct the BodyJointMap
    for (const [, desc] of _sortedEntries(jointMap)) {
      if (desc.jointEnabled) {
        if (desc.body0 !== '') {
          const fit = rigidBodyMap.get(desc.body0)
          if (fit !== undefined && fit.rigidBodyEnabled) {
            if (!bodyJointMap.has(desc.body0)) bodyJointMap.set(desc.body0, [])
            bodyJointMap.get(desc.body0)!.push(desc)
          }
        }
        if (desc.body1 !== '') {
          const fit = rigidBodyMap.get(desc.body1)
          if (fit !== undefined && fit.rigidBodyEnabled) {
            if (!bodyJointMap.has(desc.body1)) bodyJointMap.set(desc.body1, [])
            bodyJointMap.get(desc.body1)!.push(desc)
          }
        }
      }
    }
  }

  // first get user defined articulation roots
  // then search for the best root in the articulation hierarchy
  const workLambda = (articulationPath: string, articulationDesc: ArticulationDesc): void => {
    const articulationLinkOrderVector: string[] = []

    let articulationBaseLinkPath = articulationPath

    const articulatedJoints = new Set<string>()
    const articulatedBodies = new Set<string>()

    // check if its a floating articulation
    {
      if (rigidBodyMap.has(articulationPath)) {
        articulationDesc.rootPrims.push(articulationPath)
      } else {
        const jointDesc = jointMap.get(articulationPath)
        if (jointDesc !== undefined) {
          const jointPath = articulationPath
          if (jointDesc.body0 === '' || jointDesc.body1 === '') {
            articulationDesc.rootPrims.push(jointPath)
            articulationBaseLinkPath = jointDesc.body0 === '' ? jointDesc.body1 : jointDesc.body0
          }
        }
      }
    }

    // search through the hierarchy for the best root
    const articulationPrim = stage.getPrim(articulationBaseLinkPath)
    if (!articulationPrim)
      return
    const range = PrimRange.fromPrim(articulationPrim, TraverseInstanceProxies())
    const articulationLinkMaps: Array<[string, ArticulationLinkMap]> = []
    articulationLinkOrderVector.length = 0

    const iter = range[Symbol.iterator]()
    for (let r = iter.next(); !r.done; r = iter.next()) {
      const prim = r.value
      if (!prim)
        continue
      const primPath = prim.path
      if (_isInLinkMap(primPath, articulationLinkMaps)) {
        iter.pruneChildren() // Skip the subtree rooted at this prim
        continue
      }

      if (rigidBodyMap.has(primPath)) {
        articulationLinkMaps.push([primPath, new Map()])
        const index = { value: 0 }
        _traverseHierarchy(primPath, articulationLinkMaps[articulationLinkMaps.length - 1]![1],
          bodyJointMap, index, articulationLinkOrderVector)
      }
    }

    if (articulationDesc.rootPrims.length === 0) {
      for (let i = 0; i < articulationLinkMaps.length; i++) {
        const map = articulationLinkMaps[i]![1]
        let linkPath = ''
        let largestWeight = 0
        let hasFixedJoint = false
        for (const [linkItPath, link] of _sortedEntries(map)) {
          if (link.hasFixedJoint) {
            hasFixedJoint = true
          }
          if (link.weight > largestWeight) {
            linkPath = (link.rootJoint !== '') ? link.rootJoint : linkItPath
            largestWeight = link.weight
          } else if (link.weight === largestWeight) {
            const optionalLinkPath = (link.rootJoint !== '') ? link.rootJoint : linkItPath
            for (const orderPath of articulationLinkOrderVector) {
              if (orderPath === linkPath) {
                break
              } else if (orderPath === optionalLinkPath) {
                linkPath = optionalLinkPath
              }
            }
          }

          for (let j = link.joints.length; j--;) {
            articulatedJoints.add(link.joints[j]!)
          }
        }

        // for floating articulation lets find the body with the
        // shortest paths (top node in the nested articulation chain or
        // center of graph)
        if (!hasFixedJoint) {
          // check if we have articulation defined by nesting,
          // then we pick the first body of the chain
          linkPath = _isNestedArticulation(articulationLinkMaps[i]![0], map)
          if (linkPath === '') {
            linkPath = _getCenterOfGraph(map, articulationLinkOrderVector)
          }
        }

        if (linkPath !== '') {
          articulationDesc.rootPrims.push(linkPath)
        }
      }
    } else {
      for (let i = 0; i < articulationLinkMaps.length; i++) {
        const map = articulationLinkMaps[i]![1]
        for (const [, link] of map) {
          for (let j = link.joints.length; j--;) {
            articulatedJoints.add(link.joints[j]!)
          }
        }
      }
    }
    for (let i = 0; i < articulationLinkMaps.length; i++) {
      const map = articulationLinkMaps[i]![1]
      for (const [, link] of map) {
        for (const child of link.children) articulatedBodies.add(child)
      }
    }

    if (articulationDesc.rootPrims.length === 0) {
      articulationDesc.isValid = false
    }

    for (const p of _sortedPaths(articulatedJoints)) {
      articulationDesc.articulatedJoints.push(p)
    }
    for (const p of _sortedPaths(articulatedBodies)) {
      articulationDesc.articulatedBodies.push(p)
    }
  }

  for (const [path, desc] of _sortedEntries(articulationMap)) {
    workLambda(path, desc)
  }
}

// Load USD physics from a given range (parseUtils.h:64-104,
// parseUtils.cpp:2539-3354). Returns true if the load was successful.
export function loadStageFromPrimRange(
  stage: Stage,
  includePaths: readonly string[],
  reportFn: ReportFn,
  userData: unknown,
  excludePaths?: readonly string[],
  customPhysicsTokens?: CustomTokens,
  simulationOwners?: readonly string[],
): boolean {
  const retVal = true

  if (!stage) {
    _codingError('Provided stage not valid.')
    return false
  }

  if (!reportFn) {
    _codingError('Provided report callback is not valid.')
    return false
  }

  if (includePaths.length === 0) {
    _codingError('No include path provided, nothing to parse.')
    return false
  }

  const scenePrims: Prim[] = []
  const collisionGroupPrims: Prim[] = []
  const materialPrims: Prim[] = []
  const articulationPrims: Prim[] = []
  const articulationPathsSet = new Set<string>()
  const physicsD6JointPrims: Prim[] = []
  const physicsRevoluteJointPrims: Prim[] = []
  const physicsFixedJointPrims: Prim[] = []
  const physicsPrismaticJointPrims: Prim[] = []
  const physicsSphericalJointPrims: Prim[] = []
  const physicsDistanceJointPrims: Prim[] = []
  const physicsCustomJointPrims: Prim[] = []
  const collisionPrims: Prim[] = []
  const rigidBodyPrims: Prim[] = []

  const excludePathsSet = new Set<string>()
  if (excludePaths && excludePaths.length !== 0) {
    for (const p of excludePaths) {
      excludePathsSet.add(p)
    }
  }

  const gRigidBodyAPIToken = 'PhysicsRigidBodyAPI'
  const gCollisionAPIToken = 'PhysicsCollisionAPI'
  const gArticulationRootAPIToken = 'PhysicsArticulationRootAPI'
  const gMaterialAPIToken = 'PhysicsMaterialAPI'

  let defaultSimulationOwner = false
  const simulationOwnersSet = new Set<string>()
  if (simulationOwners) {
    for (const p of simulationOwners) {
      if (p === '') {
        defaultSimulationOwner = true
      } else {
        simulationOwnersSet.add(p)
      }
    }
  }

  for (const includePath of includePaths) {
    const includePrim = stage.getPrim(includePath)
    if (!includePrim) continue
    const includePrimRange = PrimRange.fromPrim(includePrim, TraverseInstanceProxies())

    const iter = includePrimRange[Symbol.iterator]()
    for (let r = iter.next(); !r.done; r = iter.next()) {
      const prim = r.value
      if (!prim) {
        iter.pruneChildren()
        continue
      }

      if (excludePathsSet.size !== 0 && excludePathsSet.has(prim.path)) {
        iter.pruneChildren()
        continue
      }

      const typeInfo = prim.getPrimTypeInfo()

      let apiFlags = 0

      // Here we need to get the applied schemas to get schemas
      // that are also inherited.
      const apis = prim.getAppliedSchemas()

      for (const token of apis) {
        if (token === gArticulationRootAPIToken) {
          apiFlags |= _SchemaAPIFlag.ArticulationRootAPI
        }
        if (token === gCollisionAPIToken) {
          apiFlags |= _SchemaAPIFlag.CollisionAPI
        }
        if (token === gRigidBodyAPIToken) {
          apiFlags |= _SchemaAPIFlag.RigidBodyAPI
        }
        if (!apiFlags && token === gMaterialAPIToken) {
          apiFlags |= _SchemaAPIFlag.MaterialAPI
        }
      }

      // typeInfo.GetSchemaType().IsA<T>() is UsdPrim::IsA<T>().
      if (prim.isA('PointInstancer')) {
        // Skip the subtree for point instancers, those have to be
        // traversed per prototype
        iter.pruneChildren()
      } else if (customPhysicsTokens && customPhysicsTokens.instancerTokens.length !== 0) {
        for (const instToken of customPhysicsTokens.instancerTokens) {
          if (instToken === typeInfo.getTypeName()) {
            // Skip the subtree for custom
            // instancers, those have to be traversed per prototype
            iter.pruneChildren()
            break
          }
        }
      }

      if (prim.isA(Scene.typeName)) {
        scenePrims.push(prim)
      } else if (prim.isA(CollisionGroup.typeName)) {
        collisionGroupPrims.push(prim)
      } else if (apiFlags & _SchemaAPIFlag.MaterialAPI) {
        materialPrims.push(prim)
      } else if (prim.isA(Joint.typeName)) {
        if (prim.isA(FixedJoint.typeName)) {
          physicsFixedJointPrims.push(prim)
        } else if (prim.isA(RevoluteJoint.typeName)) {
          physicsRevoluteJointPrims.push(prim)
        } else if (prim.isA(PrismaticJoint.typeName)) {
          physicsPrismaticJointPrims.push(prim)
        } else if (prim.isA(SphericalJoint.typeName)) {
          physicsSphericalJointPrims.push(prim)
        } else if (prim.isA(DistanceJoint.typeName)) {
          physicsDistanceJointPrims.push(prim)
        } else {
          let customJoint = false
          if (customPhysicsTokens) {
            const primType = typeInfo.getTypeName()
            for (let i = 0; i < customPhysicsTokens.jointTokens.length; i++) {
              if (primType === customPhysicsTokens.jointTokens[i]) {
                customJoint = true
                break
              }
            }
          }

          if (customJoint) {
            physicsCustomJointPrims.push(prim)
          } else {
            physicsD6JointPrims.push(prim)
          }
        }

        // can be articulation definition
        if (apiFlags & _SchemaAPIFlag.ArticulationRootAPI) {
          articulationPrims.push(prim)
          articulationPathsSet.add(prim.path)
        }
      } else {
        if (apiFlags & _SchemaAPIFlag.CollisionAPI) {
          collisionPrims.push(prim)
        }
        if (apiFlags & _SchemaAPIFlag.RigidBodyAPI) {
          rigidBodyPrims.push(prim)
        }
        if (apiFlags & _SchemaAPIFlag.ArticulationRootAPI) {
          articulationPrims.push(prim)
          articulationPathsSet.add(prim.path)
        }
      }
    }
  }

  // process parsing
  //
  // Scenes
  const sceneDescs: SceneDesc[] = []

  // is simulation owners provided, restrict scenes to just the one specified
  if (simulationOwners) {
    for (let i = scenePrims.length; i--;) {
      const primPath = scenePrims[i]!.path
      if (!simulationOwnersSet.has(primPath)) {
        scenePrims[i] = scenePrims[scenePrims.length - 1]!
        scenePrims.pop()
      }
    }
  }
  _processPhysicsPrims(scenePrims, sceneDescs, () => new SceneDesc(), _parseSceneDesc)

  // Collision Groups
  const collisionGroupsDescs: CollisionGroupDesc[] = []
  _processPhysicsPrims(collisionGroupPrims, collisionGroupsDescs, () => new CollisionGroupDesc(), _parseCollisionGroupDesc)
  // Run groups merging
  const collisionGroupSets = new Map<string, Set<string>>()
  const mergeGroupNameToIndex = new Map<string, number>()
  for (let i = 0; i < collisionGroupsDescs.length; i++) {
    const desc = collisionGroupsDescs[i]!

    if (!collisionGroupSets.has(desc.primPath)) collisionGroupSets.set(desc.primPath, new Set())

    if (desc.mergeGroupName !== '') {
      const fit = mergeGroupNameToIndex.get(desc.mergeGroupName)
      if (fit !== undefined) {
        const mergeDesc = collisionGroupsDescs[fit]!
        mergeDesc.mergedGroups.push(desc.primPath)
        for (const sp of desc.filteredGroups) {
          mergeDesc.filteredGroups.push(sp)
        }

        collisionGroupsDescs[i] = collisionGroupsDescs[collisionGroupsDescs.length - 1]!
        collisionGroupPrims[i] = collisionGroupPrims[collisionGroupPrims.length - 1]!
        collisionGroupsDescs.pop()
        collisionGroupPrims.pop()
        i--
      } else {
        mergeGroupNameToIndex.set(desc.mergeGroupName, i)
        collisionGroupsDescs[i]!.mergedGroups.push(desc.primPath)
      }
    }
  }

  // Populate the sets to check collisions
  {
    const addIncludedPaths = (groupPath: string, hashSet: Set<string>): void => {
      const cgPrim = stage.getPrim(groupPath)
      if (cgPrim && cgPrim.isA(CollisionGroup.typeName)) {
        const cg = new CollisionGroup(cgPrim)
        const collectionAPI = cg.getCollidersCollectionAPI()
        const query = collectionAPI.computeMembershipQuery()
        // UsdCollectionAPI::ComputeIncludedPaths(query, stage,
        // UsdTraverseInstanceProxies())
        const includedPaths = _computeIncludedPaths(query, stage)
        for (const path of includedPaths) {
          hashSet.add(path)
        }
      }
    }
    for (let i = 0; i < collisionGroupsDescs.length; i++) {
      const desc = collisionGroupsDescs[i]!

      if (!collisionGroupSets.has(desc.primPath)) collisionGroupSets.set(desc.primPath, new Set())
      const hashSet = collisionGroupSets.get(desc.primPath)!

      if (desc.mergedGroups.length === 0) {
        addIncludedPaths(desc.primPath, hashSet)
      } else {
        for (const groupPath of desc.mergedGroups) {
          addIncludedPaths(groupPath, hashSet)
        }
      }
    }
  }

  // Rigid body physics material
  const materialDescs: RigidBodyMaterialDesc[] = []
  _processPhysicsPrims(materialPrims, materialDescs, () => new RigidBodyMaterialDesc(), _parseRigidBodyMaterialDesc)

  // Joints
  const jointDescs: D6JointDesc[] = []
  _processPhysicsPrims(physicsD6JointPrims, jointDescs, () => new D6JointDesc(), _parseD6JointDesc)

  const revoluteJointDescs: RevoluteJointDesc[] = []
  _processPhysicsPrims(physicsRevoluteJointPrims, revoluteJointDescs, () => new RevoluteJointDesc(), _parseRevoluteJointDesc)

  const prismaticJointDescs: PrismaticJointDesc[] = []
  _processPhysicsPrims(physicsPrismaticJointPrims, prismaticJointDescs, () => new PrismaticJointDesc(), _parsePrismaticJointDesc)

  const sphericalJointDescs: SphericalJointDesc[] = []
  _processPhysicsPrims(physicsSphericalJointPrims, sphericalJointDescs, () => new SphericalJointDesc(), _parseSphericalJointDesc)

  const fixedJointDescs: FixedJointDesc[] = []
  _processPhysicsPrims(physicsFixedJointPrims, fixedJointDescs, () => new FixedJointDesc(), _parseFixedJointDesc)

  const distanceJointDescs: DistanceJointDesc[] = []
  _processPhysicsPrims(physicsDistanceJointPrims, distanceJointDescs, () => new DistanceJointDesc(), _parseDistanceJointDesc)

  const customJointDescs: CustomJointDesc[] = []
  _processPhysicsPrims(physicsCustomJointPrims, customJointDescs, () => new CustomJointDesc(), _parseCustomJointDesc)

  // A.B. construct joint map revisit
  const jointMap: JointMap = new Map()
  for (const desc of [...jointDescs, ...revoluteJointDescs, ...prismaticJointDescs, ...sphericalJointDescs,
    ...fixedJointDescs, ...distanceJointDescs, ...customJointDescs]) {
    jointMap.set(desc.primPath, desc)
  }

  // collisions
  // first get the type
  const collisionTypes: ObjectType[] = new Array<ObjectType>(collisionPrims.length)
  const customGeomTokens: string[] = new Array<string>(collisionPrims.length).fill('')
  for (let i = 0; i < collisionPrims.length; i++) {
    if (customPhysicsTokens) {
      const shapeToken = { value: '' }
      const shapeType = _getCollisionType(collisionPrims[i]!, customPhysicsTokens.shapeTokens, shapeToken)
      collisionTypes[i] = shapeType
      if (shapeType === ObjectType.CustomShape) {
        customGeomTokens[i] = shapeToken.value
      }
    } else {
      collisionTypes[i] = _getCollisionType(collisionPrims[i]!, undefined, undefined)
    }
  }

  const sphereShapePrims: Prim[] = []
  const cubeShapePrims: Prim[] = []
  const cylinderShapePrims: Prim[] = []
  const cylinder1ShapePrims: Prim[] = []
  const capsuleShapePrims: Prim[] = []
  const capsule1ShapePrims: Prim[] = []
  const coneShapePrims: Prim[] = []
  const planeShapePrims: Prim[] = []
  const meshShapePrims: Prim[] = []
  const spherePointsShapePrims: Prim[] = []
  const customShapePrims: Prim[] = []
  const customTokens: string[] = []
  for (let i = 0; i < collisionTypes.length; i++) {
    const type = collisionTypes[i]
    switch (type) {
      case ObjectType.SphereShape: sphereShapePrims.push(collisionPrims[i]!); break
      case ObjectType.CubeShape: cubeShapePrims.push(collisionPrims[i]!); break
      case ObjectType.CapsuleShape: capsuleShapePrims.push(collisionPrims[i]!); break
      case ObjectType.Capsule1Shape: capsule1ShapePrims.push(collisionPrims[i]!); break
      case ObjectType.CylinderShape: cylinderShapePrims.push(collisionPrims[i]!); break
      case ObjectType.Cylinder1Shape: cylinder1ShapePrims.push(collisionPrims[i]!); break
      case ObjectType.ConeShape: coneShapePrims.push(collisionPrims[i]!); break
      case ObjectType.MeshShape: meshShapePrims.push(collisionPrims[i]!); break
      case ObjectType.PlaneShape: planeShapePrims.push(collisionPrims[i]!); break
      case ObjectType.CustomShape:
        customShapePrims.push(collisionPrims[i]!)
        customTokens.push(customGeomTokens[i]!)
        break
      case ObjectType.SpherePointsShape: spherePointsShapePrims.push(collisionPrims[i]!); break
      case ObjectType.Undefined:
      default:
        TfRaiseWarning(`CollisionAPI applied to an unknown UsdGeomGPrim type, prim ${collisionPrims[i]!.path}.`)
        break
    }
  }
  const sphereShapeDescs: SphereShapeDesc[] = []
  _processPhysicsPrims(sphereShapePrims, sphereShapeDescs, () => new SphereShapeDesc(), _parseSphereShapeDesc)

  const cubeShapeDescs: CubeShapeDesc[] = []
  _processPhysicsPrims(cubeShapePrims, cubeShapeDescs, () => new CubeShapeDesc(), _parseCubeShapeDesc)

  const cylinderShapeDescs: CylinderShapeDesc[] = []
  _processPhysicsPrims(cylinderShapePrims, cylinderShapeDescs, () => new CylinderShapeDesc(),
    (p, d) => _parseRadiusHalfHeightShapeDesc('Cylinder', p, d))

  const cylinder1ShapeDescs: Cylinder1ShapeDesc[] = []
  _processPhysicsPrims(cylinder1ShapePrims, cylinder1ShapeDescs, () => new Cylinder1ShapeDesc(),
    (p, d) => _parseTopBottomRadiusShapeDesc('Cylinder_1', p, d))

  const capsuleShapeDescs: CapsuleShapeDesc[] = []
  _processPhysicsPrims(capsuleShapePrims, capsuleShapeDescs, () => new CapsuleShapeDesc(),
    (p, d) => _parseRadiusHalfHeightShapeDesc('Capsule', p, d))

  const capsule1ShapeDescs: Capsule1ShapeDesc[] = []
  _processPhysicsPrims(capsule1ShapePrims, capsule1ShapeDescs, () => new Capsule1ShapeDesc(),
    (p, d) => _parseTopBottomRadiusShapeDesc('Capsule_1', p, d))

  const coneShapeDescs: ConeShapeDesc[] = []
  _processPhysicsPrims(coneShapePrims, coneShapeDescs, () => new ConeShapeDesc(),
    (p, d) => _parseRadiusHalfHeightShapeDesc('Cone', p, d))

  const planeShapeDescs: PlaneShapeDesc[] = []
  _processPhysicsPrims(planeShapePrims, planeShapeDescs, () => new PlaneShapeDesc(), _parsePlaneShapeDesc)

  const meshShapeDescs: MeshShapeDesc[] = []
  _processPhysicsPrims(meshShapePrims, meshShapeDescs, () => new MeshShapeDesc(), _parseMeshShapeDesc)

  const spherePointsShapeDescs: SpherePointsShapeDesc[] = []
  _processPhysicsPrims(spherePointsShapePrims, spherePointsShapeDescs, () => new SpherePointsShapeDesc(),
    _parseSpherePointsShapeDesc)

  const customShapeDescs: CustomShapeDesc[] = []
  _processPhysicsPrims(customShapePrims, customShapeDescs, () => new CustomShapeDesc(), _parseCustomShapeDesc)
  if (customShapeDescs.length === customTokens.length) {
    for (let i = 0; i < customShapeDescs.length; i++) {
      customShapeDescs[i]!.customGeometryToken = customTokens[i]!
    }
  }

  // rigid bodies
  const rigidBodyDescs: RigidBodyDesc[] = []
  _processPhysicsPrims(rigidBodyPrims, rigidBodyDescs, () => new RigidBodyDesc(), _parseRigidBodyDesc)

  const bodyMap: RigidBodyMap = new Map()
  for (let i = rigidBodyPrims.length; i--;) {
    bodyMap.set(rigidBodyPrims[i]!.path, rigidBodyDescs[i]!)
  }

  const articulationDescs: ArticulationDesc[] = []
  _processPhysicsPrims(articulationPrims, articulationDescs, () => new ArticulationDesc(), _parseArticulationDesc)

  const articulationMap: ArticulationMap = new Map() // A.B. TODO probably not needed
  for (let i = articulationPrims.length; i--;) {
    articulationMap.set(articulationPrims[i]!.path, articulationDescs[i]!)
  }

  // Finalize collisions
  {
    _finalizeCollisionDescs(sphereShapePrims, sphereShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(cubeShapePrims, cubeShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(capsuleShapePrims, capsuleShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(capsule1ShapePrims, capsule1ShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(cylinderShapePrims, cylinderShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(cylinder1ShapePrims, cylinder1ShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(coneShapePrims, coneShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(planeShapePrims, planeShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(meshShapePrims, meshShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(spherePointsShapePrims, spherePointsShapeDescs, bodyMap, collisionGroupSets)
    _finalizeCollisionDescs(customShapePrims, customShapeDescs, bodyMap, collisionGroupSets)
  }

  // Finalize articulations
  {
    // A.B. walk through the finalize code refactor
    _finalizeArticulations(stage, articulationMap, bodyMap, jointMap)
  }

  // if simulationOwners are in play lets shrink down the reported descriptors
  if (simulationOwners && simulationOwners.length !== 0) {
    const reportedBodies = new Set<string>()
    // first check bodies
    _checkRigidBodySimulationOwner(rigidBodyPrims, rigidBodyDescs,
      defaultSimulationOwner, simulationOwnersSet, reportedBodies)

    // check collisions
    // if collision belongs to a body that we care about include it
    // if collision does not belong to a body we care about its not included
    // if collision does not have a body set, we check its own
    // simulationOwners
    const checkCollision = <D extends ShapeDesc>(prims: Prim[], descs: D[]): void =>
      _checkCollisionSimulationOwner(prims, descs, defaultSimulationOwner, reportedBodies, simulationOwnersSet)
    checkCollision(sphereShapePrims, sphereShapeDescs)
    checkCollision(cubeShapePrims, cubeShapeDescs)
    checkCollision(capsuleShapePrims, capsuleShapeDescs)
    checkCollision(capsule1ShapePrims, capsule1ShapeDescs)
    checkCollision(cylinderShapePrims, cylinderShapeDescs)
    checkCollision(cylinder1ShapePrims, cylinder1ShapeDescs)
    checkCollision(coneShapePrims, coneShapeDescs)
    checkCollision(planeShapePrims, planeShapeDescs)
    checkCollision(meshShapePrims, meshShapeDescs)
    checkCollision(spherePointsShapePrims, spherePointsShapeDescs)
    checkCollision(customShapePrims, customShapeDescs)

    // Both bodies need to have simulation owners valid
    const checkJoint = <D extends JointDesc>(prims: Prim[], descs: D[]): void =>
      _checkJointSimulationOwner(prims, descs, defaultSimulationOwner, reportedBodies, simulationOwnersSet)
    checkJoint(physicsFixedJointPrims, fixedJointDescs)
    checkJoint(physicsRevoluteJointPrims, revoluteJointDescs)
    checkJoint(physicsPrismaticJointPrims, prismaticJointDescs)
    checkJoint(physicsSphericalJointPrims, sphericalJointDescs)
    checkJoint(physicsDistanceJointPrims, distanceJointDescs)
    checkJoint(physicsD6JointPrims, jointDescs)
    checkJoint(physicsCustomJointPrims, customJointDescs)

    // All bodies need to have simulation owners valid
    _checkArticulationSimulationOwner(articulationPrims, articulationDescs,
      defaultSimulationOwner, reportedBodies, simulationOwnersSet)
  }

  // get the descriptors, finalize them and send them out in an order
  // 1. send out the scenes
  _callReportFn(ObjectType.Scene, scenePrims, sceneDescs, reportFn, userData)

  // 2. send out the CollisionGroups
  _callReportFn(ObjectType.CollisionGroup, collisionGroupPrims, collisionGroupsDescs, reportFn, userData)

  // 3. send out the materials
  _callReportFn(ObjectType.RigidBodyMaterial, materialPrims, materialDescs, reportFn, userData)

  // 4. finish out and send out shapes
  _callReportFn(ObjectType.SphereShape, sphereShapePrims, sphereShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.CubeShape, cubeShapePrims, cubeShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.CapsuleShape, capsuleShapePrims, capsuleShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.Capsule1Shape, capsule1ShapePrims, capsule1ShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.CylinderShape, cylinderShapePrims, cylinderShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.Cylinder1Shape, cylinder1ShapePrims, cylinder1ShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.ConeShape, coneShapePrims, coneShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.PlaneShape, planeShapePrims, planeShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.MeshShape, meshShapePrims, meshShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.SpherePointsShape, spherePointsShapePrims, spherePointsShapeDescs, reportFn, userData)
  _callReportFn(ObjectType.CustomShape, customShapePrims, customShapeDescs, reportFn, userData)

  // 5. send out articulations
  _callReportFn(ObjectType.Articulation, articulationPrims, articulationDescs, reportFn, userData)

  // 6. send out bodies
  _callReportFn(ObjectType.RigidBody, rigidBodyPrims, rigidBodyDescs, reportFn, userData)

  // 7. send out joints
  _callReportFn(ObjectType.FixedJoint, physicsFixedJointPrims, fixedJointDescs, reportFn, userData)
  _callReportFn(ObjectType.RevoluteJoint, physicsRevoluteJointPrims, revoluteJointDescs, reportFn, userData)
  _callReportFn(ObjectType.PrismaticJoint, physicsPrismaticJointPrims, prismaticJointDescs, reportFn, userData)
  _callReportFn(ObjectType.SphericalJoint, physicsSphericalJointPrims, sphericalJointDescs, reportFn, userData)
  _callReportFn(ObjectType.DistanceJoint, physicsDistanceJointPrims, distanceJointDescs, reportFn, userData)
  _callReportFn(ObjectType.D6Joint, physicsD6JointPrims, jointDescs, reportFn, userData)
  _callReportFn(ObjectType.CustomJoint, physicsCustomJointPrims, customJointDescs, reportFn, userData)

  return retVal
}

// UsdCollectionAPI::ComputeIncludedPaths(query, stage,
// UsdTraverseInstanceProxies()) (pxr/usd/usd/collectionAPI.cpp): every prim
// in a stage traversal that also visits instance proxies and that the query
// includes.
function _computeIncludedPaths(query: { isPathIncluded(path: string): boolean }, stage: Stage): string[] {
  const included: string[] = []
  for (const prim of PrimRange.stage(stage, TraverseInstanceProxies())) {
    if (query.isPathIncluded(prim.path)) included.push(prim.path)
  }
  return included
}
