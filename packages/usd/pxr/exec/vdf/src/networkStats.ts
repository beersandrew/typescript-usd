// Ported from OpenUSD 26.11.1: pxr/exec/vdf/networkStats.cpp,
//  pxr/exec/vdf/networkStats.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/networkStats.h and networkStats.cpp.
//
// Statistics about a network: per node type counts and memory, the longest
// type name, and the maximum fan in and fan out. The per-type memory comes
// from VdfNode::GetMemoryUsage, which counts only measurable data here
// (PLATFORM-DIVERGENCE(openexec-memory-usage), node.ts), so it is lower than
// native.

import { TF_AXIOM } from 'typescript-usd/tf'

import type { VdfNetwork } from './network.ts'
import type { VdfNode } from './node.ts'

/** VdfNetworkStats::NodeTypeStats (networkStats.h:36-39). */
export interface VdfNetworkStats_NodeTypeStats {
  count: number
  memUsage: number
}

// std::string ordering of std::map (byte-wise for these ASCII type names).
const _ByteLess = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export class VdfNetworkStats {
  // _statsMap (networkStats.h:44-45), ordered by type name.
  private readonly _statsMap = new Map<string, VdfNetworkStats_NodeTypeStats>()
  private _maxTypeNameLength = 0
  private _maxFanIn = 0
  private _maxFanInNodeName = ''
  private _maxFanOut = 0
  private _maxFanOutNodeName = ''

  /** VdfNetworkStats(network) (networkStats.cpp:39-86). */
  constructor(network: VdfNetwork) {
    let maxFanInNode: VdfNode | null = null
    let maxFanOutNode: VdfNode | null = null

    // _RecordMax (networkStats.cpp:14-36): a tie only keeps the max node if
    // the debug names agree.
    const recordMax = (
      stat: number, max: number, node: VdfNode, maxNode: VdfNode | null)
      : [number, VdfNode | null] => {
      TF_AXIOM(node, 'node')
      if (stat === max) {
        if (!maxNode || node.getDebugName() !== maxNode.getDebugName()) {
          return [max, null]
        }
        return [max, maxNode]
      } else if (stat > max) {
        return [stat, node]
      }
      return [max, maxNode]
    }

    const unsorted = new Map<string, VdfNetworkStats_NodeTypeStats>()
    const numNodes = network.getNodeCapacity()
    for (let i = 0; i < numNodes; ++i) {
      const node = network.getNode(i)
      if (!node) continue

      const typeName = node._getDemangledTypeName()
      const entry = unsorted.get(typeName)
      if (entry) {
        entry.count++
        entry.memUsage += node.getMemoryUsage()
      } else {
        unsorted.set(typeName, { count: 1, memUsage: node.getMemoryUsage() })
      }

      if (typeName.length > this._maxTypeNameLength) {
        this._maxTypeNameLength = typeName.length
      }

      for (const [, input] of node.getInputsIterator()) {
        [this._maxFanIn, maxFanInNode] = recordMax(
          input.getNumConnections(), this._maxFanIn, node, maxFanInNode)
      }

      for (const [, output] of node.getOutputsIterator()) {
        [this._maxFanOut, maxFanOutNode] = recordMax(
          output.getConnections().length, this._maxFanOut, node, maxFanOutNode)
      }
    }

    for (const key of [...unsorted.keys()].sort(_ByteLess)) {
      this._statsMap.set(key, unsorted.get(key)!)
    }

    this._maxFanInNodeName = maxFanInNode ? maxFanInNode.getDebugName() : 'NULL'
    this._maxFanOutNodeName = maxFanOutNode ? maxFanOutNode.getDebugName() : 'NULL'
  }

  /** GetMaxTypeNameLength (networkStats.h:57). */
  getMaxTypeNameLength(): number {
    return this._maxTypeNameLength
  }

  /** GetMaxFanIn (networkStats.h:61). */
  getMaxFanIn(): number {
    return this._maxFanIn
  }

  /** GetMaxFanInNodeName (networkStats.h:65). */
  getMaxFanInNodeName(): string {
    return this._maxFanInNodeName
  }

  /** GetMaxFanOut (networkStats.h:71). */
  getMaxFanOut(): number {
    return this._maxFanOut
  }

  /** GetMaxFanOutNodeName (networkStats.h:75). */
  getMaxFanOutNodeName(): string {
    return this._maxFanOutNodeName
  }

  /** GetStatsMap (networkStats.h:81): ordered by type name. */
  getStatsMap(): ReadonlyMap<string, VdfNetworkStats_NodeTypeStats> {
    return this._statsMap
  }
}
