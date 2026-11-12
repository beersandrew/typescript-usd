// The single-threaded WorkDispatcher (pxr/base/work/src/dispatcher.ts):
// Wait() runs every task, including tasks added while waiting, most recent
// first (TBB's owner-thread order), and Cancel() drops pending tasks.
import { describe, expect, it } from 'vitest'
import {
  WorkDispatcher, WorkGetConcurrencyLimit, WorkHasConcurrency, WorkParallelForN,
  WorkWithScopedDispatcher,
} from '../src/index.ts'

describe('WorkDispatcher', () => {
  it('drains tasks added while waiting, most recent first', () => {
    const order: string[] = []
    const d = new WorkDispatcher()
    d.run(() => { order.push('a'); d.run(() => order.push('a1')) })
    d.run(() => order.push('b'))
    expect(order).toEqual([])
    d.Wait()
    expect(order).toEqual(['b', 'a', 'a1'])
  })

  it('Cancel drops pending tasks and Wait resets it', () => {
    const order: string[] = []
    const d = new WorkDispatcher()
    d.run(() => order.push('dropped'))
    d.run(() => { order.push('first'); d.cancel() })
    d.Wait()
    expect(order).toEqual(['first'])
    expect(d.isCancelled()).toBe(false)
    d.run(() => order.push('after'))
    d.Wait()
    expect(order).toEqual(['first', 'after'])
  })

  it('WorkWithScopedDispatcher waits after the function returns', () => {
    const order: string[] = []
    const r = WorkWithScopedDispatcher(d => { d.run(() => order.push('task')); order.push('fn'); return 7 })
    expect(r).toBe(7)
    expect(order).toEqual(['fn', 'task'])
  })

  it('has no concurrency, so WorkParallelForN calls back once over the range', () => {
    expect(WorkGetConcurrencyLimit()).toBe(1)
    expect(WorkHasConcurrency()).toBe(false)
    const calls: [number, number][] = []
    WorkParallelForN(5, (b, e) => calls.push([b, e]))
    WorkParallelForN(0, (b, e) => calls.push([b, e]))
    expect(calls).toEqual([[0, 5]])
  })
})
