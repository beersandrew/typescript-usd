// typescript-usd/usdExecImaging — pxr/usdImaging/usdExecImaging (OpenUSD
// 26.11.1): the exec scene index that UsdImagingGLEngine merges above the
// UsdImaging stage scene index when USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX
// is set. Importing this entry registers the usdExecImaging plugin and the
// UsdExecImaging_StageSceneIndex TfType factory (plugInfo.ts,
// stageSceneIndex.ts), as loading the library does upstream.
import './plugInfo.ts'
// CMakeLists.txt PUBLIC_CLASSES and PUBLIC_HEADERS.
export {
  UsdExecImaging_ComputedDataSourceImpl, UsdExecImagingComputedSampledDataSource,
  UsdExecImagingComputedTypedSampledDataSource,
} from './computedDataSource.ts'
export { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
export {
  UsdExecImagingRequestAccessorInterface, type UsdExecImagingRequestAccessorInterfaceSharedPtr,
} from './requestAccessorInterface.ts'
export { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
export { UsdExecImagingValueKey } from './valueKey.ts'
// CMakeLists.txt PRIVATE_CLASSES and PRIVATE_HEADERS (underscore-prefixed
// upstream names; exported for tests and for the factory registration).
export { UsdExecImaging_AdapterRegistry, USDEXECIMAGING_ENABLE_USDGEOM_XFORMABLE_ADAPTER } from './adapterRegistry.ts'
export { UsdExecImagingDebugCodes } from './debugCodes.ts'
export { UsdExecImaging_GeomXformablePrimAdapter } from './geomXformablePrimAdapter.ts'
export { UsdExecImaging_IrXformablePrimAdapter } from './irXformablePrimAdapter.ts'
export { UsdExecImaging_Request, type UsdExecImaging_RequestSharedPtr } from './request.ts'
export { UsdExecImaging_RequestBuilder } from './requestBuilder.ts'
export { UsdExecImaging_StageSceneIndex, UsdExecImaging_StageSceneIndexType } from './stageSceneIndex.ts'
export { UsdExecImaging_ValueKeyMap, type UsdExecImaging_ValueKeyInfo } from './valueKeyMap.ts'
export { UsdExecImaging_ValueKeyMapKey } from './valueKey.ts'
