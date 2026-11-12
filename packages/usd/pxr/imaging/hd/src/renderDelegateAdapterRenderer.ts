// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/renderDelegateAdapterRenderer.cpp,
//  pxr/imaging/hd/renderDelegateAdapterRenderer.h,
//  pxr/imaging/hd/sceneGlobalsSchema.cpp
// Copyright 2023, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderDelegateAdapterRenderer.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - destroy() is the destructor (renderDelegateAdapterRenderer.cpp:478): it
//   releases the members in reverse declaration order
//   (renderDelegateAdapterRenderer.h:55-66) as C++ member destruction does.
// - The deprecated constructor overload taking an HdContainerDataSourceHandle
//   (renderDelegateAdapterRenderer.cpp:467-476) is folded into the
//   constructor: it accepts either the schema or its container.
// - HdSceneGlobalsSchema::GetFromSceneIndex (sceneGlobalsSchema.cpp:36-46) is
//   not in this port's sceneGlobalsSchema.ts; _GetSceneGlobalsFromSceneIndex
//   below ports it.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import type { HdAovDescriptor } from './aov.ts'
import type { HdCommandArgs, HdCommandDescriptors } from './command.ts'
import { HdContainerDataSource, HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocatorSet, type HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDriver } from './driver.ts'
import { HdEngine } from './engine.ts'
import { HdLegacyRenderControlInterface, type HdRenderSettingDescriptorList } from './legacyRenderControlInterface.ts'
import type { HdPluginRenderDelegateUniqueHandle } from './pluginRenderDelegateUniqueHandle.ts'
import { HdRenderBuffer } from './renderBuffer.ts'
import type { HdRenderDelegate } from './renderDelegate.ts'
import { HdRenderer } from './renderer.ts'
import { HdRendererCreateArgsSchema, HdRendererCreateArgsSchemaTokens } from './rendererCreateArgsSchema.ts'
import { HdRenderIndex } from './renderIndex.ts'
import { HdRenderSettingsSchema } from './renderSettingsSchema.ts'
import { HdSceneGlobalsSchema } from './sceneGlobalsSchema.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexObserver,
  RemovedPrimEntry,
  RenamedPrimEntry,
} from './sceneIndex.ts'
import { HdPrimTypeTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** renderDelegateAdapterRenderer.cpp:23-27 */
const _tokens = TfMakeTokens({
  renderDriver: 'renderDriver',
})

/** renderDelegateAdapterRenderer.cpp:31-35 */
function _IsNamespaced(name: string): boolean {
  return name.includes(':')
}

/** renderDelegateAdapterRenderer.cpp:39-59 */
function _ComputeDrivers(rendererCreateArgs: HdRendererCreateArgsSchema): HdDriver[] {
  const driverSchema = rendererCreateArgs.getDrivers()

  const drivers: HdDriver[] = []
  for (const name of driverSchema.getNames()) {
    const ds = driverSchema.Get(name)
    if (!ds) {
      continue
    }
    drivers.push({ name, driver: ds.GetValue(0.0) })
    // For concreteness, we now use Hgi rather than renderDriver as key.
    if (name === HdRendererCreateArgsSchemaTokens.hgi) {
      drivers.push({ name: _tokens.renderDriver, driver: ds.GetValue(0.0) })
    }
  }

  return drivers
}

/** sceneGlobalsSchema.h:107-110 GetDefaultPrimPath:
 *  SdfPath::AbsoluteRootPath(). */
const _sceneGlobalsDefaultPrimPath = '/'

/** sceneGlobalsSchema.cpp:36-46 HdSceneGlobalsSchema::GetFromSceneIndex */
function _GetSceneGlobalsFromSceneIndex(si: HdSceneIndexBase | undefined): HdSceneGlobalsSchema {
  if (!si) {
    TF_CODING_ERROR('Invalid input scene index provided.')
    return new HdSceneGlobalsSchema(undefined)
  }

  return HdSceneGlobalsSchema.getFromParent(si.getPrim(_sceneGlobalsDefaultPrimPath).dataSource)
}

/** SdfPath::HasPrefix for absolute prim paths. */
function _HasPrefix(path: string, prefix: string): boolean {
  return prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * renderDelegateAdapterRenderer.cpp:61-206.
 *
 * HdDriverVector is a std::vector<HdDriver*> (and the argument to
 * HdRenderDelegate::SetDrivers) - even though HdDriver is not intended
 * as an (abstract) base class but a struct of a TfToken and VtValue
 * and it is the VtValue that can hold a pointer to an abstract base
 * class such as Hgi.
 */
class _LegacyRenderControl extends HdLegacyRenderControlInterface {
  constructor(
    private readonly _renderDelegate: HdRenderDelegate,
    private readonly _renderIndex: HdRenderIndex,
    private readonly _engine: HdEngine,
  ) {
    super()
  }

  Execute(taskPaths: readonly string[]): void {
    this._engine.Execute(this._renderIndex, [...taskPaths])
  }

  areTasksConverged(taskPaths: readonly string[]): boolean {
    return this._engine.areTasksConverged(this._renderIndex, [...taskPaths])
  }

  // HdEngine::GetTaskContextData returns whether the context holds `name`;
  // this port's HdEngine returns the value (undefined if absent).
  getTaskContextData(name: TfToken | string, data: { value?: unknown }): boolean {
    const value = this._engine.getTaskContextData(name)
    if (value === undefined) {
      return false
    }
    data.value = value
    return true
  }

  setTaskContextData(name: TfToken | string, data: unknown): void {
    return this._engine.setTaskContextData(name, data)
  }

  removeTaskContextData(name: TfToken | string): void {
    this._engine.removeTaskContextData(name)
  }

  clearTaskContextData(): void {
    this._engine.clearTaskContextData()
  }

  getDefaultAovDescriptor(name: TfToken | string): HdAovDescriptor {
    return this._renderDelegate.getDefaultAovDescriptor(name)
  }

  getRenderBuffer(path: string): HdRenderBuffer | null {
    const bprim = this._renderIndex.getBprim(HdPrimTypeTokens.renderBuffer, path)
    return bprim instanceof HdRenderBuffer ? bprim : null
  }

  getRenderSettingDescriptors(): HdRenderSettingDescriptorList {
    return this._renderDelegate.getRenderSettingDescriptors()
  }

  getRenderSetting(name: TfToken | string): unknown {
    return this._renderDelegate.getRenderSetting(name)
  }

  setRenderSetting(name: TfToken | string, value: unknown): void {
    this._renderDelegate.setRenderSetting(name, value)
  }

  getCommandDescriptors(): HdCommandDescriptors {
    return this._renderDelegate.getCommandDescriptors()
  }

  invokeCommand(name: TfToken | string, args: HdCommandArgs = {}): boolean {
    return this._renderDelegate.invokeCommand(name, args)
  }

  isPauseSupported(): boolean {
    return this._renderDelegate.isPauseSupported()
  }

  pause(): boolean {
    return this._renderDelegate.pause()
  }

  resume(): boolean {
    return this._renderDelegate.resume()
  }

  isStopSupported(): boolean {
    return this._renderDelegate.isStopSupported()
  }

  Stop(blocking = true): boolean {
    return this._renderDelegate.Stop(blocking)
  }

  restart(): boolean {
    return this._renderDelegate.restart()
  }

  getMaterialBindingPurpose(): TfToken {
    return this._renderDelegate.getMaterialBindingPurpose() as TfToken
  }

  getMaterialRenderContexts(): TfToken[] {
    return this._renderDelegate.getMaterialRenderContexts() as TfToken[]
  }

  getRenderSettingsNamespaces(): TfToken[] {
    return this._renderDelegate.getRenderSettingsNamespaces() as TfToken[]
  }

  isPrimvarFilteringNeeded(): boolean {
    return this._renderDelegate.isPrimvarFilteringNeeded()
  }

  getShaderSourceTypes(): TfToken[] {
    return this._renderDelegate.getShaderSourceTypes() as TfToken[]
  }

  isCoordSysSupported(): boolean {
    return this._renderIndex.isSprimTypeSupported(
      HdPrimTypeTokens.coordSys)
  }

  requiresStormTasks(): boolean {
    return this._renderDelegate.requiresStormTasks()
  }

  getRenderStats(): Readonly<Record<string, unknown>> {
    return this._renderDelegate.getRenderStats()
  }

  getRprimPathFromPrimId(primIdx: number): string {
    return this._renderIndex.getRprimPathFromPrimId(primIdx)
  }
}

/**
 * renderDelegateAdapterRenderer.cpp:208-429.
 *
 * Observes the terminal scene index for render settings and translates them
 * into HdRenderDelegate::SetRenderSetting calls.
 *
 * More precisely, it uses the render settings from the active rendersettings
 * prim pointed to by the scene globals.
 *
 * Note that only render settings advertised by
 * HdRenderDelegate::GetRenderSettingDescriptors are observed.
 */
class _RenderSettingsObserver implements HdSceneIndexObserver {
  constructor(
    private readonly _sceneIndex: HdSceneIndexBase | undefined,
    private readonly _renderDelegate: HdRenderDelegate,
  ) {
    this._activeRenderSettingsPath = this._computeActiveRenderSettingsPath()

    this._setRenderSettings(HdDataSourceLocatorSet.UniversalSet)

    if (this._sceneIndex) {
      this._sceneIndex.addObserver(this)
    }
  }

  /** renderDelegateAdapterRenderer.cpp:236-241 (destructor) */
  destroy(): void {
    if (this._sceneIndex) {
      this._sceneIndex.removeObserver(this)
    }
  }

  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    let reapply = false

    for (const entry of entries) {
      // The scene globals (root) prim may (re-)appear, changing which
      // prim is the active render settings prim; recompute the path.
      if (entry.primPath === _sceneGlobalsDefaultPrimPath) {
        this._activeRenderSettingsPath =
          this._computeActiveRenderSettingsPath()
        reapply = true
        break
      }
      // The active render settings prim itself (re-)appeared.
      if (entry.primPath === this._activeRenderSettingsPath) {
        reapply = true
      }
    }
    if (!reapply) {
      return
    }
    this._setRenderSettings(HdDataSourceLocatorSet.UniversalSet)
  }

  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // Does not handle the case where scene globals prim gets removed.
    // But that should never happen.

    if (this._activeRenderSettingsPath === '') {
      return
    }

    for (const entry of entries) {
      if (_HasPrefix(this._activeRenderSettingsPath, entry.primPath)) {
        this._setRenderSettings(HdDataSourceLocatorSet.UniversalSet)
        return
      }
    }
  }

  primsRenamed(_sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    // Does not handle the case where scene globals get removed.
    // But that should never happen.

    if (this._activeRenderSettingsPath === '') {
      return
    }

    for (const entry of entries) {
      if (_HasPrefix(this._activeRenderSettingsPath, entry.oldPrimPath)) {
        this._setRenderSettings(HdDataSourceLocatorSet.UniversalSet)
        return
      }
    }
  }

  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // (a) The active render settings prim path may have changed; if so,
    //     re-push the entire set.
    for (const entry of entries) {
      if (entry.primPath === _sceneGlobalsDefaultPrimPath &&
          entry.dirtyLocators.intersects(
            HdSceneGlobalsSchema.getActiveRenderSettingsPrimLocator())) {
        const newPath = this._computeActiveRenderSettingsPath()
        if (newPath !== this._activeRenderSettingsPath) {
          this._activeRenderSettingsPath = newPath
          this._setRenderSettings(HdDataSourceLocatorSet.UniversalSet)
          return
        }
      }
      if (entry.primPath === this._activeRenderSettingsPath) {
        this._setRenderSettings(entry.dirtyLocators)
      }
    }
  }

  // The path of the scene's active render settings prim (from scene globals),
  // or an empty path if there is none.
  private _computeActiveRenderSettingsPath(): string {
    if (!this._sceneIndex) {
      return ''
    }
    const ds = _GetSceneGlobalsFromSceneIndex(this._sceneIndex)
      .getActiveRenderSettingsPrim()
    if (!ds) {
      return ''
    }
    return ds.getTypedValue(0.0)
  }

  // The 'renderSettings' container of the active render settings prim, or
  // null.
  private _getActiveRenderSettingsSchema(): HdRenderSettingsSchema {
    if (!this._sceneIndex || this._activeRenderSettingsPath === '') {
      return new HdRenderSettingsSchema(undefined)
    }
    const prim = this._sceneIndex.getPrim(this._activeRenderSettingsPath)
    return HdRenderSettingsSchema.getFromParent(prim.dataSource)
  }

  private static _getRenderSettingLocator(name: string): HdDataSourceLocator {
    if (_IsNamespaced(name)) {
      return HdRenderSettingsSchema.getNamespacedSettingsLocator()
        .append(name)
    } else {
      return HdRenderSettingsSchema.getDefaultLocator()
        .append(name)
    }
  }

  private static _getRenderSettingDataSource(
    name: string,
    renderSettings: HdRenderSettingsSchema,
  ): HdSampledDataSource | undefined {
    if (_IsNamespaced(name)) {
      return renderSettings.getNamespacedSettings().Get(name)
    } else {
      const container = renderSettings.getContainer()
      if (!container) {
        return undefined
      }
      const ds = container.Get(name)
      return ds instanceof HdSampledDataSource ? ds : undefined
    }
  }

  // Pushes render settings that are known to the render delegate
  // and that correspond to data source locators in the given
  // locators.
  private _setRenderSettings(locators: HdDataSourceLocatorSet): void {
    if (!locators.intersects(
      HdRenderSettingsSchema.getDefaultLocator())) {
      return
    }

    const renderSettings = this._getActiveRenderSettingsSchema()

    // Only push render settings to the render delegate via the legacy
    // HdRenderDelegate::SetRenderSetting API if the active render settings
    // prim opts in via useForLegacyRenderDelegateSettings.
    const useForLegacyDs = renderSettings.getUseForLegacyRenderDelegateSettings()
    if (!(useForLegacyDs && useForLegacyDs.getTypedValue(0.0))) {
      return
    }

    for (const descriptor of this._renderDelegate.getRenderSettingDescriptors()) {
      if (!locators.intersects(
        _RenderSettingsObserver._getRenderSettingLocator(descriptor.key))) {
        continue
      }
      const ds = _RenderSettingsObserver._getRenderSettingDataSource(
        descriptor.key, renderSettings)
      this._renderDelegate.setRenderSetting(
        descriptor.key,
        ds ? ds.GetValue(0.0) : descriptor.defaultValue)
    }
  }

  private _activeRenderSettingsPath: string
}

/**
 * renderDelegateAdapterRenderer.h:23-67. A Hydra renderer that populates a
 * Hydra 1.0 render delegate from a (typically terminal) scene index using
 * "back-end" emulation.
 */
export class HdRenderDelegateAdapterRenderer extends HdRenderer {
  /** renderDelegateAdapterRenderer.cpp:443-476 */
  constructor(
    renderDelegate: HdPluginRenderDelegateUniqueHandle,
    terminalSceneIndex: HdSceneIndexBase,
    rendererCreateArgs: HdRendererCreateArgsSchema | HdContainerDataSource | undefined,
  ) {
    super()
    const createArgs = rendererCreateArgs instanceof HdRendererCreateArgsSchema
      ? rendererCreateArgs
      : new HdRendererCreateArgsSchema(
        rendererCreateArgs instanceof HdContainerDataSource ? rendererCreateArgs : undefined)
    this._drivers = _ComputeDrivers(createArgs)
    this._renderDelegate = renderDelegate
    this._renderIndex =
      HdRenderIndex.newForBackendEmulation(
        this._renderDelegate.Get()!,
        this._drivers,
        terminalSceneIndex)
    this._engine = new HdEngine()
    this._legacyRenderControl =
      new _LegacyRenderControl(
        this._renderDelegate.Get()!,
        this._renderIndex!,
        this._engine)
    this._renderSettingsObserver =
      new _RenderSettingsObserver(
        terminalSceneIndex,
        this._renderDelegate.Get()!)
  }

  /** renderDelegateAdapterRenderer.cpp:480-484 */
  override getLegacyRenderControl(): HdLegacyRenderControlInterface | null {
    return this._legacyRenderControl
  }

  /** Not upstream: the emulating render index, for tools and tests that
   *  inspect it or await Storm's asynchronous texture loads
   *  (hdSt/src/textureObjectRegistry.ts). */
  _getRenderIndex(): HdRenderIndex | null {
    return this._renderIndex
  }

  /** renderDelegateAdapterRenderer.cpp:478 (see the header note). */
  override destroy(): void {
    this._renderSettingsObserver.destroy()
    this._renderIndex?.destroy()
    this._renderDelegate.Reset()
  }

  // Keep HdDriver's alive while HdRenderIndex/HdRenderDelegate has raw
  // pointers to HdDriver.
  private readonly _drivers: HdDriver[]
  private readonly _renderDelegate: HdPluginRenderDelegateUniqueHandle
  private readonly _renderIndex: HdRenderIndex | null
  private readonly _engine: HdEngine
  private readonly _legacyRenderControl: _LegacyRenderControl
  // Observes the terminal scene index and pushes the active render settings
  // prim's opinions to the render delegate via SetRenderSetting.
  private readonly _renderSettingsObserver: _RenderSettingsObserver
}
