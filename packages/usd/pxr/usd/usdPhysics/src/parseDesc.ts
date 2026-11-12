// Ported from OpenUSD 26.11.1: pxr/usd/usdPhysics/parseDesc.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Physics parsing descriptors.
// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/parseDesc.h.
//
// SdfPath fields are path strings; SdfPath() is the empty string. SdfPathVector
// fields are string arrays. Members upstream leaves uninitialized
// (UsdPhysicsCollisionGroupDesc::invertFilteredGroups,
// UsdPhysicsJointDesc::collisionEnabled, UsdPhysicsSpherePoint) start at
// false / zero here. Upstream's operator== on descriptors always returns
// false and has no counterpart.

import { Quatf as GfQuatf, Vec3f as GfVec3f } from 'typescript-usd/gf'

// Sentinel value for flt max compare (parseDesc.h:24-26).
export const usdPhysicsSentinelLimit = Math.fround(0.5e38)

// Physics object type structure for type enumeration (parseDesc.h:28-69).
export enum ObjectType {
  Undefined,
  Scene,
  RigidBody,
  SphereShape,
  CubeShape,
  CapsuleShape,
  Capsule1Shape,
  CylinderShape,
  Cylinder1Shape,
  ConeShape,
  MeshShape,
  PlaneShape,
  CustomShape,
  SpherePointsShape,
  FixedJoint,
  RevoluteJoint,
  PrismaticJoint,
  SphericalJoint,
  DistanceJoint,
  D6Joint,
  CustomJoint,
  RigidBodyMaterial,
  Articulation,
  CollisionGroup,
  Last,
}

// Physics axis structure for type enumeration (parseDesc.h:71-79).
export enum Axis {
  X,
  Y,
  Z,
}

// Physics joint degree of freedom structure for type enumeration
// (parseDesc.h:81-94).
export enum JointDOF {
  Distance,
  TransX,
  TransY,
  TransZ,
  RotX,
  RotY,
  RotZ,
}

// Base physics object descriptor (parseDesc.h:96-116).
export class ObjectDesc {
  // Descriptor type
  type: ObjectType
  // SdfPath for the prim from which the descriptor was parsed
  primPath = ''
  // Validity of a descriptor, the parsing may succeed, but the given
  // descriptor might be still invalid
  isValid = true

  constructor(inType: ObjectType) {
    this.type = inType
  }
}

// Rigid body material descriptor (parseDesc.h:118-144).
export class RigidBodyMaterialDesc extends ObjectDesc {
  staticFriction = 0.0
  dynamicFriction = 0.0
  restitution = 0.0
  density = -1.0

  constructor() {
    super(ObjectType.RigidBodyMaterial)
  }
}

// Scene descriptor (parseDesc.h:146-169).
export class SceneDesc extends ObjectDesc {
  gravityDirection = new GfVec3f(0.0, 0.0, 0.0)
  gravityMagnitude = -Infinity

  constructor() {
    super(ObjectType.Scene)
  }
}

// Collision group descriptor (parseDesc.h:171-209).
export class CollisionGroupDesc extends ObjectDesc {
  invertFilteredGroups = false
  filteredGroups: string[] = []
  mergeGroupName = ''
  mergedGroups: string[] = []

  constructor() {
    super(ObjectType.CollisionGroup)
  }

  getFilteredGroups(): string[] {
    return this.filteredGroups
  }

  getMergedGroups(): string[] {
    return this.mergedGroups
  }
}

// Shape descriptor, base class should not be reported (parseDesc.h:211-266).
export class ShapeDesc extends ObjectDesc {
  rigidBody = ''
  localPos = new GfVec3f(0.0, 0.0, 0.0)
  localRot = new GfQuatf(1.0, 0.0, 0.0, 0.0)
  localScale = new GfVec3f(1.0, 1.0, 1.0)
  materials: string[] = []
  simulationOwners: string[] = []
  filteredCollisions: string[] = []
  collisionGroups: string[] = []
  collisionEnabled = true

  getMaterials(): string[] {
    return this.materials
  }

  getSimulationOwners(): string[] {
    return this.simulationOwners
  }

  getFilteredCollisions(): string[] {
    return this.filteredCollisions
  }

  getCollisionGroups(): string[] {
    return this.collisionGroups
  }
}

// Sphere shape collision descriptor (parseDesc.h:268-286).
export class SphereShapeDesc extends ShapeDesc {
  radius: number

  constructor(inRadius = 0.0) {
    super(ObjectType.SphereShape)
    this.radius = inRadius
  }
}

// Capsule shape collision descriptor (parseDesc.h:288-312).
export class CapsuleShapeDesc extends ShapeDesc {
  radius: number
  halfHeight: number
  axis: Axis

  constructor(inRadius = 0.0, half_height = 0.0, cap_axis = Axis.X) {
    super(ObjectType.CapsuleShape)
    this.radius = inRadius
    this.halfHeight = half_height
    this.axis = cap_axis
  }
}

// Capsule1 shape collision descriptor (parseDesc.h:314-342).
export class Capsule1ShapeDesc extends ShapeDesc {
  topRadius: number
  bottomRadius: number
  halfHeight: number
  axis: Axis

  constructor(inTopRadius = 0.0, inBottomRadius = 0.0, half_height = 0.0, cap_axis = Axis.X) {
    super(ObjectType.Capsule1Shape)
    this.topRadius = inTopRadius
    this.bottomRadius = inBottomRadius
    this.halfHeight = half_height
    this.axis = cap_axis
  }
}

// Cylinder shape collision descriptor (parseDesc.h:344-368).
export class CylinderShapeDesc extends ShapeDesc {
  radius: number
  halfHeight: number
  axis: Axis

  constructor(inRadius = 0.0, half_height = 0.0, cap_axis = Axis.X) {
    super(ObjectType.CylinderShape)
    this.radius = inRadius
    this.halfHeight = half_height
    this.axis = cap_axis
  }
}

// Cylinder1 shape collision descriptor (parseDesc.h:370-398).
export class Cylinder1ShapeDesc extends ShapeDesc {
  topRadius: number
  bottomRadius: number
  halfHeight: number
  axis: Axis

  constructor(inTopRadius = 0.0, inBottomRadius = 0.0, half_height = 0.0, cap_axis = Axis.X) {
    super(ObjectType.Cylinder1Shape)
    this.topRadius = inTopRadius
    this.bottomRadius = inBottomRadius
    this.halfHeight = half_height
    this.axis = cap_axis
  }
}

// Cone shape collision descriptor (parseDesc.h:400-424).
export class ConeShapeDesc extends ShapeDesc {
  radius: number
  halfHeight: number
  axis: Axis

  constructor(inRadius = 0.0, half_height = 0.0, cap_axis = Axis.X) {
    super(ObjectType.ConeShape)
    this.radius = inRadius
    this.halfHeight = half_height
    this.axis = cap_axis
  }
}

// Plane shape collision descriptor (parseDesc.h:426-445).
export class PlaneShapeDesc extends ShapeDesc {
  axis: Axis

  constructor(up_axis = Axis.X) {
    super(ObjectType.PlaneShape)
    this.axis = up_axis
  }
}

// Custom shape collision descriptor (parseDesc.h:447-465).
export class CustomShapeDesc extends ShapeDesc {
  customGeometryToken = ''

  constructor() {
    super(ObjectType.CustomShape)
  }
}

// Cube shape collision descriptor (parseDesc.h:467-486).
export class CubeShapeDesc extends ShapeDesc {
  halfExtents: GfVec3f

  constructor(inHalfExtents: GfVec3f = new GfVec3f(1.0)) {
    super(ObjectType.CubeShape)
    this.halfExtents = inHalfExtents
  }
}

// Mesh shape collision descriptor (parseDesc.h:488-518).
export class MeshShapeDesc extends ShapeDesc {
  approximation = ''
  meshScale = new GfVec3f(1.0, 1.0, 1.0)
  doubleSided = false

  constructor() {
    super(ObjectType.MeshShape)
  }

  getApproximation(): string {
    return this.approximation
  }
}

// This struct represents a single sphere-point which is a position and a
// radius (parseDesc.h:520-539).
export class SpherePoint {
  center = new GfVec3f(0.0)
  radius = 0.0
}

// This struct represents a collection of sphere points. Basically just an
// array of spheres which has been populated from a UsdGeomPoints primitive
// (parseDesc.h:541-559).
export class SpherePointsShapeDesc extends ShapeDesc {
  spherePoints: SpherePoint[] = []

  constructor() {
    super(ObjectType.SpherePointsShape)
  }
}

// Rigid body descriptor (parseDesc.h:561-620).
export class RigidBodyDesc extends ObjectDesc {
  collisions: string[] = []
  filteredCollisions: string[] = []
  simulationOwners: string[] = []
  position = new GfVec3f(0.0, 0.0, 0.0)
  rotation = new GfQuatf(1.0, 0.0, 0.0, 0.0)
  scale = new GfVec3f(1.0, 1.0, 1.0)
  rigidBodyEnabled = true
  kinematicBody = false
  startsAsleep = false
  linearVelocity = new GfVec3f(0.0, 0.0, 0.0)
  angularVelocity = new GfVec3f(0.0, 0.0, 0.0)

  constructor() {
    super(ObjectType.RigidBody)
  }

  getCollisions(): string[] {
    return this.collisions
  }

  getFilteredCollisions(): string[] {
    return this.filteredCollisions
  }

  getSimulationOwners(): string[] {
    return this.simulationOwners
  }
}

// Joint limit descriptor (parseDesc.h:622-658). Upstream stores
// angle0/lower/minDist and angle1/upper/maxDist in unions; the aliases share
// one field here.
export class JointLimit {
  enabled = false
  angle0 = 90.0
  angle1 = -90.0

  get lower(): number { return this.angle0 }
  set lower(v: number) { this.angle0 = v }
  get minDist(): number { return this.angle0 }
  set minDist(v: number) { this.angle0 = v }
  get upper(): number { return this.angle1 }
  set upper(v: number) { this.angle1 = v }
  get maxDist(): number { return this.angle1 }
  set maxDist(v: number) { this.angle1 = v }
}

// Joint drive descriptor. The expected drive formula:
// force = stiffness * (targetPosition - position) + damping * (targetVelocity - velocity)
// (parseDesc.h:660-692).
export class JointDrive {
  enabled = false
  targetPosition = 0.0
  targetVelocity = 0.0
  forceLimit = 3.4028234663852886e38 // FLT_MAX
  stiffness = 0.0
  damping = 0.0
  acceleration = false
}

// Articulation description (parseDesc.h:694-737).
export class ArticulationDesc extends ObjectDesc {
  rootPrims: string[] = []
  filteredCollisions: string[] = []
  articulatedJoints: string[] = []
  articulatedBodies: string[] = []

  constructor() {
    super(ObjectType.Articulation)
  }

  getRootPrims(): string[] {
    return this.rootPrims
  }

  getFilteredCollisions(): string[] {
    return this.filteredCollisions
  }

  getArticulatedJoints(): string[] {
    return this.articulatedJoints
  }

  getArticulatedBodies(): string[] {
    return this.articulatedBodies
  }
}

// parseDesc.h:739-745
export type JointLimits = Array<[JointDOF, JointLimit]>
export type JointDrives = Array<[JointDOF, JointDrive]>

// Base UsdPhysics joint descriptor (parseDesc.h:747-798).
export class JointDesc extends ObjectDesc {
  rel0 = ''
  rel1 = ''
  body0 = ''
  body1 = ''
  localPose0Position = new GfVec3f(0.0, 0.0, 0.0)
  localPose0Orientation = new GfQuatf(1.0, 0.0, 0.0, 0.0)
  localPose1Position = new GfVec3f(0.0, 0.0, 0.0)
  localPose1Orientation = new GfQuatf(1.0, 0.0, 0.0, 0.0)
  jointEnabled = true
  breakForce = 3.4028234663852886e38 // FLT_MAX; USD default is none, which is not a float...
  breakTorque = 3.4028234663852886e38 // FLT_MAX
  excludeFromArticulation = false
  collisionEnabled = false
}

// Custom joint descriptor (parseDesc.h:800-816).
export class CustomJointDesc extends JointDesc {
  constructor() {
    super(ObjectType.CustomJoint)
  }
}

// Fixed joint descriptor (parseDesc.h:818-833).
export class FixedJointDesc extends JointDesc {
  constructor() {
    super(ObjectType.FixedJoint)
  }
}

// Generic D6 joint descriptor (parseDesc.h:835-855).
export class D6JointDesc extends JointDesc {
  jointLimits: JointLimits = []
  jointDrives: JointDrives = []

  constructor() {
    super(ObjectType.D6Joint)
  }
}

// Prismatic joint descriptor (parseDesc.h:857-880).
export class PrismaticJointDesc extends JointDesc {
  axis = Axis.X
  limit = new JointLimit()
  drive = new JointDrive()

  constructor() {
    super(ObjectType.PrismaticJoint)
  }
}

// Spherical joint descriptor (parseDesc.h:882-903).
export class SphericalJointDesc extends JointDesc {
  axis = Axis.X
  limit = new JointLimit()

  constructor() {
    super(ObjectType.SphericalJoint)
  }
}

// Revolute joint descriptor (parseDesc.h:905-928).
export class RevoluteJointDesc extends JointDesc {
  axis = Axis.X
  limit = new JointLimit()
  drive = new JointDrive()

  constructor() {
    super(ObjectType.RevoluteJoint)
  }
}

// Distance joint descriptor (parseDesc.h:930-952).
export class DistanceJointDesc extends JointDesc {
  minEnabled = false
  maxEnabled = false
  limit = new JointLimit()

  constructor() {
    super(ObjectType.DistanceJoint)
  }
}
