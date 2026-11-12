// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The adapter "Types" entries of pxr/usdImaging/usdSkelImaging/plugInfo.json
// (OpenUSD 26.11.1), registered with UsdImagingAdapterRegistry (see
// usdImaging/src/adapterRegistry.ts for why they are registered from code).
// The UsdSkelImagingResolvingSceneIndexPlugin entry of the same plugInfo.json
// is registered by resolvingSceneIndexPlugin.ts.
//
// Like every plugin registration, this module must be loaded before
// UsdImagingAdapterRegistry is first used (before the first
// UsdImagingStageSceneIndex populates).

import { UsdImagingAdapterRegistry } from 'typescript-usd/usdImaging'
import { UsdSkelImagingAnimationAdapter } from './animationAdapter.ts'
import { UsdSkelImagingBindingAPIAdapter } from './bindingAPIAdapter.ts'
import { UsdSkelImagingBlendShapeAdapter } from './blendShapeAdapter.ts'
import { UsdSkelImagingSkelRootAdapter } from './skelRootAdapter.ts'
import { UsdSkelImagingSkeletonAdapter } from './skeletonAdapter.ts'

UsdImagingAdapterRegistry.registerTypes([
  // plugInfo.json:6-12
  { typeName: 'UsdSkelImagingSkeletonAdapter', isInternal: true, primTypeName: 'Skeleton', primAdapterFactory: () => new UsdSkelImagingSkeletonAdapter() },
  // plugInfo.json:13-20
  { typeName: 'UsdSkelImagingSkelRootAdapter', isInternal: true, primTypeName: 'SkelRoot', includeDerivedPrimTypes: true, primAdapterFactory: () => new UsdSkelImagingSkelRootAdapter() },
  // plugInfo.json:21-27
  { typeName: 'UsdSkelImagingAnimationAdapter', isInternal: true, primTypeName: 'SkelAnimation', primAdapterFactory: () => new UsdSkelImagingAnimationAdapter() },
  // plugInfo.json:28-34
  { typeName: 'UsdSkelImagingBindingAPIAdapter', isInternal: true, apiSchemaName: 'SkelBindingAPI', apiSchemaAdapterFactory: () => new UsdSkelImagingBindingAPIAdapter() },
  // plugInfo.json:35-41
  { typeName: 'UsdSkelImagingBlendShapeAdapter', isInternal: true, primTypeName: 'BlendShape', primAdapterFactory: () => new UsdSkelImagingBlendShapeAdapter() },
])
