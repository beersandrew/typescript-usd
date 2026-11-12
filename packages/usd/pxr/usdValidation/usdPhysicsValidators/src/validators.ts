// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdPhysicsValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdPhysicsValidators/validators.cpp.
import { Matrix4d as GfMatrix4d, Quatf as GfQuatf, Transform as GfTransform, Vec3f as GfVec3f,
  rotationToQuat, type Vec3d as GfVec3d } from 'typescript-usd/gf'
import type { Prim } from 'typescript-usd/usd'
import { Capsule, Capsule_1, Cone, Cylinder, Cylinder_1, Plane, Points, PrimvarsAPI, Sphere, XformCache,
} from 'typescript-usd/usdGeom'
import { ArticulationRootAPI, CollisionAPI, Joint, MassAPI, RigidBodyAPI } from 'typescript-usd/usdPhysics'
import { TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError as UsdValidationError, ValidationErrorSite as UsdValidationErrorSite,
  ValidationErrorType as UsdValidationErrorType, ValidationRegistry as UsdValidationRegistry,
  type ValidationTimeRange as UsdValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdPhysicsValidationErrorNameTokens, UsdPhysicsValidatorNameTokens } from './validatorTokens.ts'

// A schema object's operator bool (UsdAPISchemaBase / UsdTyped
// _IsCompatible): an applied API schema is HasAPI, a typed schema IsA.
const _hasAPI = (prim: Prim, schema: { typeName: string }): boolean => prim.hasAPI(schema.typeName)

// validators.cpp:47-79.
function scaleIsUniform(scale: GfVec3d): boolean {
  const eps = 1.0e-5
  // Find min and max scale values
  let lo: number, hi: number
  if (scale.get(0) < scale.get(1)) {
    lo = scale.get(0)
    hi = scale.get(1)
  } else {
    lo = scale.get(1)
    hi = scale.get(0)
  }
  if (scale.get(2) < lo) lo = scale.get(2)
  else if (scale.get(2) > hi) hi = scale.get(2)

  if (lo * hi < 0.0) return false // opposite signs

  return hi > 0.0 ? hi - lo <= eps * lo : lo - hi >= eps * hi
}

// validators.cpp:81-98.
function isDynamicBody(usdPrim: Prim, out: { physicsAPIFound: boolean }): boolean {
  if (_hasAPI(usdPrim, RigidBodyAPI)) {
    const rboAPI = new RigidBodyAPI(usdPrim)
    const isAPISchemaEnabled = (rboAPI.getRigidBodyEnabledAttr().getValue() as boolean | undefined) ?? true
    // Prim is dynamic body off PhysicsAPI is present and enabled
    out.physicsAPIFound = true
    return isAPISchemaEnabled
  }
  out.physicsAPIFound = false
  return false
}

// validators.cpp:100-137.
function hasDynamicBodyParent(usdPrim: Prim, out: { bodyPrim: Prim | undefined }): boolean {
  const found = { physicsAPIFound: false }
  let parent: Prim | undefined = usdPrim
  let disabledBodyPrim: Prim | undefined
  while (parent && !parent.isPseudoRoot()) {
    if (isDynamicBody(parent, found)) {
      out.bodyPrim = parent
      return true
    }
    // A disabled rigid body takes no part in simulation, so it does not own
    // this prim. Keep searching the ancestors, remembering the nearest
    // disabled body.
    if (found.physicsAPIFound && !disabledBodyPrim) disabledBodyPrim = parent
    parent = parent.getParent()
  }
  // No enabled body above this prim. Report the nearest disabled body, if
  // any.
  if (disabledBodyPrim) out.bodyPrim = disabledBodyPrim
  return false
}

// validators.cpp:139-152.
function checkNestedArticulationRoot(usdPrim: Prim): boolean {
  let parent = usdPrim.getParent()
  while (parent && !parent.isPseudoRoot()) {
    if (_hasAPI(parent, ArticulationRootAPI)) return true
    parent = parent.getParent()
  }
  return false
}

function _primSites(usdPrim: Prim): UsdValidationErrorSite[] {
  return [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)]
}

function _error(name: string, usdPrim: Prim, message: string): UsdValidationError {
  return new UsdValidationError(name, UsdValidationErrorType.Error, _primSites(usdPrim), message)
}

// validators.cpp:154-263.
function checkMassAPI(usdPrim: Prim, errors: UsdValidationError[]): void {
  if (!_hasAPI(usdPrim, MassAPI)) return
  const massAPI = new MassAPI(usdPrim)
  const path = usdPrim.path
  const T = UsdPhysicsValidationErrorNameTokens

  const mass = (massAPI.getMassAttr().getValue() as number | undefined) ?? 0.0
  if (mass < 0.0) errors.push(_error(T.massInvalidValues, usdPrim, `Mass is negative, prim path: ${path}`))

  const density = (massAPI.getDensityAttr().getValue() as number | undefined) ?? 0.0
  if (density < 0.0) {
    errors.push(_error(T.densityInvalidValues, usdPrim, `Density is negative, prim path: ${path}`))
  }

  const principalAxesAttr = massAPI.getPrincipalAxesAttr()
  const diagonalInertiaAttr = massAPI.getDiagonalInertiaAttr()
  const principalAxesAuthored = principalAxesAttr.hasAuthoredValue()
  const diagonalInertiaAuthored = diagonalInertiaAttr.hasAuthoredValue()

  // Check that both are authored or neither is authored
  if (principalAxesAuthored !== diagonalInertiaAuthored) {
    errors.push(_error(T.inertiaInvalidValues, usdPrim,
      `principalAxes and diagonalInertia must both be authored or neither authored, prim path: ${path}`))
  }

  // If both are authored, validate their values
  if (principalAxesAuthored && diagonalInertiaAuthored) {
    const principalAxes = (principalAxesAttr.getValue() as GfQuatf | undefined) ?? new GfQuatf()
    const diagonalInertia = (diagonalInertiaAttr.getValue() as GfVec3f | undefined) ?? new GfVec3f()

    const principalAxesFallbackAuthored = principalAxes.equals(new GfQuatf(0.0, 0.0, 0.0, 0.0))
    const diagonalInertiaFallbackAuthored = diagonalInertia.equals(new GfVec3f(0.0, 0.0, 0.0))

    // If the fallback values are explicitly authored, both attrs must match
    // the fallbacks
    if (principalAxesFallbackAuthored !== diagonalInertiaFallbackAuthored) {
      errors.push(_error(T.inertiaInvalidValues, usdPrim,
        'principalAxes and diagonalInertia must both be authored in the valid range or neither '
        + `authored, prim path: ${path}`))
    }

    if (!principalAxesFallbackAuthored && !diagonalInertiaFallbackAuthored) {
      // Check principalAxes is a valid unit quaternion
      if (Math.abs(Math.fround(principalAxes.GetLength()) - 1.0) > Math.fround(1e-5)) {
        errors.push(_error(T.inertiaInvalidValues, usdPrim,
          `principalAxes must be a valid unit quaternion, prim path: ${path}`))
      }
      // Check diagonalInertia has positive values
      if (diagonalInertia.get(0) <= 0.0 || diagonalInertia.get(1) <= 0.0 || diagonalInertia.get(2) <= 0.0) {
        errors.push(_error(T.inertiaInvalidValues, usdPrim,
          `diagonalInertia elements must be positive, prim path: ${path}`))
      }
    }
  }
}

// UsdGeomXformable::ComputeLocalToWorldTransform(UsdTimeCode::Default())
// (xformable.cpp) as a GfTransform.
function _localToWorldTransform(usdPrim: Prim): GfTransform {
  return new GfTransform(new GfMatrix4d(...new XformCache().getLocalToWorldTransform(usdPrim)))
}

// validators.cpp:265-353.
function _getRigidBodyErrors(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  if (!_hasAPI(usdPrim, RigidBodyAPI)) return errors
  const rbAPI = new RigidBodyAPI(usdPrim)
  const T = UsdPhysicsValidationErrorNameTokens
  const path = usdPrim.path

  // rigid body applied to xformable
  if (!usdPrim.isA('Xformable')) {
    errors.push(_error(T.rigidBodyNonXformable, usdPrim,
      `Rigid body API has to be applied to a xformable prim, prim path: ${path}`))
  }

  // check instancing
  if (usdPrim.isInstanceProxy()) {
    let reportInstanceError = true
    const kinematic = (rbAPI.getKinematicEnabledAttr().getValue() as boolean | undefined) ?? false
    if (kinematic) reportInstanceError = false
    const enabled = (rbAPI.getRigidBodyEnabledAttr().getValue() as boolean | undefined) ?? false
    if (!enabled) reportInstanceError = false
    if (reportInstanceError) {
      errors.push(_error(T.rigidBodyNonInstanceable, usdPrim,
        `RigidBodyAPI on an instance proxy is not supported, prim path: ${path}`))
    }
  }

  // scale orientation check
  {
    const tr = _localToWorldTransform(usdPrim)
    const sc = tr.getScale()
    const q = rotationToQuat(tr.getScaleOrientation())
    // GfRotation::GetQuaternion() != GfQuaternion::GetIdentity().
    const isIdentity = q[0] === 1 && q[1] === 0 && q[2] === 0 && q[3] === 0
    if (!scaleIsUniform(sc) && !isIdentity) {
      errors.push(_error(T.rigidBodyOrientationScale, usdPrim,
        `ScaleOrientation is not supported for rigid bodies, prim path: ${path}`))
    }
  }

  checkMassAPI(usdPrim, errors)
  return errors
}

// validators.cpp:355-363.
function checkNonUniformScale(usdPrim: Prim): boolean {
  return scaleIsUniform(_localToWorldTransform(usdPrim).getScale())
}

function _length(value: unknown): number {
  return value && typeof (value as ArrayLike<unknown>).length === 'number'
    ? (value as ArrayLike<unknown>).length : 0
}

// validators.cpp:366-487.
function _getColliderErrors(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  if (!_hasAPI(usdPrim, CollisionAPI) || !usdPrim.isA('Gprim')) return errors
  const T = UsdPhysicsValidationErrorNameTokens
  const path = usdPrim.path

  if (usdPrim.isA(Plane.typeName)) {
    const out: { bodyPrim: Prim | undefined } = { bodyPrim: undefined }
    if (hasDynamicBodyParent(usdPrim, out)) {
      let isKinematic = false
      if (out.bodyPrim && _hasAPI(out.bodyPrim, RigidBodyAPI)) {
        isKinematic = (new RigidBodyAPI(out.bodyPrim).getKinematicEnabledAttr().getValue() as
          boolean | undefined) ?? false
      }
      if (!isKinematic) {
        errors.push(_error(T.colliderPlaneDynamic, usdPrim,
          `UsdGeomPlane collider cannot be attached to a simulated rigid body, prim path: ${path}`))
      }
    }
  }

  if ([Sphere, Capsule, Capsule_1, Cylinder, Cylinder_1, Cone, Points]
    .some(schema => usdPrim.isA(schema.typeName))) {
    // non uniform scale check
    if (!checkNonUniformScale(usdPrim)) {
      errors.push(_error(T.colliderNonUniformScale, usdPrim,
        `Non-uniform scale is not supported for ${usdPrim.typeName} geometry, prim path: ${path}`))
    }
  }
  if (usdPrim.isA(Points.typeName)) {
    const shape = new Points(usdPrim)
    const positionsCount = _length(shape.getPointsAttr().getValue())

    const widthsPrimvar = PrimvarsAPI.getPrimvar(usdPrim, 'widths') // UsdGeomTokens->widths
    let widthsCount = 0
    let widthsSource: string
    if (widthsPrimvar && widthsPrimvar.hasAuthoredValue()) {
      if (widthsPrimvar.isIndexed()) {
        widthsCount = widthsPrimvar.getIndices()?.length ?? 0
        widthsSource = 'primvars:widths:indices'
      } else {
        widthsCount = _length(widthsPrimvar.getValue())
        widthsSource = 'primvars:widths'
      }
    } else {
      widthsCount = _length(shape.getWidthsAttr().getValue())
      widthsSource = 'widths'
    }

    if (widthsCount === 0 || positionsCount === 0 || widthsCount !== positionsCount) {
      errors.push(_error(T.colliderSpherePointsDataMissing, usdPrim,
        `UsdGeomPoints ${widthsSource} array has ${widthsCount} elements but points has `
        + `${positionsCount} elements, prim path: ${path}`))
    }
  }

  checkMassAPI(usdPrim, errors)
  return errors
}

// validators.cpp:489-550.
function _getArticulationErrors(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  if (!_hasAPI(usdPrim, ArticulationRootAPI)) return errors
  const T = UsdPhysicsValidationErrorNameTokens

  // nested articulation check: nested articulation roots are not supported
  if (checkNestedArticulationRoot(usdPrim)) {
    errors.push(_error(T.nestedArticulation, usdPrim,
      `Nested ArticulationRootAPI not supported, prim ${usdPrim.path}.`))
  }

  // rigid body static error
  if (_hasAPI(usdPrim, RigidBodyAPI)) {
    const bodyEnabled = (new RigidBodyAPI(usdPrim).getRigidBodyEnabledAttr().getValue() as
      boolean | undefined) ?? false
    if (!bodyEnabled) {
      errors.push(_error(T.articulationOnStaticBody, usdPrim,
        `ArticulationRootAPI definition on a static rigid body is not allowed. Prim: ${usdPrim.path}`))
    }
  }
  return errors
}

// validators.cpp:552-563: the first target, or the empty path.
function getRel(targets: readonly string[]): string {
  return targets[0] ?? ''
}

// validators.cpp:565-571.
enum JointRelStatus { Valid, Empty, InvalidPrim, NotXformable }

// validators.cpp:573-589.
function checkJointRel(relPath: string, jointPrim: Prim): JointRelStatus {
  if (relPath === '') return JointRelStatus.Empty
  const relPrim = jointPrim.getStage().getPrim(relPath)
  if (!relPrim?.isValid()) return JointRelStatus.InvalidPrim
  if (!relPrim.isA('Xformable')) return JointRelStatus.NotXformable
  return JointRelStatus.Valid
}

// validators.cpp:591-608: a body relationship may target any Xformable;
// joint parsing resolves it to its closest ancestor body.
function hasEnabledRigidBody(relPath: string, jointPrim: Prim): boolean {
  if (relPath === '') return false
  const relPrim = jointPrim.getStage().getPrim(relPath)
  if (!relPrim?.isValid()) return false
  return hasDynamicBodyParent(relPrim, { bodyPrim: undefined })
}

// validators.cpp:611-703.
function _getPhysicsJointErrors(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  if (!usdPrim.isA(Joint.typeName)) return errors
  const physicsJoint = new Joint(usdPrim)
  const T = UsdPhysicsValidationErrorNameTokens
  const path = usdPrim.path

  const targets0 = physicsJoint.getBody0Rel().getTargets()
  const targets1 = physicsJoint.getBody1Rel().getTargets()

  // valid rel prims
  {
    const rel0 = getRel(targets0)
    const rel1 = getRel(targets1)
    const status0 = checkJointRel(rel0, usdPrim)
    const status1 = checkJointRel(rel1, usdPrim)

    if (status0 === JointRelStatus.InvalidPrim || status1 === JointRelStatus.InvalidPrim) {
      errors.push(_error(T.jointInvalidPrimRel, usdPrim,
        `Joint (${path}) body relationship points to a non existent prim, joint will not be parsed.`))
    }
    if (status0 === JointRelStatus.NotXformable || status1 === JointRelStatus.NotXformable) {
      errors.push(_error(T.jointRelNotXformable, usdPrim,
        `Joint (${path}) body relationship must point to an Xformable prim.`))
    }
    if (!hasEnabledRigidBody(rel0, usdPrim) && !hasEnabledRigidBody(rel1, usdPrim)) {
      errors.push(_error(T.jointNoEnabledRigidBody, usdPrim,
        `Joint (${path}) must have at least one body relationship pointing to a prim with an `
        + 'enabled RigidBodyAPI.'))
    }
  }

  // multiple rel prims
  if (targets0.length > 1 || targets1.length > 1) {
    errors.push(_error(T.jointMultiplePrimsRel, usdPrim,
      `Joint prim does have relationship to multiple bodies this is not supported, jointPrim ${path}`))
  }
  return errors
}

// validators.cpp:705-724.
TfRegistryManager.add(UsdValidationRegistry, () => {
  const registry = UsdValidationRegistry.getInstance()
  registry.registerPluginPrimValidator(UsdPhysicsValidatorNameTokens.rigidBodyChecker, _getRigidBodyErrors)
  registry.registerPluginPrimValidator(UsdPhysicsValidatorNameTokens.colliderChecker, _getColliderErrors)
  registry.registerPluginPrimValidator(UsdPhysicsValidatorNameTokens.articulationChecker,
    _getArticulationErrors)
  registry.registerPluginPrimValidator(UsdPhysicsValidatorNameTokens.physicsJointChecker,
    _getPhysicsJointErrors)
})
