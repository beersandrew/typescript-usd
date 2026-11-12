// Ported from OpenUSD 26.11.1: pxr/base/plug/thisPlugin.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/plug/thisPlugin.h:16-30.
import { PlugRegistry } from './registry.ts'
import type { PlugPlugin } from './plugin.ts'

export function PlugThisPlugin(name: string): PlugPlugin | null {
  return PlugRegistry.GetInstance().GetPluginWithName(name)
}
