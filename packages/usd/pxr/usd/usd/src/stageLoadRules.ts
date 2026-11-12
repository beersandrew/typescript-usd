// Ported from OpenUSD 26.11.1: pxr/usd/usd/stageLoadRules.cpp,
//  pxr/usd/usd/stageLoadRules.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

export const StageLoadRule = {
  All: 'all',
  Only: 'only',
  None: 'none',
} as const

export type StageLoadRule = typeof StageLoadRule[keyof typeof StageLoadRule]
export type LoadPolicy = 'withDescendants' | 'withoutDescendants'
export type StageLoadRuleEntry = readonly [path: string, rule: StageLoadRule]

const isAtOrBelow = (path: string, root: string): boolean =>
  path === root || root === '/' || path.startsWith(`${root}/`)

const compareEntries = (a: StageLoadRuleEntry, b: StageLoadRuleEntry): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0

/**
 * Payload inclusion rules corresponding to OpenUSD's UsdStageLoadRules.
 * An empty rule vector means load everything.
 */
export class StageLoadRules {
  static readonly AllRule = StageLoadRule.All
  static readonly OnlyRule = StageLoadRule.Only
  static readonly NoneRule = StageLoadRule.None

  private rules: StageLoadRuleEntry[] = []

  constructor(defaultIncluded = true) {
    if (!defaultIncluded) this.rules.push(['/', StageLoadRule.None])
  }

  static loadAll(): StageLoadRules { return new StageLoadRules() }
  static loadNone(): StageLoadRules { return new StageLoadRules(false) }

  clone(): StageLoadRules {
    const result = new StageLoadRules()
    result.setRules(this.rules)
    return result
  }

  getRules(): StageLoadRuleEntry[] {
    return this.rules.map(([path, rule]) => [path, rule])
  }

  setRules(rules: readonly StageLoadRuleEntry[]): void {
    this.rules = rules
      .map(([path, rule]): StageLoadRuleEntry => [path, rule])
      .sort(compareEntries)
  }

  addRule(path: string, rule: StageLoadRule): void {
    const existing = this.rules.findIndex(([rulePath]) => rulePath === path)
    if (existing >= 0) this.rules[existing] = [path, rule]
    else this.rules.push([path, rule])
    this.rules.sort(compareEntries)
  }

  loadWithDescendants(path: string): void {
    this.replaceSubtree(path, StageLoadRule.All)
  }

  loadWithoutDescendants(path: string): void {
    this.replaceSubtree(path, StageLoadRule.Only)
  }

  unload(path: string): void {
    this.replaceSubtree(path, StageLoadRule.None)
  }

  loadAndUnload(
    loadSet: Iterable<string>,
    unloadSet: Iterable<string>,
    policy: LoadPolicy = 'withDescendants',
  ): void {
    for (const path of unloadSet) this.unload(path)
    for (const path of loadSet) {
      if (policy === 'withDescendants') this.loadWithDescendants(path)
      else this.loadWithoutDescendants(path)
    }
  }

  // UsdStageLoadRules::Minimize (stageLoadRules.cpp:100-146). The leading
  // '/' AllRule is dropped first, and a single remaining rule returns early
  // without the redundancy walk (stageLoadRules.cpp:114-116).
  minimize(): void {
    if (this.rules.length === 0) return
    if (this.rules[0]![1] === StageLoadRule.All && this.rules[0]![0] === '/') {
      this.rules.splice(0, 1)
    }
    if (this.rules.length <= 1) return
    const parentIdxStack: number[] = []
    for (let i = 0; i !== this.rules.length; ++i) {
      const cur = this.rules[i]!
      while (parentIdxStack.length > 0
          && !isAtOrBelow(cur[0], this.rules[parentIdxStack.at(-1)!]![0])) {
        parentIdxStack.pop()
      }
      const parentRule = parentIdxStack.length === 0
        ? StageLoadRule.All : this.rules[parentIdxStack.at(-1)!]![1]
      if (cur[1] === parentRule) {
        this.rules.splice(i, 1)
        --i
      } else {
        parentIdxStack.push(i)
      }
    }
  }

  isLoaded(path: string): boolean {
    return this.getEffectiveRuleForPath(path) !== StageLoadRule.None
  }

  isLoadedWithAllDescendants(path: string): boolean {
    const prefix = this.longestPrefix(path)
    if (prefix && prefix[1] !== StageLoadRule.All) return false
    return this.rules
      .filter(([rulePath]) => isAtOrBelow(rulePath, path))
      .every(([, rule]) => rule === StageLoadRule.All)
  }

  isLoadedWithNoDescendants(path: string): boolean {
    const exact = this.rules.find(([rulePath]) => rulePath === path)
    if (exact?.[1] !== StageLoadRule.Only) return false
    return !this.rules.some(([rulePath, rule]) =>
      rulePath !== path && isAtOrBelow(rulePath, path) && rule !== StageLoadRule.None)
  }

  getEffectiveRuleForPath(path: string): StageLoadRule {
    const prefix = this.longestPrefix(path)
    if (!prefix) return StageLoadRule.All
    if (prefix[1] === StageLoadRule.All) return StageLoadRule.All
    if (prefix[0] === path && prefix[1] === StageLoadRule.Only) {
      return StageLoadRule.Only
    }

    const descendants = this.rules.filter(([rulePath]) =>
      rulePath !== path && isAtOrBelow(rulePath, path))
    for (let i = 0; i < descendants.length;) {
      const [directPath, rule] = descendants[i]!
      if (rule === StageLoadRule.All || rule === StageLoadRule.Only) {
        return StageLoadRule.Only
      }
      i++
      while (i < descendants.length && isAtOrBelow(descendants[i]![0], directPath)) i++
    }
    return StageLoadRule.None
  }

  equals(other: StageLoadRules): boolean {
    return JSON.stringify(this.rules) === JSON.stringify(other.rules)
  }

  /** @internal Compatibility predicate consumed by Pcp payload inclusion. */
  isIncluded(path: string): boolean { return this.isLoaded(path) }

  /** @internal Transitional Stage adapter; public callers use loadWithDescendants. */
  include(path: string): boolean {
    const before = JSON.stringify(this.rules)
    this.loadWithDescendants(path)
    return before !== JSON.stringify(this.rules)
  }

  /** @internal Transitional Stage adapter; public callers use unload. */
  exclude(path: string): boolean {
    const before = JSON.stringify(this.rules)
    this.unload(path)
    return before !== JSON.stringify(this.rules)
  }

  private replaceSubtree(path: string, rule: StageLoadRule): void {
    this.rules = this.rules.filter(([rulePath]) => !isAtOrBelow(rulePath, path))
    this.rules.push([path, rule])
    this.rules.sort(compareEntries)
  }

  private longestPrefix(path: string): StageLoadRuleEntry | undefined {
    let result: StageLoadRuleEntry | undefined
    for (const entry of this.rules) {
      if (isAtOrBelow(path, entry[0])
          && (!result || entry[0].length > result[0].length)) result = entry
    }
    return result
  }
}
