import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { animateOrbit } from '../src/orbit'

let frames: Map<number, FrameRequestCallback>, next: number
beforeEach(() => {
  frames = new Map(); next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => vi.unstubAllGlobals())
function frame(time: number) {
  const pending = [...frames.values()]; frames.clear()
  pending.forEach(callback => callback(time))
}
it('draws one full revolution at elapsed time, including the final frame', async () => {
  const draw = vi.fn()
  const done = animateOrbit(draw, new AbortController().signal)
  frame(100); frame(2100); frame(4100)
  await done
  expect(draw.mock.calls.flat()).toEqual([0, Math.PI, 2 * Math.PI])
  expect(frames.size).toBe(0)
})
it('cancels without drawing or leaving an animation callback pending', async () => {
  const controller = new AbortController(), draw = vi.fn()
  const done = animateOrbit(draw, controller.signal)
  controller.abort()
  await expect(done).rejects.toMatchObject({name: 'AbortError'})
  frame(100)
  expect(draw).not.toHaveBeenCalled()
  expect(frames.size).toBe(0)
})
it('reports rendering errors instead of completing successfully', async () => {
  const done = animateOrbit(() => { throw new Error('GPU draw failed') }, new AbortController().signal)
  frame(100)
  await expect(done).rejects.toThrow('GPU draw failed')
  expect(frames.size).toBe(0)
})
