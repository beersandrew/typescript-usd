// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdPhysicsValidators/testenv/testUsdPhysicsValidation.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdPhysicsValidators/testenv/testUsdPhysicsValidation.py
//
// Each assert is an expect() here, in upstream order. Composition edits are
// asynchronous here (references, instanceable), so the test awaits
// stage.flushChanges() before reading the composed result.
import { describe, expect, it } from 'vitest'
import { Quatf, Transform, Vec3d, Vec3f, makeRotation } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import {
  Capsule, Cone, Cube, Cylinder, Mesh, Plane, Points, PrimvarsAPI, Scope, Sphere, Xform,
} from 'typescript-usd/usdGeom'
import { ArticulationRootAPI, CollisionAPI, Joint, MassAPI, RigidBodyAPI } from 'typescript-usd/usdPhysics'
import { ValidationRegistry } from 'typescript-usd/usdValidation'
import '../../src/index.ts'

function validatorNamed(name: string) {
  const validationRegistry = ValidationRegistry.getInstance()
  const validator = validationRegistry.getOrLoadValidatorByName(name)
  expect(validator).toBeDefined()
  return validator!
}

describe('TestUsdPhysicsValidation', () => {
  it('test_rigid_body_xformable', async () => {
    const validator = validatorNamed('usdPhysicsValidators:RigidBodyChecker')
    const stage = Stage.createNew()
    const rigidbody = Scope.define(stage, '/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)

    const errors = await validator.validate(rigidbody.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('RigidBodyNonXformable')
  })

  it('test_rigid_body_orientation_scale', async () => {
    const validator = validatorNamed('usdPhysicsValidators:RigidBodyChecker')
    const stage = Stage.createNew()
    const rigidbody = Xform.define(stage, '/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)

    let errors = await validator.validate(rigidbody.prim)
    expect(errors.length).toBe(0)

    const transform = new Transform()
    transform.setScale(new Vec3d(7, 8, 9))
    transform.setPivotOrientation(makeRotation([1, 2, 3], 20.3))

    const matrix = transform.getMatrix()
    rigidbody.addTransformOp().set(matrix)

    errors = await validator.validate(rigidbody.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('RigidBodyOrientationScale')
  })

  it('test_rigid_body_instancing', async () => {
    const validator = validatorNamed('usdPhysicsValidators:RigidBodyChecker')
    const stage = Stage.createNew()
    Xform.define(stage, '/xform')
    const rigidbody = Cube.define(stage, '/xform/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)

    const xform = Xform.define(stage, '/xformInstance')
    await xform.prim.getReferences().addReference('', '/xform')
    xform.prim.setInstanceable(true)
    await stage.flushChanges()

    let errors = await validator.validate(rigidbody.prim)
    expect(errors.length).toBe(0)

    const instanceRigidBody = stage.getPrim('/xformInstance/rigidBody')!
    expect(instanceRigidBody.isInstanceProxy()).toBe(true)

    errors = await validator.validate(instanceRigidBody)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('RigidBodyNonInstanceable')
  })

  it('test_articulation_nesting', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ArticulationChecker')
    const stage = Stage.createNew()
    const articulation0 = Xform.define(stage, '/articulation0')
    ArticulationRootAPI.apply(articulation0.prim)
    const articulation1 = Xform.define(stage, '/articulation0/articulation1')
    ArticulationRootAPI.apply(articulation1.prim)

    let errors = await validator.validate(articulation0.prim)
    expect(errors.length).toBe(0)

    errors = await validator.validate(articulation1.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('NestedArticulation')
  })

  it('test_articulation_body', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ArticulationChecker')
    const stage = Stage.createNew()
    const articulation = Xform.define(stage, '/articulation')
    ArticulationRootAPI.apply(articulation.prim)
    const rboAPI = RigidBodyAPI.apply(articulation.prim)

    let errors = await validator.validate(articulation.prim)
    expect(errors.length).toBe(0)

    rboAPI.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(articulation.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ArticulationOnStaticBody')

    rboAPI.getRigidBodyEnabledAttr().set(true)
    rboAPI.getKinematicEnabledAttr().set(true)
    errors = await validator.validate(articulation.prim)
    expect(errors.length).toBe(0)
  })

  it('test_physics_joint_invalid_rel', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()
    const body0 = Xform.define(stage, '/body0')
    RigidBodyAPI.apply(body0.prim)

    const physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody0Rel().addTarget('/body0')
    physicsJoint.getBody1Rel().addTarget('/invalidPrim')

    const errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointInvalidPrimRel')
  })

  it('test_physics_joint_rel_not_xformable', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()
    Scope.define(stage, '/scope')
    const xform = Xform.define(stage, '/xform')
    RigidBodyAPI.apply(xform.prim)

    const physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody0Rel().addTarget('/scope')
    physicsJoint.getBody1Rel().addTarget('/xform')

    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointRelNotXformable')

    // Xform is Xformable — should not trigger JointRelNotXformable
    physicsJoint.getBody0Rel().setTargets(['/xform'])
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)
  })

  it('test_physics_joint_requires_enabled_rigid_body', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()

    // Joint with no body rels — no enabled rigid body
    const physicsJoint = Joint.define(stage, '/joint')
    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')

    // Add one enabled rigid body — should clear the error
    const body0 = Xform.define(stage, '/body0')
    const rbo0 = RigidBodyAPI.apply(body0.prim)
    physicsJoint.getBody0Rel().addTarget('/body0')
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // Disable the rigid body — should fail again
    const body1 = Xform.define(stage, '/body1')
    const rbo1 = RigidBodyAPI.apply(body1.prim)
    rbo0.getRigidBodyEnabledAttr().set(false)
    rbo1.getRigidBodyEnabledAttr().set(false)
    physicsJoint.getBody1Rel().addTarget('/body1')
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')
  })

  it('test_physics_joint_enabled_rigid_body_on_ancestor', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    let stage = Stage.createNew()

    // A body relationship may target any UsdGeomXformable. Joint parsing
    // resolves a target to its closest ancestor body, so a collider below
    // an enabled body is a valid target.
    const body0 = Xform.define(stage, '/body0')
    RigidBodyAPI.apply(body0.prim)
    const collider0 = Cube.define(stage, '/body0/collider')
    CollisionAPI.apply(collider0.prim)

    const body1 = Xform.define(stage, '/body1')
    const rbo1 = RigidBodyAPI.apply(body1.prim)
    const collider1 = Cube.define(stage, '/body1/collider')
    CollisionAPI.apply(collider1.prim)

    let physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody0Rel().addTarget('/body0/collider')
    physicsJoint.getBody1Rel().addTarget('/body1/collider')

    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // Disabling the only enabled ancestor body fails the check
    const rbo0 = new RigidBodyAPI(body0.prim)
    rbo0.getRigidBodyEnabledAttr().set(false)
    rbo1.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')

    // Re-enabling either one of the bodies satisfies the check
    rbo0.getRigidBodyEnabledAttr().set(true)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    rbo0.getRigidBodyEnabledAttr().set(false)
    rbo1.getRigidBodyEnabledAttr().set(true)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // An ancestor collider without any body in the hierarchy is not a body
    stage = Stage.createNew()
    Xform.define(stage, '/group')
    const collider = Cube.define(stage, '/group/collider')
    CollisionAPI.apply(collider.prim)

    physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody0Rel().addTarget('/group/collider')
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')
  })

  it('test_physics_joint_enabled_rigid_body_nested', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()

    // Nested bodies: a disabled body is treated as though the API were not
    // applied at all, so the search continues past it to an enabled
    // ancestor body, matching joint and collider parsing
    const outerBody = Xform.define(stage, '/outer')
    const outerRbo = RigidBodyAPI.apply(outerBody.prim)
    const innerBody = Xform.define(stage, '/outer/inner')
    const innerRbo = RigidBodyAPI.apply(innerBody.prim)
    const collider = Cube.define(stage, '/outer/inner/collider')
    CollisionAPI.apply(collider.prim)

    const physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody0Rel().addTarget('/outer/inner/collider')

    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // Disabling the closest body still leaves the enabled outer body
    innerRbo.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // Removing the disabled body entirely is equivalent
    innerBody.prim.removeAPI(RigidBodyAPI.typeName)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // Only when no enabled body remains anywhere above does it fail
    RigidBodyAPI.apply(innerBody.prim).getRigidBodyEnabledAttr().set(false)
    outerRbo.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')
  })

  it('test_physics_joint_enabled_rigid_body_non_body_rel', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()

    // Only one body relationship needs to reach an enabled body. The other
    // may target a prim that is neither the world nor a body, such as an
    // asset root prim.
    const assetRoot = Xform.define(stage, '/asset')
    const body = Xform.define(stage, '/asset/body')
    const rbo = RigidBodyAPI.apply(body.prim)

    const physicsJoint = Joint.define(stage, '/asset/joint')
    physicsJoint.getBody0Rel().addTarget(assetRoot.path)
    physicsJoint.getBody1Rel().addTarget(body.path)

    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    // ... but it cannot stand in for one, so disabling the only body fails
    rbo.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointNoEnabledRigidBody')
  })

  it('test_physics_joint_multiple_rels', async () => {
    const validator = validatorNamed('usdPhysicsValidators:PhysicsJointChecker')
    const stage = Stage.createNew()
    const xform0 = Xform.define(stage, '/xform0')
    RigidBodyAPI.apply(xform0.prim)
    const xform1 = Xform.define(stage, '/xform1')
    RigidBodyAPI.apply(xform1.prim)

    const physicsJoint = Joint.define(stage, '/joint')
    physicsJoint.getBody1Rel().addTarget('/xform0')

    let errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(0)

    physicsJoint.getBody1Rel().addTarget('/xform1')
    errors = await validator.validate(physicsJoint.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('JointMultiplePrimsRel')
  })

  it('test_collider_non_uniform_scale', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ColliderChecker')
    const stage = Stage.createNew()

    const shapes = [Sphere, Capsule, Cone, Cylinder]
    for (const shapeType of shapes) {
      const shape = shapeType.define(stage, '/shape')
      CollisionAPI.apply(shape.prim)

      let errors = await validator.validate(shape.prim)
      expect(errors.length).toBe(0)

      shape.addScaleOp().set(new Vec3d(1, 2, 3))
      errors = await validator.validate(shape.prim)
      expect(errors.length).toBe(1)
      expect(errors[0]!.getName()).toBe('ColliderNonUniformScale')

      stage.removePrim(shape.prim.path)
    }
  })

  it('test_points_collider', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ColliderChecker')
    const stage = Stage.createNew()

    const shape = Points.define(stage, '/shape')
    CollisionAPI.apply(shape.prim)

    shape.getWidthsAttr().set([1])
    shape.getPointsAttr().set([new Vec3f(1.0)])
    let errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(0)

    shape.getWidthsAttr().set([])
    shape.getPointsAttr().set([new Vec3f(1.0)])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')

    shape.getWidthsAttr().set([1])
    shape.getPointsAttr().set([])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')

    shape.getWidthsAttr().set([1, 3])
    shape.getPointsAttr().set([new Vec3f(1.0)])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')

    shape.addScaleOp().set(new Vec3d(1, 2, 3))
    shape.getWidthsAttr().set([1])
    shape.getPointsAttr().set([new Vec3f(1.0)])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderNonUniformScale')

    stage.removePrim(shape.prim.path)
  })

  it('test_points_collider_primvar_widths', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ColliderChecker')

    const newShape = (): { stage: Stage, shape: Points } => {
      const stage = Stage.createNew()
      const shape = Points.define(stage, '/shape')
      CollisionAPI.apply(shape.prim)
      return { stage, shape }
    }

    // only widths attr authored, matching count — should pass
    let { stage, shape } = newShape()
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    shape.getWidthsAttr().set([1.0, 2.0])
    let errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(0)

    // only primvars:widths authored, matching count — should pass
    ;({ stage, shape } = newShape())
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    let primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    let widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([1.0, 2.0])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(0)

    // both authored, primvars:widths wins — widths attr has wrong count
    // but primvars:widths matches, so should pass
    ;({ stage, shape } = newShape())
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    shape.getWidthsAttr().set([1.0])
    primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([1.0, 2.0])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(0)

    // both authored, primvars:widths wins — primvars has wrong count
    // widths attr matches, but primvar takes priority so should fail
    ;({ stage, shape } = newShape())
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    shape.getWidthsAttr().set([1.0, 2.0])
    primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([1.0])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')

    // neither authored — should fail
    ;({ stage, shape } = newShape())
    shape.getPointsAttr().set([new Vec3f(1.0)])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')

    // indexed primvars:widths — 1 value, 2 indices matching 2 points
    ;({ stage, shape } = newShape())
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([1.0])
    primvarsAPI.setIndices('widths', [0, 0])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(0)

    // indexed primvars:widths — wrong flattened count
    primvarsAPI.setIndices('widths', [0])
    errors = await validator.validate(shape.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderSpherePointsDataMissing')
  })

  it('test_plane_collider_static_only', async () => {
    const validator = validatorNamed('usdPhysicsValidators:ColliderChecker')
    const stage = Stage.createNew()

    // Static plane collider (no rigid body parent) - should pass
    const plane = Plane.define(stage, '/staticPlane')
    CollisionAPI.apply(plane.prim)
    let errors = await validator.validate(plane.prim)
    expect(errors.length).toBe(0)

    // Plane under a dynamic rigid body - should fail
    const dynamicBody = Xform.define(stage, '/dynamicBody')
    const rboAPI = RigidBodyAPI.apply(dynamicBody.prim)
    const dynamicPlane = Plane.define(stage, '/dynamicBody/plane')
    CollisionAPI.apply(dynamicPlane.prim)
    errors = await validator.validate(dynamicPlane.prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('ColliderPlaneDynamic')

    // Plane under a static rigid body (enabled=false) - should pass
    rboAPI.getRigidBodyEnabledAttr().set(false)
    errors = await validator.validate(dynamicPlane.prim)
    expect(errors.length).toBe(0)

    // Plane under a kinematic rigid body - should pass
    rboAPI.getRigidBodyEnabledAttr().set(true)
    rboAPI.getKinematicEnabledAttr().set(true)
    errors = await validator.validate(dynamicPlane.prim)
    expect(errors.length).toBe(0)
  })

  it('test_rigid_body_mass_api', async () => {
    const rigidBodyValidator = validatorNamed('usdPhysicsValidators:RigidBodyChecker')
    const stage = Stage.createNew()

    const newBody = (path: string): { prim: ReturnType<typeof Xform.define>['prim'], massAPI: MassAPI } => {
      const rigidbody = Xform.define(stage, path)
      RigidBodyAPI.apply(rigidbody.prim)
      return { prim: rigidbody.prim, massAPI: MassAPI.apply(rigidbody.prim) }
    }

    // negative mass should fail
    let { prim, massAPI } = newBody('/rigidbody1')
    massAPI.getMassAttr().set(-5.0)
    let errors = await rigidBodyValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('MassInvalidValues')

    // negative density should fail
    stage.removePrim(prim.path)
    ;({ prim, massAPI } = newBody('/rigidbody2'))
    massAPI.getDensityAttr().set(-10.0)
    errors = await rigidBodyValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('DensityInvalidValues')

    // neither principalAxes nor diagonalInertia authored on rigid body - should pass
    ;({ prim, massAPI } = newBody('/rigidBody3'))
    errors = await rigidBodyValidator.validate(prim)
    expect(errors.length).toBe(0)

    const cases: [string, Quatf | undefined, Vec3f | undefined, number][] = [
      // only principalAxes authored with non-fallback value - should fail
      ['/rigidBody4', new Quatf(1.0, 0.0, 0.0, 0.0), undefined, 1],
      // only diagonalInertia authored with non-fallback value - should fail
      ['/rigidBody5', undefined, new Vec3f(1.0, 2.0, 3.0), 1],
      // both authored with valid values - should pass
      ['/rigidBody6', new Quatf(1.0, 0.0, 0.0, 0.0), new Vec3f(1.0, 2.0, 3.0), 0],
      // both authored with fallback values - should pass
      ['/rigidBody7', new Quatf(0.0, 0.0, 0.0, 0.0), new Vec3f(0.0, 0.0, 0.0), 0],
      // principalAxes fallback but diagonalInertia non-fallback - should fail
      ['/rigidBody8', new Quatf(0.0, 0.0, 0.0, 0.0), new Vec3f(1.0, 2.0, 3.0), 1],
      // principalAxes non-fallback but diagonalInertia fallback - should fail
      ['/rigidBody9', new Quatf(1.0, 0.0, 0.0, 0.0), new Vec3f(0.0, 0.0, 0.0), 1],
      // principalAxes is non-unit quaternion - should fail
      ['/rigidBody10', new Quatf(2.0, 0.0, 0.0, 0.0), new Vec3f(1.0, 2.0, 3.0), 1],
      // diagonalInertia has negative values - should fail
      ['/rigidBody11', new Quatf(1.0, 0.0, 0.0, 0.0), new Vec3f(-1.0, 2.0, 3.0), 1],
      // diagonalInertia has zero values - should fail
      ['/rigidBody12', new Quatf(1.0, 0.0, 0.0, 0.0), new Vec3f(0.0, 2.0, 3.0), 1],
      // valid normalized quaternion on rigid body - should pass (45 degree
      // rotation around Y axis)
      ['/rigidBody13', new Quatf(0.9238795, 0.0, 0.3826834, 0.0), new Vec3f(1.0, 2.0, 3.0), 0],
    ]
    for (const [path, principalAxes, diagonalInertia, expected] of cases) {
      stage.removePrim(prim.path)
      ;({ prim, massAPI } = newBody(path))
      if (principalAxes) massAPI.getPrincipalAxesAttr().set(principalAxes)
      if (diagonalInertia) massAPI.getDiagonalInertiaAttr().set(diagonalInertia)
      errors = await rigidBodyValidator.validate(prim)
      expect(errors.length, path).toBe(expected)
      if (expected) expect(errors[0]!.getName(), path).toBe('InertiaInvalidValues')
    }
  })

  it('test_collider_mass_api', async () => {
    const colliderValidator = validatorNamed('usdPhysicsValidators:ColliderChecker')
    const stage = Stage.createNew()

    const newCollider = (schema: { define(stage: Stage, path: string): { prim: ReturnType<typeof Cube.define>['prim'] } },
      path: string) => {
      const collider = schema.define(stage, path)
      CollisionAPI.apply(collider.prim)
      return { prim: collider.prim, massAPI: MassAPI.apply(collider.prim) }
    }

    // negative mass should fail
    let { prim, massAPI } = newCollider(Cylinder, '/collider1')
    massAPI.getMassAttr().set(-5.0)
    let errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('MassInvalidValues')

    // negative density should fail
    stage.removePrim(prim.path)
    ;({ prim, massAPI } = newCollider(Cone, '/collider2'))
    massAPI.getDensityAttr().set(-10.0)
    errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('DensityInvalidValues')

    // neither authored - should pass
    ;({ prim, massAPI } = newCollider(Sphere, '/collider3'))
    errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(0)

    // only principalAxes authored - should fail
    stage.removePrim(prim.path)
    ;({ prim, massAPI } = newCollider(Cube, '/collider4'))
    massAPI.getPrincipalAxesAttr().set(new Quatf(1.0, 0.0, 0.0, 0.0))
    errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('InertiaInvalidValues')

    // both authored with valid values - should pass
    stage.removePrim(prim.path)
    ;({ prim, massAPI } = newCollider(Mesh, '/collider5'))
    massAPI.getPrincipalAxesAttr().set(new Quatf(1.0, 0.0, 0.0, 0.0))
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(1.0, 2.0, 3.0))
    errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(0)

    // with invalid inertia - should fail
    stage.removePrim(prim.path)
    ;({ prim, massAPI } = newCollider(Capsule, '/collider6'))
    massAPI.getPrincipalAxesAttr().set(new Quatf(2.0, 0.0, 0.0, 0.0))
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(1.0, 2.0, 3.0))
    errors = await colliderValidator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getName()).toBe('InertiaInvalidValues')
  })
})
