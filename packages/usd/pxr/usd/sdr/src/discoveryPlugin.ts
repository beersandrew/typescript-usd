// Ported from OpenUSD 26.11.1: pxr/usd/sdr/discoveryPlugin.cpp,
//  pxr/usd/sdr/discoveryPlugin.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { SdrShaderNodeDiscoveryResult } from './shaderNode.ts'
import { splitShaderIdentifier } from './filesystemDiscoveryHelpers.ts'

// Filesystem traversal and discovery-result construction follow
// filesystemDiscoveryHelpers.cpp:34-125.

export { splitShaderIdentifier } from './filesystemDiscoveryHelpers.ts'

export function discoverShaderNodes(searchPaths: string[], allowedExtensions: string[], followSymlinks = true): SdrShaderNodeDiscoveryResult[] {
  const allowed = new Set(allowedExtensions.map(extension => extension.toLowerCase().replace(/^\./, '')))
  const seen = new Set<string>()
  const found: SdrShaderNodeDiscoveryResult[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const uri = path.join(directory, entry.name)
      if (entry.isDirectory()) { visit(uri); continue }
      if (followSymlinks) {
        try { if (statSync(uri).isDirectory()) { visit(uri); continue } } catch { continue }
      }
      const dot = entry.name.lastIndexOf('.')
      const extension = dot < 0 ? '' : entry.name.slice(dot + 1).toLowerCase()
      if (!allowed.has(extension)) continue
      const identifier = dot < 0 ? entry.name : entry.name.slice(0, dot)
      const split = splitShaderIdentifier(identifier)
      const key = `${identifier}-${extension}`
      if (!split || seen.has(key)) continue
      seen.add(key)
      found.push({ identifier, version: split.version.getAsDefault(), name: split.name, function: split.function, discoveryType: extension, sourceType: '', uri, resolvedUri: path.resolve(uri) })
    }
  }
  for (const searchPath of searchPaths) {
    try { if (statSync(searchPath).isDirectory()) visit(searchPath) } catch { /* absent search paths are ignored upstream */ }
  }
  return found
}
