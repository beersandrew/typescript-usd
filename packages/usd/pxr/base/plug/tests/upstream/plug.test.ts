// Ported from OpenUSD 26.11.1: pxr/base/plug/testPlug.py,
//  pxr/base/plug/testPlugBase.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/base/plug/testenv/testPlug.py (v26.05) — metadata/type-declaration slice.
//
// Ported: plugin registration from plugInfo JSON, DidRegisterPlugins notices,
// type declaration into the TfType graph (bases + aliases, from JSON alone —
// no class), per-type metadata (GetMetadata/GetMetadataForType), DeclaresType,
// GetPluginForType/GetPluginWithName/GetAllPlugins, idempotent re-registration,
// and (TS-native) registration-attached resource access.
//
// Fixtures are the upstream testenv plugInfo.json documents vendored VERBATIM
// as typed constants below (including the filesystem-only Root/LibraryPath/
// ResourcePath "@…@" placeholder keys — the TS model accepts and ignores them,
// which is itself asserted). Upstream registers each plugInfo per scanned
// directory; here the DSO batch and the python-module batch are each one
// RegisterPlugins call carrying the same Plugins entries, so the notice
// counts/name-set assertions of test_Registration port verbatim.
//
// Upstream setUpClass analogs, done at module scope exactly as upstream does
// them at static-init/import time:
//   * the test binary defines _TestPlugBase<1..4> and _TestPlugDerived0
//     (testPlugBase.cpp) -> TfType.Define here;
//   * `import TestPlugModuleLoaded` / `import TestPlugModuleLoadedBadBase`
//     define their python types with base _TestPlugBase<1> BEFORE registration
//     -> TfType.Define here (LoadedBadBase's plugInfo then claims base
//     _TestPlugBase<4>; upstream keeps the already-declared bases and only
//     reports a coding error — the base1-membership assertion enforces that).
//
// WEB-SUB — upstream cases NOT ported (no filesystem discovery / no dynamic
// library loading in TS — see plug faithfulness report):
//   * test_ManufacturingCppDerivedClasses — the manufacture/Load()/isLoaded
//     portions (factory instantiation of C++ classes); its DeclaresType /
//     GetPluginForType assertions ARE ported below.
//   * test_ManufacturingPythonDerivedClasses — the Load()/isLoaded/
//     isPythonModule portions (python module import); its DeclaresType /
//     GetPluginForType assertions ARE ported below.
//   * test_LoadingPluginDependencies — entirely (PluginDependencies-driven
//     transitive dlopen; the PluginDependencies dicts are still carried
//     verbatim in the fixtures below and must round-trip as inert metadata).
//   * test_ErrorCases — the path-registration cases (RegisterPlugins('/nowhere'),
//     TestPlugDsoIncomplete.framework, TestPlugModuleIncomplete) and every
//     Load()-failure case (TestPlugUnloadable dlopen failure,
//     TestPlugPythonUnloadable, TestPlugPythonDepBadBase, TestPlugPythonDepBadDep,
//     TestPlugPythonDepBadDep2, TestPlugPythonDepBadLoad, TestPlugPythonDepCycle).
//     The unknown-type lookup and re-registration-is-a-no-op assertions ARE
//     ported below.
//   * test_DebugCodeExistence — TfDebug symbols PLUG_INFO_SEARCH /
//     PLUG_REGISTRATION (no TfDebug registry; PLUG_INFO_SEARCH is the
//     filesystem scan itself).
//   * test_StlSequencesForPlugPluginPtr — boost.python STL sequence
//     conversion; no TS analog.
//   * Fixtures TestPlugDsoEmpty_plugInfo.json ("2+2") and
//     TestPlugModuleUnloadable2_plugInfo.json (truncated "{") — malformed-JSON
//     discovery cases; in TS, JSON parsing happens before the RegisterPlugins
//     API boundary. TestPlugModuleEmpty_plugInfo.json ({}) IS ported (a parsed
//     document with no Plugins registers nothing).

import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import { Registry as PlugRegistry, Info as PlugInfo, Plugin as PlugPlugin } from '../../src/index.ts'

// ---------------------------------------------------------------------------
// setUpClass analogs (upstream static-init / pre-import definitions).
// ---------------------------------------------------------------------------

// testPlugBase.cpp: the test library defines the base hierarchy and one
// derived class compiled into the base library itself. (Upstream the bases
// derive TfRefBase/TfWeakBase; that C++ substrate is irrelevant to the
// derived-type assertions and is not mirrored.)
const base1 = TfType.define('_TestPlugBase<1>')
const base2 = TfType.define('_TestPlugBase<2>')
TfType.define('_TestPlugBase<3>')
TfType.define('_TestPlugBase<4>')
TfType.define('_TestPlugDerived0', [base1])

// setUpClass: `import TestPlugModuleLoaded` / `import TestPlugModuleLoadedBadBase`
// — the python modules Tf.Type.Define their classes (base _TestPlugBase1)
// before any plugin registration.
TfType.define('TestPlugModuleLoaded.TestPlugPythonLoaded', [base1])
TfType.define('TestPlugModuleLoadedBadBase.TestPlugPythonLoadedBadBase', [base1])

// ---------------------------------------------------------------------------
// Fixtures — upstream testenv/*_plugInfo.json, verbatim.
// ---------------------------------------------------------------------------

// The DSO batch: TestPlugDso1/2/3 + TestPlugDsoUnloadable (TestPlugDsoEmpty is
// the malformed "2+2" file — never parses, never registers; see WEB-SUB).
const dsoPlugInfo: PlugInfo = {
  Plugins: [
    {
      Type: 'library',
      Name: 'TestPlugDso1',
      Root: '@TEST_PLUG_INFO_ROOT@',
      LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
      ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
      Info: {
        Types: {
          TestPlugDerived1: { bases: ['_TestPlugBase<1>'] },
        },
      },
    },
    {
      Type: 'library',
      Name: 'TestPlugDso2',
      Root: '@TEST_PLUG_INFO_ROOT@',
      LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
      ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
      Info: {
        Types: {
          TestPlugDerived2: { bases: ['_TestPlugBase<2>'] },
        },
      },
    },
    {
      Type: 'library',
      Name: 'TestPlugDso3',
      Root: '@TEST_PLUG_INFO_ROOT@',
      LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
      ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
      Info: {
        PluginDependencies: {
          '_TestPlugBase<3>': ['TestPlugModule3.TestPlugPythonDerived3_3'],
        },
        Types: {
          TestPlugDerived3_3: { bases: ['_TestPlugBase<3>'] },
          TestPlugDerived3_4: { bases: ['_TestPlugBase<4>'] },
        },
      },
    },
    {
      Type: 'library',
      Name: 'TestPlugDsoUnloadable',
      Root: '@TEST_PLUG_INFO_ROOT@',
      LibraryPath: '@TEST_PLUG_INFO_LIBRARY_PATH@',
      ResourcePath: '@TEST_PLUG_INFO_RESOURCE_PATH@',
      Info: {
        Types: {
          TestPlugUnloadable: {
            bases: ['_TestPlugBase<1>'],
            description: 'unloadable plugin',
            notLoadable: true,
            vectorString: ['f', 'l', 'o'],
            vectorInt: [1, 2, 3],
            vectorDouble: [1.1, 2.2, 3.3],
            Int: 4711,
            Double: 0.815,
          },
        },
      },
    },
  ],
}

// The python-module batch — the 12 modules that parse and register upstream
// (TestPlugModuleIncomplete has no plugInfo; TestPlugModuleUnloadable2's is
// truncated; TestPlugModuleEmpty's {} registers nothing — exercised in the
// error-cases test).
const pythonPlugInfo: PlugInfo = {
  Plugins: [
    {
      Type: 'python',
      Name: 'TestPlugModule1',
      Info: {
        _TestPlugBaseBool: true,
        Types: {
          'TestPlugModule1.TestPlugPythonDerived1': { bases: ['_TestPlugBase<1>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModule2',
      Info: {
        Types: {
          'TestPlugModule2.TestPlugPythonDerived2': { bases: ['_TestPlugBase<2>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModule3',
      Info: {
        Types: {
          'TestPlugModule3.TestPlugPythonDerived3_3': {
            bases: ['_TestPlugBase<3>'],
            // good alias
            alias: { TfRefBase: 'PluginDerived3_3' },
          },
          'TestPlugModule3.TestPlugPythonDerived3_4': {
            bases: ['_TestPlugBase<4>'],
            // bad alias (upstream: non-string alias value is warned about and
            // skipped by PlugPlugin::_DeclareAliases)
            alias: { TfRefBase: 1 } as unknown as Record<string, string>,
          },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleDepBadBase',
      Info: {
        PluginDependencies: { UnknownBase: ['UnknownBaseDerived'] },
        Types: {
          TestPlugPythonDepBadBase: { bases: ['_TestPlugBase<3>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleDepBadDep',
      Info: {
        // This plugin specified a dependency on an unknown type.
        PluginDependencies: { '_TestPlugBase<2>': ['UnknownBase3Derived'] },
        Types: {
          TestPlugPythonDepBadDep: { bases: ['_TestPlugBase<3>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleDepBadDep2',
      Info: {
        // This plugInfo specifies a dependency for a type which is not
        // registered as a plugin
        PluginDependencies: { '_TestPlugBase<3>': ['_TestPlugBase<1>'] },
        Types: {
          TestPlugPythonDepBadDep2: { bases: ['_TestPlugBase<3>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleDepBadLoad',
      Info: {
        PluginDependencies: { TessPlugBase1: ['TestPlugUnloadable'] },
        Types: {
          TestPlugPythonDepBadLoad: { bases: ['_TestPlugBase<3>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleDepCycle',
      Info: {
        PluginDependencies: { '_TestPlugBase<3>': ['TestPlugPythonDepCycle'] },
        Types: {
          TestPlugPythonDepCycle: { bases: ['_TestPlugBase<3>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleLoaded',
      Info: {
        Types: {
          'TestPlugModuleLoaded.TestPlugPythonLoaded': { bases: ['_TestPlugBase<1>'] },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleLoadedBadBase',
      Info: {
        // This plugInfo specifies the wrong base
        Types: {
          'TestPlugModuleLoadedBadBase.TestPlugPythonLoadedBadBase': {
            bases: ['_TestPlugBase<4>'],
          },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleUnloadable',
      Info: {
        Types: {
          TestPlugPythonUnloadable: {
            bases: ['_TestPlugBase<1>'],
            description: 'unloadable plugin',
          },
        },
      },
    },
    {
      Type: 'python',
      Name: 'TestPlugModuleUnicode',
      Info: {
        Types: {
          'TestPlugModuleUnicode.TestPlugPythonUnicode': { bases: ['_TestPlugBase<1>'] },
        },
      },
    },
  ],
}

// TestPlugModuleEmpty_plugInfo.json, verbatim: a well-formed document that
// declares nothing.
const emptyPlugInfo: PlugInfo = {}

const dsoBatchNames = ['TestPlugDso1', 'TestPlugDso2', 'TestPlugDso3', 'TestPlugDsoUnloadable']
const pythonBatchNames = [
  'TestPlugModule1', 'TestPlugModule2', 'TestPlugModule3',
  'TestPlugModuleDepBadBase', 'TestPlugModuleDepBadDep',
  'TestPlugModuleDepBadDep2', 'TestPlugModuleDepBadLoad',
  'TestPlugModuleDepCycle',
  'TestPlugModuleLoaded', 'TestPlugModuleLoadedBadBase',
  'TestPlugModuleUnloadable', 'TestPlugModuleUnicode',
]
const allBatchNames = [...dsoBatchNames, ...pythonBatchNames]

// ---------------------------------------------------------------------------
// Registration (setUpClass analog). MUST run inside each it.fails — a throwing
// beforeAll would poison the whole file and defeat per-case self-promotion.
// First caller registers (mirroring upstream's register-once class setup) and
// captures the notice traffic; later callers get the memoized record, exactly
// as upstream tests observe the blocked listeners.
// ---------------------------------------------------------------------------

interface NoticeRecord {
  numReceived: number
  newPlugins: PlugPlugin[]
}

interface RegistrationRecord {
  registry: PlugRegistry
  listener1: NoticeRecord // heard only the DSO batch (then Block()ed)
  listener2: NoticeRecord // heard both batches (then Block()ed)
}

let record: RegistrationRecord | undefined

function registerTestPlugins(): RegistrationRecord {
  if (record) return record
  const registry = PlugRegistry.GetInstance()

  const listener1: NoticeRecord = { numReceived: 0, newPlugins: [] }
  const listener2: NoticeRecord = { numReceived: 0, newPlugins: [] }
  const listen = (rec: NoticeRecord) => (newPlugins: PlugPlugin[]) => {
    rec.numReceived += 1
    rec.newPlugins.push(...newPlugins)
  }
  const block1 = registry.addDidRegisterPluginsListener(listen(listener1))
  const block2 = registry.addDidRegisterPluginsListener(listen(listener2))

  registry.RegisterPlugins(dsoPlugInfo)
  block1() // listener1.Block()

  registry.RegisterPlugins(pythonPlugInfo, {
    // TS-native resource attachment (substrate divergence: resources are
    // attached at registration, not found on disk) — consumed by the
    // resource-access test below.
    TestPlugModule1: { 'plugInfo.json': JSON.stringify(pythonPlugInfo.Plugins![0]) },
  })
  block2() // listener2.Block()

  record = { registry, listener1, listener2 }
  return record
}

const names = (plugins: PlugPlugin[]) => plugins.map((p) => p.getName())
const typeNames = (types: TfType[]) => types.map((t) => t.getTypeName())

// ---------------------------------------------------------------------------

describe('Plug (upstream testPlug.py, metadata slice)', () => {
  // FLIPPED GREEN at the F0 implementation:
  // these ran as it.fails scoreboard xfails until PlugRegistry/PlugPlugin
  // landed, then self-promoted (vitest fails an it.fails that passes) and
  // were flipped to gated it().

  it('test_Registration: DidRegisterPlugins notices carry the newly registered plugins', () => {
    const { listener1, listener2 } = registerTestPlugins()

    // Verify we received the appropriate notification
    expect(listener1.numReceived).toBe(1)
    expect(new Set(names(listener1.newPlugins))).toEqual(new Set(dsoBatchNames))

    // Verify we received the appropriate notification
    expect(listener2.numReceived).toBe(2)
    expect(new Set(names(listener2.newPlugins))).toEqual(new Set(allBatchNames))
  })

  it('test_Registration: available subclasses of _TestPlugBase<1> and <2>', () => {
    const { registry } = registerTestPlugins()

    // Check available subclasses of _TestPlugBase<1>
    const base1Subclasses = typeNames(TfType.findByName('_TestPlugBase<1>').getAllDerivedTypes())
    const base1SubclassesExpected = [
      '_TestPlugDerived0', 'TestPlugDerived1',
      'TestPlugModule1.TestPlugPythonDerived1',
      'TestPlugModuleLoaded.TestPlugPythonLoaded',
      'TestPlugModuleLoadedBadBase.TestPlugPythonLoadedBadBase',
      'TestPlugUnloadable', 'TestPlugPythonUnloadable',
      'TestPlugModuleUnicode.TestPlugPythonUnicode',
    ]
    for (const sc of base1SubclassesExpected) expect(base1Subclasses).toContain(sc)
    expect(base1Subclasses).toHaveLength(base1SubclassesExpected.length)

    // Check available subclasses of _TestPlugBase<2>
    const base2Subclasses = typeNames(TfType.findByName('_TestPlugBase<2>').getAllDerivedTypes())
    const base2SubclassesExpected = ['TestPlugDerived2', 'TestPlugModule2.TestPlugPythonDerived2']
    for (const sc of base2SubclassesExpected) expect(base2Subclasses).toContain(sc)
    expect(base2Subclasses).toHaveLength(base2SubclassesExpected.length)

    // PlugRegistry.GetAllDerivedTypes delegates to the same graph.
    expect(new Set(typeNames(PlugRegistry.getAllDerivedTypes(base1))))
      .toEqual(new Set(base1SubclassesExpected))
    expect(new Set(typeNames(PlugRegistry.getAllDerivedTypes(base2))))
      .toEqual(new Set(base2SubclassesExpected))

    const allPlugins = registry.getAllPlugins()
    expect(allPlugins.length).toBeGreaterThanOrEqual(8)
  })

  it('test_ManufacturingCppDerivedClasses (metadata slice): GetPluginForType + DeclaresType', () => {
    const { registry } = registerTestPlugins()

    // Get the plugin for TestPlugDerived1
    const pd1 = registry.getPluginForType(TfType.findByName('TestPlugDerived1'))
    expect(pd1).not.toBeNull()
    expect(pd1!.getName()).toBe('TestPlugDso1')

    // Get the plugin for TestPlugDerived2
    const pd2 = registry.getPluginForType(TfType.findByName('TestPlugDerived2'))
    expect(pd2).not.toBeNull()
    expect(pd2!.getName()).toBe('TestPlugDso2')

    // Check that plugin correctly reports its declared types.
    expect(pd1!.declaresType(TfType.findByName('_TestPlugBase<1>'), false)).toBe(false)
    expect(pd1!.declaresType(TfType.findByName('_TestPlugBase<1>'), true)).toBe(true)
    expect(pd1!.declaresType(TfType.findByName('TestPlugDerived1'), false)).toBe(true)
    expect(pd1!.declaresType(TfType.findByName('TestPlugDerived1'), true)).toBe(true)
  })

  it('test_ManufacturingPythonDerivedClasses (metadata slice): GetPluginForType + DeclaresType', () => {
    const { registry } = registerTestPlugins()

    const ppd1 = registry.getPluginForType(
      TfType.findByName('TestPlugModule1.TestPlugPythonDerived1'))
    expect(ppd1).not.toBeNull()
    expect(ppd1!.getName()).toBe('TestPlugModule1')

    const ppd2 = registry.getPluginForType(
      TfType.findByName('TestPlugModule2.TestPlugPythonDerived2'))
    expect(ppd2).not.toBeNull()
    expect(ppd2!.getName()).toBe('TestPlugModule2')

    // Check that plugin correctly reports its declared types.
    expect(ppd1!.declaresType(TfType.findByName('_TestPlugBase<1>'), false)).toBe(false)
    expect(ppd1!.declaresType(TfType.findByName('_TestPlugBase<1>'), true)).toBe(true)
    expect(ppd1!.declaresType(
      TfType.findByName('TestPlugModule1.TestPlugPythonDerived1'), false)).toBe(true)
    expect(ppd1!.declaresType(
      TfType.findByName('TestPlugModule1.TestPlugPythonDerived1'), true)).toBe(true)
  })

  it('test_MetadataAccess: per-type metadata dict, verbatim values', () => {
    const { registry } = registerTestPlugins()

    const base1Subclasses = typeNames(TfType.findByName('_TestPlugBase<1>').getAllDerivedTypes())
    expect(base1Subclasses).toContain('TestPlugUnloadable')

    const plugin = registry.getPluginForType(TfType.findByName('TestPlugUnloadable'))
    expect(plugin).not.toBeNull()

    const metadata = plugin!.getMetadata()
    expect(metadata).not.toBeNull()
    expect('Types' in metadata).toBe(true)
    const types = metadata['Types'] as Record<string, Record<string, unknown>>
    expect('TestPlugUnloadable' in types).toBe(true)

    const md = types['TestPlugUnloadable']!

    expect(plugin!.getMetadataForType(TfType.findByName('TestPlugUnloadable'))).toEqual(md)

    expect('bases' in md).toBe(true)
    expect(md['bases']).toEqual(['_TestPlugBase<1>'])
    expect('description' in md).toBe(true)
    expect(md['description']).toBe('unloadable plugin')
    expect('notLoadable' in md).toBe(true)
    expect(md['notLoadable']).toBe(true)
    expect('vectorInt' in md).toBe(true)
    expect(md['vectorInt']).toEqual([1, 2, 3])
    expect('vectorString' in md).toBe(true)
    expect(md['vectorString']).toEqual(['f', 'l', 'o'])
    expect('vectorDouble' in md).toBe(true)
    expect(md['vectorDouble']).toEqual([1.1, 2.2, 3.3])
    expect('Int' in md).toBe(true)
    expect(md['Int']).toBe(4711)
    expect('Double' in md).toBe(true)
    expect(md['Double']).toBeCloseTo(0.815, 6) // Gf.IsClose(md['Double'], 0.815, 1e-6)
  })

  it('test_ErrorCases (metadata slice): unknown types, empty documents, idempotent re-registration', () => {
    const { registry } = registerTestPlugins()
    const allplugins = registry.getAllPlugins()

    let numReceived = 0
    const unlisten = registry.addDidRegisterPluginsListener(() => { numReceived += 1 })

    // try to find a plugin for a Tf type which doesn't exist (upstream raises
    // from the python binding's string->TfType conversion; the C++ registry
    // answer for an unknown TfType is null)
    expect(registry.getPluginForType(TfType.findByName('Bad'))).toBeNull()
    // a declared type no plugin claims is also plugin-less
    expect(registry.getPluginForType(TfType.findByName('_TestPlugBase<1>'))).toBeNull()
    expect(numReceived).toBe(0)

    // a well-formed document that declares no plugins registers nothing
    // (TestPlugModuleEmpty_plugInfo.json)
    expect(registry.RegisterPlugins(emptyPlugInfo)).toEqual([])
    expect(numReceived).toBe(0)

    // Try registering plugins again, this should be a no-op.
    expect(registry.RegisterPlugins(dsoPlugInfo)).toEqual([])
    expect(registry.RegisterPlugins(pythonPlugInfo)).toEqual([])
    expect(new Set(names(registry.getAllPlugins()))).toEqual(new Set(names(allplugins)))
    expect(registry.getAllPlugins()).toHaveLength(allplugins.length)
    expect(numReceived).toBe(0)

    unlisten()
  })

  it('type declaration from JSON alone: bases wired into the TfType graph (PlugPlugin::_DeclareType)', () => {
    registerTestPlugins()

    // TestPlugDerived1 exists in the graph with its declared base, though no
    // TS class was ever defined for it — the codeless-schema base case.
    const derived1 = TfType.findByName('TestPlugDerived1')
    expect(derived1.isUnknown()).toBe(false)
    expect(typeNames(derived1.getBaseTypes())).toEqual(['_TestPlugBase<1>'])
    expect(derived1.isA(base1)).toBe(true)

    // _DeclareType declares unknown bases too: _TestPlugBase<3>/<4> only ever
    // appear as bases in the fixtures registered here.
    const derived33 = TfType.findByName('TestPlugDerived3_3')
    expect(derived33.isUnknown()).toBe(false)
    expect(typeNames(derived33.getBaseTypes())).toEqual(['_TestPlugBase<3>'])

    // The plugInfo-declared bases for the pre-"imported" module types were
    // already declared (upstream: re-declaring with different bases keeps the
    // existing bases and reports a coding error, per _DeclareType).
    const loadedBadBase = TfType.findByName(
      'TestPlugModuleLoadedBadBase.TestPlugPythonLoadedBadBase')
    expect(typeNames(loadedBadBase.getBaseTypes())).toEqual(['_TestPlugBase<1>'])
  })

  it('alias declaration from plugInfo: good alias registered, non-string alias skipped (PlugPlugin::_DeclareAliases)', () => {
    registerTestPlugins()

    // _DeclareAliases declares the alias-base by name if unknown
    // (TfType::Declare(aliasIt->first)) — TfRefBase only ever appears as an
    // alias key in TestPlugModule3's plugInfo.
    const refBase = TfType.findByName('TfRefBase')
    expect(refBase.isUnknown()).toBe(false)

    // good alias: {"TfRefBase": "PluginDerived3_3"}
    const d33 = TfType.findByName('TestPlugModule3.TestPlugPythonDerived3_3')
    expect(d33.isUnknown()).toBe(false)
    expect(refBase.findDerivedByName('PluginDerived3_3')).toBe(d33)
    expect(refBase.getAliases(d33)).toEqual(['PluginDerived3_3'])

    // bad alias: {"TfRefBase": 1} — non-string, warned about and skipped
    const d34 = TfType.findByName('TestPlugModule3.TestPlugPythonDerived3_4')
    expect(d34.isUnknown()).toBe(false)
    expect(refBase.getAliases(d34)).toEqual([])
  })

  it('GetPluginWithName / GetAllPlugins / path keys accepted-and-ignored', () => {
    const { registry } = registerTestPlugins()

    // Every registered plugin is retrievable by name.
    for (const name of allBatchNames) {
      const plugin = registry.GetPluginWithName(name)
      expect(plugin).not.toBeNull()
      expect(plugin!.getName()).toBe(name)
    }
    expect(registry.GetPluginWithName('NoSuchPlugin')).toBeNull()
    expect(new Set(names(registry.getAllPlugins()))).toEqual(new Set(allBatchNames))

    // 'library'/'python' plugins are not resource (codeless) plugins.
    expect(registry.GetPluginWithName('TestPlugDso1')!.isResource()).toBe(false)
    expect(registry.GetPluginWithName('TestPlugModule1')!.isResource()).toBe(false)

    // The filesystem-only keys (Root/LibraryPath/ResourcePath, "@…@"
    // placeholders verbatim from upstream's checked-in fixtures) were accepted
    // and ignored: registration succeeded, and the plugin metadata is the
    // Info dict — the path keys are not part of it (upstream: plugin.metadata
    // contains 'Types', not its siblings).
    const dso1md = registry.GetPluginWithName('TestPlugDso1')!.getMetadata()
    expect('Types' in dso1md).toBe(true)
    expect('Root' in dso1md).toBe(false)
    expect('LibraryPath' in dso1md).toBe(false)
    expect('ResourcePath' in dso1md).toBe(false)
  })

  it('resource access: HasResource / GetResource resolve registration-attached resources', async () => {
    // TS-native (substrate divergence, graded in the plug faithfulness
    // report): upstream FindPluginResource returns a path under ResourcePath;
    // here resources are attached at RegisterPlugins time and resolved to
    // their content.
    const { registry } = registerTestPlugins()

    const plugin = registry.GetPluginWithName('TestPlugModule1')
    expect(plugin).not.toBeNull()
    expect(plugin!.hasResource('plugInfo.json')).toBe(true)
    expect(plugin!.hasResource('generatedSchema.usda')).toBe(false)

    const content = await plugin!.getResource('plugInfo.json')
    expect(JSON.parse(content).Name).toBe('TestPlugModule1')
  })
})
