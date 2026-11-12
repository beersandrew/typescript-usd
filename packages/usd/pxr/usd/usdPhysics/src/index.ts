// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdPhysics/metrics.h, pxr/usd/usdPhysics/metrics.cpp,
//  pxr/usd/usdPhysics/massProperties.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
// OpenUSD v26.11.1 pxr/usd/usdPhysics: generated schema classes
// (generatedSchema.classes.txt) and tokens.
export { ArticulationRootAPI } from './articulationRootAPI.ts'
export { CollisionAPI } from './collisionAPI.ts'
export { CollisionGroup, CollisionGroupTable } from './collisionGroup.ts'
export { DistanceJoint } from './distanceJoint.ts'
export { DriveAPI } from './driveAPI.ts'
export { FilteredPairsAPI } from './filteredPairsAPI.ts'
export { FixedJoint } from './fixedJoint.ts'
export { Joint } from './joint.ts'
export { LimitAPI } from './limitAPI.ts'
export { MassAPI } from './massAPI.ts'
export { MaterialAPI } from './materialAPI.ts'
export { MeshCollisionAPI } from './meshCollisionAPI.ts'
export { PrismaticJoint } from './prismaticJoint.ts'
export { RevoluteJoint } from './revoluteJoint.ts'
export { RigidBodyAPI } from './rigidBodyAPI.ts'
export type { MassInformation, MassInformationFn } from './rigidBodyAPI.ts'
export { Scene } from './scene.ts'
export { SphericalJoint } from './sphericalJoint.ts'
export { UsdPhysicsTokens as Tokens } from './tokens.ts'
// Hand-written upstream files: metrics.{h,cpp}, massProperties.h.
export {
  MassUnits, getStageKilogramsPerUnit, stageHasAuthoredKilogramsPerUnit,
  setStageKilogramsPerUnit, massUnitsAre,
} from './metrics.ts'
export { MassProperties, indexedRotation, getNextIndex3, diagonalize } from './massProperties.ts'
// Hand-written upstream files: parseDesc.h, parseUtils.{h,cpp}.
export {
  usdPhysicsSentinelLimit, ObjectType, Axis, JointDOF, ObjectDesc, RigidBodyMaterialDesc, SceneDesc,
  CollisionGroupDesc, ShapeDesc, SphereShapeDesc, CapsuleShapeDesc, Capsule1ShapeDesc, CylinderShapeDesc,
  Cylinder1ShapeDesc, ConeShapeDesc, PlaneShapeDesc, CustomShapeDesc, CubeShapeDesc, MeshShapeDesc,
  SpherePoint, SpherePointsShapeDesc, RigidBodyDesc, JointLimit, JointDrive, ArticulationDesc, JointDesc,
  CustomJointDesc, FixedJointDesc, D6JointDesc, PrismaticJointDesc, SphericalJointDesc, RevoluteJointDesc,
  DistanceJointDesc,
} from './parseDesc.ts'
export type { JointLimits, JointDrives } from './parseDesc.ts'
export { loadStageFromPrimRange } from './parseUtils.ts'
export type { ReportFn, CustomTokens } from './parseUtils.ts'
