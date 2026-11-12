// Ported from OpenUSD 26.11.1: pxr/base/plug/registry.cpp,
//  pxr/base/plug/registry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PlugRegistry — port of pxr/base/plug/registry.{h,cpp}.
//
// Discovery: upstream discovers plugins by scanning the PXR_PLUGINPATH_NAME
// directories for plugInfo.json on the first registry query
// (_RegisterAllPlugins). A host with an environment and files (Node) does the
// same here; a browser page has no filesystem to scan (the ONE deliberate
// substrate divergence, graded in the plug faithfulness report), so a plugin
// is registered by handing RegisterPlugins
// the parsed plugInfo document plus its resources (bundled string, fetch,
// OPFS), or by naming plugInfo URLs to RegisterPluginsAsync, the analog of
// RegisterPlugins(pathToPlugInfo). Everything downstream of discovery is faithful: registration
// declares the plugin's Types into the TfType graph exactly like
// PlugPlugin::_DeclareTypes (TfType.Declare(name, bases) + AddAlias from the
// alias dict — from JSON alone, no class needed: this is why codeless
// schemas work), first registration of a name wins and re-registration is a
// no-op, and registration listeners mirror PlugNotice::DidRegisterPlugins
// (one notice per RegisterPlugins call that registered anything).

import { Type as TfType, TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import type { PlugInfo, PlugInfoPlugin, PlugResources } from './info.ts'
import type { PlugHostFiles } from './hostFiles.ts'
import { PlugPlugin, type PlugModuleImporter, type PlugPluginLocations } from './plugin.ts'
import { Plug_GetPaths, Plug_GetenvBool } from './initConfig.ts'
import { Plug_HostFiles } from './hostFiles.ts'

/** Options for registering a parsed plugInfo document. */
export interface PlugRegisterPluginsOptions {
  /**
   * The URL the plugInfo document was read from. Root, LibraryPath and
   * ResourcePath resolve against it as upstream resolves them against the
   * plugInfo.json path (info.cpp:595-690), and a library plugin then loads
   * its LibraryPath ES module on demand (PlugPlugin.LoadAsync). Without it,
   * plugins are part of this build and have nothing to load.
   */
  plugInfoUrl?: string
}

/** Options for PlugRegistry.RegisterPluginsAsync. */
export interface PlugRegisterPluginsAsyncOptions {
  /** The fetch used to read plugInfo documents and resources. */
  fetch?: typeof fetch
}

export type PlugDidRegisterPluginsListener = (newPlugins: PlugPlugin[]) => void

export class PlugRegistry {
  static #instance: PlugRegistry | undefined

  readonly #pluginsByName = new Map<string, PlugPlugin>()
  // Type → providing plugin (upstream's _classMap; first claim wins).
  readonly #pluginsByType = new Map<TfType, PlugPlugin>()
  readonly #listeners = new Set<PlugDidRegisterPluginsListener>()

  // PlugPlugin::_RegisterAllPlugins's std::call_once (registry.cpp:311-338).
  #registeredAll = false

  private constructor() {}

  /** Singleton, as upstream (PlugRegistry::GetInstance). */
  static GetInstance(): PlugRegistry {
    return (PlugRegistry.#instance ??= new PlugRegistry())
  }

  /**
   * Register the plugins described by a plugInfo document. `resources` maps
   * plugin Name → named resource contents/loaders (e.g.
   * { usdGeom: { 'generatedSchema.usda': text } }). Declares each new
   * plugin's Info.Types into the TfType graph (bases + aliases), skips
   * plugin names already registered (first registration wins, as upstream),
   * and — when anything new registered — notifies DidRegisterPlugins
   * listeners once with the newly registered plugins.
   * Returns the newly registered plugins.
   */
  RegisterPlugins(plugInfo: PlugInfo, resources?: Record<string, PlugResources>,
    options: PlugRegisterPluginsOptions = {}): PlugPlugin[] {
    const newPlugins: PlugPlugin[] = []
    for (const entry of plugInfo.Plugins ?? []) {
      if (typeof entry?.Name !== 'string' || entry.Name === '') continue
      if (this.#pluginsByName.has(entry.Name)) continue
      const locations = options.plugInfoUrl === undefined
        ? undefined : pluginLocations(entry as PlugInfoPlugin, options.plugInfoUrl)
      const plugin = new PlugPlugin(entry as PlugInfoPlugin, resources?.[entry.Name] ?? {}, locations, this)
      this.#pluginsByName.set(entry.Name, plugin)
      newPlugins.push(plugin)
    }

    // Types are declared after all of the call's plugins are inserted,
    // mirroring _RegisterPlugins (read/insert phase, then _DeclareTypes).
    for (const plugin of newPlugins) {
      for (const type of plugin._declareTypes()) {
        // Upstream's _classMap: first plugin to claim a type provides it;
        // later claims are a coding error upstream and are ignored here.
        if (!this.#pluginsByType.has(type)) this.#pluginsByType.set(type, plugin)
      }
    }

    if (newPlugins.length > 0) {
      for (const listener of [...this.#listeners]) listener([...newPlugins])
    }
    return newPlugins
  }

  /**
   * Reads and registers the plugInfo documents at the given URLs (absolute,
   * or relative to the page), following
   * their Includes. Mirrors PlugRegistry::RegisterPlugins(pathsToPlugInfo)
   * (registry.cpp:69-109; info.cpp:184-276): a URL ending in '/' names its
   * plugInfo.json, '#' comment lines are allowed, each document is read
   * once, and DidRegisterPlugins listeners are notified once for the call.
   * Includes containing wildcards are reported and skipped: a URL space
   * cannot be listed. A library plugin's module is not imported until the
   * plugin is loaded. A schema plugin's generatedSchema.usda is read now,
   * because the schema registry reads plugin resources synchronously
   * (schemaRegistry.cpp:788-794).
   */
  async registerPluginsAsync(pathsToPlugInfo: string | readonly string[],
    options: PlugRegisterPluginsAsyncOptions = {}): Promise<PlugPlugin[]> {
    const fetchText = async (url: string): Promise<string | undefined> => {
      const response = await (options.fetch ?? globalThis.fetch)(url)
      return response.ok ? response.text() : undefined
    }
    const visited = new Set<string>()
    const documents: { url: string, plugInfo: PlugInfo }[] = []
    const read = async (pathname: string): Promise<void> => {
      let url = pathname
      if (url.endsWith('/')) url += 'plugInfo.json'
      if (visited.has(url)) return
      visited.add(url)
      const text = await fetchText(url).catch(() => undefined)
      if (text === undefined) {
        postRuntimeError(`Plugin info file ${url} couldn't be read`)
        return
      }
      let top: unknown
      try { top = JSON.parse(stripComments(text)) } catch (error) {
        postRuntimeError(`Plugin info file ${url} couldn't be read: ${String(error)}`)
        return
      }
      if (typeof top !== 'object' || top === null || Array.isArray(top)) {
        postRuntimeError(`Plugin info file ${url} did not contain a JSON object`)
        return
      }
      const plugInfo = top as PlugInfo
      if (plugInfo.Plugins !== undefined && !Array.isArray(plugInfo.Plugins)) {
        postRuntimeError(`Plugin info file ${url} key 'Plugins' doesn't hold an array`)
      } else {
        documents.push({ url, plugInfo })
      }
      const includes = plugInfo.Includes
      if (includes === undefined) return
      if (!Array.isArray(includes)) {
        postRuntimeError(`Plugin info file ${url} key 'Includes' doesn't hold an array`)
        return
      }
      await Promise.all(includes.map((include, j) => {
        if (typeof include !== 'string') {
          postRuntimeError(`Plugin info file ${url} key 'Includes' index ${j} doesn't hold a string`)
          return undefined
        }
        if (/[*?]/.test(include)) {
          postRuntimeError(`Plugin info file ${url} include '${include}' uses wildcards, which URLs cannot list`)
          return undefined
        }
        return read(new URL(include, url).href)
      }))
    }
    const paths = typeof pathsToPlugInfo === 'string' ? [pathsToPlugInfo] : pathsToPlugInfo
    // A relative URL is relative to the page, as a relative path is to the
    // working directory.
    const base = (globalThis as { location?: { href?: string } }).location?.href
    await Promise.all(paths.map(path => read(new URL(path, base).href)))

    const resources: { url: string, plugInfo: PlugInfo, resources: Record<string, PlugResources> }[] = []
    for (const { url, plugInfo } of documents) {
      const entries: Record<string, PlugResources> = {}
      for (const entry of plugInfo.Plugins ?? []) {
        if (typeof entry?.Name !== 'string' || this.#pluginsByName.has(entry.Name)) continue
        if (!declaresSchemaTypes(entry)) continue
        const resourceUrl = pluginLocations(entry, url).resourceUrl
        const schema = await fetchText(new URL('generatedSchema.usda', withSlash(resourceUrl)).href)
          .catch(() => undefined)
        if (schema !== undefined) entries[entry.Name] = { 'generatedSchema.usda': schema }
      }
      resources.push({ url, plugInfo, resources: entries })
    }
    const newPlugins: PlugPlugin[] = []
    const listeners = this.#listeners
    // One DidRegisterPlugins notice for the whole call (registry.cpp:96-108).
    const held = [...listeners]
    listeners.clear()
    try {
      for (const document of resources) {
        newPlugins.push(...this.RegisterPlugins(document.plugInfo, document.resources,
          { plugInfoUrl: document.url }))
      }
    } finally {
      for (const listener of held) listeners.add(listener)
    }
    if (newPlugins.length > 0) {
      for (const listener of [...listeners]) listener([...newPlugins])
    }
    return newPlugins
  }

  /** @internal How library plugin modules are imported (tests substitute). */
  _moduleImporter: PlugModuleImporter | undefined

  /** The plugin that declares `type`, or null. Mirrors GetPluginForType
   *  (plugin.cpp:443-458: plugins on the search path register first). */
  getPluginForType(type: TfType): PlugPlugin | null {
    this._registerAllPlugins()
    if (type.isUnknown()) return null
    return this.#pluginsByType.get(type) ?? null
  }

  /** plugin.cpp:402-426 (_GetPluginWithName registers all plugins first). */
  GetPluginWithName(name: string): PlugPlugin | null {
    this._registerAllPlugins()
    return this.#pluginsByName.get(name) ?? null
  }

  /** plugin.cpp:428-441 (_GetAllPlugins registers all plugins first). */
  getAllPlugins(): PlugPlugin[] {
    this._registerAllPlugins()
    return [...this.#pluginsByName.values()]
  }

  /**
   * PlugPlugin::_RegisterAllPlugins (registry.cpp:311-338): once, unless
   * PXR_DISABLE_STANDARD_PLUG_SEARCH_PATH is set, register the plugInfo
   * documents on the plugin search path (Plug_GetPaths: PXR_PLUGINPATH_NAME),
   * in path order, then send one DidRegisterPlugins notice. Only a host with
   * an environment and files (Node) has a search path; a browser page
   * registers plugins with RegisterPluginsAsync.
   */
  _registerAllPlugins(): void {
    if (this.#registeredAll) return
    this.#registeredAll = true
    if (Plug_GetenvBool('PXR_DISABLE_STANDARD_PLUG_SEARCH_PATH')) return
    const files = Plug_HostFiles()
    if (!files) return
    const paths = Plug_GetPaths(files.libraryDirectory)
    if (paths.length === 0) return
    const documents = readPlugInfoFiles(paths, files)
    const newPlugins: PlugPlugin[] = []
    const listeners = this.#listeners
    const held = [...listeners]
    listeners.clear()
    try {
      for (const { url, plugInfo } of documents) {
        const resources: Record<string, PlugResources> = {}
        for (const entry of plugInfo.Plugins ?? []) {
          if (typeof entry?.Name !== 'string' || this.#pluginsByName.has(entry.Name)) continue
          if (!declaresSchemaTypes(entry)) continue
          // As RegisterPluginsAsync: the schema registry reads
          // generatedSchema.usda synchronously (schemaRegistry.cpp:788-794).
          const schema = files.readText(files.urlToPath(
            new URL('generatedSchema.usda', withSlash(pluginLocations(entry, url).resourceUrl)).href))
          if (schema !== undefined) resources[entry.Name] = { 'generatedSchema.usda': schema }
        }
        newPlugins.push(...this.RegisterPlugins(plugInfo, resources, { plugInfoUrl: url }))
      }
    } finally {
      for (const listener of held) listeners.add(listener)
    }
    if (newPlugins.length > 0) {
      for (const listener of [...listeners]) listener([...newPlugins])
    }
  }

  /** All types derived from `base` (delegates to the TfType graph).
   *  Mirrors PlugRegistry::GetAllDerivedTypes. */
  static getAllDerivedTypes(base: TfType): TfType[] {
    return base.getAllDerivedTypes()
  }

  /** Convenience metadata read for a declared type (upstream
   *  GetStringFromPluginMetaData and friends collapse to this). */
  getMetadataForType(type: TfType): Record<string, unknown> {
    return this.getPluginForType(type)?.getMetadataForType(type) ?? {}
  }

  /**
   * Subscribe to registrations (mirrors PlugNotice::DidRegisterPlugins).
   * Returns an unsubscribe function. UsdSchemaRegistry's additive
   * registration (RFC §3.4) hangs off this.
   */
  addDidRegisterPluginsListener(listener: PlugDidRegisterPluginsListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
}

// _ReadPlugInfoObject (info.cpp:150-170): '#' starts a comment line; the line
// is kept empty so JSON error positions stay meaningful.
function stripComments(text: string): string {
  return text.split('\n').map(line => /^[ \t]*#/.test(line) ? '' : line).join('\n')
}

function declaresSchemaTypes(entry: PlugInfoPlugin): boolean {
  const types = Object.values(entry.Info?.Types ?? {})
  return types.some(type => typeof type === 'object' && type !== null && 'schemaKind' in type)
}

/**
 * Plug_ReadPlugInfo (info.cpp:716-764) over the host's files, in path order:
 * a path ending in '/' or naming a directory reads its plugInfo.json
 * (info.cpp:737-753, _ReadPlugInfo info.cpp:192-201), each file is read once,
 * '#' comment lines are allowed (info.cpp:153-164), and Includes are read
 * relative to their document (info.cpp:235-260). A file that cannot be opened
 * is skipped silently, as upstream (info.cpp:147-151, a debug message only).
 * Paths must be absolute (info.cpp:389-393). Wildcards (info.cpp:392-446,
 * TfGlob and a recursive '**' walk) are reported and skipped.
 */
function readPlugInfoFiles(paths: readonly string[], files: PlugHostFiles): { url: string, plugInfo: PlugInfo }[] {
  const visited = new Set<string>()
  const documents: { url: string, plugInfo: PlugInfo }[] = []
  const read = (pathname: string): void => {
    if (pathname === '') return
    if (!pathname.startsWith('/')) {
      postRuntimeError(`Plugin info file ${pathname} is not absolute`)
      return
    }
    if (pathname.includes('*')) {
      postRuntimeError(`Plugin info file ${pathname} uses wildcards, which are not supported here`)
      return
    }
    if (pathname.endsWith('/')) pathname += 'plugInfo.json'
    if (visited.has(pathname)) return
    visited.add(pathname)
    const text = files.readText(pathname)
    if (text === undefined) return
    let top: unknown
    try { top = JSON.parse(stripComments(text)) } catch (error) {
      postRuntimeError(`Plugin info file ${pathname} couldn't be read: ${String(error)}`)
      return
    }
    if (typeof top !== 'object' || top === null || Array.isArray(top)) {
      postRuntimeError(`Plugin info file ${pathname} did not contain a JSON object`)
      return
    }
    const plugInfo = top as PlugInfo
    if (plugInfo.Plugins !== undefined && !Array.isArray(plugInfo.Plugins)) {
      postRuntimeError(`Plugin info file ${pathname} key 'Plugins' doesn't hold an array`)
    } else {
      documents.push({ url: files.pathToUrl(pathname), plugInfo })
    }
    const includes = plugInfo.Includes
    if (includes === undefined) return
    if (!Array.isArray(includes)) {
      postRuntimeError(`Plugin info file ${pathname} key 'Includes' doesn't hold an array`)
      return
    }
    includes.forEach((include, j) => {
      if (typeof include !== 'string') {
        postRuntimeError(`Plugin info file ${pathname} key 'Includes' index ${j} doesn't hold a string`)
        return
      }
      // _MergePaths (info.cpp:66-84), keeping a trailing slash.
      const merged = include.startsWith('/') ? include
        : files.urlToPath(new URL(include, files.pathToUrl(pathname)).href) + (include.endsWith('/') ? '/' : '')
      read(merged.replace(/\/\/+$/, '/'))
    })
  }
  for (const pathname of paths) {
    // info.cpp:737-748: a directory need not end in '/'.
    read(!pathname.endsWith('/') && !pathname.includes('*') && files.isDirectory(pathname) ? pathname + '/' : pathname)
  }
  return documents
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

// Plug_RegistrationMetadata (info.cpp:595-690): Root is relative to the
// plugInfo document, LibraryPath and ResourcePath to Root. With no Root the
// root is the document's directory; with no ResourcePath it is the root.
function pluginLocations(entry: PlugInfoPlugin, plugInfoUrl: string): PlugPluginLocations {
  const root = new URL(typeof entry.Root === 'string' && entry.Root !== '' ? withSlash(entry.Root) : './', plugInfoUrl).href
  const libraryUrl = typeof entry.LibraryPath === 'string' && entry.LibraryPath !== ''
    ? new URL(entry.LibraryPath, root).href : ''
  const resourceUrl = typeof entry.ResourcePath === 'string' && entry.ResourcePath !== ''
    ? new URL(withSlash(entry.ResourcePath), root).href : root
  return { libraryUrl, resourceUrl }
}

function postRuntimeError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}
