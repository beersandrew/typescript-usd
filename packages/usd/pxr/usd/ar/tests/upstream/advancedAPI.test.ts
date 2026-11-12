// Ported from OpenUSD 26.11.1:
//  pxr/usd/ar/testenv/TestArAdvancedAPI_plugin.cpp,
//  pxr/usd/ar/testenv/testArAdvancedAPI.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/ar/testenv/testArAdvancedAPI.py and
// TestArAdvancedAPI_plugin.cpp / TestArAdvancedAPI_plugInfo.json
// (registration testArAdvancedAPI): ArGetAvailableResolvers and
// ArCreateResolver as seen from resolver constructors.
//
// The test plugin is part of this test: its plugInfo.json is registered
// with PlugRegistry.RegisterPlugins (no LibraryPath to load) and its
// AR_DEFINE_RESOLVER calls are ArDefineResolver calls.
import { describe, expect, it } from 'vitest'
import {
  CreateResolver as ArCreateResolver,
  DefaultResolver as ArDefaultResolver,
  DefineResolver as ArDefineResolver,
  GetAvailableResolvers as ArGetAvailableResolvers,
  GetResolver as ArGetResolver,
  SetPreferredResolver as ArSetPreferredResolver,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'

const printed: string[] = []
const axioms: [string, boolean][] = []
const axiom = (label: string, cond: boolean) => axioms.push([label, cond])
const find = (typeName: string) => TfType.findByName(typeName)

// TestArAdvancedAPI_plugin.cpp:27-46.
class _TestResolver1 extends ArDefaultResolver {
  constructor() {
    super()
    printed.push('Constructing _TestResolver1')
    // _TestResolver1 is only ever constructed via _TestResolver2's
    // constructor. When it is being constructed, neither it nor
    // _TestResolver2 should appear in the result of ArGetAvailableResolvers().
    const resolvers = ArGetAvailableResolvers()
    axiom('1: !_TestResolver1', !resolvers.includes(find('_TestResolver1')))
    axiom('1: !_TestResolver2', !resolvers.includes(find('_TestResolver2')))
    // ArDefaultResolver should always be the last element in the available
    // resolvers list.
    axiom('1: default last', resolvers.at(-1) === find('ArDefaultResolver'))
  }
}

// TestArAdvancedAPI_plugin.cpp:48-68.
class _TestResolver2 extends ArDefaultResolver {
  constructor() {
    super()
    printed.push('Constructing _TestResolver2')
    const resolvers = ArGetAvailableResolvers()
    axiom('2: _TestResolver1', resolvers.includes(find('_TestResolver1')))
    axiom('2: !_TestResolver2', !resolvers.includes(find('_TestResolver2')))
    axiom('2: default last', resolvers.at(-1) === find('ArDefaultResolver'))
    const subresolver = ArCreateResolver(find('_TestResolver1'))
    axiom('2: subresolver is _TestResolver1', subresolver instanceof _TestResolver1)
  }
}

// TestArAdvancedAPI_plugin.cpp:70-71.
ArDefineResolver('_TestResolver1', _TestResolver1, ['ArDefaultResolver'])
ArDefineResolver('_TestResolver2', _TestResolver2, ['ArDefaultResolver'])

describe('testArAdvancedAPI', () => {
  // testArAdvancedAPI.py:19-41.
  it('test_GetAvailableResolvers', () => {
    _resetResolverForTest()
    // Register test resolver plugin and verify we have the expected
    // ArResolver subclasses.
    const pr = PlugRegistry.GetInstance()
    const plugins = pr.RegisterPlugins({ Plugins: [{
      Type: 'library',
      Name: 'TestArAdvancedAPI',
      Info: {
        Types: {
          _TestResolver1: { bases: ['ArDefaultResolver'] },
          _TestResolver2: { bases: ['ArDefaultResolver'] },
        },
      },
    }] })
    expect(plugins.length).toBe(1)

    const resolverTypes = PlugRegistry.getAllDerivedTypes(find('ArResolver'))
    expect(resolverTypes).toContain(find('_TestResolver1'))
    expect(resolverTypes).toContain(find('_TestResolver2'))

    // Set _TestResolver2 to be the preferred resolver; otherwise,
    // _TestResolver1 would be initially constructed by the call to
    // Ar.GetResolver() below since its typename comes before _TestResolver2.
    ArSetPreferredResolver('_TestResolver2')

    // Invoke Ar.GetResolver(). This will cause _TestResolver1 and
    // _TestResolver2 to be created. These classes test
    // ArGetAvailableResolvers and ArCreateResolver internally.
    ArGetResolver()

    expect(printed).toEqual(['Constructing _TestResolver2', 'Constructing _TestResolver1'])
    expect(axioms.filter(([, ok]) => !ok).map(([label]) => label)).toEqual([])
    expect(axioms.length).toBe(7)
  })
})
