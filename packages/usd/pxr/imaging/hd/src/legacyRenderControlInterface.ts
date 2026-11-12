// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/legacyRenderControlInterface.cpp,
//  pxr/imaging/hd/legacyRenderControlInterface.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyRenderControlInterface.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath / SdfPathVector are path strings, TfToken is a string, and
//   VtDictionary is a plain record, as elsewhere in this port's hd.
// - GetTaskContextData(name, VtValue *data) takes an out object
//   `{ value?: unknown }` in place of the VtValue pointer (the convention of
//   SdfPath.isValidPathString's errMsg in this repository).

import type { Token as TfToken } from 'typescript-usd/tf'
import type { HdAovDescriptor } from './aov.ts'
import type { HdCommandArgs, HdCommandDescriptors } from './command.ts'
import type { HdRenderBuffer } from './renderBuffer.ts'
import type { HdRenderDelegateInfo } from './renderDelegateInfo.ts'
import type { HdRenderSettingDescriptor } from './renderDelegate.ts'

/** legacyRenderControlInterface.h:22-23 */
export type HdRenderSettingDescriptorList = HdRenderSettingDescriptor[]

/**
 * legacyRenderControlInterface.h:27-147. Transitory Hydra-1.0-like API for
 * HdRenderer.
 */
export abstract class HdLegacyRenderControlInterface {
  // ---- Task control (legacyRenderControlInterface.h:37-58) ----

  abstract Execute(taskPaths: readonly string[]): void

  abstract areTasksConverged(taskPaths: readonly string[]): boolean

  abstract getTaskContextData(name: TfToken | string, data: { value?: unknown }): boolean

  abstract setTaskContextData(name: TfToken | string, data: unknown): void

  abstract removeTaskContextData(name: TfToken | string): void

  abstract clearTaskContextData(): void

  // ---- AOVs (legacyRenderControlInterface.h:59-69) ----

  abstract getDefaultAovDescriptor(name: TfToken | string): HdAovDescriptor

  abstract getRenderBuffer(path: string): HdRenderBuffer | null

  // ---- Render settings (legacyRenderControlInterface.h:70-86) ----
  //
  // Deprecated: In hydra 2.0, render settings are communicated in-band
  // through the active render settings prim in the scene index feeding the
  // renderer.

  abstract getRenderSettingDescriptors(): HdRenderSettingDescriptorList
  abstract getRenderSetting(name: TfToken | string): unknown
  abstract setRenderSetting(name: TfToken | string, value: unknown): void

  // ---- Commands (legacyRenderControlInterface.h:87-103) ----

  abstract getCommandDescriptors(): HdCommandDescriptors

  /**
   * Invokes the command described by the token `name` with optional `args`.
   *
   * If the command succeeds, returns true, otherwise returns false.
   * A command will generally fail if it is not among those returned by
   * GetCommandDescriptors().
   */
  abstract invokeCommand(name: TfToken | string, args?: HdCommandArgs): boolean

  // ---- Background rendering control (legacyRenderControlInterface.h:105-115) ----

  abstract isPauseSupported(): boolean
  abstract pause(): boolean
  abstract resume(): boolean
  abstract isStopSupported(): boolean
  abstract Stop(blocking?: boolean): boolean
  abstract restart(): boolean

  // ---- Resolution information (legacyRenderControlInterface.h:117-131) ----

  abstract getMaterialBindingPurpose(): TfToken
  abstract getMaterialRenderContexts(): TfToken[]
  abstract getRenderSettingsNamespaces(): TfToken[]
  abstract isPrimvarFilteringNeeded(): boolean
  abstract getShaderSourceTypes(): TfToken[]
  /** This is for UsdImagingDelegate::_coordSysEnabled that has a
   *  surprising performance impact. */
  abstract isCoordSysSupported(): boolean

  /** legacyRenderControlInterface.cpp:14-27 */
  getRenderDelegateInfo(): HdRenderDelegateInfo {
    return {
      materialBindingPurpose: this.getMaterialBindingPurpose(),
      materialRenderContexts: this.getMaterialRenderContexts(),
      renderSettingsNamespaces: this.getRenderSettingsNamespaces(),
      isPrimvarFilteringNeeded: this.isPrimvarFilteringNeeded(),
      shaderSourceTypes: this.getShaderSourceTypes(),
      isCoordSysSupported: this.isCoordSysSupported(),
    }
  }

  // ---- Misc (legacyRenderControlInterface.h:133-146) ----

  /** Provides value for HdxTaskControllerSceneIndex::Parameters::isForStorm
   *  to configure task controller scene inedx. */
  abstract requiresStormTasks(): boolean

  abstract getRenderStats(): Readonly<Record<string, unknown>>

  /** Clients should use HdSceneGlobalsSchema's primIdToPath instead. */
  abstract getRprimPathFromPrimId(primIdx: number): string
}
