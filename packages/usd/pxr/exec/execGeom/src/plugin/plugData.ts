// Ported from OpenUSD 26.11.1: pxr/base/plug/info.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/exec/execGeom/plugInfo.json (vendored in
// ../../plugin/plugInfo.json), with the CMake-configured fields resolved for
// this package: LibraryPath names the ES module that registers execGeom's
// computations (../xformable.ts, or ../xformable.js in the built package),
// relative to this module's URL, which src/plugin/registerPlugin.ts passes as
// the plugInfo URL. Root and ResourcePath (@PLUG_INFO_ROOT@,
// @PLUG_INFO_RESOURCE_PATH@) are left out: execGeom has no resources, and
// with no Root, LibraryPath resolves against the plugInfo URL's directory
// (Plug_RegistrationMetadata, pxr/base/plug/info.cpp:595-690).
import type { Info as PlugInfo } from 'typescript-usd/plug'

/** The plugInfo for a library module named `libraryPath`. */
export function ExecGeom_PlugInfo(libraryPath: string): PlugInfo {
  return {
    Plugins: [
      {
        Info: {
          Exec: {
            Schemas: {
              UsdGeomXformable: {
                allowsPluginComputations: true,
              },
              UsdGeomScope: {
                allowsPluginComputations: false,
              },
            },
          },
        },
        LibraryPath: libraryPath,
        Name: 'execGeom',
        Type: 'library',
      },
    ],
  }
}
