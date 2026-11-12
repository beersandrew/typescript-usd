// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/customAttributes.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { LayerStackPresentation } from './layer-stack-inspection'
import type { CompositionTree } from './composition-inspection'
export interface InspectionOptions { arrayStart?: number; arrayLimit?: number; includeMetadataDetails?: boolean; includeCompositionTree?: boolean }
export interface InspectionArray {
  typeName: string
  length: number
  start: number
  /** value: JSON-style; text: native arrayAttributeView row "<index>: <ToString>". */
  entries: { index: number; value: string; text?: string }[]
}
/** Read-only, serializable consumer presentation data; no mutable USD handles. */
export interface InspectionSnapshot {
  /** Native property context menu str(rawValue), independent of value-tab formatting. */
  copyValueText?: string
  array?: InspectionArray
  compositionTree?: CompositionTree
  layerStackView?: LayerStackPresentation
  metadataDetails?: { rows: {name:string,value:string,source:'authored'|'fallback'|'derived'}[]; limitations:string[] }
  objectPath: string
  /** Native Value tab text (scalarTypes.ToString); absent for prims and array values. */
  valueText?: string
  /** A customAttributes.py computed property: only the Value tab has content. */
  computed?: boolean
  /** The ancestor prim whose inheritable primvar this property is. */
  inheritedFrom?: string
  metadata: { name: string; value: string }[]
  layers: { layer: string; specPath: string; arc: string; offset: number; scale: number; value: string; sampleCount?: number; samples?: { time: number; value: string }[] }[]
  composition: { arc: string; targetLayer: string; targetPath: string; introducingLayer: string; introducingPath: string; ancestral: boolean; hasSpecs: boolean }[]
  targets: { kind: 'relationship' | 'connection'; path: string; primPath: string; propertyName?: string; exists: boolean }[]
}
