// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdCollectionAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdCollectionAPI.py at v26.05.

import { describe, expect, it } from 'vitest'
import { CollectionAPI, Stage } from 'typescript-usd/usd'

function scene() {
  const stage = Stage.createNew()
  const root = stage.definePrim('/World')
  stage.definePrim('/World/Geom')
  stage.definePrim('/World/Geom/Cube')
  stage.definePrim('/World/Geom/Sphere')
  stage.definePrim('/World/Geom/Sphere/Hemisphere')
  stage.definePrim('/World/Looks')
  return { stage, root }
}

describe('testUsdCollectionAPI', () => {
  it('test_AuthorCollections', () => {
    const { stage, root } = scene()
    expect(CollectionAPI.canApply(root, 'shapes')).toBe(true)
    const collection = CollectionAPI.apply(root, 'shapes')

    expect(collection.isValid()).toBe(true)
    expect(root.hasAPI('CollectionAPI', 'shapes')).toBe(true)
    expect(collection.getName()).toBe('shapes')
    expect(collection.getCollectionPath()).toBe('/World.collection:shapes')
    expect(CollectionAPI.get(stage, collection.getCollectionPath()).getName()).toBe('shapes')
    expect(CollectionAPI.getAll(root).map((c) => c.getName())).toEqual(['shapes'])
    expect(CollectionAPI.getSchemaAttributeNames(true, 'shapes')).toContain(
      'collection:shapes:expansionRule')
  })

  it('test_testReadCollection', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'shapes')
    collection.createIncludesRel().addTarget('/World/Geom')
    collection.createExcludesRel().addTarget('/World/Geom/Sphere')

    let query = collection.computeMembershipQuery()
    expect(query.isPathIncluded('/World/Geom')).toBe(true)
    expect(query.isPathIncluded('/World/Geom/Cube')).toBe(true)
    expect(query.isPathIncluded('/World/Geom/Sphere')).toBe(false)
    expect(query.isPathIncluded('/World/Geom/Sphere/Hemisphere')).toBe(false)

    collection.createExpansionRuleAttr('explicitOnly')
    query = collection.computeMembershipQuery()
    expect(query.isPathIncluded('/World/Geom')).toBe(true)
    expect(query.isPathIncluded('/World/Geom/Cube')).toBe(false)
  })

  it('test_testIncludeAndExcludePath', () => {
    const { root } = scene()
    const shapes = CollectionAPI.apply(root, 'shapes')
    expect(shapes.hasNoIncludedPaths()).toBe(true)
    expect(shapes.includePath('/World/Geom/Sphere')).toBe(true)
    expect(shapes.excludePath('/World/Geom/Sphere/Hemisphere')).toBe(true)

    const combined = CollectionAPI.apply(root, 'combined')
    combined.createIncludesRel().addTarget(shapes.getCollectionPath())
    expect(combined.computeMembershipQuery().isPathIncluded('/World/Geom/Sphere')).toBe(true)
    expect(combined.computeMembershipQuery().isPathIncluded('/World/Geom/Sphere/Hemisphere')).toBe(false)

    combined.createIncludeRootAttr(true)
    expect(combined.computeMembershipQuery().isPathIncluded('/World/Looks')).toBe(true)
    expect(combined.validate()).toBe(true)
    combined.createExpansionRuleAttr('invalid')
    expect(combined.validate()).toBe(false)
    expect(combined.resetCollection()).toBe(true)
    expect(combined.hasNoIncludedPaths()).toBe(false) // includeRoot remains authored, as upstream ResetCollection.
  })

  it('test_ExplicitOnlyAndIncludeRoot', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'all')
    collection.createIncludesRel().addTarget('/World/Geom')
    expect(collection.computeIncludedPaths()).toContain('/World/Geom/Cube')

    root.createAttr('purpose', 'render')
    collection.createExpansionRuleAttr('expandPrimsAndProperties')
    collection.createIncludesRel().setTargets(['/World'])
    expect(collection.computeIncludedPaths()).toContain('/World.purpose')
  })

  it('test_ExplicitModeAttr', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'modes')
    collection.createMembershipExpressionAttr('/World/Looks')
    collection.createIncludesRel().addTarget('/World/Geom')

    expect(collection.getModeAttr().get()).toBe('automatic')
    expect(collection.isInRelationshipsMode()).toBe(true)
    expect(collection.computeMembershipQuery().isPathIncluded('/World/Geom')).toBe(true)

    collection.createModeAttr('expression')
    expect(collection.isInExpressionMode()).toBe(true)
    expect(collection.computeMembershipQuery().usesPathExpansionRuleMap()).toBe(false)
    expect(collection.computeMembershipQuery().isPathIncluded('/World/Looks')).toBe(true)
    expect(collection.computeMembershipQuery().isPathIncluded('/World/Geom')).toBe(false)

    collection.createModeAttr('relationship')
    expect(collection.isInRelationshipsMode()).toBe(true)
    expect(collection.computeMembershipQuery().isPathIncluded('/World/Geom')).toBe(true)
  })

  it('test_invalidCollections', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'invalid')
    collection.createExpansionRuleAttr('notAnExpansionRule')
    expect(collection.validate()).toBe(false)
  })

  it('test_CircularDependency', () => {
    const { root } = scene()
    const a = CollectionAPI.apply(root, 'A')
    const b = CollectionAPI.apply(root, 'B')
    const c = CollectionAPI.apply(root, 'C')
    a.createIncludesRel().addTarget(b.getCollectionPath())
    b.createIncludesRel().addTarget(c.getCollectionPath())
    c.createIncludesRel().addTarget(a.getCollectionPath())
    expect(a.validate()).toBe(false)
    expect(b.validate()).toBe(false)
    expect(c.validate()).toBe(false)
    expect(a.computeIncludedObjects()).toEqual([])
  })

  it('test_InvalidApply', () => {
    const { root } = scene()
    expect(() => CollectionAPI.canApply(root, '')).toThrow()
    expect(CollectionAPI.canApply(root, 'excludes')).toBe(false)
    expect(CollectionAPI.apply(root, 'excludes').isValid()).toBe(true)
  })

  it('test_CollectionEquivalence', () => {
    const { root } = scene()
    const a = CollectionAPI.apply(root, 'A')
    const b = CollectionAPI.apply(root, 'B')
    a.createIncludesRel().addTarget('/World/Geom')
    b.createIncludesRel().addTarget('/World/Geom')
    expect(a.computeMembershipQuery().equals(b.computeMembershipQuery())).toBe(true)
    expect(a.computeMembershipQuery().hash()).toBe(b.computeMembershipQuery().hash())
    b.createExcludesRel().addTarget('/World/Geom/Cube')
    expect(a.computeMembershipQuery().equals(b.computeMembershipQuery())).toBe(false)
  })

  it('test_SchemaPropertyBaseNames', () => {
    for (const name of ['', 'includeRoot', 'expansionRule', 'includes', 'excludes']) {
      expect(CollectionAPI.isSchemaPropertyBaseName(name)).toBe(true)
    }
    expect(CollectionAPI.isSchemaPropertyBaseName('collection')).toBe(false)
  })

  it('test_GetSchemaAttributeNames', () => {
    expect(CollectionAPI.getSchemaAttributeNames()).toEqual([
      'collection:__INSTANCE_NAME__:expansionRule',
      'collection:__INSTANCE_NAME__:includeRoot',
      'collection:__INSTANCE_NAME__:membershipExpression',
      'collection:__INSTANCE_NAME__:mode',
      'collection:__INSTANCE_NAME__',
    ])
    expect(CollectionAPI.getSchemaAttributeNames(true, 'foo')).toEqual([
      'collection:foo:expansionRule', 'collection:foo:includeRoot',
      'collection:foo:membershipExpression', 'collection:foo:mode', 'collection:foo',
    ])
  })

  it('test_RelativePathIsPathIncluded', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'all')
    collection.createIncludesRel().addTarget('/World')
    expect(() => collection.computeMembershipQuery().isPathIncluded('World/Geom')).toThrow()
  })

  it('test_MembershipExpressions', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'expression')
    collection.createModeAttr('expression')
    collection.createMembershipExpressionAttr('/World/Geom/Cube /World/Looks')
    const included = CollectionAPI.computeIncludedPaths(collection.computeMembershipQuery(), root.getStage())
    expect(included).toEqual(['/World/Geom/Cube', '/World/Looks'])
  })

  it('test_HashMembershipQuery', () => {
    const { root } = scene()
    const collection = CollectionAPI.apply(root, 'hash')
    collection.createIncludesRel().addTarget('/World/Geom')
    const first = collection.computeMembershipQuery()
    const second = collection.computeMembershipQuery()
    expect(first.hash()).toBe(second.hash())
    expect(first.equals(second)).toBe(true)
  })

  it('test_ExpressionCyclesBlockAndReset', () => {
    const { root } = scene()
    const a = CollectionAPI.apply(root, 'A')
    const b = CollectionAPI.apply(root, 'B')
    a.createModeAttr('expression')
    b.createModeAttr('expression')
    a.createMembershipExpressionAttr('%:B')
    b.createMembershipExpressionAttr('%:A')
    expect(a.resolveCompleteMembershipExpression()).not.toEqual('%:B')
    expect(b.blockCollection()).toBe(true)
    expect(b.hasNoIncludedPaths()).toBe(true)
    expect(a.resetCollection()).toBe(true)
  })
})
