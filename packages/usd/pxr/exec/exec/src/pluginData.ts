// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginData.cpp,
//  pxr/exec/exec/pluginData.h, pxr/base/js/value.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/pluginData.h and pluginData.cpp.
//
// The plugInfo metadata is parsed JSON here, so JsValue's type checks
// (base/js/value.cpp:193-222) are done on the parsed values directly.

import { TF_CODING_ERROR, TF_VERIFY, Type as TfType } from 'typescript-usd/tf'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'

// For each schema, we record the plugin that (may) define computations for
// that schema and a bool that indicates whether or not the schema is
// allowed to have plugin computations (pluginData.h:76-84).
interface SchemaData {
  plugin: PlugPlugin
  allowsPluginComputations: boolean
}

/** JsValue::GetTypeName (base/js/value.cpp:88-104). */
function _JsGetTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'object': return 'object'
    case 'string': return 'string'
    case 'boolean': return 'bool'
    case 'number': return Number.isInteger(value) ? 'int' : 'real'
    default: return 'unknown'
  }
}

/** JsFindValue (base/js/utils.h): the value at `key`, if present. */
function _JsFindValue(object: Record<string, unknown>, key: string): { value: unknown } | undefined {
  return Object.prototype.hasOwnProperty.call(object, key) ? { value: object[key] } : undefined
}

/**
 * JsValue::GetJsObject (base/js/value.cpp:211-222): the object, or a coding
 * error and an empty object for any other value.
 */
function _JsGetJsObject(value: unknown): Record<string, unknown> {
  const typeName = _JsGetTypeName(value)
  if (typeName !== 'object') {
    TF_CODING_ERROR(`Attempt to get object from value holding ${typeName}`)
    return {}
  }
  return value as Record<string, unknown>
}

let _execPluginData: Exec_PluginData | undefined

/**
 * A structure used to initialize a map from schema types to plugins that
 * define computations for the schema (pluginData.h:23-86).
 *
 * The plugInfo that we expect here is of the form:
 *
 *     "Info": {
 *         "Exec" : {
 *             "Schemas": {
 *                 "MySchemaType1": {
 *                 },
 *                 "MySchemaType2": {
 *                 }
 *             }
 *         }
 *     }
 */
export class Exec_PluginData {
  readonly #execSchemaPlugins = new Map<TfType, SchemaData>()

  /** pluginData.cpp:31-40 */
  private constructor() {
    // For each plugin found by plugin discovery, look for the metadata that
    // tells us which schemas that plugin defines computations for.
    for (const plugin of PlugRegistry.GetInstance().getAllPlugins()) {
      this._readPluginMetadata(plugin)
    }
  }

  /**
   * Returns `true` if the plugInfo for the given `plugin` contains exec
   * metadata (pluginData.cpp:42-46).
   */
  static hasExecMetadata(plugin: PlugPlugin): boolean {
    return _JsFindValue(plugin.getMetadata(), 'Exec') !== undefined
  }

  /**
   * If a plugin registers computations for `schemaType`, load it and return
   * `true` (pluginData.cpp:48-59).
   *
   * PlugPlugin.Load() is synchronous only for a plugin that is already loaded
   * (base/plug/src/plugin.ts Load); for an unloaded library plugin it posts
   * a coding error and returns false, as an upstream load failure does.
   */
  static loadPluginComputationsForSchema(schemaType: TfType): boolean {
    const it = Exec_GetPluginData().#execSchemaPlugins.get(schemaType)
    if (it !== undefined) {
      const plugin = it.plugin
      if (TF_VERIFY(plugin, 'plugin')) {
        // FAITHFULNESS-DEBT(openexec-plugin-load): PlugPlugin::Load()
        // (plugin.cpp:323-355) loads the library synchronously; a TS
        // library plugin must already be loaded with LoadAsync, e.g. by
        // _interim_ExecLoadPluginsAsync() -> a synchronous Load once
        // plugin loading has a synchronous path (decision D4).
        plugin.Load()
        return true
      }
    }
    return false
  }

  /**
   * Returns `true` if `schemaType` allows the registration of plugin
   * computations (pluginData.cpp:61-75).
   *
   * If exec plugin metadata is found for `schemaType`, the name of the
   * plugin that contains the plugin metadata is returned as `pluginName`
   * (the `std::string *pluginName` out-parameter, port convention 6).
   */
  static schemaAllowsPluginComputations(
    schemaType: TfType,
  ): [allows: boolean, pluginName: string] {
    const it = Exec_GetPluginData().#execSchemaPlugins.get(schemaType)
    if (it === undefined) {
      return [true, '']
    }

    return [it.allowsPluginComputations, it.plugin.getName()]
  }

  /** pluginData.cpp:98-160 */
  _readPluginMetadata(plugin: PlugPlugin): void {
    const metadataValue = _JsFindValue(plugin.getMetadata(), 'Exec')
    if (!metadataValue) {
      return
    }

    const schemasValue = _JsFindValue(_JsGetJsObject(metadataValue.value), 'Schemas')
    if (!schemasValue) {
      return
    }

    for (const [schemaName, schemaValue] of Object.entries(_JsGetJsObject(schemasValue.value))) {
      const schemaType = TfType.findByName(schemaName)
      if (schemaType.isUnknown()) {
        TF_CODING_ERROR(
          `Unknown schema type name '${schemaName}' encountered when reading Exec ` +
          'plugInfo.')
        continue
      }

      // Attempt to emplace an entry mapping the schema type to the plugin,
      // noting whether or not the schema allows computations to be registered
      // for it.
      const allowsPluginComputations =
        _AllowsPluginComputations(schemaValue)
      const it = this.#execSchemaPlugins.get(schemaType)
      if (it === undefined) {
        this.#execSchemaPlugins.set(schemaType, { plugin, allowsPluginComputations })
        continue
      }

      // Emit a suitable error, since we already had an entry for this schema.
      const oldPlugin = it.plugin
      const oldAllowsPluginComputations = it.allowsPluginComputations
      if (allowsPluginComputations === oldAllowsPluginComputations) {
        TF_CODING_ERROR(
          `Plugin '${plugin.getName()}' declares schema ${schemaType.getTypeName()} as ` +
          `${allowsPluginComputations ? '' : 'not '}allowing plugin ` +
          `computations, but plugin '${oldPlugin.getName()}' already declared this schema.`)
      } else {
        // In the case of disagreement, ensure the schema is marked as
        // not allowing plugin computations.
        it.allowsPluginComputations = false
        TF_CODING_ERROR(
          `Plugin '${plugin.getName()}' declares schema ${schemaType.getTypeName()} as ` +
          `${allowsPluginComputations ? '' : 'not '}allowing plugin ` +
          `computations, but plugin '${oldPlugin.getName()}' already declared it as ` +
          `${oldAllowsPluginComputations ? '' : 'not '}allowing plugin computations.`)
      }
    }
  }

  /** @internal Constructs the instance for Exec_GetPluginData only. */
  static _create(): Exec_PluginData {
    return new Exec_PluginData()
  }
}

/**
 * Gives the implementation access to the static instance
 * (pluginData.cpp:22-29).
 */
export function Exec_GetPluginData(): Exec_PluginData {
  return _execPluginData ??= Exec_PluginData._create()
}

/** pluginData.cpp:77-96 */
function _AllowsPluginComputations(schemaValue: unknown): boolean {
  const allowsPluginComputationsValue =
    _JsFindValue(_JsGetJsObject(schemaValue), 'allowsPluginComputations')
  if (!allowsPluginComputationsValue) {
    // In the absense of 'allowsPluginComputations' metadata, the schema is
    // allowsPluginComputations by default.
    return true
  }

  if (typeof allowsPluginComputationsValue.value !== 'boolean') {
    TF_CODING_ERROR(
      'Exec \'allowsPluginComputations\' metadatum holding type ' +
      `${_JsGetTypeName(allowsPluginComputationsValue.value)}; ` +
      'expected type bool.')
    // On error, we consider the schema to *not* allow plugin computations.
    return false
  }

  return allowsPluginComputationsValue.value
}

/**
 * Loads, with PlugPlugin.LoadAsync, every registered plugin whose plugInfo
 * contains Exec metadata, so that the synchronous PlugPlugin.Load() calls
 * of Exec_PluginData.LoadPluginComputationsForSchema find them loaded
 * (decision D4, docs/openexec-x1.md). Resolves to true if every load
 * succeeded.
 *
 * Interim and non-public: not exported from the package barrel.
 *
 * FAITHFULNESS-DEBT(openexec-plugin-load): upstream loads a schema's Exec
 * plugin lazily and synchronously, on first lookup of the schema's
 * computations (pluginData.cpp:48-59, definitionRegistry.cpp:860-883). Loading
 * every Exec plugin up front runs each plugin's
 * TF_REGISTRY_FUNCTION(ExecDefinitionRegistryTag) blocks as if the libraries
 * had been loaded before the first lookup -> retire once PlugPlugin has a
 * synchronous Load for library plugins.
 */
export async function _interim_ExecLoadPluginsAsync(): Promise<boolean> {
  const plugins = PlugRegistry.GetInstance().getAllPlugins()
    .filter(plugin => Exec_PluginData.hasExecMetadata(plugin))
  const results = await Promise.all(plugins.map(plugin => plugin.loadAsync()))
  return results.every(Boolean)
}
