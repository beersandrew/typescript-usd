// Ported from OpenUSD 26.11.1: pxr/usd/sdr/registry.cpp,
//  pxr/usd/sdr/registry.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { SdrShaderNodeDiscoveryResult } from './shaderNode.ts'
import { SdrShaderNode } from './shaderNode.ts'
import { SdrShaderNodeQuery, SdrShaderNodeQueryResult, _setDefaultQueryRunner, runNodeQuery } from './shaderNodeQuery.ts'
import { SdrVersion, type SdrVersionFilter } from './declare.ts'
import type { SdrMetadata, SdrShaderProperty } from './shaderNode.ts'
import { SdrShaderPropertyGetDefaultValueAsSdfType, sdfValueTypeNameGetType } from './shaderPropertyValue.ts'
import {
  Hash as TfHash, HashCombine as TfHashCombine, Type as TfType, TfEnvSetting, TfGetEnvSetting,
  TfDiagnosticMgr, TfDiagnosticType, Error as TfError,
} from 'typescript-usd/tf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import type { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'

// OpenUSD v26.11.1 registry.cpp:414-503: unique sorted identifiers and
// caller-specified shading-system priority.
// Lazy discovery, parser selection and lookup follow registry.cpp:181-882;
// query execution follows registry.cpp:884-1058.

export interface SdrParserPlugin {
  parseShaderNode(result: SdrShaderNodeDiscoveryResult): SdrShaderNode | undefined
  // parserPlugin.h:132 GetDiscoveryTypes: the discovery types (file
  // formats) this parser handles; the registry maps each to the parser.
  getDiscoveryTypes?(): string[]
  // parserPlugin.h:136 GetShadingSystem; the base implementation
  // (parserPlugin.cpp:39-55) falls back to the deprecated GetSourceType
  // (parserPlugin.h:141). See parserShadingSystem below.
  getShadingSystem?(): string
  getSourceType?(): string
}

// SdrParserPlugin::GetShadingSystem (parserPlugin.cpp:39-55): an
// unimplemented GetShadingSystem returns GetSourceType().
function parserShadingSystem(parser: SdrParserPlugin): string {
  return parser.getShadingSystem?.() ?? parser.getSourceType?.() ?? ''
}
export interface SdrDiscoveryPlugin { discoverShaderNodes(): SdrShaderNodeDiscoveryResult[]; getSearchURIs?(): string[] }

// discoveryPlugin.cpp:13-16 and parserPlugin.cpp:23-26:
// TfType::Define<SdrDiscoveryPlugin>() and TfType::Define<SdrParserPlugin>(),
// the bases plugInfo "Types" entries derive their plugins from
// (sdr/plugInfo.json).
const _discoveryPluginType = TfType.define('SdrDiscoveryPlugin')
const _parserPluginType = TfType.define('SdrParserPlugin')

/** SdrDiscoveryPluginFactoryBase (discoveryPlugin.h:157-162): the TfType
 *  factory SdrRegistry instantiates a discovery plugin with. */
export interface SdrDiscoveryPluginFactoryBase { 'new'(): SdrDiscoveryPlugin }
/** SdrParserPluginFactoryBase (parserPlugin.h:153-157). */
export interface SdrParserPluginFactoryBase { 'new'(): SdrParserPlugin }

/**
 * SDR_REGISTER_DISCOVERY_PLUGIN (discoveryPlugin.h:26-31): defines the
 * plugin's TfType, derived from SdrDiscoveryPlugin, with the factory
 * SdrRegistry instantiates it with. A plugin's module calls this at its top
 * level, where upstream calls it from a TF_REGISTRY_FUNCTION(TfType); the
 * type name is the one its plugInfo.json "Types" declares, which is how
 * SdrRegistry finds it (registry.cpp:1050-1090).
 */
export function SdrRegisterDiscoveryPlugin(
  typeName: string, pluginClass: new () => SdrDiscoveryPlugin,
): TfType {
  const type = TfType.define(typeName, [_discoveryPluginType])
  type.setFactory({ new: () => new pluginClass() } satisfies SdrDiscoveryPluginFactoryBase)
  _pluginTypesGeneration++
  return type
}

/** SDR_REGISTER_PARSER_PLUGIN (parserPlugin.h:27-32); as
 *  SdrRegisterDiscoveryPlugin, for a parser plugin. */
export function SdrRegisterParserPlugin(
  typeName: string, pluginClass: new () => SdrParserPlugin,
): TfType {
  const type = TfType.define(typeName, [_parserPluginType])
  type.setFactory({ new: () => new pluginClass() } satisfies SdrParserPluginFactoryBase)
  _pluginTypesGeneration++
  return type
}

// registry.cpp:34-47.
const PXR_SDR_SKIP_DISCOVERY_PLUGIN_DISCOVERY = new TfEnvSetting<boolean>(
  'PXR_SDR_SKIP_DISCOVERY_PLUGIN_DISCOVERY', false,
  'The auto-discovery of discovery plugins in sdr can be skipped. This is used mostly for testing purposes.')
const PXR_SDR_SKIP_PARSER_PLUGIN_DISCOVERY = new TfEnvSetting<boolean>(
  'PXR_SDR_SKIP_PARSER_PLUGIN_DISCOVERY', false,
  'The auto-discovery of parser plugins in sdr can be skipped. This is used mostly for testing purposes.')
const PXR_SDR_DISABLE_PLUGINS = new TfEnvSetting<string>(
  'PXR_SDR_DISABLE_PLUGINS', '',
  'Comma separated list of Sdr plugins to disable.  Note that disabling plugins may cause shaders in your scenes to malfunction.')

// PLATFORM-DIVERGENCE(sdr-plugin-late-registration): upstream registers
// every plugin before SdrRegistry is constructed and loads a plugin
// synchronously when its factory is asked for (TfType::GetFactory runs the
// type's definition callback, PlugPlugin::_DefineType -> Load), so the
// constructor finds and instantiates all plugins once (registry.cpp:274-280,
// 1050-1164). On the web plugins are registered at any time and a library
// plugin's module (import()) loads asynchronously, so a plugin type may be
// declared before its module has set its factory. The registry therefore
// looks for plugin types again whenever plugins were registered or a factory
// was set since it last looked (_FindAndInstantiatePlugins), and a type whose
// plugin is not loaded yet, or has no factory yet, is instantiated when it
// does instead of failing TF_VERIFY(pluginFactory).
let _pluginTypesGeneration = 0
PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => { _pluginTypesGeneration++ })

function _disabledPlugins(): Set<string> {
  return new Set(String(TfGetEnvSetting(PXR_SDR_DISABLE_PLUGINS)).split(',').filter(name => name !== ''))
}

// The plugin types derived from `base` that have not been instantiated and
// whose plugin can be instantiated now (see sdr-plugin-late-registration),
// in type-name order (registry.cpp:1116-1124: TfType's operator< is not
// stable, so the order is by type name).
function _instantiableTypes(base: TfType, instantiated: Set<TfType>): TfType[] {
  const registry = PlugRegistry.GetInstance()
  return [...new Set(PlugRegistry.getAllDerivedTypes(base))]
    .filter(type => !instantiated.has(type))
    .filter(type => {
      const plugin = registry.getPluginForType(type)
      return (!plugin || plugin.isLoaded()) && type.getFactory() !== undefined
    })
    .sort(_byTypeName)
}

function _byTypeName(a: TfType, b: TfType): number {
  return a.getTypeName() < b.getTypeName() ? -1 : a.getTypeName() > b.getTypeName() ? 1 : 0
}

// TfType::Find(*parserPlugin) for _InstantiateParserPlugins' coding error:
// the type each parser plugin was instantiated from.
const _parserPluginTypes = new WeakMap<SdrParserPlugin, TfType>()

function _postCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

export class SdrRegistry {
  // TfSingleton<SdrRegistry>: constructed on first use (registry.cpp:284-288).
  private static instance: SdrRegistry | undefined
  static getInstance(): SdrRegistry { return this.instance ??= new SdrRegistry() }
  private readonly _results: SdrShaderNodeDiscoveryResult[] = []
  private readonly nodes = new Map<string, SdrShaderNode>()
  private readonly _parsers = new Map<string, SdrParserPlugin>()
  private readonly _searchUris = new Set<string>()
  // Every read of the registry's plugins and results first instantiates
  // plugins found since the last read (sdr-plugin-late-registration).
  private get results(): SdrShaderNodeDiscoveryResult[] { this._FindAndInstantiatePlugins(); return this._results }
  private get parsers(): Map<string, SdrParserPlugin> { this._FindAndInstantiatePlugins(); return this._parsers }
  private get searchUris(): Set<string> { this._FindAndInstantiatePlugins(); return this._searchUris }
  // The plugin types instantiated from Plug, and the plugin generation they
  // were looked for at (sdr-plugin-late-registration).
  private readonly instantiatedPluginTypes = new Set<TfType>()
  private pluginTypesGeneration = -1

  // SdrRegistry::SdrRegistry (registry.cpp:274-280): find and instantiate
  // the parser plugins, then the discovery plugins, and run discovery, which
  // happens on the registry's first use (sdr-plugin-late-registration).
  // Public, unlike upstream's TfSingleton, so tests can use a registry of
  // their own.
  constructor() {}

  // The constructor's plugin discovery, run again for plugins registered or
  // given factories since (sdr-plugin-late-registration).
  private _FindAndInstantiatePlugins(): void {
    if (this.pluginTypesGeneration === _pluginTypesGeneration) return
    this.pluginTypesGeneration = _pluginTypesGeneration
    this._FindAndInstantiateParserPlugins()
    this._RunDiscoveryPlugins(this._FindAndInstantiateDiscoveryPlugins())
  }

  // _FindAndInstantiateDiscoveryPlugins (registry.cpp:1050-1090).
  private _FindAndInstantiateDiscoveryPlugins(): SdrDiscoveryPlugin[] {
    // The auto-discovery of discovery plugins can be skipped. This is mostly
    // for testing purposes.
    if (TfGetEnvSetting(PXR_SDR_SKIP_DISCOVERY_PLUGIN_DISCOVERY)) return []
    const disabledPlugins = _disabledPlugins()
    const discoveryPlugins: SdrDiscoveryPlugin[] = []
    for (const discoveryPluginType of _instantiableTypes(_discoveryPluginType, this.instantiatedPluginTypes)) {
      this.instantiatedPluginTypes.add(discoveryPluginType)
      if (disabledPlugins.has(discoveryPluginType.getTypeName())) continue
      const pluginFactory = discoveryPluginType.getFactory<SdrDiscoveryPluginFactoryBase>()
      if (pluginFactory) discoveryPlugins.push(pluginFactory.new())
    }
    return discoveryPlugins
  }

  // _FindAndInstantiateParserPlugins (registry.cpp:1093-1107).
  private _FindAndInstantiateParserPlugins(): void {
    // The auto-discovery of parser plugins can be skipped. This is mostly
    // for testing purposes.
    if (TfGetEnvSetting(PXR_SDR_SKIP_PARSER_PLUGIN_DISCOVERY)) return
    const parserPluginTypes = _instantiableTypes(_parserPluginType, this.instantiatedPluginTypes)
    for (const type of parserPluginTypes) this.instantiatedPluginTypes.add(type)
    this._InstantiateParserPlugins(parserPluginTypes)
  }

  // _InstantiateParserPlugins (registry.cpp:1109-1164).
  private _InstantiateParserPlugins(parserPluginTypes: Iterable<TfType>): void {
    // Allow plugins to be disabled.
    const disabledPlugins = _disabledPlugins()
    // Ensure this list is in a consistent order to ensure stable behavior.
    const orderedPluginTypes = [...parserPluginTypes].sort(_byTypeName)
    for (const parserPluginType of orderedPluginTypes) {
      if (disabledPlugins.has(parserPluginType.getTypeName())) continue
      const pluginFactory = parserPluginType.getFactory<SdrParserPluginFactoryBase>()
      if (!pluginFactory) {
        _postCodingError(`Failed verification: ' pluginFactory '`)
        continue
      }
      const parserPlugin = pluginFactory.new()
      _parserPluginTypes.set(parserPlugin, parserPluginType)
      for (const discoveryType of parserPlugin.getDiscoveryTypes?.() ?? []) {
        // The first plugin to claim a discovery type keeps it, including a
        // parser given to SetExtraParserPlugins before this one was found.
        const other = this._parsers.get(discoveryType)
        if (other) {
          _postCodingError(`Plugin type ${parserPluginType.getTypeName()} claims discovery type ` +
            `'${discoveryType}' but that's already claimed by type ${_parserPluginTypes.get(other)?.getTypeName() ?? ''}`)
          continue
        }
        this._parsers.set(discoveryType, parserPlugin)
      }
    }
  }

  // _RunDiscoveryPlugins (registry.cpp:1166-1204), serially.
  private _RunDiscoveryPlugins(discoveryPlugins: readonly SdrDiscoveryPlugin[]): void {
    for (const plugin of discoveryPlugins) {
      for (const uri of plugin.getSearchURIs?.() ?? []) this.searchUris.add(uri)
      for (const result of plugin.discoverShaderNodes()) this.addDiscoveryResult(result)
    }
  }

  /**
   * SetExtraDiscoveryPlugins (registry.cpp:290-344): runs the given discovery
   * plugins, or instantiates the given SdrDiscoveryPlugin-derived types with
   * their factories and runs those.
   */
  setExtraDiscoveryPlugins(plugins: readonly SdrDiscoveryPlugin[] | readonly TfType[]): void {
    this._FindAndInstantiatePlugins()
    if (!plugins.every(plugin => plugin instanceof TfType)) {
      this._RunDiscoveryPlugins(plugins as readonly SdrDiscoveryPlugin[])
      return
    }
    // Validate the types and remove duplicates.
    const discoveryPluginTypes = new Set<TfType>()
    for (const type of plugins) {
      if (!type.isA(_discoveryPluginType)) {
        _postCodingError(`Failed verification: ' type.IsA(discoveryPluginType) ' -- ` +
          `Type ${type.getTypeName()} is not a ${_discoveryPluginType.getTypeName()}`)
        return
      }
      discoveryPluginTypes.add(type)
    }
    // Instantiate any discovery plugins that were found.
    const discoveryPlugins: SdrDiscoveryPlugin[] = []
    for (const discoveryPluginType of discoveryPluginTypes) {
      const pluginFactory = discoveryPluginType.getFactory<SdrDiscoveryPluginFactoryBase>()
      if (pluginFactory) discoveryPlugins.push(pluginFactory.new())
      else _postCodingError(`Failed verification: ' pluginFactory '`)
    }
    this._RunDiscoveryPlugins(discoveryPlugins)
  }

  /**
   * SetExtraParserPlugins (registry.cpp:363-393): instantiates the given
   * SdrParserPlugin-derived types with their factories, each parsing the
   * discovery types it reports. Also takes parser instances by discovery
   * type, which replace the parser of that type (tests use this to parse
   * against a stage of their own).
   */
  setExtraParserPlugins(plugins: Record<string, SdrParserPlugin> | Array<[string, SdrParserPlugin]> | readonly TfType[]): void {
    this._FindAndInstantiatePlugins()
    if (Array.isArray(plugins) && plugins.length > 0 && plugins.every(plugin => plugin instanceof TfType)) {
      // Validate the types and remove duplicates.
      const parserPluginTypes = new Set<TfType>()
      for (const type of plugins as readonly TfType[]) {
        if (!type.isA(_parserPluginType)) {
          _postCodingError(`Failed verification: ' type.IsA(parserPluginType) ' -- ` +
            `Type ${type.getTypeName()} is not a ${_parserPluginType.getTypeName()}`)
          return
        }
        parserPluginTypes.add(type)
      }
      this._InstantiateParserPlugins(parserPluginTypes)
      return
    }
    const entries = Array.isArray(plugins) ? plugins as Array<[string, SdrParserPlugin]> : Object.entries(plugins)
    for (const [type, plugin] of entries) this._parsers.set(type, plugin)
  }
  addDiscoveryResult(result: SdrShaderNodeDiscoveryResult): void { if (!this.results.some(item => item.identifier === result.identifier && item.sourceType === result.sourceType)) this.results.push(result) }
  getSearchURIs(): string[] { return [...this.searchUris] }
  getShaderNodeIdentifiers(functionName = '', filter: SdrVersionFilter = 'defaultOnly'): string[] { return this.results.filter(result => (!functionName || result.function === functionName) && (filter === 'allVersions' || result.version.isDefault)).map(result => result.identifier).filter((id, i, all) => all.indexOf(id) === i).sort() }
  getShaderNodeNames(functionName = ''): string[] { return [...new Set(this.results.filter(result => !functionName || result.function === functionName).map(result => result.name))].sort() }
  getAllShaderNodeSourceTypes(): string[] { return [...new Set(this.results.map(result => result.sourceType))].sort() }
  getShaderNodeByIdentifier(identifier: string, systemPriority: string[] = []): SdrShaderNode | undefined {
    if (systemPriority.length) {
      for (const system of systemPriority) { const node = this.getShaderNodeByIdentifierAndSystem(identifier, system); if (node) return node }
      return undefined
    }
    return this._firstNodeFor(result => result.identifier === identifier)
  }
  getShaderNodeByIdentifierAndSystem(identifier: string, shadingSystem: string): SdrShaderNode | undefined { return this.getShaderNodeByIdentifierAndType(identifier, shadingSystem) }
  getShaderNodeByIdentifierAndType(identifier: string, sourceType: string): SdrShaderNode | undefined { return this._firstNodeFor(result => result.identifier === identifier && result.sourceType === sourceType) }
  getShaderNodeByName(name: string, systemPriority: string[] | SdrVersionFilter = [], filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode | undefined {
    if (typeof systemPriority === 'string') { filter = systemPriority; systemPriority = [] }
    if (systemPriority.length) {
      for (const system of systemPriority) { const node = this.getShaderNodeByNameAndType(name, system, filter); if (node) return node }
      return undefined
    }
    return this._firstNodeFor(result => result.name === name && (filter === 'allVersions' || result.version.isDefault))
  }
  getShaderNodeByNameAndSystem(name: string, shadingSystem: string, filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode | undefined { return this.getShaderNodeByNameAndType(name, shadingSystem, filter) }
  getAllShaderNodeShadingSystems(): string[] { return this.getAllShaderNodeSourceTypes() }
  getShaderNodesByIdentifier(identifier: string): SdrShaderNode[] { return this._nodesFor(result => result.identifier === identifier) }
  getShaderNodesByName(name: string, filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode[] { return this._nodesFor(result => result.name === name && (filter === 'allVersions' || result.version.isDefault)) }
  getShaderNodesByFunction(functionName = '', filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode[] { return this._nodesFor(result => (!functionName || result.function === functionName) && (filter === 'allVersions' || result.version.isDefault)) }
  // GetShaderNodesByFamily (registry.cpp:781-787), deprecated in favor of
  // GetShaderNodesByFunction.
  getShaderNodesByFamily(family = '', filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode[] { return this.getShaderNodesByFunction(family, filter) }
  // GetShaderNodeFromAsset (registry.cpp:535-593).
  getShaderNodeFromAsset(
    shaderAsset: SdfAssetPath, metadata: Record<string, string> = {}, subIdentifier = '', shadingSystem = '',
  ): SdrShaderNode | undefined {
    const resolvedUri = shaderAsset.getResolvedPath() === '' ? shaderAsset.getAssetPath() : shaderAsset.getResolvedPath()
    const discoveryType = extensionOf(resolvedUri)
    const parser = this.parsers.get(discoveryType)
    if (!parser) return undefined
    const identifier = identifierForAsset(shaderAsset, metadata, subIdentifier, shadingSystem)
    const thisShadingSystem = shadingSystem !== '' ? shadingSystem : parserShadingSystem(parser)
    const existing = this.getShaderNodeByIdentifierAndSystem(identifier, shadingSystem)
    if (existing) return existing
    const dr: SdrShaderNodeDiscoveryResult = {
      identifier, version: new SdrVersion(), name: resolvedUri.slice(resolvedUri.lastIndexOf('/') + 1),
      function: '', discoveryType, sourceType: thisShadingSystem, uri: shaderAsset.getAssetPath(),
      resolvedUri, sourceCode: '', metadata, blindData: '', subIdentifier,
    }
    // _ParseNodeFromAssetOrSourceCode (registry.cpp:1215-1237).
    const node = parser.parseShaderNode(dr)
    if (!node || !validNode(node, dr)) return undefined
    this.addDiscoveryResult(dr)
    this.nodes.set(`${dr.identifier}\0${dr.sourceType}`, node)
    return node
  }
  getShaderNodeByNameAndType(name: string, sourceType: string, filter: SdrVersionFilter = 'defaultOnly'): SdrShaderNode | undefined { return this._firstNodeFor(result => result.name === name && result.sourceType === sourceType && (filter === 'allVersions' || result.version.isDefault)) }
  getAllShaderNodes(): SdrShaderNode[] { return this._nodesFor(() => true) }
  // OpenUSD v26.11.1 registry.cpp:596-655 GetShaderNodeFromSourceCode, with
  // _GetIdentifierForSourceCode (registry.cpp:166-175): the identifier is
  // TfHash of the source code combined with each metadata (key, value)
  // pair, in decimal. The new discovery result is added so later lookups
  // find the node.
  getShaderNodeFromSourceCode(sourceCode: string, shadingSystem: string, metadata: SdrMetadata = {}): SdrShaderNode | undefined {
    let parserForShadingSystem: SdrParserPlugin | undefined
    for (const parser of this.parsers.values()) {
      if (parserShadingSystem(parser) === shadingSystem) parserForShadingSystem = parser
    }
    if (!parserForShadingSystem) return undefined
    let h = TfHash(sourceCode)
    for (const [key, value] of Object.entries(metadata)) h = TfHashCombine(h, key, value)
    const identifier = h.toString()
    const existing = this.getShaderNodeByIdentifierAndType(identifier, shadingSystem)
    if (existing) return existing
    const result: SdrShaderNodeDiscoveryResult = {
      identifier, version: new SdrVersion(), name: identifier, function: '',
      discoveryType: shadingSystem, sourceType: shadingSystem, uri: '', resolvedUri: '',
      sourceCode, metadata,
    }
    const node = parserForShadingSystem.parseShaderNode(result)
    if (!node || (node.isValid() && (node.getIdentifier() !== identifier || node.getName() !== identifier
      || !node.getShaderVersion().equals(result.version) || node.getFunction() !== ''
      || node.getShadingSystem() !== shadingSystem))) return undefined
    this.addDiscoveryResult(result)
    this.nodes.set(`${identifier}\0${shadingSystem}`, node)
    return node
  }
  createQuery(): SdrShaderNodeQuery { return new SdrShaderNodeQuery(query => this.runQuery(query)) }
  runQuery(query: SdrShaderNodeQuery): SdrShaderNodeQueryResult { return runNodeQuery(query, this.getAllShaderNodes()) }
  // OpenUSD v26.11.1 registry.cpp:472-503 returns at the first parsed handle;
  // it must not invoke parsers for lower-priority alternatives afterwards.
  private _firstNodeFor(predicate: (result: SdrShaderNodeDiscoveryResult) => boolean): SdrShaderNode | undefined {
    for (const result of this.results) {
      if (!predicate(result)) continue
      const node = this._findOrParseNode(result)
      if (node) return node
    }
    return undefined
  }
  private _nodesFor(predicate: (result: SdrShaderNodeDiscoveryResult) => boolean): SdrShaderNode[] {
    const nodes: SdrShaderNode[] = []
    for (const result of this.results) {
      if (!predicate(result)) continue
      const node = this._findOrParseNode(result)
      if (node) nodes.push(node)
    }
    return nodes
  }
  private _findOrParseNode(result: SdrShaderNodeDiscoveryResult): SdrShaderNode | undefined {
    // OpenUSD v26.11.1 registry.cpp:1305-1331: parser selection is by
    // discovery type (file format), distinct from the shading system.
    const key = `${result.identifier}\0${result.sourceType}`
    const cached = this.nodes.get(key)
    if (cached) return cached
    const parser = this.parsers.get(result.discoveryType)
    if (!parser) return undefined
    const node = parser.parseShaderNode(result)
    if (!node) return undefined
    // _ValidateNode, registry.cpp:194-254: an invalid handle is retained;
    // a valid node whose identity disagrees with discovery is discarded.
    if (!validNode(node, result)) return undefined
    // registry.cpp:233-251: validate every property; _ValidateProperty
    // (registry.cpp:177-189) only warns.
    for (const name of node.getShaderInputNames()) validateProperty(node, node.getShaderInput(name)!)
    for (const name of node.getShaderOutputNames()) validateProperty(node, node.getShaderOutput(name)!)
    this.nodes.set(key, node)
    return node
  }
}

/**
 * SdrRegistry_ValidateProperty (registry.cpp:55-97): whether a non-empty
 * default value has the type of the property's SdfValueTypeName. On failure
 * `errorMessage.value` receives the reason. A freestanding function upstream
 * so that tests can exercise it; Python wraps it as Sdr._ValidateProperty
 * (wrapRegistry.cpp:26-52), exported here as `_validateProperty`.
 */
export function SdrRegistry_ValidateProperty(
  node: SdrShaderNode, property: SdrShaderProperty, errorMessage?: { value: string },
): boolean {
  const defaultValue = SdrShaderPropertyGetDefaultValueAsSdfType(property)
  const sdfType = property.getTypeAsSdfType()

  // We allow default values to be unspecified, but if they aren't empty, then
  // we want to error if the value's type is different from the specified type
  // for the property.
  if (!defaultValue.IsEmpty()) {
    const sdfTfType = sdfValueTypeNameGetType(sdfType)
    if (defaultValue.getType() !== sdfTfType) {
      if (errorMessage) {
        errorMessage.value =
          'Default value type does not match specified type for property.\n' +
          `Node identifier: ${node.getIdentifier()}\n` +
          `Shading system: ${node.getShadingSystem()}\n` +
          `Property name: ${property.getName()}.\n` +
          `Type from SdfType: ${sdfTfType?.getTypeName() ?? ''}.\n` +
          `Type from default value: ${defaultValue.getTypeName()}.\n`
      }
      return false
    }
  }
  return true
}

/** wrapRegistry.cpp:43-52 _ValidateProperty (Python's Sdr._ValidateProperty).
 *  Upstream returns an annotated bool carrying the error message; here the
 *  message is `errorMessage.value`. */
export function _validateProperty(
  node: SdrShaderNode, property: SdrShaderProperty, errorMessage?: { value: string },
): boolean {
  return SdrRegistry_ValidateProperty(node, property, errorMessage)
}

// _ValidateProperty (registry.cpp:177-189): this warning may eventually want
// to be a runtime error, but upstream always returns true.
function validateProperty(node: SdrShaderNode, property: SdrShaderProperty): boolean {
  const errorMessage = { value: '' }
  if (!SdrRegistry_ValidateProperty(node, property, errorMessage)) {
    TfDiagnosticMgr.GetInstance().postWarning(errorMessage.value)
  }
  return true
}

// _ValidateNode (registry.cpp:194-254): an invalid node is retained; a
// valid node whose identity disagrees with discovery is discarded.
function validNode(node: SdrShaderNode, result: SdrShaderNodeDiscoveryResult): boolean {
  return !(node.isValid() && (node.getIdentifier() !== result.identifier
    || node.getName() !== result.name
    || !node.getShaderVersion().equals(result.version)
    || node.getFunction() !== result.function
    || node.getShadingSystem() !== result.sourceType))
}

// ArGetResolver().GetExtension for a plain path.
function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? '' : base.slice(dot + 1)
}

// _GetIdentifierForAsset (registry.cpp:148-163): a hash of the asset and
// metadata, then <subIdentifier><shadingSystem>.
function identifierForAsset(
  asset: SdfAssetPath, metadata: Record<string, string>, subIdentifier: string, shadingSystem: string,
): string {
  let h = TfHashCombine(asset.getAssetPath(), asset.getResolvedPath())
  for (const key of Object.keys(metadata).sort()) h = TfHashCombine(h, key, metadata[key])
  return `${h}<${subIdentifier}><${shadingSystem}>`
}

_setDefaultQueryRunner(query => SdrRegistry.getInstance().runQuery(query))
