// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/materialAdapter.cpp,
//  pxr/usdImaging/usdImaging/materialAdapter.h,
//  pxr/usd/usdShade/connectableAPI.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/materialAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API of UsdImagingMaterialAdapter, and
// UsdImagingShaderAdapter and UsdImagingNodeGraphAdapter (declared in
// materialAdapter.h). The UsdImagingDelegate side (Populate,
// TrackVariability, UpdateForTime, ProcessPropertyChange, MarkDirty,
// MarkMaterialDirty, _RemovePrim, ProcessPrimResync, GetMaterialResource,
// IsSupported) is not ported.
//
// Divergence: UsdShadeConnectionSourceInfo / GetConnectedSources are not in
// the TypeScript usdShade library; _GetConnectedSources ports
// connectableAPI.cpp:304-354 over the attribute connections, holding the
// source connectable as its prim.

import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MaterialNetworkSchemaTokens as HdMaterialNetworkSchemaTokens,
  MaterialSchema as HdMaterialSchema,
  MaterialSchemaTokens as HdMaterialSchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import { NodeGraph as UsdShadeNodeGraph, type ShadeOutput as UsdShadeOutput } from 'typescript-usd/usdShade'
import { UsdImagingDataSourceMaterialPrim } from './dataSourceMaterial.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPopulationMode, UsdImagingPrimAdapter } from './primAdapter.ts'
import { UsdImagingRepresentedByAncestorPrimAdapter } from './representedByAncestorPrimAdapter.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** usdShade/utils.h UsdShadeAttributeType */
type _AttributeType = 'input' | 'output'

/** connectableAPI.h:744-807 UsdShadeConnectionSourceInfo (the source
 *  connectable is held as its prim). */
interface _ConnectionSourceInfo {
  source: UsdPrim | undefined
  sourceName: string
  sourceType: _AttributeType | undefined
}

/** connectableAPI.h:787-796 UsdShadeConnectionSourceInfo::IsValid */
function _IsValid(connection: _ConnectionSourceInfo): boolean {
  return connection.sourceType !== undefined && connection.sourceName !== '' &&
    connection.source !== undefined && connection.source.isValid()
}

/** connectableAPI.cpp:304-354 UsdShadeConnectableAPI::GetConnectedSources */
function _GetConnectedSources(shadingAttr: UsdAttribute): _ConnectionSourceInfo[] {
  const sourceInfos: _ConnectionSourceInfo[] = []
  if (!shadingAttr.isValid()) {
    return sourceInfos
  }
  const stage = shadingAttr.getStage()
  for (const sourcePath of shadingAttr.getConnections()) {
    // Make sure the source attribute exists
    const dot = sourcePath.lastIndexOf('.')
    const sourcePrim = stage.getPrim(sourcePath.slice(0, dot))
    const sourceAttr = sourcePrim?.getAttr(sourcePath.slice(dot + 1))
    if (!sourceAttr || !sourceAttr.isValid() || sourceAttr.isRelationship) {
      continue
    }
    // Check that the attribute has a legal prefix
    // (UsdShadeUtils::GetBaseNameAndType)
    const name = sourceAttr.name
    let sourceType: _AttributeType | undefined
    let sourceName = name
    if (name.startsWith('inputs:')) {
      sourceType = 'input'
      sourceName = name.slice('inputs:'.length)
    } else if (name.startsWith('outputs:')) {
      sourceType = 'output'
      sourceName = name.slice('outputs:'.length)
    } else {
      continue
    }
    sourceInfos.push({ source: sourcePrim, sourceName, sourceType })
  }
  return sourceInfos
}

/** connectionSourceInfo equality / hash key (TfHash of
 *  UsdShadeConnectionSourceInfo). */
function _Key(connection: _ConnectionSourceInfo): string {
  return `${connection.source?.path ?? ''}\0${connection.sourceName}\0${connection.sourceType ?? ''}`
}

/** materialAdapter.cpp:56-61 */
export class UsdImagingMaterialAdapter extends UsdImagingPrimAdapter {
  /** materialAdapter.cpp:57-61 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** materialAdapter.cpp:63-72 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.material
    }
    return ''
  }

  /** materialAdapter.cpp:74-88 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceMaterialPrim.new(
        prim.path,
        prim,
        stageGlobals)
    }

    return undefined
  }

  /** materialAdapter.cpp:199-255 */
  override invalidateImagingSubprim(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = new HdDataSourceLocatorSet()

    // UsdShadeMaterial material(prim);
    if (!prim.isA('Material')) {
      return result
    }

    // If we dirtied an interface input dirty that terminal
    for (const output of new UsdShadeNodeGraph(prim).getOutputs()) {
      let terminalDirty = false
      for (const property of properties) {
        if (output.attrName === property) {
          // Invalidate the affected terminal.
          result.insert(_CreateTerminalLocator(output.name))
          // Due to the way UsdImagingDataSourceMaterial::Get() returns
          // a retained nodegraph, and only includes nodes that were
          // reachable at the time, we must also invalidate the nodes
          // locator here as well.
          result.insert(HdMaterialSchema.getDefaultLocator())
          terminalDirty = true
          break
        }
      }
      if (terminalDirty) {
        continue
      }
      for (const connection of _GetConnectedSources(output.attr)) {
        const seenConnections = new Set<string>()
        if (_IsConnectionDirty(prim, properties, prim, connection, seenConnections)) {
          result.insert(_CreateTerminalLocator(output.name))
          // An upstream node or material interface input changed.
          // Invalidate the nodes locator so node parameter values
          // (including those resolved via material interface connections)
          // are re-read.  The same logic applies as for the output-dirty
          // case above.  Fixes FLOW-7634.
          result.insert(HdMaterialSchema.getDefaultLocator())
        }
      }
    }

    // Otherwise dirty our whole material
    if (result.IsEmpty() && subprim === '') {
      result.insert(UsdImagingDataSourceMaterialPrim.invalidate(
        prim, subprim, properties, invalidationType))
    }

    return result
  }

  /** materialAdapter.cpp:272-338 */
  override invalidateImagingSubprimFromDescendent(
    prim: UsdPrim,
    descendentPrim: UsdPrim,
    _subprim: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = new HdDataSourceLocatorSet()

    // UsdShadeMaterial material(prim);
    if (!TF_VERIFY(prim.isA('Material'))) {
      return result
    }

    // Check whether the only changes made were UI related.
    // If so do not invalidate the material, since UI changes are not propagated
    // to Hydra
    let onlyUIChanges = true
    const uiNodegraph = 'ui:nodegraph:'
    for (const property of properties) {
      if (!property.startsWith(uiNodegraph)) {
        onlyUIChanges = false
        break
      }
    }

    if (onlyUIChanges) {
      return result
    }

    // Find which terminal (if any) we should dirty
    for (const output of new UsdShadeNodeGraph(prim).getOutputs()) {
      let outputIsDirty = false
      for (const connection of _GetConnectedSources(output.attr)) {
        const seenConnections = new Set<string>()
        if (_IsConnectionDirty(descendentPrim, properties, prim,
          connection, seenConnections)) {
          result.insert(_CreateTerminalLocator(output.name))
          outputIsDirty = true
          break
        }
      }
      if (outputIsDirty) {
        // Dirty the associated shader node used by this output.
        // Also dirty the shader node in the "all" context.
        for (const renderContext of [
          _GetRenderContextForShaderOutput(output),
          HdMaterialSchemaTokens.all]) {
          result.insert(
            HdMaterialSchema.getDefaultLocator()
              .append(renderContext)
              .append(HdMaterialNetworkSchemaTokens.nodes)
              .append(SdfPath.fromString(descendentPrim.path).name))
        }
      }
    }

    // Otherwise dirty our whole material
    if (result.IsEmpty()) {
      result.insert(HdMaterialSchema.getDefaultLocator())
    }

    return result
  }

  /** materialAdapter.cpp:340-344 */
  override getPopulationMode(): UsdImagingPopulationMode {
    return UsdImagingPopulationMode.RepresentsSelfAndDescendents
  }
}

/** materialAdapter.cpp:90-117. Generate a terminal data source locator using
 *  the terminal attribute name. */
function _CreateTerminalLocator(output: string): HdDataSourceLocator {
  const baseNameComponents = SdfPath.tokenizeIdentifier(output)

  // If it's not namespaced use the universal token.
  if (baseNameComponents.length === 1) {
    return new HdDataSourceLocator(
      HdMaterialSchema.getSchemaToken(),
      HdMaterialSchemaTokens.universalRenderContext,
      HdMaterialSchemaTokens.terminals, baseNameComponents[0]!)
  }
  // If it's namespaced (eg. mtlx) include that.
  else if (baseNameComponents.length > 1) {
    return new HdDataSourceLocator(
      HdMaterialSchema.getSchemaToken(), baseNameComponents[0]!,
      HdMaterialSchemaTokens.terminals,
      SdfPath.stripPrefixNamespace(output, baseNameComponents[0]!)[0])
  }

  // Just point to the whole data source.
  return HdMaterialSchema.getDefaultLocator()
}

/** materialAdapter.cpp:119-197. Recusively check nodes starting at the
 *  terminal to find the dirty prim. If the dirty prim is the source material
 *  also check the specific dirty property. seenConnections holds the
 *  connections already determined not to be dirty (_ConnectionSet). */
function _IsConnectionDirty(
  dirtyPrim: UsdPrim,
  dirtyProperties: readonly string[],
  material: UsdPrim,
  connection: _ConnectionSourceInfo,
  seenConnections: Set<string>,
): boolean {
  const key = _Key(connection)
  if (seenConnections.has(key)) {
    // Already visited this connection and determined it is not dirty.
    return false
  }
  if (!_IsValid(connection)) {
    seenConnections.add(key)
    return false
  }
  const source = connection.source!

  // If we reach the root material only dirty if we are connected to the
  // specific property which is dirty and don't recurse further.
  if (source.path === material.path) {
    if (source.path === dirtyPrim.path) {
      for (const dirtyProperty of dirtyProperties) {
        if ((connection.sourceType === 'output' &&
             dirtyProperty === `outputs:${connection.sourceName}`) ||
            (connection.sourceType === 'input' &&
             dirtyProperty === `inputs:${connection.sourceName}`)) {
          return true
        }
      }
    }
    seenConnections.add(key)
    return false
  }

  // We are connected to the dirty prim
  if (source.path === dirtyPrim.path) {
    return true
  }

  // If the output we connected to had a direct connection check this.
  if (connection.sourceType === 'output') {
    const output = source.getAttr(`outputs:${connection.sourceName}`)
    if (output && output.isValid()) {
      for (const outputConnection of _GetConnectedSources(output)) {
        if (_IsConnectionDirty(
          dirtyPrim, dirtyProperties, material,
          outputConnection, seenConnections)) {
          return true
        }
      }
    }
  }

  // Check the input connections on the node.
  for (const input of new UsdShadeNodeGraph(source).getInputs()) {
    for (const inputConnection of _GetConnectedSources(input.attr)) {
      if (_IsConnectionDirty(dirtyPrim, dirtyProperties, material,
        inputConnection, seenConnections)) {
        return true
      }
    }
  }

  seenConnections.add(key)
  return false
}

/** materialAdapter.cpp:257-270. XXX From dataSourceMaterial.cpp; can we share
 *  this somewhere? Extract the renderContext from an output name, ex:
 *  "outputs:surface" -> "", "outputs:ri:surface" -> "ri" */
function _GetRenderContextForShaderOutput(output: UsdShadeOutput): string {
  const ns = output.attr.getNamespace()
  if (ns.startsWith('outputs:')) {
    return ns.slice('outputs:'.length)
  }
  // Empty namespace, e.g. "outputs:foo" -> ""
  return ''
}

/** materialAdapter.h:150-161. Delegates invalidation responsibility of a
 *  Shader prim to an ancestor Material prim. */
export class UsdImagingShaderAdapter extends UsdImagingRepresentedByAncestorPrimAdapter {}

/** materialAdapter.h:163-174. Delegates invalidation responsibility of a
 *  Noge Graph prim to an ancestor Material prim. */
export class UsdImagingNodeGraphAdapter extends UsdImagingRepresentedByAncestorPrimAdapter {}
