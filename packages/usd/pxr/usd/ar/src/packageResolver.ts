// Ported from OpenUSD 26.11.1: pxr/usd/ar/packageResolver.cpp,
//  pxr/usd/ar/packageResolver.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { ArResolverContext } from './resolverContext.ts'
import type { ArAsset } from './asset.ts'

// ArPackageResolver (packageResolver.h:78-157): resolves and opens assets
// inside package assets of the formats it is registered for. Ar invokes it
// for package-relative paths; it is not called by clients directly.
// Asset resolution is asynchronous in typescript-usd, so Resolve and OpenAsset return
// promises.
export abstract class ArPackageResolver {
  abstract resolve(resolvedPackagePath: string, packagedPath: string, context?: ArResolverContext): Promise<string>
  abstract openAsset(
    resolvedPackagePath: string,
    resolvedPackagedPath: string,
    context?: ArResolverContext,
  ): Promise<ArAsset | undefined>
  // BeginCacheScope/EndCacheScope (packageResolver.h:144-155). The VtValue
  // slot is the returned data, handed back to nested scopes and to the end.
  abstract beginCacheScope(cacheScopeData?: unknown): unknown
  abstract endCacheScope(cacheScopeData: unknown): void
}
