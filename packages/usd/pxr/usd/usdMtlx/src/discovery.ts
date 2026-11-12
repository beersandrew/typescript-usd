// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/discovery.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.05 pxr/usd/usdMtlx/discovery.cpp.
import type { Document, NodeDef } from '@mtlx/core'
import {
  RegisterDiscoveryPlugin as SdrRegisterDiscoveryPlugin,
  Version as SdrVersion,
  NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { UsdMtlxCustomSearchPaths, UsdMtlxGetDocument, UsdMtlx_DiscoverFiles } from './document.ts'

function versionOf(nodeDef: NodeDef): SdrVersion {
  const [major, minor] = nodeDef.getVersionIntegers()
  // An unversioned definition is implicitly the default.
  return new SdrVersion(
    major, minor, nodeDef.getDefaultVersion() || (major === 0 && minor === 0))
}

function shortestInheritedName(nodeDef: NodeDef): string {
  let current = nodeDef
  let shortest = nodeDef.getName()
  const visited = new Set<string>()
  while (current.hasInheritString() && !visited.has(current.getName())) {
    visited.add(current.getName())
    const inherited = (current.getDocument() as unknown as Document)
      .getNodeDef(current.getInheritString())
    if (!inherited) break
    if (inherited.getName().length < shortest.length) shortest = inherited.getName()
    current = inherited
  }
  return shortest
}

// discovery.cpp:136-157 (_DiscoverNodes)
function discoverNodes(document: Document, uri: string, resolvedUri: string): SdrShaderNodeDiscoveryResult[] {
  return document.getNodeDefs().map(nodeDef => ({
    identifier: nodeDef.getName(),
    version: versionOf(nodeDef),
    name: shortestInheritedName(nodeDef),
    function: nodeDef.getAttribute('node'),
    discoveryType: 'mtlx',
    sourceType: 'mtlx',
    uri,
    resolvedUri,
  }))
}

// discovery.cpp:160-232 (UsdMtlxDiscoveryPlugin).
export class MtlxDiscoveryPlugin {
  // discovery.cpp:179-185: the custom search paths, read once.
  private readonly _customSearchPaths = UsdMtlxCustomSearchPaths()

  // discovery.cpp:187-221: the merged standard library document's nodes
  // (identified as "mtlx"), then those of each file of the custom search
  // paths, by its URI.
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] {
    const result: SdrShaderNodeDiscoveryResult[] = []
    const standardLibrary = UsdMtlxGetDocument('')
    // Identify as the standard library.
    if (standardLibrary) result.push(...discoverNodes(standardLibrary, 'mtlx', 'mtlx'))
    for (const fileResult of UsdMtlx_DiscoverFiles(this._customSearchPaths)) {
      const document = UsdMtlxGetDocument(fileResult.resolvedUri)
      if (document) result.push(...discoverNodes(document, fileResult.uri, fileResult.resolvedUri))
    }
    return result
  }

  // discovery.cpp:223-229 returns UsdMtlxSearchPaths().
  getSearchURIs(): string[] { return [] }
}

// discovery.cpp:231: SDR_REGISTER_DISCOVERY_PLUGIN(UsdMtlxDiscoveryPlugin).
// usdMtlx/plugInfo.json declares the type, so SdrRegistry finds it through Plug.
SdrRegisterDiscoveryPlugin('UsdMtlxDiscoveryPlugin', MtlxDiscoveryPlugin)
