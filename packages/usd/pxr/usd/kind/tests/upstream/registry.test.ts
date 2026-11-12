// Ported from OpenUSD 26.11.1: pxr/usd/kind/testenv/testKindRegistry.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 behavioral port of the sole configured v26.05 execution:
// pxr/usd/kind/testenv/testKindRegistry.py (testKindRegistry).

import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Registry as KindRegistry, Tokens as KindTokens } from 'typescript-usd/kind'

PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{
    Name: 'TestKindModule',
    Type: 'resource',
    Info: {
      Kinds: {
        test_root_kind: {},
        test_model_kind: { baseKind: 'model' },
      },
    },
  }],
})

describe('testKindRegistry', () => {
  it('loads factory kinds and plugInfo contributions', () => {
    const all = KindRegistry.getAllKinds()
    for (const kind of ['group', 'model', 'test_model_kind', 'test_root_kind']) {
      expect(KindRegistry.hasKind(kind)).toBe(true)
      expect(all).toContain(kind)
    }
    expect(KindRegistry.getBaseKind('test_root_kind')).toBe('')
    expect(KindRegistry.getBaseKind('test_model_kind')).toBe('model')
  })

  it('implements the built-in hierarchy predicates', () => {
    expect(KindRegistry.isModel(KindTokens.component)).toBe(true)
    expect(KindRegistry.isModel(KindTokens.assembly)).toBe(true)
    expect(KindRegistry.isGroup(KindTokens.assembly)).toBe(true)
    expect(KindRegistry.isComponent(KindTokens.group)).toBe(false)
    expect(KindRegistry.isSubComponent(KindTokens.subcomponent)).toBe(true)
    expect(KindRegistry.isA('unknown', 'unknown')).toBe(true)
    expect(KindRegistry.isA('unknown', 'model')).toBe(false)
  })
})
