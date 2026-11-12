// Ported from OpenUSD 26.11.1: pxr/base/tf/registryManager.cpp,
//  pxr/base/tf/registryManager.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfRegistryManager registry from OpenUSD v26.08 pxr/base/tf/registryManager.h:35-296.
type RegistryKey = string | Function
const registrations = new Map<RegistryKey, Array<() => void>>()
const subscriptions = new Set<RegistryKey>()
export class TfRegistryManager {
  static readonly #instance = new TfRegistryManager()
  static GetInstance(): TfRegistryManager { return this.#instance }
  static add(key: RegistryKey, callback: () => void): void {
    const callbacks = registrations.get(key) ?? []
    callbacks.push(callback); registrations.set(key, callbacks)
    if (subscriptions.has(key)) callback()
  }
  subscribeTo(key: RegistryKey): void {
    if (subscriptions.has(key)) return
    subscriptions.add(key)
    for (const callback of registrations.get(key) ?? []) callback()
  }
  unsubscribeFrom(key: RegistryKey): void { subscriptions.delete(key) }
  runUnloadersAtExit(): void {}
}
export class TfSingleton<T extends object> {
  #instance: T | undefined
  constructor(private readonly factory: () => T) {}
  GetInstance(): T {
    if (this.#instance === undefined) this.#instance = this.factory()
    return this.#instance
  }
  setInstanceConstructed(instance: T): void { this.#instance = instance }
  currentlyExists(): boolean { return this.#instance !== undefined }
  deleteInstance(): void { this.#instance = undefined }
}
