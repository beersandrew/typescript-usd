// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImagingGL/engine.cpp,
//  pxr/usdImaging/usdImagingGL/engine.h,
//  pxr/imaging/hd/renderDelegateAdapterRenderer.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImagingGL/engine.{h,cpp} (OpenUSD 26.11.1).
//
// The scene index path (USDIMAGINGGL_ENGINE_ENABLE_SCENE_INDEX, default true,
// engine.cpp:81) is the one ported: the engine builds a merging scene index,
// appends the renderer's scene index plugins (with the application scene
// indices of _AppSceneIndices at their front), and creates the renderer from
// that terminal scene index with HdRendererPlugin::CreateRenderer, which for
// Storm wraps an HdStRenderDelegate behind HdRenderIndex::NewForBackendEmulation
// (hd/renderDelegateAdapterRenderer.cpp). The UsdImaging scene indices
// (UsdImagingSceneIndex with the engine's overrides callback, the legacy
// display style override and, for a non-root delegate id, a prefixing scene
// index) and the task controller scene index are inputs of the merging scene
// index (engine.cpp:1571-1666).
//
// Divergences:
// - The legacy UsdImagingDelegate path (USDIMAGINGGL_ENGINE_ENABLE_SCENE_INDEX
//   set to false) is not ported: UseUsdImagingSceneIndex() is always true and
//   the _sceneDelegate branches are left out.
// - Hgi creation is asynchronous for WebGPU (HgiWebGPU.Create()), so
//   Hgi::CreatePlatformDefaultHgi (engine.cpp:2456-2465) cannot run inside the
//   constructor: a GPU-enabled engine must be given its Hgi through
//   Parameters.driver ({ name: HgiTokens.renderDriver, driver: hgi }).
// - The terminal caching scene index
//   (USDIMAGINGGL_ENGINE_ENABLE_CACHING_SCENE_INDEX) and the application
//   render settings scene index
//   (USDIMAGINGGL_ENGINE_ENABLE_RENDER_SETTINGS_SCENE_INDEX) are off by
//   default upstream and are not ported; the env settings are read at their
//   defaults. The exec scene index (USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX,
//   default false) is ported: as upstream, the engine does not import
//   usdExecImaging and manufactures UsdExecImaging_StageSceneIndex through the
//   plugin type factory, so an application that sets the env setting imports
//   typescript-usd/usdExecImaging (which registers the type and its factory).
// - The Python GIL release (TF_PY_ALLOW_THREADS_IN_SCOPE) has no counterpart.
// - SdfPath values are path strings.
// - destroy() is the destructor; it also detaches the UsdImaging scene index
//   from the stage (see _DestroyHydraObjects).

import {
  AovTokens as HdAovTokens, CullStyle as HdCullStyle, CullStyleTokens as HdCullStyleTokens, CompareFunction as HdCompareFunction,
  InstancedBySchema as HdInstancedBySchema, LightPrimTypeTokens as HdLightPrimTypeTokens, MergingSceneIndex as HdMergingSceneIndex,
  PrefixingSceneIndex as HdPrefixingSceneIndex, RenderSettingsTokens as HdRenderSettingsTokens, RenderTagTokens as HdRenderTagTokens,
  ReprSelector as HdReprSelector, ReprTokens as HdReprTokens, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, RprimCollection as HdRprimCollection,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry, Tokens as HdTokens, OverlayContainerDataSource as HdOverlayContainerDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  RendererCreateArgsSchema as HdRendererCreateArgsSchema, RendererCreateArgsSchemaTokens as HdRendererCreateArgsSchemaTokens,
  RendererPluginRegistry as HdRendererPluginRegistry, SceneIndexCreateArgsSchema as HdSceneIndexCreateArgsSchema,
  AovDescriptor as HdAovDescriptor, type ContainerDataSource as HdContainerDataSource, type Driver as HdDriver,
  type LegacyRenderControlInterface as HdLegacyRenderControlInterface, NoticeBatchingSceneIndex as HdNoticeBatchingSceneIndex,
  type PluginRendererUniqueHandle as HdPluginRendererUniqueHandle, type RenderBuffer as HdRenderBuffer,
  type RendererPlugin as HdRendererPlugin, type RendererPluginHandle as HdRendererPluginHandle, type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import {
  DomeLightCameraVisibilitySceneIndex as HdsiDomeLightCameraVisibilitySceneIndex,
  LegacyDisplayStyleOverrideSceneIndex as HdsiLegacyDisplayStyleOverrideSceneIndex,
  PrefixPathPruningSceneIndex as HdsiPrefixPathPruningSceneIndex,
  PrefixPathPruningSceneIndexTokens as HdsiPrefixPathPruningSceneIndexTokens,
  PrimTypeAndPathPruningSceneIndex as HdsiPrimTypeAndPathPruningSceneIndex,
  PrimTypeAndPathPruningSceneIndexTokens as HdsiPrimTypeAndPathPruningSceneIndexTokens,
  SceneGlobalsSceneIndex as HdsiSceneGlobalsSceneIndex,
  SceneMaterialPruningSceneIndex as HdsiSceneMaterialPruningSceneIndex,
  type PrimTypeAndPathPruningSceneIndexPathPredicate as HdsiPrimTypeAndPathPruningSceneIndexPathPredicate,
} from 'typescript-usd/hdsi'
import {
  UsdImagingSceneIndex, UsdImagingSceneIndexCreateArgsSchema, UsdImagingRootOverridesSceneIndex,
  UsdImagingLegacyRenderSettingsSceneIndex, UsdImagingStageSceneIndexInterfaceType,
  type UsdImagingStageSceneIndexInterface, type UsdImagingStageSceneIndexInterfaceFactoryBase,
} from 'typescript-usd/usdImaging'
import {
  PrimOriginInfo as HdxPrimOriginInfo,
  TaskControllerSceneIndex as HdxTaskControllerSceneIndex,
  ColorCorrectionTaskParams as HdxColorCorrectionTaskParams,
  BoundingBoxTaskParams as HdxBoundingBoxTaskParams,
  RenderTaskParams as HdxRenderTaskParams,
  PickHit as HdxPickHit,
  PickTaskContextParams as HdxPickTaskContextParams,
  PickTokens as HdxPickTokens,
  SelectionTracker as HdxSelectionTracker,
  Tokens as HdxTokens,
} from 'typescript-usd/hdx'
import { TfEnvSetting, TfGetEnvSetting, Token as TfToken } from 'typescript-usd/tf'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { SimpleLightingContext as GlfSimpleLightingContext, type SimpleLight as GlfSimpleLight, type SimpleMaterial as GlfSimpleMaterial } from 'typescript-usd/glf'
import { Vec4f as GfVec4f, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, type Vec2i as GfVec2i, type Vec4d as GfVec4d, type BBox3d as GfBBox3d } from 'typescript-usd/gf'
import type { Framing as CameraUtilFraming, ConformWindowPolicy as CameraUtilConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { TimeCode as UsdTimeCode, type Prim as UsdPrim } from 'typescript-usd/usd'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingGLCullStyle, UsdImagingGLDrawMode, UsdImagingGLRenderParams } from './renderParams.ts'
import { UsdImagingGLRendererSettingType, type UsdImagingGLRendererSetting, type UsdImagingGLRendererSettingsList } from './rendererSettings.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** engine.cpp:99-104 */
export const USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX = new TfEnvSetting(
  'USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX', false,
  'Inserts an initial scene index which provides values computed by exec. ' +
  'The exec scene index is added by a merging scene index in the overrides ' +
  'scene index callback. Values provided by the exec scene index override ' +
  'values in the input scene. To use this feature, usdImaging must be ' +
  'built with PXR_BUILD_EXEC=ON.')

/** engine.cpp:78-79 USDIMAGINGGL_ENGINE_DEBUG_SCENE_DELEGATE_ID, default "/" */
const USDIMAGINGGL_ENGINE_DEBUG_SCENE_DELEGATE_ID = '/'

/** engine.cpp:242-249 */
function _GetUsdImagingDelegateId(): string {
  return USDIMAGINGGL_ENGINE_DEBUG_SCENE_DELEGATE_ID
}

/** hd/utils.h HdUtils::RenderInstanceTracker: maps render instance ids to
 *  weakly held instances. */
class _RenderInstanceTracker<T extends object> {
  private readonly _map = new Map<string, WeakRef<T>>()
  registerInstance(id: string, instance: T): void { this._map.set(id, new WeakRef(instance)) }
  unregisterInstance(id: string): void { this._map.delete(id) }
  GetInstance(id: string): T | undefined { return this._map.get(id)?.deref() }
}

/** engine.cpp:107-225 UsdImagingGLEngine_Impl::_AppSceneIndices: holds the
 *  application scene indices created via the scene index plugin registration
 *  callback facility. */
class _AppSceneIndices {
  sceneGlobalsSceneIndex: HdsiSceneGlobalsSceneIndex | null = null
  domeLightCameraVisibilitySceneIndex: HdsiDomeLightCameraVisibilitySceneIndex | null = null
  sceneMaterialPruningSceneIndex: HdsiSceneMaterialPruningSceneIndex | null = null

  private static _registered = false
  private static readonly _tracker = new _RenderInstanceTracker<_AppSceneIndices>()

  /** engine.cpp:128-139 */
  static new(renderInstanceId: string): _AppSceneIndices {
    // Register application managed scene indices via the callback
    // facility which will be invoked during render index construction.
    if (!_AppSceneIndices._registered) {
      _AppSceneIndices._registered = true
      _AppSceneIndices._register()
    }
    const result = new _AppSceneIndices(renderInstanceId)
    _AppSceneIndices._tracker.registerInstance(renderInstanceId, result)
    return result
  }

  private constructor(private readonly _renderInstanceId: string) {}

  /** engine.cpp:144-147 (the destructor) */
  destroy(): void {
    _AppSceneIndices._tracker.unregisterInstance(this._renderInstanceId)
  }

  /** engine.cpp:159-189. The application render settings scene index
   *  (USDIMAGINGGL_ENGINE_ENABLE_RENDER_SETTINGS_SCENE_INDEX, default false)
   *  is not appended. */
  private _append(inputScene: HdSceneIndexBase, _createArgs: HdContainerDataSource | undefined): HdSceneIndexBase {
    let sceneIndex = inputScene
    sceneIndex = this.sceneGlobalsSceneIndex = HdsiSceneGlobalsSceneIndex.new(sceneIndex)
    sceneIndex = this.domeLightCameraVisibilitySceneIndex = HdsiDomeLightCameraVisibilitySceneIndex.new(sceneIndex)
    sceneIndex = this.sceneMaterialPruningSceneIndex = HdsiSceneMaterialPruningSceneIndex.new(sceneIndex)
    return sceneIndex
  }

  /** engine.cpp:191-205 */
  private static _appendCallback(renderInstanceId: string, inputScene: HdSceneIndexBase,
    createArgs: HdContainerDataSource | undefined): HdSceneIndexBase {
    const instance = _AppSceneIndices._tracker.GetInstance(renderInstanceId)
    if (!instance) {
      TF_CODING_ERROR(`Did not find appSceneIndices instance for ${renderInstanceId},`)
      return inputScene
    }
    return instance._append(inputScene, createArgs)
  }

  /** engine.cpp:207-226 */
  private static _register(): void {
    // Insert earlier so downstream scene indices can query and be notified
    // of changes and also declare their dependencies (e.g., to support
    // rendering color spaces).
    const insertionPhase = 0
    HdSceneIndexPluginRegistry.GetInstance().registerSceneIndexForRenderer(
      '', // empty string implies all renderers
      _AppSceneIndices._appendCallback,
      /* inputArgs = */ null,
      insertionPhase,
      0 /* HdSceneIndexPluginRegistry::InsertionOrderAtStart */,
    )
  }

  /** Test seam: HdSceneIndexPluginRegistry._ResetInstance() drops the
   *  registration made once per process upstream. */
  static _resetRegistration(): void { _AppSceneIndices._registered = false }
}

/** engine.cpp:233-260: RAII helper to enable and disable notice batching when
 *  using the stage scene index, as a function of a scope. */
function _WithHydraNoticeBatch<T>(noticeBatchingSceneIndex: HdNoticeBatchingSceneIndex | null | undefined, f: () => T): T {
  noticeBatchingSceneIndex?.setBatchingEnabled(true)
  try {
    return f()
  } finally {
    noticeBatchingSceneIndex?.setBatchingEnabled(false)
  }
}

/** engine.cpp:270-301: convert UsdImagingGLCullStyle to a HdCullStyleTokens
 *  value. */
function _CullStyleEnumToToken(cullStyle: UsdImagingGLCullStyle): string {
  switch (cullStyle) {
    case UsdImagingGLCullStyle.CULL_STYLE_NO_OPINION:
      return ''
    case UsdImagingGLCullStyle.CULL_STYLE_NOTHING:
      return HdCullStyleTokens.nothing
    case UsdImagingGLCullStyle.CULL_STYLE_BACK:
      return HdCullStyleTokens.back
    case UsdImagingGLCullStyle.CULL_STYLE_FRONT:
      return HdCullStyleTokens.front
    case UsdImagingGLCullStyle.CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED:
      return HdCullStyleTokens.backUnlessDoubleSided
    default:
      // XXX There is currently no UsdImagingGLCullStyle enum value
      // equivalent to HdCullStyleTokens->frontUnlessDoubleSided,
      // but if we add it in the future we need to handle it here.
      TF_CODING_ERROR(`UsdImagingGLEngine: Unrecognzied enum value ${cullStyle}`)
      return ''
  }
}

/** engine.cpp:303-329 */
interface _RootOverrides {
  transform: GfMatrix4d
  visibility: boolean
}
function _GetRootOverrides(p: UsdImagingRootOverridesSceneIndex | null): _RootOverrides {
  if (!p) {
    return { transform: new GfMatrix4d(1), visibility: true }
  }
  return { transform: p.getRootTransform(), visibility: p.getRootVisibility() }
}
function _SetRootOverrides(overrides: _RootOverrides, p: UsdImagingRootOverridesSceneIndex): void {
  p.setRootTransform(overrides.transform)
  p.setRootVisibility(overrides.visibility)
}

/** engine.cpp:2510-2545 */
function _GetRefineLevel(complexity: number): number {
  // TODO: Change complexity to refineLevel when we refactor UsdImaging.
  //
  // Convert complexity float to refine level int.
  let refineLevel = 0

  // to avoid floating point inaccuracy (e.g. 1.3 > 1.3f)
  const f = Math.fround
  const c = Math.min(f(f(complexity) + f(0.01)), f(2.0))

  if (f(1.0) <= c && c < f(1.1)) {
    refineLevel = 0
  } else if (f(1.1) <= c && c < f(1.2)) {
    refineLevel = 1
  } else if (f(1.2) <= c && c < f(1.3)) {
    refineLevel = 2
  } else if (f(1.3) <= c && c < f(1.4)) {
    refineLevel = 3
  } else if (f(1.4) <= c && c < f(1.5)) {
    refineLevel = 4
  } else if (f(1.5) <= c && c < f(1.6)) {
    refineLevel = 5
  } else if (f(1.6) <= c && c < f(1.7)) {
    refineLevel = 6
  } else if (f(1.7) <= c && c < f(1.8)) {
    refineLevel = 7
  } else if (f(1.8) <= c && c <= f(2.0)) {
    refineLevel = 8
  } else {
    TF_CODING_ERROR(`Invalid complexity ${c}, expected range is [1.0,2.0]\n`)
  }
  return refineLevel
}

/** HdInstancerContext (hd/types.h): (instancer path, instance id) pairs. */
export type HdInstancerContext = Array<[string, number]>

/** engine.h:87-113 */
export interface UsdImagingGLEngineParameters {
  rootPath?: string
  excludedPaths?: string[]
  invisedPaths?: string[]
  sceneDelegateID?: string
  /** An HdDriver, containing the Hgi of your choice. Required for a
   *  GPU-enabled engine here (see the header). */
  driver?: HdDriver
  /** The renderer plugin that Hydra should use. If empty, a default renderer
   *  plugin will be chosen depending on the value of gpuEnabled. */
  rendererPluginId?: string
  /** Determines if this instance will allow Hydra to use the GPU to produce
   *  images. */
  gpuEnabled?: boolean
  /** Draws bounding boxes for unloaded prims if they have extents/extentsHint
   *  authored. */
  displayUnloadedPrimsWithBounds?: boolean
  /** Indicates to constructed hydra scene indices that asynchronous
   *  processing is allowed. */
  allowAsynchronousSceneProcessing?: boolean
  /** Enables draw mode for prims (model:drawMode). */
  enableUsdDrawModes?: boolean
}

/** engine.h:323-345 */
export interface UsdImagingGLIntersectionResult {
  hitPoint: GfVec3d
  hitNormal: GfVec3d
  hitPrimPath: string
  hitInstancerPath: string
  hitInstanceIndex: number
  instancerContext: HdInstancerContext
}

/** engine.h:349-353 */
export interface UsdImagingGLPickParams {
  resolveMode: string
}

/** engine.h:405-409 */
export interface UsdImagingGLDecodeResult {
  primPath: string
  instancerContext: HdInstancerContext
}

/** engine.h:413-417 */
export interface UsdImagingGLPickId {
  primId: number
  instanceId: number
}

const _stormRendererPluginName = 'HdStormRendererPlugin'

/** engine.h:70-948: the UsdImagingGLEngine is the main entry point API for
 *  rendering USD scenes. */
export class UsdImagingGLEngine {
  private _hgi: Hgi | null = null
  private readonly _displayUnloadedPrimsWithBounds: boolean
  private _gpuEnabled: boolean
  private _renderer: HdPluginRendererUniqueHandle | null = null
  private readonly _sceneDelegateId: string
  private _selectionColor = new GfVec4f(1, 1, 0, 1)
  /** engine.cpp:396 */
  private readonly _selTracker = new HdxSelectionTracker()
  private _domeLightCameraVisibility = true
  private readonly _rootPath: string
  private readonly _excludedPrimPaths: string[]
  private readonly _invisedPrimPaths: string[]
  private _isPopulated = false
  private readonly _allowAsynchronousSceneProcessing: boolean
  private readonly _enableUsdDrawModes: boolean
  private _renderCollection = new HdRprimCollection()
  private _intersectCollection = new HdRprimCollection()
  private _lightingContextForOpenGLState: GlfSimpleLightingContext | null = null
  private _userFramebuffer: unknown = undefined

  // Scene indices
  private _sceneIndexCreateArgs: HdContainerDataSource | undefined = undefined
  private _appSceneIndices: _AppSceneIndices | null = null
  private _mergingSceneIndex: HdMergingSceneIndex | null = null
  private _terminalSceneIndex: HdSceneIndexBase | null = null
  private _usdImagingSceneIndex: UsdImagingSceneIndex | null = null
  private _displayStyleSceneIndex: HdsiLegacyDisplayStyleOverrideSceneIndex | null = null
  private _legacyRenderSettingsSceneIndex: UsdImagingLegacyRenderSettingsSceneIndex | null = null
  private _rootOverridesSceneIndex: UsdImagingRootOverridesSceneIndex | null = null
  private _lightPruningSceneIndex: HdsiPrimTypeAndPathPruningSceneIndex | null = null
  private _lightPruningSceneIndexEnableSceneLights = true
  private _noticeBatchingStageSceneIndex: HdNoticeBatchingSceneIndex | null = null
  private _execStageSceneIndex: UsdImagingStageSceneIndexInterface | null = null
  private _taskControllerSceneIndex: HdxTaskControllerSceneIndex | null = null

  /** engine.cpp:351-421: the (Parameters), (driver, rendererPluginId,
   *  gpuEnabled) and full constructors in one. */
  constructor(params: UsdImagingGLEngineParameters = {}) {
    this._displayUnloadedPrimsWithBounds = params.displayUnloadedPrimsWithBounds ?? false
    this._gpuEnabled = params.gpuEnabled ?? true
    this._sceneDelegateId = params.sceneDelegateID ?? _GetUsdImagingDelegateId()
    this._rootPath = params.rootPath ?? '/'
    this._excludedPrimPaths = [...(params.excludedPaths ?? [])]
    this._invisedPrimPaths = [...(params.invisedPaths ?? [])]
    this._allowAsynchronousSceneProcessing = params.allowAsynchronousSceneProcessing ?? false
    this._enableUsdDrawModes = params.enableUsdDrawModes ?? true

    const driver = params.driver
    if (driver && driver.name === HgiTokens.renderDriver) {
      this._hgi = (driver.driver as Hgi | null | undefined) ?? null
      if (this._hgi && !this._gpuEnabled) {
        TF_WARN('Trying to share GPU resources while disabling the GPU.')
        this._gpuEnabled = true
      }
    }

    // The renderer, task controller scene index, and
    // _sceneDelegate/_sceneIndex are initialized by the plugin system.
    const rendererPluginId = params.rendererPluginId ?? ''
    if (!this.setRendererPlugin(rendererPluginId !== ''
      ? rendererPluginId
      : UsdImagingGLEngine._getDefaultRendererPluginId())) {
      TF_CODING_ERROR('No renderer plugins found!')
    }
  }

  /** engine.cpp:423-478 */
  private _destroyHydraObjects(): void {
    // Destroy objects in opposite order of construction.

    // We are not removing _usdImagingFinalSceneIndex from _mergingSceneIndex
    // here. Destroying the renderer (and the render index it owns) tears down
    // the downstream observers, so explicit removal is unnecessary.
    this._renderer?.Reset()
    this._renderer = null

    this._terminalSceneIndex = null
    this._appSceneIndices?.destroy()
    this._appSceneIndices = null
    this._mergingSceneIndex = null

    // JavaScript has no destructors: upstream's stage scene index stops
    // receiving the stage's notices when it is destroyed (its TfNotice
    // listener is a weak pointer). Here the UsdImaging scene index is
    // detached from its observers, then from the stage, so a stage that
    // outlives the engine does not keep feeding it.
    this._usdImagingSceneIndex?.destroy()
    this._usdImagingSceneIndex?.SetStage(undefined)
    this._usdImagingSceneIndex = null
    this._displayStyleSceneIndex = null
    this._legacyRenderSettingsSceneIndex = null
    this._rootOverridesSceneIndex = null
    this._lightPruningSceneIndex = null
    this._noticeBatchingStageSceneIndex = null
    // As for the UsdImaging scene index above: the exec scene index's
    // ExecUsdSystem listens to the stage until its request is dropped.
    this._execStageSceneIndex?.SetStage(undefined)
    this._execStageSceneIndex = null

    this._taskControllerSceneIndex = null

    this._sceneIndexCreateArgs = undefined

    this._isPopulated = false
  }

  /** engine.cpp:480-488 (the destructor) */
  destroy(): void {
    this._destroyHydraObjects()
  }

  //--------------------------------------------------------------------------
  // Rendering
  //--------------------------------------------------------------------------

  /** engine.cpp:494-586 */
  PrepareBatch(root: UsdPrim, params: UsdImagingGLRenderParams): void {
    if (!this._renderer) {
      return
    }

    if (!this._canPrepare(root)) {
      return
    }

    // Scene time.
    {
      this._preSetTime(params)
      // SetTime will only react if time actually changes.
      this._usdImagingSceneIndex!.SetTime(params.frame)
      if (this._execStageSceneIndex) {
        this._execStageSceneIndex.SetTime(params.frame)
        this._noticeBatchingStageSceneIndex!.flush()
      }
      this._setSceneGlobalsCurrentFrame(params.frame)
      this._postSetTime(params)
    }

    // Miscellaneous scene render configuration parameters.
    if (this._appSceneIndices) {
      const si = this._appSceneIndices.sceneMaterialPruningSceneIndex
      if (si) {
        si.setEnabled(!params.enableSceneMaterials)
      }
    }
    if (this._lightPruningSceneIndex) {
      if (this._lightPruningSceneIndexEnableSceneLights !== params.enableSceneLights) {
        this._lightPruningSceneIndex.setPathPredicate(
          params.enableSceneLights
            // Empty predicate means we prune nothing.
            ? undefined
            // Predicate matches every path.
            // Thus, scene index prunes every prim
            // matching the prim types given earlier.
            : ((_a: string) => true) as HdsiPrimTypeAndPathPruningSceneIndexPathPredicate)
        this._lightPruningSceneIndexEnableSceneLights = params.enableSceneLights
      }
    }
    if (this._displayStyleSceneIndex) {
      this._displayStyleSceneIndex.setCullStyleFallback(_CullStyleEnumToToken(params.cullStyle))
    }

    // Populate after setting time & configuration parameters above,
    // to avoid extra unforced rounds of invalidation after population.
    if (!this._isPopulated) {
      const stage = root.getStage()
      _WithHydraNoticeBatch(this._usdImagingSceneIndex!.getPostInstancingNoticeBatchingSceneIndex(), () => {
        this._usdImagingSceneIndex!.SetStage(stage)
        if (this._execStageSceneIndex) {
          this._execStageSceneIndex.SetStage(stage)
        }
      })
      this._isPopulated = true
    }
  }

  /** engine.cpp:587-603 */
  private _prepareRender(params: UsdImagingGLRenderParams): void {
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    const renderTags = UsdImagingGLEngine._computeRenderTags(params)

    this._taskControllerSceneIndex.setFreeCameraClipPlanes(params.clipPlanes)
    this._taskControllerSceneIndex.setRenderTags(renderTags)
    this._taskControllerSceneIndex.setRenderParams(
      UsdImagingGLEngine._makeHydraUsdImagingGLRenderParams(params))
  }

  /** engine.cpp:636-689 */
  private _updateDomeLightCameraVisibility(): void {
    // The application communicates the dome light camera visibility
    // (that is whether to see the dome light texture behind the geometry)
    // through a render setting.
    //
    // Render settings set on a render delegate are not (yet) seen by
    // a scene index. So we pick it up here and set it on a scene index
    // populating the respective data for each dome light.
    const v = this.getRendererSetting(HdRenderSettingsTokens.domeLightCameraVisibility)

    // The absence of a setting in the map is the same as camera visibility
    // being on.
    const held = v instanceof VtValue ? (v.IsEmpty() ? undefined : v.Get<unknown>()) : v
    const domeLightCamVisSetting = typeof held === 'boolean' ? held : true
    if (this._domeLightCameraVisibility === domeLightCamVisSetting) {
      return
    }

    // Camera visibility state changed, so we need to mark any dome lights
    // as dirty to ensure they have the proper state on all backends.
    this._domeLightCameraVisibility = domeLightCamVisSetting

    if (!this._appSceneIndices) {
      TF_CODING_ERROR('Expected _appSceneIndices.')
      return
    }

    const si = this._appSceneIndices.domeLightCameraVisibilitySceneIndex
    if (!si) {
      TF_CODING_ERROR('Expected Dome light camera visibility scene index.')
      return
    }

    si.setDomeLightCameraVisibility(domeLightCamVisSetting)
  }

  /** engine.cpp:690-711 */
  private _setBBoxParams(bboxes: readonly GfBBox3d[], bboxLineColor: GfVec4f, bboxLineDashSize: number): void {
    if (!this._renderer) {
      return
    }

    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    const params = new HdxBoundingBoxTaskParams()
    params.bboxes = [...bboxes]
    params.color = bboxLineColor
    params.dashSize = bboxLineDashSize

    this._taskControllerSceneIndex.setBBoxParams(params)
  }

  /** engine.cpp:713-761 */
  RenderBatch(paths: readonly string[], params: UsdImagingGLRenderParams): void {
    if (!this._renderer) {
      return
    }

    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    UsdImagingGLEngine._updateHydraCollection(this._renderCollection, paths, params)
    this._taskControllerSceneIndex.setCollection(this._renderCollection)

    this._prepareRender(params)

    this.setColorCorrectionSettings(params.colorCorrectionMode, params.ocioDisplay,
      params.ocioView, params.ocioColorSpace, params.ocioLook)

    this._setBBoxParams(params.bboxes, params.bboxLineColor, params.bboxLineDashSize)

    // XXX App sets the clear color via 'params' instead of setting up Aovs
    // that has clearColor in their descriptor. So for now we must pass this
    // clear color to the color AOV.
    this._taskControllerSceneIndex.setEnableSelection(params.highlight)

    const colorAovDesc = this._taskControllerSceneIndex.getRenderOutputSettings(HdAovTokens.color)
    if (colorAovDesc.format !== 0 /* HdFormatInvalid */) {
      colorAovDesc.clearValue = VtValue.create(params.clearColor, VtValueTypes.GfVec4f)
      this._taskControllerSceneIndex.setRenderOutputSettings(HdAovTokens.color, colorAovDesc)
    }

    this._updateDomeLightCameraVisibility()

    // engine.cpp:754-758: the selection tracker for HdxSelectionTask (and
    // HdxColorizeSelectionTask), which reads the selection the
    // UsdImagingSelectionSceneIndex publishes.
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      renderControl.setTaskContextData(HdxTokens.selectionState, this._selTracker)
    }
    this._execute(params, this._taskControllerSceneIndex.getRenderingTaskPaths())
  }

  /** engine.cpp:762-785 */
  Render(root: UsdPrim, params: UsdImagingGLRenderParams): void {
    if (!this._renderer) {
      return
    }

    this.PrepareBatch(root, params)

    // XXX(UsdImagingPaths): This bit is weird: we get the stage from "root",
    // gate population by _rootPath (which may be different), and then pass
    // root.GetPath() to hydra as the root to draw from. Note that this
    // produces incorrect results in UsdImagingDelegate for native instancing.
    const paths = [_ReplacePrefix(root.path, '/', this._sceneDelegateId)]

    this.RenderBatch(paths, params)
  }

  /** engine.cpp:786-806 */
  isConverged(): boolean {
    const renderControl = this._getLegacyRenderControl()
    if (!renderControl) {
      return true
    }

    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return true
    }

    return renderControl.areTasksConverged(this._taskControllerSceneIndex.getRenderingTaskPaths())
  }

  //--------------------------------------------------------------------------
  // Root and Transform Visibility
  //--------------------------------------------------------------------------

  /** engine.cpp:808-822 */
  setRootTransform(xf: GfMatrix4d): void {
    if (!this._renderer) {
      return
    }
    this._rootOverridesSceneIndex!.setRootTransform(xf)
  }

  /** engine.cpp:824-838 */
  setRootVisibility(isVisible: boolean): void {
    if (!this._renderer) {
      return
    }
    this._rootOverridesSceneIndex!.setRootVisibility(isVisible)
  }

  //--------------------------------------------------------------------------
  // Camera and Light State
  //--------------------------------------------------------------------------

  /** engine.cpp:844-859 */
  setRenderViewport(viewport: GfVec4d): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._taskControllerSceneIndex.setRenderViewport(viewport)
  }

  /** engine.cpp:861-876 */
  setFraming(framing: CameraUtilFraming): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._taskControllerSceneIndex.setFraming(framing)
  }

  /** engine.cpp:878-894 */
  setOverrideWindowPolicy(policy: CameraUtilConformWindowPolicy | undefined): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._taskControllerSceneIndex.setOverrideWindowPolicy(policy)
  }

  /** engine.cpp:896-911 */
  setRenderBufferSize(size: GfVec2i): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._taskControllerSceneIndex.setRenderBufferSize(size)
  }

  /** engine.cpp:913-931 */
  setWindowPolicy(_policy: CameraUtilConformWindowPolicy): void {
    if (!this._renderer) {
      return
    }
    // Note: Free cam uses SetCameraState, which expects the frustum to be
    // pre-adjusted for the viewport size.

    // XXX(USD-7115): window policy
  }

  /** engine.cpp:933-963 */
  setCameraPath(id: string): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    this._taskControllerSceneIndex.setCameraPath(id)

    // The camera that is set for viewing will also be used for
    // time sampling.
    // XXX(HYD-2304): motion blur shutter window.
    // Set camera path on HdsiSceneGlobalsSceneIndex.
    const sgsi = this._appSceneIndices?.sceneGlobalsSceneIndex
    if (sgsi) {
      sgsi.setPrimaryCameraPrimPath(id)
    }
  }

  /** engine.cpp:964-994 */
  setCameraState(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    this._taskControllerSceneIndex.setFreeCameraMatrices(viewMatrix, projectionMatrix)
    const freeCameraPath = this._taskControllerSceneIndex.getFreeCameraPath()

    const sgsi = this._appSceneIndices?.sceneGlobalsSceneIndex
    if (sgsi) {
      sgsi.setPrimaryCameraPrimPath(freeCameraPath)
    }
    // XXX: Do not set camera for sampling on legacy delegate; this camera does
    // not actually exist in the usdImaging scene delegate!
  }

  /** engine.cpp:995-1041: SetLightingState(GlfSimpleLightingContextPtr) and
   *  SetLightingState(lights, material, sceneAmbient). */
  setLightingState(src: GlfSimpleLightingContext | null): void
  setLightingState(lights: readonly GlfSimpleLight[], material: GlfSimpleMaterial, sceneAmbient: GfVec4f): void
  setLightingState(a: GlfSimpleLightingContext | readonly GlfSimpleLight[] | null,
    material?: GlfSimpleMaterial, sceneAmbient?: GfVec4f): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    if (a === null || a instanceof GlfSimpleLightingContext) {
      this._taskControllerSceneIndex.setLightingState(a)
      return
    }

    // we still use _lightingContextForOpenGLState for convenience, but
    // set the values directly.
    if (!this._lightingContextForOpenGLState) {
      this._lightingContextForOpenGLState = GlfSimpleLightingContext.new()
    }
    const ctx = this._lightingContextForOpenGLState
    ctx.setLights(a)
    ctx.setMaterial(material!)
    ctx.setSceneAmbient(sceneAmbient!)
    ctx.setUseLighting(a.length > 0)

    this._taskControllerSceneIndex.setLightingState(this._lightingContextForOpenGLState)
  }

  //--------------------------------------------------------------------------
  // Selection Highlighting
  //--------------------------------------------------------------------------

  /** engine.cpp:1047-1083 */
  setSelected(paths: readonly string[]): void {
    if (!this._renderer) {
      return
    }
    this._usdImagingSceneIndex!.clearSelection()
    for (const path of paths) {
      this._usdImagingSceneIndex!.addSelection(path)
    }
  }

  /** engine.cpp:1084-1102 */
  clearSelected(): void {
    if (!this._renderer) {
      return
    }
    this._usdImagingSceneIndex!.clearSelection()
  }

  /** engine.cpp:1113-1140 */
  addSelected(path: string, _instanceIndex: number): void {
    if (!this._renderer) {
      return
    }
    this._usdImagingSceneIndex!.addSelection(path)
  }

  /** engine.cpp:1141-1160 */
  setSelectionColor(color: GfVec4f): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._selectionColor = color
    this._taskControllerSceneIndex.setSelectionColor(this._selectionColor)
  }

  //--------------------------------------------------------------------------
  // Picking
  //--------------------------------------------------------------------------

  /** engine.cpp:1164-1209: the nearest-to-center form. Resolves to the hit
   *  or null (upstream's out-parameters and bool); asynchronous because the
   *  pick task's readback is (see TestIntersection). */
  async testIntersectionNearest(viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d, root: UsdPrim,
    params: UsdImagingGLRenderParams): Promise<UsdImagingGLIntersectionResult | null> {
    const pickParams: UsdImagingGLPickParams = { resolveMode: HdxPickTokens.resolveNearestToCenter }
    const results: UsdImagingGLIntersectionResult[] = []

    if (await this.testIntersection(pickParams, viewMatrix, projectionMatrix, root, params, results)) {
      if (results.length !== 1) {
        // Since we are in nearest-hit mode, we expect allHits to have a
        // single point in it.
        return null
      }
      return results[0]!
    }
    return null
  }

  /** engine.cpp:1211-1229 */
  private _getInstancerForPrim(sceneIndexPath: string): string {
    const terminalSceneIndex = this._getTerminalSceneIndex()
    if (!terminalSceneIndex) {
      return ''
    }
    const schema = HdInstancedBySchema.getFromParent(terminalSceneIndex.getPrim(sceneIndexPath).dataSource)
    const ds = schema.getPaths()
    if (!ds) {
      return ''
    }
    const paths = ds.getTypedValue(0.0) as unknown as readonly unknown[]
    if (!paths || paths.length === 0) {
      return ''
    }
    return String(paths[0])
  }

  /** engine.cpp:1231-1319. Divergence: asynchronous. HdxPickTask reads its
   *  id buffers back from the GPU, which WebGPU does asynchronously; the
   *  hits are in outHits once the picking tasks' GetPendingResolve()
   *  promises resolve (hdx/src/pickTask.ts header), awaited here after the
   *  task graph executes. */
  async testIntersection(pickParams: UsdImagingGLPickParams, viewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d,
    root: UsdPrim, params: UsdImagingGLRenderParams, outResults?: UsdImagingGLIntersectionResult[]): Promise<boolean> {
    if (!this._renderer) {
      return false
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return false
    }

    this.PrepareBatch(root, params)

    // XXX(UsdImagingPaths): This is incorrect...  "Root" points to a USD
    // subtree, but the subtree in the hydra namespace might be very different
    // (e.g. for native instancing).  We need a translation step.
    const paths = [_ReplacePrefix(root.path, '/', this._sceneDelegateId)]
    UsdImagingGLEngine._updateHydraCollection(this._intersectCollection, paths, params)

    this._prepareRender(params)

    const allHits: HdxPickHit[] = []
    const pickCtxParams = new HdxPickTaskContextParams()
    pickCtxParams.resolveMode = TfToken(pickParams.resolveMode)
    pickCtxParams.viewMatrix = viewMatrix
    pickCtxParams.projectionMatrix = projectionMatrix
    pickCtxParams.clipPlanes = [...params.clipPlanes]
    pickCtxParams.collection = this._intersectCollection
    pickCtxParams.outHits = allHits

    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      renderControl.setTaskContextData(HdxPickTokens.pickParams, pickCtxParams)
    }
    const pickingTaskPaths = this._taskControllerSceneIndex.getPickingTaskPaths()
    this._execute(params, pickingTaskPaths)
    const renderIndex = this._getRenderIndex() as
      { getTask(id: string): { getPendingResolve?(): Promise<void> } | undefined } | null
    for (const path of pickingTaskPaths) {
      await renderIndex?.getTask(path)?.getPendingResolve?.()
    }

    // return false if there were no hits
    if (allHits.length === 0) {
      return false
    }

    for (const hit of allHits) {
      const info = HdxPrimOriginInfo.fromPickHit(this._getTerminalSceneIndex() ?? undefined, hit)
      const instancerContext = info.computeInstancerContext()
      const res: UsdImagingGLIntersectionResult = {
        hitPrimPath: info.getFullPath(),
        instancerContext,
        hitInstancerPath: instancerContext.length > 0 ? instancerContext[instancerContext.length - 1]![0] : '',
        hitPoint: hit.worldSpaceHitPoint,
        hitNormal: new GfVec3d(hit.worldSpaceHitNormal.get(0), hit.worldSpaceHitNormal.get(1), hit.worldSpaceHitNormal.get(2)),
        hitInstanceIndex: hit.instanceIndex,
      }
      outResults?.push(res)
    }

    return true
  }

  /** engine.cpp:1336-1395: decode a prim id and instance id into the scene
   *  prim path, instancer path and instancer context; null when the prim id
   *  is unknown. (The primIdColor/instanceIdColor overload, engine.cpp:
   *  1320-1334, decodes with HdxPickTask::DecodeIDRenderColor, which is not
   *  ported here.) */
  decodeIntersection(primIdx: number, instanceIdx: number):
    { hitPrimPath: string, hitInstancerPath: string, hitInstanceIndex: number, instancerContext: HdInstancerContext } | null {
    const sceneIndexPath = this._getSceneIndexPrimPathFromPrimId(primIdx)
    if (sceneIndexPath === '') {
      return null
    }
    const info = HdxPrimOriginInfo.fromPickHit(this._getTerminalSceneIndex() ?? undefined,
      { objectId: sceneIndexPath, instanceIndex: instanceIdx } as never)
    const instancerContext = info.computeInstancerContext()
    return {
      hitPrimPath: info.getFullPath(),
      instancerContext,
      hitInstancerPath: instancerContext.length > 0 ? instancerContext[instancerContext.length - 1]![0] : '',
      hitInstanceIndex: instanceIdx,
    }
  }

  /** engine.cpp:1396-1445 */
  decodeIntersections(pickIds: readonly UsdImagingGLPickId[]): UsdImagingGLDecodeResult[] {
    // Scene index path: use HdxPrimOriginInfo::FromPickHits which amortizes
    // instancer topology computation.
    const hits = pickIds.map(pickId => ({
      objectId: this._getSceneIndexPrimPathFromPrimId(pickId.primId),
      instanceIndex: pickId.instanceId,
    }))
    const infos = HdxPrimOriginInfo.fromPickHits(this._getTerminalSceneIndex() ?? undefined, hits as never)
    return infos.map(info => ({ primPath: info.getFullPath(), instancerContext: info.computeInstancerContext() }))
  }

  //--------------------------------------------------------------------------
  // Renderer Plugin Management
  //--------------------------------------------------------------------------

  /** engine.cpp:1449-1461 */
  static getRendererPlugins(): string[] {
    return HdRendererPluginRegistry.GetInstance().getPluginDescs().map(d => d.id)
  }

  /** engine.cpp:1463-1484 */
  static getRendererDisplayName(id: string): string {
    const pluginDescriptor = HdRendererPluginRegistry.GetInstance().getPluginDesc(id)
    if (!pluginDescriptor) {
      return ''
    }

    // Storm's display name is GL, but that's just confusing since it
    // also has Metal and Vulkan implementations. Change it here for now,
    // eventually it will have to be properly renamed.
    if (pluginDescriptor.id === _stormRendererPluginName) {
      return 'Storm'
    }

    return pluginDescriptor.displayName
  }

  /** engine.cpp:1486-1494 */
  getRendererHgiDisplayName(): string {
    if (!this._hgi) {
      return ''
    }
    return this._hgi.getAPIName()
  }

  /** engine.cpp:1496-1500 */
  getGPUEnabled(): boolean {
    return this._gpuEnabled
  }

  /** engine.cpp:1502-1510 */
  getCurrentRendererId(): string {
    if (!this._renderer) {
      return ''
    }
    return this._renderer.getPluginId()
  }

  /** engine.cpp:1512-1568 */
  setRendererPlugin(id: string): boolean {
    const rendererCreateArgs = new HdRendererCreateArgsSchema(
      new HdRendererCreateArgsSchema.Builder()
        .setGpuEnabled(HdRetainedTypedSampledDataSource.new(this._gpuEnabled))
        .setDrivers(HdRetainedContainerDataSource.new(
          [HdRendererCreateArgsSchemaTokens.hgi],
          [HdRetainedTypedSampledDataSource.new(this._getOrCreateHgi())]))
        .build())

    const registry = HdRendererPluginRegistry.GetInstance()

    const resolvedId = id === '' ? registry.getDefaultPluginId(rendererCreateArgs) : id

    if (this._renderer && this._renderer.isValid() && this._renderer.getPluginId() === resolvedId) {
      return true
    }

    const plugin = registry.getOrCreateRendererPlugin(resolvedId)
    if (!plugin.isValid()) {
      TF_CODING_ERROR(`Invalid plugin id ${resolvedId}`)
      return false
    }

    const errorStr: { value?: string } = {}
    if (!plugin.Get()!.isSupported(rendererCreateArgs, errorStr)) {
      TF_CODING_ERROR(`Plugin ${resolvedId} is unsupported: ${errorStr.value ?? ''}`)
      return false
    }

    // Create all scene indices (usd imaging scene indices, task controller
    // scene index, filtering scene indices) that eventually feed into the
    // renderer which we create.
    if (!this._createSceneIndicesAndRenderer(plugin, rendererCreateArgs)) {
      return false
    }

    if (this._allowAsynchronousSceneProcessing) {
      const si = this._getTerminalSceneIndex()
      if (si) {
        _SystemMessage(si, _systemMessageTokens.asyncAllow)
      }
    }

    return true
  }

  /** engine.cpp:1570-1666 */
  private _createSceneIndicesAndRenderer(plugin: HdRendererPluginHandle,
    rendererCreateArgs: HdRendererCreateArgsSchema): boolean {
    // Remember root overrides.
    const rootOverrides = _GetRootOverrides(this._rootOverridesSceneIndex)

    // Destroy old structures.
    this._destroyHydraObjects()

    // Arguments passed to the constructors of various scene indices.
    const sceneIndexCreateArgs = this._getSceneIndexCreateArgs(plugin)

    // Retain the create-args so that GetRendererSettingsList() can source the
    // renderer's advertised render settings from them.
    this._sceneIndexCreateArgs = sceneIndexCreateArgs

    // Create the merging scene index, all subsequent scene indices
    // and the renderer.
    this._createSceneIndexChainAndRenderer(sceneIndexCreateArgs, plugin, rendererCreateArgs)

    if (!this._renderer || !this._renderer.isValid()) {
      return false
    }

    // Create the usd imaging scene indices.
    {
      // Setup Usd imaging scene indices.
      const sceneIndex = this._createUsdImagingSceneIndices(sceneIndexCreateArgs)
      _SetRootOverrides(rootOverrides, this._rootOverridesSceneIndex!)

      this._mergingSceneIndex!.insertInputScenes([{ scene: sceneIndex, activeInputSceneRoot: this._sceneDelegateId }])
    }

    {
      // Setup task controller scene index.
      const renderControl = this._getLegacyRenderControl()
      const requiresStormTasks = renderControl ? renderControl.requiresStormTasks() : false

      const taskControllerPath = this._computeControllerPath(plugin.Get()!.getDisplayName())
      const renderer = this._renderer.Get()!
      this._taskControllerSceneIndex = HdxTaskControllerSceneIndex.new({
        prefix: taskControllerPath,
        aovDescriptorCallback: (name: string): HdAovDescriptor => {
          const rc = renderer.getLegacyRenderControl()
          if (!rc) { return new HdAovDescriptor() }
          return rc.getDefaultAovDescriptor(name)
        },
        isForStorm: requiresStormTasks,
        gpuEnabled: this._gpuEnabled,
      })
      this._taskControllerSceneIndex.setSelectionColor(this._selectionColor)
      this._mergingSceneIndex!.insertInputScenes([{ scene: this._taskControllerSceneIndex, activeInputSceneRoot: taskControllerPath }])
    }

    return true
  }

  private static _nextEngineId = 1
  private readonly _engineId = UsdImagingGLEngine._nextEngineId++

  /** engine.cpp:1667-1677. Divergence: the engine's address (%p) is a
   *  per-process engine counter. */
  private _computeControllerPath(pluginId: string): string {
    const pluginIdStr = _MakeValidIdentifier(pluginId)
    const rendererName = `_UsdImaging_${pluginIdStr}_${this._engineId.toString(16)}`
    return _AppendChild(this._sceneDelegateId, rendererName)
  }

  /** engine.cpp:1679-1719 */
  private _appendOverridesSceneIndices(inputScene: HdSceneIndexBase, _createArgs: HdContainerDataSource | undefined): HdSceneIndexBase {
    let sceneIndex = inputScene

    if (TfGetEnvSetting(USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX)) {
      sceneIndex = this._createExecSceneIndices(sceneIndex)
    }

    const prefixPathPruningInputArgs = HdRetainedContainerDataSource.new(
      [HdsiPrefixPathPruningSceneIndexTokens.excludePathPrefixes],
      [HdRetainedTypedSampledDataSource.new([...this._excludedPrimPaths])])

    sceneIndex = HdsiPrefixPathPruningSceneIndex.new(sceneIndex, prefixPathPruningInputArgs)

    const lightPruningInputArgs = HdRetainedContainerDataSource.new(
      [HdsiPrimTypeAndPathPruningSceneIndexTokens.primTypes],
      [HdRetainedTypedSampledDataSource.new([...HdLightPrimTypeTokens()])])

    sceneIndex = this._lightPruningSceneIndex =
      HdsiPrimTypeAndPathPruningSceneIndex.new(sceneIndex, lightPruningInputArgs)
    // _lightPruningSceneIndex comes with empty predicate which corresponds to
    // enableSceneLights = true.
    this._lightPruningSceneIndexEnableSceneLights = true

    sceneIndex = this._rootOverridesSceneIndex = UsdImagingRootOverridesSceneIndex.new(sceneIndex)

    sceneIndex = this._legacyRenderSettingsSceneIndex = UsdImagingLegacyRenderSettingsSceneIndex.new(sceneIndex)

    return sceneIndex
  }

  /** engine.cpp:1722-1771 */
  private _createExecSceneIndices(inputScene: HdSceneIndexBase): HdSceneIndexBase {
    // Try to manufacture an instance of UsdExecImaging_StageSceneIndex from a
    // registered factory object. If this cannot be done, emit an error and do
    // not modify the input scene.

    // PlugRegistry::FindDerivedTypeByName<UsdImagingStageSceneIndexInterface>
    // is base.FindDerivedByName after plugin registration
    // (plug/registry.cpp:210-215); plugins register when their modules load.
    const execStageSceneIndexType =
      UsdImagingStageSceneIndexInterfaceType.findDerivedByName(
        'UsdExecImaging_StageSceneIndex')
    if (!TF_VERIFY(!execStageSceneIndexType.isUnknown(), '!execStageSceneIndexType.IsUnknown()')) {
      return inputScene
    }

    const execSceneIndexFactory =
      execStageSceneIndexType.getFactory<UsdImagingStageSceneIndexInterfaceFactoryBase>()
    if (!TF_VERIFY(execSceneIndexFactory, 'execSceneIndexFactory')) {
      return inputScene
    }

    this._execStageSceneIndex = execSceneIndexFactory!.new()
    if (!TF_VERIFY(this._execStageSceneIndex, '_execStageSceneIndex')) {
      return inputScene
    }

    // Insert a merging scene index that merges the input scene with the
    // _execStageSceneIndex. The _execStageSceneIndex is added first so that its
    // data sources overshadow the corresponding data sources from the input
    // scene.
    const mergingSceneIndex = HdMergingSceneIndex.new()
    mergingSceneIndex.addInputScene(
      this._execStageSceneIndex,
      '/')
    mergingSceneIndex.addInputScene(
      inputScene,
      '/')

    // Insert a notice batching scene index that batches all notices
    // originating from the UsdImagingStageSceneIndex and the
    // UsdExecImagingStageSceneIndex. This ensures the exec scene index
    // is able to refresh its exec request before notices are flushed
    // to downstream scene indices.
    this._noticeBatchingStageSceneIndex = HdNoticeBatchingSceneIndex.new(
      mergingSceneIndex)
    this._noticeBatchingStageSceneIndex.setBatchingEnabled(true)

    return this._noticeBatchingStageSceneIndex
  }

  /** engine.cpp:1773-1799 */
  private _createUsdImagingSceneIndices(sceneIndexCreateArgs: HdContainerDataSource | undefined): HdSceneIndexBase {
    let sceneIndex: HdSceneIndexBase

    sceneIndex = this._usdImagingSceneIndex = UsdImagingSceneIndex.new(sceneIndexCreateArgs, {
      overridesSceneIndexCallback: (inputScene: HdSceneIndexBase, createArgs: HdContainerDataSource | undefined) =>
        this._appendOverridesSceneIndices(inputScene, createArgs),
    })

    sceneIndex = this._displayStyleSceneIndex = HdsiLegacyDisplayStyleOverrideSceneIndex.new(sceneIndex)

    if (this._sceneDelegateId !== '/') {
      sceneIndex = HdPrefixingSceneIndex.new(sceneIndex, this._sceneDelegateId)
    }

    return sceneIndex
  }

  /** engine.cpp:1801-1823 */
  private _getSceneIndexCreateArgs(plugin: HdRendererPluginHandle): HdContainerDataSource | undefined {
    const rendererPluginArgs = plugin.Get()!.getSceneIndexCreateArgs()

    const usdImagingArgs = HdRetainedContainerDataSource.new(
      [UsdImagingSceneIndexCreateArgsSchema.getSchemaToken()],
      [new UsdImagingSceneIndexCreateArgsSchema.Builder()
        .setAddDrawModeSceneIndex(HdRetainedTypedSampledDataSource.new(this._enableUsdDrawModes))
        .setDisplayUnloadedPrimsWithBounds(HdRetainedTypedSampledDataSource.new(this._displayUnloadedPrimsWithBounds))
        .build()])

    return HdOverlayContainerDataSource.overlayedContainerDataSources(rendererPluginArgs, usdImagingArgs)
  }

  /** engine.cpp:1846-1895 */
  private _createSceneIndexChainAndRenderer(sceneIndexCreateArgs: HdContainerDataSource | undefined,
    plugin: HdRendererPluginHandle, rendererCreateArgs: HdRendererCreateArgsSchema): void {
    let sceneIndex: HdSceneIndexBase = this._mergingSceneIndex = HdMergingSceneIndex.new()

    // Setup scene indices following HdMergingSceneIndex.

    const rendererDisplayName = plugin.Get()!.getDisplayName()

    if (rendererDisplayName !== '') {
      // Use the render delegate ptr (rather than 'this' ptr) for generating
      // the unique id.
      const renderInstanceId = `UsdImagingGLEngine_${rendererDisplayName}_${this._engineId.toString(16)}`

      this._appSceneIndices = _AppSceneIndices.new(renderInstanceId)

      sceneIndex = HdSceneIndexPluginRegistry.GetInstance().appendSceneIndicesForRenderer(
        rendererDisplayName, sceneIndex, renderInstanceId,
        /* appName = */ '', sceneIndexCreateArgs)
    }

    // USDIMAGINGGL_ENGINE_ENABLE_CACHING_SCENE_INDEX is off (see the header).

    this._terminalSceneIndex = sceneIndex

    this._renderer = plugin.Get()!.createRenderer(this._terminalSceneIndex, rendererCreateArgs)
  }

  //--------------------------------------------------------------------------
  // AOVs and Renderer Settings
  //--------------------------------------------------------------------------

  /** engine.cpp:1899-1924 */
  getRendererAovs(): string[] {
    const renderControl = this._getLegacyRenderControl()
    if (!renderControl) {
      return []
    }

    const candidateAovs = [HdAovTokens.primId, HdAovTokens.depth, HdAovTokens.normal, HdAovTokens.Neye, 'primvars:st']

    const aovs: string[] = [HdAovTokens.color]
    for (const aov of candidateAovs) {
      const format = renderControl.getDefaultAovDescriptor(aov).format
      if (format !== 0 /* HdFormatInvalid */) {
        aovs.push(aov)
      }
    }
    return aovs
  }

  /** engine.cpp:1926-1942 */
  setRendererAov(id: string): boolean {
    if (!this._renderer) {
      return false
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return true
    }
    this._taskControllerSceneIndex.setRenderOutputs([id])
    return true
  }

  /** engine.cpp:1944-1960 */
  setRendererAovs(ids: readonly string[]): boolean {
    if (!this._renderer) {
      return false
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return true
    }
    this._taskControllerSceneIndex.setRenderOutputs(ids)
    return true
  }

  /** engine.cpp:1962-1981: the HgiTextureHandle the AOV input task put on
   *  the task context, or undefined. */
  getAovTexture(name: string): unknown {
    const renderControl = this._getLegacyRenderControl()
    if (!renderControl) {
      return undefined
    }
    const aov: { value?: unknown } = {}
    if (!renderControl.getTaskContextData(name, aov)) {
      return undefined
    }
    const value = aov.value instanceof VtValue ? (aov.value.IsEmpty() ? undefined : aov.value.Get<unknown>()) : aov.value
    // aov.IsHolding<HgiTextureHandle>()
    if (!value || typeof (value as { Get?: unknown }).Get !== 'function') {
      return undefined
    }
    return value
  }

  /** engine.cpp:1982-2001 */
  getAovRenderBuffer(name: string): HdRenderBuffer | null {
    const renderControl = this._getLegacyRenderControl()
    if (!renderControl) {
      return null
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return null
    }
    const path = this._taskControllerSceneIndex.getRenderBufferPath(name)
    return renderControl.getRenderBuffer(path)
  }

  /** engine.cpp:2003-2025 */
  private static _computeRendererSettingType(r: UsdImagingGLRendererSetting): boolean {
    const v = r.defValue
    const typeName = v.IsEmpty() ? '' : v.getTypeName()
    if (typeName === 'bool') {
      r.type = UsdImagingGLRendererSettingType.TYPE_FLAG
    } else if (typeName === 'int' || typeName === 'uint') {
      r.type = UsdImagingGLRendererSettingType.TYPE_INT
    } else if (typeName === 'float') {
      r.type = UsdImagingGLRendererSettingType.TYPE_FLOAT
    } else if (typeName === 'string') {
      r.type = UsdImagingGLRendererSettingType.TYPE_STRING
    } else {
      TF_WARN(`Setting '${r.name}' with type '${typeName}' doesn't have a UI implementation...`)
      return false
    }
    return true
  }

  /** engine.cpp:2026-2086. The application render settings scene index is
   *  not created (see the header), so the settings come from the render
   *  control interface (upstream's fallback). */
  getRendererSettingsList(): UsdImagingGLRendererSettingsList {
    const ret: UsdImagingGLRendererSettingsList = []
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      for (const desc of renderControl.getRenderSettingDescriptors()) {
        const r: UsdImagingGLRendererSetting = {
          key: desc.key,
          name: desc.name,
          defValue: desc.defaultValue instanceof VtValue ? desc.defaultValue : _ToVtValue(desc.defaultValue),
          type: UsdImagingGLRendererSettingType.TYPE_FLAG,
        }
        if (UsdImagingGLEngine._computeRendererSettingType(r)) {
          ret.push(r)
        }
      }
    }
    return ret
  }

  /** engine.cpp:2087-2122 (the render control fallback, see
   *  GetRendererSettingsList). */
  getRendererSetting(id: string): unknown {
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      return renderControl.getRenderSetting(id)
    }
    return undefined
  }

  /** engine.cpp:2123-2146 */
  setRendererSetting(id: string, value: unknown): void {
    if (this._legacyRenderSettingsSceneIndex) {
      this._legacyRenderSettingsSceneIndex.setRenderSetting(id, value)
    }

    // Prefer the application render settings scene index (Hydra 2.0 path);
    // fall back to the legacy render control interface if the renderer did not
    // advertise render setting descriptors.
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      renderControl.setRenderSetting(id, value)
    }
  }

  /** engine.cpp:2217-2232 */
  setActiveRenderPassPrimPath(path: string): void {
    const sgsi = this._appSceneIndices?.sceneGlobalsSceneIndex
    if (!sgsi) {
      return
    }
    sgsi.setActiveRenderPassPrimPath(path)
  }

  /** engine.cpp:2234-2253 */
  setActiveRenderSettingsPrimPath(path: string): void {
    const sgsi = this._appSceneIndices?.sceneGlobalsSceneIndex
    if (!sgsi) {
      return
    }
    sgsi.setActiveRenderSettingsPrimPath(path)
  }

  /** engine.cpp:2255-2266 */
  private _setSceneGlobalsCurrentFrame(time: UsdTimeCode): void {
    const sgsi = this._appSceneIndices?.sceneGlobalsSceneIndex
    if (!sgsi) {
      return
    }
    sgsi.setCurrentFrame(time.GetValue())
  }

  /** engine.cpp:2268-2283 */
  setEnablePresentation(enabled: boolean): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._taskControllerSceneIndex.setEnablePresentation(enabled)
  }

  /** engine.cpp:2285-2305 */
  setPresentationOutput(api: string, framebuffer: unknown): void {
    if (!this._renderer) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }
    this._userFramebuffer = framebuffer
    this._taskControllerSceneIndex.setPresentationOutput(api, framebuffer)
  }

  //--------------------------------------------------------------------------
  // Control of background rendering threads.
  //--------------------------------------------------------------------------

  /** engine.cpp:2335-2400 */
  isPauseRendererSupported(): boolean { return this._getLegacyRenderControl()?.isPauseSupported() ?? false }
  pauseRenderer(): boolean { return this._getLegacyRenderControl()?.pause() ?? false }
  resumeRenderer(): boolean { return this._getLegacyRenderControl()?.resume() ?? false }
  isStopRendererSupported(): boolean { return this._getLegacyRenderControl()?.isStopSupported() ?? false }
  stopRenderer(): boolean { return this._getLegacyRenderControl()?.Stop() ?? false }
  restartRenderer(): boolean { return this._getLegacyRenderControl()?.restart() ?? false }

  //--------------------------------------------------------------------------
  // Color Correction
  //--------------------------------------------------------------------------

  /** engine.cpp:2404-2432 */
  setColorCorrectionSettings(colorCorrectionMode: string, ocioDisplay = '', ocioView = '',
    ocioColorSpace = '', ocioLook = ''): void {
    if (!this._renderer || !UsdImagingGLEngine.isColorCorrectionCapable()) {
      return
    }
    if (!this._taskControllerSceneIndex) {
      TF_CODING_ERROR('No task controller scene index.')
      return
    }

    const hdParams = new HdxColorCorrectionTaskParams()
    hdParams.colorCorrectionMode = TfToken(colorCorrectionMode)
    hdParams.displayOCIO = ocioDisplay
    hdParams.viewOCIO = ocioView
    hdParams.colorspaceOCIO = ocioColorSpace
    hdParams.looksOCIO = ocioLook

    this._taskControllerSceneIndex.setColorCorrectionParams(hdParams)
  }

  /** engine.cpp:2434-2438 */
  static isColorCorrectionCapable(): boolean {
    return true
  }

  //--------------------------------------------------------------------------
  // Resource Information
  //--------------------------------------------------------------------------

  /** engine.cpp:2444-2453 */
  getRenderStats(): Readonly<Record<string, unknown>> {
    return this._getLegacyRenderControl()?.getRenderStats() ?? {}
  }

  /** engine.cpp:2455-2464 (see the header for the divergence). */
  private _getOrCreateHgi(): Hgi | null {
    if (this._gpuEnabled && !this._hgi) {
      TF_CODING_ERROR('UsdImagingGLEngine: Hgi creation is asynchronous for '
        + 'WebGPU; pass the Hgi (HgiWebGPU.Create()) in Parameters.driver')
    }
    return this._hgi
  }

  /** engine.cpp:2466-2470 */
  getHgi(): Hgi | null {
    return this._getOrCreateHgi()
  }

  //--------------------------------------------------------------------------
  // Private/Protected
  //--------------------------------------------------------------------------

  /** engine.cpp:2476-2489 */
  private _execute(_params: UsdImagingGLRenderParams, taskPaths: readonly string[]): void {
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      renderControl.Execute(taskPaths)
    }
  }

  /** engine.cpp:2491-2508 */
  private _canPrepare(root: UsdPrim): boolean {
    if (!TF_VERIFY(root, 'Attempting to draw an invalid/null prim\n')) {
      return false
    }
    const rootPath = root.path
    if (!_HasPrefix(rootPath, this._rootPath)) {
      TF_CODING_ERROR(`Attempting to draw path <${rootPath}>, but engine is rooted`
        + `at <${this._rootPath}>\n`)
      return false
    }
    return true
  }

  /** engine.cpp:2546-2580 */
  private _preSetTime(params: UsdImagingGLRenderParams): void {
    const refineLevel = _GetRefineLevel(params.complexity)

    // The UsdImagingStageSceneIndex has no complexity opinion.
    // We provide a fallback value here for all prims.
    this._displayStyleSceneIndex!.setRefineLevelFallback(refineLevel)

    // The post instancing notice batching scene index will be flushed
    // after the stage notice batching scene index (if one exists).
    _WithHydraNoticeBatch(this._usdImagingSceneIndex!.getPostInstancingNoticeBatchingSceneIndex(), () => {
      this._usdImagingSceneIndex!.ApplyPendingUpdates()
      if (this._execStageSceneIndex) {
        this._execStageSceneIndex.ApplyPendingUpdates()
        this._noticeBatchingStageSceneIndex!.flush()
      }
    })
  }

  /** engine.cpp:2581-2586 */
  private _postSetTime(_params: UsdImagingGLRenderParams): void {}

  /** engine.cpp:2588-2656 */
  private static _updateHydraCollection(collection: HdRprimCollection, roots: readonly string[],
    params: UsdImagingGLRenderParams): boolean {
    // choose repr
    let reprSelector = new HdReprSelector(HdReprTokens.smoothHull)
    if (params.drawMode === UsdImagingGLDrawMode.DRAW_POINTS) {
      reprSelector = new HdReprSelector(HdReprTokens.points)
    } else if (params.drawMode === UsdImagingGLDrawMode.DRAW_GEOM_FLAT ||
      params.drawMode === UsdImagingGLDrawMode.DRAW_SHADED_FLAT) {
      // Flat shading
      reprSelector = new HdReprSelector(HdReprTokens.hull)
    } else if (params.drawMode === UsdImagingGLDrawMode.DRAW_WIREFRAME_ON_SURFACE) {
      // Wireframe on surface
      reprSelector = new HdReprSelector(HdReprTokens.refinedWireOnSurf)
    } else if (params.drawMode === UsdImagingGLDrawMode.DRAW_WIREFRAME) {
      // Wireframe
      reprSelector = new HdReprSelector(HdReprTokens.refinedWire)
    } else {
      // Smooth shading
      reprSelector = new HdReprSelector(HdReprTokens.refined)
    }

    // By default our main collection will be called geometry
    const colName = HdTokens.geometry

    // Check if the collection needs to be updated (so we can avoid the sort).
    const oldRoots = collection.getRootPaths()

    // inexpensive comparison first
    let match = collection.getName() === colName &&
      oldRoots.length === roots.length &&
      collection.getReprSelector().Equals(reprSelector)

    // Only take the time to compare root paths if everything else matches.
    if (match) {
      // Note that oldRoots is guaranteed to be sorted.
      for (let i = 0; i < roots.length; i++) {
        // Avoid binary search when both vectors are sorted.
        if (oldRoots[i] === roots[i]) {
          continue
        }
        // Binary search to find the current root.
        if (!oldRoots.includes(roots[i]!)) {
          match = false
          break
        }
      }

      // if everything matches, do nothing.
      if (match) return false
    }

    // Recreate the collection.
    const fresh = new HdRprimCollection(colName, reprSelector)
    fresh.setRootPaths([...roots])
    collection.setName(fresh.getName())
    collection.setReprSelector(fresh.getReprSelector())
    collection.setForcedRepr(fresh.isForcedRepr())
    collection.setMaterialTag(fresh.getMaterialTag())
    collection.setRootPaths([...fresh.getRootPaths()])
    collection.setExcludePaths([...fresh.getExcludePaths()])
    return true
  }

  /** engine.cpp:2658-2710 */
  private static _makeHydraUsdImagingGLRenderParams(renderParams: UsdImagingGLRenderParams): HdxRenderTaskParams {
    // Note this table is dangerous and making changes to the order of the
    // enums in UsdImagingGLCullStyle, will affect this with no compiler help.
    const USD_2_HD_CULL_STYLE: readonly HdCullStyle[] = [
      HdCullStyle.HdCullStyleDontCare,              // Cull No Opinion (unused)
      HdCullStyle.HdCullStyleNothing,               // CULL_STYLE_NOTHING,
      HdCullStyle.HdCullStyleBack,                  // CULL_STYLE_BACK,
      HdCullStyle.HdCullStyleFront,                 // CULL_STYLE_FRONT,
      HdCullStyle.HdCullStyleBackUnlessDoubleSided, // CULL_STYLE_BACK_UNLESS_DOUBLE_SIDED
    ]

    const params = new HdxRenderTaskParams()

    params.overrideColor = renderParams.overrideColor
    params.wireframeColor = renderParams.wireframeColor

    if (renderParams.drawMode === UsdImagingGLDrawMode.DRAW_GEOM_ONLY ||
      renderParams.drawMode === UsdImagingGLDrawMode.DRAW_POINTS) {
      params.enableLighting = false
    } else {
      params.enableLighting = renderParams.enableLighting
    }

    params.depthBiasUseDefault = true
    params.depthFunc = HdCompareFunction.HdCmpFuncLess
    params.cullStyle = USD_2_HD_CULL_STYLE[renderParams.cullStyle]!

    if (renderParams.alphaThreshold < 0.0) {
      // If no alpha threshold is set, use default of 0.1.
      params.alphaThreshold = Math.fround(0.1)
    } else {
      params.alphaThreshold = renderParams.alphaThreshold
    }

    params.enableSceneLights = renderParams.enableSceneLights

    // We don't provide the following because task controller ignores them:
    // - params.camera
    // - params.viewport

    return params
  }

  /** engine.cpp:2712-2731 */
  private static _computeRenderTags(params: UsdImagingGLRenderParams): string[] {
    // Calculate the rendertags needed based on the parameters passed by
    // the application
    const renderTags: string[] = []
    renderTags.push(HdRenderTagTokens.geometry)
    if (params.showGuides) {
      renderTags.push(HdRenderTagTokens.guide)
    }
    if (params.showProxy) {
      renderTags.push(HdRenderTagTokens.proxy)
    }
    if (params.showRender) {
      renderTags.push(HdRenderTagTokens.render)
    }
    return renderTags
  }

  /** engine.cpp:2733-2758. HD_DEFAULT_RENDERER is an environment variable
   *  upstream; there is no process environment here, so it reads as unset. */
  private static _getDefaultRendererPluginId(): string {
    return ''
  }

  /** engine.cpp:2773-2777 */
  private _getTerminalSceneIndex(): HdSceneIndexBase | null {
    return this._terminalSceneIndex
  }

  /** engine.cpp:2779-2795 */
  private _getLegacyRenderControl(): HdLegacyRenderControlInterface | null {
    if (!this._renderer) {
      return null
    }
    const renderer = this._renderer.Get()
    if (!renderer) {
      return null
    }
    const renderControl = renderer.getLegacyRenderControl()
    if (!renderControl) {
      TF_CODING_ERROR('Expected render control interface.')
    }
    return renderControl
  }

  /** engine.cpp:2805-2829 */
  private _getSceneIndexPrimPathFromPrimId(primId: number): string {
    const si = this._getTerminalSceneIndex()
    if (!si) {
      return ''
    }

    // Prefer prim id from terminal scene index.
    const ds = HdSceneGlobalsSchema.getFromSceneIndex(si)
      .getPrimIdToPath()
      .getElement(primId)
    if (ds) {
      return ds.getTypedValue(0.0) as string
    }

    // Fall back to the render index's own prim id table.
    const renderControl = this._getLegacyRenderControl()
    if (renderControl) {
      return renderControl.getRprimPathFromPrimId(primId)
    }
    return ''
  }

  /** engine.cpp:2831-2883 */
  pollForAsynchronousUpdates(): boolean {
    if (this._allowAsynchronousSceneProcessing) {
      const si = this._getTerminalSceneIndex()
      if (si) {
        let changed = false
        const ob: HdSceneIndexObserver = {
          primsAdded: () => { changed = true },
          primsRemoved: () => { changed = true },
          primsDirtied: () => { changed = true },
          primsRenamed: () => { changed = true },
        }
        si.addObserver(ob)
        _SystemMessage(si, _systemMessageTokens.asyncPoll)
        si.removeObserver(ob)
        return changed
      }
    }
    return false
  }

  /** engine.cpp:2885-2907: always true here (see the header). */
  static useUsdImagingSceneIndex(): boolean {
    return true
  }

  /** Test seam (see _AppSceneIndices._ResetRegistration). */
  static _resetAppSceneIndicesRegistration(): void { _AppSceneIndices._resetRegistration() }

  /** The terminal scene index, for tests and tools (upstream's
   *  _GetTerminalSceneIndex is protected and used by subclasses). */
  _getTerminalSceneIndexForTesting(): HdSceneIndexBase | null { return this._terminalSceneIndex }
  /** The task controller scene index (protected upstream). */
  _getTaskControllerSceneIndexForTesting(): HdxTaskControllerSceneIndex | null { return this._taskControllerSceneIndex }
  /** The renderer's render index, for tests and tools. */
  _getRenderIndexForTesting(): unknown { return this._getRenderIndex() }
  /** The render index of the renderer (HdRenderDelegateAdapterRenderer). */
  private _getRenderIndex(): unknown {
    const renderer = this._renderer?.Get() as unknown as { _getRenderIndex?(): unknown } | null | undefined
    return renderer?._getRenderIndex?.() ?? null
  }
  /** The last user framebuffer given to SetPresentationOutput. */
  _getUserFramebufferForTesting(): unknown { return this._userFramebuffer }
}

// --- helpers ----------------------------------------------------------------

/** hd/systemMessages.h HdSystemMessageTokens */
const _systemMessageTokens = { asyncAllow: 'asyncAllow', asyncPoll: 'asyncPoll' }

/** HdSceneIndexBase::SystemMessage (hd/sceneIndex.h:129-134) is not ported
 *  in hd; scene indices that implement it are called. */
function _SystemMessage(si: HdSceneIndexBase, messageType: string): void {
  (si as unknown as { systemMessage?(t: string, args: undefined): void }).systemMessage?.(messageType, undefined)
}

function _HasPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(prefix + '/')
}

/** SdfPath::ReplacePrefix */
function _ReplacePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (oldPrefix === newPrefix || !_HasPrefix(path, oldPrefix)) return path
  const rest = oldPrefix === '/' ? path.slice(1) : path.slice(oldPrefix.length + 1)
  if (rest === '') return newPrefix
  return newPrefix === '/' ? '/' + rest : newPrefix + '/' + rest
}

/** SdfPath::AppendChild */
function _AppendChild(parent: string, name: string): string {
  return parent === '/' ? '/' + name : parent + '/' + name
}

/** TfMakeValidIdentifier */
function _MakeValidIdentifier(s: string): string {
  if (s === '') return '_'
  let out = s.replace(/[^A-Za-z0-9_]/g, '_')
  if (/^[0-9]/.test(out)) out = '_' + out.slice(1)
  return out
}

function _ToVtValue(value: unknown): VtValue {
  if (value === undefined || value === null) return VtValue.getEmpty()
  if (typeof value === 'boolean') return VtValue.create(value, VtValueTypes.bool)
  if (typeof value === 'string') return VtValue.create(value, VtValueTypes.string)
  if (typeof value === 'number') return VtValue.create(value, Number.isInteger(value) ? VtValueTypes.int : VtValueTypes.float)
  return VtValue.getEmpty()
}
