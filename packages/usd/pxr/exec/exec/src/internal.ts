// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginData.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/exec/_internal — interim, non-public API (packages/usd/AGENTS.md
// "Interim APIs"), kept out of the typescript-usd/exec barrel.
// FAITHFULNESS-DEBT(openexec-plugin-load): upstream loads an Exec plugin
// synchronously and lazily (exec/pluginData.cpp:42-52); on the web, callers
// await this before compiling (docs/openexec-x1.md decision D4).
export { _interim_ExecLoadPluginsAsync } from './pluginData.ts'
