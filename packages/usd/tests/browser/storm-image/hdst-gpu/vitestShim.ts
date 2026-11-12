// The subset of vitest's describe / it / expect that the ported hdSt
// upstream tests use, for running them in a browser page
// (tests/browser/storm-image/hdst-gpu/run.mjs aliases 'vitest' to this file).
// Tests register here; main.ts runs them.

export interface RegisteredTest { name: string, fn: () => unknown }
export const registeredTests: RegisteredTest[] = []
const suites: string[] = []

export function describe(name: string, fn: () => void): void {
  suites.push(name)
  try { fn() } finally { suites.pop() }
}

export function it(name: string, fn: () => unknown): void {
  registeredTests.push({ name: [...suites, name].join(' > '), fn })
}
/** vitest's it.skipIf(condition): registers the test unless `condition`. */
it.skipIf = (condition: unknown) => (name: string, fn: () => unknown): void => {
  if (!condition) it(name, fn)
}
export const test = it

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    const x = Array.from(a as unknown as ArrayLike<unknown>), y = Array.from(b as unknown as ArrayLike<unknown>)
    return deepEqual(x, y)
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

const show = (v: unknown): string => {
  try { return JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? `${x}n` : x)?.slice(0, 400) ?? String(v) } catch { return String(v) }
}

function matchers(actual: unknown, message: string | undefined, negate: boolean) {
  const check = (ok: boolean, what: string) => {
    if (ok === negate) throw new Error(`${message ? message + ': ' : ''}expected ${show(actual)} ${negate ? 'not ' : ''}${what}`)
  }
  return {
    toBe: (e: unknown) => check(Object.is(actual, e), `to be ${show(e)}`),
    toEqual: (e: unknown) => check(deepEqual(actual, e), `to equal ${show(e)}`),
    toStrictEqual: (e: unknown) => check(deepEqual(actual, e), `to equal ${show(e)}`),
    toBeNull: () => check(actual === null, 'to be null'),
    toBeUndefined: () => check(actual === undefined, 'to be undefined'),
    toBeDefined: () => check(actual !== undefined, 'to be defined'),
    toBeTruthy: () => check(Boolean(actual), 'to be truthy'),
    toBeFalsy: () => check(!actual, 'to be falsy'),
    toBeGreaterThan: (e: number) => check((actual as number) > e, `to be > ${e}`),
    toBeGreaterThanOrEqual: (e: number) => check((actual as number) >= e, `to be >= ${e}`),
    toBeLessThan: (e: number) => check((actual as number) < e, `to be < ${e}`),
    toBeLessThanOrEqual: (e: number) => check((actual as number) <= e, `to be <= ${e}`),
    toBeCloseTo: (e: number, digits = 2) => check(Math.abs((actual as number) - e) < 10 ** -digits / 2, `to be close to ${e}`),
    toHaveLength: (n: number) => check((actual as { length: number }).length === n, `to have length ${n}`),
    toContain: (e: unknown) => check((actual as unknown[]).includes(e), `to contain ${show(e)}`),
  }
}

export function expect(actual: unknown, message?: string) {
  return { ...matchers(actual, message, false), not: matchers(actual, message, true) }
}

export function beforeAll(fn: () => unknown): void { void fn }
export function afterAll(fn: () => unknown): void { void fn }
export function beforeEach(fn: () => unknown): void { void fn }
export function afterEach(fn: () => unknown): void { void fn }
