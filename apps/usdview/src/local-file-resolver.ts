// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/ar/defaultResolver.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { InMemoryAsset, ResolvedPath, Resolver } from 'typescript-usd/ar'
import { contextForResolver, HttpResolver } from './http-resolver'
import type { LocalAssetSet } from './local-assets'

const LOCAL_ORIGIN = 'https://local-file.invalid'
const sceneExtension = /\.(usd|usda|usdc|usdz)$/i

function mountPath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid local asset path: ${path}. Supply paths relative to the selected folder.`)
  }
  return path
}
const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

/** Read-only per-load file mount, with explicit HTTP(S) dependencies delegated to Ar transport. */
class LocalFileResolver extends Resolver {
  /** Mount violations (escaping or malformed paths) reject the load. */
  private failure: Error | undefined
  /** Missing dependencies and failed reads are diagnostics, as in native USD:
   * ArDefaultResolver returns an empty path for a missing file
   * (ar/defaultResolver.cpp:192,220) and UsdStage reports the composition
   * error as a warning (usd/stage.cpp:3326). */
  private readonly warningList: string[] = []
  private readonly reads = new Map<string, Promise<Uint8Array>>()
  private readonly http: HttpResolver
  assertComplete() { if (this.failure) throw this.failure }
  warnings(): readonly string[] { return this.warningList }
  private warn(message: string): void { if (!this.warningList.includes(message)) this.warningList.push(message) }
  constructor(
    private readonly url: string,
    private readonly prefix: string,
    private readonly files: ReadonlyMap<string, File>,
    private readonly signal?: AbortSignal,
    fetchAsset?: typeof fetch,
  ) {
    super()
    this.http = new HttpResolver(url, signal, fetchAsset)
  }
  private fail(message: string): never {
    const error = new Error(message)
    this.failure ??= error
    throw error
  }
  private local(url: URL): boolean { return url.origin === LOCAL_ORIGIN }
  override createIdentifier(path: string, anchor = new ResolvedPath()): string {
    if (!path) return ''
    const base = new URL(anchor.valid ? anchor.toString() : this.url)
    // Relative references in remote layers stay remote; a local mount must not
    // redirect them to similarly named local files.
    if (!this.local(base)) return this.http.createIdentifier(path, anchor)
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path)
      if (!this.local(url)) return this.http.createIdentifier(path)
      if (!url.href.startsWith(this.prefix) || url.search || url.hash) return this.fail(`Local asset escapes the selected mount: ${path}`)
      return url.href
    }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
      return this.fail(`Local asset path is not a relative path or HTTP(S) URL: ${path}`)
    }
    // Local USD filenames are filesystem-style names, not URL-escaped strings.
    // Encode each component so spaces, #, ? and literal % remain filename data.
    const url = new URL(encodePath(path), base)
    if (!url.href.startsWith(this.prefix)) return this.fail(`Local asset escapes the selected mount: ${path}`)
    return url.href
  }
  override async resolve(path: string): Promise<ResolvedPath> {
    this.signal?.throwIfAborted()
    const identifier = this.createIdentifier(path)
    if (!identifier) return new ResolvedPath()
    const url = new URL(identifier)
    if (!this.local(url)) return this.http.resolve(identifier)
    if (!this.files.has(identifier)) {
      this.warn(`Local file dependency is unavailable: ${decodeURIComponent(url.pathname.slice(new URL(this.prefix).pathname.length))}. Include it in the selected files/folder.`)
      return new ResolvedPath()
    }
    return new ResolvedPath(identifier)
  }
  override async openAsset(path: ResolvedPath): Promise<InMemoryAsset | undefined> {
    this.signal?.throwIfAborted()
    if (!path.valid) return undefined
    try {
      const resolved = await this.resolve(path.toString())
      if (!this.local(new URL(resolved.toString()))) return await this.http.openAsset(resolved)
      const identifier = resolved.toString()
      let read = this.reads.get(identifier)
      if (!read) {
        const file = this.files.get(identifier)!
        read = file.arrayBuffer().then(bytes => new Uint8Array(bytes))
        this.reads.set(identifier, read)
      }
      const bytes = await read
      this.signal?.throwIfAborted()
      return new InMemoryAsset(bytes)
    } catch (error) {
      if (!this.signal?.aborted) this.warn(error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}

export async function createLocalFilesContext(source: LocalAssetSet, signal?: AbortSignal, fetchAsset?: typeof fetch, mountPrefix?: string) {
  signal?.throwIfAborted()
  const rootPath = mountPath(source.rootPath)
  if (!sceneExtension.test(rootPath)) throw new Error('Choose a .usd, .usda, .usdc or .usdz root scene.')
  const prefix = mountPrefix ?? `${LOCAL_ORIGIN}/${crypto.randomUUID()}/`
  const files = new Map<string, File>()
  for (const entry of source.files) {
    const path = mountPath(entry.path), url = prefix + encodePath(path)
    if (files.has(url)) throw new Error(`Duplicate local asset path: ${path}`)
    files.set(url, entry.file)
  }
  const url = prefix + encodePath(rootPath)
  if (!files.has(url)) throw new Error(`Root scene is not among the selected files: ${rootPath}`)
  const resolver = new LocalFileResolver(url, prefix, files, signal, fetchAsset)
  return { url, prefix, resolver: resolver as Resolver, context: contextForResolver(resolver), assertComplete: () => resolver.assertComplete(), warnings: () => resolver.warnings() }
}

export async function createLocalFileContext(file: File, signal?: AbortSignal, fetchAsset?: typeof fetch, mountPrefix?: string) {
  return createLocalFilesContext({ rootPath: file.name, files: [{ path: file.name, file }] }, signal, fetchAsset, mountPrefix)
}
