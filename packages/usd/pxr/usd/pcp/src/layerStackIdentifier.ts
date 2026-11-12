// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerStackIdentifier.cpp,
//  pxr/usd/pcp/layerStackIdentifier.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpLayerStackIdentifier — identifies a layer-stack configuration.
// Faithful port of OpenUSD pcp/layerStackIdentifier.h.
//
// Pcp composes against an ABSTRACT layer — upstream uses SdfLayerHandle, here
// typescript-usd/usd's Layer. To keep typescript-usd/pcp at the bottom of the package graph (no
// dependency on typescript-usd/usd, avoiding a usd->pcp->usd cycle), pcp consumes layers
// through this structural interface; typescript-usd/usd's Layer satisfies it.

import type { SdfPath } from 'typescript-usd/sdf/path'
import type { SdfChangeList } from 'typescript-usd/sdf/changeList'
import type { SpecType as SdfSpecType } from 'typescript-usd/sdf'
import type { PcpExpressionVariablesSource } from './expressionVariablesSource.ts'

export interface PcpLayerHandle {
  readonly filePath: string
}

// The key a layer's scene/getField uses for a spec path. SdfPath and every Sdf
// storage backend use the same canonical spelling, including variant
// selections (OpenUSD v26.08 SdfPath::AppendVariantSelection,
// pxr/usd/sdf/path.cpp:986-1003).
export function pcpLayerPathKey(path: SdfPath): string {
  return path.pathString
}

// The part of SdfSchemaBase Pcp asks a layer's schema (IsRegistered).
export interface PcpLayerSchema {
  isRegistered(fieldName: string): boolean
}

export interface PcpLayer extends PcpLayerHandle {
  hasSpec(specPath: string): boolean
  getSpecType(specPath: string): SdfSpecType
  getSpecPaths(): string[]
  getFieldNames(specPath: string): string[]
  getField(specPath: string, fieldName: string): unknown
  // Uncloned read for composition, when the layer offers one.
  _getFieldView?(specPath: string, fieldName: string): unknown
  resolveAsset(assetPath: string): string
  // SdfLayer surface used by change processing (changes.cpp). Layers that
  // lack them take upstream's non-minimal change paths.
  isEmpty?(): boolean
  createDiff?(layer: PcpLayer, processPropertyFields: boolean): SdfChangeList
  getFileFormat?(): { isPackage?(): boolean } | undefined
  // SdfLayer::GetSchema (pxr/usd/sdf/layer.cpp:996), the file format's
  // schema. A layer without it uses SdfSchema (pcpLayerSchema in
  // layerStack.ts).
  getSchema?(): PcpLayerSchema
  /** @internal SdfLayer::CreateAnonymous with this layer's display name. */
  _createEmptyAnonymous?(): PcpLayer
}

// SdfLayer::IsEmpty: no root prims, root prim order, or sublayers.
export function pcpLayerIsEmpty(layer: PcpLayer): boolean {
  if (layer.isEmpty) return layer.isEmpty()
  const empty = (field: string): boolean => {
    const value = layer.getField('/', field)
    return !Array.isArray(value) || value.length === 0
  }
  return empty('primChildren') && empty('primOrder') && empty('subLayers')
}

// A field value for read-only composition: uncloned when the layer allows it.
// Callers must not mutate or retain the result.
export function pcpReadField(layer: PcpLayer, specPath: string, fieldName: string): unknown {
  return layer._getFieldView ? layer._getFieldView(specPath, fieldName) : layer.getField(specPath, fieldName)
}

// SdfLayer::FindOrOpen for Pcp: no layer (null or undefined) when the layer
// cannot be opened. With `errors`, the commentary of the errors the failed
// open would post is collected there instead, as Pcp collects it under a
// TfErrorMark for the PcpError's messages (layerStack.cpp:1777-1802,
// primIndex.cpp:2300-2325).
export type PcpLayerOpener = (filePath: string, errors?: string[]) => Promise<PcpLayer | null | undefined>

export interface PcpLayerStackIdentifier {
  readonly rootLayer: PcpLayerHandle
  readonly sessionLayer?: PcpLayerHandle | undefined
  readonly expressionVariablesOverrideSource?: PcpExpressionVariablesSource | undefined
}

export function pcpLayerStackIdentifier(
  rootLayer: PcpLayerHandle,
  sessionLayer?: PcpLayerHandle,
  expressionVariablesOverrideSource?: PcpExpressionVariablesSource,
): PcpLayerStackIdentifier {
  return {
    rootLayer,
    ...(sessionLayer ? { sessionLayer } : {}),
    ...(expressionVariablesOverrideSource ? { expressionVariablesOverrideSource } : {}),
  }
}

export function pcpLayerStackIdentifierKey(id: PcpLayerStackIdentifier): string {
  return `${id.rootLayer.filePath}\0${id.sessionLayer?.filePath ?? ''}\0${
    id.expressionVariablesOverrideSource?.getKey() ?? '<root>'
  }`
}

export function pcpLayerStackIdentifierEquals(
  a: PcpLayerStackIdentifier,
  b: PcpLayerStackIdentifier,
): boolean {
  if (a.rootLayer.filePath !== b.rootLayer.filePath ||
      (a.sessionLayer?.filePath ?? '') !== (b.sessionLayer?.filePath ?? '')) return false
  const aSource = a.expressionVariablesOverrideSource
  const bSource = b.expressionVariablesOverrideSource
  if (!aSource) return !bSource || bSource.isRootLayerStack()
  if (!bSource) return aSource.isRootLayerStack()
  return aSource.equals(bSource)
}
