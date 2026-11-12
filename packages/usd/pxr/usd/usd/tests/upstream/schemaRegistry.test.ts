// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdSchemaRegistry.py,
//  pxr/usd/usd/testenv/testUsdSchemaRegistryCpp.cpp, pxr/base/plug/info.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdSchemaRegistry.py (v26.05)
//
// FLIPPED GREEN at the F1 registry-core implementation: 18 of 19 cases ran as self-promoting it.fails
// scoreboard xfails until UsdSchemaRegistry/UsdPrimDefinition landed, then
// self-promoted (vitest fails an it.fails that passes) and were flipped to
// it(). FLIPPED at F1-C (prim/value-resolution wiring): the final case —
// FlattenPrimDefinition — self-promoted once the composed-read Prim handle
// gained its stage backref (Prim.getStage) and the prim-handle FlattenTo
// overloads landed; all 19 cases are plain it() now.
// Assertions are real post-implementation assertions with upstream's exact
// expected values — no watered-down checks, no it.skip.
//
// Fixtures (vendored VERBATIM from OpenUSD @ v26.05):
//   fixtures/schemaRegistry/   — testenv/testUsdSchemaRegistry/resources
//                                (plugInfo.json, generatedSchema.usda, and the
//                                schema.usda source for reference)
//   fixtures/vendored/usd/     — pxr/usd/usd/{plugInfo.json,generatedSchema.usda}
//                                (core schemas: UsdTyped, UsdModelAPI,
//                                UsdClipsAPI, UsdCollectionAPI, …)
//
// Exclusions (enumerated, with reasons):
//  1. testUsdSchemaRegistryThreadedInit.py — WEB-SUB: single-threaded JS has
//     no threaded singleton-init race to exercise. Not ported.
//  2. setUpClass's Tf.ErrorException assertion (the coding error "Registration
//     failed for schema type TestUsdSchemaRegistryNoIdentifierAndNoAlias."
//     raised exactly once at registry construction) — typescript-usd/tf has no
//     diagnostics/error-mark system. The OBSERVABLE (that type registers no
//     schema type name) is asserted in the 'SchemaIdentifier' case below.
//     The rest of setUpClass (plugin registers under its name) IS ported.
//  3. testUsdSchemaRegistryCpp.cpp — C++-only slices not portable to the
//     untyped TS surface: the templated GetMetadata<T>/GetFallbackValue<T>
//     "wrong output type returns false and leaves the out-param untouched"
//     semantics, and the C++ handle copy-conversions
//     (UsdPrimDefinition::Property(attrDef) / Relationship(attrDef) bool
//     tests). Everything else in the .cpp duplicates the .py cases ported
//     here; its one extra portable slice — GetMetadataByDictKey misses on
//     bogus keys / non-dictionary fields — is ported as the
//     'metadata-by-dict-key misses' case.
//
// Upstream API surface mapping (upstream → typescript-usd stubs):
//   Usd.SchemaRegistry()                 → UsdSchemaRegistry.getInstance()
//   primDef.GetMetadata/GetPropertyMetadata → primDef.getMetadataField(field, propName?)
//   primDef.ListPropertyMetadataFields   → primDef.listMetadataFields(propName)
//   Sdf.SpecTypeAttribute/Relationship   → 'attribute' | 'relationship' (UsdSpecType)
//   Sdf.VariabilityVarying/Uniform       → 'varying' | 'uniform'
//   Tf.Type.Unknown                      → TfType.GetUnknownType()
//   spec.GetInfo / ListInfoKeys          → layer.getField / layer.getFieldNames
//     (structural child-index fields of our substrate filtered from the
//     exhaustiveness check; property lists read from the 'properties' field)
//   Sdf.TokenListOp.CreateExplicit([..]) → listOp field matching
//     { isExplicit: true, explicitItems: [..] }

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry, Info as PlugInfo } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { ValueTypeNames, type Layer } from 'typescript-usd/sdf'
import { Stage, SchemaRegistry as UsdSchemaRegistry, PrimDefinition as UsdPrimDefinition, PrimDefinitionProperty as UsdPrimDefinitionProperty, PrimDefinitionAttribute as UsdPrimDefinitionAttribute } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

function fixture(rel: string): string {
  return readFileSync(path.join(FIXTURES, rel), 'utf8')
}

/** plugInfo.json allows full-line '#' comments (upstream plug/info.cpp). */
function parsePlugInfo(text: string): PlugInfo {
  const stripped = text.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n')
  return JSON.parse(stripped) as PlugInfo
}

/**
 * Registers the vendored core usd schemas plus the upstream test plugin
 * (upstream setUpClass), then returns the registry singleton. Registration is
 * first-wins/additive upstream and here, so calling this from every case is a
 * no-op after the first — which keeps setup INSIDE each it.fails (a throwing
 * beforeAll would poison the whole file and kill per-case self-promotion).
 */
function setupRegistry(): UsdSchemaRegistry {
  const plugRegistry = PlugRegistry.GetInstance()
  plugRegistry.RegisterPlugins(parsePlugInfo(fixture('vendored/usd/plugInfo.json')), {
    usd: { 'generatedSchema.usda': fixture('vendored/usd/generatedSchema.usda') },
  })
  plugRegistry.RegisterPlugins(parsePlugInfo(fixture('schemaRegistry/plugInfo.json')), {
    testUsdSchemaRegistry: { 'generatedSchema.usda': fixture('schemaRegistry/generatedSchema.usda') },
  })
  return UsdSchemaRegistry.getInstance()
}

describe('UsdSchemaRegistry (upstream testUsdSchemaRegistry)', () => {
  it('setUpClass: the test plugin registers under the name testUsdSchemaRegistry', () => {
    setupRegistry()
    const plug = PlugRegistry.GetInstance().GetPluginWithName('testUsdSchemaRegistry')
    expect(plug).not.toBeNull()
    expect(plug!.getName()).toBe('testUsdSchemaRegistry')
    // Type: "resource" — a codeless plugin.
    expect(plug!.isResource()).toBe(true)
  })

  it('AbstractPrimMetadata: abstract prim definition metadata and attribute definition', () => {
    const registry = setupRegistry()
    const primDef = registry.findAbstractPrimDefinition('AbstractTest')
    expect(primDef).not.toBeNull()
    expect(new Set(primDef!.listMetadataFields())).toEqual(new Set(['hidden']))
    expect(primDef!.getMetadataField('typeName')).toBeUndefined()
    expect(primDef!.getMetadataField('hidden')).toBe(true)
    expect(primDef!.getDocumentation()).toBe('Testing documentation metadata (Abstract).')

    const attrDef = primDef!.getAttributeDefinition('testAttr')
    expect(attrDef.isValid()).toBe(true)
    expect(attrDef.getTypeName()).toBe(ValueTypeNames.String)
    expect(attrDef.getFallbackValue()).toBe('foo')
    expect(attrDef.getMetadata('allowedTokens')).toEqual(['bar', 'baz'])
    expect(attrDef.getMetadata('hidden')).toBe(true)
    expect(attrDef.getMetadata('testCustomMetadata')).toBe('garply')
  })

  it('PrimMetadata: concrete prim definition metadata incl. dictionary metadata by key', () => {
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    expect(new Set(primDef!.listMetadataFields())).toEqual(
      new Set(['typeName', 'testCustomMetadata', 'testDictionaryMetadata', 'hidden']),
    )
    expect(primDef!.getMetadataField('typeName')).toBe('MetadataTest')
    expect(primDef!.getMetadataField('documentation')).toBeUndefined()
    expect(primDef!.getMetadataField('hidden')).toBe(true)
    expect(primDef!.getMetadataField('testCustomMetadata')).toBe('garply')

    // Dictionary metadata by whole value and by individual key.
    expect(primDef!.getMetadataField('testDictionaryMetadata')).toEqual({ name: 'foo', value: 2 })
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'name')).toBe('foo')
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'value')).toBe(2)

    expect(primDef!.getDocumentation()).toBe('Testing brief user doc for schema class')
  })

  it('AttributeMetadata: attribute definition accessor and prim-def property API agree', () => {
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    const attrDef = primDef!.getAttributeDefinition('testAttr')
    expect(attrDef.isValid()).toBe(true)
    expect(attrDef.getName()).toBe('testAttr')
    expect(attrDef.isAttribute()).toBe(true)
    expect(attrDef.isRelationship()).toBe(false)

    // Spec type.
    expect(attrDef.getSpecType()).toBe('attribute')
    expect(primDef!.getSpecType('testAttr')).toBe('attribute')

    // List metadata fields.
    expect(new Set(attrDef.listMetadataFields())).toEqual(
      new Set([
        'allowedTokens', 'custom', 'default', 'displayGroup', 'displayName',
        'hidden', 'testCustomMetadata', 'testDictionaryMetadata', 'typeName',
        'variability',
      ]),
    )
    expect(new Set(primDef!.listMetadataFields('testAttr'))).toEqual(new Set(attrDef.listMetadataFields()))

    // Attribute def and prim def agree on every metadata field.
    for (const field of attrDef.listMetadataFields()) {
      expect(attrDef.getMetadata(field)).toEqual(primDef!.getMetadataField(field, 'testAttr'))
    }

    // Type name has special functions on the attribute def.
    expect(attrDef.getMetadata('typeName')).toBe('string')
    expect(attrDef.getTypeName()).toBe(ValueTypeNames.String)
    expect(attrDef.getTypeNameToken()).toBe('string')

    // Variability has a special function on the attr def.
    expect(attrDef.getMetadata('variability')).toBe('varying')
    expect(attrDef.getVariability()).toBe('varying')

    // Fallback value has special functions on both attr and prim defs.
    expect(attrDef.getMetadata('default')).toBe('foo')
    expect(attrDef.getFallbackValue()).toBe('foo')
    expect(primDef!.getAttributeFallbackValue('testAttr')).toBe('foo')

    // Documentation is not in the registry; GetDocumentation returns userDocBrief.
    expect(attrDef.getMetadata('documentation')).toBeUndefined()
    expect(attrDef.getDocumentation()).toBe('Testing brief user doc for schema attr')
    expect(primDef!.getPropertyDocumentation('testAttr')).toBe('Testing brief user doc for schema attr')

    // Dictionary metadata by whole value and by key, via both surfaces.
    expect(attrDef.getMetadata('testDictionaryMetadata')).toEqual({ name: 'bar', value: 3 })
    expect(attrDef.getMetadataByDictKey('testDictionaryMetadata', 'name')).toBe('bar')
    expect(attrDef.getMetadataByDictKey('testDictionaryMetadata', 'value')).toBe(3)
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'name', 'testAttr')).toBe('bar')
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'value', 'testAttr')).toBe(3)

    // The rest of the metadata without special accessors.
    expect(attrDef.getMetadata('allowedTokens')).toEqual(['bar', 'baz'])
    expect(attrDef.getMetadata('displayGroup')).toBe('Display Group')
    expect(attrDef.getMetadata('displayName')).toBe('Display Name')
    expect(attrDef.getMetadata('hidden')).toBe(true)
    expect(attrDef.getMetadata('testCustomMetadata')).toBe('garply')

    // Gotten as a plain property, the same metadata values come back.
    const propDef = primDef!.getPropertyDefinition('testAttr')
    expect(propDef.isValid()).toBe(true)
    expect(propDef.getName()).toBe('testAttr')
    expect(propDef.isAttribute()).toBe(true)
    expect(propDef.isRelationship()).toBe(false)
    for (const field of attrDef.listMetadataFields()) {
      expect(attrDef.getMetadata(field)).toEqual(propDef.getMetadata(field))
    }
  })

  it('RelationshipMetadata: relationship definition accessor and prim-def property API agree', () => {
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    const relDef = primDef!.getRelationshipDefinition('testRel')
    expect(relDef.isValid()).toBe(true)
    expect(relDef.isAttribute()).toBe(false)
    expect(relDef.isRelationship()).toBe(true)

    // Spec type.
    expect(relDef.getSpecType()).toBe('relationship')
    expect(primDef!.getSpecType('testRel')).toBe('relationship')

    // List metadata fields.
    expect(new Set(relDef.listMetadataFields())).toEqual(
      new Set([
        'custom', 'displayGroup', 'displayName', 'hidden', 'testCustomMetadata',
        'testDictionaryMetadata', 'variability',
      ]),
    )
    expect(new Set(primDef!.listMetadataFields('testRel'))).toEqual(new Set(relDef.listMetadataFields()))

    // Rel def and prim def agree on every metadata field.
    for (const field of relDef.listMetadataFields()) {
      expect(relDef.getMetadata(field)).toEqual(primDef!.getMetadataField(field, 'testRel'))
    }

    // Variability has a special function on the rel def.
    expect(relDef.getMetadata('variability')).toBe('uniform')
    expect(relDef.getVariability()).toBe('uniform')

    // Documentation is not in the registry; GetDocumentation returns userDocBrief.
    expect(relDef.getMetadata('documentation')).toBeUndefined()
    expect(relDef.getDocumentation()).toBe('Testing brief user doc for schema rel')
    expect(primDef!.getPropertyDocumentation('testRel')).toBe('Testing brief user doc for schema rel')

    // Dictionary metadata by whole value and by key, via both surfaces.
    expect(relDef.getMetadata('testDictionaryMetadata')).toEqual({ name: 'baz', value: 5 })
    expect(relDef.getMetadataByDictKey('testDictionaryMetadata', 'name')).toBe('baz')
    expect(relDef.getMetadataByDictKey('testDictionaryMetadata', 'value')).toBe(5)
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'name', 'testRel')).toBe('baz')
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'value', 'testRel')).toBe(5)

    // The rest of the metadata without special accessors.
    expect(relDef.getMetadata('displayGroup')).toBe('Display Group')
    expect(relDef.getMetadata('displayName')).toBe('Display Name')
    expect(relDef.getMetadata('hidden')).toBe(true)
    expect(relDef.getMetadata('testCustomMetadata')).toBe('garply')

    // Gotten as a plain property, the same metadata values come back.
    const propDef = primDef!.getPropertyDefinition('testRel')
    expect(propDef.isValid()).toBe(true)
    expect(propDef.getName()).toBe('testRel')
    expect(propDef.isAttribute()).toBe(false)
    expect(propDef.isRelationship()).toBe(true)
    for (const field of relDef.listMetadataFields()) {
      expect(relDef.getMetadata(field)).toEqual(propDef.getMetadata(field))
    }
  })

  it('InvalidProperties: invalid property definitions answer name/kind, throw on data access', () => {
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    const verifyInvalidDef = (invalidDef: UsdPrimDefinitionProperty, name: string) => {
      // Invalid property definitions convert to false.
      expect(invalidDef.isValid()).toBe(false)
      // IsAttribute/IsRelationship are allowed and always false.
      expect(invalidDef.isAttribute()).toBe(false)
      expect(invalidDef.isRelationship()).toBe(false)
      // The name matches the requested property even if it doesn't exist.
      expect(invalidDef.getName()).toBe(name)
      // All other data access throws (upstream: RuntimeError).
      expect(() => invalidDef.getSpecType()).toThrow()
      expect(() => invalidDef.listMetadataFields()).toThrow()
      expect(() => invalidDef.getVariability()).toThrow()
      expect(() => invalidDef.getMetadata('displayName')).toThrow()
      // Attribute-only accessors also throw, whether or not the handle is an
      // Attribute (on non-Attribute handles the method doesn't exist at all).
      const asAttr = invalidDef as UsdPrimDefinitionAttribute
      expect(() => asAttr.getFallbackValue()).toThrow()
      expect(() => asAttr.getTypeName()).toThrow()
    }

    // Default-constructed property definitions are invalid.
    verifyInvalidDef(new UsdPrimDefinition.Property(), '')
    verifyInvalidDef(new UsdPrimDefinition.Attribute(), '')
    verifyInvalidDef(new UsdPrimDefinition.Relationship(), '')

    // Definitions returned for properties that don't exist are invalid.
    verifyInvalidDef(primDef!.getPropertyDefinition('bogus'), 'bogus')
    verifyInvalidDef(primDef!.getAttributeDefinition('bogus'), 'bogus')
    verifyInvalidDef(primDef!.getRelationshipDefinition('bogus'), 'bogus')

    // The empty-named property never leaks the prim-metadata implementation
    // detail (upstream stores prim fallbacks as the empty-name property).
    verifyInvalidDef(primDef!.getPropertyDefinition(''), '')
  })

  it('GetUsdSchemaTypeName: schema type name ⇄ TfType for concrete/abstract/API schemas', () => {
    setupRegistry()
    const abstractTest = TfType.findByName('TestUsdSchemaRegistryAbstractTest')
    const concreteTest = TfType.findByName('TestUsdSchemaRegistryMetadataTest')
    const modelAPI = TfType.findByName('UsdModelAPI')
    const collectionAPI = TfType.findByName('UsdCollectionAPI')
    const unknown = TfType.getUnknownType()
    expect(abstractTest.isUnknown()).toBe(false)
    expect(concreteTest.isUnknown()).toBe(false)
    expect(modelAPI.isUnknown()).toBe(false)
    expect(collectionAPI.isUnknown()).toBe(false)

    // Concrete typed schema.
    expect(UsdSchemaRegistry.getSchemaTypeName(concreteTest)).toBe('MetadataTest')
    expect(UsdSchemaRegistry.getConcreteSchemaTypeName(concreteTest)).toBe('MetadataTest')
    expect(UsdSchemaRegistry.getAPISchemaTypeName(concreteTest)).toBe('')
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('MetadataTest')).toBe(concreteTest)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('MetadataTest')).toBe(concreteTest)
    expect(UsdSchemaRegistry.getAPITypeFromSchemaTypeName('MetadataTest')).toBe(unknown)

    // Abstract typed schema.
    expect(UsdSchemaRegistry.getSchemaTypeName(abstractTest)).toBe('AbstractTest')
    expect(UsdSchemaRegistry.getConcreteSchemaTypeName(abstractTest)).toBe('')
    expect(UsdSchemaRegistry.getAPISchemaTypeName(abstractTest)).toBe('')
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('AbstractTest')).toBe(abstractTest)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('AbstractTest')).toBe(unknown)

    // Applied (multiple-apply) API schema.
    expect(UsdSchemaRegistry.getSchemaTypeName(collectionAPI)).toBe('CollectionAPI')
    expect(UsdSchemaRegistry.getConcreteSchemaTypeName(collectionAPI)).toBe('')
    expect(UsdSchemaRegistry.getAPISchemaTypeName(collectionAPI)).toBe('CollectionAPI')
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('CollectionAPI')).toBe(collectionAPI)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('CollectionAPI')).toBe(unknown)
    expect(UsdSchemaRegistry.getAPITypeFromSchemaTypeName('CollectionAPI')).toBe(collectionAPI)

    // Non-apply API schema (same API surface as applied APIs).
    expect(UsdSchemaRegistry.getSchemaTypeName(modelAPI)).toBe('ModelAPI')
    expect(UsdSchemaRegistry.getConcreteSchemaTypeName(modelAPI)).toBe('')
    expect(UsdSchemaRegistry.getAPISchemaTypeName(modelAPI)).toBe('ModelAPI')
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('ModelAPI')).toBe(modelAPI)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('ModelAPI')).toBe(unknown)
    expect(UsdSchemaRegistry.getAPITypeFromSchemaTypeName('ModelAPI')).toBe(modelAPI)

    // The abstract base schema UsdTyped.
    const typed = TfType.findByName('UsdTyped')
    expect(UsdSchemaRegistry.getSchemaTypeName(typed)).toBe('Typed')
  })

  it('FindConcretePrimDefinition: concrete schemas only, with built-in property specs', () => {
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    // Built-in property names.
    expect(primDef!.getPropertyNames()).toEqual(['testAttr', 'testRel'])

    // Relationship/property spec for 'testRel', attribute spec absent.
    expect(primDef!.getPropertyDefinition('testRel').isValid()).toBe(true)
    expect(primDef!.getAttributeDefinition('testRel').isValid()).toBe(false)
    expect(primDef!.getRelationshipDefinition('testRel').isValid()).toBe(true)

    // Attribute/property spec for 'testAttr', relationship spec absent.
    expect(primDef!.getPropertyDefinition('testAttr').isValid()).toBe(true)
    expect(primDef!.getAttributeDefinition('testAttr').isValid()).toBe(true)
    expect(primDef!.getRelationshipDefinition('testAttr').isValid()).toBe(false)

    // Non-apply API schema: no prim definition.
    expect(registry.findConcretePrimDefinition('ModelAPI')).toBeNull()
    // Applied API schema: not returned from findConcretePrimDefinition.
    expect(registry.findConcretePrimDefinition('CollectionAPI')).toBeNull()
  })

  it('FindAppliedAPIPrimDefinition: applied API schemas only, with template property specs', () => {
    const registry = setupRegistry()
    const primDef = registry.findAppliedAPIPrimDefinition('CollectionAPI')
    expect(primDef).not.toBeNull()

    // Built-in property names (name templates — the definition is for the
    // CollectionAPI itself, not an applied instance).
    expect(primDef!.getPropertyNames()).toEqual([
      'collection:__INSTANCE_NAME__',
      'collection:__INSTANCE_NAME__:excludes',
      'collection:__INSTANCE_NAME__:expansionRule',
      'collection:__INSTANCE_NAME__:includeRoot',
      'collection:__INSTANCE_NAME__:includes',
      'collection:__INSTANCE_NAME__:membershipExpression',
      'collection:__INSTANCE_NAME__:mode',
    ])

    // Relationship/property spec for 'excludes'.
    expect(primDef!.getPropertyDefinition('collection:__INSTANCE_NAME__:excludes').isValid()).toBe(true)
    expect(primDef!.getAttributeDefinition('collection:__INSTANCE_NAME__:excludes').isValid()).toBe(false)
    expect(primDef!.getRelationshipDefinition('collection:__INSTANCE_NAME__:excludes').isValid()).toBe(true)

    // Attribute/property spec for 'expansionRule'.
    expect(primDef!.getPropertyDefinition('collection:__INSTANCE_NAME__:expansionRule').isValid()).toBe(true)
    expect(primDef!.getAttributeDefinition('collection:__INSTANCE_NAME__:expansionRule').isValid()).toBe(true)
    expect(primDef!.getRelationshipDefinition('collection:__INSTANCE_NAME__:expansionRule').isValid()).toBe(false)

    // Attribute/property spec for 'membershipExpression'.
    expect(primDef!.getPropertyDefinition('collection:__INSTANCE_NAME__:membershipExpression').isValid()).toBe(true)
    expect(primDef!.getAttributeDefinition('collection:__INSTANCE_NAME__:membershipExpression').isValid()).toBe(true)
    expect(primDef!.getRelationshipDefinition('collection:__INSTANCE_NAME__:membershipExpression').isValid()).toBe(false)

    // API schema but not applied: no prim definition.
    expect(registry.findAppliedAPIPrimDefinition('ModelAPI')).toBeNull()
    // Concrete typed schema: not returned from findAppliedAPIPrimDefinition.
    expect(registry.findAppliedAPIPrimDefinition('MetadataTest')).toBeNull()
  })

  it('IsTyped: API schemas are not typed', () => {
    setupRegistry()
    expect(UsdSchemaRegistry.isTyped(TfType.findByName('UsdModelAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isTyped(TfType.findByName('UsdClipsAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isTyped(TfType.findByName('UsdCollectionAPI'))).toBe(false)
  })

  it('GetSchemaKind: nonAppliedAPI / multipleApplyAPI / invalid', () => {
    setupRegistry()
    expect(UsdSchemaRegistry.getSchemaKind(TfType.findByName('UsdModelAPI'))).toBe('nonAppliedAPI')
    expect(UsdSchemaRegistry.getSchemaKind(TfType.findByName('UsdClipsAPI'))).toBe('nonAppliedAPI')
    expect(UsdSchemaRegistry.getSchemaKind(TfType.findByName('UsdCollectionAPI'))).toBe('multipleApplyAPI')
    expect(UsdSchemaRegistry.getSchemaKind('Bogus')).toBe('invalid')
  })

  it('SchemaIdentifier: identifier vs alias precedence when registering schema type names', () => {
    setupRegistry()

    // Schema identifier matches alias.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryIdentifierMatchesAlias')),
    ).toBe('IdentifierMatchesAlias')

    // Schema identifier does not match alias — identifier wins.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryIdentifierDoesNotMatchAlias')),
    ).toBe('NotMatching')

    // No schema identifier, but alias is present.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryNoIdentifier')),
    ).toBe('NoIdentifier')

    // No alias, but schema identifier is present.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryNoAlias')),
    ).toBe('NoAlias')

    // Invalid case: neither present — registration fails for the type (the
    // upstream coding error; see header exclusion 2) and it gets no name.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryNoIdentifierAndNoAlias')),
    ).toBe('')

    // Schema identifier matches class name.
    expect(
      UsdSchemaRegistry.getSchemaTypeName(TfType.findByName('TestUsdSchemaRegistryIdentifierMatchesClassName')),
    ).toBe('TestUsdSchemaRegistryIdentifierMatchesClassName')
  })

  it('IsConcrete: API schemas are not concrete', () => {
    setupRegistry()
    expect(UsdSchemaRegistry.isConcrete(TfType.findByName('UsdModelAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isConcrete(TfType.findByName('UsdClipsAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isConcrete(TfType.findByName('UsdCollectionAPI'))).toBe(false)
  })

  it('IsAppliedAPISchema: only CollectionAPI of the three is applied', () => {
    setupRegistry()
    expect(UsdSchemaRegistry.isAppliedAPISchema(TfType.findByName('UsdModelAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isAppliedAPISchema(TfType.findByName('UsdClipsAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isAppliedAPISchema(TfType.findByName('UsdCollectionAPI'))).toBe(true)
  })

  it('IsMultipleApplyAPISchema: only CollectionAPI of the three is multiple-apply', () => {
    setupRegistry()
    expect(UsdSchemaRegistry.isMultipleApplyAPISchema(TfType.findByName('UsdModelAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isMultipleApplyAPISchema(TfType.findByName('UsdClipsAPI'))).toBe(false)
    expect(UsdSchemaRegistry.isMultipleApplyAPISchema(TfType.findByName('UsdCollectionAPI'))).toBe(true)
  })

  it('GetTypeNameAndInstance: splits multiple-apply tokens at the first namespace delimiter', () => {
    // Multiple-apply API schema token.
    expect(UsdSchemaRegistry.getTypeNameAndInstance('CollectionAPI:lightlink')).toEqual([
      'CollectionAPI', 'lightlink',
    ])
    // Single-apply API schema token.
    expect(UsdSchemaRegistry.getTypeNameAndInstance('SingleApplyAPI')).toEqual(['SingleApplyAPI', ''])
  })

  it('MultipleApplyNameTemplates: make/instance/base-name/is-template incl. edge cases', () => {
    // Making template names from any combination of prefix and base name.
    expect(UsdSchemaRegistry.makeMultipleApplyNameTemplate('foo', 'bar')).toBe('foo:__INSTANCE_NAME__:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameTemplate('foo', '')).toBe('foo:__INSTANCE_NAME__')
    expect(UsdSchemaRegistry.makeMultipleApplyNameTemplate('', 'bar')).toBe('__INSTANCE_NAME__:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameTemplate('', '')).toBe('__INSTANCE_NAME__')

    // Instance versions of template names.
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__:bar', 'inst1')).toBe('foo:inst1:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__:bar', 'inst2')).toBe('foo:inst2:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__', 'inst1')).toBe('foo:inst1')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__', 'inst2')).toBe('foo:inst2')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('__INSTANCE_NAME__:bar', 'inst1')).toBe('inst1:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('__INSTANCE_NAME__:bar', 'inst2')).toBe('inst2:bar')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('__INSTANCE_NAME__', 'inst1')).toBe('inst1')
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('__INSTANCE_NAME__', 'inst2')).toBe('inst2')

    // Base name from a name template.
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME__:bar')).toBe('bar')
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME__:bar:baz')).toBe('bar:baz')
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME__')).toBe('')
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('__INSTANCE_NAME__:bar')).toBe('bar')
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('__INSTANCE_NAME__')).toBe('')

    // IsMultipleApplyNameTemplate — template names.
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo:__INSTANCE_NAME__:bar')).toBe(true)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo:__INSTANCE_NAME__:bar:baz')).toBe(true)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo:__INSTANCE_NAME__')).toBe(true)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('__INSTANCE_NAME__:bar')).toBe(true)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('__INSTANCE_NAME__')).toBe(true)
    // Not template names.
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo')).toBe(false)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo:__INSTANCE_NAME__bar')).toBe(false)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('foo:__INSTANCE_NAME__bar:baz')).toBe(false)
    expect(UsdSchemaRegistry.isMultipleApplyNameTemplate('')).toBe(false)

    // Edge cases — not an instanceable name: returned as-is.
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo', 'inst1')).toBe('foo')
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo')).toBe('foo')
    // The placeholder must be an exact full-word match.
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME___:bar', 'inst1')).toBe(
      'foo:__INSTANCE_NAME___:bar',
    )
    expect(UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME___:bar')).toBe(
      'foo:__INSTANCE_NAME___:bar',
    )
    // Only the FIRST placeholder occurrence is replaced.
    expect(
      UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__:__INSTANCE_NAME__', 'inst1'),
    ).toBe('foo:inst1:__INSTANCE_NAME__')
    expect(
      UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME__:__INSTANCE_NAME__'),
    ).toBe('__INSTANCE_NAME__')
    expect(
      UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__:__INSTANCE_NAME__:bar', 'inst1'),
    ).toBe('foo:inst1:__INSTANCE_NAME__:bar')
    expect(
      UsdSchemaRegistry.getMultipleApplyNameTemplateBaseName('foo:__INSTANCE_NAME__:__INSTANCE_NAME__:bar'),
    ).toBe('__INSTANCE_NAME__:bar')
    // An empty instance name still replaces the placeholder.
    expect(UsdSchemaRegistry.makeMultipleApplyNameInstance('foo:__INSTANCE_NAME__:bar', '')).toBe('foo::bar')
  })

  it('FlattenPrimDefinition: flatten concrete/API/composed prim definitions to layer specs', async () => {
    // Root layer with one sublayer, both reachable through the virtual fs so
    // the stage can compose them (upstream uses anonymous layers +
    // subLayerPaths; the sublayer relationship is the same).
    const FLATTEN_ROOT = `#usda 1.0\n(\n    subLayers = [ @./flattenSub.usda@ ]\n)\n`
    const FLATTEN_SUB = `#usda 1.0\n`
    const files: Record<string, string> = {
      'flattenRoot.usda': FLATTEN_ROOT,
      'flattenSub.usda': FLATTEN_SUB,
    }
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))

    const registry = setupRegistry()
    const stage = (await Stage.open('flattenRoot.usda'))!
    const layer = stage.getRootLayer()
    const sublayer = stage.getLayerStack(false).find((l) => l !== layer)!
    expect(sublayer).toBeDefined()

    // Substrate note: our layer scenes carry child-index bookkeeping fields
    // alongside value fields; they are structural, not spec metadata, and are
    // excluded from upstream's ListInfoKeys exhaustiveness check.
    const STRUCTURAL_FIELDS = new Set(['primChildren', 'properties', 'primOrder', 'propertyOrder'])

    // Upstream _VerifyExpectedFieldValues: every expected field has the
    // expected value AND every authored field is in the expected set.
    const verifyExpectedFieldValues = (
      l: Layer,
      specPath: string,
      expectedFieldValues: Record<string, unknown>,
    ) => {
      for (const [field, value] of Object.entries(expectedFieldValues)) {
        expect(l.getField(specPath, field), `${specPath} @ ${field}`).toEqual(value)
      }
      for (const field of l.getFieldNames(specPath)) {
        if (!STRUCTURAL_FIELDS.has(field)) {
          expect(Object.keys(expectedFieldValues), `unexpected field ${field} on ${specPath}`).toContain(field)
        }
      }
    }

    // Upstream _VerifyExpectedPrimData: the prim spec exists with exactly the
    // expected fields, and exactly the expected properties each with exactly
    // their expected fields.
    const verifyExpectedPrimData = (
      l: Layer,
      specPath: string,
      expectedPrimFields: Record<string, unknown>,
      expectedProperties: Record<string, Record<string, unknown>>,
    ) => {
      expect(l.getSpecPaths()).toContain(specPath)
      verifyExpectedFieldValues(l, specPath, expectedPrimFields)
      const propNames = (l.getField(specPath, 'properties') as string[] | undefined) ?? []
      expect(new Set(propNames)).toEqual(new Set(Object.keys(expectedProperties)))
      for (const [propName, fieldValues] of Object.entries(expectedProperties)) {
        verifyExpectedFieldValues(l, `${specPath}.${propName}`, fieldValues)
      }
    }

    // Flatten the concrete prim definition to a new path with the def
    // specifier (creates the spec, plus an over for the absent parent).
    const concretePrimDef = registry.findConcretePrimDefinition('MetadataTest')!
    expect(concretePrimDef).toBeTruthy()
    expect(concretePrimDef.flattenTo(layer, '/PrimDefs/ConcreteSchema', 'def')).toBe(true)

    // Expected fields/properties from the concrete schema (upstream's exact
    // values; listOps compared as explicit listOp data, variability/specifier
    // as their token forms, property typeName as its token).
    const concretePrimDefPrimFields: Record<string, unknown> = {
      apiSchemas: expect.objectContaining({ isExplicit: true, explicitItems: [] }),
      documentation: concretePrimDef.getDocumentation(),
      hidden: true,
      testCustomMetadata: 'garply',
      testDictionaryMetadata: { name: 'foo', value: 2 },
      specifier: 'def',
      typeName: 'MetadataTest',
    }
    const concretePrimDefProperties: Record<string, Record<string, unknown>> = {
      testAttr: {
        custom: false,
        default: 'foo',
        typeName: 'string',
        allowedTokens: ['bar', 'baz'],
        displayGroup: 'Display Group',
        displayName: 'Display Name',
        hidden: true,
        testCustomMetadata: 'garply',
        testDictionaryMetadata: { name: 'bar', value: 3 },
        variability: 'varying',
        customData: { userDocBrief: 'Testing brief user doc for schema attr' },
      },
      testRel: {
        custom: false,
        displayGroup: 'Display Group',
        displayName: 'Display Name',
        hidden: true,
        testCustomMetadata: 'garply',
        testDictionaryMetadata: { name: 'baz', value: 5 },
        variability: 'uniform',
        customData: { userDocBrief: 'Testing brief user doc for schema rel' },
      },
    }
    verifyExpectedPrimData(layer, '/PrimDefs/ConcreteSchema', concretePrimDefPrimFields, concretePrimDefProperties)

    // Flatten the CollectionAPI prim definition with the fallback 'over'
    // specifier. The properties keep their template names — this is the API's
    // own definition, not an applied instance.
    const apiPrimDef = registry.findAppliedAPIPrimDefinition('CollectionAPI')!
    expect(apiPrimDef).toBeTruthy()
    expect(apiPrimDef.flattenTo(layer, '/PrimDefs/APISchema')).toBe(true)

    const apiPrimDefPrimFields: Record<string, unknown> = {
      apiSchemas: expect.objectContaining({
        isExplicit: true,
        explicitItems: ['CollectionAPI:__INSTANCE_NAME__'],
      }),
      documentation: apiPrimDef.getDocumentation(),
      specifier: 'over',
    }
    const apiPrimDefProperties: Record<string, Record<string, unknown>> = {
      'collection:__INSTANCE_NAME__': {
        custom: false,
        typeName: 'opaque',
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__'),
        },
      },
      'collection:__INSTANCE_NAME__:expansionRule': {
        custom: false,
        default: 'expandPrims',
        typeName: 'token',
        allowedTokens: ['explicitOnly', 'expandPrims', 'expandPrimsAndProperties'],
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:expansionRule'),
        },
      },
      'collection:__INSTANCE_NAME__:includeRoot': {
        custom: false,
        default: undefined,
        typeName: 'bool',
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:includeRoot'),
        },
      },
      'collection:__INSTANCE_NAME__:includes': {
        custom: false,
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:includes'),
        },
      },
      'collection:__INSTANCE_NAME__:excludes': {
        custom: false,
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:excludes'),
        },
      },
      'collection:__INSTANCE_NAME__:membershipExpression': {
        custom: false,
        default: undefined,
        typeName: 'pathExpression',
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:membershipExpression'),
        },
      },
      'collection:__INSTANCE_NAME__:mode': {
        custom: false,
        default: 'automatic',
        typeName: 'token',
        allowedTokens: ['automatic', 'relationship', 'expression'],
        variability: 'uniform',
        customData: {
          userDocBrief: apiPrimDef.getPropertyDocumentation('collection:__INSTANCE_NAME__:mode'),
        },
      },
    }
    verifyExpectedPrimData(layer, '/PrimDefs/APISchema', apiPrimDefPrimFields, apiPrimDefProperties)

    // The FlattenTo overloads that take a parent prim + child name — pick up
    // the layer edits on the stage first (async-coalesced composition).
    await stage.flushChanges()
    const parentPrim = stage.getPrim('/PrimDefs')
    expect(parentPrim).toBeDefined()

    // Flatten the concrete prim def to a new child prim via the current edit
    // target (root layer). Default specifier is 'over'.
    const flattenPrim = concretePrimDef.flattenTo(parentPrim!, 'FlattenToNewPrim')
    expect(flattenPrim).not.toBeNull()
    concretePrimDefPrimFields['specifier'] = 'over'
    verifyExpectedPrimData(layer, '/PrimDefs/FlattenToNewPrim', concretePrimDefPrimFields, concretePrimDefProperties)

    // Flatten the API prim def to the same prim via the SUBLAYER edit target.
    stage.setEditTarget(sublayer)
    const flattenPrim2 = apiPrimDef.flattenTo(flattenPrim!)
    expect(flattenPrim2).not.toBeNull()
    stage.setEditTarget(layer)

    // Sublayer got the API schema spec; the root layer still has the
    // flattened concrete schema spec.
    verifyExpectedPrimData(layer, '/PrimDefs/FlattenToNewPrim', concretePrimDefPrimFields, concretePrimDefProperties)
    verifyExpectedPrimData(sublayer, '/PrimDefs/FlattenToNewPrim', apiPrimDefPrimFields, apiPrimDefProperties)

    // Flatten the API prim def again with the root-layer edit target: the
    // root spec's fields and properties are fully replaced.
    const flattenPrim3 = apiPrimDef.flattenTo(flattenPrim2!)
    expect(flattenPrim3).not.toBeNull()
    verifyExpectedPrimData(layer, '/PrimDefs/FlattenToNewPrim', apiPrimDefPrimFields, apiPrimDefProperties)

    // Composed prim definition: MetadataTest with CollectionAPI:foo applied,
    // flattened onto the already-existing /PrimDefs spec.
    const newPrimDef = registry.buildComposedPrimDefinition('MetadataTest', ['CollectionAPI:foo'])
    expect(layer.getSpecPaths()).toContain('/PrimDefs')
    expect(newPrimDef.flattenTo(layer, '/PrimDefs', 'def')).toBe(true)

    // Prim fields match the concrete def (prim fields never come from applied
    // API schemas); apiSchemas becomes the explicit applied list; the
    // specifier stays 'over' because the spec already existed (the suggested
    // 'def' applies only to newly created specs).
    const newPrimDefPrimFields: Record<string, unknown> = {
      ...concretePrimDefPrimFields,
      apiSchemas: expect.objectContaining({ isExplicit: true, explicitItems: ['CollectionAPI:foo'] }),
      specifier: 'over',
    }

    // Properties are the union of the concrete schema's and the applied
    // instance's (template names instantiated with 'foo').
    const newPrimDefProperties: Record<string, Record<string, unknown>> = { ...concretePrimDefProperties }
    for (const [propName, fieldValues] of Object.entries(apiPrimDefProperties)) {
      const fooPropName = UsdSchemaRegistry.makeMultipleApplyNameInstance(propName, 'foo')
      newPrimDefProperties[fooPropName] = fieldValues
    }
    verifyExpectedPrimData(layer, '/PrimDefs', newPrimDefPrimFields, newPrimDefProperties)

    // FlattenTo never clears fields that can't be schema metadata — the
    // existing children survive.
    expect(layer.getSpecPaths()).toContain('/PrimDefs/ConcreteSchema')
    expect(layer.getSpecPaths()).toContain('/PrimDefs/APISchema')
    expect(layer.getSpecPaths()).toContain('/PrimDefs/FlattenToNewPrim')
  })

  it('metadata-by-dict-key misses: bogus keys and non-dictionary fields yield undefined (cpp slice)', () => {
    // The portable slice of testUsdSchemaRegistryCpp.cpp's
    // TestPrimMetadata/TestAttributeMetadata dict-key negative cases.
    const registry = setupRegistry()
    const primDef = registry.findConcretePrimDefinition('MetadataTest')
    expect(primDef).not.toBeNull()

    // Prim-level.
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'bogus')).toBeUndefined()
    expect(primDef!.getMetadataByDictKey('testCustomMetadata', 'name')).toBeUndefined()

    // Attribute-level, via both the attr def and the prim def property API.
    const attrDef = primDef!.getAttributeDefinition('testAttr')
    expect(attrDef.isValid()).toBe(true)
    expect(attrDef.getMetadataByDictKey('testDictionaryMetadata', 'bogus')).toBeUndefined()
    expect(attrDef.getMetadataByDictKey('testCustomMetadata', 'name')).toBeUndefined()
    expect(primDef!.getMetadataByDictKey('testDictionaryMetadata', 'bogus', 'testAttr')).toBeUndefined()
    expect(primDef!.getMetadataByDictKey('testCustomMetadata', 'name', 'testAttr')).toBeUndefined()
  })
})
