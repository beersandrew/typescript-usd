// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdVolImaging/dataSourceParticleField.cpp,
//  pxr/usdImaging/usdVolImaging/particleFieldAdapter.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/usdVolImaging — OpenUSD v26.11.1 pxr/usdImaging/usdVolImaging.
// Importing this entry registers its prim adapters with the UsdImaging
// adapter registry, as loading the plugin does upstream
// (usdVolImaging/plugInfo.json: OpenVDBAsset and Field3DAsset, both
// UsdImagingFieldAdapter subclasses). Import it before the registry is
// first used (before the first UsdImagingStageSceneIndex is populated).
//
// Not ported: UsdImagingParticleFieldAdapter and its data source
// (particleFieldAdapter.cpp, dataSourceParticleField.cpp).
import { UsdImagingAdapterRegistry } from 'typescript-usd/usdImaging'
import { UsdImagingOpenVDBAssetAdapter } from './openvdbAssetAdapter.ts'
import { UsdImagingField3DAssetAdapter } from './field3dAssetAdapter.ts'

// usdVolImaging/plugInfo.json "Types".
UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingOpenVDBAssetAdapter', isInternal: true, primTypeName: 'OpenVDBAsset', primAdapterFactory: () => new UsdImagingOpenVDBAssetAdapter() },
  { typeName: 'UsdImagingField3DAssetAdapter', isInternal: true, primTypeName: 'Field3DAsset', primAdapterFactory: () => new UsdImagingField3DAssetAdapter() },
])

export { UsdImagingOpenVDBAssetAdapter as OpenVDBAssetAdapter } from './openvdbAssetAdapter.ts'
export { UsdImagingField3DAssetAdapter as Field3DAssetAdapter } from './field3dAssetAdapter.ts'
export {
  UsdImagingDataSourceFieldAsset as DataSourceFieldAsset,
  UsdImagingDataSourceFieldAssetPrim as DataSourceFieldAssetPrim,
} from './dataSourceFieldAsset.ts'
export { UsdVolImagingTokens as Tokens } from './tokens.ts'
