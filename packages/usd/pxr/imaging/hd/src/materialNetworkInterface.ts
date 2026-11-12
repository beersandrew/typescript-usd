// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNetworkInterface.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/materialNetworkInterface.h.
//
// Value convention: upstream passes parameter, config and node type info
// values as VtValue. In this port a sampled data source's GetValue returns
// either a VtValue or the typed value (see retainedDataSource.ts), so the
// value accessors return `unknown`; `undefined` stands for an empty VtValue.

import type { Token as TfToken } from 'typescript-usd/tf'

/** materialNetworkInterface.h:68-73 */
export interface HdMaterialNetworkInterfaceNodeParamData {
  value: unknown
  colorSpace: TfToken | string
  typeName: TfToken | string
}

/** materialNetworkInterface.h:82-86 */
export interface HdMaterialNetworkInterfaceInputConnection {
  upstreamNodeName: TfToken | string
  upstreamOutputName: TfToken | string
}

/** materialNetworkInterface.h:87 (TfSmallVector<InputConnection, 4>) */
export type HdMaterialNetworkInterfaceInputConnectionVector =
  HdMaterialNetworkInterfaceInputConnection[]

/** materialNetworkInterface.h:132 (std::pair<bool, InputConnection>) */
export type HdMaterialNetworkInterfaceInputConnectionResult =
  [boolean, HdMaterialNetworkInterfaceInputConnection]

/**
 * Abstract interface for querying and mutating a material network.
 *
 * This is useful for implementing matfilt functions which can be reused
 * by future scene index implementations.
 *
 * NOTE: Subclasses make no guarantee of thread-safety even for the const
 *       accessors as they might make use of internal caching for optimization.
 *       Should you want to read from a material from multiple threads, create
 *       a thread-specific interface instance. The non-const methods should
 *       never be considered thread-safe from multiple interface instances
 *       backed from the same concrete data.
 *
 * (materialNetworkInterface.h:19-142)
 */
export interface HdMaterialNetworkInterface {
  getMaterialPrimPath(): string

  /** Material config is a collection of data related to the entire material,
   * e.g. material definition version, etc.
   *
   * Similarly to GetNodeTypeInfoXXX() below, only getters are provided, as
   * we don't intend to mutate this config data. */
  getMaterialConfigKeys(): TfToken[]
  getMaterialConfigValue(key: TfToken | string): unknown

  /** Returns the nearest enclosing model asset name, as described by
   * the model schema, or empty string if none is available. */
  getModelAssetName(): string

  getNodeNames(): TfToken[]
  getNodeType(nodeName: TfToken | string): TfToken | string

  /** Node type info is a collection of data related to the node type, often
   * used to determine the node type. */
  getNodeTypeInfoKeys(nodeName: TfToken | string): TfToken[]
  getNodeTypeInfoValue(nodeName: TfToken | string, key: TfToken | string): unknown

  getAuthoredNodeParameterNames(nodeName: TfToken | string): TfToken[]

  getNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string): unknown

  getNodeParameterData(
    nodeName: TfToken | string, paramName: TfToken | string): HdMaterialNetworkInterfaceNodeParamData

  getNodeInputConnectionNames(nodeName: TfToken | string): TfToken[]

  getNodeInputConnection(
    nodeName: TfToken | string, inputName: TfToken | string): HdMaterialNetworkInterfaceInputConnectionVector

  deleteNode(nodeName: TfToken | string): void

  setNodeType(nodeName: TfToken | string, nodeType: TfToken | string): void

  setNodeTypeInfoValue(nodeName: TfToken | string, key: TfToken | string, value: unknown): void

  setNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string, value: unknown): void

  setNodeParameterData(
    nodeName: TfToken | string, paramName: TfToken | string,
    paramData: HdMaterialNetworkInterfaceNodeParamData): void

  deleteNodeParameter(nodeName: TfToken | string, paramName: TfToken | string): void

  setNodeInputConnection(
    nodeName: TfToken | string, inputName: TfToken | string,
    connections: HdMaterialNetworkInterfaceInputConnectionVector): void

  deleteNodeInputConnection(nodeName: TfToken | string, inputName: TfToken | string): void

  // ------------------------------------------------------------------------
  // Terminal query & mutation
  getTerminalNames(): TfToken[]

  getTerminalConnection(terminalName: TfToken | string): HdMaterialNetworkInterfaceInputConnectionResult

  deleteTerminal(terminalName: TfToken | string): void

  setTerminalConnection(
    terminalName: TfToken | string, connection: HdMaterialNetworkInterfaceInputConnection): void
}
