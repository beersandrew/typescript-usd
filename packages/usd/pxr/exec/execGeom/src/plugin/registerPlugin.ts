// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginData.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Registers the execGeom plugin (OpenUSD 26.11.1 pxr/exec/execGeom
// plugInfo.json) with typescript-usd/plug at import time: the TS analog of
// upstream discovering execGeom's plugInfo.json on the plugin path. Like
// upstream's, the plugin is a library plugin whose library is not loaded by
// registration: its "Exec" metadata tells Exec_PluginData that execGeom
// provides computations for UsdGeomXformable, and exec loads the library
// (PlugPlugin.LoadAsync imports ../xformable.ts) when it needs them
// (exec/pluginData.cpp; docs/openexec-x1.md decision D4:
// `_interim_ExecLoadPluginsAsync` from typescript-usd/exec/_internal loads it
// before compilation).
//
// The plugInfo URL is this module's URL, so LibraryPath resolves to the
// sibling module ../xformable.ts in the source tree and ../xformable.js in the
// built package.
//
// FAITHFULNESS-DEBT(openexec-plugin-bundling): the library is imported by URL
// (`import(url)`, base/plug/src/plugin.ts), which a bundler cannot follow; an
// application that bundles typescript-usd must serve xformable.js at that URL
// or substitute PlugRegistry's module importer -> a bundler-visible module
// reference for library plugins in typescript-usd/plug.

import 'typescript-usd/usdGeom'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { ExecGeom_PlugInfo } from './plugData.ts'

const _libraryPath = import.meta.url.endsWith('.ts') ? '../xformable.ts' : '../xformable.js'

PlugRegistry.GetInstance().RegisterPlugins(
  ExecGeom_PlugInfo(_libraryPath), undefined, { plugInfoUrl: import.meta.url })
