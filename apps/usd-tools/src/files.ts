// The files a tool page's resolver sees: the samples shipped with the pages
// (public/samples, fetched on first read) and files the viewer picked, each
// at an absolute path as on a command line: /samples/<sample>/... and
// /files/<name>.
//
// The resolver is an ArDefaultResolver subclass registered as a plugin and
// chosen with ArSetPreferredResolver, as a custom resolver is upstream
// (ar/resolver.h, defineResolver.h). Other paths go to ArDefaultResolver,
// which serves the plugins' resource files (e.g. usdShaders' shaderDefs.usda
// for the Sdr registry, ar/src/platformFilesystem.ts). It reads only, so
// tools that write files (usdcat -o) write /out/ paths to memory here for
// the page to hand to the viewer; other writes go to the host filesystem,
// which a page may install (memfs.ts) and otherwise fail as read-only.
import {
  DefaultResolver as ArDefaultResolver, DefaultResolverContext as ArDefaultResolverContext,
  IsPackageRelativePath as ArIsPackageRelativePath, DefineResolver as ArDefineResolver, InMemoryAsset as ArInMemoryAsset, ResolvedPath as ArResolvedPath,
  type ResolverContext as ArResolverContext, SetPreferredResolver as ArSetPreferredResolver, type Asset as ArAsset, WritableAsset as ArWritableAsset, ResolverWriteMode as ArResolverWriteMode,
} from 'typescript-usd/ar'
import { isAbsolute, normalizePath, resolveAssetPath } from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

export interface Sample {
  name: string
  title: string
  root: string
  source: string
  url: string
  licence: string
  from: string
}

interface Manifest { samples: Sample[], files: string[] }

// The pages' root folder: src/ in development, assets/ when built.
const siteRoot = new URL('../', import.meta.url)
const sampleFiles = new Set<string>()
const pickedFiles = new Map<string, File>()
const reads = new Map<string, Promise<Uint8Array | undefined>>()

async function read(path: string): Promise<Uint8Array | undefined> {
  const picked = pickedFiles.get(path)
  if (picked) return new Uint8Array(await picked.arrayBuffer())
  if (!sampleFiles.has(path)) return undefined
  const response = await fetch(new URL(path.slice(1).split('/').map(encodeURIComponent).join('/'), siteRoot))
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined
}

const ours = (path: string): boolean => path.startsWith('/samples/') || path.startsWith('/files/')
const outputs = new Map<string, Uint8Array>()
const isOutput = (path: string): boolean => path.startsWith('/out/')

/** Collects one write in memory; close() stores it at its path. */
class MemoryWritableAsset extends ArWritableAsset {
  #bytes = new Uint8Array(0)
  #length = 0
  constructor(private readonly path: string, initial?: Uint8Array) {
    super()
    if (initial) { this.#bytes = initial.slice(); this.#length = initial.byteLength }
  }
  async write(buffer: Uint8Array, offset: number): Promise<number> {
    const end = offset + buffer.byteLength
    if (end > this.#bytes.byteLength) {
      const grown = new Uint8Array(Math.max(end, this.#bytes.byteLength * 2))
      grown.set(this.#bytes)
      this.#bytes = grown
    }
    this.#bytes.set(buffer, offset)
    this.#length = Math.max(this.#length, end)
    return buffer.byteLength
  }
  async close(): Promise<boolean> {
    outputs.set(this.path, this.#bytes.slice(0, this.#length))
    return true
  }
}
const exists = (path: string): boolean => pickedFiles.has(path) || sampleFiles.has(path)
// A search path: relative, and not ./ or ../ (ar/defaultResolver.cpp:52-60).
const isSearchPath = (path: string): boolean =>
  path !== '' && !isAbsolute(path) && !path.startsWith('./') && !path.startsWith('../')

// ArDefaultResolver's lookups (defaultResolver.cpp:189-225 _Resolve and
// :133-157 _CreateIdentifier) with these files' existence in place of the
// filesystem's.
class ToolPageResolver extends ArDefaultResolver {
  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()): string {
    if (ArIsPackageRelativePath(assetPath) || !anchor.valid || !ours(anchor.toString()) || !isSearchPath(assetPath)) {
      return super.createIdentifier(assetPath, anchor)
    }
    // A search path that exists next to its anchor is that file; otherwise
    // it stays a search path.
    const anchored = normalizePath(resolveAssetPath(anchor.toString(), assetPath))
    return exists(anchored) ? anchored : normalizePath(assetPath)
  }
  override async resolve(assetPath: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    if (isSearchPath(assetPath) && !ArIsPackageRelativePath(assetPath)) {
      const bound = context.get(ArDefaultResolverContext)
      for (const prefix of bound?.searchPath ?? []) {
        const candidate = normalizePath(`${prefix}/${assetPath}`)
        if (ours(candidate) && exists(candidate)) return new ArResolvedPath(candidate)
      }
      return super.resolve(assetPath, context)
    }
    const path = normalizePath(assetPath)
    if (!ours(path)) return super.resolve(assetPath, context)
    return new ArResolvedPath(exists(path) ? path : '')
  }
  override createIdentifierForNewAsset(assetPath: string, anchor = new ArResolvedPath()): string {
    const path = normalizePath(assetPath)
    return isOutput(path) ? path : super.createIdentifierForNewAsset(assetPath, anchor)
  }
  override async resolveForNewAsset(assetPath: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    const path = normalizePath(assetPath)
    return isOutput(path) ? new ArResolvedPath(path) : super.resolveForNewAsset(assetPath, context)
  }
  override canWriteAssetToPath(resolvedPath: ArResolvedPath): boolean {
    return isOutput(resolvedPath.toString()) || super.canWriteAssetToPath(resolvedPath)
  }
  override async openAssetForWrite(resolvedPath: ArResolvedPath, writeMode = ArResolverWriteMode.Update): Promise<ArWritableAsset | undefined> {
    const path = resolvedPath.toString()
    // Elsewhere, the host filesystem decides (memfs.ts where a page installs it).
    if (!isOutput(path)) return super.openAssetForWrite(resolvedPath, writeMode)
    return new MemoryWritableAsset(path, writeMode === ArResolverWriteMode.Update ? outputs.get(path) : undefined)
  }
  override async openAsset(resolvedPath: ArResolvedPath, context?: ArResolverContext): Promise<ArAsset | undefined> {
    const path = resolvedPath.toString()
    const written = outputs.get(path)
    if (written) return new ArInMemoryAsset(written)
    if (!ours(path)) return super.openAsset(resolvedPath, context)
    let bytes = reads.get(path)
    if (!bytes) reads.set(path, bytes = read(path))
    const data = await bytes
    return data ? new ArInMemoryAsset(data) : undefined
  }
}

ArDefineResolver('UsdToolsPageResolver', ToolPageResolver, ['ArDefaultResolver'])
PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
  Type: 'library', Name: 'usdToolsPageResolver',
  Info: { Types: { UsdToolsPageResolver: { bases: ['ArDefaultResolver'] } } },
}] })
ArSetPreferredResolver('UsdToolsPageResolver')

/** The samples shipped with the pages. */
export async function loadSamples(): Promise<Sample[]> {
  const response = await fetch(new URL('samples/manifest.json', siteRoot))
  const manifest = await response.json() as Manifest
  for (const file of manifest.files) sampleFiles.add(`/samples/${file}`)
  return manifest.samples
}

/** Makes picked files readable at /files/<name> (or the relative path a
 *  folder pick gives) and returns those paths. */
export function addPickedFiles(files: Iterable<File>): string[] {
  const paths: string[] = []
  for (const file of files) {
    const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const path = normalizePath(`/files/${name}`)
    pickedFiles.set(path, file)
    reads.delete(path)
    paths.push(path)
  }
  return paths
}

export const sampleRootPath = (sample: Sample): string => `/samples/${sample.root}`

/** What a tool wrote to `path` (under /out/), removed from the page's
 *  memory as it is taken. */
export function takeOutput(path: string): Uint8Array | undefined {
  const bytes = outputs.get(path)
  outputs.delete(path)
  return bytes
}

/** The bytes of a sample or picked file. */
export async function readFile(path: string): Promise<Uint8Array | undefined> {
  return read(path)
}

/** Makes files readable at /files/<path> (a path relative to what was
 *  dropped or picked, so a folder keeps its layout) and returns the paths. */
export function addFilesAt(entries: readonly { path: string, file: File }[]): string[] {
  return entries.map(({ path: relative, file }) => {
    const path = normalizePath(`/files/${relative}`)
    pickedFiles.set(path, file)
    reads.delete(path)
    return path
  })
}

/** Lets go of picked files (their bytes and anything read from them). */
export function forgetFiles(paths: Iterable<string>): void {
  for (const path of paths) { pickedFiles.delete(path); reads.delete(path) }
}

/** Every sample or picked file under `folder` (e.g. /samples/heath/). */
export function filesUnder(folder: string): string[] {
  const prefix = folder.endsWith('/') ? folder : `${folder}/`
  return [...sampleFiles, ...pickedFiles.keys()].filter(p => p.startsWith(prefix)).sort()
}
