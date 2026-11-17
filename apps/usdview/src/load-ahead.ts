/** Loading ahead while paused: the payloads playback from the paused frame
 * will need, a share per idle moment (docs/viewer-contracts.md, "Working
 * set", paused).
 *
 * PLATFORM-DIVERGENCE(usdview-paused-load-ahead): usdview has no load
 * schedule of its own; a load-schedule plugin calls UsdStage::LoadAndUnload
 * on each frame change (appController.py:3885 _updateOnFrameChange) and
 * nothing runs while the timeline is paused. Here a working set (working-set.ts)
 * loads a payload in its lead-in a few per frame while playing (load-schedule.ts
 * perChange), and a jump (a released scrub, a seek) loads only what the frame
 * shows. Pressing Play there would load the lead-in carriers, and the ones
 * becoming needed, in the first playing frames. So while the viewer is idle
 * (paused, not scrubbing, no frame, display, composition or scene update in
 * flight, no camera drag, the last draw converged, nothing touched for
 * `quiet` ms) it applies the rest of the paused frame's scheduled set, one
 * per-change budget per step, needed soonest first, each step's layers and
 * images read first (load-prefetch.ts read). It loads nothing playback at
 * this frame would not hold: memory stays the schedule's. It stops when the
 * set is reached, and while playing or scrubbing; the next paused frame
 * starts it again. A schedule without a budget (an authored one) loads its
 * whole set on the frame change, so there is nothing left to do. */
import type { LoadScheduler } from './load-schedule'
import type { LoadPrefetcher } from './load-prefetch'

export interface PausedLoadAheadOptions {
  readonly scheduler: LoadScheduler
  readonly prefetcher?: LoadPrefetcher
  /** The frame on screen. */
  readonly frame: () => number
  /** Whether the viewer is idle now (see above). */
  readonly idle: () => boolean
  /** Milliseconds between steps that loaded. */
  readonly interval?: number
  /** Milliseconds since the last interaction before a step. */
  readonly quiet?: number
  readonly now?: () => number
  /** A step's load failed: the loader stops until started again. */
  readonly failed?: (error: unknown) => void
}

export const pausedLoadAheadInterval = 32
export const pausedLoadAheadQuiet = 300

export type PausedLoadAheadStep = 'done' | 'waiting' | 'loaded'

export class PausedLoadAhead {
  readonly #options: PausedLoadAheadOptions
  #timer: ReturnType<typeof setTimeout> | undefined
  #stepping: Promise<PausedLoadAheadStep> | undefined
  #lastInteraction = -Infinity
  #disposed = false
  /** stop() was called since the last start(). */
  #stopped = false

  constructor(options: PausedLoadAheadOptions) { this.#options = options }

  /** Whether a step is due (armed) or running. */
  get active(): boolean { return !!this.#timer || !!this.#stepping }

  /** (Re)arms the next step: a paused frame settled, playback stopped, the
   *  scene opened. */
  start(delay = this.#options.interval ?? pausedLoadAheadInterval): void {
    if (this.#disposed) return
    this.#stopped = false
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => { this.#timer = undefined; void this.step() }, delay)
  }

  /** The user touched the view: the next step waits `quiet` ms from now. */
  interact(): void { this.#lastInteraction = this.#now() }

  /** Playback or a scrub started: no steps until started again. A step in
   *  flight finishes its load. */
  stop(): void { this.#stopped = true; clearTimeout(this.#timer); this.#timer = undefined }

  dispose(): void { this.#disposed = true; this.stop() }

  /** One step: applies one budget of the paused frame's remaining set when
   *  idle, else waits. */
  step(): Promise<PausedLoadAheadStep> {
    return this.#stepping ??= this.#step().finally(() => { this.#stepping = undefined })
  }

  /** Re-arms unless stopped or disposed meanwhile. */
  #again(delay?: number): void { if (!this.#stopped && !this.#disposed) this.start(delay) }

  #now(): number { return this.#options.now?.() ?? performance.now() }

  #ready(): boolean {
    const quiet = this.#options.quiet ?? pausedLoadAheadQuiet
    return !this.#disposed && this.#options.idle() && !this.#options.scheduler.busy && this.#now() - this.#lastInteraction >= quiet
  }

  async #step(): Promise<PausedLoadAheadStep> {
    const {scheduler, prefetcher} = this.#options
    const quiet = this.#options.quiet ?? pausedLoadAheadQuiet
    if (this.#disposed) return 'done'
    const frame = this.#options.frame()
    const change = scheduler.remainder(frame)
    if (!change) return 'done'
    if (!this.#ready()) { this.#again(quiet); return 'waiting' }
    try {
      // The layers and images first (fetches; nothing waits on them), so the
      // load only composes and its first draw opens the images from memory.
      if (prefetcher) await Promise.all(change.load.map(carrier => prefetcher.read(carrier)))
      if (this.#options.frame() !== frame || !this.#ready()) { this.#again(quiet); return 'waiting' }
      const applied = await scheduler.settle(frame)
      if (this.#disposed) return 'done'
      if (!applied) {
        // Nothing applied: in flight elsewhere (retry), or no progress (stop).
        if (scheduler.busy) { this.#again(quiet); return 'waiting' }
        return 'done'
      }
      if (scheduler.remainder(this.#options.frame())) this.#again()
      return 'loaded'
    } catch (error) {
      this.stop()
      this.#options.failed?.(error)
      return 'done'
    }
  }
}
