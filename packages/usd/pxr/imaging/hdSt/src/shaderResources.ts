// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfx.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The hdSt plugin registration that makes Storm's glslfx shader files
// available as plugin resources: pxr/imaging/hdSt/plugInfo.json's
// "ShaderResources": "shaders" (plugInfo.json:177) with the shader files of
// pxr/imaging/hdSt/shaders/ (OpenUSD 26.11.1) attached at registration.
//
// Upstream discovers hdSt/plugInfo.json on disk and opens its shader files by
// path (hio/glslfx.cpp:64-117,232-250); here the plugin is registered with its
// resources attached as inline strings, and HioGlslfx reads them through
// PlugRegistry (pxr/imaging/hio/src/glslfx.ts). ResourcePath is the virtual
// directory those resources live under, mirroring the installed
// lib/usd/hdSt/resources, so HdStPackage*() paths are
// '/usd/hdSt/resources/shaders/<file>' and '$TOOLS/hdSt/shaders/<file>'
// imports resolve to the same paths.
//
// Its "Types" entries (plugInfo.json:4-176) declare Storm's twelve scene index
// plugins, which HdSceneIndexPluginRegistry discovers through PlugRegistry
// and loads with the "GL" renderer (hd/src/sceneIndexPluginRegistry.ts); the
// plugin modules define the types' factories (./sceneIndexPlugins.ts).

import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { HdSt_ShaderResourceFiles } from './shaders.generated.ts'

/** hdSt/plugInfo.json (plugInfo.json:1-186). */
export const HdSt_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {
        Types: {
          "HdSt_DependencySceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Storm Dependency Scene Index",
            "tags": [
              "hdSt:phase100",
              "hdSt:renderDelegateDependencies"
            ],
            "ordering": {
              "after": "hdSt:phase4",
              "position": "firstAfter"
            }
          },
          "HdSt_DependencyForwardingSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Storm Dependency Forwarding Scene Index",
            "tags": [
              "hdSt:phase1000",
              "hdSt:dependencyForwarding"
            ],
            "ordering": {
              "after": [
                "hdSt:phase900",
                "hdSt:renderDelegateDependencies"
              ],
              "position": "lastBefore"
            }
          },
          "HdSt_MaterialBindingResolvingSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to resolve material bindings.",
            "tags": [
              "hdSt:phase0"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "position": "firstAfter"
            }
          },
          "HdSt_MaterialPrimvarTransferSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to transfer primvars from material to prim.",
            "tags": [
              "hdSt:phase3"
            ],
            "ordering": {
              "after": [
                "hdSt:phase0",
                "hdGp:proceduralResolution"
              ],
              "position": "firstAfter"
            }
          },
          "HdSt_NodeIdentifierResolvingSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to resolve nodeIdentifier from glslfx sourceAsset.",
            "tags": [
              "hdSt:phase0",
              "hdSt:NodeIdentifierResolving"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "position": "firstAfter"
            }
          },
          "HdSt_ImplicitSurfaceSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to turn implicit surfaces into prims suitable for Storm",
            "tags": [
              "hdSt:phase0"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "position": "firstAfter"
            }
          },
          "HdSt_NurbsApproximatingSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to resolve terminal names.",
            "tags": [
              "hdSt:phase0"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "position": "firstAfter"
            }
          },
          "HdSt_RenderPassVisibilitySceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to resolve render pass visibility rules.",
            "tags": [
              "hdSt:phase4"
            ],
            "ordering": {
              "after": [
                "hdSt:phase3",
                "hdGp:proceduralResolution",
                "hd:sceneGlobals"
              ],
              "position": "firstAfter"
            }
          },
          "HdSt_TetMeshConversionSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene Index to convert tet meshes into standard triangle based meshes.",
            "tags": [
              "hdSt:phase0"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "position": "firstAfter"
            }
          },
          "HdSt_UnboundMaterialPruningSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene index to prune materials that aren't bound.",
            "tags": [
              "hdSt:phase900"
            ],
            "ordering": {
              "after": "hdSt:phase100",
              "position": "firstAfter"
            }
          },
          "HdSt_BackPlateSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene index to convert back plates to meshes and materials",
            "tags": [
              "hdSt:phase0",
              "hdSt:backPlate"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "before": [
                "hdSt:NodeIdentifierResolving",
                "hdSt:dependencyForwarding"
              ],
              "position": "firstAfter"
            }
          },
          "HdSt_VelocityMotionResolvingSceneIndexPlugin": {
            "bases": [
              "HdSceneIndexPlugin"
            ],
            "loadWithRenderer": "GL",
            "priority": 0,
            "displayName": "Scene index to resolve velocity-based motion.",
            "tags": [
              "hdSt:phase0"
            ],
            "ordering": {
              "after": "hd:sceneAssembly",
              "before": "hdSt:phase4",
              "position": "lastBefore"
            }
          }
        },
        ShaderResources: 'shaders',
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'hdSt',
      ResourcePath: '/usd/hdSt/resources',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

/**
 * Register the hdSt plugin with its shader resources. Idempotent: PlugRegistry
 * ignores a second registration of the same plugin name.
 */
export function HdSt_RegisterShaderResources(): void {
  PlugRegistry.GetInstance().RegisterPlugins(HdSt_PlugInfo, {
    hdSt: { ...HdSt_ShaderResourceFiles, ...HdSt_TextureResourceFiles },
  })
}

/** pxr/imaging/hdSt/textures/ (OpenUSD 26.11.1), which HdStPackage
 *  FallbackDomeLightTexture() names (package.cpp:51-56): the 1x1 black PNG's
 *  bytes, a plugin resource file Ar resolves and opens
 *  (ar/src/platformFilesystem.ts) as the default resolver opens the
 *  installed file upstream. */
const HdSt_TextureResourceFiles: Record<string, Uint8Array> = {
  'textures/fallbackBlackDomeLight.png': new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
    0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 9, 112, 72, 89, 115,
    0, 0, 11, 19, 0, 0, 11, 19, 1, 0, 154, 156, 24, 0, 0, 0, 7, 116, 73, 77,
    69, 7, 230, 6, 8, 16, 42, 47, 158, 161, 221, 113, 0, 0, 0, 12, 73, 68, 65,
    84, 8, 215, 99, 96, 96, 96, 0, 0, 0, 4, 0, 1, 39, 52, 39, 10, 0, 0, 0, 0,
    73, 69, 78, 68, 174, 66, 96, 130,
  ]),
}
