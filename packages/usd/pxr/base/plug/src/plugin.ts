// Ported from OpenUSD 26.11.1: pxr/base/plug/plugin.cpp,
//  pxr/base/plug/plugin.h, pxr/usd/usd/schemaRegistry.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PlugPlugin — port of pxr/base/plug/plugin.{h,cpp}, the metadata slice.
//
// Upstream a plugin wraps a shared library (or python module, or bare
// resource dir) plus its plugInfo metadata; UsdSchemaRegistry consumes ONLY
// the metadata + resource files, never the library ("We don't load the
// plugin, we just use its metadata", schemaRegistry.cpp). The TS port keeps
// exactly that consumed surface: per-type metadata dicts and named
// resources. A plugin registered from a plugInfo URL loads its LibraryPath
// ES module with import(), the analog of dlopen (see LoadAsync).

import { Type as TfType, TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import type { PlugInfoPlugin, PlugInfoTypeEntry, PlugResources } from './info.ts'
import type { PlugRegistry } from './registry.ts'

/** @internal Locations computed from the plugInfo document's URL
 *  (Plug_RegistrationMetadata, info.cpp:595-690). */
export interface PlugPluginLocations {
  readonly libraryUrl: string
  readonly resourceUrl: string
}

/** @internal How a module is imported; tests substitute their own. */
export type PlugModuleImporter = (url: string) => Promise<unknown>
const importModule: PlugModuleImporter = (url) => import(/* @vite-ignore */ url)

export class PlugPlugin {
  readonly #info: PlugInfoPlugin
  readonly #resources: PlugResources
  readonly #locations: PlugPluginLocations | undefined
  readonly #registry: PlugRegistry | undefined
  #isLoaded: boolean
  #loading: Promise<boolean> | undefined

  /** @internal Constructed by PlugRegistry.RegisterPlugins only. */
  constructor(info: PlugInfoPlugin, resources: PlugResources,
    locations?: PlugPluginLocations, registry?: PlugRegistry) {
    this.#info = info
    this.#resources = resources
    this.#locations = locations
    this.#registry = registry
    // A plugin registered without a plugInfo URL is part of this build, like
    // a plugin in a monolithic or static build whose LibraryPath is empty
    // (plugin.cpp:229-235): there is nothing to load.
    this.#isLoaded = !this.#libraryUrl()
  }

  #libraryUrl(): string {
    return this.isResource() || this.isPythonModule() ? '' : this.#locations?.libraryUrl ?? ''
  }

  /** The plugin's name (plugInfo `Name`). */
  getName(): string {
    return this.#info.Name
  }

  /**
   * PlugPlugin::Load (plugin.cpp:323-355). Loading a module is asynchronous
   * on the web, so the synchronous call can only report an already-loaded
   * plugin. An unloaded module plugin is a coding error here and returns
   * false; load it first with LoadAsync.
   */
  Load(): boolean {
    if (this.#isLoaded) return true
    postCodingError(`Plugin '${this.getName()}' must be loaded with LoadAsync before use: ` +
      `'${this.getPath()}'`)
    return false
  }

  /**
   * Loads the plugin and, first, the plugins it depends on
   * (_LoadWithDependents, plugin.cpp:260-321). A library plugin's module is
   * imported once; its top-level code registers its types' factories, as a
   * shared library's static initializers do when dlopen loads it
   * (_Load, plugin.cpp:202-254). Concurrent calls share one load.
   */
  loadAsync(): Promise<boolean> {
    if (this.#isLoaded) return Promise.resolve(true)
    return this.#loading ??= this.#loadWithDependents(new Set()).finally(() => {
      this.#loading = undefined
    })
  }

  async #loadWithDependents(seenPlugins: Set<string>): Promise<boolean> {
    if (this.#isLoaded) return true
    if (seenPlugins.has(this.getName())) {
      postCodingError(`Load failed because of cyclic dependency for '${this.getName()}'`)
      return false
    }
    seenPlugins.add(this.getName())
    for (const [baseTypeName, dependents] of Object.entries(this.getDependencies())) {
      if (TfType.findByName(baseTypeName).isUnknown()) {
        postCodingError(`Load failed: unknown base class '${baseTypeName}'`)
        return false
      }
      if (!Array.isArray(dependents) || dependents.some(name => typeof name !== 'string')) {
        postCodingError('Load failed: dependency list has wrong type')
        return false
      }
      for (const dependName of dependents as string[]) {
        const dependType = TfType.findByName(dependName)
        if (dependType.isUnknown()) {
          postCodingError(`Load failed: unknown dependent class '${dependName}'`)
          return false
        }
        const dependPlugin = this.#registry?.getPluginForType(dependType)
        if (!dependPlugin) {
          postCodingError(`Load failed: unknown dependent plugin '${dependName}'`)
          return false
        }
        if (!await dependPlugin.#loadWithDependents(seenPlugins)) {
          postCodingError(`Load failed: unable to load dependent plugin '${dependName}'`)
          return false
        }
      }
    }
    return this.#load()
  }

  async #load(): Promise<boolean> {
    if (this.#isLoaded) return true
    const path = this.#libraryUrl()
    try {
      await (this.#registry?._moduleImporter ?? importModule)(path)
    } catch (error) {
      postCodingError(`Failed to load plugin '${this.getName()}': ` +
        `${error instanceof Error ? error.message : String(error)} in '${path}'`)
      return false
    }
    return (this.#isLoaded = true)
  }

  isLoaded(): boolean { return this.#isLoaded }
  isPythonModule(): boolean { return this.#info.Type === 'python' }
  getPath(): string { return this.#locations?.libraryUrl ?? this.#info.LibraryPath ?? this.#info.Root ?? '' }
  GetResourcePath(): string { return this.#locations?.resourceUrl ?? this.#info.ResourcePath ?? '' }
  getDependencies(): Record<string, unknown> {
    return (this.#info.Info?.PluginDependencies as Record<string, unknown> | undefined) ?? {}
  }
  makeResourcePath(path: string): string {
    if (path.startsWith('/')) return path
    const base = this.GetResourcePath().replace(/\/+$/, '')
    return base ? `${base}/${path}` : path
  }
  /** plugin.cpp:388-396: MakeResourcePath(path), cleared when `verify` and
   *  TfPathExists fails. The files under the resource directory are the
   *  resources attached at registration, so the path exists when it names
   *  one of them or a directory holding one (TfPathExists is true for
   *  directories, e.g. the 'shaders' search URI of the discovery plugins). */
  findPluginResource(path: string, verify = true): string {
    const result = this.makeResourcePath(path)
    if (verify && !this.#resourceExists(path)) return ''
    return result
  }

  #resourceExists(path: string): boolean {
    const name = path.replace(/\/+$/, '')
    if (this.hasResource(name)) return true
    const prefix = `${name}/`
    return Object.keys(this.#resources).some(key => key.startsWith(prefix))
  }

  /** True for `Type: "resource"` (codeless) plugins. */
  isResource(): boolean {
    return this.#info.Type === 'resource'
  }

  /** The top-level Info dict (e.g. Types, AutoApplyAPISchemas, SdfMetadata).
   *  The filesystem path keys (Root/LibraryPath/ResourcePath) are plugin
   *  fields, not metadata — exactly as upstream's plugin.metadata. */
  getMetadata(): Record<string, unknown> {
    return this.#info.Info ?? {}
  }

  /** The Info.Types entry for `type`, or {} if this plugin doesn't declare it.
   *  Mirrors PlugPlugin::GetMetadataForType. */
  getMetadataForType(type: TfType): Record<string, unknown> {
    const entry = this.#types()[type.getTypeName()]
    return (entry as Record<string, unknown> | undefined) ?? {}
  }

  /** Whether this plugin's Info.Types declares `type` — or, with
   *  `includeSubclasses`, any subclass of `type`.
   *  Mirrors PlugPlugin::DeclaresType(type, includeSubclasses = false). */
  declaresType(type: TfType, includeSubclasses = false): boolean {
    if (type.isUnknown()) return false
    for (const name of Object.keys(this.#types())) {
      const typeFromPlugin = TfType.findByName(name)
      const match = includeSubclasses ? typeFromPlugin.isA(type) : typeFromPlugin === type
      if (match) return true
    }
    return false
  }

  /** Whether a named resource was attached at registration. */
  hasResource(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.#resources, name)
  }

  /**
   * Resolve a named resource's content (e.g. 'generatedSchema.usda').
   * Upstream FindPluginResource returns a filesystem path the caller opens;
   * here resources are attached at registration as strings or async
   * loaders, so this resolves to the content itself.
   */
  async getResource(name: string): Promise<string> {
    const res = this.#resources[name]
    if (res === undefined) {
      throw new Error(`typescript-usd/plug: plugin '${this.getName()}' has no resource '${name}'`)
    }
    if (res instanceof Uint8Array) return new TextDecoder().decode(res)
    return typeof res === 'string' ? res : res()
  }

  /**
   * @internal Synchronous fast-path for string-valued resources (undefined
   * for absent resources AND for async loaders). Upstream reads resources
   * synchronously off disk (FindPluginResource + SdfLayer::OpenAsAnonymous,
   * schemaRegistry.cpp:788-794); the TS analog needs this seam so
   * UsdSchemaRegistry can stay synchronous when the content is an inline
   * string — which is how every vendored schema package attaches
   * generatedSchema.usda.
   */
  _getResourceSync(name: string): string | undefined {
    const res = this.#resources[name]
    if (res instanceof Uint8Array) return new TextDecoder().decode(res)
    return typeof res === 'string' ? res : undefined
  }

  /**
   * @internal The bytes of a resource attached as inline content (a string
   * as its UTF-8 encoding), or undefined for absent resources and async
   * loaders. Upstream a plugin resource is a file under the plugin's
   * resource directory (PlugPlugin::FindPluginResource, plugin.cpp:388-396)
   * that clients open by path; Ar's filesystem seam reads attached resources
   * through this as the files they stand for (ar/src/platformFilesystem.ts).
   */
  _getResourceBytesSync(name: string): Uint8Array | undefined {
    const res = this.#resources[name]
    if (res instanceof Uint8Array) return res
    return typeof res === 'string' ? new TextEncoder().encode(res) : undefined
  }

  /** @internal The resource's content as bytes, awaiting an async loader. */
  async _getResourceBytes(name: string): Promise<Uint8Array | undefined> {
    const res = this.#resources[name]
    if (res === undefined) return undefined
    if (res instanceof Uint8Array) return res
    return new TextEncoder().encode(typeof res === 'string' ? res : await res())
  }

  /**
   * @internal Declare this plugin's Info.Types into the TfType graph.
   * Faithful port of PlugPlugin::_DeclareTypes/_DeclareType/_DeclareAliases
   * (plugin.cpp): bases are declared by name if unknown; a type already
   * declared with bases KEEPS them (upstream reports a coding error when the
   * plugin's stated base isn't among them — tf has no diagnostics port, so
   * the keep-existing behavior stands alone); aliases with non-string values
   * are skipped. Returns the declared TfTypes for the registry's type→plugin
   * map.
   */
  _declareTypes(): TfType[] {
    const declared: TfType[] = []
    for (const [typeName, entryRaw] of Object.entries(this.#types())) {
      if (typeof entryRaw !== 'object' || entryRaw === null) continue
      const entry = entryRaw as PlugInfoTypeEntry
      declared.push(this.#declareType(typeName, entry))
    }
    return declared
  }

  #declareType(typeName: string, entry: PlugInfoTypeEntry): TfType {
    // Get the base types, declaring them if necessary (bases must be a
    // string array; anything else is ignored, as upstream's coding error).
    const basesVec: TfType[] = Array.isArray(entry.bases)
      ? entry.bases.filter((b): b is string => typeof b === 'string').map((b) => TfType.declare(b))
      : []

    const type = TfType.declare(typeName)

    // Upstream: if the type was already declared WITH bases (e.g. the class
    // was defined before registration), keep the existing bases. Our
    // TfType.Declare roots baseless types under GetRoot(), so "no bases
    // previously declared" reads as bases ⊆ {root}.
    const existingBases = type.getBaseTypes()
    const hasRealBases = existingBases.some((b) => !b.isRoot())
    if (!hasRealBases) {
      TfType.declare(typeName, basesVec)
    }

    this.#declareAliases(type, entry)
    return type
  }

  #declareAliases(type: TfType, entry: PlugInfoTypeEntry): void {
    const aliasDict = entry.alias
    if (typeof aliasDict !== 'object' || aliasDict === null) return
    for (const [baseName, aliasName] of Object.entries(aliasDict)) {
      // Upstream warns and skips non-string alias names.
      if (typeof aliasName !== 'string') continue
      const aliasBase = TfType.declare(baseName)
      type.addAlias(aliasBase, aliasName)
    }
  }

  #types(): Record<string, unknown> {
    const types = this.#info.Info?.Types
    return (types as Record<string, unknown> | undefined) ?? {}
  }
}

function postCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

export function PlugFindPluginResource(
  plugin: PlugPlugin | null | undefined,
  path: string,
  verify = true,
): string {
  return plugin?.findPluginResource(path, verify) ?? ''
}
