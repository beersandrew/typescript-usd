// Ported from OpenUSD 26.11.1: pxr/base/trace/aggregateNode.cpp,
//  pxr/base/trace/aggregateNode.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceAggregateNode, ported from OpenUSD v26.08
// pxr/base/trace/aggregateNode.h:40-245 and aggregateNode.cpp:17-452.
// Time stamps are this package's milliseconds; upstream's are unsigned ticks,
// so every subtraction clamps at zero as upstream does.

interface _CounterValue { inclusive: number, exclusive: number }

// aggregateNode.cpp:223-235
interface _StackNode {
  eventNode: AggregateNode
  parentIdx: number
  remainingChildren: number
}

export class AggregateNode {
  readonly #key: string
  #ts: number
  #exclusiveTs: number
  #count: number
  #exclusiveCount: number
  // aggregateNode.h:204-207: recursive data is kept apart from the collected data.
  #recursiveCount: number
  #recursionParent: AggregateNode | undefined
  #recursiveExclusiveTs: number
  readonly #children: AggregateNode[] = []
  readonly #childrenByKey = new Map<string, number>()
  readonly #counterValues = new Map<number, _CounterValue>()
  #expanded = false
  #isRecursionMarker = false
  #isRecursionHead = false
  #isRecursionProcessed = false

  // aggregateNode.h:183-189
  constructor(key = 'root', ts = 0, count = 1, exclusiveCount = 1) {
    this.#key = key
    this.#ts = ts
    this.#exclusiveTs = ts
    this.#count = count
    this.#exclusiveCount = exclusiveCount
    this.#recursiveCount = count
    this.#recursiveExclusiveTs = ts
  }

  // aggregateNode.h:62-73
  static new(key?: string, ts = 0, count = 1, exclusiveCount = 1): AggregateNode {
    return key === undefined ? new AggregateNode('root', 0, 0) : new AggregateNode(key, ts, count, exclusiveCount)
  }

  /**
   * Append(key, ts, c = 1, xc = 1) (aggregateNode.cpp:17-43) adds or updates
   * a child and returns it; Append(child) (aggregateNode.cpp:67-101) merges an
   * existing subtree.
   */
  append(key: string, ts: number, c?: number, xc?: number): AggregateNode
  append(child: AggregateNode): void
  append(arg: string | AggregateNode, ts = 0, c = 1, xc = 1): AggregateNode | void {
    if (arg instanceof AggregateNode) { this.#appendChild(arg); return }
    let n = this.getChild(arg)
    if (n) {
      n.#ts += ts
      n.#count += c
      n.#recursiveCount += c
      n.#exclusiveCount += xc
      n.#exclusiveTs += ts
      n.#recursiveExclusiveTs += ts
    } else {
      n = new AggregateNode(arg, ts, c, xc)
      this.#children.push(n)
      this.#childrenByKey.set(arg, this.#children.length - 1)
    }
    this.#discountChildTime(ts)
    return n
  }

  // aggregateNode.cpp:45-65
  appendBlind(key: string, ts: number, c = 1, xc = 1): void {
    this.append(key, ts, c, xc)
  }

  #appendChild(child: AggregateNode): void {
    const n = this.getChild(child.getKey())
    if (n) {
      n.#ts += child.#ts
      n.#count += child.#count
      n.#recursiveCount += child.#count
      n.#exclusiveCount += child.#exclusiveCount
      n.#exclusiveTs += child.#ts
      n.#recursiveExclusiveTs += child.#ts
      for (const [index, value] of child.#counterValues) {
        const c = n.#CounterValue(index)
        c.inclusive += value.inclusive
        c.exclusive += value.exclusive
      }
      for (const c of child.#children) n.#appendChild(c)
    } else {
      this.#children.push(child)
      this.#childrenByKey.set(child.getKey(), this.#children.length - 1)
    }
    this.#discountChildTime(child.#ts)
  }

  // aggregateNode.cpp:37-40: update exclusive time to discount a new child.
  #discountChildTime(ts: number): void {
    this.#exclusiveTs = this.#exclusiveTs >= ts ? this.#exclusiveTs - ts : 0
    this.#recursiveExclusiveTs = this.#recursiveExclusiveTs >= ts ? this.#recursiveExclusiveTs - ts : 0
  }

  getKey(): string { return this.#key }
  getInclusiveTime(): number { return this.#ts }
  // aggregateNode.cpp:103-107
  getExclusiveTime(recursive = false): number {
    return recursive ? this.#recursiveExclusiveTs : this.#exclusiveTs
  }
  getCount(recursive = false): number { return recursive ? this.#recursiveCount : this.#count }
  getExclusiveCount(): number { return this.#exclusiveCount }

  // aggregateNode.cpp:109-135
  appendInclusiveCounterValue(index: number, value: number): void { this.#CounterValue(index).inclusive += value }
  getInclusiveCounterValue(index: number): number { return this.#counterValues.get(index)?.inclusive ?? 0 }
  appendExclusiveCounterValue(index: number, value: number): void { this.#CounterValue(index).exclusive += value }
  getExclusiveCounterValue(index: number): number { return this.#counterValues.get(index)?.exclusive ?? 0 }

  getChildren(): readonly AggregateNode[] { return this.#children }
  getChildrenRef(): readonly AggregateNode[] { return this.#children }
  // aggregateNode.cpp:137-152
  getChild(key: string): AggregateNode | undefined {
    const i = this.#childrenByKey.get(key)
    return i === undefined ? undefined : this.#children[i]
  }

  setExpanded(expanded: boolean): void { this.#expanded = expanded }
  isExpanded(): boolean { return this.#expanded }
  isRecursionMarker(): boolean { return this.#isRecursionMarker }
  isRecursionHead(): boolean { return this.#isRecursionHead }

  // Property spellings of the getters above.
  get key(): string { return this.#key }
  get children(): readonly AggregateNode[] { return this.#children }
  get count(): number { return this.#count }
  get exclusiveCount(): number { return this.#exclusiveCount }
  get inclusiveTime(): number { return this.#ts }
  get exclusiveTime(): number { return this.#exclusiveTs }
  get expanded(): boolean { return this.#expanded }
  set expanded(value: boolean) { this.#expanded = value }

  // aggregateNode.cpp:154-219
  adjustForOverheadAndNoise(
    scopeOverhead: number, timerQuantum: number, numDescendantNodes?: { value: number },
  ): void {
    const local = { value: this.#children.length }
    for (const child of this.#children) child.adjustForOverheadAndNoise(scopeOverhead, timerQuantum, local)

    let totalOverhead = scopeOverhead * local.value
    if (totalOverhead > this.#ts) totalOverhead = this.#ts
    this.#ts -= totalOverhead

    // aggregateNode.cpp:186-191: noisy when count * quantum is 5% or more of the time.
    const isNoisy = (totalTime: number, count: number) => count * timerQuantum * 20 >= totalTime

    let newExclusiveTs = this.#ts
    for (const child of this.#children) {
      if (isNoisy(child.#ts, child.#count)) {
        child.#ts = child.#exclusiveTs = 0
      } else {
        newExclusiveTs -= newExclusiveTs > child.#ts ? child.#ts : newExclusiveTs
      }
    }
    this.#exclusiveTs = newExclusiveTs
    if (numDescendantNodes) numDescendantNodes.value += local.value
  }

  // aggregateNode.cpp:237-327: iterative post-order traversal that merges a
  // node into the nearest ancestor with the same key and leaves a marker.
  markRecursiveChildren(): void {
    if (this.isRecursionHead()) return
    const stack: _StackNode[] = [{ eventNode: this, parentIdx: -1, remainingChildren: this.#children.length }]
    while (stack.length) {
      const top = stack.at(-1)!
      const curNode = top.eventNode
      const numKids = top.remainingChildren
      const parentIdx = top.parentIdx
      curNode.#isRecursionProcessed = true
      if (numKids === 0) {
        let p = parentIdx
        while (p !== -1) {
          const parentNode = stack[p]!.eventNode
          if (curNode.getKey() === parentNode.getKey()) {
            parentNode.#mergeRecursive(curNode)
            curNode.#setAsRecursionMarker(parentNode)
            break
          }
          p = stack[p]!.parentIdx
        }
        if (parentIdx > -1) stack[parentIdx]!.remainingChildren -= 1
        stack.pop()
      } else {
        const parent = stack.length - 1
        for (let i = 0; i < numKids; i++) {
          const child = curNode.#children[i]!
          if (!child.#isRecursionProcessed) {
            stack.push({ eventNode: child, parentIdx: parent, remainingChildren: child.#children.length })
          } else {
            stack[parent]!.remainingChildren -= 1
          }
        }
      }
    }
  }

  // aggregateNode.cpp:329-426
  #mergeRecursive(node: AggregateNode): void {
    if (this.isRecursionMarker()) {
      // A marker merges into the head of the recursive call.
      const parent = this.#recursionParent
      if (parent) parent.#mergeRecursive(node)
      return
    }
    this.#recursiveCount += node.getCount(true)
    this.#recursiveExclusiveTs += node.getExclusiveTime(true)
    this.#isRecursionHead = true

    const size = node.#children.length
    for (let i = 0; i < size; ++i) {
      const child = node.#children[i]!
      const key = child.getKey()
      let n = this.getChild(key)
      if (!n) {
        n = new AggregateNode(key, child.getInclusiveTime(), 0, child.getExclusiveCount())
        // aggregateNode.cpp:372-376: exclusive time is computed from the
        // recursive time during the merge to avoid double counting.
        n.#exclusiveTs = child.getExclusiveTime(false)
        n.#recursiveExclusiveTs = 0
        this.#children.push(n)
        this.#childrenByKey.set(key, this.#children.length - 1)
        if (child.isRecursionMarker()) n.#setAsRecursionMarker(child.#recursionParent)
        else n.#mergeRecursive(child)
      } else {
        // aggregateNode.cpp:390-421: merge unless a marker meets anything.
        const nonMarkerIntoNonMarker = !child.isRecursionMarker() && !n.isRecursionMarker()
        const nonMarkerIntoMarker = !child.isRecursionMarker() && n.isRecursionMarker()
        if (nonMarkerIntoNonMarker || nonMarkerIntoMarker) n.#mergeRecursive(child)
      }
    }
  }

  // aggregateNode.cpp:428-441
  #setAsRecursionMarker(parent: AggregateNode | undefined): void {
    this.#isRecursionMarker = true
    this.#recursionParent = parent
  }

  // aggregateNode.cpp:443-462
  calculateInclusiveCounterValues(): void {
    for (const c of this.#children) c.calculateInclusiveCounterValues()
    for (const v of this.#counterValues.values()) v.inclusive = v.exclusive
    for (const c of this.#children) {
      for (const [index, cv] of c.#counterValues) {
        if (cv.inclusive !== 0) this.#CounterValue(index).inclusive += cv.inclusive
      }
    }
  }

  #CounterValue(index: number): _CounterValue {
    let value = this.#counterValues.get(index)
    if (!value) this.#counterValues.set(index, value = { inclusive: 0, exclusive: 0 })
    return value
  }
}

export { AggregateNode as TraceAggregateNode }
