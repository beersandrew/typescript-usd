import './plugin/registerPlugin.ts'
// UsdGeom schema domain
// Depends on typescript-usd/usd for the stage/prim infrastructure.

export { SchemaBase } from 'typescript-usd/usd'
export { Imageable, PURPOSE_TOKENS, getInheritablePurpose } from './imageable.ts'
export type { Visibility, Purpose, PurposeInfo } from './imageable.ts'
export { Xformable, XformQuery, evaluateXformOps } from './xformable.ts'
export { XformOp, UsdGeomXformOpTypes as XformOpTypes } from './xformOp.ts'
export type { XformResult } from './xformable.ts'
export { Boundable, registerComputeExtentFunction } from './boundable.ts'
export type { ComputeExtentFunction } from './boundable.ts'
export type { Extent } from './boundable.ts'
export { Gprim } from './gprim.ts'
export type { Orientation } from './gprim.ts'
export { PointBased } from './pointBased.ts'
export { Curves } from './curves.ts'
export { Mesh, MESH_ATTR, SUBDIV_DEFAULTS } from './mesh.ts'
export type {
  Interpolation, UVPrimvar,
  SubdivisionScheme, InterpolateBoundary,
  FaceVaryingLinearInterpolation, TriangleSubdivisionRule,
} from './mesh.ts'
export { Xform } from './xform.ts'
export { Scope } from './scope.ts'
export { Camera, CAMERA_DEFAULTS, computeProjectionMatrix } from './camera.ts'
export type { Projection, StereoRole, GfCamera } from './camera.ts'
export { Subset } from './subset.ts'
export type { ElementType, FamilyType } from './subset.ts'
export { Primvar, PrimvarsAPI } from './primvarsAPI.ts'
export { Points } from './points.ts'
export { BasisCurves } from './basisCurves.ts'
export type { CurveType, CurveBasis, CurveWrap } from './basisCurves.ts'
export { NurbsCurves } from './nurbsCurves.ts'
export { HermiteCurves, PointAndTangentArrays } from './hermiteCurves.ts'
export { TetMesh } from './tetMesh.ts'
export { MotionAPI, MOTION_API_SCHEMA_NAME, MOTION_ATTR } from './motionAPI.ts'
export { Sphere } from './sphere.ts'
export { Cube } from './cube.ts'
export { Cylinder } from './cylinder.ts'
export type { SpineAxis } from './cylinder.ts'
export { Cone } from './cone.ts'
export { Capsule } from './capsule.ts'
export { Capsule_1 } from './capsule_1.ts'
export { Cylinder_1 } from './cylinder_1.ts'
export { NurbsPatch } from './nurbsPatch.ts'
export { VisibilityAPI } from './visibilityAPI.ts'
export { BackPlateAPI } from './backPlateAPI.ts'
export { Plane } from './plane.ts'
export { ModelAPI, CARD_FACES } from './modelAPI.ts'
export type { DrawMode, CardGeometry, CardFace, CardTextures } from './modelAPI.ts'
export { ConstraintTarget, getConstraintAttrName, CONSTRAINT_TARGETS_NS } from './constraintTarget.ts'
export { XformCommonAPI } from './xformCommonAPI.ts'
export type { RotationOrder, Ops } from './xformCommonAPI.ts'
export { PointInstancer } from './pointInstancer.ts'
export type { ComputeInstanceTransformsOptions, InstanceTransformsResult } from './pointInstancer.ts'
export { XformCache } from './xformCache.ts'
export { UsdGeomTokens as Tokens } from './tokens.ts'
export { BBoxCache } from './bboxCache.ts'
// DEPRECATED transitional shim: Gf math now lives in typescript-usd/gf and all in-repo
// consumers import it from there. These re-exports remain only so external
// consumers don't break on the move; import
// from 'typescript-usd/gf' directly. Remove once consumers have migrated.
export {
  IDENTITY_MATRIX,
  mul4,
  invertMatrix4,
  transformPoint,
  quatToMatrix,
} from 'typescript-usd/gf'
export type { Matrix4 } from 'typescript-usd/gf'
export { attrVal, asNumber, asToken, asBool, asQuat } from './valueUtils.ts'
export {
  setStageUpAxis, getStageUpAxis,
  setStageMetersPerUnit, getStageMetersPerUnit, stageHasAuthoredMetersPerUnit,
  UPAXIS_DEFAULT, LINEAR_UNITS_DEFAULT,
} from './metrics.ts'
export type { UpAxis } from './metrics.ts'
