// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The adapter "Types" entries of pxr/usdImaging/usdImaging/plugInfo.json
// (OpenUSD 26.11.1), registered with UsdImagingAdapterRegistry (see
// adapterRegistry.ts for why they are registered from code). Entries for
// adapters that are not ported:
//   UsdImagingDrawModeAdapter, UsdImagingHermiteCurvesAdapter
//
// Its HdSceneIndexPlugin "Types" entry (plugInfo.json:349-370,
// UsdImaging_RenderPassPruneSceneIndexPlugin, loaded with every renderer) is
// registered with typescript-usd/plug below, as upstream discovers the
// installed plugInfo.json; renderPassPruneSceneIndexPlugin.ts defines the
// type's factory and registration. The plugin is registered without a
// plugInfo URL, so PlugPlugin treats it as part of this build, already
// loaded (plug/src/plugin.ts).

import { UsdImagingBackPlateAPIAdapter } from './backPlateAPIAdapter.ts'
import { UsdImagingBasisCurvesAdapter } from './basisCurvesAdapter.ts'
import { UsdImagingCameraAdapter } from './cameraAdapter.ts'
import { UsdImagingCapsuleAdapter } from './capsuleAdapter.ts'
import { UsdImagingCollectionAPIAdapter } from './collectionAPIAdapter.ts'
import { UsdImagingConeAdapter } from './coneAdapter.ts'
import { UsdImagingCoordSysAPIAdapter } from './coordSysAPIAdapter.ts'
import { UsdImagingCoordSysAdapter } from './coordSysAdapter.ts'
import { UsdImagingCubeAdapter } from './cubeAdapter.ts'
import { UsdImagingCylinderAdapter } from './cylinderAdapter.ts'
import { UsdImagingCylinderLightAdapter } from './cylinderLightAdapter.ts'
import { UsdImagingDiskLightAdapter } from './diskLightAdapter.ts'
import { UsdImagingDistantLightAdapter } from './distantLightAdapter.ts'
import { UsdImagingDomeLightAdapter } from './domeLightAdapter.ts'
import { UsdImagingDomeLight_1Adapter } from './domeLight_1Adapter.ts'
import { UsdImagingGeomModelAPIAdapter } from './geomModelAPIAdapter.ts'
import { UsdImagingGeomSubsetAdapter } from './geomSubsetAdapter.ts'
import { UsdImagingGeometryLightAdapter } from './geometryLightAdapter.ts'
import { UsdImagingLightAPIAdapter } from './lightAPIAdapter.ts'
import { UsdImagingLightAdapter } from './lightAdapter.ts'
import { UsdImagingLightFilterAdapter } from './lightFilterAdapter.ts'
import { UsdImagingMaterialAdapter, UsdImagingNodeGraphAdapter, UsdImagingShaderAdapter } from './materialAdapter.ts'
import { UsdImagingMaterialBindingAPIAdapter } from './materialBindingAPIAdapter.ts'
import { UsdImagingMeshAdapter } from './meshAdapter.ts'
import { UsdImagingMotionAPIAdapter } from './motionAPIAdapter.ts'
import { UsdImagingNurbsCurvesAdapter } from './nurbsCurvesAdapter.ts'
import { UsdImagingNurbsPatchAdapter } from './nurbsPatchAdapter.ts'
import { UsdImagingPlaneAdapter } from './planeAdapter.ts'
import { UsdImagingPluginLightAdapter } from './pluginLightAdapter.ts'
import { UsdImagingPluginLightFilterAdapter } from './pluginLightFilterAdapter.ts'
import { UsdImagingPointInstancerAdapter } from './pointInstancerAdapter.ts'
import { UsdImagingPointsAdapter } from './pointsAdapter.ts'
import { UsdImagingPortalLightAdapter } from './portalLightAdapter.ts'
import { UsdImagingRectLightAdapter } from './rectLightAdapter.ts'
import { UsdImagingRenderPassAdapter } from './renderPassAdapter.ts'
import { UsdImagingRenderProductAdapter } from './renderProductAdapter.ts'
import { UsdImagingRenderSettingsAdapter } from './renderSettingsAdapter.ts'
import { UsdImagingRenderVarAdapter } from './renderVarAdapter.ts'
import { UsdImagingSphereAdapter } from './sphereAdapter.ts'
import { UsdImagingSphereLightAdapter } from './sphereLightAdapter.ts'
import { UsdImagingTetMeshAdapter } from './tetMeshAdapter.ts'
import { UsdImagingVolumeAdapter } from './volumeAdapter.ts'
import { UsdImagingAdapterRegistry } from './adapterRegistry.ts'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import './renderPassPruneSceneIndexPlugin.ts'

/** plugInfo.json:1-5, 349-380: the scene index plugin Types. */
export const UsdImaging_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {
        Types: {
          UsdImaging_RenderPassPruneSceneIndexPlugin: {
            bases: ['HdSceneIndexPlugin'],
            loadWithRenderer: '',
            priority: 0,
            displayName: 'Render Pass Prune Scene Index',
            tags: ['usdImaging:renderPassPrune'],
            ordering: {
              after: ['hd:sceneAssembly', 'hd:sceneGlobals'],
              before: 'hdGp:proceduralResolution',
            },
          },
        },
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'usdImaging',
      ResourcePath: '@PLUG_INFO_RESOURCE_PATH@',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

PlugRegistry.GetInstance().RegisterPlugins(UsdImaging_PlugInfo)

UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingBackPlateAPIAdapter', isInternal: true, apiSchemaName: 'BackPlateAPI', apiSchemaAdapterFactory: () => new UsdImagingBackPlateAPIAdapter() },
  { typeName: 'UsdImagingBasisCurvesAdapter', isInternal: true, primTypeName: 'BasisCurves', primAdapterFactory: () => new UsdImagingBasisCurvesAdapter() },
  { typeName: 'UsdImagingCameraAdapter', isInternal: true, primTypeName: 'Camera', primAdapterFactory: () => new UsdImagingCameraAdapter() },
  { typeName: 'UsdImagingCapsuleAdapter', isInternal: true, primTypeName: 'Capsule', includeSchemaFamily: true, primAdapterFactory: () => new UsdImagingCapsuleAdapter() },
  { typeName: 'UsdImagingCollectionAPIAdapter', isInternal: true, apiSchemaName: 'CollectionAPI', apiSchemaAdapterFactory: () => new UsdImagingCollectionAPIAdapter() },
  { typeName: 'UsdImagingConeAdapter', isInternal: true, primTypeName: 'Cone', primAdapterFactory: () => new UsdImagingConeAdapter() },
  { typeName: 'UsdImagingCoordSysAdapter', isInternal: true, primTypeName: 'coordSys', primAdapterFactory: () => new UsdImagingCoordSysAdapter() },
  { typeName: 'UsdImagingCoordSysAPIAdapter', isInternal: true, apiSchemaName: 'CoordSysAPI', apiSchemaAdapterFactory: () => new UsdImagingCoordSysAPIAdapter() },
  { typeName: 'UsdImagingCubeAdapter', isInternal: true, primTypeName: 'Cube', primAdapterFactory: () => new UsdImagingCubeAdapter() },
  { typeName: 'UsdImagingCylinderAdapter', isInternal: true, primTypeName: 'Cylinder', includeSchemaFamily: true, primAdapterFactory: () => new UsdImagingCylinderAdapter() },
  { typeName: 'UsdImagingGeomSubsetAdapter', isInternal: true, primTypeName: 'GeomSubset', primAdapterFactory: () => new UsdImagingGeomSubsetAdapter() },
  { typeName: 'UsdImagingMaterialAdapter', isInternal: true, primTypeName: 'Material', primAdapterFactory: () => new UsdImagingMaterialAdapter() },
  { typeName: 'UsdImagingShaderAdapter', isInternal: true, primTypeName: 'Shader', primAdapterFactory: () => new UsdImagingShaderAdapter() },
  { typeName: 'UsdImagingNodeGraphAdapter', isInternal: true, primTypeName: 'NodeGraph', primAdapterFactory: () => new UsdImagingNodeGraphAdapter() },
  { typeName: 'UsdImagingMaterialBindingAPIAdapter', isInternal: true, apiSchemaName: 'MaterialBindingAPI', apiSchemaAdapterFactory: () => new UsdImagingMaterialBindingAPIAdapter() },
  { typeName: 'UsdImagingMeshAdapter', isInternal: true, primTypeName: 'Mesh', primAdapterFactory: () => new UsdImagingMeshAdapter() },
  { typeName: 'UsdImagingMotionAPIAdapter', isInternal: true, apiSchemaName: 'MotionAPI', apiSchemaAdapterFactory: () => new UsdImagingMotionAPIAdapter() },
  { typeName: 'UsdImagingTetMeshAdapter', isInternal: true, primTypeName: 'TetMesh', primAdapterFactory: () => new UsdImagingTetMeshAdapter() },
  { typeName: 'UsdImagingNurbsCurvesAdapter', isInternal: true, primTypeName: 'NurbsCurves', primAdapterFactory: () => new UsdImagingNurbsCurvesAdapter() },
  { typeName: 'UsdImagingNurbsPatchAdapter', isInternal: true, primTypeName: 'NurbsPatch', primAdapterFactory: () => new UsdImagingNurbsPatchAdapter() },
  { typeName: 'UsdImagingPlaneAdapter', isInternal: true, primTypeName: 'Plane', primAdapterFactory: () => new UsdImagingPlaneAdapter() },
  { typeName: 'UsdImagingPointsAdapter', isInternal: true, primTypeName: 'Points', primAdapterFactory: () => new UsdImagingPointsAdapter() },
  { typeName: 'UsdImagingPointInstancerAdapter', isInternal: true, primTypeName: 'PointInstancer', primAdapterFactory: () => new UsdImagingPointInstancerAdapter() },
  { typeName: 'UsdImagingSphereAdapter', isInternal: true, primTypeName: 'Sphere', primAdapterFactory: () => new UsdImagingSphereAdapter() },
  { typeName: 'UsdImagingRenderPassAdapter', isInternal: true, primTypeName: 'RenderPass', primAdapterFactory: () => new UsdImagingRenderPassAdapter() },
  { typeName: 'UsdImagingRenderSettingsAdapter', isInternal: true, primTypeName: 'RenderSettings', primAdapterFactory: () => new UsdImagingRenderSettingsAdapter() },
  { typeName: 'UsdImagingRenderProductAdapter', isInternal: true, primTypeName: 'RenderProduct', primAdapterFactory: () => new UsdImagingRenderProductAdapter() },
  { typeName: 'UsdImagingRenderVarAdapter', isInternal: true, primTypeName: 'RenderVar', primAdapterFactory: () => new UsdImagingRenderVarAdapter() },
  { typeName: 'UsdImagingVolumeAdapter', isInternal: true, primTypeName: 'Volume', primAdapterFactory: () => new UsdImagingVolumeAdapter() },
  { typeName: 'UsdImagingLightAdapter', isInternal: true, primTypeName: 'LightAPI', includeDerivedPrimTypes: true, primAdapterFactory: () => new UsdImagingLightAdapter() },
  { typeName: 'UsdImagingLightAPIAdapter', isInternal: true, apiSchemaName: 'LightAPI', apiSchemaAdapterFactory: () => new UsdImagingLightAPIAdapter() },
  { typeName: 'UsdImagingLightFilterAdapter', isInternal: true, primTypeName: 'LightFilter', includeDerivedPrimTypes: true, primAdapterFactory: () => new UsdImagingLightFilterAdapter() },
  { typeName: 'UsdImagingDomeLightAdapter', isInternal: true, primTypeName: 'DomeLight', primAdapterFactory: () => new UsdImagingDomeLightAdapter() },
  { typeName: 'UsdImagingDomeLight_1Adapter', isInternal: true, primTypeName: 'DomeLight_1', primAdapterFactory: () => new UsdImagingDomeLight_1Adapter() },
  { typeName: 'UsdImagingRectLightAdapter', isInternal: true, primTypeName: 'RectLight', primAdapterFactory: () => new UsdImagingRectLightAdapter() },
  { typeName: 'UsdImagingSphereLightAdapter', isInternal: true, primTypeName: 'SphereLight', primAdapterFactory: () => new UsdImagingSphereLightAdapter() },
  { typeName: 'UsdImagingCylinderLightAdapter', isInternal: true, primTypeName: 'CylinderLight', primAdapterFactory: () => new UsdImagingCylinderLightAdapter() },
  { typeName: 'UsdImagingDiskLightAdapter', isInternal: true, primTypeName: 'DiskLight', primAdapterFactory: () => new UsdImagingDiskLightAdapter() },
  { typeName: 'UsdImagingDistantLightAdapter', isInternal: true, primTypeName: 'DistantLight', primAdapterFactory: () => new UsdImagingDistantLightAdapter() },
  { typeName: 'UsdImagingPluginLightAdapter', isInternal: true, primTypeName: 'PluginLight', primAdapterFactory: () => new UsdImagingPluginLightAdapter() },
  { typeName: 'UsdImagingGeometryLightAdapter', isInternal: true, primTypeName: 'GeometryLight', primAdapterFactory: () => new UsdImagingGeometryLightAdapter() },
  { typeName: 'UsdImagingPortalLightAdapter', isInternal: true, primTypeName: 'PortalLight', primAdapterFactory: () => new UsdImagingPortalLightAdapter() },
  { typeName: 'UsdImagingPluginLightFilterAdapter', isInternal: true, primTypeName: 'PluginLightFilter', primAdapterFactory: () => new UsdImagingPluginLightFilterAdapter() },
  { typeName: 'UsdImagingGeomModelAPIAdapter', isInternal: true, apiSchemaName: 'GeomModelAPI', apiSchemaAdapterFactory: () => new UsdImagingGeomModelAPIAdapter() },
])
