// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/profileRegistry.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Usd_ProfilesRegistryTestClear / Usd_ProfilesRegistryTestLoadFromFile
// (profileRegistry.cpp:1140-1152): test access, not public API. The web has
// no file system, so the caller reads the file and passes its text
// (undefined when it could not be read).
import './plugin/registerPlugin.ts'
import { UsdProfileRegistry } from './profileRegistry.ts'

export function Usd_ProfilesRegistryTestClear(): void {
  UsdProfileRegistry._testClear()
}

export function Usd_ProfilesRegistryTestLoadFromFile(
  filePath: string, text: string | undefined, errors?: string[],
): boolean {
  return UsdProfileRegistry._testLoad(filePath, text, errors)
}
