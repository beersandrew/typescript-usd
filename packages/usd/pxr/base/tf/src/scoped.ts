// Ported from OpenUSD 26.11.1: pxr/base/tf/scoped.cpp, pxr/base/tf/scoped.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Explicit-lifetime adaptation of OpenUSD v26.08 pxr/base/tf/scoped.h:30-157.
export class TfScoped {
  #callback: (() => void) | undefined
  constructor(callback: () => void) { this.#callback = callback }
  dispose(): void { const callback = this.#callback; this.#callback = undefined; callback?.() }
}
export class TfScopedVar<T> extends TfScoped {
  constructor(target: { value: T }, value: T) {
    const previous = target.value
    target.value = value
    super(() => { target.value = previous })
  }
}
export class TfScopedAutoVar<T> extends TfScopedVar<T> {}
