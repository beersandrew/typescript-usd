// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdPhysics/testenv/testUsdPhysicsCollisionGroupAPI.py,
//  pxr/usd/usdPhysics/wrapCollisionGroup.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/testenv/testUsdPhysicsCollisionGroupAPI.py
// SdfPath values are path strings. The Python CollisionGroupTable wrapper's
// IsCollisionEnabled accepts ints, paths, CollisionGroups or prims
// (wrapCollisionGroup.cpp:145-179); the TS table accepts the same.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { CollisionGroup, type CollisionGroupTable } from 'typescript-usd/usdPhysics'

describe('TestUsdPhysicsCollisionGroupAPI', () => {
  function validate_table_symmetry(table: CollisionGroupTable): void {
    const groups = table.getGroups()
    groups.forEach((a, iA) => {
      groups.forEach((b, iB) => {
        expect(table.isCollisionEnabled(iA, iB)).toBe(table.isCollisionEnabled(iB, iA))
        expect(table.isCollisionEnabled(a, b)).toBe(table.isCollisionEnabled(b, a))
        expect(table.isCollisionEnabled(a, b)).toBe(table.isCollisionEnabled(iA, iB))
      })
    })
  }

  it('test_collision_group_table', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const a = CollisionGroup.define(stage, '/a')
    const b = CollisionGroup.define(stage, '/b')
    const c = CollisionGroup.define(stage, '/c')

    b.createFilteredGroupsRel().addTarget(c.path)
    c.createFilteredGroupsRel().addTarget(c.path)

    const table = CollisionGroup.computeCollisionGroupTable(stage)

    // Check the results contain all the groups:
    expect(table.getGroups().length === 3).toBe(true)
    expect(table.getGroups()).toContain(a.prim.path)
    expect(table.getGroups()).toContain(b.prim.path)
    expect(table.getGroups()).toContain(c.prim.path)

    // A should collide with everything
    // B should only collide with A and B
    // C should only collide with A
    expect(table.isCollisionEnabled(a, a)).toBe(true)
    expect(table.isCollisionEnabled(a, b)).toBe(true)
    expect(table.isCollisionEnabled(a, c)).toBe(true)
    expect(table.isCollisionEnabled(b, b)).toBe(true)
    expect(table.isCollisionEnabled(b, c)).toBe(false)
    expect(table.isCollisionEnabled(c, c)).toBe(false)
    validate_table_symmetry(table)
  })

  it('test_collision_group_inversion', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const a = CollisionGroup.define(stage, '/a')
    const b = CollisionGroup.define(stage, '/b')
    const c = CollisionGroup.define(stage, '/c')

    a.createFilteredGroupsRel().addTarget(c.path)
    a.createInvertFilteredGroupsAttr().set(true)

    let table = CollisionGroup.computeCollisionGroupTable(stage)

    // A should collide with only C
    // B should collide with only B and C
    // C should collide with only B and C
    expect(table.isCollisionEnabled(a, a)).toBe(false)
    expect(table.isCollisionEnabled(a, b)).toBe(false)
    expect(table.isCollisionEnabled(a, c)).toBe(true)
    expect(table.isCollisionEnabled(b, b)).toBe(true)
    expect(table.isCollisionEnabled(b, c)).toBe(true)
    expect(table.isCollisionEnabled(c, c)).toBe(true)
    validate_table_symmetry(table)

    // Explicitly test the inversion scenario which may "re-enable" a
    // collision filter pair that has been disabled (refer docs on why care
    // should be taken to avoid such scenarios)
    const allOthers = CollisionGroup.define(stage, '/allOthers')

    // - grpX is set to ONLY collide with grpXCollider by setting an inversion
    const grpXCollider = CollisionGroup.define(stage, '/grpXCollider')
    const grpX = CollisionGroup.define(stage, '/grpX')
    grpX.createFilteredGroupsRel().addTarget(grpXCollider.path)
    grpX.createInvertFilteredGroupsAttr().set(true)
    table = CollisionGroup.computeCollisionGroupTable(stage)
    expect(table.isCollisionEnabled(grpX, grpXCollider)).toBe(true)
    expect(table.isCollisionEnabled(grpX, allOthers)).toBe(false)

    // - grpX is added to a new merge group "mergetest"
    grpX.createMergeGroupNameAttr().set('mergeTest')

    // - grpA now creates a filter to disable its collision with grpXCollider
    const grpA = CollisionGroup.define(stage, '/grpA')
    grpA.createFilteredGroupsRel().addTarget(grpXCollider.path)
    table = CollisionGroup.computeCollisionGroupTable(stage)
    expect(table.isCollisionEnabled(grpA, grpXCollider)).toBe(false)
    // - above doesn't affect any of grpX's collision pairs
    expect(table.isCollisionEnabled(grpX, grpXCollider)).toBe(true)
    expect(table.isCollisionEnabled(grpX, allOthers)).toBe(false)

    // - grpA is now added to same "mergetest" merge group (care was not
    // taken in doing so and this disables all collision pairs!!)
    grpA.createMergeGroupNameAttr().set('mergeTest')
    table = CollisionGroup.computeCollisionGroupTable(stage)
    expect(table.isCollisionEnabled(grpX, grpXCollider)).toBe(false)
    expect(table.isCollisionEnabled(grpX, allOthers)).toBe(false)
    expect(table.isCollisionEnabled(grpA, grpXCollider)).toBe(false)
    expect(table.isCollisionEnabled(grpA, allOthers)).toBe(false)
  })

  it('test_collision_group_simple_merging', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const a = CollisionGroup.define(stage, '/a')
    const b = CollisionGroup.define(stage, '/b')
    const c = CollisionGroup.define(stage, '/c')

    a.createFilteredGroupsRel().addTarget(c.path)
    // Assign A and B to the same merge group:
    a.createMergeGroupNameAttr().set('mergeTest')
    b.createMergeGroupNameAttr().set('mergeTest')

    const table = CollisionGroup.computeCollisionGroupTable(stage)

    // A should collide with only A and B
    // B should collide with only A and B
    // C should collide with only C
    expect(table.isCollisionEnabled(a, a)).toBe(true)
    expect(table.isCollisionEnabled(a, b)).toBe(true)
    expect(table.isCollisionEnabled(a, c)).toBe(false)
    expect(table.isCollisionEnabled(b, b)).toBe(true)
    expect(table.isCollisionEnabled(b, c)).toBe(false)
    expect(table.isCollisionEnabled(c, c)).toBe(true)
    validate_table_symmetry(table)
  })

  it('test_collision_group_complex_merging', () => {
    const stage = Stage.createNew()
    expect(stage).toBeTruthy()

    const a = CollisionGroup.define(stage, '/a')
    const b = CollisionGroup.define(stage, '/b')
    const c = CollisionGroup.define(stage, '/c')
    const d = CollisionGroup.define(stage, '/d')

    a.createFilteredGroupsRel().addTarget(c.path)
    // Assign A and B to the same merge group:
    a.createMergeGroupNameAttr().set('mergeAB')
    b.createMergeGroupNameAttr().set('mergeAB')
    // Assign C and D to the same merge group:
    c.createMergeGroupNameAttr().set('mergeCD')
    d.createMergeGroupNameAttr().set('mergeCD')

    const table = CollisionGroup.computeCollisionGroupTable(stage)

    // A should collide with only A and B
    // B should collide with only A and B
    // C should collide with only C and D
    // D should collide with only C and D
    expect(table.isCollisionEnabled(a, a)).toBe(true)
    expect(table.isCollisionEnabled(a, b)).toBe(true)
    expect(table.isCollisionEnabled(a, c)).toBe(false)
    expect(table.isCollisionEnabled(a, d)).toBe(false)

    expect(table.isCollisionEnabled(b, b)).toBe(true)
    expect(table.isCollisionEnabled(b, c)).toBe(false)
    expect(table.isCollisionEnabled(b, d)).toBe(false)

    expect(table.isCollisionEnabled(c, c)).toBe(true)
    expect(table.isCollisionEnabled(c, d)).toBe(true)
    expect(table.isCollisionEnabled(d, d)).toBe(true)
    validate_table_symmetry(table)
  })
})
