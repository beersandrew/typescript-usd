// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/sparseVectorizedOutputTraverser.cpp,
//  pxr/exec/vdf/sparseVectorizedOutputTraverser.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/sparseVectorizedOutputTraverser.h and
// sparseVectorizedOutputTraverser.cpp.
//
// Traverses in the input-to-output direction, treating each output of the
// request as a separate traversal, and invokes the callback for terminal
// nodes. Dependencies of (output, mask) pairs are cached until Invalidate().
//
// Mapping choices:
// - WorkParallelForN runs serially (docs/openexec-x1.md 5).
// - The pointer-to-mask _OutputAndMask holds the mask itself.
// - _VisitedOutputs is a Map keyed by output; _PoolQueue (std::map ordered by
//   VdfPoolChainIndex) is a Map keyed by VdfPoolChainIndex.GetKey() whose top
//   is the smallest index; _DependencyMap is keyed by Vdf_MaskedOutputKey().

import { WorkParallelForN } from 'typescript-usd/work'

import type { VdfMask } from './mask.ts'
import { VdfMaskMemoizer } from './maskMemoizer.ts'
import { VdfMaskedOutput, Vdf_MaskedOutputKey } from './maskedOutput.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput, type VdfPoolChainIndex } from './poolChainIndex.ts'

/** NodeCallback (sparseVectorizedOutputTraverser.h:46). */
export type VdfSparseVectorizedOutputTraverser_NodeCallback =
  (node: VdfNode, index: number) => boolean

// _PoolDependency (sparseVectorizedOutputTraverser.h:66-69).
interface _PoolDependency {
  poolChainIndex: VdfPoolChainIndex
  maskedOutput: VdfMaskedOutput
}

// _Dependencies (sparseVectorizedOutputTraverser.h:72-76).
interface _Dependencies {
  outputs: VdfMaskedOutput[]
  poolOutputs: _PoolDependency[]
  nodes: VdfNode[]
}

// _OutputAndMask (sparseVectorizedOutputTraverser.h:81-84).
interface _OutputAndMask {
  output: VdfOutput
  mask: VdfMask
}

type _VisitedOutputs = Map<VdfOutput, VdfMask>
type _OutputStack = _OutputAndMask[]
type _PoolQueue = Map<string, { index: VdfPoolChainIndex, value: _OutputAndMask }>

export class VdfSparseVectorizedOutputTraverser {
  // _dependencyMap (sparseVectorizedOutputTraverser.h:139-141).
  private readonly _dependencyMap = new Map<string, _Dependencies>()

  // _maskMemoizer (sparseVectorizedOutputTraverser.h:144).
  private readonly _maskMemoizer = new VdfMaskMemoizer()

  /**
   * Traverse (sparseVectorizedOutputTraverser.cpp:19-40): one traversal per
   * request entry; callback receives the entry's index.
   */
  traverse(
    outputs: readonly VdfMaskedOutput[],
    callback: VdfSparseVectorizedOutputTraverser_NodeCallback | null): void {
    if (!outputs.length) return

    WorkParallelForN(outputs.length, (b: number, e: number) => {
      for (let i = b; i !== e; ++i) {
        this._traverse(i, outputs[i]!, callback)
      }
    })
  }

  /** Invalidate (sparseVectorizedOutputTraverser.cpp:42-46). */
  invalidate(): void {
    this._dependencyMap.clear()
  }

  // _Visit (sparseVectorizedOutputTraverser.cpp:48-79): visited masks are not
  // combined, so outputs may be visited more than once.
  private _visit(outputAndMask: _OutputAndMask, visitedOutputs: _VisitedOutputs): boolean {
    const visited = visitedOutputs.get(outputAndMask.output)
    if (!visited) {
      visitedOutputs.set(outputAndMask.output, outputAndMask.mask)
      return true
    } else if (visited.contains(outputAndMask.mask)) {
      return false
    }
    return true
  }

  // _Traverse (sparseVectorizedOutputTraverser.cpp:81-120).
  private _traverse(
    index: number,
    maskedOutput: VdfMaskedOutput,
    callback: VdfSparseVectorizedOutputTraverser_NodeCallback | null): void {
    const visitedOutputs: _VisitedOutputs = new Map()

    const stack: _OutputStack = [{ output: maskedOutput.GetOutput()!, mask: maskedOutput.GetMask() }]
    const queue: _PoolQueue = new Map()

    while (stack.length || queue.size) {
      while (stack.length) {
        const top = stack.pop()!
        if (this._visit(top, visitedOutputs)) {
          this._traverseOutput(index, top, callback, stack, queue)
        }
      }

      // Then the pool output highest up in the pool chain.
      if (queue.size) {
        let topKey = ''
        let topIndex: VdfPoolChainIndex | null = null
        for (const [key, entry] of queue) {
          if (!topIndex || entry.index.lessThan(topIndex)) {
            topIndex = entry.index
            topKey = key
          }
        }
        stack.push(queue.get(topKey)!.value)
        queue.delete(topKey)
      }
    }
  }

  // _TraverseOutput (sparseVectorizedOutputTraverser.cpp:122-160).
  private _traverseOutput(
    index: number,
    outputAndMask: _OutputAndMask,
    callback: VdfSparseVectorizedOutputTraverser_NodeCallback | null,
    stack: _OutputStack,
    queue: _PoolQueue): void {
    if (this._takePoolShortcut(outputAndMask, queue)) return

    const dependencies = this._getDependencies(outputAndMask)

    for (const dependency of dependencies.outputs) {
      stack.push({ output: dependency.GetOutput()!, mask: dependency.GetMask() })
    }

    for (const poolDependency of dependencies.poolOutputs) {
      const mo = poolDependency.maskedOutput
      this._queuePoolOutput(
        poolDependency.poolChainIndex,
        { output: mo.GetOutput()!, mask: mo.GetMask() },
        queue)
    }

    if (callback) {
      for (const node of dependencies.nodes) {
        callback(node, index)
      }
    }
  }

  // _QueuePoolOutput (sparseVectorizedOutputTraverser.cpp:162-178).
  private _queuePoolOutput(
    poolChainIndex: VdfPoolChainIndex,
    outputAndMask: _OutputAndMask,
    queue: _PoolQueue): void {
    const key = poolChainIndex.getKey()
    const queued = queue.get(key)
    if (!queued) {
      queue.set(key, { index: poolChainIndex, value: { ...outputAndMask } })
    } else {
      // Append the traversal mask to the queued output.
      queued.value.mask = this._maskMemoizer.append(queued.value.mask, outputAndMask.mask)
    }
  }

  // _TakePoolShortcut (sparseVectorizedOutputTraverser.cpp:180-214).
  private _takePoolShortcut(outputAndMask: _OutputAndMask, queue: _PoolQueue): boolean {
    const output = outputAndMask.output
    if (!Vdf_IsPoolOutput(output) || output.getConnections().length !== 1) {
      return false
    }

    const connection = output.getConnections()[0]!
    const associatedOutput = connection.getTargetInput().getAssociatedOutput()
    if (!associatedOutput || !Vdf_IsPoolOutput(associatedOutput)) {
      return false
    }

    const network = connection.getTargetNode().getNetwork()
    const pci = network.getPoolChainIndex(associatedOutput)

    this._queuePoolOutput(pci, { output: associatedOutput, mask: outputAndMask.mask }, queue)

    return true
  }

  // _GetDependencies (sparseVectorizedOutputTraverser.cpp:216-235).
  private _getDependencies(outputAndMask: _OutputAndMask): _Dependencies {
    const mo = new VdfMaskedOutput(outputAndMask.output, outputAndMask.mask)
    const key = Vdf_MaskedOutputKey(mo)
    const found = this._dependencyMap.get(key)
    if (found) return found

    const dependencies: _Dependencies = { outputs: [], poolOutputs: [], nodes: [] }
    this._computeDependencies(outputAndMask, dependencies)
    this._dependencyMap.set(key, dependencies)
    return dependencies
  }

  // _ComputeDependencies (sparseVectorizedOutputTraverser.cpp:237-290).
  private _computeDependencies(
    outputAndMask: _OutputAndMask,
    dependencies: _Dependencies): void {
    const output = outputAndMask.output
    const mask = outputAndMask.mask

    let nodeDependencies: VdfMaskedOutput[] = []
    for (const connection of output.getConnections()) {
      // Skip connections whose mask does not overlap the traversal mask.
      const connectionMask = connection.GetMask()
      if (connectionMask.isAllZeros() || !connectionMask.overlaps(mask)) continue

      // Terminal nodes get the callback later.
      const node = connection.getTargetNode()
      if (!node.hasOutputConnections()) {
        dependencies.nodes.push(node)
      }

      node.computeOutputDependencyMasks(connection, mask, nodeDependencies)

      for (const dependency of nodeDependencies) {
        if (Vdf_IsPoolOutput(dependency.GetOutput()!)) {
          const pci = node.getNetwork().getPoolChainIndex(dependency.GetOutput()!)
          dependencies.poolOutputs.push({ poolChainIndex: pci, maskedOutput: dependency })
        } else {
          dependencies.outputs.push(dependency)
        }
      }

      nodeDependencies = []
    }
  }
}

export declare namespace VdfSparseVectorizedOutputTraverser {
  type NodeCallback = VdfSparseVectorizedOutputTraverser_NodeCallback
}
