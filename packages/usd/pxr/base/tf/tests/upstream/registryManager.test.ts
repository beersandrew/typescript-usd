// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/registryManager.cpp,
//  pxr/base/tf/registryManager.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/registryManager.cpp,
// registration TfRegistryManager (Test_TfRegistryManager), run by testTf.
//
// Adaptation: TF_REGISTRY_FUNCTION(RegRegistry) is TfRegistryManager.Add with
// the RegRegistry class as key; TfSingleton<RegRegistry> is a TfSingleton
// whose factory is RegRegistry's constructor body (SetInstanceConstructed then
// SubscribeTo, registryManager.cpp:69-72). JavaScript has no destructors, so
// the ~RegRegistry delete-flag axiom (registryManager.cpp:142-146) is not
// ported; DeleteInstance's effect on CurrentlyExists() is.
import { describe, expect, it } from 'vitest'
import { TfRegistryManager, TfSingleton } from '../../src/index.ts'

interface RegBase { Get(): number }

class RegRegistry {
  static readonly singleton: TfSingleton<RegRegistry> = new TfSingleton(() => {
    const instance = new RegRegistry()
    RegRegistry.singleton.setInstanceConstructed(instance)
    TfRegistryManager.GetInstance().subscribeTo(RegRegistry)
    return instance
  })
  static GetInstance(): RegRegistry { return this.singleton.GetInstance() }
  readonly #registered = new Map<string, RegBase>()
  Register(name: string, i: RegBase): void { this.#registered.set(name, i) }
  Get(name: string): RegBase | undefined { return this.#registered.get(name) }
}

class RegDerived1 implements RegBase { Get(): number { return 1 } }
TfRegistryManager.add(RegRegistry, () => {
  RegRegistry.GetInstance().Register('one', new RegDerived1())
})

class RegDerived2 implements RegBase { Get(): number { return 2 } }
TfRegistryManager.add(RegRegistry, () => {
  RegRegistry.GetInstance().Register('two', new RegDerived2())
})

describe('TfRegistryManager (testenv/registryManager.cpp)', () => {
  it('runs registry functions when the registry subscribes', () => {
    let x = RegRegistry.GetInstance().Get('one')
    expect(x).toBeDefined()
    expect(x!.Get()).toBe(1)

    x = RegRegistry.GetInstance().Get('two')
    expect(x).toBeDefined()
    expect(x!.Get()).toBe(2)

    x = RegRegistry.GetInstance().Get('three')
    expect(x).toBeUndefined()

    expect(RegRegistry.singleton.currentlyExists()).toBe(true)

    RegRegistry.singleton.deleteInstance()
    expect(RegRegistry.singleton.currentlyExists()).toBe(false)

    RegRegistry.GetInstance()
    expect(RegRegistry.singleton.currentlyExists()).toBe(true)
  })
})
