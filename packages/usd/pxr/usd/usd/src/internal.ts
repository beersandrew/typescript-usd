// Deliberately internal seams for Usd architecture tests and cross-package
// implementation. This module is not part of typescript-usd/usd's public barrel.

import type { Stage } from './stage.ts'

export { _resolverContextForResolver, _setResolverForTest } from 'typescript-usd/ar/_internal'
export {
  Asset as ArAsset,
  DefaultResolver as ArDefaultResolver,
  GetResolver as ArGetResolver,
  InMemoryAsset as ArInMemoryAsset,
  ResolvedPath as ArResolvedPath,
  Resolver as ArResolver,
  ResolverContext as ArResolverContext,
} from 'typescript-usd/ar'
export { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
export {
  Layer,
  AnimationBlock as SdfAnimationBlock,
  AssetPath as SdfAssetPath,
  LayerStateDelegateBase as SdfLayerStateDelegateBase,
  SimpleLayerStateDelegate as SdfSimpleLayerStateDelegate,
  ValueBlock as SdfValueBlock,
  type LayerFileFormatReader,
} from 'typescript-usd/sdf'
export type {
  LayerAccess as SdfLayerAccess,
  SpecType as SdfSpecType,
} from 'typescript-usd/sdf'
export {
  joinPackagePath,
  readAsset,
  resolveAssetPath,
  splitPackagePath,
} from 'typescript-usd/sdf/_internal'
export { Spline as TsSpline } from 'typescript-usd/ts'
export { usdTransformSpline } from './interpolators.ts'

export type UsdQueryEventKind = 'valueResolution'

export interface UsdQueryEvent {
  readonly kind: UsdQueryEventKind
  readonly path: string
}

type UsdQueryObserver = (event: UsdQueryEvent) => void

const queryObservers = new WeakMap<Stage, UsdQueryObserver>()

/** @internal Installs stage-local query instrumentation without a public counter. */
export function _setUsdQueryObserver(
  stage: Stage, observer: UsdQueryObserver | undefined,
): void {
  if (observer) queryObservers.set(stage, observer)
  else queryObservers.delete(stage)
}

/** @internal Whether query instrumentation is installed on the stage. */
export function _hasUsdQueryObserver(stage: Stage): boolean {
  return queryObservers.has(stage)
}

/** @internal Records work owned by Usd, never by the retained Pcp cache. */
export function _recordUsdQueryEvent(stage: Stage, event: UsdQueryEvent): void {
  queryObservers.get(stage)?.(event)
}

export {_getUsdResolveInfoResult} from './resolveInfo.ts'
export { usdGenSchemaCode, withCustomCode, CUSTOM_CODE_MARKER } from './usdGenSchemaCodegen.ts'
