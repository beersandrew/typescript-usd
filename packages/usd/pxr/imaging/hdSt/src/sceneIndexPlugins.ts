// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rendererPlugin.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Storm's scene index plugins (OpenUSD v26.11.1
// pxr/imaging/hdSt/*SceneIndexPlugin.cpp), part of the hdSt library.
// Importing a plugin module runs its TF_REGISTRY_FUNCTION blocks as loading
// hdSt runs them upstream: the TfType one defines the plugin type with its
// factory, and the HdSceneIndexPlugin one is a TfRegistryManager function
// that HdSceneIndexPluginRegistry runs when it subscribes
// (pxr/imaging/hd/src/sceneIndexPluginRegistry.ts). The registry discovers the
// types through the "Types" of hdSt/plugInfo.json (./shaderResources.ts) and
// loads them with the renderer they name ("loadWithRenderer": "GL").
//
// They are registered for the renderer display name "GL". Upstream a render
// delegate gets that name from HdRendererPlugin::CreateRenderDelegate
// (pxr/imaging/hd/rendererPlugin.cpp:74-78), which calls
// _SetRendererDisplayName with the "displayName" of the HdStormRendererPlugin
// entry in pxr/imaging/plugin/hdStorm/plugInfo.json. A render delegate
// constructed directly (as HdSt_TestDriver does) has an empty display name, so
// HdRenderIndex appends none of these plugins.

import './backPlateSceneIndexPlugin.ts'
import './dependencyForwardingSceneIndexPlugin.ts'
import './dependencySceneIndexPlugin.ts'
import './implicitSurfaceSceneIndexPlugin.ts'
import './materialBindingResolvingSceneIndexPlugin.ts'
import './materialPrimvarTransferSceneIndexPlugin.ts'
import './nodeIdentifierResolvingSceneIndexPlugin.ts'
import './nurbsApproximatingSceneIndexPlugin.ts'
import './renderPassVisibilitySceneIndexPlugin.ts'
import './tetMeshConversionSceneIndexPlugin.ts'
import './unboundMaterialPruningSceneIndexPlugin.ts'
import './velocityMotionResolvingSceneIndexPlugin.ts'
