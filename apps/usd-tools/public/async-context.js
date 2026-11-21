// PLATFORM-DIVERGENCE(usd-tools-single-lane-async-context): the ported tools
// bind a resolver context around asynchronous work
// (ArResolverContextBinder.run(async () => ...), e.g. usdcat.ts, usdtree.ts),
// which TypeScript USD carries with the host's AsyncContext.Variable or Node's
// AsyncLocalStorage (ar/src/asyncState.ts). Safari has neither. A tool page
// runs one tool at a time, as one command-line process, so this page gives
// the library a single-lane AsyncContext.Variable: run() holds its value
// until the body (and its promise) finishes, and get() reads the innermost
// value still running. Concurrent sibling scopes with different values would
// see each other's, so pages never run two tools at once (tool-page.ts
// queues runs). Installed only when the host has no AsyncContext; loaded
// as a classic script before the pages' modules, since the library reads
// AsyncContext when it loads (a bundled import can run after it).
(() => {
class SingleLaneVariable {
  #values = []
  constructor(options = {}) { this.name = options.name ?? '' }
  get() { return this.#values.at(-1)?.value }
  run(value, fn) {
    const entry = { value }
    this.#values.push(entry)
    const leave = () => {
      const i = this.#values.lastIndexOf(entry)
      if (i >= 0) this.#values.splice(i, 1)
    }
    let result
    try {
      result = fn()
    } catch (error) {
      leave()
      throw error
    }
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      return Promise.resolve(result).finally(leave)
    }
    leave()
    return result
  }
}

const host = globalThis
if (!host.AsyncContext?.Variable) host.AsyncContext = { ...host.AsyncContext, Variable: SingleLaneVariable }
})()
