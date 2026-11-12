// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hio/stbImage.cpp, pxr/usd/sdf/usdzResolver.cpp,
//  pxr/usd/ar/resolver.cpp
// Copyright 2018, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { DefineResolver, InMemoryAsset, ResolvedPath, Resolver, ResolverContext } from 'typescript-usd/ar'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { usdviewLoadPath } from './resolved-path-display'

/** Read-only HTTP asset transport of one load: the fetch, cancellation and
 *  base URL the viewer's Ar resolver (UsdviewHttpResolver, below) reads that
 *  load's assets with. */
export class HttpResolver extends Resolver {
  private readonly baseUrl: string
  constructor(
    baseUrl: string,
    private readonly signal?: AbortSignal,
    private readonly fetchAsset: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    super()
    this.baseUrl = httpUrl(baseUrl).href
  }

  override createIdentifier(assetPath: string, anchor = new ResolvedPath()): string {
    if (!assetPath) return ''
    return httpUrl(assetPath, anchor.valid ? anchor.toString() : this.baseUrl).href
  }

  override async resolve(assetPath: string): Promise<ResolvedPath> {
    this.signal?.throwIfAborted()
    return new ResolvedPath(this.createIdentifier(assetPath))
  }

  override async openAsset(resolvedPath: ResolvedPath): Promise<InMemoryAsset | undefined> {
    this.signal?.throwIfAborted()
    if (!resolvedPath.valid) return undefined
    const url = httpUrl(resolvedPath.toString()).href
    const bytes = await this.bytesOf(url)
    this.signal?.throwIfAborted()
    return new InMemoryAsset(bytes)
  }

  // An asset is opened more than once per load: Storm opens each texture
  // with no resolver context or cache scope (hio/stbImage.cpp:373-379), so
  // every texture packaged in a .usdz opens the whole package again
  // (sdf/usdzResolver.cpp:61-90, FindOrOpenZipFile outside a scope). Upstream
  // these are file reads that the OS's page cache serves; over HTTP each
  // would download the file again. So this transport hands every open of a
  // URL the same bytes while they are alive: a download in flight is
  // shared, and finished bytes are found again for as long as some reader
  // (the stage's open package, a texture load) still holds them. Nothing is
  // kept alive here (weak references), and the bytes are never written
  // (ArAsset buffers are read-only; image decodes copy them).
  private readonly downloads = new Map<string, Promise<Uint8Array>>()
  private readonly held = new Map<string, WeakRef<Uint8Array>>()
  private readonly released = new FinalizationRegistry<string>(url => {
    if (!this.held.get(url)?.deref()) this.held.delete(url)
  })

  private bytesOf(url: string): Promise<Uint8Array> {
    const live = this.held.get(url)?.deref()
    if (live) return Promise.resolve(live)
    let download = this.downloads.get(url)
    if (!download) {
      download = this.download(url)
      this.downloads.set(url, download)
      const settled = () => { if (this.downloads.get(url) === download) this.downloads.delete(url) }
      download.then(bytes => {
        settled()
        this.held.set(url, new WeakRef(bytes))
        this.released.register(bytes, url)
      }, settled)
    }
    return download
  }

  private async download(url: string): Promise<Uint8Array> {
    const response = await this.fetchAsset(url, this.signal ? { signal: this.signal } : {})
    this.signal?.throwIfAborted()
    if (!response.ok) throw new Error(`USD asset request failed (${response.status} ${response.statusText}): ${url}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}

function httpUrl(value: string, base?: string): URL {
  const url = new URL(value, base)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`USD viewer HTTP resolver does not support ${url.protocol} assets`)
  }
  // HTTP fragments are not sent to the server and must not split layer identity.
  url.hash = ''
  return url
}

/**
 * The ArResolverContext object (resolverContext.h:80-90: equality, ordering
 * and hash) that names the asset source of one load: its transport, an
 * HttpResolver or a local file mount (local-file-resolver.ts). The viewer's
 * resolver reads the load's assets through the source in the context, and
 * its resolved paths name the source, so each load's layers are its own and
 * an asset opened by resolved path alone (Storm's textures) is read the same
 * way.
 */
export class UsdviewAssetSource {
  readonly id = ++sourceSequence
  constructor(readonly transport: Resolver) {
    sources.set(this.id, new WeakRef(this))
    releasedSources.register(this, this.id)
  }
  equals(other: object): boolean { return this === other }
  lessThan(other: object): boolean { return this.id < (other as UsdviewAssetSource).id }
  hash(): number { return this.id }
}

let sourceSequence = 0
const sources = new Map<number, WeakRef<UsdviewAssetSource>>()
const releasedSources = new FinalizationRegistry<number>(id => {
  if (!sources.get(id)?.deref()) sources.delete(id)
})
const contexts = new WeakMap<Resolver, ResolverContext>()

/** A fresh immutable context per load isolates layer identity and cancellation. */
export function createHttpResolverContext(
  source: string,
  signal?: AbortSignal,
  fetchAsset?: typeof fetch,
): ResolverContext {
  return contextForResolver(new HttpResolver(source, signal, fetchAsset))
}

/** The resolver context of a load whose assets `transport` reads. */
export function contextForResolver(transport: Resolver): ResolverContext {
  let context = contexts.get(transport)
  if (!context) {
    context = new ResolverContext(new UsdviewAssetSource(transport))
    contexts.set(transport, context)
  }
  return context
}

// A resolved path names the load whose source resolved it:
// usdview-load:<source id>:<URL>. The scheme is one of the resolver's
// uriSchemes, so Ar dispatches resolved paths back to it.
const loadScheme = 'usdview-load'
const loadPath = usdviewLoadPath

function sourcePath(source: UsdviewAssetSource, url: string): string {
  return `${loadScheme}:${source.id}:${url}`
}

// A path's URL, and the source a resolved path names (if it is still alive).
function parsePath(path: string): { url: string, named: boolean, source?: UsdviewAssetSource } {
  const match = loadPath.exec(path)
  if (!match) return { url: path, named: false }
  const source = sources.get(Number(match[1]))?.deref()
  return { url: match[2]!, named: true, ...(source ? { source } : {}) }
}

/** A per-load asset host a read without a source can be routed to: the
 *  scene's own transport (local files, HTTP with the load's fetch and
 *  cancellation). */
export interface AssetHost {
  readonly resolver: Resolver
  /** True when `url` belongs to this host (local mounts claim their prefix). */
  owns(url: string): boolean
}

const hosts: AssetHost[] = []
let fallback: HttpResolver | undefined

/** Make `host` serve reads of its URLs that name no source (a URL a UDIM
 *  tile or other unresolved path is built from) until the returned function
 *  is called. Later hosts win. */
export function registerAssetHost(host: AssetHost): () => void {
  hosts.push(host)
  return () => { const i = hosts.indexOf(host); if (i >= 0) hosts.splice(i, 1) }
}

function hostFor(url: string): Resolver {
  for (let i = hosts.length - 1; i >= 0; i--) if (hosts[i]!.owns(url)) return hosts[i]!.resolver
  return fallback ??= new HttpResolver(globalThis.location?.href ?? 'http://localhost/')
}

/**
 * The viewer's Ar resolver: a URI resolver plugin for the http and https
 * schemes (and the usdview-load scheme of its resolved paths), registered as
 * OpenUSD resolver plugins are, with ArDefineResolver and a plugInfo.json
 * "Types" entry (ar/resolver.cpp:208-285, 1129-1205). It implements
 * contexts: a stage's resolver context holds the UsdviewAssetSource of its
 * load, and its identifiers are context-dependent (each load resolves them
 * to its own resolved paths). Without a source in the context or the
 * resolved path, a URL is read by the scene host that owns it, else over
 * plain HTTP.
 */
export class UsdviewHttpResolver extends Resolver {
  // The source of the anchor's load, else of the bound context.
  override createIdentifier(assetPath: string, anchor = new ResolvedPath()): string {
    if (!assetPath) return ''
    const path = parsePath(assetPath)
    const base = anchor.valid ? parsePath(anchor.toString()) : undefined
    const source = base?.source ?? path.source ?? this.getCurrentContext().get(UsdviewAssetSource)
    const transport = source?.transport ?? hostFor(base?.url ?? path.url)
    return base ? transport.createIdentifier(path.url, new ResolvedPath(base.url)) : transport.createIdentifier(path.url)
  }

  override isContextDependentPath(): boolean { return true }

  override async resolve(assetPath: string, context = this.getCurrentContext()): Promise<ResolvedPath> {
    const path = parsePath(assetPath)
    const source = context.get(UsdviewAssetSource) ?? path.source
    if (!source) return hostFor(path.url).resolve(path.url)
    const resolved = await source.transport.resolve(path.url)
    return resolved.valid ? new ResolvedPath(sourcePath(source, resolved.toString())) : resolved
  }

  override async openAsset(resolvedPath: ResolvedPath, context = this.getCurrentContext()): Promise<InMemoryAsset | undefined> {
    const path = parsePath(resolvedPath.toString())
    const source = path.named ? path.source : context.get(UsdviewAssetSource)
    return (source?.transport ?? hostFor(path.url)).openAsset(new ResolvedPath(path.url)) as Promise<InMemoryAsset | undefined>
  }
}

// AR_DEFINE_RESOLVER(UsdviewHttpResolver, ArResolver) and the viewer's
// plugInfo.json. The viewer is part of this build, so the plugin has nothing
// to load.
DefineResolver('UsdviewHttpResolver', UsdviewHttpResolver)
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{
    Name: 'usdview',
    Type: 'library',
    Info: {
      Types: {
        UsdviewHttpResolver: {
          bases: ['ArResolver'],
          uriSchemes: ['http', 'https', loadScheme],
          implementsContexts: true,
        },
      },
    },
  }],
})
