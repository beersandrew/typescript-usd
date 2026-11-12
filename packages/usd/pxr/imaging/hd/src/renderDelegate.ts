// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderDelegate.cpp,
//  pxr/imaging/hd/renderDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/renderDelegate.h

import type { HdRprim } from './rprim.ts'
import type { HdSprim } from './sprim.ts'
import type { HdBprim } from './bprim.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'
import type { HdCommandDescriptors, HdCommandArgs } from './command.ts'
import { HdAovDescriptor } from './aov.ts'
import { HdTokens } from './tokens.ts'
import { Value as VtValue } from 'typescript-usd/vt'
import type { HdRprimCollection } from './rprimCollection.ts'
import type { HdRenderPass } from './renderPass.ts'
import type { HdInstancer } from './instancer.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'

export interface HdRenderParam {}

export abstract class HdRenderDelegate {
  // Type support queries
  abstract getSupportedRprimTypes(): string[]
  abstract getSupportedSprimTypes(): string[]
  abstract getSupportedBprimTypes(): string[]

  // Rprim lifecycle
  abstract createRprim(typeId: string, rprimId: string): HdRprim
  abstract destroyRprim(rprim: HdRprim): void

  // Sprim lifecycle
  abstract createSprim(typeId: string, sprimId: string): HdSprim
  abstract destroySprim(sprim: HdSprim): void
  // renderDelegate.h:250-251 CreateFallbackSprim (pure virtual upstream; a
  // null default so render delegates without fallback sprims need not
  // implement it).
  createFallbackSprim(_typeId: string): HdSprim | null { return null }

  // renderDelegate.h:316-319 CreateInstancer / DestroyInstancer (pure
  // virtual upstream; a null default so render delegates without instancer
  // support need not implement them).
  createInstancer(_delegate: HdSceneDelegate, _id: string): HdInstancer | null { return null }
  destroyInstancer(_instancer: HdInstancer): void {}

  // Bprim lifecycle
  abstract createBprim(typeId: string, bprimId: string): HdBprim
  abstract destroyBprim(bprim: HdBprim): void

  // Called once per frame after all Sync calls, before draw
  abstract CommitResources(): void

  getRenderParam(): HdRenderParam | undefined { return undefined }
  getResourceRegistry(): unknown { return undefined }
  getDrivers(): readonly unknown[] { return [] }

  // Renderer-neutral pass/AOV queries. Backends override these when they own
  // render-pass implementations or advertise standard output descriptors.
  createRenderPass(_index: unknown, _collection: HdRprimCollection): HdRenderPass | undefined {
    return undefined
  }
  getDefaultAovDescriptor(_name: string): HdAovDescriptor {
    return new HdAovDescriptor()
  }
  getRenderStats(): Readonly<Record<string, unknown>> { return {} }

  // Command introspection / invocation.
  //
  // Returns the list of commands supported by this render delegate. The base
  // implementation returns an empty list (no commands).
  getCommandDescriptors(): HdCommandDescriptors { return [] }

  // Invokes the named command with the given arguments. Returns true on
  // success. The base implementation does nothing and returns false.
  invokeCommand(_command: string, _args?: HdCommandArgs): boolean { return false }

  /** renderDelegate.cpp:119-125: {GetMaterialNetworkSelector()}, whose base
   *  implementation returns the empty token (renderDelegate.cpp:112-117). */
  getMaterialRenderContexts(): string[] { return [''] }

  /** renderDelegate.cpp:93-97 */
  getMaterialBindingPurpose(): string { return HdTokens.preview }
  /** renderDelegate.cpp:106-110 */
  getShaderSourceTypes(): string[] { return [] }
  /** renderDelegate.cpp:127-131 */
  getRenderSettingsNamespaces(): string[] { return [] }
  /** renderDelegate.cpp:134-138 */
  isPrimvarFilteringNeeded(): boolean { return false }

  // Background rendering control (renderDelegate.h:213-277,
  // renderDelegate.cpp:235-295).
  isPauseSupported(): boolean { return false }
  pause(): boolean { return false }
  resume(): boolean { return false }
  isStopSupported(): boolean { return false }
  Stop(_blocking = true): boolean { return true }
  restart(): boolean { return false }

  /** renderDelegate.cpp:262-265 */
  requiresStormTasks(): boolean { return false }

  /** renderDelegate.h:514-518: the display name set by the renderer plugin
   *  that created the delegate (_displayName); empty for a delegate
   *  constructed directly, as the Storm unit tests do. */
  getRendererDisplayName(): string { return this._rendererDisplayName }
  /** renderDelegate.h:589-592 */
  _setRendererDisplayName(displayName: string): void { this._rendererDisplayName = displayName }
  private _rendererDisplayName = ''

  /** renderDelegate.cpp:309-312 (no-op by default; called at the start of
   *  HdRenderIndex::SyncAll, renderIndex.cpp:1707). */
  update(): void {}

  // Scene index wiring (Hydra 2.0)
  setTerminalSceneIndex(sceneIndex: HdSceneIndexBase): void {
    this._terminalSceneIndex = sceneIndex
  }

  getTerminalSceneIndex(): HdSceneIndexBase | undefined {
    return this._terminalSceneIndex
  }

  private _terminalSceneIndex: HdSceneIndexBase | undefined

  // ---------------------------------------------------------------------- //
  // Render settings (renderDelegate.h:160-193, renderDelegate.cpp:146-230)
  // ---------------------------------------------------------------------- //
  protected _settingsMap = new Map<string, unknown>()
  protected _settingsVersion = 1

  /** renderDelegate.cpp:146-150 */
  getRenderSettingDescriptors(): HdRenderSettingDescriptor[] {
    return []
  }

  /** renderDelegate.cpp:152-167. Values compare with ===, or with an
   *  `equals` method when the value has one (VtValue::operator!=). */
  setRenderSetting(key: string, value: unknown): void {
    if (!this._settingsMap.has(key)) {
      this._settingsMap.set(key, value)
      ++this._settingsVersion
    } else {
      const current = this._settingsMap.get(key) as { equals?: (o: unknown) => boolean } | undefined
      const same = typeof current?.equals === 'function' ? current.equals(value) : current === value
      if (!same) {
        this._settingsMap.set(key, value)
        ++this._settingsVersion
      }
    }
  }

  /** renderDelegate.cpp:169-178 and the templated overload
   *  (renderDelegate.h:178-181): with a default, an unset key (or a value
   *  of another type than the default's) yields the default. */
  getRenderSetting(key: string, defValue?: unknown): unknown {
    const value = this._settingsMap.get(key)
    if (defValue === undefined) {
      return value
    }
    // A value set as a VtValue (as the engine's SetRendererSetting takes
    // it, engine.cpp:2123-2146) yields its held value
    // (renderDelegate.h:177-181: GetRenderSetting(key).Cast<T>()
    // .GetWithDefault(defValue)).
    const held = value instanceof VtValue
      ? (value.IsEmpty() ? undefined : value.UncheckedGet<unknown>()) : value
    if (held === undefined || typeof held !== typeof defValue) {
      return defValue
    }
    return held
  }

  /** renderDelegate.cpp:184-188 */
  getRenderSettingsVersion(): number {
    return this._settingsVersion
  }

  /** renderDelegate.cpp:217-228 */
  protected _populateDefaultSettings(defaultSettings: readonly HdRenderSettingDescriptor[]): void {
    for (const setting of defaultSettings) {
      if (!this._settingsMap.has(setting.key)) {
        this._settingsMap.set(setting.key, setting.defaultValue)
      }
    }
  }
}

/** renderDelegate.h:94-102 */
export interface HdRenderSettingDescriptor {
  // A human readable name.
  name: string
  // The key for HdRenderDelegate::SetRenderSetting/GetRenderSetting.
  key: string
  // The default value.
  defaultValue: unknown
}

/** renderDelegate.h:88 (TfHashMap<TfToken, VtValue>) */
export type HdRenderSettingsMap = ReadonlyMap<string, unknown>
