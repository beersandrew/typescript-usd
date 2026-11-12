// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolver.cpp, pxr/usd/ar/resolver.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArAsset, ArInMemoryAsset } from './asset.ts'
import {
  TfDiagnosticMgr, TfDiagnosticType, Error as TfError, Type as TfType, TfEnvSetting, TfGetEnvSetting,
} from 'typescript-usd/tf'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { ArResolvedPath } from './resolvedPath.ts'
import {
  ArDefaultResolverContext,
  ArResolverContext,
  _ArResolverImplementationContext,
} from './resolverContext.ts'
import { ArAssetInfo } from './assetInfo.ts'
import { ArTimestamp } from './timestamp.ts'
import { ArWritableAsset, ArResolverWriteMode } from './writableAsset.ts'
import { _getBoundResolverContext } from './resolverContextBinder.ts'
import { _getResolverCacheData, _getResolverContext } from './asyncState.ts'
import { ArNotice, _sendResolverChanged } from './notice.ts'
import {
  ArIsPackageRelativePath,
  ArJoinPackageRelativePath,
  ArSplitPackageRelativePathInner,
  ArSplitPackageRelativePathOuter,
} from './packageUtils.ts'
import { _cwd, _openFileForWrite, _pathExists } from './platformFilesystem.ts'
import { ArFilesystemAsset } from './filesystemAsset.ts'
import type { ArPackageResolver } from './packageResolver.ts'

export abstract class ArResolver {
  createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    return anchor.valid ? resolveAssetPath(anchor.toString(), assetPath) : normalizePath(assetPath)
  }
  abstract resolve(assetPath: string, context?: ArResolverContext): Promise<ArResolvedPath>
  abstract openAsset(resolvedPath: ArResolvedPath, context?: ArResolverContext): Promise<ArAsset | undefined>
  // ArResolver::IsContextDependentPath. A bound context and a path's
  // dependence on that context are separate facts; resolvers override this
  // only for identifiers whose resolution may vary by context.
  isContextDependentPath(_assetPath: string): boolean { return false }
  createDefaultContext(): ArResolverContext { return new ArResolverContext() }
  createDefaultContextForAsset(_assetPath: string): ArResolverContext { return this.createDefaultContext() }
  createContextFromString(_contextStr: string): ArResolverContext
  createContextFromString(_uriScheme: string, _contextStr: string): ArResolverContext
  // CreateContextFromString(contextStr) is the resolver's own hook
  // (resolver.cpp:1560-1565, 1707-1712); the URI-scheme form always goes to
  // the resolver ArGetResolver returns (resolver.cpp:1567-1572).
  createContextFromString(first: string, second?: string): ArResolverContext {
    if (second === undefined) return new ArResolverContext()
    return _getDispatchingResolver()._createContextFromSchemeString(first, second)
  }
  // ArResolver::CreateContextFromStrings (resolver.cpp:1574-1579).
  createContextFromStrings(contextStrs: readonly (readonly [string, string])[]): ArResolverContext {
    return _getDispatchingResolver()._createContextFromSchemeStrings(contextStrs)
  }
  // ArResolver::BindContext/UnbindContext (resolver.cpp:1531-1545); the
  // binding-data VtValue is the holder's value.
  bindContext(_context: ArResolverContext, _bindingData: { value?: unknown }): void {}
  unbindContext(_context: ArResolverContext, _bindingData: { value?: unknown }): void {}
  createIdentifierForNewAsset(assetPath: string, anchor = new ArResolvedPath()): string {
    return this.createIdentifier(assetPath, anchor)
  }
  resolveForNewAsset(assetPath: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    return this.resolve(assetPath, context)
  }
  getCurrentContext(): ArResolverContext { return _getBoundResolverContext(this) }
  getExtension(assetPath: string): string {
    const packaged = splitPackagePath(assetPath)
    const path = packaged?.innerPath ?? assetPath
    const slash = path.lastIndexOf('/')
    const dot = path.lastIndexOf('.')
    return dot > slash ? path.slice(dot + 1) : ''
  }
  getAssetInfo(_assetPath: string, _resolvedPath: ArResolvedPath): ArAssetInfo { return new ArAssetInfo() }
  getModificationTimestamp(_assetPath: string, _resolvedPath: ArResolvedPath): ArTimestamp {
    return new ArTimestamp()
  }
  async openAssetForWrite(
    _resolvedPath: ArResolvedPath,
    _writeMode: ArResolverWriteMode = ArResolverWriteMode.Update,
  ): Promise<ArWritableAsset | undefined> { return undefined }
  canWriteAssetToPath(_resolvedPath: ArResolvedPath): boolean { return false }
  beginCacheScope(parentData?: unknown): unknown { return parentData ?? new Map<string, unknown>() }
  endCacheScope(_cacheScopeData: unknown): void {}
  refreshContext(context: ArResolverContext): void {
    _sendResolverChanged(new ArNotice.ResolverChanged(candidate => candidate.equals(context)))
  }
}

export class ArDefaultResolver extends ArResolver {
  static setDefaultSearchPath(searchPath: readonly string[]): void {
    const next = new ArDefaultResolverContext(searchPath)
    if (next.equals(defaultSearchPath)) return
    defaultSearchPath = next
    _sendResolverChanged(new ArNotice.ResolverChanged(
      context => context.get(ArDefaultResolverContext) !== undefined,
    ))
  }

  override createDefaultContextForAsset(assetPath: string): ArResolverContext {
    if (!assetPath) return new ArResolverContext(new ArDefaultResolverContext())
    return new ArResolverContext(new ArDefaultResolverContext([
      dirname(absoluteFilesystemPath(assetPath)),
    ]))
  }
  override createContextFromString(contextStr: string): ArResolverContext
  override createContextFromString(uriScheme: string, contextStr: string): ArResolverContext
  override createContextFromString(first: string, second?: string): ArResolverContext {
    if (second !== undefined) return super.createContextFromString(first, second)
    const paths = first.split(pathListSeparator()).filter(Boolean)
    return new ArResolverContext(new ArDefaultResolverContext(paths))
  }
  async resolve(assetPath: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    const implementation = context.get(_ArResolverImplementationContext)?.resolver
    if (implementation && implementation !== this) return implementation.resolve(assetPath, context)
    const cache = _getResolverCacheData(this)
    if (cache instanceof Map) {
      const cached = cache.get(assetPath)
      if (cached instanceof ArResolvedPath) return cached
      const resolved = this._resolve(assetPath, context)
      cache.set(assetPath, resolved)
      return resolved
    }
    return this._resolve(assetPath, context)
  }
  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    // _DispatchingResolver::_CreateIdentifier (resolver.cpp:560-580): a
    // package-relative path takes the identifier of its outer package path,
    // anchored to the anchor's outer package path.
    if (ArIsPackageRelativePath(assetPath)) {
      const [packagePath, packagedPath] = ArSplitPackageRelativePathOuter(assetPath)
      const outerAnchor = anchor.valid
        ? new ArResolvedPath(ArSplitPackageRelativePathOuter(anchor.toString())[0]) : anchor
      return ArJoinPackageRelativePath([this.createIdentifier(packagePath, outerAnchor), packagedPath])
    }
    const implementation = this.getCurrentContext().get(_ArResolverImplementationContext)?.resolver
    if (implementation && implementation !== this) {
      return implementation.createIdentifier(assetPath, anchor)
    }
    if (!assetPath) return ''
    if (!anchor.valid) return normalizePath(assetPath)
    const anchored = resolveAssetPath(anchor.toString(), assetPath)
    if (isSearchPath(assetPath) && !_pathExists(absoluteFilesystemPath(anchored))) {
      return normalizePath(assetPath)
    }
    return normalizePath(anchored)
  }
  override createIdentifierForNewAsset(
    assetPath: string,
    anchor = new ArResolvedPath(),
  ): string {
    if (!assetPath) return ''
    if (!isRelativeFilesystemPath(assetPath)) return normalizePath(assetPath)
    return anchor.valid
      ? normalizePath(resolveAssetPath(anchor.toString(), assetPath))
      : absoluteFilesystemPath(assetPath)
  }
  override resolveForNewAsset(
    assetPath: string,
    context = this.getCurrentContext(),
  ): Promise<ArResolvedPath> {
    const implementation = context.get(_ArResolverImplementationContext)?.resolver
    if (implementation && implementation !== this) {
      return implementation.resolveForNewAsset(assetPath, context)
    }
    return Promise.resolve(new ArResolvedPath(
      assetPath ? absoluteFilesystemPath(assetPath) : '',
    ))
  }

  override async openAssetForWrite(
    resolvedPath: ArResolvedPath,
    writeMode = ArResolverWriteMode.Update,
  ): Promise<ArWritableAsset | undefined> {
    if (!this.canWriteAssetToPath(resolvedPath)) return undefined
    try {
      const handle = await _openFileForWrite(
        resolvedPath.toString(), writeMode === ArResolverWriteMode.Replace)
      return new ArFilesystemWritableAsset(handle)
    } catch {
      return undefined
    }
  }

  override canWriteAssetToPath(resolvedPath: ArResolvedPath): boolean {
    return resolvedPath.valid && !ArIsPackageRelativePath(resolvedPath.toString())
  }
  override isContextDependentPath(assetPath: string): boolean {
    const implementation = this.getCurrentContext().get(_ArResolverImplementationContext)?.resolver
    return implementation
      ? implementation.isContextDependentPath(assetPath)
      : isSearchPath(assetPath)
  }
  async openAsset(path: ArResolvedPath, context = this.getCurrentContext()): Promise<ArAsset | undefined> {
    const implementation = context.get(_ArResolverImplementationContext)?.resolver
    if (implementation && implementation !== this) return implementation.openAsset(path, context)
    // ArDefaultResolver::_OpenAsset (defaultResolver.cpp:241-246).
    return ArFilesystemAsset.open(path)
  }

  /** @internal _Resolve (defaultResolver.cpp:189-225) for a synchronous
   *  caller (prefetchedAssets.ts): the filesystem lookups are synchronous. A
   *  context's host implementation, which may not be, resolves nothing. */
  _resolveSync(assetPath: string, context = this.getCurrentContext()): ArResolvedPath {
    const implementation = context.get(_ArResolverImplementationContext)?.resolver
    if (implementation && implementation !== this) return new ArResolvedPath()
    return this._resolve(assetPath, context)
  }

  private _resolve(assetPath: string, context: ArResolverContext): ArResolvedPath {
    if (!assetPath) return new ArResolvedPath()
    if (!isRelativeFilesystemPath(assetPath)) {
      const absolute = absoluteFilesystemPath(assetPath)
      return _pathExists(absolute) ? new ArResolvedPath(absolute) : new ArResolvedPath()
    }

    const fromCwd = absoluteFilesystemPath(assetPath)
    if (_pathExists(fromCwd)) return new ArResolvedPath(fromCwd)
    if (!isSearchPath(assetPath)) return new ArResolvedPath()

    const bound = context.get(ArDefaultResolverContext)
    for (const searchContext of [bound, defaultSearchPath]) {
      if (!searchContext) continue
      for (const prefix of searchContext.searchPath) {
        const candidate = normalizePath(`${prefix}/${assetPath}`)
        if (_pathExists(candidate)) return new ArResolvedPath(candidate)
      }
    }
    return new ArResolvedPath()
  }
}

interface WritableFileHandle {
  write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>
  close(): Promise<void>
}

// ArFilesystemWritableAsset mirrors the default resolver's filesystem-backed
// ArWritableAsset ownership (pxr/usd/ar/defaultResolver.cpp:OpenAssetForWrite).
class ArFilesystemWritableAsset extends ArWritableAsset {
  constructor(private handle: WritableFileHandle | undefined) { super() }

  async write(buffer: Uint8Array, offset: number): Promise<number> {
    if (!this.handle) return 0
    const result = await this.handle.write(buffer, 0, buffer.byteLength, offset)
    return result.bytesWritten
  }

  async close(): Promise<boolean> {
    if (!this.handle) return false
    const handle = this.handle
    this.handle = undefined
    await handle.close()
    return true
  }
}

let defaultSearchPath = new ArDefaultResolverContext(
  (typeof process !== 'undefined' ? process.env.PXR_AR_DEFAULT_SEARCH_PATH : undefined)
    ?.split(pathListSeparator()) ?? [],
)

function pathListSeparator(): string {
  return typeof process !== 'undefined' && process.platform === 'win32' ? ';' : ':'
}

function isRelativeFilesystemPath(path: string): boolean {
  return path !== '' && !isAbsolute(path)
}

function isSearchPath(path: string): boolean {
  return isRelativeFilesystemPath(path) && !path.startsWith('./') && !path.startsWith('../')
}

function absoluteFilesystemPath(path: string): string {
  if (isAbsolute(path)) return normalizePath(path)
  const cwd = _cwd()
  return normalizePath(cwd ? `${cwd}/${path}` : path)
}


export class ArInMemoryResolver extends ArResolver {
  constructor(private readonly assets: ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>) { super() }
  private get(path: string): Uint8Array | undefined {
    const map = this.assets as ReadonlyMap<string, Uint8Array>
    return typeof map.get === 'function' ? map.get(path) : (this.assets as Record<string, Uint8Array>)[path]
  }
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const id = normalizePath(assetPath)
    return new ArResolvedPath(this.get(id) ? id : '')
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const bytes = this.get(path.toString())
    return bytes ? new ArInMemoryAsset(bytes) : undefined
  }
}

// resolver.cpp:40-43 (TfType::Define<ArResolver>()), defaultResolver.cpp
// (AR_DEFINE_RESOLVER(ArDefaultResolver, ArResolver)) and packageResolver.cpp
// (TfType::Define<ArPackageResolver>()).
const _resolverType = TfType.define('ArResolver')
const _defaultResolverType = TfType.define('ArDefaultResolver', [_resolverType])
const _packageResolverType = TfType.define('ArPackageResolver')

/** Ar_ResolverFactoryBase (defineResolver.h:40-47): the TfType factory Ar
 *  manufactures a resolver with. */
export interface Ar_ResolverFactoryBase { 'new'(): ArResolver }
/** Ar_PackageResolverFactoryBase (definePackageResolver.h:40-47). */
export interface Ar_PackageResolverFactoryBase { 'new'(): ArPackageResolver }

_defaultResolverType.setFactory({ new: () => new ArDefaultResolver() } satisfies Ar_ResolverFactoryBase)

// pxr/usd/ar/plugInfo.json. Ar is part of this build, so the plugin has
// nothing to load (base/plug/src/plugin.ts).
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{
    Name: 'ar',
    Type: 'library',
    Info: {
      Types: {
        ArResolver: {},
        ArDefaultResolver: { bases: ['ArResolver'], implementsContexts: true },
        ArPackageResolver: {},
      },
    },
  }],
})

/**
 * AR_DEFINE_RESOLVER(ResolverClass, BaseClass...) (defineResolver.h:20-63):
 * defines the resolver's TfType, derived from the given bases (ArResolver,
 * or another resolver type), with the factory Ar manufactures it with. A
 * resolver plugin's module calls this at its top level, where upstream's
 * macro is a TF_REGISTRY_FUNCTION(TfType). The type name is the one the
 * plugin's plugInfo.json "Types" declares, with the metadata Ar reads:
 * "uriSchemes" (the URI/IRI schemes it resolves, which makes it a URI
 * resolver rather than a primary resolver candidate), "implementsContexts"
 * and "implementsScopedCaches" (resolver.cpp:208-285).
 *
 * ```ts
 * class MyResolver extends Resolver { ... }
 * DefineResolver('MyResolver', MyResolver)
 * PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
 *   Name: 'myResolver', Type: 'library',
 *   Info: { Types: { MyResolver: { bases: ['ArResolver'], uriSchemes: ['my'] } } },
 * }] })
 * ```
 */
export function ArDefineResolver(
  typeName: string,
  resolverClass: new () => ArResolver,
  baseTypeNames: readonly string[] = ['ArResolver'],
): TfType {
  const type = TfType.define(typeName, baseTypeNames.map(name => TfType.declare(name)))
  type.setFactory({ new: () => new resolverClass() } satisfies Ar_ResolverFactoryBase)
  _pluginResolversGeneration++
  return type
}

/**
 * AR_DEFINE_PACKAGE_RESOLVER(PackageResolverClass, BaseClass...)
 * (definePackageResolver.h:20-63): as ArDefineResolver, for a package
 * resolver, whose plugInfo.json type declares the package formats it handles
 * in "extensions" (resolver.cpp:1207-1265).
 */
export function ArDefinePackageResolver(
  typeName: string,
  packageResolverClass: new () => ArPackageResolver,
  baseTypeNames: readonly string[] = ['ArPackageResolver'],
): TfType {
  const type = TfType.define(typeName, baseTypeNames.map(name => TfType.declare(name)))
  type.setFactory({ new: () => new packageResolverClass() } satisfies Ar_PackageResolverFactoryBase)
  _pluginResolversGeneration++
  return type
}

// resolver.cpp:66-73 (TF_DEFINE_ENV_SETTING).
const PXR_AR_DISABLE_PLUGIN_RESOLVER = new TfEnvSetting<boolean>(
  'PXR_AR_DISABLE_PLUGIN_RESOLVER', false,
  'Disables plugin resolver implementation, falling back to default supplied by Ar.')
const PXR_AR_DISABLE_PLUGIN_URI_RESOLVERS = new TfEnvSetting<boolean>(
  'PXR_AR_DISABLE_PLUGIN_URI_RESOLVERS', false,
  'Disables plugin URI/IRI resolver implementations.')

// PLATFORM-DIVERGENCE(ar-resolver-late-registration): upstream registers
// every plugin before the first ArGetResolver() and loads a resolver's plugin
// synchronously when the resolver is first used (_PluginResolver::Create,
// resolver.cpp:354-379), so the dispatching resolver finds its URI and package
// resolvers once, when it is constructed (resolver.cpp:449-462), and a type
// that cannot be manufactured is a coding error. On the web, plugins register
// at any time and a library plugin's module (import()) loads asynchronously,
// so a resolver type may be declared before its module has defined it. The
// dispatching resolver therefore looks again for URI and package resolver
// types whenever plugins were registered or resolver types defined since it
// last looked, and manufactures a resolver whose plugin is not loaded yet, or
// whose type has no factory yet, when it can (until then, its paths go to the
// primary resolver, as upstream when a URI resolver fails to load). The
// primary resolver is chosen once, when ArGetResolver() is first called, as
// upstream. A plugin loaded from a URL is loaded with PlugPlugin.LoadAsync.
let _pluginResolversGeneration = 0
PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => { _pluginResolversGeneration++ })

function postCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

function postWarning(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

function byTypeName(x: TfType, y: TfType): number {
  return x.getTypeName() < y.getTypeName() ? -1 : x.getTypeName() > y.getTypeName() ? 1 : 0
}

// _GetPluginForType (resolver.cpp:159-168).
function getPluginForType(type: TfType): PlugPlugin | undefined {
  const plugin = PlugRegistry.GetInstance().getPluginForType(type)
  if (!plugin) postCodingError(`Failed to find plugin for ${type.getTypeName()}`)
  return plugin ?? undefined
}

// The plugin of a resolver type, if any registered plugin declares it yet
// (ar-resolver-late-registration: a type with no plugin is not available
// until one declares it, rather than a coding error).
function declaredPluginForType(type: TfType): PlugPlugin | undefined {
  return PlugRegistry.GetInstance().getPluginForType(type) ?? undefined
}

// The manufacturable state of a plugin resolver type (_PluginResolver,
// resolver.cpp:337-402): its plugin is loaded and its type has a factory.
function factoryForType<T extends object>(type: TfType, plugin: PlugPlugin | undefined): T | undefined {
  if (!plugin?.isLoaded()) return undefined
  return type.getFactory<T>()
}

// Stack of resolver types being constructed, used by _CreateResolver /
// ArCreateResolver and ArGetAvailableResolvers (resolver.cpp:88-91).
const resolverStack: TfType[] = []

// _CreateResolver (resolver.cpp:404-443): any failure falls back to
// ArDefaultResolver.
function createResolver(resolverType: TfType): ArResolver {
  resolverStack.push(resolverType)
  try {
    let tmpResolver: ArResolver | undefined
    if (resolverType.isUnknown()) {
      postCodingError('Invalid resolver type')
    } else if (!resolverType.isA(_resolverType)) {
      postCodingError(`Given type ${resolverType.getTypeName()} does not derive from ArResolver`)
    } else if (resolverType !== _defaultResolverType) {
      const plugin = getPluginForType(resolverType)
      if (plugin) tmpResolver = createPluginResolver<Ar_ResolverFactoryBase, ArResolver>(plugin, resolverType)
    }
    return tmpResolver ?? new ArDefaultResolver()
  } finally {
    resolverStack.pop()
  }
}

// _PluginResolver::Create (resolver.cpp:354-379).
function createPluginResolver<F extends { 'new'(): R }, R>(plugin: PlugPlugin, type: TfType): R | undefined {
  if (!plugin.Load()) {
    postCodingError(`Failed to load plugin ${plugin.getName()} for ${type.getTypeName()}`)
    return undefined
  }
  const resolver = type.getFactory<F>()?.new()
  if (!resolver) {
    postCodingError(`Failed to manufacture asset resolver ${type.getTypeName()} from plugin ${plugin.getName()}`)
  }
  return resolver
}

// _ResolverInfo (resolver.cpp:93-113).
interface ResolverInfo {
  readonly plugin: PlugPlugin | undefined
  readonly type: TfType
  readonly uriSchemes: readonly string[]
  readonly canBePrimaryResolver: boolean
  readonly implementsContexts: boolean
  readonly implementsScopedCaches: boolean
}

// _FindMetadataValueOnTypeOrBase<bool> (resolver.cpp:170-206).
function findMetadataOnTypeOrBase(
  metadata: 'implementsContexts' | 'implementsScopedCaches',
  type: TfType,
): boolean | undefined {
  if (type.isRoot()) return undefined
  const plugin = declaredPluginForType(type)
  if (!plugin) return undefined
  const value = plugin.getMetadataForType(type)[metadata]
  if (value !== undefined) {
    if (typeof value === 'boolean') return value
    postCodingError(`'${metadata}' metadata for ${type.getTypeName()} must be a bool.`)
  }
  for (const base of type.getBaseTypes()) {
    const baseValue = findMetadataOnTypeOrBase(metadata, base)
    if (baseValue !== undefined) return baseValue
  }
  return undefined
}

// The resolver types derived from ArResolver, sorted by type name: TfType's
// order is not stable across runs (resolver.cpp:218-235).
function sortedResolverTypes(): TfType[] {
  return [...new Set(PlugRegistry.getAllDerivedTypes(_resolverType))].sort(byTypeName)
}

// The _ResolverInfo loop of _GetAvailableResolvers (resolver.cpp:240-282) for
// one type, or undefined when it is not available.
function resolverInfo(resolverType: TfType): ResolverInfo | undefined {
  const plugin = declaredPluginForType(resolverType)
  if (!plugin) return undefined
  let uriSchemes: string[] = []
  const uriSchemesVal = plugin.getMetadataForType(resolverType).uriSchemes
  if (uriSchemesVal !== undefined) {
    if (Array.isArray(uriSchemesVal) && uriSchemesVal.every(scheme => typeof scheme === 'string')) {
      uriSchemes = uriSchemesVal as string[]
    } else {
      postCodingError(`'uriSchemes' metadata for ${resolverType.getTypeName()} must be a list of strings.`)
      return undefined
    }
  }
  return {
    plugin,
    type: resolverType,
    uriSchemes,
    canBePrimaryResolver: uriSchemes.length === 0,
    implementsContexts: findMetadataOnTypeOrBase('implementsContexts', resolverType) ?? false,
    implementsScopedCaches: findMetadataOnTypeOrBase('implementsScopedCaches', resolverType) ?? false,
  }
}

// _GetAvailableResolvers (resolver.cpp:208-285). ArDefaultResolver's plugin
// is Ar's own, registered above (resolver.cpp:211-215).
function getAvailableResolvers(): ResolverInfo[] {
  return sortedResolverTypes().flatMap(type => resolverInfo(type) ?? [])
}

// _GetAvailablePrimaryResolvers (resolver.cpp:287-334): plugin primary
// resolvers first, ArDefaultResolver last; resolvers under construction are
// skipped.
function getAvailablePrimaryResolvers(available: readonly ResolverInfo[]): ResolverInfo[] {
  const allAvailableResolvers = TfGetEnvSetting(PXR_AR_DISABLE_PLUGIN_RESOLVER) ? [] : available
  const primaries = allAvailableResolvers.filter(info =>
    info.canBePrimaryResolver && info.type !== _defaultResolverType &&
    !resolverStack.includes(info.type))
  const defaultInfo = available.find(info => info.type === _defaultResolverType)
  if (defaultInfo) primaries.push(defaultInfo)
  return primaries
}

// _ValidateResourceIdentifierScheme (resolver.cpp:115-146); the scheme is
// already case-folded.
function validateResourceIdentifierScheme(caseFoldedScheme: string): [boolean, string] {
  if (caseFoldedScheme === '') return [false, 'Scheme cannot be empty']
  const first = caseFoldedScheme.charCodeAt(0)
  if (first < 0x61 || first > 0x7a) return [false, "Scheme must start with ASCII 'a-z'"]
  const invalid = /[^0-9a-z\-.+]/u.exec(caseFoldedScheme.slice(1))
  if (invalid) {
    return [false, `'${invalid[0]}' not allowed in scheme. Characters must be ASCII 'a-z', '-', '+', or '.'`]
  }
  return [true, '']
}

// TfStringToLowerAscii.
function toLowerAscii(value: string): string {
  return value.replace(/[A-Z]/g, character => character.toLowerCase())
}

// _Resolver (resolver.cpp:1400-1426): a resolver type's info and its one
// instance, manufactured on first use (_PluginResolver::Get,
// resolver.cpp:381-394; see ar-resolver-late-registration).
class _Resolver {
  #resolver: ArResolver | undefined
  constructor(readonly info: ResolverInfo, resolver?: ArResolver) { this.#resolver = resolver }
  get(): ArResolver | undefined {
    return this.#resolver ??=
      factoryForType<Ar_ResolverFactoryBase>(this.info.type, this.info.plugin)?.new()
  }
}

interface ActiveResolver {
  readonly info: ResolverInfo
  readonly resolver: ArResolver
}

// _PackageResolver (resolver.cpp:1428-1450): a package resolver type and the
// package format it handles. Package resolvers keep one instance per type
// for the process, so Sdf's package reads share the scoped cache data Ar
// gives the instance it dispatches to.
interface PackageResolverEntry {
  readonly packageFormat: string
  readonly type: TfType
  readonly plugin: PlugPlugin
}

const packageResolverInstances = new Map<TfType, ArPackageResolver>()

function packageResolverInstance(type: TfType, plugin: PlugPlugin | undefined): ArPackageResolver | undefined {
  let instance = packageResolverInstances.get(type)
  if (!instance) {
    instance = factoryForType<Ar_PackageResolverFactoryBase>(type, plugin)?.new()
    if (instance) packageResolverInstances.set(type, instance)
  }
  return instance
}

/** @internal The instance of a package resolver type Ar dispatches to. */
export function _getPackageResolverInstance(typeName: string): ArPackageResolver | undefined {
  const type = TfType.findByName(typeName)
  return type.isA(_packageResolverType) ? packageResolverInstance(type, declaredPluginForType(type)) : undefined
}

// The cache-scope data _DispatchingResolver keeps (resolver.cpp:947-1040,
// 1452-1462): each participating resolver's own scope data, plus the
// resolved-path cache for resolvers that do not implement scoped caches.
class DispatchingCacheData {
  constructor(
    readonly resolvedPaths: Map<string, Promise<ArResolvedPath>>,
    readonly entries: ReadonlyArray<{
      readonly target: ArResolver | ArPackageResolver
      readonly value: unknown
    }>,
  ) {}
}

// PLATFORM-DIVERGENCE(ar-explicit-cache-carrier): asynchronous browser hosts
// without AsyncContext cannot use thread-local Ar scopes. Carry the same
// resolver.cpp:953-1044 scope data explicitly with the immutable context until
// the host provides async-lane scope propagation; never use a global stack.
class ExplicitCacheScope {
  active = true
  constructor(readonly resolver: ArResolver, public data: unknown, readonly base: ArResolverContext) {}
}
export function _interim_createResolverScopedCacheContext(context: ArResolverContext): {context: ArResolverContext; dispose(): void} {
  const resolver = ArGetResolver()
  const parent = context.get(ExplicitCacheScope)
  const data = resolver.beginCacheScope(parent?.active ? parent.data : undefined)
  const scope = new ExplicitCacheScope(resolver, data, parent?.base ?? context)
  return {context: new ArResolverContext(scope, context), dispose() {
    if (scope.active) {
      scope.active = false
      const ended = scope.data
      scope.data = undefined
      resolver.endCacheScope(ended)
    }
  }}
}
export function _getPackageResolverCacheData(target: ArPackageResolver, context?: ArResolverContext): unknown {
  const explicit = context?.get(ExplicitCacheScope)
  const data = explicit ? (explicit.active ? explicit.data : undefined) : _getResolverCacheData(ArGetResolver())
  return data instanceof DispatchingCacheData ? data.entries.find(entry => entry.target === target)?.value : undefined
}
export function _getPackageResolverCacheContext(context?: ArResolverContext): ArResolverContext | undefined {
  const selected = context ?? ArGetResolver().getCurrentContext()
  const base = selected.get(ExplicitCacheScope)?.base ?? selected
  return base.empty ? undefined : base
}

// The union of contexts, strongest first (ArResolverContext(vector),
// resolverContext.cpp:21-28). A single distinct non-empty context is returned
// as is, so a context bound once keeps its identity.
function mergeContexts(contexts: readonly ArResolverContext[]): ArResolverContext {
  const distinct: ArResolverContext[] = []
  for (const context of contexts) {
    if (!context.empty && !distinct.includes(context)) distinct.push(context)
  }
  if (distinct.length === 1) return distinct[0]!
  return new ArResolverContext(distinct)
}

// _DispatchingResolver (resolver.cpp:449-1474): the resolver ArGetResolver
// returns. It dispatches each call to the URI/IRI resolver registered for the
// asset path's scheme, else to the primary resolver, and resolves the
// packaged portions of package-relative paths with package resolvers.
class _DispatchingResolver extends ArResolver {
  private readonly primary: _Resolver
  private readonly uriResolvers = new Map<string, _Resolver>()
  private maxURISchemeLength = 0
  private readonly packageResolvers: PackageResolverEntry[] = []
  // The resolver types and plugin generation looked at so far
  // (ar-resolver-late-registration).
  private readonly seenResolverTypes = new Set<TfType>()
  private readonly seenPackageResolverTypes = new Set<TfType>()
  private pluginResolversGeneration = -1

  constructor(primaryOverride?: ArResolver) {
    super()
    const available = getAvailableResolvers()
    this.primary = primaryOverride
      ? new _Resolver(primaryOverrideInfo(primaryOverride), primaryOverride)
      : initializePrimaryResolver(available)
    this._findPluginResolvers(available)
  }

  getPrimaryResolver(): ArResolver { return this.primary.get()! }

  // GetURISchemes (resolver.cpp:467-481).
  getURISchemes(): string[] {
    this._findPluginResolvers()
    return [...this.uriResolvers.keys()].sort()
  }

  // _InitializeURIResolvers and _InitializePackageResolvers
  // (resolver.cpp:1129-1265), for the resolver types not looked at yet
  // (ar-resolver-late-registration).
  private _findPluginResolvers(available?: readonly ResolverInfo[]): void {
    if (this.pluginResolversGeneration === _pluginResolversGeneration) return
    this.pluginResolversGeneration = _pluginResolversGeneration
    // A type is looked at once its plugin declares it.
    const unseen = sortedResolverTypes().filter(type =>
      !this.seenResolverTypes.has(type) && declaredPluginForType(type) !== undefined)
    this._initializeURIResolvers(available ?? unseen.flatMap(type => resolverInfo(type) ?? []))
    for (const type of unseen) this.seenResolverTypes.add(type)
    this._initializePackageResolvers()
  }

  // _InitializeURIResolvers (resolver.cpp:1129-1205).
  private _initializeURIResolvers(availableResolvers: readonly ResolverInfo[]): void {
    if (TfGetEnvSetting(PXR_AR_DISABLE_PLUGIN_URI_RESOLVERS)) return
    for (const resolverInfo of availableResolvers) {
      if (this.seenResolverTypes.has(resolverInfo.type)) continue
      this.seenResolverTypes.add(resolverInfo.type)
      const uriSchemes: string[] = []
      for (const scheme of resolverInfo.uriSchemes) {
        // Per RFC 3986 sec 3.1 / RFC 3987 sec 5.3.2.1 schemes are
        // case-insensitive. Force all schemes to lower-case to support this.
        const uriScheme = toLowerAscii(scheme)
        const existingResolver = this.uriResolvers.get(uriScheme)
        const [valid, whyNot] = validateResourceIdentifierScheme(uriScheme)
        if (existingResolver) {
          postWarning(`ArGetResolver(): ${resolverInfo.type.getTypeName()} registered to handle scheme ` +
            `'${uriScheme}' which is already handled by ${existingResolver.info.type.getTypeName()}. Ignoring.\n`)
        } else if (!valid) {
          postWarning(`ArGetResolver(): '${uriScheme}' for '${resolverInfo.type.getTypeName()}' is not a ` +
            `valid resource identifier scheme: ${whyNot}. Paths with this prefix will be handled by other resolvers.`)
        } else if (!uriSchemes.includes(uriScheme)) {
          uriSchemes.push(uriScheme)
        }
      }
      if (uriSchemes.length === 0) continue

      // Create resolver. We only want one instance of each resolver type, so
      // make sure we reuse the primary resolver if it has also been
      // registered as handling additional URI schemes.
      const uriResolver = resolverInfo.type === this.primary.info.type
        ? this.primary : new _Resolver(resolverInfo)
      for (const uriScheme of uriSchemes) {
        this.maxURISchemeLength = Math.max(uriScheme.length, this.maxURISchemeLength)
        this.uriResolvers.set(uriScheme, uriResolver)
      }
    }
  }

  // _InitializePackageResolvers (resolver.cpp:1207-1265).
  private _initializePackageResolvers(): void {
    const packageResolverTypes = [...new Set(PlugRegistry.getAllDerivedTypes(_packageResolverType))].sort(byTypeName)
    for (const packageResolverType of packageResolverTypes) {
      if (this.seenPackageResolverTypes.has(packageResolverType)) continue
      const plugin = declaredPluginForType(packageResolverType)
      // A type no plugin declares yet (ar-resolver-late-registration).
      if (!plugin) continue
      this.seenPackageResolverTypes.add(packageResolverType)
      const extensionsVal = plugin.getMetadataForType(packageResolverType).extensions
      if (extensionsVal === undefined) {
        postCodingError(`No package formats specified in 'extensions' metadata for '${packageResolverType.getTypeName()}'`)
        continue
      }
      if (!Array.isArray(extensionsVal) || !extensionsVal.every(extension => typeof extension === 'string')) {
        postCodingError(`'extensions' metadata for ${packageResolverType.getTypeName()} must be a list of strings.`)
        continue
      }
      for (const extension of extensionsVal as string[]) {
        if (extension === '') continue
        this.packageResolvers.push({ packageFormat: toLowerAscii(extension), plugin, type: packageResolverType })
      }
    }
  }

  // The package resolvers, manufactured (_PackageResolver::Get).
  private _packageResolverInstances(): ArPackageResolver[] {
    this._findPluginResolvers()
    const instances = new Set<ArPackageResolver>()
    for (const entry of this.packageResolvers) {
      const instance = packageResolverInstance(entry.type, entry.plugin)
      if (instance) instances.add(instance)
    }
    return [...instances]
  }

  // _GetResolver (resolver.cpp:1269-1282).
  private _getResolver(assetPath: string): ActiveResolver {
    return this._getURIResolver(assetPath) ?? { info: this.primary.info, resolver: this.primary.get()! }
  }

  // _GetURIResolver (resolver.cpp:1284-1308).
  private _getURIResolver(assetPath: string): ActiveResolver | undefined {
    this._findPluginResolvers()
    if (this.uriResolvers.size === 0) return undefined
    const numSearchChars = Math.min(assetPath.length, this.maxURISchemeLength + 1)
    const delimiter = assetPath.slice(0, numSearchChars).indexOf(':')
    if (delimiter < 0) return undefined
    return this._getURIResolverForScheme(assetPath.slice(0, delimiter))
  }

  // _GetURIResolverForScheme (resolver.cpp:1310-1329): schemes are
  // case-insensitive.
  private _getURIResolverForScheme(scheme: string): ActiveResolver | undefined {
    this._findPluginResolvers()
    const entry = this.uriResolvers.get(toLowerAscii(scheme))
    const resolver = entry?.get()
    return entry && resolver ? { info: entry.info, resolver } : undefined
  }

  // _GetPackageResolver (resolver.cpp:1331-1345).
  private _getPackageResolver(packageRelativePath: string): ArPackageResolver | undefined {
    this._findPluginResolvers()
    const innermostPackage = ArSplitPackageRelativePathInner(packageRelativePath)[0]
    const format = toLowerAscii(this.getExtension(innermostPackage))
    for (const entry of this.packageResolvers) {
      if (entry.packageFormat === format) return packageResolverInstance(entry.type, entry.plugin)
    }
    return undefined
  }

  // The primary resolver and each URI scheme's resolver, as _BindContext and
  // the other context operations visit them (resolver.cpp:638-818), that
  // implement contexts.
  private _contextResolvers(): ArResolver[] {
    this._findPluginResolvers()
    const resolvers: ArResolver[] = []
    if (this.primary.info.implementsContexts) resolvers.push(this.primary.get()!)
    for (const entry of this.uriResolvers.values()) {
      const resolver = entry.info.implementsContexts ? entry.get() : undefined
      if (resolver) resolvers.push(resolver)
    }
    return resolvers
  }

  // CreateContextFromString(uriScheme, contextStr) (resolver.cpp:487-496).
  _createContextFromSchemeString(uriScheme: string, contextStr: string): ArResolverContext {
    const resolver = uriScheme === ''
      ? this.primary.get()
      : this._getURIResolverForScheme(uriScheme)?.resolver
    return resolver ? resolver.createContextFromString(contextStr) : new ArResolverContext()
  }

  // CreateContextFromStrings (resolver.cpp:498-514).
  _createContextFromSchemeStrings(
    contextStrs: readonly (readonly [string, string])[],
  ): ArResolverContext {
    const contexts: ArResolverContext[] = []
    for (const [uriScheme, contextStr] of contextStrs) {
      const context = this._createContextFromSchemeString(uriScheme, contextStr)
      if (!context.empty) contexts.push(context)
    }
    return new ArResolverContext(contexts)
  }

  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    return this._createIdentifierHelper(assetPath, anchor,
      (resolver, path, anchorPath) => resolver.createIdentifier(path, anchorPath))
  }

  override createIdentifierForNewAsset(assetPath: string, anchor = new ArResolvedPath()): string {
    return this._createIdentifierHelper(assetPath, anchor,
      (resolver, path, anchorPath) => resolver.createIdentifierForNewAsset(path, anchorPath))
  }

  // _CreateIdentifierHelper (resolver.cpp:541-582): a path with a registered
  // scheme goes to that scheme's resolver, any other to the anchor's resolver;
  // a package-relative anchor anchors through its outer package path.
  private _createIdentifierHelper(
    assetPath: string,
    anchor: ArResolvedPath,
    createIdentifier: (resolver: ArResolver, assetPath: string, anchor: ArResolvedPath) => string,
  ): string {
    const resolver = (this._getURIResolver(assetPath) ?? this._getResolver(anchor.toString())).resolver
    const anchorResolvedPath = new ArResolvedPath(ArSplitPackageRelativePathOuter(anchor.toString())[0])
    if (ArIsPackageRelativePath(assetPath)) {
      const [packagePath, packagedPath] = ArSplitPackageRelativePathOuter(assetPath)
      return ArJoinPackageRelativePath([
        createIdentifier(resolver, packagePath, anchorResolvedPath), packagedPath,
      ])
    }
    return createIdentifier(resolver, assetPath, anchorResolvedPath)
  }

  // _IsContextDependentPath (resolver.cpp:584-599).
  override isContextDependentPath(assetPath: string): boolean {
    const { info, resolver } = this._getResolver(assetPath)
    if (!info.implementsContexts) return false
    return resolver.isContextDependentPath(ArIsPackageRelativePath(assetPath)
      ? ArSplitPackageRelativePathOuter(assetPath)[0] : assetPath)
  }

  // _GetExtension (resolver.cpp:611-630): the extension of the innermost
  // packaged path.
  override getExtension(assetPath: string): string {
    const { resolver } = this._getResolver(assetPath)
    if (ArIsPackageRelativePath(assetPath)) {
      return resolver.getExtension(ArSplitPackageRelativePathInner(assetPath)[1])
    }
    return resolver.getExtension(assetPath)
  }

  // _BindContext (resolver.cpp:638-666): the primary and URI resolvers that
  // implement contexts each bind the context with their own binding data.
  override bindContext(context: ArResolverContext, bindingData: { value?: unknown }): void {
    const contextData = this._contextResolvers().map(resolver => {
      const data: { value?: unknown } = {}
      resolver.bindContext(context, data)
      return { resolver, data }
    })
    bindingData.value = contextData
  }

  // _UnbindContext (resolver.cpp:668-708).
  override unbindContext(context: ArResolverContext, bindingData: { value?: unknown }): void {
    const contextData = bindingData.value as
      ReadonlyArray<{ resolver: ArResolver, data: { value?: unknown } }> | undefined
    for (const { resolver, data } of contextData ?? []) resolver.unbindContext(context, data)
  }

  // _CreateDefaultContext (resolver.cpp:710-729).
  override createDefaultContext(): ArResolverContext {
    return mergeContexts(this._contextResolvers().map(resolver => resolver.createDefaultContext()))
  }

  // _CreateContextFromString (resolver.cpp:731-739).
  override createContextFromString(contextStr: string): ArResolverContext
  override createContextFromString(uriScheme: string, contextStr: string): ArResolverContext
  override createContextFromString(first: string, second?: string): ArResolverContext {
    if (second !== undefined) return this._createContextFromSchemeString(first, second)
    if (!this.primary.info.implementsContexts) return new ArResolverContext()
    return this.primary.get()!.createContextFromString(first)
  }

  override createContextFromStrings(
    contextStrs: readonly (readonly [string, string])[],
  ): ArResolverContext {
    return this._createContextFromSchemeStrings(contextStrs)
  }

  // _CreateDefaultContextForAsset (resolver.cpp:741-768): a package-relative
  // path takes the default context of its outermost package.
  override createDefaultContextForAsset(assetPath: string): ArResolverContext {
    if (ArIsPackageRelativePath(assetPath)) {
      return this.createDefaultContextForAsset(ArSplitPackageRelativePathOuter(assetPath)[0])
    }
    return mergeContexts(this._contextResolvers().map(resolver =>
      resolver.createDefaultContextForAsset(assetPath)))
  }

  // _RefreshContext (resolver.cpp:770-785).
  override refreshContext(context: ArResolverContext): void {
    for (const resolver of this._contextResolvers()) resolver.refreshContext(context)
  }

  // _GetCurrentContext (resolver.cpp:787-818): each implementation's current
  // context merged over the context bound through this resolver.
  override getCurrentContext(): ArResolverContext {
    const contexts = this._contextResolvers().map(resolver => resolver.getCurrentContext())
    const bound = _getResolverContext(this)
    if (bound) contexts.push(bound)
    return mergeContexts(contexts)
  }

  // _Resolve (resolver.cpp:820-842): resolvers that do not implement scoped
  // caches have their results cached in the current cache scope.
  async resolve(assetPath: string, context?: ArResolverContext): Promise<ArResolvedPath> {
    return this._resolveHelper(assetPath, path => {
      const { info, resolver } = this._getResolver(path)
      if (!info.implementsScopedCaches) {
        const cache = _getResolverCacheData(this)
        if (cache instanceof DispatchingCacheData) {
          let resolved = cache.resolvedPaths.get(path)
          if (!resolved) {
            resolved = resolver.resolve(path, context)
            cache.resolvedPaths.set(path, resolved)
          }
          return resolved
        }
      }
      return resolver.resolve(path, context)
    }, context)
  }

  // _ResolveHelper (resolver.cpp:1347-1394): the outermost package path is
  // resolved as an asset, then each packaged path by the package resolver for
  // its enclosing package.
  private async _resolveHelper(
    path: string,
    resolve: (path: string) => Promise<ArResolvedPath>,
    context?: ArResolverContext,
  ): Promise<ArResolvedPath> {
    if (!ArIsPackageRelativePath(path)) return resolve(path)
    let [packagePath, packagedPath] = ArSplitPackageRelativePathOuter(path)
    let resolvedPackagePath = (await resolve(packagePath)).toString()
    if (!resolvedPackagePath) return new ArResolvedPath()
    while (packagedPath) {
      [packagePath, packagedPath] = ArSplitPackageRelativePathOuter(packagedPath)
      const packageResolver = this._getPackageResolver(resolvedPackagePath)
      if (!packageResolver) return new ArResolvedPath()
      packagePath = await packageResolver.resolve(resolvedPackagePath, packagePath, context)
      if (!packagePath) return new ArResolvedPath()
      resolvedPackagePath = ArJoinPackageRelativePath([resolvedPackagePath, packagePath])
    }
    return new ArResolvedPath(resolvedPackagePath)
  }

  /** @internal _Resolve (resolver.cpp:820-842) for a synchronous caller
   *  (prefetchedAssets.ts): only a non-packaged path the primary or URI
   *  resolver resolves as ArDefaultResolver does, on the filesystem. */
  _resolveFilesystemPathSync(assetPath: string): ArResolvedPath {
    if (ArIsPackageRelativePath(assetPath)) return new ArResolvedPath()
    const { resolver } = this._getResolver(assetPath)
    return resolver instanceof ArDefaultResolver ? resolver._resolveSync(assetPath) : new ArResolvedPath()
  }

  // _ResolveForNewAsset (resolver.cpp:844-855).
  override async resolveForNewAsset(
    assetPath: string,
    context?: ArResolverContext,
  ): Promise<ArResolvedPath> {
    const { resolver } = this._getResolver(assetPath)
    if (ArIsPackageRelativePath(assetPath)) {
      const [packagePath, packagedPath] = ArSplitPackageRelativePathOuter(assetPath)
      const resolved = await resolver.resolveForNewAsset(packagePath, context)
      return new ArResolvedPath(ArJoinPackageRelativePath([resolved.toString(), packagedPath]))
    }
    return resolver.resolveForNewAsset(assetPath, context)
  }

  // _GetAssetInfo (resolver.cpp:857-885).
  override getAssetInfo(assetPath: string, resolvedPath: ArResolvedPath): ArAssetInfo {
    const { resolver } = this._getResolver(assetPath)
    if (ArIsPackageRelativePath(assetPath)) {
      return resolver.getAssetInfo(
        ArSplitPackageRelativePathOuter(assetPath)[0],
        new ArResolvedPath(ArSplitPackageRelativePathOuter(resolvedPath.toString())[0]))
    }
    return resolver.getAssetInfo(assetPath, resolvedPath)
  }

  // _GetModificationTimestamp (resolver.cpp:887-899).
  override getModificationTimestamp(assetPath: string, resolvedPath: ArResolvedPath): ArTimestamp {
    const { resolver } = this._getResolver(assetPath)
    if (ArIsPackageRelativePath(assetPath)) {
      return resolver.getModificationTimestamp(
        ArSplitPackageRelativePathOuter(assetPath)[0],
        new ArResolvedPath(ArSplitPackageRelativePathOuter(resolvedPath.toString())[0]))
    }
    return resolver.getModificationTimestamp(assetPath, resolvedPath)
  }

  // _OpenAsset (resolver.cpp:901-918): a packaged asset is opened by the
  // package resolver for its enclosing package.
  async openAsset(
    resolvedPath: ArResolvedPath,
    context?: ArResolverContext,
  ): Promise<ArAsset | undefined> {
    const path = resolvedPath.toString()
    const { resolver } = this._getResolver(path)
    if (ArIsPackageRelativePath(path)) {
      const [packagePath, packagedPath] = ArSplitPackageRelativePathInner(path)
      const packageResolver = this._getPackageResolver(packagePath)
      return packageResolver ? packageResolver.openAsset(packagePath, packagedPath, context) : undefined
    }
    return resolver.openAsset(resolvedPath, context)
  }

  // _OpenAssetForWrite (resolver.cpp:920-930).
  override async openAssetForWrite(
    resolvedPath: ArResolvedPath,
    writeMode: ArResolverWriteMode = ArResolverWriteMode.Update,
  ): Promise<ArWritableAsset | undefined> {
    if (ArIsPackageRelativePath(resolvedPath.toString())) return undefined
    return this._getResolver(resolvedPath.toString()).resolver.openAssetForWrite(resolvedPath, writeMode)
  }

  // _CanWriteAssetToPath (resolver.cpp:932-945).
  override canWriteAssetToPath(resolvedPath: ArResolvedPath): boolean {
    if (ArIsPackageRelativePath(resolvedPath.toString())) return false
    return this._getResolver(resolvedPath.toString()).resolver.canWriteAssetToPath(resolvedPath)
  }

  // _BeginCacheScope (resolver.cpp:953-1001): the primary and URI resolvers
  // that implement scoped caches and every package resolver begin their own
  // scopes; a nested scope shares its parent's data.
  override beginCacheScope(parentData?: unknown): unknown {
    const parent = parentData instanceof DispatchingCacheData ? parentData : undefined
    const targets: Array<ArResolver | ArPackageResolver> = []
    this._findPluginResolvers()
    if (this.primary.info.implementsScopedCaches) targets.push(this.primary.get()!)
    for (const entry of this.uriResolvers.values()) {
      const resolver = entry.info.implementsScopedCaches ? entry.get() : undefined
      if (resolver) targets.push(resolver)
    }
    targets.push(...this._packageResolverInstances())
    const entries = targets.map(target => ({
      target,
      value: target.beginCacheScope(parent?.entries.find(entry => entry.target === target)?.value),
    }))
    return new DispatchingCacheData(parent?.resolvedPaths ?? new Map(), entries)
  }

  // _EndCacheScope (resolver.cpp:1003-1044).
  override endCacheScope(cacheScopeData: unknown): void {
    if (!(cacheScopeData instanceof DispatchingCacheData)) return
    for (const { target, value } of cacheScopeData.entries) target.endCacheScope(value)
  }
}

// A resolver installed directly by a test keeps receiving every context and
// cache-scope call, as when it was ArGetResolver() itself.
function primaryOverrideInfo(resolver: ArResolver): ResolverInfo {
  if (resolver.constructor === ArDefaultResolver) return resolverInfo(_defaultResolverType)!
  return {
    plugin: undefined,
    type: TfType.getUnknownType(),
    uriSchemes: [],
    canBePrimaryResolver: true,
    implementsContexts: true,
    implementsScopedCaches: true,
  }
}

// _InitializePrimaryResolver (resolver.cpp:1046-1127): the preferred
// resolver, else the first plugin primary resolver, else ArDefaultResolver.
function initializePrimaryResolver(availableResolvers: readonly ResolverInfo[]): _Resolver {
  let resolverType = _defaultResolverType
  const primaryResolvers = getAvailablePrimaryResolvers(availableResolvers)
  if (TfGetEnvSetting(PXR_AR_DISABLE_PLUGIN_RESOLVER)) {
    // Plugin asset resolver disabled via PXR_AR_DISABLE_PLUGIN_RESOLVER.
  } else if (preferredResolver !== '') {
    // PlugRegistry::FindTypeByName.
    const preferredResolverType = TfType.findByName(preferredResolver)
    if (preferredResolverType.isUnknown()) {
      postWarning(`ArGetResolver(): Preferred resolver ${preferredResolver} not found. Using default resolver.`)
    } else if (!preferredResolverType.isA(_resolverType)) {
      postWarning(`ArGetResolver(): Preferred resolver ${preferredResolver} does not derive from ArResolver. ` +
        'Using default resolver.\n')
    } else {
      resolverType = preferredResolverType
    }
  } else if (primaryResolvers.length > 0) {
    resolverType = primaryResolvers[0]!.type
  }
  // resolver.cpp:1103-1121.
  const create = (type: TfType): _Resolver | undefined => {
    const info = primaryResolvers.find(candidate => candidate.type === type)
    return info ? new _Resolver(info, createResolver(type)) : undefined
  }
  return create(resolverType) ?? create(_defaultResolverType)!
}

let preferredResolver = ''
let resolver: _DispatchingResolver | undefined
const resolverReplacementListeners = new Set<() => void>()

function _getDispatchingResolver(): _DispatchingResolver {
  return resolver ??= new _DispatchingResolver()
}

/** @internal The resolver ArGetResolver returns, if it has been created. */
export function _currentDispatchingResolver(): ArResolver | undefined { return resolver }

export function ArSetPreferredResolver(resolverTypeName: string): void {
  if (resolver) throw new Error('ArSetPreferredResolver must be called before ArGetResolver')
  preferredResolver = resolverTypeName
}

// ArGetResolver (resolver.cpp:1781-1785).
export function ArGetResolver(): ArResolver { return _getDispatchingResolver() }

/** @internal See _DispatchingResolver._resolveFilesystemPathSync. */
export function _resolveFilesystemPathSync(assetPath: string): ArResolvedPath {
  return _getDispatchingResolver()._resolveFilesystemPathSync(assetPath)
}

// ArGetAvailableResolvers (resolver.cpp:1800-1809): the primary resolver
// types, excluding those under construction, ArDefaultResolver last.
export function ArGetAvailableResolvers(): TfType[] {
  return getAvailablePrimaryResolvers(getAvailableResolvers()).map(info => info.type)
}

// ArCreateResolver (resolver.cpp:1811-1815).
export function ArCreateResolver(resolverType: TfType): ArResolver {
  return createResolver(resolverType)
}

// ArGetRegisteredURISchemes (resolver.cpp:1787-1793).
export function ArGetRegisteredURISchemes(): string[] {
  return _getDispatchingResolver().getURISchemes()
}

// ArGetUnderlyingResolver (resolver.cpp:1795-1799).
export function ArGetUnderlyingResolver(): ArResolver {
  return _getDispatchingResolver().getPrimaryResolver()
}

/** @internal Test harness: installs `next` as the primary resolver behind
 * ArGetResolver (or reinstalls a resolver ArGetResolver returned before). */
export function _setResolverForTest(next: ArResolver): void {
  resolver = next instanceof _DispatchingResolver ? next : new _DispatchingResolver(next)
  for (const listener of resolverReplacementListeners) listener()
}

/** @internal Test harness: forgets the resolver ArGetResolver created and the
 * preferred resolver, as a new process would. */
export function _resetResolverForTest(): void {
  resolver = undefined
  preferredResolver = ''
  for (const listener of resolverReplacementListeners) listener()
}

/** @internal Migration cleanup for users of the removed resolver setter. */
export function _onResolverReplaced(listener: () => void): () => void {
  resolverReplacementListeners.add(listener)
  return () => resolverReplacementListeners.delete(listener)
}

export async function openAssetBytes(assetPath: string, selected = ArGetResolver(), context = selected.createDefaultContext()): Promise<Uint8Array> {
  const resolved = await selected.resolve(assetPath, context)
  if (!resolved.valid) throw new Error(`Could not resolve asset: ${assetPath}`)
  const asset = await selected.openAsset(resolved, context)
  if (!asset) throw new Error(`Could not open asset: ${resolved}`)
  return asset.getBuffer()
}

export function splitPackagePath(path: string): { packagePath: string; innerPath: string } | null { if (!ArIsPackageRelativePath(path)) return null; const [packagePath, innerPath] = ArSplitPackageRelativePathOuter(path); return { packagePath, innerPath } }
export function joinPackagePath(packagePath: string, innerPath: string): string { return ArJoinPackageRelativePath([packagePath, innerPath]) }
export function dirname(path: string): string { const index = path.lastIndexOf('/'); return index >= 0 ? path.slice(0, index) : '.' }
export function isAbsolute(path: string): boolean { return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path) || /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(path) }
export function normalizeRelative(path: string): string { const parts:string[]=[]; for(const segment of path.split('/')){if(segment===''||segment==='.')continue;if(segment==='..'&&parts.length&&parts.at(-1)!=='..')parts.pop();else parts.push(segment)}return parts.join('/') }
export function normalizePath(path: string): string { const scheme=/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.exec(path);if(scheme){const rest=path.slice(scheme[0].length);const slash=rest.indexOf('/');if(slash<0)return path;return scheme[0]+rest.slice(0,slash+1)+normalizeRelative(rest.slice(slash+1))}return(path.startsWith('/')?'/':'')+normalizeRelative(path) }
export function resolvePath(anchorPath:string,path:string):string{if(isAbsolute(path))return path;const directory=dirname(anchorPath);return normalizePath(directory==='.'?path:`${directory}/${path}`)}
export function resolveAssetPath(anchorLayerPath:string,assetPath:string):string{if(!assetPath)return'';const clean=assetPath.replace(/^@/,'').replace(/@$/,'').trim();const pkg=splitPackagePath(anchorLayerPath);if(pkg&&!isAbsolute(clean)){const dir=dirname(pkg.innerPath);const inner=dir==='.'||dir===pkg.innerPath?clean:`${dir}/${clean}`;return joinPackagePath(pkg.packagePath,normalizeRelative(inner))}return resolvePath(anchorLayerPath,clean)}
