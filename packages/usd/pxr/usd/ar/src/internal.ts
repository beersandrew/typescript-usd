// Portions ported from OpenUSD 26.11.1, including: pxr/usd/ar/resolver.cpp,
//  pxr/usd/usd/usdGenSchema.py
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { LogicalTraceContext } from 'typescript-usd/trace/_internal'
import { ArResolverContext, _ArResolverImplementationContext } from './resolverContext.ts'
import { ArResolver } from './resolver.ts'
import { ArResolvedPath } from './resolvedPath.ts'

export {
  _interim_createResolverScopedCacheContext,
  _getPackageResolverCacheData,
  _getPackageResolverCacheContext,
  _getPackageResolverInstance,
  _onResolverReplaced,
  _resetResolverForTest,
  _setResolverForTest,
} from './resolver.ts'
export { _cwd, _deleteFile, _filesystemAvailable, _isDir, _isFile, _isWritable, _listDir, _makeTmpFileName, _modificationTime, _pathExists, _readFileSync } from './platformFilesystem.ts'
export {
  _ArDefaultAssetReader,
  _ArHasAssetPrefetcher,
  _ArHasAssetPropertyPrefetcher,
  _ArOpenAssetAhead,
  _ArOpenAssetSync,
  _ArPrefetchAsset,
  _ArPrefetchAssetForProperty,
  _ArPrefetchAssetPath,
  _ArReadAhead,
  _ArRegisterAssetPathPrefetcher,
  _ArRegisterAssetPrefetcher,
  _ArRegisterAssetPropertyPrefetcher,
  _ArWasReadAhead,
  _ArResolveAhead,
  _ArResolveSync,
  _ArClearPrefetchedAssetsForTest,
} from './prefetchedAssets.ts'
export type { _ArAssetPathPrefetcher, _ArAssetPrefetcher, _ArAssetReader, _ArSyncAsset } from './prefetchedAssets.ts'
export { ArResolver } from './resolver.ts'
export { ArResolverContext } from './resolverContext.ts'
export { _onResolverChanged } from './notice.ts'
export {
  ArInMemoryResolver,
  dirname,
  isAbsolute,
  joinPackagePath,
  normalizePath,
  normalizeRelative,
  openAssetBytes,
  resolveAssetPath,
  resolvePath,
  splitPackagePath,
} from './resolver.ts'

/**
 * @internal Immutable resolver-implementation carrier; never part of the USD
 * surface. A context made here carries an ArResolver instance that Sdf and the
 * primary resolver hand every operation under the context to, with resolved
 * paths that name the context. Hosts register resolver types instead
 * (ArDefineResolver and a plugInfo.json "Types" entry, resolver.cpp:208-285);
 * this carrier serves the tests' per-stage in-memory and fixture resolvers and
 * usdGenSchema's in-memory schema assets. FAITHFULNESS-DEBT(ar-host-resolver-carrier):
 * upstream has no per-context resolver instance; its tests register resolver
 * plugins and read files (testenv), and usdGenSchema.py reads schema files
 * through ArGetResolver(). Move those callers to registered resolvers or
 * files, then remove this carrier, _ArResolverImplementationContext and
 * ArDefaultResolver's forwarding to it.
 */
export function _resolverContextForResolver(resolver: ArResolver): ArResolverContext {
  let context = hostResolverContexts.get(resolver)
  if (!context) {
    context = new ArResolverContext(new _ArResolverImplementationContext(
      new HostResolverAdapter(resolver),
    ))
    hostResolverContexts.set(resolver, context)
  }
  return context
}

let hostResolverSequence = 0
const hostResolverContexts = new WeakMap<ArResolver, ArResolverContext>()

// Each host implementation is a context-dependent resolver whose resolved
// paths carry the immutable logical-context identity. Sdf still keys solely by
// canonical/resolved asset identity; it never sees a resolver-object namespace.
class HostResolverAdapter extends ArResolver {
  private readonly prefix = `typescript-usd-host-context:${++hostResolverSequence}:`
  constructor(private readonly implementation: ArResolver) { super() }

  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    return this.implementation.createIdentifier(assetPath, this.decode(anchor))
  }

  override isContextDependentPath(): boolean { return true }

  // The implementation's resolved path behind a resolved path this adapter
  // returned.
  decode(path: ArResolvedPath): ArResolvedPath {
    const value = path.toString()
    return value.startsWith(this.prefix)
      ? new ArResolvedPath(decodeURIComponent(value.slice(this.prefix.length)))
      : path
  }

  async resolve(assetPath: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    const resolved = await this.implementation.resolve(assetPath, new ArResolverContext())
    return resolved.valid
      ? new ArResolvedPath(this.prefix + encodeURIComponent(resolved.toString()))
      : resolved
  }

  async openAsset(path: ArResolvedPath, _context?: ArResolverContext) {
    return this.implementation.openAsset(this.decode(path), new ArResolverContext())
  }
}

/** @internal Remove only this context's private carrier identity from a
 * public SdfAssetPath value (see ar-host-resolver-carrier above). Layer cache
 * keys and OpenAsset still retain the carrier. */
export function _resolvedPathForAssetValue(path:ArResolvedPath,context:ArResolverContext):ArResolvedPath {
  const resolver=context.get(_ArResolverImplementationContext)?.resolver
  return resolver instanceof HostResolverAdapter?resolver.decode(path):path
}

/** @internal Selects the host implementation carried by a logical context. */
export function _resolverForContext(
  resolver: ArResolver,
  context: ArResolverContext,
): ArResolver {
  return context.get(_ArResolverImplementationContext)?.resolver ?? resolver
}

interface TraceContextHolder {
  current: LogicalTraceContext | undefined
  base?: LogicalTraceContext
  readonly installations: Array<{
    token: object
    context: LogicalTraceContext | undefined
  }>
}

const traceContexts = new WeakMap<ArResolverContext, TraceContextHolder>()

/** @internal Private cross-package carrier for one resolver operation. */
export function _getArTraceContext(
  context: ArResolverContext | undefined,
): LogicalTraceContext | undefined {
  if (!context) return undefined
  return traceContexts.get(context)?.current
}

/** @internal Installs a resolver-operation context without exposing it in Ar APIs. */
export async function _withArTraceContext<T>(
  resolverContext: ArResolverContext | undefined,
  context: LogicalTraceContext | undefined,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  if (!resolverContext) return await fn()
  let holder = traceContexts.get(resolverContext)
  if (!holder) {
    holder = { current: undefined, installations: [] }
    traceContexts.set(resolverContext, holder)
  }
  const token = {}
  if (holder.installations.length === 0) {
    if (holder.current) holder.base = holder.current
    else delete holder.base
  }
  holder.installations.push({ token, context })
  holder.current = context
  try {
    return await fn()
  } finally {
    const index = holder.installations.findIndex(entry => entry.token === token)
    if (index >= 0) holder.installations.splice(index, 1)
    holder.current = holder.installations.at(-1)?.context ?? holder.base
    if (holder.installations.length === 0) delete holder.base
  }
}
