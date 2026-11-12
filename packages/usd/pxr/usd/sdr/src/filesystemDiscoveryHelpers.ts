// Ported from OpenUSD 26.11.1: pxr/usd/sdr/filesystemDiscoveryHelpers.cpp,
//  pxr/usd/sdr/filesystemDiscoveryHelpers.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdrFsHelpersSplitShaderIdentifier port from
// pxr/usd/sdr/filesystemDiscoveryHelpers.cpp.
import { SdrVersion } from './declare.ts'

export function splitShaderIdentifier(identifier: string): { function: string; name: string; version: SdrVersion } | null {
  const tokens = identifier.split('_').filter(Boolean)
  if (!tokens.length) return null
  const fn = tokens[0]!
  if (tokens.length === 1) return { function: identifier, name: identifier, version: new SdrVersion() }
  if (tokens.length === 2) return /^\d+$/.test(tokens[1]!)
    ? { function: fn, name: fn, version: new SdrVersion(Number(tokens[1])) }
    : { function: fn, name: identifier, version: new SdrVersion() }
  const last = /^\d+$/.test(tokens.at(-1)!)
  const penultimate = /^\d+$/.test(tokens.at(-2)!)
  if (penultimate && !last) return null
  if (penultimate) return { function: fn, name: tokens.slice(0, -2).join('_'), version: new SdrVersion(Number(tokens.at(-2)), Number(tokens.at(-1))) }
  if (last) return { function: fn, name: tokens.slice(0, -1).join('_'), version: new SdrVersion(Number(tokens.at(-1))) }
  return { function: fn, name: identifier, version: new SdrVersion() }
}
