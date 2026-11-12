// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformable.cpp,
//  pxr/usd/usdPhysics/testenv/testUsdPhysicsRigidBodyAPI.py
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/testenv/testUsdPhysicsRigidBodyAPI.py
// UsdGeom.Xformable.ComputeLocalToWorldTransform(Usd.TimeCode.Default()) is
// UsdGeomXformCache::GetLocalToWorldTransform at the default time
// (pxr/usd/usdGeom/xformable.cpp); the typescript-usd XformCache provides it.
// RigidBodyAPI.computeMassProperties returns the Python binding's tuple
// (mass, diagonalInertia, centerOfMass, principalAxes). The hand-written
// usdGeom Cube has no createSizeAttr; Python's CreateSizeAttr(size) is
// written as getSizeAttr().set(size), which declares and authors the attribute.
import { describe, expect, it } from 'vitest'
import {
  IsClose as GfIsClose, Matrix3f, Matrix4d, Quatf, Transform, Vec3d, Vec3f, rotationToQuat,
} from 'typescript-usd/gf'
import { type Prim, Stage } from 'typescript-usd/usd'
import { Cube, setStageMetersPerUnit, setStageUpAxis, Xform, XformCache } from 'typescript-usd/usdGeom'
import { Material, MaterialBindingAPI } from 'typescript-usd/usdShade'
import {
  CollisionAPI, MassAPI, type MassInformation, MaterialAPI, RigidBodyAPI,
  setStageKilogramsPerUnit,
} from 'typescript-usd/usdPhysics'

describe('TestUsdPhysicsRigidBodyAPI', () => {
  let stage: Stage
  let rigidBodyWorldTransform: Matrix4d
  let rigidBodyPrim: Prim

  function computeLocalToWorldTransform(prim: Prim): Matrix4d {
    return new Matrix4d(...new XformCache(prim.getStage()).getLocalToWorldTransform(prim))
  }

  function setup_scene(metersPerUnit = 1.0, kilogramsPerUnit = 1.0): void {
    stage = Stage.createNew()
    expect(stage).toBeTruthy()

    // setup stage units
    setStageUpAxis(stage, 'Z')
    setStageMetersPerUnit(stage, metersPerUnit)
    setStageKilogramsPerUnit(stage, kilogramsPerUnit)
  }

  function get_collision_shape_local_transfrom(collisionLocalToWorld: Matrix4d, bodyLocalToWorld: Matrix4d): [Vec3d, Quatf] {
    const mat = collisionLocalToWorld.getMultiply(bodyLocalToWorld.getInverse())
    const colLocalTransform = new Transform(mat)

    const localPos = colLocalTransform.getTranslation()
    const q = rotationToQuat(colLocalTransform.getRotation())
    const localRotOut = new Quatf(q[0], q[1], q[2], q[3])

    // now apply the body scale to localPos
    // physics does not support scales, so a rigid body scale has to be baked into the localPos
    const tr = new Transform(bodyLocalToWorld)
    const sc = tr.getScale()

    localPos.setComponent(0, localPos.get(0) * sc.get(0))
    localPos.setComponent(1, localPos.get(1) * sc.get(1))
    localPos.setComponent(2, localPos.get(2) * sc.get(2))

    return [localPos, localRotOut]
  }

  function mass_information_fn(prim: Prim): MassInformation {
    const massInfo: MassInformation = {
      volume: 0, inertia: new Matrix3f(), centerOfMass: new Vec3f(0.0), localPos: new Vec3f(0.0), localRot: new Quatf(1.0),
    }
    if (prim.isA(Cube.typeName)) {
      const cubeLocalToWorldTransform = computeLocalToWorldTransform(prim)
      let extents = new Transform(cubeLocalToWorldTransform).getScale()

      const cube = new Cube(prim)
      let sizeAttr = cube.getSizeAttr().get() as number
      sizeAttr = Math.abs(sizeAttr)
      extents = extents.getScaled(sizeAttr)

      // cube volume
      massInfo.volume = extents.get(0) * extents.get(1) * extents.get(2)

      // cube inertia
      const inertia_diagonal = new Vec3f(
        1.0 / 12.0 * (extents.get(1) * extents.get(1) + extents.get(2) * extents.get(2)),
        1.0 / 12.0 * (extents.get(0) * extents.get(0) + extents.get(2) * extents.get(2)),
        1.0 / 12.0 * (extents.get(0) * extents.get(0) + extents.get(1) * extents.get(1)))
      massInfo.inertia = new Matrix3f(1.0)
      massInfo.inertia.setDiagonal(inertia_diagonal)

      // CoM
      massInfo.centerOfMass = new Vec3f(0.0)

      // local pose
      if (prim.path === rigidBodyPrim.path) {
        massInfo.localPos = new Vec3f(0.0)
        massInfo.localRot = new Quatf(1.0)
      } else {
        // massInfo.localPos, massInfo.localRot
        const [lp, lr] = get_collision_shape_local_transfrom(cubeLocalToWorldTransform, rigidBodyWorldTransform)
        massInfo.localPos = new Vec3f(lp)
        massInfo.localRot = new Quatf(lr)
      }
    } else {
      // print("UsdGeom type not supported.")
      massInfo.volume = -1.0
    }

    return massInfo
  }

  function compare_mass_information(rigidBodyAPI: RigidBodyAPI, expectedMass: number,
    expectedInertia?: Vec3f, expectedCoM?: Vec3f, expectedPrincipalAxes?: Quatf): void {
    const [mass, inertia, centerOfMass, principalAxes] = rigidBodyAPI.computeMassProperties(mass_information_fn)

    const toleranceEpsilon = 0.01

    expect(Math.abs(mass - expectedMass) < toleranceEpsilon).toBe(true)

    if (expectedCoM !== undefined) {
      expect(GfIsClose(centerOfMass, expectedCoM, toleranceEpsilon)).toBe(true)
    }

    if (expectedInertia !== undefined) {
      expect(GfIsClose(inertia, expectedInertia, toleranceEpsilon)).toBe(true)
    }

    if (expectedPrincipalAxes !== undefined) {
      expect(GfIsClose(principalAxes.GetImaginary(), expectedPrincipalAxes.GetImaginary(), toleranceEpsilon)).toBe(true)
      expect(Math.abs(principalAxes.GetReal() - expectedPrincipalAxes.GetReal()) < toleranceEpsilon).toBe(true)
    }
  }

  // base cube rigid body, expect CUBE rigid body mass properties computed from default density 1000
  it('test_mass_rigid_body_cube', () => {
    setup_scene()

    // Create test collider cube
    const cube = Cube.define(stage, '/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const rigidBodyAPI = RigidBodyAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(cube.prim)
    rigidBodyPrim = cube.prim

    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(166.667), new Vec3f(0.0))
  })

  // density tests

  // density test, applied density to a body
  it('test_mass_rigid_body_cube_rigid_body_density', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    const massAPI = MassAPI.apply(xform.prim)

    // set half the default gravity
    massAPI.getDensityAttr().set(500.0)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 500.0, new Vec3f(166.667 * 0.5), new Vec3f(0.0))
  })

  // density test, applied density to a collider
  it('test_mass_rigid_body_cube_collider_density', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const massAPI = MassAPI.apply(cube.prim)

    // set half the default gravity
    massAPI.getDensityAttr().set(500.0)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 500.0, new Vec3f(166.667 * 0.5), new Vec3f(0.0))
  })

  // density test, applied density to a material
  it('test_mass_rigid_body_cube_material_density', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    // Create base physics material
    const basePhysicsMaterial = Material.define(stage, '/basePhysicsMaterial')
    const materialAPI = MaterialAPI.apply(basePhysicsMaterial.prim)
    // set half the default gravity
    materialAPI.getDensityAttr().set(500.0)
    const bindingAPI = MaterialBindingAPI.apply(cube.prim)
    bindingAPI.bind(basePhysicsMaterial, 'weakerThanDescendants', 'physics')

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 500.0, new Vec3f(166.667 * 0.5), new Vec3f(0.0))
  })

  // density test, collision density precedence
  it('test_mass_rigid_body_cube_density_precedence', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    let massAPI = MassAPI.apply(xform.prim)
    massAPI.getDensityAttr().set(5000.0)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    massAPI = MassAPI.apply(cube.prim)

    // collision density does have precedence
    massAPI.getDensityAttr().set(500.0)

    // Create base physics material
    const basePhysicsMaterial = Material.define(stage, '/basePhysicsMaterial')
    const materialAPI = MaterialAPI.apply(basePhysicsMaterial.prim)
    // set half the default gravity
    materialAPI.getDensityAttr().set(2000.0)
    const bindingAPI = MaterialBindingAPI.apply(cube.prim)
    bindingAPI.bind(basePhysicsMaterial, 'weakerThanDescendants', 'physics')

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 500.0, new Vec3f(166.667 * 0.5), new Vec3f(0.0))
  })

  // mass tests

  // mass test, applied mass to a body
  it('test_mass_rigid_body_cube_rigid_body_mass', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    const massAPI = MassAPI.apply(xform.prim)

    // increase the mass twice
    massAPI.getMassAttr().set(2000.0)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 2000.0, new Vec3f(166.667 * 2.0), new Vec3f(0.0))
  })

  // mass test, applied mass to a collider
  it('test_mass_rigid_body_cube_collider_mass', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const massAPI = MassAPI.apply(cube.prim)

    // increase the mass twice
    massAPI.getMassAttr().set(2000.0)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 2000.0, new Vec3f(166.667 * 2.0), new Vec3f(0.0))
  })

  // mass test, applied mass precedence on a body
  it('test_mass_rigid_body_cube_mass_precedence', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    let massAPI = MassAPI.apply(xform.prim)

    // increase the mass twice (has a precedence)
    massAPI.getMassAttr().set(2000.0)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    massAPI = MassAPI.apply(cube.prim)

    // increase the mass twice
    massAPI.getMassAttr().set(500.0)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 2000.0, new Vec3f(166.667 * 2.0), new Vec3f(0.0))
  })

  // CoM tests
  // com test, applied com to a body
  it('test_mass_rigid_body_cube_rigid_body_com', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    const massAPI = MassAPI.apply(xform.prim)

    // custom CoM
    massAPI.getCenterOfMassAttr().set(new Vec3f(2.0))

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, undefined, new Vec3f(2.0))
  })

  // com test, applied com to a collider
  it('test_mass_rigid_body_cube_collider_com', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const massAPI = MassAPI.apply(cube.prim)

    // custom CoM
    massAPI.getCenterOfMassAttr().set(new Vec3f(2.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, undefined, new Vec3f(2.0))
  })

  // com test, precedence test rigid body has a precedence
  it('test_mass_rigid_body_cube_com_precedence', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    let massAPI = MassAPI.apply(xform.prim)

    // custom CoM (has precedence)
    massAPI.getCenterOfMassAttr().set(new Vec3f(2.0))

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    massAPI = MassAPI.apply(cube.prim)

    // custom CoM
    massAPI.getCenterOfMassAttr().set(new Vec3f(1.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, undefined, new Vec3f(2.0))
  })

  // inertia tests
  // inertia test, applied inertia to a body
  it('test_mass_rigid_body_cube_rigid_body_inertia', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    const massAPI = MassAPI.apply(xform.prim)

    // custom inertia
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(2.0))

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(2.0))
  })

  // com test, applied com to a collider
  it('test_mass_rigid_body_cube_collider_inertia', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const massAPI = MassAPI.apply(cube.prim)

    // custom inertia
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(2.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(2.0))
  })

  // inertia test, precedence test rigid body has a precedence
  it('test_mass_rigid_body_cube_inertia_precedence', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    let massAPI = MassAPI.apply(xform.prim)

    // custom inertia (has precedence)
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(2.0))

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    massAPI = MassAPI.apply(cube.prim)

    // custom inertia
    massAPI.getDiagonalInertiaAttr().set(new Vec3f(1.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(2.0))
  })

  // inertia test, test compound body
  it('test_mass_rigid_body_cube_rigid_body_compound', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    const size = 1.0
    const scale = new Vec3f(3.0, 2.0, 3.0)

    // Create test collider cube0
    let cube = Cube.define(stage, '/xform/cube0')
    cube.getSizeAttr().set(size)
    cube.addTranslateOp().set(new Vec3f(100.0, 20.0, 10.0))
    const cube0RotateOp = cube.addRotateXYZOp()
    cube0RotateOp.set(new Vec3f(0.0, 0.0, 45.0))
    cube.addScaleOp().set(scale)
    CollisionAPI.apply(cube.prim)

    // Create test collider cube1
    cube = Cube.define(stage, '/xform/cube1')
    cube.getSizeAttr().set(size)
    cube.addTranslateOp().set(new Vec3f(-100.0, 20.0, 10.0))
    const cube1RotateOp = cube.addRotateXYZOp()
    cube1RotateOp.set(new Vec3f(0.0, 0.0, 45.0))
    cube.addScaleOp().set(scale)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    const [, inertia_compare] = rigidBodyAPI.computeMassProperties(mass_information_fn)

    cube0RotateOp.set(new Vec3f(0.0, 90.0, 45.0))
    cube1RotateOp.set(new Vec3f(0.0, 0.0, 45.0))

    const [, inertia] = rigidBodyAPI.computeMassProperties(mass_information_fn)

    const toleranceEpsilon = 1
    expect(GfIsClose(inertia, inertia_compare, toleranceEpsilon)).toBe(true)
  })

  // principal axes tests
  // principal axes test, applied principal axis to a body
  it('test_mass_rigid_body_cube_rigid_body_principal_axes', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)
    const massAPI = MassAPI.apply(xform.prim)

    // custom principal axes
    massAPI.getPrincipalAxesAttr().set(new Quatf(0.707, 0.0, 0.707, 0.0))

    // Create test collider cube
    const cube = Cube.define(stage, '/xform/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0, undefined, undefined, new Quatf(0.707, 0.0, 0.707, 0.0))
  })

  // metersPerUnit default change
  it('test_mass_rigid_body_cube_cm_units', () => {
    setup_scene(0.01)

    // Create test collider cube
    const cube = Cube.define(stage, '/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const rigidBodyAPI = RigidBodyAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(cube.prim)
    rigidBodyPrim = cube.prim

    const massScale = 0.01 * 0.01 * 0.01
    compare_mass_information(rigidBodyAPI, 1000.0 * massScale, new Vec3f(166.667 * massScale), new Vec3f(0.0))
  })

  // kilogramsPerUnit default change
  it('test_mass_rigid_body_cube_decagram_units', () => {
    setup_scene(1.0, 0.1)

    // Create test collider cube
    const cube = Cube.define(stage, '/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    const rigidBodyAPI = RigidBodyAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(cube.prim)
    rigidBodyPrim = cube.prim

    const massScale = 1.0 / 0.1
    compare_mass_information(rigidBodyAPI, 1000.0 * massScale, new Vec3f(166.667 * massScale), new Vec3f(0.0))
  })

  // compound rigid body test
  it('test_mass_rigid_body_cube_compound', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Create test collider cube0
    const cube = Cube.define(stage, '/xform/cube0')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    cube.addTranslateOp().set(new Vec3f(0, 0, -2.0))

    // Create test colli
    const cube2 = Cube.define(stage, '/xform/cube1')
    cube2.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube2.prim)
    cube2.addTranslateOp().set(new Vec3f(0, 0, 2.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    compare_mass_information(rigidBodyAPI, 1000.0 * 2.0, undefined, new Vec3f(0.0))
  })

  // A collider with physics:collisionEnabled = false is not enabled and
  // takes no part in simulation, so it must not contribute to the aggregated
  // mass. A body whose only enabled collider is a unit cube should report the
  // same mass, center of mass, and inertia as if the disabled collider were
  // absent.
  it('test_mass_rigid_body_cube_disabled_collider', () => {
    setup_scene()

    // top level xform - rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Enabled collider cube0 at the origin.
    const cube = Cube.define(stage, '/xform/cube0')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    // Disabled collider cube1, offset so that if it were (incorrectly)
    // included it would both change the mass and shift the center of mass.
    const cube2 = Cube.define(stage, '/xform/cube1')
    cube2.getSizeAttr().set(1.0)
    const disabledCollisionAPI = CollisionAPI.apply(cube2.prim)
    disabledCollisionAPI.getCollisionEnabledAttr().set(false)
    cube2.addTranslateOp().set(new Vec3f(0, 0, 4.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    // Only the single enabled unit cube (default density 1000) contributes.
    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(166.667), new Vec3f(0.0))
  })

  // A nested rigid body only forms the root of its own subtree while it is
  // enabled. A nested body whose physics:rigidBodyEnabled is false takes no
  // part in simulation and therefore owns no colliders, so the enabled
  // colliders below it still belong to the nearest enabled body above it and
  // must still contribute their mass to it. Were the disabled body's subtree
  // pruned instead, that mass would be attributed to no body at all.
  it('test_mass_rigid_body_disabled_nested_body', () => {
    setup_scene()

    // top level xform - enabled rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Enabled collider cube0, owned directly by the top level body.
    const cube = Cube.define(stage, '/xform/cube0')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)
    cube.addTranslateOp().set(new Vec3f(0, 0, -2.0))

    // Disabled nested rigid body, offset from the top level body.
    const disabledBodyXform = Xform.define(stage, '/xform/disabledBody')
    const disabledBodyAPI = RigidBodyAPI.apply(disabledBodyXform.prim)
    disabledBodyAPI.getRigidBodyEnabledAttr().set(false)
    disabledBodyXform.addTranslateOp().set(new Vec3f(0, 0, 2.0))

    // Enabled collider cube1, below the disabled nested body.
    const cube2 = Cube.define(stage, '/xform/disabledBody/cube1')
    cube2.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube2.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    // Both unit cubes (default density 1000) contribute, and they are
    // placed symmetrically about the top level body's origin. This matches
    // test_mass_rigid_body_cube_compound, where the same two colliders are
    // owned directly by the body.
    compare_mass_information(rigidBodyAPI, 1000.0 * 2.0, undefined, new Vec3f(0.0))
  })

  // A disabled nested rigid body must not shadow an enabled body above it for
  // colliders that sit even deeper in the hierarchy, and an enabled body below
  // a disabled one must still own its own colliders.
  it('test_mass_rigid_body_disabled_nested_body_deep', () => {
    setup_scene()

    // top level xform - enabled rigid body
    const xform = Xform.define(stage, '/xform')
    const rigidBodyAPI = RigidBodyAPI.apply(xform.prim)

    // Disabled nested rigid body.
    const disabledBodyXform = Xform.define(stage, '/xform/disabledBody')
    const disabledBodyAPI = RigidBodyAPI.apply(disabledBodyXform.prim)
    disabledBodyAPI.getRigidBodyEnabledAttr().set(false)

    // Enabled collider nested under an intermediate Xform below the
    // disabled body, so the traversal has to continue past both.
    Xform.define(stage, '/xform/disabledBody/group')
    const cube = Cube.define(stage, '/xform/disabledBody/group/cube0')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    // An enabled nested body below the disabled one still forms the root of
    // its own subtree, so its collider belongs to it and not to /xform.
    const enabledBodyXform = Xform.define(stage, '/xform/disabledBody/enabledBody')
    RigidBodyAPI.apply(enabledBodyXform.prim)
    enabledBodyXform.addTranslateOp().set(new Vec3f(0, 0, 4.0))
    const cube2 = Cube.define(stage, '/xform/disabledBody/enabledBody/cube1')
    cube2.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube2.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(xform.prim)
    rigidBodyPrim = xform.prim

    // Only cube0 contributes to /xform: cube1 belongs to the enabled
    // nested body, whose subtree is still pruned.
    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(166.667), new Vec3f(0.0))
  })

  it('test_mass_rigid_body_nested', () => {
    setup_scene()

    // Create test nested bodies
    const rbo0_xform = Xform.define(stage, '/rbo0')
    const rigidBodyAPI0 = RigidBodyAPI.apply(rbo0_xform.prim)

    let cube = Cube.define(stage, '/rbo0/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    const rbo1_xform = Xform.define(stage, '/rbo0/rbo1')
    const rigidBodyAPI1 = RigidBodyAPI.apply(rbo1_xform.prim)

    cube = Cube.define(stage, '/rbo0/rbo1/cube')
    cube.getSizeAttr().set(2.0)
    CollisionAPI.apply(cube.prim)

    rigidBodyWorldTransform = computeLocalToWorldTransform(rbo0_xform.prim)
    rigidBodyPrim = rbo0_xform.prim

    compare_mass_information(rigidBodyAPI0, 1000.0, new Vec3f(166.667), new Vec3f(0.0))

    rigidBodyWorldTransform = computeLocalToWorldTransform(rbo1_xform.prim)
    rigidBodyPrim = rbo1_xform.prim

    compare_mass_information(rigidBodyAPI1, 8000.0, undefined, new Vec3f(0.0))
  })

  // instance proxy collider test - collider comes from an internal reference
  // on an instanceable prim; the instance proxy must still be found during
  // mass aggregation.
  it('test_mass_rigid_body_instance_proxy_collider', async () => {
    setup_scene()

    // Prototype collider authored outside the rigid-body hierarchy.
    stage.overridePrim('/Prototype_Collisions')
    const cube = Cube.define(stage, '/Prototype_Collisions/cube')
    cube.getSizeAttr().set(1.0)
    CollisionAPI.apply(cube.prim)

    // Body with density only; mass is computed from colliders.
    const bodyXform = Xform.define(stage, '/World/Body')
    const body = bodyXform.prim
    const rigidBodyAPI = RigidBodyAPI.apply(body)
    MassAPI.apply(body).createDensityAttr().set(1000.0)

    // Reference the prototype under the body and make it instanceable.
    const collisions = stage.definePrim('/World/Body/collisions')
    // UsdReferences::AddInternalReference: an empty asset path.
    await collisions.getReferences().addReference('', '/Prototype_Collisions')
    collisions.setInstanceable(true)

    rigidBodyWorldTransform = computeLocalToWorldTransform(body)
    rigidBodyPrim = body

    // Expected: same as a unit cube at default density (1000 * 1^3).
    compare_mass_information(rigidBodyAPI, 1000.0, new Vec3f(166.667), new Vec3f(0.0))
  })
})
