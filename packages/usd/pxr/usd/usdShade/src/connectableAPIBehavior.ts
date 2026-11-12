// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/connectableAPIBehavior.cpp,
//  pxr/usd/usdShade/connectableAPIBehavior.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdShadeConnectableAPIBehavior and its registry.
// Reference: OpenUSD v26.11.1 pxr/usd/usdShade/connectableAPIBehavior.{h,cpp}.
//
// A behavior answers, for prims of the type it is registered with, whether
// they are containers, whether connections must respect encapsulation, and
// whether an input or output may be connected to a source. Schema libraries
// register behaviors for their types when their module loads (the
// TF_REGISTRY_FUNCTION(UsdShadeConnectableAPI) blocks upstream); types whose
// plugInfo declares providesUsdShadeConnectableAPIBehavior without a
// registered behavior get a default one configured from plugInfo.

import './plugin/registerPlugin.ts'
import type { Prim, Stage } from 'typescript-usd/usd'
import { SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'
import { Type as TfType } from 'typescript-usd/tf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

// The source of a connection, as connectableAPI.ts parses it: the prim
// path, the base name and whether the source attribute is an input or an
// output (UsdShadeInput::IsInput on the source attribute).
export interface BehaviorConnectionSource {
  primPath: string
  name: string
  sourceType: 'input' | 'output'
}

export interface BehaviorCanConnectResult {
  canConnect: boolean
  reason?: string
}

// connectableAPIBehavior.h:55-59.
export enum ConnectableNodeTypes {
  BasicNodes, // Shader, NodeGraph
  DerivedContainerNodes, // Material, etc
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

function sourceAttrName(source: BehaviorConnectionSource): string {
  return `${source.sourceType === 'input' ? 'inputs' : 'outputs'}:${source.name}`
}

function sourcePath(source: BehaviorConnectionSource): string {
  return `${source.primPath}.${sourceAttrName(source)}`
}

function splitProperty(path: string): [string, string] {
  const dot = path.lastIndexOf('.')
  return [path.slice(0, dot), path.slice(dot + 1)]
}

// UsdAttribute validity: the prim exists and the property is an attribute.
function attributeIsValid(stage: Stage, primPath: string, name: string): boolean {
  return stage.getPrim(primPath)?.getAttr(name)?.isValid() ?? false
}

// UsdShadeInput::GetConnectability (input.cpp): the authored token, else
// 'full'.
function connectabilityOf(stage: Stage, inputPath: string): string {
  const v = stage.get(inputPath)?.getField('connectability')
  return typeof v === 'string' && v.length > 0 ? v : 'full'
}

// UsdShadeConnectableAPI(prim).IsContainer() for a prim path.
function primIsContainer(stage: Stage, primPath: string): boolean {
  const prim = stage.getPrim(primPath)
  return prim ? (getConnectableAPIBehavior(prim)?.isContainer() ?? false) : false
}

export class ConnectableAPIBehavior {
  readonly #isContainer: boolean
  readonly #requiresEncapsulation: boolean

  // By default a behavior is not a container and requires encapsulation
  // (connectableAPIBehavior.h:61-71).
  constructor(isContainer = false, requiresEncapsulation = true) {
    this.#isContainer = isContainer
    this.#requiresEncapsulation = requiresEncapsulation
  }

  // connectableAPIBehavior.cpp:44-51.
  canConnectInputToSource(
    stage: Stage, inputPath: string, source: BehaviorConnectionSource,
  ): BehaviorCanConnectResult {
    return this._canConnectInputToSource(stage, inputPath, source)
  }

  // connectableAPIBehavior.cpp:313-320.
  canConnectOutputToSource(
    stage: Stage, outputPath: string, source: BehaviorConnectionSource,
  ): BehaviorCanConnectResult {
    return this._canConnectOutputToSource(stage, outputPath, source)
  }

  // connectableAPIBehavior.cpp:322-332.
  isContainer(): boolean { return this.#isContainer }
  requiresEncapsulation(): boolean { return this.#requiresEncapsulation }

  // connectableAPIBehavior.cpp:53-235.
  protected _canConnectInputToSource(
    stage: Stage, inputPath: string, source: BehaviorConnectionSource,
    nodeType = ConnectableNodeTypes.BasicNodes,
  ): BehaviorCanConnectResult {
    const [inputPrimPath, inputName] = splitProperty(inputPath)
    // UsdShadeInput::IsDefined: the attribute exists and is an input.
    if (!inputName.startsWith('inputs:') || !attributeIsValid(stage, inputPrimPath, inputName)) {
      return { canConnect: false, reason: `Invalid input: ${inputPath}` }
    }
    if (!attributeIsValid(stage, source.primPath, sourceAttrName(source))) {
      return { canConnect: false, reason: `Invalid source: ${sourcePath(source)}` }
    }
    const sourcePrimPath = source.primPath
    const inputTypeName = stage.getPrim(inputPrimPath)?.typeName ?? ''

    // Ensure that the source prim is the closest ancestor container of the
    // NodeGraph owning the input.
    const encapsulationCheckForInputSources = (): BehaviorCanConnectResult => {
      if (!primIsContainer(stage, sourcePrimPath)) {
        return { canConnect: false, reason: `Encapsulation check failed - ` +
          `prim '${sourcePrimPath}' owning the input source '${sourceAttrName(source)}' ` +
          'is not a container.' }
      }
      if (parentPath(inputPrimPath) !== sourcePrimPath) {
        return { canConnect: false, reason: `Encapsulation check failed - ` +
          `input source prim '${sourcePrimPath}' is not the closest ancestor ` +
          `container of the NodeGraph '${inputPrimPath}' owning the input ` +
          `attribute '${inputName}'.` }
      }
      return { canConnect: true }
    }

    // Ensure that the source prim and input prim are contained by the same
    // inner most container for all nodes, other than DerivedContainerNodes,
    // for these make sure source prim is an immediate descendent of the
    // input prim.
    const encapsulationCheckForOutputSources = (): BehaviorCanConnectResult => {
      if (nodeType === ConnectableNodeTypes.DerivedContainerNodes) {
        if (!primIsContainer(stage, inputPrimPath)) {
          return { canConnect: false, reason: `Encapsulation check failed - ` +
            `For input's prim type '${inputTypeName}', prim owning the input ` +
            `'${inputPath}' is not a container.` }
        }
        if (parentPath(sourcePrimPath) !== inputPrimPath) {
          return { canConnect: false, reason: `Encapsulation check failed - ` +
            `For input's prim type '${inputTypeName}', Output source's prim ` +
            `'${sourcePrimPath}' is not an immediate descendent of the input's ` +
            `prim '${inputPrimPath}'.` }
        }
        return { canConnect: true }
      }
      if (!primIsContainer(stage, parentPath(inputPrimPath))) {
        return { canConnect: false, reason: `Encapsulation check failed - ` +
          `For input's prim type '${inputTypeName}', Immediate ancestor ` +
          `'${parentPath(sourcePrimPath)}' for the prim owning the output source ` +
          `'${sourcePath(source)}' is not a container.` }
      }
      if (parentPath(inputPrimPath) !== parentPath(sourcePrimPath)) {
        return { canConnect: false, reason: `Encapsulation check failed - ` +
          `For input's prim type '${inputTypeName}', Input's prim ` +
          `'${inputPrimPath}' and source's prim '${sourcePrimPath}' are not ` +
          'contained by the same container prim.' }
      }
      return { canConnect: true }
    }

    const inputConnectability = connectabilityOf(stage, inputPath)
    const requiresEncapsulation = this.requiresEncapsulation()
    if (inputConnectability === 'full') {
      if (source.sourceType === 'input') {
        return requiresEncapsulation ? encapsulationCheckForInputSources() : { canConnect: true }
      }
      // source is an output - allow connection
      return requiresEncapsulation ? encapsulationCheckForOutputSources() : { canConnect: true }
    } else if (inputConnectability === 'interfaceOnly') {
      if (source.sourceType === 'input') {
        const sourceConnectability = connectabilityOf(stage, sourcePath(source))
        if (sourceConnectability === 'interfaceOnly') {
          return requiresEncapsulation ? encapsulationCheckForInputSources() : { canConnect: true }
        }
        return { canConnect: false, reason: "Input connectability is 'interfaceOnly' and " +
          "source does not have 'interfaceOnly' connectability." }
      }
      return { canConnect: false, reason:
        "Input connectability is 'interfaceOnly' but source is not an input" }
    }
    return { canConnect: false, reason: 'Input connectability is unspecified' }
  }

  // connectableAPIBehavior.cpp:237-311.
  protected _canConnectOutputToSource(
    stage: Stage, outputPath: string, source: BehaviorConnectionSource,
    nodeType = ConnectableNodeTypes.BasicNodes,
  ): BehaviorCanConnectResult {
    // Nodegraphs allow connections to their outputs, but only from
    // internal nodes.
    const [outputPrimPath, outputName] = splitProperty(outputPath)
    if (!outputName.startsWith('outputs:') || !attributeIsValid(stage, outputPrimPath, outputName)) {
      return { canConnect: false, reason: 'Invalid output' }
    }
    if (!attributeIsValid(stage, source.primPath, sourceAttrName(source))) {
      return { canConnect: false, reason: 'Invalid source' }
    }
    const sourcePrimPath = source.primPath
    const requiresEncapsulation = this.requiresEncapsulation()
    if (source.sourceType === 'input') {
      // passthrough usage is not allowed for DerivedContainerNodes
      if (nodeType === ConnectableNodeTypes.DerivedContainerNodes) {
        return { canConnect: false, reason: 'Encapsulation check failed - ' +
          `passthrough usage is not allowed for output prim '${outputPrimPath}' ` +
          `of type '${stage.getPrim(outputPrimPath)?.typeName ?? ''}'.` }
      }
      // output can connect to an input of the same container as a
      // passthrough.
      if (sourcePrimPath !== outputPrimPath) {
        return { canConnect: false, reason: `Encapsulation check failed - output ` +
          `'${outputPath}' and input source '${sourcePath(source)}' must be ` +
          'encapsulated by the same container prim' }
      }
      return { canConnect: true }
    }
    // Source is an output: output can connect to other node's output
    // directly encapsulated by it, unless explicitly marked to ignore
    // encapsulation rule.
    if (requiresEncapsulation && parentPath(sourcePrimPath) !== outputPrimPath) {
      return { canConnect: false, reason: 'Encapsulation check failed - prim ' +
        `owning the output '${outputPath}' is not an immediate descendent ` +
        ` of the prim owning the output source '${sourcePath(source)}'.` }
    }
    return { canConnect: true }
  }
}

// ---- Registry (connectableAPIBehavior.cpp:338-851) ----

// _PrimTypeId: the prim type name and its authored applied API schemas.
function primTypeIdKey(primTypeName: string, appliedAPISchemas: readonly string[] = []): string {
  return [primTypeName, ...appliedAPISchemas].join(';')
}

function typeKey(type: TfType): string {
  return primTypeIdKey(UsdSchemaRegistry.getSchemaTypeName(type))
}

// Behaviors (or null for "none") cached per _PrimTypeId.
const primTypeIdCache = new Map<string, ConnectableAPIBehavior | null>()
let didRegisterPluginsSubscribed = false

function subscribeToPluginRegistration(): void {
  if (didRegisterPluginsSubscribed) return
  didRegisterPluginsSubscribed = true
  // _DidRegisterPlugins (connectableAPIBehavior.cpp:756-779): drop cached
  // null behaviors, which new plugins may provide.
  PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => {
    for (const [key, behavior] of primTypeIdCache) {
      if (!behavior) primTypeIdCache.delete(key)
    }
  })
}

// RegisterBehaviorForPrimTypeId (connectableAPIBehavior.cpp:445-475).
function registerBehaviorForPrimTypeId(key: string, behavior: ConnectableAPIBehavior | null): void {
  if (primTypeIdCache.has(key)) {
    if (primTypeIdCache.get(key) === behavior) return
    throw new Error('A different UsdShade Connectable behavior already registered ' +
      `for primTypeId comprised of '${key}' type and apischemas.`)
  }
  primTypeIdCache.set(key, behavior)
}

function findBehaviorForType(type: TfType): ConnectableAPIBehavior | null | undefined {
  return primTypeIdCache.get(typeKey(type))
}

// RegisterPlugConfiguredBehaviorForType (connectableAPIBehavior.cpp:490-512).
function registerPlugConfiguredBehaviorForType(type: TfType): ConnectableAPIBehavior {
  const metadata = PlugRegistry.GetInstance().getMetadataForType(type)
  const bool = (key: string, defaultValue: boolean): boolean =>
    typeof metadata[key] === 'boolean' ? metadata[key] as boolean : defaultValue
  const behavior = new ConnectableAPIBehavior(
    bool('isUsdShadeContainer', false), bool('requiresUsdShadeEncapsulation', true))
  registerBehaviorForPrimTypeId(typeKey(type), behavior)
  return behavior
}

// _LoadPluginDefiningBehaviorForType (connectableAPIBehavior.cpp:729-754).
function loadPluginDefiningBehaviorForType(type: TfType): boolean {
  // type being queried is not Usd compliant.
  if (!type.isA(TfType.findByName('UsdTyped')) &&
      !type.isA(TfType.findByName('UsdAPISchemaBase'))) {
    return false
  }
  const registry = PlugRegistry.GetInstance()
  if (registry.getMetadataForType(type)['providesUsdShadeConnectableAPIBehavior'] !== true) {
    return false
  }
  const plugin = registry.getPluginForType(type)
  if (!plugin) throw new Error(`Could not find plugin for '${type.getTypeName()}'`)
  return plugin.Load()
}

// _FindBehaviorForApiSchema (connectableAPIBehavior.cpp:798-826): only
// single-apply API schemas can provide a behavior.
function findBehaviorForApiSchema(appliedSchema: string): ConnectableAPIBehavior | null | undefined {
  const appliedSchemaType = UsdSchemaRegistry.getAPITypeFromSchemaTypeName(appliedSchema)
  if (UsdSchemaRegistry.getSchemaKind(appliedSchemaType) !== 'singleApplyAPI') return undefined
  if (loadPluginDefiningBehaviorForType(appliedSchemaType)) {
    return findBehaviorForType(appliedSchemaType) ?? registerPlugConfiguredBehaviorForType(appliedSchemaType)
  }
  return undefined
}

// _GetBehaviorForPrimTypeId (connectableAPIBehavior.cpp:554-718). The order
// of precedence is: an authored API schema's behavior, then the prim type's,
// then its ancestor types', then any built-in API schema's.
function getBehaviorForPrimTypeId(
  primTypeName: string, appliedAPISchemas: readonly string[],
  primSchemaType: TfType | undefined, prim: Prim | undefined,
): ConnectableAPIBehavior | null {
  subscribeToPluginRegistration()
  const key = primTypeIdKey(primTypeName, appliedAPISchemas)
  if (primTypeIdCache.has(key)) return primTypeIdCache.get(key)!

  // Look up the schema type if we don't have it already.
  let schemaType = primSchemaType
  if (!schemaType || schemaType.isUnknown()) {
    schemaType = UsdSchemaRegistry.getTypeFromSchemaTypeName(primTypeName)
    if (schemaType.isUnknown() && appliedAPISchemas.length === 0) return null
  }

  let behavior: ConnectableAPIBehavior | null = null
  let foundBehaviorInAncestorType = false
  if (!schemaType.isUnknown()) {
    const primSchemaTypeAndBases = schemaType.getAllAncestorTypes()
    let i = 0
    for (; i < primSchemaTypeAndBases.length; ++i) {
      const type = primSchemaTypeAndBases[i]!
      const found = findBehaviorForType(type)
      if (found !== undefined) {
        behavior = found
        foundBehaviorInAncestorType = true
        break
      }
      if (loadPluginDefiningBehaviorForType(type)) {
        // Loading the plugin may have registered a behavior.
        behavior = findBehaviorForType(type) ?? registerPlugConfiguredBehaviorForType(type)
        foundBehaviorInAncestorType = true
        break
      }
    }
    if (foundBehaviorInAncestorType) {
      // Cache the behavior for every type between the prim's type and the
      // ancestor it was found on.
      for (let j = 0; j < i; ++j) {
        const ancestorKey = typeKey(primSchemaTypeAndBases[j]!)
        if (!primTypeIdCache.has(ancestorKey)) primTypeIdCache.set(ancestorKey, behavior)
      }
    }
    if (behavior) {
      // An authored API schema's behavior overrides the type's.
      for (const appliedSchema of appliedAPISchemas) {
        const apiBehavior = findBehaviorForApiSchema(appliedSchema)
        if (apiBehavior) {
          behavior = apiBehavior
          registerBehaviorForPrimTypeId(key, behavior)
          break
        }
      }
      return behavior
    }
  }

  // No behavior on the type: look through all applied API schemas, the
  // prim's or, for a type query, the type's built-in ones. Abstract types
  // have no prim definition and contribute none.
  let appliedSchemas: readonly string[] = []
  if (!UsdSchemaRegistry.isAbstract(schemaType)) {
    if (prim) {
      appliedSchemas = prim.getAppliedSchemas()
    } else {
      const registry = UsdSchemaRegistry.getInstance()
      const typeName = UsdSchemaRegistry.getSchemaTypeName(schemaType)
      const primDefinition = UsdSchemaRegistry.isConcrete(schemaType)
        ? registry.findConcretePrimDefinition(typeName)
        : registry.findAppliedAPIPrimDefinition(typeName)
      appliedSchemas = primDefinition?.getAppliedAPISchemas() ?? []
    }
  }
  for (const appliedSchema of appliedSchemas) {
    const apiBehavior = findBehaviorForApiSchema(appliedSchema)
    if (apiBehavior) {
      registerBehaviorForPrimTypeId(key, apiBehavior)
      return apiBehavior
    }
  }

  // Cache the absence of a behavior for this primTypeId.
  if (!foundBehaviorInAncestorType) registerBehaviorForPrimTypeId(key, null)
  return null
}

// UsdShadeRegisterConnectableAPIBehavior (connectableAPIBehavior.cpp:858-874).
export function registerConnectableAPIBehavior(
  connectablePrimType: TfType, behavior: ConnectableAPIBehavior,
): void {
  if (!behavior || connectablePrimType.isUnknown()) {
    throw new Error('Invalid behavior registration for prim type ' +
      `'${connectablePrimType.getTypeName()}'`)
  }
  registerBehaviorForPrimTypeId(typeKey(connectablePrimType), behavior)
}

// _BehaviorRegistry::GetBehavior (connectableAPIBehavior.cpp:539-548).
export function getConnectableAPIBehavior(prim: Prim): ConnectableAPIBehavior | null {
  const typeInfo = prim.getPrimTypeInfo()
  return getBehaviorForPrimTypeId(
    typeInfo.getTypeName(), typeInfo.getAppliedAPISchemas(), typeInfo.getSchemaType(), prim)
}

// _BehaviorRegistry::HasBehaviorForType (connectableAPIBehavior.cpp:532-537).
export function hasConnectableAPIBehaviorForType(type: TfType): boolean {
  return getBehaviorForPrimTypeId(UsdSchemaRegistry.getSchemaTypeName(type), [], type, undefined) !== null
}
