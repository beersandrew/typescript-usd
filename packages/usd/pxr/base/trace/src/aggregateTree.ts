// Ported from OpenUSD 26.11.1: pxr/base/trace/aggregateTree.cpp,
//  pxr/base/trace/aggregateTree.h, pxr/base/trace/aggregateTreeBuilder.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceAggregateTree, ported from OpenUSD v26.08 pxr/base/trace/aggregateTree.h:31
// and aggregateTree.cpp:20-74, with the node construction of
// aggregateTreeBuilder.cpp:41-118.
import { Collection } from './collection.ts'
import { EventNode, EventTree } from './eventTree.ts'
import { AggregateNode } from './aggregateNode.ts'

export class AggregateTree {
  #root = AggregateNode.new()
  readonly #eventTimes = new Map<string, number>()

  getRoot(): AggregateNode { return this.#root }
  get root(): AggregateNode { return this.#root }
  /** Total inclusive time per key (aggregateTree.h:58-60). */
  getEventTimes(): ReadonlyMap<string, number> { return this.#eventTimes }

  // aggregateTree.cpp:20-30
  clear(): void {
    this.#root = AggregateNode.new()
    this.#eventTimes.clear()
  }

  // aggregateTree.cpp:66-72
  append(eventTree: EventTree, _collection?: Collection): void {
    this.#createAggregateNodes(eventTree)
  }

  /** Builds the event tree for `collection` and appends it. */
  add(collection: Collection): void { this.append(EventTree.new(collection), collection) }

  // aggregateTreeBuilder.cpp:41-118
  #createAggregateNodes(tree: EventTree): void {
    interface StackEntry { children: readonly EventNode[], next: number, aggNode: AggregateNode }
    const treeStack: StackEntry[] = []
    const firstNodes = tree.getRoot().getChildren()
    for (let i = firstNodes.length - 1; i >= 0; --i) {
      const node = firstNodes[i]!
      treeStack.push({
        children: node.getChildren(), next: 0,
        aggNode: this.#root.append(node.getKey(), node.getTimeDuration()),
      })
    }
    while (treeStack.length) {
      const entry = treeStack.at(-1)!
      if (entry.next >= entry.children.length) { treeStack.pop(); continue }
      const curNode = entry.children[entry.next++]!
      const duration = curNode.getTimeDuration()
      if (duration > 0) {
        this.#eventTimes.set(curNode.getKey(), (this.#eventTimes.get(curNode.getKey()) ?? 0) + duration)
      }
      const children = curNode.getChildren()
      if (children.length) {
        treeStack.push({ children, next: 0, aggNode: entry.aggNode.append(curNode.getKey(), duration) })
      } else {
        entry.aggNode.appendBlind(curNode.getKey(), duration)
      }
    }
  }
}

export { AggregateTree as TraceAggregateTree }
