// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdPhysics/testenv/testUsdPhysicsParsing.py,
//  pxr/usd/usdPhysics/wrapParseUtils.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/testenv/testUsdPhysicsParsing.py
// (testenv resources copied verbatim to fixtures/testUsdPhysicsParsing/resources).
//
// UsdPhysics.UsdPhysicsLoadStageFromPrimRange (Python) returns a dict keyed by
// ObjectType of (primPaths, descs); `UsdPhysicsLoadStageFromPrimRange` below
// builds the same Map over the C++ API loadStageFromPrimRange, as
// wrapParseUtils.cpp:254-295 does (an empty exclude/owner list passes
// nullptr; custom tokens pass only when a list is non-empty; each report
// replaces the entry for its type). SdfPath values are path strings, Sdf.Path()
// is ''. Python CreateXAttr(...).Set(v) on the hand-written usdGeom schemas,
// which have no create accessors, is written getXAttr().set(v).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  IsClose as GfIsClose, Quatf, Vec3f, decomposeRotation, quatToRotation,
} from 'typescript-usd/gf'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { type Prim, Stage } from 'typescript-usd/usd'
import {
  Capsule, Capsule_1, Cone, Cube, Cylinder, Cylinder_1, Subset as GeomSubset, Mesh, Plane, Points,
  PrimvarsAPI, Sphere, Xform, getStageUpAxis,
} from 'typescript-usd/usdGeom'
import { Material, MaterialBindingAPI } from 'typescript-usd/usdShade'
import {
  ArticulationDesc, ArticulationRootAPI, Axis, CollisionAPI, CollisionGroup, CollisionGroupDesc,
  type CustomTokens, CustomShapeDesc, D6JointDesc, DistanceJoint, DistanceJointDesc, DriveAPI, FilteredPairsAPI,
  FixedJoint, Joint, type JointDesc, JointDOF, LimitAPI, MaterialAPI, MeshCollisionAPI, MeshShapeDesc,
  type ObjectDesc, ObjectType, PrismaticJoint, PrismaticJointDesc, RevoluteJoint, RevoluteJointDesc,
  RigidBodyAPI, RigidBodyDesc, RigidBodyMaterialDesc, Scene, SceneDesc, type ShapeDesc, SphericalJoint,
  SphericalJointDesc, SpherePointsShapeDesc, Tokens as UsdPhysicsTokens, loadStageFromPrimRange,
} from 'typescript-usd/usdPhysics'

const toleranceEpsilon = 0.01

type RetDict = Map<ObjectType, [string[], ObjectDesc[]]>

// wrapParseUtils.cpp:254-295 (_UsdPhysicsLoadStageFromPrimRange) with
// ReportPhysicsObjectsFn (wrapParseUtils.cpp:56-232).
function UsdPhysicsLoadStageFromPrimRange(stage: Stage, includePaths: string[], excludePaths: string[] = [],
  customTokens?: CustomTokens, simulationOwners: string[] = []): RetDict {
  const retDict: RetDict = new Map()
  const customTokensValid = customTokens !== undefined &&
    (customTokens.jointTokens.length > 0 || customTokens.shapeTokens.length > 0 ||
      customTokens.instancerTokens.length > 0)
  loadStageFromPrimRange(stage, includePaths,
    (type, primPaths, objectDescs, userData) => {
      if (primPaths.length !== objectDescs.length) return
      ;(userData as RetDict).set(type, [[...primPaths], [...objectDescs]])
    },
    retDict,
    excludePaths.length > 0 ? excludePaths : undefined,
    customTokensValid ? customTokens : undefined,
    simulationOwners.length > 0 ? simulationOwners : undefined)
  return retDict
}

function UsdPhysicsCustomTokens(): CustomTokens {
  return { jointTokens: [], shapeTokens: [], instancerTokens: [] }
}

// Gf.Rotation(q).Decompose(Gf.Vec3d.XAxis(), Gf.Vec3d.YAxis(), Gf.Vec3d.ZAxis())
function eulerAnglesOf(q: Quatf): Vec3f {
  const im = q.GetImaginary()
  const r = quatToRotation([q.GetReal(), im.get(0), im.get(1), im.get(2)])
  return new Vec3f(decomposeRotation(r, [1, 0, 0], [0, 1, 0], [0, 0, 1]))
}

function zip<A, B>(a: readonly A[], b: readonly B[]): Array<[A, B]> {
  return a.map((x, i) => [x, b[i]!] as [A, B])
}

function setApiSchemasPrepended(stage: Stage, primPath: string, items: string[]): void {
  // Sdf.CreatePrimInLayer(layer, path) + primSpec.SetInfo(Usd.Tokens.apiSchemas, listOp)
  stage.getEditTarget().getLayer()!.setField(primPath, 'apiSchemas', {
    isExplicit: false, explicitItems: [], prependedItems: items, appendedItems: [], deletedItems: [],
  })
}

describe('TestUsdPhysicsParsing', () => {
  it('test_scene_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false

    for (const [key, value] of ret_dict) {
      if (key === ObjectType.Scene) {
        scene_found = true
        const [paths, scene_descs] = value
        for (const [p, scene_desc] of zip(paths, scene_descs as SceneDesc[])) {
          expect(p === scene.prim.path).toBe(true)
          if (getStageUpAxis(stage) === 'Y') {
            expect(GfIsClose(scene_desc.gravityDirection, new Vec3f(0.0, -1.0, 0.0), toleranceEpsilon)).toBe(true)
          } else if (getStageUpAxis(stage) === 'Z') {
            expect(GfIsClose(scene_desc.gravityDirection, new Vec3f(0.0, 0.0, -1.0), toleranceEpsilon)).toBe(true)
          }
          expect(Math.abs(scene_desc.gravityMagnitude - 981.0) <= toleranceEpsilon).toBe(true)
          expect(Math.abs(scene_desc.gravityMagnitude - 981.0) <= toleranceEpsilon).toBe(true)
        }
      }
    }

    expect(scene_found).toBe(true)
  })

  it('test_collision_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    let shape_prim: Prim | undefined = undefined
    const shapes: Record<string, Record<string, unknown>> = {
      sphere: { type: Sphere, radius: 30 },
      capsule: { type: Capsule, radius: 30, height: 10, axis: 'Y' },
      capsule_1: { type: Capsule_1, topRadius: 30, bottomRadius: 20, height: 10, axis: 'Y' },
      cone: { type: Cone, radius: 30, height: 10, axis: 'Z' },
      cylinder: { type: Cylinder, radius: 30, height: 10, axis: 'Y' },
      cylinder_1: { type: Cylinder_1, topRadius: 30, bottomRadius: 20, height: 10, axis: 'Y' },
      plane: { type: Plane, axis: 'Z' },
      mesh: { type: Mesh },
      points: { type: Points },
    }

    for (const [key, params] of Object.entries(shapes)) {
      if (shape_prim !== undefined) {
        stage.removePrim(shape_prim.path)
      }
      const type = params['type'] as { define(stage: Stage, path: string): Sphere }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shape = type.define(stage, '/Sphere') as any
      shape_prim = shape.prim as Prim

      if (key === 'sphere') {
        shape.getRadiusAttr().set(params['radius'])
      } else if (key === 'capsule' || key === 'cone' || key === 'cylinder') {
        shape.getRadiusAttr().set(params['radius'])
        shape.getHeightAttr().set(params['height'])
        shape.getAxisAttr().set(params['axis'])
      } else if (key === 'capsule_1' || key === 'cylinder_1') {
        shape.getRadiusTopAttr().set(params['topRadius'])
        shape.getRadiusBottomAttr().set(params['bottomRadius'])
        shape.getHeightAttr().set(params['height'])
        shape.getAxisAttr().set(params['axis'])
      } else if (key === 'plane') {
        shape.getAxisAttr().set(params['axis'])
      } else if (key === 'mesh') {
        const meshColAPI = MeshCollisionAPI.apply(shape.prim)
        meshColAPI.getApproximationAttr().set(UsdPhysicsTokens.convexHull)
      } else if (key === 'points') {
        shape.getWidthsAttr().set([5.0, 10.0])
        shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
      }

      const position = new Vec3f(100.0, 20.0, 10.0)
      const rotate_xyz = new Vec3f(0.0, 0.0, 45.0)
      const scale = new Vec3f(3.0, 3.0, 3.0)

      shape.addTranslateOp().set(position)
      shape.addRotateXYZOp().set(rotate_xyz)
      shape.addScaleOp().set(scale)

      CollisionAPI.apply(shape_prim)

      const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

      let scene_found = false
      let num_shape_found = 0

      let prim_path = ''
      const compare_shape_params = (desc: ShapeDesc): void => {
        expect(prim_path === shape_prim!.path).toBe(true)
        expect(desc.rigidBody === '').toBe(true)
        expect(desc.collisionEnabled === true).toBe(true)
        expect(desc.materials.length === 0).toBe(true)
        expect(desc.simulationOwners.length === 0).toBe(true)
        expect(desc.filteredCollisions.length === 0).toBe(true)

        // transformation
        expect(GfIsClose(position, desc.localPos, toleranceEpsilon)).toBe(true)
        const eulerAngles = eulerAnglesOf(desc.localRot)
        expect(GfIsClose(eulerAngles, rotate_xyz, toleranceEpsilon)).toBe(true)
        expect(GfIsClose(scale, desc.localScale, toleranceEpsilon)).toBe(true)
      }

      for (const [k, value] of ret_dict) {
        const [prim_paths, descs] = value
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pairs = zip(prim_paths, descs as any[])
        if (k === ObjectType.Scene) {
          scene_found = true
        } else if (k === ObjectType.SphereShape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // sphere shape
            expect(desc.radius).toBe((params['radius'] as number) * scale.get(0))

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.CapsuleShape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // capsule shape
            expect(desc.radius).toBe((params['radius'] as number) * scale.get(0))
            expect(desc.halfHeight).toBe((params['height'] as number) * 0.5 * scale.get(0))
            expect(desc.axis).toBe(Axis.Y)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.Capsule1Shape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // capsule_1 shape
            expect(desc.topRadius).toBe((params['topRadius'] as number) * scale.get(0))
            expect(desc.bottomRadius).toBe((params['bottomRadius'] as number) * scale.get(0))
            expect(desc.halfHeight).toBe((params['height'] as number) * 0.5 * scale.get(0))
            expect(desc.axis).toBe(Axis.Y)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.ConeShape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // cone shape
            expect(desc.radius).toBe((params['radius'] as number) * scale.get(0))
            expect(desc.halfHeight).toBe((params['height'] as number) * 0.5 * scale.get(0))
            expect(desc.axis).toBe(Axis.Z)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.CylinderShape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // cylinder shape
            expect(desc.radius).toBe((params['radius'] as number) * scale.get(0))
            expect(desc.halfHeight).toBe((params['height'] as number) * 0.5 * scale.get(0))
            expect(desc.axis).toBe(Axis.Y)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.Cylinder1Shape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // capsule_1 shape
            expect(desc.topRadius).toBe((params['topRadius'] as number) * scale.get(0))
            expect(desc.bottomRadius).toBe((params['bottomRadius'] as number) * scale.get(0))
            expect(desc.halfHeight).toBe((params['height'] as number) * 0.5 * scale.get(0))
            expect(desc.axis).toBe(Axis.Y)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.PlaneShape) {
          for (const [pp, desc] of pairs) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // plane shape
            expect(desc.axis).toBe(Axis.Z)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.MeshShape) {
          for (const [pp, desc] of pairs as Array<[string, MeshShapeDesc]>) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // mesh shape
            expect(desc.approximation === UsdPhysicsTokens.convexHull).toBe(true)
            expect(desc.doubleSided !== true).toBe(true)
            expect(GfIsClose(scale, desc.meshScale, toleranceEpsilon)).toBe(true)

            num_shape_found = num_shape_found + 1
          }
        } else if (k === ObjectType.SpherePointsShape) {
          for (const [pp, desc] of pairs as Array<[string, SpherePointsShapeDesc]>) {
            prim_path = pp
            // common shape
            compare_shape_params(desc)

            // sphere points shape
            expect(desc.spherePoints.length === 2).toBe(true)
            expect(desc.spherePoints[0]!.center.equals(new Vec3f(1.0))).toBe(true)
            expect(desc.spherePoints[1]!.center.equals(new Vec3f(2.0))).toBe(true)
            // scale * width * 0.5
            expect(desc.spherePoints[0]!.radius === 7.5).toBe(true)
            // scale * width * 0.5
            expect(desc.spherePoints[1]!.radius === 15.0).toBe(true)

            num_shape_found = num_shape_found + 1
          }
        }
      }

      expect(scene_found).toBe(true)
      expect(num_shape_found === 1).toBe(true)
    }
  })

  it('test_sphere_points_primvar_widths_parse', () => {
    let stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')

    const parse_sphere_points = (stage: Stage): SpherePointsShapeDesc | undefined => {
      const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])
      for (const [key, value] of ret_dict) {
        if (key === ObjectType.SpherePointsShape) {
          const [, descs] = value
          return descs.length ? descs[0] as SpherePointsShapeDesc : undefined
        }
      }
      return undefined
    }

    // only widths attr authored
    let shape = Points.define(stage, '/points')
    CollisionAPI.apply(shape.prim)
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    shape.getWidthsAttr().set([4.0, 6.0])

    let desc = parse_sphere_points(stage)!
    expect(desc.isValid).toBe(true)
    expect(desc.spherePoints.length).toBe(2)
    expect(desc.spherePoints[0]!.radius).toBeCloseTo(2.0, 7)
    expect(desc.spherePoints[1]!.radius).toBeCloseTo(3.0, 7)

    // only primvars:widths authored
    stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')
    shape = Points.define(stage, '/points')
    CollisionAPI.apply(shape.prim)
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    let primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    let widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([4.0, 6.0])

    desc = parse_sphere_points(stage)!
    expect(desc.isValid).toBe(true)
    expect(desc.spherePoints.length).toBe(2)
    expect(desc.spherePoints[0]!.radius).toBeCloseTo(2.0, 7)
    expect(desc.spherePoints[1]!.radius).toBeCloseTo(3.0, 7)

    // both authored, primvars:widths wins
    stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')
    shape = Points.define(stage, '/points')
    CollisionAPI.apply(shape.prim)
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    shape.getWidthsAttr().set([10.0, 20.0])
    primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([4.0, 6.0])

    desc = parse_sphere_points(stage)!
    expect(desc.isValid).toBe(true)
    expect(desc.spherePoints[0]!.radius).toBeCloseTo(2.0, 7)
    expect(desc.spherePoints[1]!.radius).toBeCloseTo(3.0, 7)

    // indexed primvars:widths
    stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')
    shape = Points.define(stage, '/points')
    CollisionAPI.apply(shape.prim)
    shape.getPointsAttr().set([new Vec3f(1.0), new Vec3f(2.0)])
    primvarsAPI = new PrimvarsAPI(shape.prim, stage)
    widthsPv = primvarsAPI.createPrimvar('widths', 'float[]')
    widthsPv.set([4.0])
    primvarsAPI.setIndices('widths', [0, 0])

    desc = parse_sphere_points(stage)!
    expect(desc.isValid).toBe(true)
    expect(desc.spherePoints.length).toBe(2)
    expect(desc.spherePoints[0]!.radius).toBeCloseTo(2.0, 7)
    expect(desc.spherePoints[1]!.radius).toBeCloseTo(2.0, 7)

    // neither authored — invalid
    stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')
    shape = Points.define(stage, '/points')
    CollisionAPI.apply(shape.prim)
    shape.getPointsAttr().set([new Vec3f(1.0)])

    desc = parse_sphere_points(stage)!
    expect(desc.isValid).toBe(false)
  })

  it('test_rigidbody_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const rigidbody = Xform.define(stage, '/rigidBody')
    const rboAPI = RigidBodyAPI.apply(rigidbody.prim)
    const position = new Vec3f(100.0, 20.0, 10.0)
    const rotate_xyz = new Vec3f(0.0, 0.0, 45.0)
    const scale = new Vec3f(3.0, 3.0, 3.0)

    rigidbody.addTranslateOp().set(position)
    rigidbody.addRotateXYZOp().set(rotate_xyz)
    rigidbody.addScaleOp().set(scale)

    const velocity = new Vec3f(20.0, 10.0, 5.0)
    const angular_vel = new Vec3f(10.0, 1.0, 2.0)
    rboAPI.getVelocityAttr().set(velocity)
    rboAPI.getAngularVelocityAttr().set(angular_vel)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let rigidbody_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        for (const _ of zip(prim_paths, descs)) {
          scene_found = true
        }
      } else if (key === ObjectType.RigidBody) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyDesc[])) {
          rigidbody_found = true
          expect(prim_path === rigidbody.prim.path).toBe(true)
          expect(desc.collisions.length === 0).toBe(true)
          expect(desc.filteredCollisions.length === 0).toBe(true)
          expect(desc.simulationOwners.length === 0).toBe(true)

          // transformation
          expect(GfIsClose(position, desc.position, toleranceEpsilon)).toBe(true)
          const eulerAngles = eulerAnglesOf(desc.rotation)
          expect(GfIsClose(eulerAngles, rotate_xyz, toleranceEpsilon)).toBe(true)
          expect(GfIsClose(scale, desc.scale, toleranceEpsilon)).toBe(true)

          expect(desc.rigidBodyEnabled === true).toBe(true)
          expect(desc.kinematicBody !== true).toBe(true)
          expect(desc.startsAsleep !== true).toBe(true)

          expect(GfIsClose(velocity, desc.linearVelocity, toleranceEpsilon)).toBe(true)
          expect(GfIsClose(angular_vel, desc.angularVelocity, toleranceEpsilon)).toBe(true)
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(rigidbody_found).toBe(true)
  })

  it('test_rigidbody_kinematic_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const rigidbody = Xform.define(stage, '/rigidBody')
    const rboAPI = RigidBodyAPI.apply(rigidbody.prim)
    rboAPI.getKinematicEnabledAttr().set(true)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let rigidbody_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.RigidBody) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyDesc[])) {
          rigidbody_found = true
          expect(prim_path).toBe(rigidbody.prim.path)
          expect(desc.rigidBodyEnabled).toBe(true)
          expect(desc.kinematicBody).toBe(true)
        }
      }
    }

    expect(rigidbody_found).toBe(true)
  })

  it('test_rigidbody_collision_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const rigidbody = Xform.define(stage, '/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)
    const rb_position = new Vec3f(100.0, 0.0, 0.0)
    const rb_rotate_xyz = new Vec3f(0.0, 0.0, 0.0)
    const rb_scale = new Vec3f(3.0, 3.0, 3.0)

    rigidbody.addTranslateOp().set(rb_position)
    rigidbody.addRotateXYZOp().set(rb_rotate_xyz)
    rigidbody.addScaleOp().set(rb_scale)

    const cube = Cube.define(stage, '/rigidBody/cube')
    CollisionAPI.apply(cube.prim)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let rigidbody_found = false
    let cube_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        for (const _ of zip(prim_paths, descs)) {
          scene_found = true
        }
      } else if (key === ObjectType.RigidBody) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyDesc[])) {
          rigidbody_found = true
          expect(prim_path === rigidbody.prim.path).toBe(true)
          expect(desc.collisions.length === 1).toBe(true)
          expect(desc.collisions[0] === cube.prim.path).toBe(true)

          // transformation
          expect(GfIsClose(rb_position, desc.position, toleranceEpsilon)).toBe(true)
          const eulerAngles = eulerAnglesOf(desc.rotation)
          expect(GfIsClose(eulerAngles, rb_rotate_xyz, toleranceEpsilon)).toBe(true)
          expect(GfIsClose(rb_scale, desc.scale, toleranceEpsilon)).toBe(true)
        }
      } else if (key === ObjectType.CubeShape) {
        for (const [prim_path, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          cube_found = true
          expect(prim_path === cube.prim.path).toBe(true)
          expect(desc.rigidBody === rigidbody.prim.path).toBe(true)

          // transformation
          expect(GfIsClose(new Vec3f(0.0), desc.localPos, toleranceEpsilon)).toBe(true)
          const eulerAngles = eulerAnglesOf(desc.localRot)
          expect(GfIsClose(eulerAngles, new Vec3f(0.0), toleranceEpsilon)).toBe(true)
          expect(GfIsClose(new Vec3f(1.0), desc.localScale, toleranceEpsilon)).toBe(true)
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(rigidbody_found).toBe(true)
    expect(cube_found).toBe(true)
  })

  // A nested rigid body only owns colliders while it is enabled. A
  // collider below a disabled nested body must be reported as belonging to
  // the nearest enabled rigid body above it, matching the subtree that
  // UsdPhysicsRigidBodyAPI::ComputeMassProperties aggregates.
  it('test_rigidbody_disabled_nested_body_collision_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    Scene.define(stage, '/physicsScene')

    const rigidbody = Xform.define(stage, '/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)

    // Disabled nested rigid body: it takes no part in simulation, so it
    // does not form the root of its own subtree.
    const disabled_body = Xform.define(stage, '/rigidBody/disabledBody')
    const disabled_body_api = RigidBodyAPI.apply(disabled_body.prim)
    disabled_body_api.getRigidBodyEnabledAttr().set(false)

    const cube = Cube.define(stage, '/rigidBody/disabledBody/cube')
    CollisionAPI.apply(cube.prim)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let rigidbody_found = false
    let cube_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.RigidBody) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyDesc[])) {
          if (prim_path === rigidbody.prim.path) {
            rigidbody_found = true
            // The collider below the disabled nested body belongs
            // to the enabled body above it.
            expect(desc.collisions.length === 1).toBe(true)
            expect(desc.collisions[0] === cube.prim.path).toBe(true)
          } else if (prim_path === disabled_body.prim.path) {
            // The disabled body owns no colliders.
            expect(desc.collisions.length === 0).toBe(true)
          }
        }
      } else if (key === ObjectType.CubeShape) {
        for (const [prim_path, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          cube_found = true
          expect(prim_path === cube.prim.path).toBe(true)
          expect(desc.rigidBody === rigidbody.prim.path).toBe(true)
        }
      }
    }

    expect(rigidbody_found).toBe(true)
    expect(cube_found).toBe(true)
  })

  // A disabled rigid body owns no colliders. With no enabled rigid body
  // above it, a collider below a disabled body is a static collision, so it
  // resolves to an empty body path.
  it('test_rigidbody_disabled_body_only_collision_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    Scene.define(stage, '/physicsScene')

    const disabled_body = Xform.define(stage, '/disabledBody')
    const disabled_body_api = RigidBodyAPI.apply(disabled_body.prim)
    disabled_body_api.getRigidBodyEnabledAttr().set(false)

    const cube = Cube.define(stage, '/disabledBody/cube')
    CollisionAPI.apply(cube.prim)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let cube_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.CubeShape) {
        for (const [prim_path, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          cube_found = true
          expect(prim_path).toBe(cube.prim.path)
          // The disabled body owns no colliders, so the cube is a
          // static collision with no owning body.
          expect(desc.rigidBody).toBe('')
        }
      }
    }

    expect(cube_found).toBe(true)
  })

  // A joint body relationship resolves to the nearest enabled rigid body
  // above its target. A disabled body is treated as though the API were not
  // applied at all, so it is skipped in favour of an enabled body above it.
  it('test_joint_disabled_body_rel_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    Scene.define(stage, '/physicsScene')

    const rigidbody = Xform.define(stage, '/rigidBody')
    RigidBodyAPI.apply(rigidbody.prim)

    const disabled_body = Xform.define(stage, '/rigidBody/disabledBody')
    const disabled_body_api = RigidBodyAPI.apply(disabled_body.prim)
    disabled_body_api.getRigidBodyEnabledAttr().set(false)

    const cube = Cube.define(stage, '/rigidBody/disabledBody/cube')
    CollisionAPI.apply(cube.prim)

    const joint = FixedJoint.define(stage, '/joint')
    joint.getBody0Rel().addTarget(cube.prim.path)

    let ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let joint_found = false
    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.FixedJoint) {
        for (const [, desc] of zip(prim_paths, descs as JointDesc[])) {
          joint_found = true
          // The disabled body is skipped, so the relationship
          // resolves to the enabled body above it.
          expect(desc.body0 === rigidbody.prim.path).toBe(true)
        }
      }
    }

    expect(joint_found).toBe(true)

    // With no enabled body above the target, the relationship no longer
    // resolves to a body.
    new RigidBodyAPI(rigidbody.prim).getRigidBodyEnabledAttr().set(false)

    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    joint_found = false
    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.FixedJoint) {
        for (const [, desc] of zip(prim_paths, descs as JointDesc[])) {
          joint_found = true
          expect(desc.body0 !== rigidbody.prim.path).toBe(true)
        }
      }
    }

    expect(joint_found).toBe(true)
  })

  // Check that if a single rigid body has many collision objects, the
  // multithreaded parsing works correctly.
  it('test_rigidbody_collision_multithreading_parse', () => {
    // somewhat arbitrary number - enough to reliably reproduce the
    // multithreded multiple-colliders-under-one-rigidbody bug, but still
    // finish in < .5s on my test machine.
    const NUM_COLLIDERS = 1000

    const stage = Stage.createNew()
    const body = Xform.define(stage, '/Body')
    RigidBodyAPI.apply(body.prim)

    for (let k = 0; k < NUM_COLLIDERS; k++) {
      const sphere = Sphere.define(stage, `/Body/SphereCollider_${k}`)
      CollisionAPI.apply(sphere.prim)
    }

    // UsdPhysics.LoadUsdPhysicsFromRange: the deprecated alias
    // (parseUtils.h:106-122).
    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let collider_count = 0
    for (const [key, value] of ret_dict) {
      const [prim_paths] = value
      if (key === ObjectType.SphereShape) {
        collider_count = prim_paths.length
      }
    }

    expect(collider_count, `Expected ${NUM_COLLIDERS} colliders, got ${collider_count}`).toBe(NUM_COLLIDERS)
  })

  it('test_filtering_pairs_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const rigidbody_0 = Xform.define(stage, '/rigidBody0')
    RigidBodyAPI.apply(rigidbody_0.prim)

    const cube_0 = Cube.define(stage, '/rigidBody0/cube')
    CollisionAPI.apply(cube_0.prim)

    const rigidbody_1 = Xform.define(stage, '/rigidBody1')
    RigidBodyAPI.apply(rigidbody_1.prim)
    const rb_filter = FilteredPairsAPI.apply(rigidbody_1.prim)
    rb_filter.getFilteredPairsRel().addTarget(rigidbody_0.prim.path)

    const cube_1 = Cube.define(stage, '/rigidBody1/cube')
    CollisionAPI.apply(cube_1.prim)
    const col_filter = FilteredPairsAPI.apply(cube_1.prim)
    col_filter.getFilteredPairsRel().addTarget(cube_0.prim.path)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let rigidbody_count = 0
    let cube_count = 0

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        for (const _ of zip(prim_paths, descs)) {
          scene_found = true
        }
      } else if (key === ObjectType.RigidBody) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyDesc[])) {
          rigidbody_count = rigidbody_count + 1
          if (prim_path === rigidbody_1.prim.path) {
            expect(desc.filteredCollisions.length === 1).toBe(true)
            expect(desc.filteredCollisions[0] === rigidbody_0.prim.path).toBe(true)
          }
        }
      } else if (key === ObjectType.CubeShape) {
        for (const [prim_path, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          cube_count = cube_count + 1
          if (prim_path === cube_1.prim.path) {
            expect(desc.filteredCollisions.length === 1).toBe(true)
            expect(desc.filteredCollisions[0] === cube_0.prim.path).toBe(true)
          }
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(rigidbody_count === 2).toBe(true)
    expect(cube_count === 2).toBe(true)
  })

  // materials
  it('test_collision_material_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const cube = Cube.define(stage, '/cube')
    CollisionAPI.apply(cube.prim)

    // single material
    const materialPrim = Material.define(stage, '/physicsMaterial')
    MaterialAPI.apply(materialPrim.prim)
    const bindingAPI = MaterialBindingAPI.apply(cube.prim)
    bindingAPI.bind(materialPrim, 'weakerThanDescendants', 'physics')

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let cube_found = false
    let material_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        for (const _ of zip(prim_paths, descs)) {
          scene_found = true
        }
      } else if (key === ObjectType.CubeShape) {
        for (const [, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          cube_found = true
          expect(desc.materials.length === 1).toBe(true)
          desc.materials[0] = materialPrim.prim.path
        }
      } else if (key === ObjectType.RigidBodyMaterial) {
        for (const [prim_path, desc] of zip(prim_paths, descs as RigidBodyMaterialDesc[])) {
          material_found = true
          expect(prim_path === materialPrim.prim.path).toBe(true)
          expect(desc.staticFriction).toBe(0)
          expect(desc.dynamicFriction).toBe(0)
          expect(desc.restitution).toBe(0)
          expect(desc.density).toBe(0)
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(cube_found).toBe(true)
    expect(material_found).toBe(true)
  })

  it('test_collision_multi_material_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const mesh = Mesh.define(stage, '/mesh')
    CollisionAPI.apply(mesh.prim)
    const meshColAPI = MeshCollisionAPI.apply(mesh.prim)
    meshColAPI.getApproximationAttr().set(UsdPhysicsTokens.none)

    // materials
    const materialPrim0 = Material.define(stage, '/physicsMaterial0')
    MaterialAPI.apply(materialPrim0.prim)
    const materialPrim1 = Material.define(stage, '/physicsMaterial1')
    MaterialAPI.apply(materialPrim1.prim)

    const materials = [materialPrim0, materialPrim1]

    // Fill in VtArrays
    const points: Vec3f[] = []
    const normals: Vec3f[] = []
    const indices: number[] = []
    const vertexCounts: number[] = []

    const stripSize = 100.0
    const halfSize = 500.0

    for (let i = 0; i < 2; i++) {
      const subset = GeomSubset.define(stage, '/mesh/subset' + String(i))
      subset.getElementTypeAttr().set('face')
      const subset_indices = [i]

      const bindingAPI = MaterialBindingAPI.apply(subset.prim)
      bindingAPI.bind(materials[i]!, 'weakerThanDescendants', 'physics')

      points.push(new Vec3f(-stripSize / 2.0 + stripSize * i, -halfSize, 0.0))
      points.push(new Vec3f(-stripSize / 2.0 + stripSize * (i + 1), -halfSize, 0.0))
      points.push(new Vec3f(-stripSize / 2.0 + stripSize * (i + 1), halfSize, 0.0))
      points.push(new Vec3f(-stripSize / 2.0 + stripSize * i, halfSize, 0.0))

      for (let j = 0; j < 4; j++) {
        normals.push(new Vec3f(0, 0, 1))
        indices.push(j + i * 4)
      }

      subset.getIndicesAttr().set(subset_indices)
      vertexCounts.push(4)
    }

    mesh.getFaceVertexCountsAttr().set(vertexCounts)
    mesh.getFaceVertexIndicesAttr().set(indices)
    mesh.getPointsAttr().set(points)
    mesh.getDoubleSidedAttr().set(false)
    mesh.getNormalsAttr().set(normals)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let mesh_found = false
    let num_materials = 0

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        for (const _ of zip(prim_paths, descs)) {
          scene_found = true
        }
      } else if (key === ObjectType.MeshShape) {
        for (const [, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          mesh_found = true
          expect(desc.materials.length === 2).toBe(true)
          expect(desc.materials[0] === materialPrim0.prim.path).toBe(true)
          expect(desc.materials[1] === materialPrim1.prim.path).toBe(true)
        }
      } else if (key === ObjectType.RigidBodyMaterial) {
        for (const _ of zip(prim_paths, descs)) {
          num_materials = num_materials + 1
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(mesh_found).toBe(true)
    expect(num_materials === 2).toBe(true)
  })

  // joints
  it('test_joint_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const rigid_body_0 = Xform.define(stage, '/rigidBody0')
    RigidBodyAPI.apply(rigid_body_0.prim)
    const rigid_body_1 = Xform.define(stage, '/rigidBody1')
    RigidBodyAPI.apply(rigid_body_1.prim)

    let joint_prim: Prim | undefined = undefined
    const joints: Record<string, Record<string, unknown>> = {
      fixed: { type: FixedJoint },
      revolute0: { type: RevoluteJoint, axis: 'Y', limit: true, drive: true },
      revolute1: { type: RevoluteJoint, axis: 'Y', limit: false, drive: false },
      prismatic0: { type: PrismaticJoint, axis: 'Z', limit: true, drive: true },
      prismatic1: { type: PrismaticJoint, axis: 'Z', limit: false, drive: false },
      spherical: { type: SphericalJoint, axis: 'Z' },
      distance: { type: DistanceJoint },
      d6: { type: Joint },
    }

    for (const [key, params] of Object.entries(joints)) {
      if (joint_prim !== undefined) {
        stage.removePrim(joint_prim.path)
      }
      const type = params['type'] as { define(stage: Stage, path: string): Joint }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const joint = type.define(stage, '/joint') as any
      joint_prim = joint.prim as Prim

      // common part
      joint.getBody0Rel().addTarget(rigid_body_0.prim.path)
      joint.getBody1Rel().addTarget(rigid_body_1.prim.path)

      joint.getBreakForceAttr().set(500)
      joint.getBreakTorqueAttr().set(1500)

      joint.getLocalPos0Attr().set(new Vec3f(1.0))
      joint.getLocalPos1Attr().set(new Vec3f(-1.0))

      if (key === 'revolute0' || key === 'revolute1') {
        joint.getAxisAttr().set(params['axis'])
        if (params['limit']) {
          joint.getLowerLimitAttr().set(0)
          joint.getUpperLimitAttr().set(90)
        }
        if (params['drive']) {
          const drive = DriveAPI.apply(joint.prim, UsdPhysicsTokens.angular)
          drive.getTargetPositionAttr().set(10)
          drive.getTargetVelocityAttr().set(20)
          drive.getStiffnessAttr().set(30)
          drive.getDampingAttr().set(40)
        }
      } else if (key === 'prismatic0' || key === 'prismatic1') {
        joint.getAxisAttr().set(params['axis'])
        if (params['limit']) {
          joint.getLowerLimitAttr().set(10)
          joint.getUpperLimitAttr().set(80)
        }
        if (params['drive']) {
          const drive = DriveAPI.apply(joint.prim, UsdPhysicsTokens.linear)
          drive.getTargetPositionAttr().set(10)
          drive.getTargetVelocityAttr().set(20)
          drive.getStiffnessAttr().set(30)
          drive.getDampingAttr().set(40)
        }
      } else if (key === 'spherical') {
        joint.getAxisAttr().set(params['axis'])
        joint.createConeAngle0LimitAttr().set(20)
        joint.createConeAngle1LimitAttr().set(30)
      } else if (key === 'distance') {
        joint.getMinDistanceAttr().set(0)
        joint.getMaxDistanceAttr().set(10)
      } else if (key === 'd6') {
        const x_trans_lim = LimitAPI.apply(joint.prim, UsdPhysicsTokens.transX)
        x_trans_lim.createLowAttr().set(-10)
        x_trans_lim.createHighAttr().set(10)
        const y_trans_lim = LimitAPI.apply(joint.prim, UsdPhysicsTokens.transY)
        y_trans_lim.createLowAttr().set(-20)
        y_trans_lim.createHighAttr().set(20)

        const x_rot_lim = LimitAPI.apply(joint.prim, UsdPhysicsTokens.rotX)
        x_rot_lim.createLowAttr().set(-30)
        x_rot_lim.createHighAttr().set(30)
        const y_rot_lim = LimitAPI.apply(joint.prim, UsdPhysicsTokens.rotY)
        y_rot_lim.createLowAttr().set(30)
        y_rot_lim.createHighAttr().set(-30)

        const drive = DriveAPI.apply(joint.prim, UsdPhysicsTokens.rotX)
        drive.getTargetPositionAttr().set(10)
        drive.getTargetVelocityAttr().set(20)
        drive.getStiffnessAttr().set(30)
        drive.getDampingAttr().set(40)
      }

      const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

      let scene_found = false
      let num_joints_found = 0

      let prim_path = ''
      const compare_joint_params = (desc: JointDesc): void => {
        expect(prim_path === joint_prim!.path).toBe(true)

        expect(desc.rel0 === rigid_body_0.prim.path).toBe(true)
        expect(desc.body0 === rigid_body_0.prim.path).toBe(true)
        expect(desc.rel1 === rigid_body_1.prim.path).toBe(true)
        expect(desc.body1 === rigid_body_1.prim.path).toBe(true)

        expect(GfIsClose(desc.localPose0Position, new Vec3f(1.0), toleranceEpsilon)).toBe(true)
        expect(GfIsClose(desc.localPose1Position, new Vec3f(-1.0), toleranceEpsilon)).toBe(true)

        expect(desc.jointEnabled === true).toBe(true)
        expect(desc.collisionEnabled === false).toBe(true)
        expect(desc.excludeFromArticulation === false).toBe(true)

        expect(desc.breakForce).toBe(500)
        expect(desc.breakTorque).toBe(1500)
      }

      for (const [k, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (k === ObjectType.Scene) {
          scene_found = true
        } else if (k === ObjectType.FixedJoint) {
          for (const [pp, desc] of zip(prim_paths, descs as JointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            num_joints_found = num_joints_found + 1
          }
        } else if (k === ObjectType.RevoluteJoint) {
          for (const [pp, desc] of zip(prim_paths, descs as RevoluteJointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            // revolute joint part
            expect(desc.axis === Axis.Y).toBe(true)

            // limit
            if (params['limit']) {
              expect(desc.limit.enabled === true).toBe(true)
              expect(desc.limit.lower).toBe(0)
              expect(desc.limit.upper).toBe(90)
            } else {
              expect(desc.limit.enabled === false).toBe(true)
            }

            // drive
            if (params['drive']) {
              expect(desc.drive.enabled === true).toBe(true)
              expect(desc.drive.targetPosition).toBe(10)
              expect(desc.drive.targetVelocity).toBe(20)
              expect(desc.drive.stiffness).toBe(30)
              expect(desc.drive.damping).toBe(40)
            } else {
              expect(desc.drive.enabled === false).toBe(true)
            }

            num_joints_found = num_joints_found + 1
          }
        } else if (k === ObjectType.PrismaticJoint) {
          for (const [pp, desc] of zip(prim_paths, descs as PrismaticJointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            // prismatic joint part
            expect(desc.axis === Axis.Z).toBe(true)

            // limit
            if (params['limit']) {
              expect(desc.limit.enabled === true).toBe(true)
              expect(desc.limit.lower).toBe(10)
              expect(desc.limit.upper).toBe(80)
            } else {
              expect(desc.limit.enabled === false).toBe(true)
            }

            // drive
            if (params['drive']) {
              expect(desc.drive.enabled === true).toBe(true)
              expect(desc.drive.targetPosition).toBe(10)
              expect(desc.drive.targetVelocity).toBe(20)
              expect(desc.drive.stiffness).toBe(30)
              expect(desc.drive.damping).toBe(40)
            } else {
              expect(desc.drive.enabled === false).toBe(true)
            }

            num_joints_found = num_joints_found + 1
          }
        } else if (k === ObjectType.D6Joint) {
          for (const [pp, desc] of zip(prim_paths, descs as D6JointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            // d6 joint part
            expect(desc.jointLimits.length === 4).toBe(true)
            expect(desc.jointDrives.length === 1).toBe(true)

            // drive for rotX
            const xDrivePair = desc.jointDrives[0]!
            expect(xDrivePair[0] === JointDOF.RotX).toBe(true)
            const xDrive = xDrivePair[1]
            expect(xDrive.enabled === true).toBe(true)
            expect(xDrive.targetPosition).toBe(10)
            expect(xDrive.targetVelocity).toBe(20)
            expect(xDrive.stiffness).toBe(30)
            expect(xDrive.damping).toBe(40)

            // limits
            for (const d6_limit of desc.jointLimits) {
              const limit_dof = d6_limit[0]
              const limit = d6_limit[1]
              if (limit_dof === JointDOF.TransX) {
                expect(limit.enabled === true).toBe(true)
                expect(limit.lower).toBe(-10)
                expect(limit.upper).toBe(10)
              } else if (limit_dof === JointDOF.TransY) {
                expect(limit.enabled === true).toBe(true)
                expect(limit.lower).toBe(-20)
                expect(limit.upper).toBe(20)
              } else if (limit_dof === JointDOF.RotX) {
                expect(limit.enabled === true).toBe(true)
                expect(limit.lower).toBe(-30)
                expect(limit.upper).toBe(30)
              } else if (limit_dof === JointDOF.RotY) {
                expect(limit.enabled === true).toBe(true)
                // lower higher then upper means DOF is locked
                expect(limit.lower).toBe(30)
                expect(limit.upper).toBe(-30)
              }
            }

            num_joints_found = num_joints_found + 1
          }
        } else if (k === ObjectType.SphericalJoint) {
          for (const [pp, desc] of zip(prim_paths, descs as SphericalJointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            // spherical joint part
            expect(desc.axis === Axis.Z).toBe(true)
            expect(desc.limit.enabled === true).toBe(true)
            // lower maps to cone0 angle
            expect(desc.limit.lower).toBe(20)
            // upper maps to cone1 angle
            expect(desc.limit.upper).toBe(30)

            num_joints_found = num_joints_found + 1
          }
        } else if (k === ObjectType.DistanceJoint) {
          for (const [pp, desc] of zip(prim_paths, descs as DistanceJointDesc[])) {
            prim_path = pp
            // common joint
            compare_joint_params(desc)

            // distance joint part
            // limit can be per min/max, limit.enabled not used
            expect(desc.minEnabled === true).toBe(true)
            expect(desc.maxEnabled === true).toBe(true)
            // lower maps to min
            expect(desc.limit.lower).toBe(0)
            // upper maps to max
            expect(desc.limit.upper).toBe(10)

            num_joints_found = num_joints_found + 1
          }
        }
      }

      expect(scene_found).toBe(true)
      expect(num_joints_found === 1).toBe(true)
    }
  })

  // articulations: test_articulation_parse, test_articulation_kinematic_parse
  // and test_nested_bodies_articulation_parse share this body.
  function runArticulationCase(nested: boolean, kinematic: boolean, articulations: string[],
    floatingRoot: 0 | 1): void {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    // top level xform
    const top_xform = Xform.define(stage, '/xform')

    const rigid_body_0 = Xform.define(stage, '/xform/rigidBody0')
    let rboAPI = RigidBodyAPI.apply(rigid_body_0.prim)
    if (kinematic) rboAPI.getKinematicEnabledAttr().set(true)
    const rigid_body_1 = Xform.define(stage, nested ? '/xform/rigidBody0/rigidBody1' : '/xform/rigidBody1')
    rboAPI = RigidBodyAPI.apply(rigid_body_1.prim)
    if (kinematic) rboAPI.getKinematicEnabledAttr().set(true)
    const rigid_body_2 = Xform.define(stage,
      nested ? '/xform/rigidBody0/rigidBody1/rigidBody2' : '/xform/rigidBody2')
    rboAPI = RigidBodyAPI.apply(rigid_body_2.prim)
    if (kinematic) rboAPI.getKinematicEnabledAttr().set(true)

    const joint_0 = RevoluteJoint.define(stage, '/xform/revoluteJoint0')
    joint_0.getBody0Rel().addTarget(rigid_body_0.prim.path)
    joint_0.getBody1Rel().addTarget(rigid_body_1.prim.path)

    const joint_1 = RevoluteJoint.define(stage, '/xform/revoluteJoint1')
    joint_1.getBody0Rel().addTarget(rigid_body_1.prim.path)
    joint_1.getBody1Rel().addTarget(rigid_body_2.prim.path)

    let articulation_api_prim: Prim | undefined = undefined
    let fixed_joint: FixedJoint | undefined = undefined

    const floating_body = floatingRoot === 0 ? rigid_body_0 : rigid_body_1

    for (const type of articulations) {
      if (articulation_api_prim !== undefined) {
        articulation_api_prim.removeAPI(ArticulationRootAPI.typeName)
        articulation_api_prim = undefined
      }

      if (type === 'fixed') {
        fixed_joint = FixedJoint.define(stage, '/xform/fixedJoint')
        fixed_joint.getBody1Rel().addTarget(rigid_body_0.prim.path)
        ArticulationRootAPI.apply(fixed_joint.prim)
        articulation_api_prim = fixed_joint.prim
      } else if (type === 'floating') {
        ArticulationRootAPI.apply(floating_body.prim)
        articulation_api_prim = floating_body.prim
      } else if (type === 'auto' || type === 'auto_fixed') {
        ArticulationRootAPI.apply(top_xform.prim)
        articulation_api_prim = top_xform.prim
      }

      const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

      let scene_found = false
      let articulation_found = false

      for (const [key, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (key === ObjectType.Scene) {
          scene_found = true
        } else if (key === ObjectType.Articulation) {
          for (const [, desc] of zip(prim_paths, descs as ArticulationDesc[])) {
            articulation_found = true

            expect(desc.rootPrims.length === 1).toBe(true)

            if (type === 'floating' || type === 'auto') {
              expect(desc.articulatedJoints.length === 2).toBe(true)
              expect(desc.articulatedBodies.length === 3).toBe(true)

              expect(desc.rootPrims[0] === floating_body.prim.path).toBe(true)
            } else {
              expect(desc.articulatedJoints.length === 3).toBe(true)
              // SdfPath returned for the static body
              expect(desc.articulatedBodies.length === 4).toBe(true)

              expect(desc.rootPrims[0] === fixed_joint!.prim.path).toBe(true)
            }
          }
        }
      }

      expect(scene_found).toBe(true)
      expect(articulation_found).toBe(true)
    }
  }

  it('test_articulation_parse', () => {
    runArticulationCase(false, false, ['floating', 'auto', 'fixed', 'auto_fixed'], 1)
  })

  it('test_nested_bodies_articulation_parse', () => {
    runArticulationCase(true, false, ['floating', 'auto', 'fixed'], 0)
  })

  it('test_articulation_kinematic_parse', () => {
    runArticulationCase(false, true, ['floating', 'auto', 'fixed', 'auto_fixed'], 1)
  })

  it('test_collision_groups_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const num_collision_groups = 10

    const collision_groups: CollisionGroup[] = []
    for (let i = 0; i < num_collision_groups; i++) {
      const collision_group = CollisionGroup.define(stage, '/collision_group' + String(i))
      collision_group.getInvertFilteredGroupsAttr().set(false)
      collision_groups.push(collision_group)
      if (i === 0) {
        collision_group.getFilteredGroupsRel().addTarget('/collision_group' + String(num_collision_groups - 1))
      } else {
        collision_group.getFilteredGroupsRel().addTarget('/collision_group' + String(i - 1))
        if (i % 3 === 0) {
          collision_group.getMergeGroupNameAttr().set('three')
        }
        if (i % 4 === 0) {
          collision_group.getMergeGroupNameAttr().set('four')
        }
      }
    }

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let num_reported_collision_groups = 0

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        scene_found = true
      } else if (key === ObjectType.CollisionGroup) {
        for (const [prim_path, desc] of zip(prim_paths, descs as CollisionGroupDesc[])) {
          if (desc.mergeGroupName === 'three') {
            expect(prim_path === collision_groups[3]!.prim.path).toBe(true)
            expect(desc.mergedGroups.length === 3).toBe(true)
            expect(desc.filteredGroups.length === 3).toBe(true)
            expect(desc.filteredGroups[0] === '/collision_group2').toBe(true)
            expect(desc.filteredGroups[1] === '/collision_group5').toBe(true)
            expect(desc.filteredGroups[2] === '/collision_group8').toBe(true)
          } else if (desc.mergeGroupName === 'four') {
            expect(prim_path === collision_groups[4]!.prim.path).toBe(true)
            expect(desc.mergedGroups.length === 2).toBe(true)
            expect(desc.filteredGroups.length === 2).toBe(true)
            expect(desc.filteredGroups[0] === '/collision_group3').toBe(true)
            expect(desc.filteredGroups[1] === '/collision_group7').toBe(true)
          } else {
            expect(!desc.mergeGroupName).toBe(true)
            expect(desc.mergedGroups.length === 0).toBe(true)
            expect(desc.filteredGroups.length === 1).toBe(true)
          }

          expect(desc.invertFilteredGroups === false).toBe(true)
          num_reported_collision_groups = num_reported_collision_groups + 1
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(num_reported_collision_groups === 7).toBe(true)
  })

  it('test_collision_groups_collider_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const collision_group_0 = CollisionGroup.define(stage, '/collision_group_0')
    const collision_group_1 = CollisionGroup.define(stage, '/collision_group_1')

    const cube = Cube.define(stage, '/cube')
    CollisionAPI.apply(cube.prim)

    collision_group_0.getCollidersCollectionAPI().getIncludesRel().addTarget(cube.prim.path)
    collision_group_1.getCollidersCollectionAPI().getIncludesRel().addTarget(cube.prim.path)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let scene_found = false
    let num_reported_collision_groups = 0
    let shape_reported = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        scene_found = true
      } else if (key === ObjectType.CollisionGroup) {
        for (const _ of zip(prim_paths, descs)) {
          num_reported_collision_groups = num_reported_collision_groups + 1
        }
      } else if (key === ObjectType.CubeShape) {
        for (const [, desc] of zip(prim_paths, descs as ShapeDesc[])) {
          expect(desc.collisionGroups.length === 2).toBe(true)
          expect(desc.collisionGroups[0] === collision_group_0.prim.path).toBe(true)
          expect(desc.collisionGroups[1] === collision_group_1.prim.path).toBe(true)
          shape_reported = true
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(num_reported_collision_groups === 2).toBe(true)
    expect(shape_reported).toBe(true)
  })

  // custom tokens
  it('test_custom_geometry_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    Cube.define(stage, '/cube')

    setApiSchemasPrepended(stage, '/cube', ['MyCustomGeometryAPI', 'PhysicsCollisionAPI'])

    const custom_tokens = UsdPhysicsCustomTokens()
    custom_tokens.shapeTokens.push('MyCustomGeometryAPI')

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens)

    let scene_found = false
    let custom_geometry_found = false

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        scene_found = true
      } else if (key === ObjectType.CustomShape) {
        for (const _ of zip(prim_paths, descs)) {
          custom_geometry_found = true
        }
      }
    }

    expect(scene_found).toBe(true)
    expect(custom_geometry_found).toBe(true)
  })

  // Check that many custom-shape colliders parsed in parallel produce
  // the correct customGeometryToken for every descriptor, and that the
  // token-to-descriptor ordering is deterministic.
  it('test_custom_geometry_multithreading_parse', () => {
    const NUM_CUSTOM_COLLIDERS = 500

    const stage = Stage.createNew()
    Scene.define(stage, '/physicsScene')

    const body = Xform.define(stage, '/Body')
    RigidBodyAPI.apply(body.prim)

    // Use two distinct custom API tokens so we can verify that the
    // right token ends up on the right descriptor.
    const token_a = 'CustomGeomA_API'
    const token_b = 'CustomGeomB_API'

    const expected: Array<[string, string]> = []
    for (let k = 0; k < NUM_CUSTOM_COLLIDERS; k++) {
      const prim_path = `/Body/CustomCollider_${k}`
      Cube.define(stage, prim_path)

      const token = k % 2 === 0 ? token_a : token_b
      expected.push([prim_path, token])

      setApiSchemasPrepended(stage, prim_path, [token, 'PhysicsCollisionAPI'])
    }

    // UsdPhysics.CustomUsdPhysicsTokens: the deprecated alias
    // (parseUtils.h:64-65).
    const custom_tokens = UsdPhysicsCustomTokens()
    custom_tokens.shapeTokens.push(token_a)
    custom_tokens.shapeTokens.push(token_b)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens)

    expect(ret_dict.has(ObjectType.CustomShape)).toBe(true)
    const [prim_paths, descs] = ret_dict.get(ObjectType.CustomShape)!

    expect(descs.length).toBe(NUM_CUSTOM_COLLIDERS)

    // Build a map from prim path -> expected token for easy lookup,
    // since the parser may return prims in arbitrary (but internally
    // consistent) order.
    const expected_map = new Map(expected)

    for (const [prim_path, desc] of zip(prim_paths, descs as CustomShapeDesc[])) {
      const path_str = String(prim_path)
      expect(expected_map.has(path_str), `Unexpected prim path ${path_str}`).toBe(true)
      expect(desc.customGeometryToken,
        `Wrong customGeometryToken for ${path_str}: got ${desc.customGeometryToken}, ` +
        `expected ${expected_map.get(path_str)}`).toBe(expected_map.get(path_str))
    }
  })

  // simulation owner tests
  it('test_rigid_body_simulation_owner_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const cube = Cube.define(stage, '/cube')
    const rbo_api = RigidBodyAPI.apply(cube.prim)

    const custom_tokens = UsdPhysicsCustomTokens()
    let simulation_owners = [scene.prim.path]
    let ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)

    const check_ret_dict = (): [boolean, boolean] => {
      let scene_found = false
      let rigid_body_found = false

      for (const [key, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (key === ObjectType.Scene) {
          scene_found = true
        } else if (key === ObjectType.RigidBody) {
          for (const _ of zip(prim_paths, descs)) {
            rigid_body_found = true
          }
        }
      }

      return [scene_found, rigid_body_found]
    }

    let [scene_found, rigid_body_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)

    simulation_owners = ['']
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found] = check_ret_dict()

    expect(!scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)

    simulation_owners = [scene.prim.path]
    rbo_api.getSimulationOwnerRel().addTarget(scene.prim.path)
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
  })

  it('test_collision_simulation_owner_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const xform = Xform.define(stage, '/xform')
    const rbo_api = RigidBodyAPI.apply(xform.prim)

    const cube = Cube.define(stage, '/xform/cube')
    const collision_api = CollisionAPI.apply(cube.prim)

    const custom_tokens = UsdPhysicsCustomTokens()
    let simulation_owners = [scene.prim.path]
    let ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)

    const check_ret_dict = (): [boolean, boolean, boolean] => {
      let scene_found = false
      let rigid_body_found = false
      let collision_found = false

      for (const [key, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (key === ObjectType.Scene) {
          scene_found = true
        } else if (key === ObjectType.RigidBody) {
          for (const _ of zip(prim_paths, descs)) {
            rigid_body_found = true
          }
        } else if (key === ObjectType.CubeShape) {
          for (const _ of zip(prim_paths, descs)) {
            collision_found = true
          }
        }
      }

      return [scene_found, rigid_body_found, collision_found]
    }

    let [scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)
    expect(!collision_found).toBe(true)

    simulation_owners = ['']
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(!scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
    expect(collision_found).toBe(true)

    simulation_owners = [scene.prim.path]
    rbo_api.getSimulationOwnerRel().addTarget(scene.prim.path)
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
    expect(collision_found).toBe(true)

    xform.prim.removeAPI(RigidBodyAPI.typeName)
    simulation_owners = ['']
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(!scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)
    expect(collision_found).toBe(true)

    simulation_owners = [scene.prim.path]
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)
    expect(!collision_found).toBe(true)

    simulation_owners = [scene.prim.path]
    collision_api.getSimulationOwnerRel().addTarget(scene.prim.path)
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, collision_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)
    expect(collision_found).toBe(true)
  })

  it('test_joint_simulation_owner_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const xform_0 = Xform.define(stage, '/xform0')
    const rbo_api_0 = RigidBodyAPI.apply(xform_0.prim)

    const xform_1 = Xform.define(stage, '/xform1')
    const rbo_api_1 = RigidBodyAPI.apply(xform_1.prim)

    const fixed_joint = FixedJoint.define(stage, '/fixedJoint')

    let ret_dict: RetDict = new Map()
    const check_ret_dict = (): [boolean, boolean, boolean] => {
      let scene_found = false
      let rigid_body_found = false
      let joint_found = false

      for (const [key, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (key === ObjectType.Scene) {
          scene_found = true
        } else if (key === ObjectType.RigidBody) {
          for (const _ of zip(prim_paths, descs)) {
            rigid_body_found = true
          }
        } else if (key === ObjectType.FixedJoint) {
          for (const _ of zip(prim_paths, descs)) {
            joint_found = true
          }
        }
      }

      return [scene_found, rigid_body_found, joint_found]
    }

    const test_cases = ['body0', 'body1', 'both']
    for (const tc of test_cases) {
      rbo_api_0.getSimulationOwnerRel().clearTargets(false)
      rbo_api_1.getSimulationOwnerRel().clearTargets(false)

      if (tc === 'body0') {
        fixed_joint.getBody0Rel().addTarget(xform_0.prim.path)
      } else if (tc === 'body1') {
        fixed_joint.getBody1Rel().addTarget(xform_1.prim.path)
      } else if (tc === 'both') {
        fixed_joint.getBody0Rel().addTarget(xform_0.prim.path)
        fixed_joint.getBody1Rel().addTarget(xform_1.prim.path)
      }

      const custom_tokens = UsdPhysicsCustomTokens()
      let simulation_owners = [scene.prim.path]
      ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)

      let [scene_found, rigid_body_found, joint_found] = check_ret_dict()

      expect(scene_found).toBe(true)
      expect(!rigid_body_found).toBe(true)
      expect(!joint_found).toBe(true)

      simulation_owners = ['']
      ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
      ;[scene_found, rigid_body_found, joint_found] = check_ret_dict()

      expect(!scene_found).toBe(true)
      expect(rigid_body_found).toBe(true)
      expect(joint_found).toBe(true)

      rbo_api_0.getSimulationOwnerRel().addTarget(scene.prim.path)
      rbo_api_1.getSimulationOwnerRel().addTarget(scene.prim.path)
      simulation_owners = [scene.prim.path]
      ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
      ;[scene_found, rigid_body_found, joint_found] = check_ret_dict()

      expect(scene_found).toBe(true)
      expect(rigid_body_found).toBe(true)
      expect(joint_found).toBe(true)

      rbo_api_0.getSimulationOwnerRel().clearTargets(false)
      rbo_api_1.getSimulationOwnerRel().addTarget(scene.prim.path)
      simulation_owners = [scene.prim.path]
      ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
      ;[scene_found, rigid_body_found, joint_found] = check_ret_dict()

      expect(scene_found).toBe(true)
      expect(rigid_body_found).toBe(true)
      expect(!joint_found).toBe(true)

      rbo_api_0.getSimulationOwnerRel().clearTargets(false)
      rbo_api_1.getSimulationOwnerRel().addTarget(scene.prim.path)
      simulation_owners = ['', scene.prim.path]
      ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
      ;[scene_found, rigid_body_found, joint_found] = check_ret_dict()

      expect(scene_found).toBe(true)
      expect(rigid_body_found).toBe(true)
      expect(joint_found).toBe(true)
    }
  })

  it('test_articulation_simulation_owner_parse', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const xform = Xform.define(stage, '/xform')
    ArticulationRootAPI.apply(xform.prim)

    const cube_0 = Cube.define(stage, '/xform/cube0')
    const rigid_body_api_0 = RigidBodyAPI.apply(cube_0.prim)

    const cube_1 = Cube.define(stage, '/xform/cube1')
    const rigid_body_api_1 = RigidBodyAPI.apply(cube_1.prim)

    const cube_2 = Cube.define(stage, '/xform/cube2')
    const rigid_body_api_2 = RigidBodyAPI.apply(cube_2.prim)

    const revolute_joint_0 = RevoluteJoint.define(stage, '/xform/revoluteJoint0')
    revolute_joint_0.getBody0Rel().addTarget(cube_0.prim.path)
    revolute_joint_0.getBody1Rel().addTarget(cube_1.prim.path)

    const revolute_joint_1 = RevoluteJoint.define(stage, '/xform/revoluteJoint1')
    revolute_joint_1.getBody0Rel().addTarget(cube_1.prim.path)
    revolute_joint_1.getBody1Rel().addTarget(cube_2.prim.path)

    const custom_tokens = UsdPhysicsCustomTokens()
    let simulation_owners = [scene.prim.path]
    let ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)

    const check_ret_dict = (): [boolean, boolean, boolean, boolean] => {
      let scene_found = false
      let rigid_body_found = false
      let articulation_found = false
      let joint_found = false

      for (const [key, value] of ret_dict) {
        const [prim_paths, descs] = value
        if (key === ObjectType.Scene) {
          scene_found = true
        } else if (key === ObjectType.RigidBody) {
          for (const _ of zip(prim_paths, descs)) {
            rigid_body_found = true
          }
        } else if (key === ObjectType.RevoluteJoint) {
          for (const _ of zip(prim_paths, descs)) {
            joint_found = true
          }
        } else if (key === ObjectType.Articulation) {
          for (const _ of zip(prim_paths, descs)) {
            articulation_found = true
          }
        }
      }

      return [scene_found, rigid_body_found, joint_found, articulation_found]
    }

    let [scene_found, rigid_body_found, joint_found, articulation_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(!rigid_body_found).toBe(true)
    expect(!joint_found).toBe(true)
    expect(!articulation_found).toBe(true)

    simulation_owners = ['']
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, joint_found, articulation_found] = check_ret_dict()

    expect(!scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
    expect(joint_found).toBe(true)
    expect(articulation_found).toBe(true)

    simulation_owners = [scene.prim.path]
    rigid_body_api_0.getSimulationOwnerRel().addTarget(scene.prim.path)
    rigid_body_api_1.getSimulationOwnerRel().addTarget(scene.prim.path)
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, joint_found, articulation_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
    expect(joint_found).toBe(true)
    expect(!articulation_found).toBe(true)

    simulation_owners = [scene.prim.path]
    rigid_body_api_0.getSimulationOwnerRel().addTarget(scene.prim.path)
    rigid_body_api_1.getSimulationOwnerRel().addTarget(scene.prim.path)
    rigid_body_api_2.getSimulationOwnerRel().addTarget(scene.prim.path)
    ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'], [], custom_tokens, simulation_owners)
    ;[scene_found, rigid_body_found, joint_found, articulation_found] = check_ret_dict()

    expect(scene_found).toBe(true)
    expect(rigid_body_found).toBe(true)
    expect(joint_found).toBe(true)
    expect(articulation_found).toBe(true)
  })
})

describe('TestUsdAppliedAPISchemas', () => {
  const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'testUsdPhysicsParsing', 'resources')
  const readFixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8')

  beforeAll(() => {
    // Upstream plugInfo.json files open with '#' comment lines, which
    // plug/info.cpp strips before JSON parsing.
    const stripped = readFixture('plugInfo.json').split('\n')
      .map(line => (line.search(/\S/) >= 0 && line.search(/\S/) === line.indexOf('#') ? '' : line)).join('\n')
    const testPlugins = PlugRegistry.GetInstance().RegisterPlugins(
      JSON.parse(stripped) as PlugInfo,
      { testUsdPhysicsParsing: { 'generatedSchema.usda': readFixture('generatedSchema.usda') } },
    )
    expect(testPlugins.length, 'Failed to load expected test plugin').toBe(1)
    expect(testPlugins[0]!.getName(), 'Failed to load expected test plugin').toBe('testUsdPhysicsParsing')
  })

  it('test_SimpleTypedSchemaPrimDefinition', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const scene = Scene.define(stage, '/physicsScene')
    expect(scene.isValid()).toBe(true)

    const cube = Cube.define(stage, '/cube')

    cube.prim.applyAPI('TestNestedPhysicsCollisionAPI')

    expect(cube.prim.hasAPI('TestNestedPhysicsCollisionAPI')).toBe(true)
    expect(cube.prim.hasAPI('PhysicsCollisionAPI')).toBe(true)

    const ret_dict = UsdPhysicsLoadStageFromPrimRange(stage, ['/'])

    let num_shape_found = 0

    for (const [key, value] of ret_dict) {
      const [prim_paths, descs] = value
      if (key === ObjectType.Scene) {
        // scene_found
      } else if (key === ObjectType.CubeShape) {
        for (const _ of zip(prim_paths, descs)) {
          // cube shape
          num_shape_found = num_shape_found + 1
        }
      }
    }

    expect(num_shape_found === 1).toBe(true)
  })
})
