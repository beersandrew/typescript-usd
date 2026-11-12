// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdSchemaVersioning.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/testenv/testUsdSchemaVersioning.py (v26.05)
//
// Scoreboard for schema versioning (versioning landed at full parity with the
// F1 flip). Every case
// carries the upstream test's EXACT expected values (identifiers, versions,
// orderings, property-name lists copied from the .py, not re-derived).
// FLIPPED at the F1 registry core: test_ParseFamilyAndVersion and
// test_SchemaInfo (the pure-registry cases) self-promoted and are plain it()
// now. FLIPPED at F1-C (prim/value-resolution wiring): the remaining six
// (test_PrimIsA, test_PrimHasAPI_SingleApply, test_PrimHasAPI_MultiApply,
// test_ApplyRemoveAPI, test_APISchemaVersionConflicts, test_AutoApplyAPI)
// self-promoted once prim.isA/hasAPI/applyAPI/getPrimTypeInfo/
// getAppliedSchemas landed — the whole suite is plain it() now.
//
// Coverage (all 8 upstream test methods ported — no exclusions):
//   test_ParseFamilyAndVersion   → identifier grammar (parse/make/allowed)
//   test_SchemaInfo              → findSchemaInfo by type/identifier/(family,
//                                  version), findSchemaInfosInFamily ordering
//                                  + VersionPolicy filtering, family edge cases
//   test_PrimIsA                 → versioned IsA / IsInFamily /
//                                  GetVersionIfIsInFamily
//   test_PrimHasAPI_SingleApply  → versioned HasAPI / HasAPIInFamily /
//                                  GetVersionIfHasAPIInFamily
//   test_PrimHasAPI_MultiApply   → same, with instance names
//   test_ApplyRemoveAPI          → versioned CanApplyAPI/ApplyAPI/RemoveAPI
//   test_APISchemaVersionConflicts → the seenSchemaFamilyVersions guard: only
//                                  one version of a family composes into a
//                                  prim (authored, built-in, and nested
//                                  built-in API schema version conflicts)
//   test_AutoApplyAPI            → versioned auto-apply (latest version wins;
//                                  no cross-version propagation)
//
// Adaptations (API-shape only; expected values are upstream's verbatim):
//  * Usd.SchemaRegistry.VersionPolicy enum → the UsdSchemaVersionPolicy string
//    union ('all' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' |
//    'lessThanOrEqual'); Usd.SchemaKind → UsdSchemaKind strings.
//  * Upstream's two-arg FindSchemaInfo(family, version) overload is the TS
//    findSchemaInfoInFamily(family, version) (findSchemaInfo takes
//    TfType | identifier).
//  * The versioned overloads of isA/hasAPI/canApplyAPI/applyAPI/removeAPI —
//    (family, version[, instanceName]) and TfType forms — are not on today's
//    TS signatures; they are exercised through a loose dynamic call so the
//    upstream call shapes are preserved and resolve against the real
//    overloads when F1 lands.
//  * prim.GetPropertyNames() has no Prim analog yet; these prims author no
//    properties (only apiSchemas metadata), so the composed prim definition's
//    property names, sorted, are the same set — asserted via
//    getPrimDefinition().getPropertyNames().
//  * The vendored plugInfo.json keeps upstream's leading '#' comment lines
//    (pxr/base/js strips them when reading); the loader here strips them
//    before JSON.parse.
//
// Fixtures: tests/upstream/fixtures/schemaVersioning/{plugInfo.json,
// generatedSchema.usda,schema.usda} — vendored VERBATIM from upstream
// testenv/testUsdSchemaVersioning/resources (schema.usda is the codegen
// source, kept for provenance; the registry consumes plugInfo.json +
// generatedSchema.usda).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import { Registry as PlugRegistry, Info as PlugInfo } from 'typescript-usd/plug'
import {
  Stage,
  SchemaRegistry as UsdSchemaRegistry,
  type Prim,
  SchemaInfo as UsdSchemaInfo,
  SchemaKind as UsdSchemaKind,
  SchemaVersionPolicy as UsdSchemaVersionPolicy,
} from 'typescript-usd/usd'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'schemaVersioning')

// ---------------------------------------------------------------------------
// Setup helpers (called from INSIDE each case — no beforeAll).
// ---------------------------------------------------------------------------

function readTestPlugInfo(): PlugInfo {
  const raw = readFileSync(join(FIXTURES, 'plugInfo.json'), 'utf8')
  // Upstream plugInfo.json carries '#' comment lines; JSON.parse does not.
  const json = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  return JSON.parse(json) as PlugInfo
}

// Registered once per process (upstream registers in setUpClass; the plug
// registry is first-registration-wins, so re-registering would return []).
let testPluginRegistered = false

function registerTestPlugin(): void {
  if (testPluginRegistered) return
  const plugins = PlugRegistry.GetInstance().RegisterPlugins(readTestPlugInfo(), {
    testUsdSchemaVersioning: {
      'generatedSchema.usda': readFileSync(join(FIXTURES, 'generatedSchema.usda'), 'utf8'),
    },
  })
  // Upstream setUpClass: "Failed to load expected test plugin".
  expect(plugins).toHaveLength(1)
  expect(plugins[0]!.getName()).toBe('testUsdSchemaVersioning')
  testPluginRegistered = true
}

/** The nine versioned schema TfTypes upstream resolves in setUpClass. */
function requireVersionedTypes() {
  registerTestPlugin()
  const find = (name: string): TfType => TfType.findByName(name)
  const types = {
    basicVersion0: find('TestUsdSchemaVersioningTestBasicVersioned'),
    basicVersion1: find('TestUsdSchemaVersioningTestBasicVersioned_1'),
    basicVersion2: find('TestUsdSchemaVersioningTestBasicVersioned_2'),
    singleApiVersion0: find('TestUsdSchemaVersioningTestVersionedSingleApplyAPI'),
    singleApiVersion1: find('TestUsdSchemaVersioningTestVersionedSingleApplyAPI_1'),
    singleApiVersion2: find('TestUsdSchemaVersioningTestVersionedSingleApplyAPI_2'),
    multiApiVersion0: find('TestUsdSchemaVersioningTestVersionedMultiApplyAPI'),
    multiApiVersion1: find('TestUsdSchemaVersioningTestVersionedMultiApplyAPI_1'),
    multiApiVersion2: find('TestUsdSchemaVersioningTestVersionedMultiApplyAPI_2'),
  }
  for (const t of Object.values(types)) expect(t.isUnknown()).toBe(false)
  return types
}

// ---------------------------------------------------------------------------
// Assertion helpers (ports of the .py _Verify* helpers).
// ---------------------------------------------------------------------------

interface ExpectedSchemaInfo {
  type: TfType
  identifier: string
  kind: UsdSchemaKind
  family: string
  version: number
}

function verifySchemaInfo(info: UsdSchemaInfo | null, expected: ExpectedSchemaInfo): void {
  expect(info).not.toBeNull()
  expect(info!.type).toBe(expected.type)
  expect(info!.identifier).toBe(expected.identifier)
  expect(info!.kind).toBe(expected.kind)
  expect(info!.family).toBe(expected.family)
  expect(info!.version).toBe(expected.version)
}

function verifySchemaInfoList(list: UsdSchemaInfo[], expectedList: ExpectedSchemaInfo[]): void {
  expect(list).toHaveLength(expectedList.length)
  for (let i = 0; i < expectedList.length; i++) verifySchemaInfo(list[i]!, expectedList[i]!)
}

// Upstream's versioned overloads — IsA(family, version), HasAPI(TfType),
// HasAPI(family, version[, instance]), CanApplyAPI/ApplyAPI/RemoveAPI ditto —
// are dispatched by name with upstream's exact argument shapes; since F1-C
// they resolve against the real overloads on Prim (usdCall is kept so the
// call shapes stay verbatim from the .py).
function usdCall<T>(obj: object, method: string, ...args: unknown[]): T {
  const fn = (obj as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new Error(`${method}: no such method`)
  return (fn as (...a: unknown[]) => T).apply(obj, args)
}

/** prim.IsA by all three input forms (TfType / identifier / family+version). */
function verifyIsA(prim: Prim, info: ExpectedSchemaInfo, expected: boolean): void {
  expect(usdCall<boolean>(prim, 'isA', info.type)).toBe(expected)
  expect(prim.isA(info.identifier)).toBe(expected)
  expect(usdCall<boolean>(prim, 'isA', info.family, info.version)).toBe(expected)
}

/** prim.IsInFamily by all three input forms with a version policy. */
function verifyIsInFamily(
  prim: Prim,
  info: ExpectedSchemaInfo,
  policy: UsdSchemaVersionPolicy,
  expected: boolean,
): void {
  expect(prim.isInFamily(info.type, policy)).toBe(expected)
  expect(prim.isInFamily(info.identifier, policy)).toBe(expected)
  expect(prim.isInFamily(info.family, info.version, policy)).toBe(expected)
}

/** prim.HasAPI by all three input forms. */
function verifyHasAPI(prim: Prim, info: ExpectedSchemaInfo, expected: boolean): void {
  expect(usdCall<boolean>(prim, 'hasAPI', info.type)).toBe(expected)
  expect(prim.hasAPI(info.identifier)).toBe(expected)
  expect(usdCall<boolean>(prim, 'hasAPI', info.family, info.version)).toBe(expected)
}

/** prim.HasAPI with an instance name, by all three input forms. */
function verifyHasAPIInstance(
  prim: Prim,
  info: ExpectedSchemaInfo,
  instanceName: string,
  expected: boolean,
): void {
  expect(usdCall<boolean>(prim, 'hasAPI', info.type, instanceName)).toBe(expected)
  expect(usdCall<boolean>(prim, 'hasAPI', info.identifier, instanceName)).toBe(expected)
  expect(usdCall<boolean>(prim, 'hasAPI', info.family, info.version, instanceName)).toBe(expected)
}

/** prim.HasAPIInFamily by all three input forms with a version policy. */
function verifyHasAPIInFamily(
  prim: Prim,
  info: ExpectedSchemaInfo,
  policy: UsdSchemaVersionPolicy,
  expected: boolean,
): void {
  expect(prim.hasAPIInFamily(info.type, policy)).toBe(expected)
  expect(prim.hasAPIInFamily(info.identifier, policy)).toBe(expected)
  expect(prim.hasAPIInFamily(info.family, info.version, policy)).toBe(expected)
}

/** prim.HasAPIInFamily with an instance name, by all three input forms. */
function verifyHasAPIInFamilyInstance(
  prim: Prim,
  info: ExpectedSchemaInfo,
  policy: UsdSchemaVersionPolicy,
  instanceName: string,
  expected: boolean,
): void {
  expect(prim.hasAPIInFamily(info.type, policy, instanceName)).toBe(expected)
  expect(prim.hasAPIInFamily(info.identifier, policy, instanceName)).toBe(expected)
  expect(prim.hasAPIInFamily(info.family, info.version, policy, instanceName)).toBe(expected)
}

/** prim.CanApplyAPI by all three input forms. */
function verifyCanApplyAPI(prim: Prim, info: ExpectedSchemaInfo, expected: boolean): void {
  expect(usdCall<boolean>(prim, 'canApplyAPI', info.type)).toBe(expected)
  expect(prim.canApplyAPI(info.identifier)).toBe(expected)
  expect(usdCall<boolean>(prim, 'canApplyAPI', info.family, info.version)).toBe(expected)
}

/** prim.CanApplyAPI with an instance name, by all three input forms. */
function verifyCanApplyAPIInstance(
  prim: Prim,
  info: ExpectedSchemaInfo,
  instanceName: string,
  expected: boolean,
): void {
  expect(usdCall<boolean>(prim, 'canApplyAPI', info.type, instanceName)).toBe(expected)
  expect(usdCall<boolean>(prim, 'canApplyAPI', info.identifier, instanceName)).toBe(expected)
  expect(usdCall<boolean>(prim, 'canApplyAPI', info.family, info.version, instanceName)).toBe(expected)
}

// UsdPrim::GetPropertyNames — none of these prims author properties (only the
// apiSchemas metadata), so the composed prim definition carries the full set.
// Sorted, matching upstream's dictionary-ordered expected lists.
function propertyNames(prim: Prim): string[] {
  return [...prim.getPrimDefinition().getPropertyNames()].sort()
}

// Expected SchemaInfo builders (values verbatim from the .py).
function basicExpectedInfos(types: ReturnType<typeof requireVersionedTypes>): ExpectedSchemaInfo[] {
  return [
    { type: types.basicVersion0, identifier: 'TestBasicVersioned', kind: 'concreteTyped', family: 'TestBasicVersioned', version: 0 },
    { type: types.basicVersion1, identifier: 'TestBasicVersioned_1', kind: 'concreteTyped', family: 'TestBasicVersioned', version: 1 },
    { type: types.basicVersion2, identifier: 'TestBasicVersioned_2', kind: 'concreteTyped', family: 'TestBasicVersioned', version: 2 },
  ]
}

function singleApplyExpectedInfos(types: ReturnType<typeof requireVersionedTypes>): ExpectedSchemaInfo[] {
  return [
    { type: types.singleApiVersion0, identifier: 'TestVersionedSingleApplyAPI', kind: 'singleApplyAPI', family: 'TestVersionedSingleApplyAPI', version: 0 },
    { type: types.singleApiVersion1, identifier: 'TestVersionedSingleApplyAPI_1', kind: 'singleApplyAPI', family: 'TestVersionedSingleApplyAPI', version: 1 },
    { type: types.singleApiVersion2, identifier: 'TestVersionedSingleApplyAPI_2', kind: 'singleApplyAPI', family: 'TestVersionedSingleApplyAPI', version: 2 },
  ]
}

function multiApplyExpectedInfos(types: ReturnType<typeof requireVersionedTypes>): ExpectedSchemaInfo[] {
  return [
    { type: types.multiApiVersion0, identifier: 'TestVersionedMultiApplyAPI', kind: 'multipleApplyAPI', family: 'TestVersionedMultiApplyAPI', version: 0 },
    { type: types.multiApiVersion1, identifier: 'TestVersionedMultiApplyAPI_1', kind: 'multipleApplyAPI', family: 'TestVersionedMultiApplyAPI', version: 1 },
    { type: types.multiApiVersion2, identifier: 'TestVersionedMultiApplyAPI_2', kind: 'multipleApplyAPI', family: 'TestVersionedMultiApplyAPI', version: 2 },
  ]
}

// ---------------------------------------------------------------------------
// The suite.
// ---------------------------------------------------------------------------

describe('UsdSchemaVersioning (red scoreboard — flips with schema-registry F0/F1)', () => {
  it('test_ParseFamilyAndVersion: identifier grammar (parse / make / allowed)', () => {
    // Port of _VerifyVersionParsing: parse the identifier, check family- and
    // identifier-allowedness, and round-trip through
    // makeSchemaIdentifierForFamilyAndVersion.
    const verifyVersionParsing = (
      identifier: string,
      family: string,
      version: number,
      expectFamilyAllowed = true,
      expectIdentifierAllowed = true,
    ): void => {
      expect(
        UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(identifier),
      ).toEqual([family, version])

      expect(UsdSchemaRegistry.isAllowedSchemaFamily(family)).toBe(expectFamilyAllowed)
      expect(UsdSchemaRegistry.isAllowedSchemaIdentifier(identifier)).toBe(expectIdentifierAllowed)

      const madeIdentifier = UsdSchemaRegistry.makeSchemaIdentifierForFamilyAndVersion(family, version)
      // If the family is allowed but the identifier is not, the identifier is
      // not the one the family+version produce, so it won't match.
      if (expectFamilyAllowed && !expectIdentifierAllowed) {
        expect(madeIdentifier).not.toBe(identifier)
      } else {
        expect(madeIdentifier).toBe(identifier)
      }
    }

    // Parse allowed versioned identifiers.
    verifyVersionParsing('Foo', 'Foo', 0)
    verifyVersionParsing('Foo_1', 'Foo', 1)
    verifyVersionParsing('Foo_20', 'Foo', 20)

    verifyVersionParsing('Foo_Bar', 'Foo_Bar', 0)
    verifyVersionParsing('Foo_Bar_1', 'Foo_Bar', 1)
    verifyVersionParsing('Foo_Bar_20', 'Foo_Bar', 20)

    verifyVersionParsing('Foo_', 'Foo_', 0)
    verifyVersionParsing('Foo__1', 'Foo_', 1)
    verifyVersionParsing('Foo__20', 'Foo_', 20)

    verifyVersionParsing('Foo_1_', 'Foo_1_', 0)
    verifyVersionParsing('Foo_1__1', 'Foo_1_', 1)
    verifyVersionParsing('Foo_1__20', 'Foo_1_', 20)

    verifyVersionParsing('_Foo', '_Foo', 0)
    verifyVersionParsing('_Foo_1', '_Foo', 1)
    verifyVersionParsing('_Foo_20', '_Foo', 20)

    // Bad versioned identifiers that parse into unallowed families.
    verifyVersionParsing('_1', '', 1, false, false)
    verifyVersionParsing('Foo_20_1', 'Foo_20', 1, false, false)
    verifyVersionParsing('Foo_22.5', 'Foo_22.5', 0, false, false)
    verifyVersionParsing('Foo_-1', 'Foo_-1', 0, false, false)
    verifyVersionParsing('', '', 0, false, false)

    // Bad versioned identifiers that parse into allowed families but don't
    // use the expected suffix format for that version.
    verifyVersionParsing('Foo_0', 'Foo', 0, true, false)
    verifyVersionParsing('Foo_01', 'Foo', 1, true, false)
  })

  it('test_SchemaInfo: findSchemaInfo / findSchemaInfosInFamily ordering + VersionPolicy filtering', () => {
    const types = requireVersionedTypes()
    const [expectedVersion0Info, expectedVersion1Info, expectedVersion2Info] =
      basicExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]

    // Find schema by TfType.
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo(types.basicVersion0), expectedVersion0Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo(types.basicVersion1), expectedVersion1Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo(types.basicVersion2), expectedVersion2Info)

    // Find schema by identifier.
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo('TestBasicVersioned'), expectedVersion0Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo('TestBasicVersioned_1'), expectedVersion1Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfo('TestBasicVersioned_2'), expectedVersion2Info)

    // Find schema by family and version (upstream FindSchemaInfo(family, version)).
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfoInFamily('TestBasicVersioned', 0), expectedVersion0Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfoInFamily('TestBasicVersioned', 1), expectedVersion1Info)
    verifySchemaInfo(UsdSchemaRegistry.findSchemaInfoInFamily('TestBasicVersioned', 2), expectedVersion2Info)

    // Find all schemas in a family — ordered highest version to lowest.
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])

    // VersionPolicy = all
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 0, 'all'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 1, 'all'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 2, 'all'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])

    // VersionPolicy = greaterThan
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 0, 'greaterThan'), [
      expectedVersion2Info, expectedVersion1Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 1, 'greaterThan'), [
      expectedVersion2Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 2, 'greaterThan'), [])

    // VersionPolicy = greaterThanOrEqual
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 0, 'greaterThanOrEqual'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 1, 'greaterThanOrEqual'), [
      expectedVersion2Info, expectedVersion1Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 2, 'greaterThanOrEqual'), [
      expectedVersion2Info,
    ])

    // VersionPolicy = lessThan
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 0, 'lessThan'), [])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 1, 'lessThan'), [
      expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 2, 'lessThan'), [
      expectedVersion1Info, expectedVersion0Info,
    ])

    // VersionPolicy = lessThanOrEqual
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 0, 'lessThanOrEqual'), [
      expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 1, 'lessThanOrEqual'), [
      expectedVersion1Info, expectedVersion0Info,
    ])
    verifySchemaInfoList(UsdSchemaRegistry.findSchemaInfosInFamily('TestBasicVersioned', 2, 'lessThanOrEqual'), [
      expectedVersion2Info, expectedVersion1Info, expectedVersion0Info,
    ])

    // Edge cases: a registered non-zero versioned identifier used AS a family
    // finds nothing (a versioned identifier is not itself a family).
    const validVersionedIdentifier = 'TestBasicVersioned_1'
    expect(UsdSchemaRegistry.findSchemaInfo(validVersionedIdentifier)).not.toBeNull()
    expect(UsdSchemaRegistry.findSchemaInfoInFamily(validVersionedIdentifier, 0)).toBeNull()
    expect(UsdSchemaRegistry.findSchemaInfosInFamily(validVersionedIdentifier)).toEqual([])
    expect(UsdSchemaRegistry.findSchemaInfosInFamily(validVersionedIdentifier, 0, 'all')).toEqual([])
  })

  it('test_PrimIsA: versioned IsA / IsInFamily / GetVersionIfIsInFamily', () => {
    const types = requireVersionedTypes()
    const [expectedVersion0Info, expectedVersion1Info, expectedVersion2Info] =
      basicExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]

    // A prim typed with each version of the schema.
    const stage = Stage.createNew()
    const primV0 = stage.definePrim('/Prim', 'TestBasicVersioned')
    const primV1 = stage.definePrim('/Prim1', 'TestBasicVersioned_1')
    const primV2 = stage.definePrim('/Prim2', 'TestBasicVersioned_2')

    expect(primV0).toBeTruthy()
    expect(primV1).toBeTruthy()
    expect(primV2).toBeTruthy()

    // Prim0 IsA version 0 of "TestBasicVersioned" only.
    verifyIsA(primV0, expectedVersion0Info, true)
    verifyIsA(primV0, expectedVersion1Info, false)
    verifyIsA(primV0, expectedVersion2Info, false)

    // Prim0 is SOME version in the family; its version is 0.
    expect(primV0.isInFamily('TestBasicVersioned')).toBe(true)
    expect(primV0.getVersionIfIsInFamily('TestBasicVersioned')).toBe(0)

    verifyIsInFamily(primV0, expectedVersion0Info, 'all', true)
    verifyIsInFamily(primV0, expectedVersion1Info, 'all', true)
    verifyIsInFamily(primV0, expectedVersion2Info, 'all', true)

    verifyIsInFamily(primV0, expectedVersion0Info, 'greaterThan', false)
    verifyIsInFamily(primV0, expectedVersion1Info, 'greaterThan', false)
    verifyIsInFamily(primV0, expectedVersion2Info, 'greaterThan', false)

    verifyIsInFamily(primV0, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyIsInFamily(primV0, expectedVersion1Info, 'greaterThanOrEqual', false)
    verifyIsInFamily(primV0, expectedVersion2Info, 'greaterThanOrEqual', false)

    verifyIsInFamily(primV0, expectedVersion0Info, 'lessThan', false)
    verifyIsInFamily(primV0, expectedVersion1Info, 'lessThan', true)
    verifyIsInFamily(primV0, expectedVersion2Info, 'lessThan', true)

    verifyIsInFamily(primV0, expectedVersion0Info, 'lessThanOrEqual', true)
    verifyIsInFamily(primV0, expectedVersion1Info, 'lessThanOrEqual', true)
    verifyIsInFamily(primV0, expectedVersion2Info, 'lessThanOrEqual', true)

    // Prim1 IsA version 1 only.
    verifyIsA(primV1, expectedVersion0Info, false)
    verifyIsA(primV1, expectedVersion1Info, true)
    verifyIsA(primV1, expectedVersion2Info, false)

    expect(primV1.isInFamily('TestBasicVersioned')).toBe(true)
    expect(primV1.getVersionIfIsInFamily('TestBasicVersioned')).toBe(1)

    verifyIsInFamily(primV1, expectedVersion0Info, 'all', true)
    verifyIsInFamily(primV1, expectedVersion1Info, 'all', true)
    verifyIsInFamily(primV1, expectedVersion2Info, 'all', true)

    verifyIsInFamily(primV1, expectedVersion0Info, 'greaterThan', true)
    verifyIsInFamily(primV1, expectedVersion1Info, 'greaterThan', false)
    verifyIsInFamily(primV1, expectedVersion2Info, 'greaterThan', false)

    verifyIsInFamily(primV1, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyIsInFamily(primV1, expectedVersion1Info, 'greaterThanOrEqual', true)
    verifyIsInFamily(primV1, expectedVersion2Info, 'greaterThanOrEqual', false)

    verifyIsInFamily(primV1, expectedVersion0Info, 'lessThan', false)
    verifyIsInFamily(primV1, expectedVersion1Info, 'lessThan', false)
    verifyIsInFamily(primV1, expectedVersion2Info, 'lessThan', true)

    verifyIsInFamily(primV1, expectedVersion0Info, 'lessThanOrEqual', false)
    verifyIsInFamily(primV1, expectedVersion1Info, 'lessThanOrEqual', true)
    verifyIsInFamily(primV1, expectedVersion2Info, 'lessThanOrEqual', true)

    // Prim2 IsA version 2 only.
    verifyIsA(primV2, expectedVersion0Info, false)
    verifyIsA(primV2, expectedVersion1Info, false)
    verifyIsA(primV2, expectedVersion2Info, true)

    expect(primV2.isInFamily('TestBasicVersioned')).toBe(true)
    expect(primV2.getVersionIfIsInFamily('TestBasicVersioned')).toBe(2)

    verifyIsInFamily(primV2, expectedVersion0Info, 'all', true)
    verifyIsInFamily(primV2, expectedVersion1Info, 'all', true)
    verifyIsInFamily(primV2, expectedVersion2Info, 'all', true)

    verifyIsInFamily(primV2, expectedVersion0Info, 'greaterThan', true)
    verifyIsInFamily(primV2, expectedVersion1Info, 'greaterThan', true)
    verifyIsInFamily(primV2, expectedVersion2Info, 'greaterThan', false)

    verifyIsInFamily(primV2, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyIsInFamily(primV2, expectedVersion1Info, 'greaterThanOrEqual', true)
    verifyIsInFamily(primV2, expectedVersion2Info, 'greaterThanOrEqual', true)

    verifyIsInFamily(primV2, expectedVersion0Info, 'lessThan', false)
    verifyIsInFamily(primV2, expectedVersion1Info, 'lessThan', false)
    verifyIsInFamily(primV2, expectedVersion2Info, 'lessThan', false)

    verifyIsInFamily(primV2, expectedVersion0Info, 'lessThanOrEqual', false)
    verifyIsInFamily(primV2, expectedVersion1Info, 'lessThanOrEqual', false)
    verifyIsInFamily(primV2, expectedVersion2Info, 'lessThanOrEqual', true)

    // Version 3 of "TestBasicVersioned" does not exist: no prim IsA it...
    expect(UsdSchemaRegistry.findSchemaInfo('TestBasicVersioned_3')).toBeNull()
    expect(UsdSchemaRegistry.findSchemaInfoInFamily('TestBasicVersioned', 3)).toBeNull()
    expect(usdCall<boolean>(primV2, 'isA', 'TestBasicVersioned', 3)).toBe(false)
    expect(primV2.isA('TestBasicVersioned_3')).toBe(false)

    // ...but it can still be used to query IsInFamily.
    expect(primV2.isInFamily('TestBasicVersioned', 3, 'lessThan')).toBe(true)
    expect(primV2.isInFamily('TestBasicVersioned', 3, 'greaterThanOrEqual')).toBe(false)
    expect(primV2.isInFamily('TestBasicVersioned_3', 'lessThan')).toBe(true)
    expect(primV2.isInFamily('TestBasicVersioned_3', 'greaterThanOrEqual')).toBe(false)
  })

  it('test_PrimHasAPI_SingleApply: versioned HasAPI / HasAPIInFamily / GetVersionIfHasAPIInFamily', () => {
    const types = requireVersionedTypes()
    const [expectedVersion0Info, expectedVersion1Info, expectedVersion2Info] =
      singleApplyExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]

    const stage = Stage.createNew()
    const primV0 = stage.definePrim('/Prim')
    const primV1 = stage.definePrim('/Prim1')
    const primV2 = stage.definePrim('/Prim2')

    expect(primV0).toBeTruthy()
    expect(primV1).toBeTruthy()
    expect(primV2).toBeTruthy()

    usdCall(primV0, 'applyAPI', types.singleApiVersion0)
    usdCall(primV1, 'applyAPI', types.singleApiVersion1)
    usdCall(primV2, 'applyAPI', types.singleApiVersion2)

    // Prim0 HasAPI version 0 only.
    verifyHasAPI(primV0, expectedVersion0Info, true)
    verifyHasAPI(primV0, expectedVersion1Info, false)
    verifyHasAPI(primV0, expectedVersion2Info, false)

    expect(primV0.hasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(true)
    expect(primV0.getVersionIfHasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(0)

    verifyHasAPIInFamily(primV0, expectedVersion0Info, 'all', true)
    verifyHasAPIInFamily(primV0, expectedVersion1Info, 'all', true)
    verifyHasAPIInFamily(primV0, expectedVersion2Info, 'all', true)

    verifyHasAPIInFamily(primV0, expectedVersion0Info, 'greaterThan', false)
    verifyHasAPIInFamily(primV0, expectedVersion1Info, 'greaterThan', false)
    verifyHasAPIInFamily(primV0, expectedVersion2Info, 'greaterThan', false)

    verifyHasAPIInFamily(primV0, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyHasAPIInFamily(primV0, expectedVersion1Info, 'greaterThanOrEqual', false)
    verifyHasAPIInFamily(primV0, expectedVersion2Info, 'greaterThanOrEqual', false)

    verifyHasAPIInFamily(primV0, expectedVersion0Info, 'lessThan', false)
    verifyHasAPIInFamily(primV0, expectedVersion1Info, 'lessThan', true)
    verifyHasAPIInFamily(primV0, expectedVersion2Info, 'lessThan', true)

    verifyHasAPIInFamily(primV0, expectedVersion0Info, 'lessThanOrEqual', true)
    verifyHasAPIInFamily(primV0, expectedVersion1Info, 'lessThanOrEqual', true)
    verifyHasAPIInFamily(primV0, expectedVersion2Info, 'lessThanOrEqual', true)

    // Prim1 HasAPI version 1 only.
    verifyHasAPI(primV1, expectedVersion0Info, false)
    verifyHasAPI(primV1, expectedVersion1Info, true)
    verifyHasAPI(primV1, expectedVersion2Info, false)

    expect(primV1.hasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(true)
    expect(primV1.getVersionIfHasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(1)

    verifyHasAPIInFamily(primV1, expectedVersion0Info, 'all', true)
    verifyHasAPIInFamily(primV1, expectedVersion1Info, 'all', true)
    verifyHasAPIInFamily(primV1, expectedVersion2Info, 'all', true)

    verifyHasAPIInFamily(primV1, expectedVersion0Info, 'greaterThan', true)
    verifyHasAPIInFamily(primV1, expectedVersion1Info, 'greaterThan', false)
    verifyHasAPIInFamily(primV1, expectedVersion2Info, 'greaterThan', false)

    verifyHasAPIInFamily(primV1, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyHasAPIInFamily(primV1, expectedVersion1Info, 'greaterThanOrEqual', true)
    verifyHasAPIInFamily(primV1, expectedVersion2Info, 'greaterThanOrEqual', false)

    verifyHasAPIInFamily(primV1, expectedVersion0Info, 'lessThan', false)
    verifyHasAPIInFamily(primV1, expectedVersion1Info, 'lessThan', false)
    verifyHasAPIInFamily(primV1, expectedVersion2Info, 'lessThan', true)

    verifyHasAPIInFamily(primV1, expectedVersion0Info, 'lessThanOrEqual', false)
    verifyHasAPIInFamily(primV1, expectedVersion1Info, 'lessThanOrEqual', true)
    verifyHasAPIInFamily(primV1, expectedVersion2Info, 'lessThanOrEqual', true)

    // Prim2 HasAPI version 2 only.
    verifyHasAPI(primV2, expectedVersion0Info, false)
    verifyHasAPI(primV2, expectedVersion1Info, false)
    verifyHasAPI(primV2, expectedVersion2Info, true)

    expect(primV2.hasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(true)
    expect(primV2.getVersionIfHasAPIInFamily('TestVersionedSingleApplyAPI')).toBe(2)

    verifyHasAPIInFamily(primV2, expectedVersion0Info, 'all', true)
    verifyHasAPIInFamily(primV2, expectedVersion1Info, 'all', true)
    verifyHasAPIInFamily(primV2, expectedVersion2Info, 'all', true)

    verifyHasAPIInFamily(primV2, expectedVersion0Info, 'greaterThan', true)
    verifyHasAPIInFamily(primV2, expectedVersion1Info, 'greaterThan', true)
    verifyHasAPIInFamily(primV2, expectedVersion2Info, 'greaterThan', false)

    verifyHasAPIInFamily(primV2, expectedVersion0Info, 'greaterThanOrEqual', true)
    verifyHasAPIInFamily(primV2, expectedVersion1Info, 'greaterThanOrEqual', true)
    verifyHasAPIInFamily(primV2, expectedVersion2Info, 'greaterThanOrEqual', true)

    verifyHasAPIInFamily(primV2, expectedVersion0Info, 'lessThan', false)
    verifyHasAPIInFamily(primV2, expectedVersion1Info, 'lessThan', false)
    verifyHasAPIInFamily(primV2, expectedVersion2Info, 'lessThan', false)

    verifyHasAPIInFamily(primV2, expectedVersion0Info, 'lessThanOrEqual', false)
    verifyHasAPIInFamily(primV2, expectedVersion1Info, 'lessThanOrEqual', false)
    verifyHasAPIInFamily(primV2, expectedVersion2Info, 'lessThanOrEqual', true)

    // Version 3 of the API does not exist: no prim HasAPI it...
    expect(UsdSchemaRegistry.findSchemaInfo('TestVersionedSingleApplyAPI_3')).toBeNull()
    expect(UsdSchemaRegistry.findSchemaInfoInFamily('TestVersionedSingleApplyAPI', 3)).toBeNull()
    expect(usdCall<boolean>(primV2, 'hasAPI', 'TestVersionedSingleApplyAPI', 3)).toBe(false)
    expect(primV2.hasAPI('TestVersionedSingleApplyAPI_3')).toBe(false)

    // ...but it can still be used to query HasAPIInFamily.
    expect(primV2.hasAPIInFamily('TestVersionedSingleApplyAPI', 3, 'lessThan')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedSingleApplyAPI', 3, 'greaterThanOrEqual')).toBe(false)
    expect(primV2.hasAPIInFamily('TestVersionedSingleApplyAPI_3', 'lessThan')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedSingleApplyAPI_3', 'greaterThanOrEqual')).toBe(false)
  })

  it('test_PrimHasAPI_MultiApply: versioned HasAPI with instance names', () => {
    const types = requireVersionedTypes()
    const [expectedVersion0Info, expectedVersion1Info, expectedVersion2Info] =
      multiApplyExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]

    const stage = Stage.createNew()
    const primV0 = stage.definePrim('/Prim')
    const primV1 = stage.definePrim('/Prim1')
    const primV2 = stage.definePrim('/Prim2')

    expect(primV0).toBeTruthy()
    expect(primV1).toBeTruthy()
    expect(primV2).toBeTruthy()

    // prim0 -> "API:foo",   "API_2:bar"
    // prim1 -> "API_1:foo", "API_1:bar"
    // prim2 -> "API_2:foo", "API:bar"
    expect(usdCall<boolean>(primV0, 'applyAPI', types.multiApiVersion0, 'foo')).toBe(true)
    expect(usdCall<boolean>(primV1, 'applyAPI', types.multiApiVersion1, 'foo')).toBe(true)
    expect(usdCall<boolean>(primV2, 'applyAPI', types.multiApiVersion2, 'foo')).toBe(true)

    expect(usdCall<boolean>(primV0, 'applyAPI', types.multiApiVersion2, 'bar')).toBe(true)
    expect(usdCall<boolean>(primV1, 'applyAPI', types.multiApiVersion1, 'bar')).toBe(true)
    expect(usdCall<boolean>(primV2, 'applyAPI', types.multiApiVersion0, 'bar')).toBe(true)

    // HasAPI (no instance name) is true iff any instance is applied; HasAPI
    // with "foo"/"bar" iff that instance is applied.
    const verifyHasAPIInstances = (
      prim: Prim,
      info: ExpectedSchemaInfo,
      expectedHasInstanceNames: string[],
    ): void => {
      verifyHasAPI(prim, info, expectedHasInstanceNames.length > 0)
      verifyHasAPIInstance(prim, info, 'foo', expectedHasInstanceNames.includes('foo'))
      verifyHasAPIInstance(prim, info, 'bar', expectedHasInstanceNames.includes('bar'))
    }

    const verifyHasAPIInFamilyInstances = (
      prim: Prim,
      info: ExpectedSchemaInfo,
      policy: UsdSchemaVersionPolicy,
      expectedHasInstanceNames: string[],
    ): void => {
      verifyHasAPIInFamily(prim, info, policy, expectedHasInstanceNames.length > 0)
      verifyHasAPIInFamilyInstance(prim, info, policy, 'foo', expectedHasInstanceNames.includes('foo'))
      verifyHasAPIInFamilyInstance(prim, info, policy, 'bar', expectedHasInstanceNames.includes('bar'))
    }

    // Prim0: version 0 with "foo", version 2 with "bar".
    verifyHasAPIInstances(primV0, expectedVersion0Info, ['foo'])
    verifyHasAPIInstances(primV0, expectedVersion1Info, [])
    verifyHasAPIInstances(primV0, expectedVersion2Info, ['bar'])

    expect(primV0.hasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(true)
    expect(primV0.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(0)
    expect(primV0.hasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(true)
    expect(primV0.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(2)
    // Any instance: differing instance versions report the latest (2).
    expect(primV0.hasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(true)
    expect(primV0.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(2)

    verifyHasAPIInFamilyInstances(primV0, expectedVersion0Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion1Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion2Info, 'all', ['foo', 'bar'])

    verifyHasAPIInFamilyInstances(primV0, expectedVersion0Info, 'greaterThan', ['bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion1Info, 'greaterThan', ['bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion2Info, 'greaterThan', [])

    verifyHasAPIInFamilyInstances(primV0, expectedVersion0Info, 'greaterThanOrEqual', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion1Info, 'greaterThanOrEqual', ['bar'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion2Info, 'greaterThanOrEqual', ['bar'])

    verifyHasAPIInFamilyInstances(primV0, expectedVersion0Info, 'lessThan', [])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion1Info, 'lessThan', ['foo'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion2Info, 'lessThan', ['foo'])

    verifyHasAPIInFamilyInstances(primV0, expectedVersion0Info, 'lessThanOrEqual', ['foo'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion1Info, 'lessThanOrEqual', ['foo'])
    verifyHasAPIInFamilyInstances(primV0, expectedVersion2Info, 'lessThanOrEqual', ['foo', 'bar'])

    // Prim1: version 1 with both "foo" and "bar".
    verifyHasAPIInstances(primV1, expectedVersion0Info, [])
    verifyHasAPIInstances(primV1, expectedVersion1Info, ['foo', 'bar'])
    verifyHasAPIInstances(primV1, expectedVersion2Info, [])

    expect(primV1.hasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(true)
    expect(primV1.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(1)
    expect(primV1.hasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(true)
    expect(primV1.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(1)
    // Any instance: both instances share version 1.
    expect(primV1.hasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(true)
    expect(primV1.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(1)

    verifyHasAPIInFamilyInstances(primV1, expectedVersion0Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion1Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion2Info, 'all', ['foo', 'bar'])

    verifyHasAPIInFamilyInstances(primV1, expectedVersion0Info, 'greaterThan', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion1Info, 'greaterThan', [])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion2Info, 'greaterThan', [])

    verifyHasAPIInFamilyInstances(primV1, expectedVersion0Info, 'greaterThanOrEqual', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion1Info, 'greaterThanOrEqual', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion2Info, 'greaterThanOrEqual', [])

    verifyHasAPIInFamilyInstances(primV1, expectedVersion0Info, 'lessThan', [])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion1Info, 'lessThan', [])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion2Info, 'lessThan', ['foo', 'bar'])

    verifyHasAPIInFamilyInstances(primV1, expectedVersion0Info, 'lessThanOrEqual', [])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion1Info, 'lessThanOrEqual', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV1, expectedVersion2Info, 'lessThanOrEqual', ['foo', 'bar'])

    // Prim2: version 2 with "foo", version 0 with "bar".
    verifyHasAPIInstances(primV2, expectedVersion0Info, ['bar'])
    verifyHasAPIInstances(primV2, expectedVersion1Info, [])
    verifyHasAPIInstances(primV2, expectedVersion2Info, ['foo'])

    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(true)
    expect(primV2.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'foo')).toBe(2)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(true)
    expect(primV2.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI', 'bar')).toBe(0)
    // Any instance: differing instance versions report the latest (2).
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(true)
    expect(primV2.getVersionIfHasAPIInFamily('TestVersionedMultiApplyAPI')).toBe(2)

    verifyHasAPIInFamilyInstances(primV2, expectedVersion0Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion1Info, 'all', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion2Info, 'all', ['foo', 'bar'])

    verifyHasAPIInFamilyInstances(primV2, expectedVersion0Info, 'greaterThan', ['foo'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion1Info, 'greaterThan', ['foo'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion2Info, 'greaterThan', [])

    verifyHasAPIInFamilyInstances(primV2, expectedVersion0Info, 'greaterThanOrEqual', ['foo', 'bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion1Info, 'greaterThanOrEqual', ['foo'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion2Info, 'greaterThanOrEqual', ['foo'])

    verifyHasAPIInFamilyInstances(primV2, expectedVersion0Info, 'lessThan', [])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion1Info, 'lessThan', ['bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion2Info, 'lessThan', ['bar'])

    verifyHasAPIInFamilyInstances(primV2, expectedVersion0Info, 'lessThanOrEqual', ['bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion1Info, 'lessThanOrEqual', ['bar'])
    verifyHasAPIInFamilyInstances(primV2, expectedVersion2Info, 'lessThanOrEqual', ['foo', 'bar'])

    // Version 3 of the multi-apply API does not exist: no prim HasAPI it...
    expect(UsdSchemaRegistry.findSchemaInfo('TestVersionedMultiApplyAPI_3')).toBeNull()
    expect(UsdSchemaRegistry.findSchemaInfoInFamily('TestVersionedMultiApplyAPI', 3)).toBeNull()
    expect(usdCall<boolean>(primV2, 'hasAPI', 'TestVersionedMultiApplyAPI', 3)).toBe(false)
    expect(primV2.hasAPI('TestVersionedMultiApplyAPI_3')).toBe(false)

    // ...but it can still be used to query HasAPIInFamily...
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 3, 'lessThan')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 3, 'greaterThanOrEqual')).toBe(false)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI_3', 'lessThan')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI_3', 'greaterThanOrEqual')).toBe(false)

    // ...including with a specific instance name.
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 3, 'lessThan', 'foo')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI', 3, 'greaterThanOrEqual', 'foo')).toBe(false)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI_3', 'lessThan', 'foo')).toBe(true)
    expect(primV2.hasAPIInFamily('TestVersionedMultiApplyAPI_3', 'greaterThanOrEqual', 'foo')).toBe(false)
  })

  it('test_ApplyRemoveAPI: versioned CanApplyAPI / ApplyAPI / RemoveAPI', () => {
    const types = requireVersionedTypes()
    const [expectedSingleApplyVersion0Info, expectedSingleApplyVersion1Info, expectedSingleApplyVersion2Info] =
      singleApplyExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]
    const [expectedMultiApplyVersion0Info, expectedMultiApplyVersion1Info, expectedMultiApplyVersion2Info] =
      multiApplyExpectedInfos(types) as [ExpectedSchemaInfo, ExpectedSchemaInfo, ExpectedSchemaInfo]

    // Apply then remove a single-apply API schema through every combination
    // of the input forms (type/identifier/family+version).
    const verifyApplyAndRemoveAPI = (prim: Prim, info: ExpectedSchemaInfo): void => {
      verifyHasAPI(prim, info, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.type)).toBe(true)
      verifyHasAPI(prim, info, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.identifier)).toBe(true)
      verifyHasAPI(prim, info, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.identifier)).toBe(true)
      verifyHasAPI(prim, info, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.family, info.version)).toBe(true)
      verifyHasAPI(prim, info, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.family, info.version)).toBe(true)
      verifyHasAPI(prim, info, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.type)).toBe(true)
      verifyHasAPI(prim, info, false)
    }

    // Same, for a multiple-apply API schema instance.
    const verifyApplyAndRemoveAPIInstance = (
      prim: Prim,
      info: ExpectedSchemaInfo,
      instanceName: string,
    ): void => {
      verifyHasAPIInstance(prim, info, instanceName, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.type, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.identifier, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.identifier, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.family, info.version, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, false)

      expect(usdCall<boolean>(prim, 'applyAPI', info.family, info.version, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, true)
      expect(usdCall<boolean>(prim, 'removeAPI', info.type, instanceName)).toBe(true)
      verifyHasAPIInstance(prim, info, instanceName, false)
    }

    // A prim typed with each version of the typed schema — the type drives
    // CanApplyAPI (apiSchemaCanOnlyApplyTo).
    const stage = Stage.createNew()
    const primV0 = stage.definePrim('/Prim', 'TestBasicVersioned')
    const primV1 = stage.definePrim('/Prim1', 'TestBasicVersioned_1')
    const primV2 = stage.definePrim('/Prim2', 'TestBasicVersioned_2')

    // Each single-apply version can only apply to the SAME version of the
    // typed schema.
    verifyCanApplyAPI(primV0, expectedSingleApplyVersion0Info, true)
    verifyCanApplyAPI(primV0, expectedSingleApplyVersion1Info, false)
    verifyCanApplyAPI(primV0, expectedSingleApplyVersion2Info, false)

    verifyCanApplyAPI(primV1, expectedSingleApplyVersion0Info, false)
    verifyCanApplyAPI(primV1, expectedSingleApplyVersion1Info, true)
    verifyCanApplyAPI(primV1, expectedSingleApplyVersion2Info, false)

    verifyCanApplyAPI(primV2, expectedSingleApplyVersion0Info, false)
    verifyCanApplyAPI(primV2, expectedSingleApplyVersion1Info, false)
    verifyCanApplyAPI(primV2, expectedSingleApplyVersion2Info, true)

    // CanApplyAPI does NOT gate ApplyAPI: all versions apply and remove fine.
    verifyApplyAndRemoveAPI(primV0, expectedSingleApplyVersion0Info)
    verifyApplyAndRemoveAPI(primV0, expectedSingleApplyVersion1Info)
    verifyApplyAndRemoveAPI(primV0, expectedSingleApplyVersion2Info)

    // Multi-apply canOnlyApplyTo:
    //   API version 0 → typed version 0
    //   API version 1 → typed versions 0, 1
    //   API version 2 → typed versions 1, 2
    verifyCanApplyAPIInstance(primV0, expectedMultiApplyVersion0Info, 'foo', true)
    verifyCanApplyAPIInstance(primV0, expectedMultiApplyVersion1Info, 'foo', true)
    verifyCanApplyAPIInstance(primV0, expectedMultiApplyVersion2Info, 'foo', false)

    verifyCanApplyAPIInstance(primV1, expectedMultiApplyVersion0Info, 'foo', false)
    verifyCanApplyAPIInstance(primV1, expectedMultiApplyVersion1Info, 'foo', true)
    verifyCanApplyAPIInstance(primV1, expectedMultiApplyVersion2Info, 'foo', true)

    verifyCanApplyAPIInstance(primV2, expectedMultiApplyVersion0Info, 'foo', false)
    verifyCanApplyAPIInstance(primV2, expectedMultiApplyVersion1Info, 'foo', false)
    verifyCanApplyAPIInstance(primV2, expectedMultiApplyVersion2Info, 'foo', true)

    verifyApplyAndRemoveAPIInstance(primV0, expectedMultiApplyVersion0Info, 'foo')
    verifyApplyAndRemoveAPIInstance(primV0, expectedMultiApplyVersion1Info, 'foo')
    verifyApplyAndRemoveAPIInstance(primV0, expectedMultiApplyVersion2Info, 'foo')
  })

  it('test_APISchemaVersionConflicts: only one version of a family composes into a prim (seenSchemaFamilyVersions guard)', () => {
    requireVersionedTypes()
    const stage = Stage.createNew()

    let primNum = 0
    const makeNewPrimPath = (): string => `/Prim${++primNum}`

    // A typeless prim to apply API schemas to.
    let prim = stage.definePrim(makeNewPrimPath())
    expect(prim).toBeTruthy()
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(prim.getAppliedSchemas()).toEqual([])

    // Apply version 1 of the single-apply API.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedSingleApplyAPI_1')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestVersionedSingleApplyAPI_1'])
    expect(prim.getAppliedSchemas()).toEqual(['TestVersionedSingleApplyAPI_1'])
    expect(propertyNames(prim)).toEqual(['s_attr1'])

    // Apply versions 0 and 2 too: all three land in the AUTHORED schemas, but
    // the COMPOSED schemas keep only version 1 — one version per family.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedSingleApplyAPI')).toBe(true)
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedSingleApplyAPI_2')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedSingleApplyAPI',
      'TestVersionedSingleApplyAPI_2',
    ])
    expect(prim.getAppliedSchemas()).toEqual(['TestVersionedSingleApplyAPI_1'])
    expect(propertyNames(prim)).toEqual(['s_attr1'])

    // Different instance names are NOT a version conflict.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI', 'foo')).toBe(true)
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI_2', 'bar')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedSingleApplyAPI',
      'TestVersionedSingleApplyAPI_2',
      'TestVersionedMultiApplyAPI:foo',
      'TestVersionedMultiApplyAPI_2:bar',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
      'TestVersionedMultiApplyAPI_2:bar',
    ])
    expect(propertyNames(prim)).toEqual(['multi:bar:m_attr2', 'multi:foo:m_attr', 's_attr1'])

    // Same instance names, different version: skipped in the composed set.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI_1', 'foo')).toBe(true)
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI_1', 'bar')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedSingleApplyAPI',
      'TestVersionedSingleApplyAPI_2',
      'TestVersionedMultiApplyAPI:foo',
      'TestVersionedMultiApplyAPI_2:bar',
      'TestVersionedMultiApplyAPI_1:foo',
      'TestVersionedMultiApplyAPI_1:bar',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
      'TestVersionedMultiApplyAPI_2:bar',
    ])
    expect(propertyNames(prim)).toEqual(['multi:bar:m_attr2', 'multi:foo:m_attr', 's_attr1'])

    // A prim typed with built-in API schemas (single_1 and multi_2:foo): an
    // authored API schema cannot add a SECOND version of a family already
    // built into the type.
    prim = stage.definePrim(makeNewPrimPath(), 'TestPrimWithAPIBuiltins')
    expect(prim).toBeTruthy()
    expect(prim.isA('TestPrimWithAPIBuiltins')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI_2:foo',
    ])
    expect(propertyNames(prim)).toEqual(['multi:foo:m_attr2', 's_attr1'])

    // Conflicting versions with the built-ins: authored but not composed.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedSingleApplyAPI_2')).toBe(true)
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI', 'foo')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestVersionedSingleApplyAPI_2',
      'TestVersionedMultiApplyAPI:foo',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI_2:foo',
    ])
    expect(propertyNames(prim)).toEqual(['multi:foo:m_attr2', 's_attr1'])

    // A different instance name is not a conflict with the built-in instance.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestVersionedMultiApplyAPI', 'bar')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestVersionedSingleApplyAPI_2',
      'TestVersionedMultiApplyAPI:foo',
      'TestVersionedMultiApplyAPI:bar',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI_2:foo',
      'TestVersionedMultiApplyAPI:bar',
    ])
    expect(propertyNames(prim)).toEqual(['multi:bar:m_attr', 'multi:foo:m_attr2', 's_attr1'])

    // API schemas whose BUILT-INS are versioned schemas.
    prim = stage.definePrim(makeNewPrimPath())
    expect(prim).toBeTruthy()
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(prim.getAppliedSchemas()).toEqual([])

    expect(usdCall<boolean>(prim, 'applyAPI', 'TestAPIWithAPIBuiltins1_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestAPIWithAPIBuiltins1_API'])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAPIWithAPIBuiltins1_API',
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
    ])
    expect(propertyNames(prim)).toEqual(['b_attr1', 'multi:foo:m_attr', 's_attr1'])

    // Builtins2 conflicts with Builtins1's included schemas, so ALL of
    // Builtins2's schemas are skipped in the composed set.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestAPIWithAPIBuiltins2_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestAPIWithAPIBuiltins1_API',
      'TestAPIWithAPIBuiltins2_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAPIWithAPIBuiltins1_API',
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
    ])
    expect(propertyNames(prim)).toEqual(['b_attr1', 'multi:foo:m_attr', 's_attr1'])

    // Builtins3 would conflict with Builtins2, but Builtins2 is itself
    // excluded — so Builtins3's schemas compose in.
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestAPIWithAPIBuiltins3_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestAPIWithAPIBuiltins1_API',
      'TestAPIWithAPIBuiltins2_API',
      'TestAPIWithAPIBuiltins3_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAPIWithAPIBuiltins1_API',
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
      'TestAPIWithAPIBuiltins3_API',
      'TestVersionedMultiApplyAPI_2:bar',
      'TestVersionedMultiApplyAPI_2:baz',
    ])
    expect(propertyNames(prim)).toEqual([
      'b_attr1',
      'b_attr3',
      'multi:bar:m_attr2',
      'multi:baz:m_attr2',
      'multi:foo:m_attr',
      's_attr1',
    ])

    // Removing Builtins1 un-conflicts Builtins2, which in turn re-conflicts
    // (and excludes) Builtins3.
    expect(usdCall<boolean>(prim, 'removeAPI', 'TestAPIWithAPIBuiltins1_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestAPIWithAPIBuiltins2_API',
      'TestAPIWithAPIBuiltins3_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAPIWithAPIBuiltins2_API',
      'TestVersionedMultiApplyAPI:bar',
      'TestVersionedSingleApplyAPI_2',
    ])
    expect(propertyNames(prim)).toEqual(['b_attr2', 'multi:bar:m_attr', 's_attr2'])

    // Removing Builtins2 un-conflicts Builtins3 again.
    expect(usdCall<boolean>(prim, 'removeAPI', 'TestAPIWithAPIBuiltins2_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestAPIWithAPIBuiltins3_API'])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAPIWithAPIBuiltins3_API',
      'TestVersionedMultiApplyAPI_2:bar',
      'TestVersionedMultiApplyAPI_2:baz',
    ])
    expect(propertyNames(prim)).toEqual(['b_attr3', 'multi:bar:m_attr2', 'multi:baz:m_attr2'])

    // Schema definitions with INTERNAL version conflicts among their
    // built-ins: conflicting API schemas are skipped in the definitions.
    prim = stage.definePrim(makeNewPrimPath(), 'TestPrimWithAPIVersionConflict1')
    expect(prim).toBeTruthy()
    expect(prim.isA('TestPrimWithAPIVersionConflict1')).toBe(true)
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI',
      // Conflict: 'TestVersionedSingleApplyAPI_1',
      // Conflict: 'TestVersionedSingleApplyAPI_2',
    ])
    expect(propertyNames(prim)).toEqual(['s_attr'])

    prim = stage.definePrim(makeNewPrimPath(), 'TestPrimWithAPIVersionConflict2')
    expect(prim).toBeTruthy()
    expect(prim.isA('TestPrimWithAPIVersionConflict2')).toBe(true)
    expect(prim.getAppliedSchemas()).toEqual([
      'TestVersionedSingleApplyAPI_1',
      // Conflict: 'TestVersionedSingleApplyAPI',
      // Conflict: 'TestVersionedSingleApplyAPI_2',
    ])
    expect(propertyNames(prim)).toEqual(['s_attr1'])

    prim = stage.definePrim(makeNewPrimPath(), '')
    expect(prim).toBeTruthy()
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestSingleApplyWithAPIVersionConflict1_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict1_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict1_API',
      'TestVersionedSingleApplyAPI',
      // Conflict: 'TestVersionedSingleApplyAPI_1',
      // Conflict: 'TestVersionedSingleApplyAPI_2',
    ])
    expect(propertyNames(prim)).toEqual(['s_attr'])

    prim = stage.definePrim(makeNewPrimPath(), '')
    expect(prim).toBeTruthy()
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestSingleApplyWithAPIVersionConflict2_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict2_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict2_API',
      'TestVersionedSingleApplyAPI_1',
      // Conflict: 'TestVersionedSingleApplyAPI',
      // Conflict: 'TestVersionedSingleApplyAPI_2',
    ])
    expect(propertyNames(prim)).toEqual(['s_attr1'])

    prim = stage.definePrim(makeNewPrimPath(), '')
    expect(prim).toBeTruthy()
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestSingleApplyWithAPIVersionConflict3_API')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict3_API',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestSingleApplyWithAPIVersionConflict3_API',
      'TestAPIWithAPIBuiltins1_API',
      'TestVersionedSingleApplyAPI_1',
      'TestVersionedMultiApplyAPI:foo',
      // Conflict: 'TestAPIWithAPIBuiltins2_API',
      //   Conflict: 'TestVersionedMultiApplyAPI:bar',
      //   Conflict: 'TestVersionedSingleApplyAPI_2',
      'TestAPIWithAPIBuiltins3_API',
      'TestVersionedMultiApplyAPI_2:bar',
      'TestVersionedMultiApplyAPI_2:baz',
    ])
    expect(propertyNames(prim)).toEqual([
      'b_attr1',
      'b_attr3',
      'multi:bar:m_attr2',
      'multi:baz:m_attr2',
      'multi:foo:m_attr',
      's_attr1',
    ])

    prim = stage.definePrim(makeNewPrimPath(), '')
    expect(prim).toBeTruthy()
    expect(usdCall<boolean>(prim, 'applyAPI', 'TestMultiApplyWithAPIVersionConflict_API', 'bar')).toBe(true)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestMultiApplyWithAPIVersionConflict_API:bar',
    ])
    expect(prim.getAppliedSchemas()).toEqual([
      'TestMultiApplyWithAPIVersionConflict_API:bar',
      'TestVersionedMultiApplyAPI_1:bar',
      // Conflict: 'TestVersionedMultiApplyAPI_2:bar',
      'TestVersionedMultiApplyAPI_2:bar:foo',
      // Conflict: 'TestVersionedMultiApplyAPI:bar:foo',
    ])
    expect(propertyNames(prim)).toEqual(['multi:bar:foo:m_attr2', 'multi:bar:m_attr1'])
  })

  it('test_AutoApplyAPI: versioned auto-apply (latest version wins; no cross-version propagation)', () => {
    const types = requireVersionedTypes()

    // Auto-apply setup: versions 0, 2, and 10 of TestVersionedAutoApplyAPI
    // (version order 10 > 2 > 0 differs from lexicographic "_2" > "_10" > "").
    // All three auto-apply to TestBasicVersioned_1; only version 0 also
    // auto-applies to TestBasicVersioned.
    const autoApplySchemas = UsdSchemaRegistry.getAutoApplyAPISchemas()
    expect(autoApplySchemas.get('TestVersionedAutoApplyAPI')).toEqual([
      'TestBasicVersioned',
      'TestBasicVersioned_1',
    ])
    expect(autoApplySchemas.get('TestVersionedAutoApplyAPI_2')).toEqual(['TestBasicVersioned_1'])
    expect(autoApplySchemas.get('TestVersionedAutoApplyAPI_10')).toEqual(['TestBasicVersioned_1'])

    const stage = Stage.createNew()
    const primV0 = stage.definePrim('/Prim', 'TestBasicVersioned')
    const primV1 = stage.definePrim('/Prim1', 'TestBasicVersioned_1')
    const primV2 = stage.definePrim('/Prim2', 'TestBasicVersioned_2')

    expect(primV0).toBeTruthy()
    expect(primV1).toBeTruthy()
    expect(primV2).toBeTruthy()

    expect(usdCall<boolean>(primV0, 'isA', types.basicVersion0)).toBe(true)
    expect(usdCall<boolean>(primV1, 'isA', types.basicVersion1)).toBe(true)
    expect(usdCall<boolean>(primV2, 'isA', types.basicVersion2)).toBe(true)

    // TestBasicVersioned: only version 0 of the auto-apply API applies.
    expect(primV0.getAppliedSchemas()).toEqual(['TestVersionedAutoApplyAPI'])
    expect(propertyNames(primV0)).toEqual(['a_attr'])

    // TestBasicVersioned_1: all three versions auto-apply; only the LATEST
    // version of the family (10) is applied.
    expect(primV1.getAppliedSchemas()).toEqual(['TestVersionedAutoApplyAPI_10'])
    expect(propertyNames(primV1)).toEqual(['a_attr10'])

    // TestBasicVersioned_2: no version auto-applies — auto-applied schemas of
    // earlier versions do NOT propagate to later versions of the type.
    expect(primV2.getAppliedSchemas()).toEqual([])
    expect(propertyNames(primV2)).toEqual([])
  })
})
