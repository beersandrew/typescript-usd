// Ported from OpenUSD 26.11.1: pxr/usd/kind/registry.cpp,
//  pxr/usd/kind/registry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD pxr/usd/kind/registry.{h,cpp}.

import { Registry as PlugRegistry } from 'typescript-usd/plug'

export const Tokens = Object.freeze({
  model: 'model',
  component: 'component',
  group: 'group',
  assembly: 'assembly',
  subcomponent: 'subcomponent',
})

export class Registry {
  static #instance: Registry | undefined
  readonly #baseKinds = new Map<string, string>()

  private constructor() {
    this.#register(Tokens.subcomponent, '')
    this.#register(Tokens.model, '')
    this.#register(Tokens.component, Tokens.model)
    this.#register(Tokens.group, Tokens.model)
    this.#register(Tokens.assembly, Tokens.group)
    for (const plugin of PlugRegistry.GetInstance().getAllPlugins()) {
      const kinds = plugin.getMetadata()['Kinds']
      if (!kinds || typeof kinds !== 'object' || Array.isArray(kinds)) continue
      for (const [kind, value] of Object.entries(kinds)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const baseKind = (value as Record<string, unknown>)['baseKind']
        this.#register(kind, typeof baseKind === 'string' ? baseKind : '')
      }
    }
  }

  #register(kind: string, baseKind: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(kind) || this.#baseKinds.has(kind)) return
    this.#baseKinds.set(kind, baseKind)
  }

  static GetInstance(): Registry {
    return (this.#instance ??= new Registry())
  }

  static hasKind(kind: string): boolean {
    return this.GetInstance().#baseKinds.has(kind)
  }

  static getBaseKind(kind: string): string {
    return this.GetInstance().#baseKinds.get(kind) ?? ''
  }

  // Walks base kinds until the empty kind, as KindRegistry::IsA does; the
  // step limit (one per registered kind) keeps cyclic kind data finite
  // without allocating.
  static isA(derivedKind: string, baseKind: string): boolean {
    if (derivedKind === baseKind) return true
    const baseKinds = this.GetInstance().#baseKinds
    let current = derivedKind
    for (let steps = 0; steps <= baseKinds.size; steps++) {
      current = baseKinds.get(current) ?? ''
      if (current === baseKind) return true
      if (current === '') return false
    }
    return false
  }

  static getAllKinds(): string[] {
    return [...this.GetInstance().#baseKinds.keys()]
  }

  static isModel(kind: string): boolean { return this.isA(kind, Tokens.model) }
  static isGroup(kind: string): boolean { return this.isA(kind, Tokens.group) }
  static isAssembly(kind: string): boolean { return this.isA(kind, Tokens.assembly) }
  static isComponent(kind: string): boolean { return this.isA(kind, Tokens.component) }
  static isSubComponent(kind: string): boolean { return this.isA(kind, Tokens.subcomponent) }
}
