// The usdcat cat in 3D: a low-poly black cat (cat3d-model.ts) sitting at the
// back of the yard, drawn by Storm (storm-view.ts). It moves files by
// telekinesis: it follows a file with its gaze, and its eyes cycle through
// the rainbow while usdcat runs. Each frame the cat's joints and eye colors are set on the
// stage and Storm draws the result; the files themselves are page elements
// the page flies to the point in front of the cat (holdPoint).
import { Stage } from 'typescript-usd/usd'
import { Layer, sdfChangeBlock } from 'typescript-usd/sdf'
import { catYardUsda, EYE, linear } from './cat3d-model'
import { StormView, lookAt, perspective, project, type M4 } from './storm-view'
import { reducedMotion } from './playful'

/** What the page asks of a cat (the 2D fallback in usdcat.ts does the same). */
export interface CatActor {
  /** Where a file hovers while the cat converts it, in yard pixels. */
  holdPoint(): [number, number]
  /** Rainbow eyes while usdcat runs. */
  telekinesis(on: boolean): void
  /** The page element the cat follows with its gaze (a moving file), or
   *  null to look around calmly. */
  watch(target: HTMLElement | null): void
  /** Ears up while a file is dragged over the page. */
  perk(on: boolean): void
  /** A puzzled head tilt, for a file that would not convert. */
  puzzle(): Promise<void>
}

/** The yard in world units: the camera keeps this half width at the front
 *  of the yard, so a fraction of the yard's width is always the same place. */
const HALF_WIDTH = 3.1
/** Where the two stacks of files sit, as fractions of the yard's width. */
export const INBOX_AT = 0.16
export const OUTBOX_AT = 0.84
const worldX = (fraction: number) => (fraction * 2 - 1) * HALF_WIDTH

const EYE_HEIGHT = 1.35, EYE_DISTANCE = 6.2, LOOK_HEIGHT = 0.45
/** The cat's seat at the back of the yard, and its size there. */
const SEAT: [number, number, number] = [0, 0, -1.5]
const SIZE = 1.05
/** Where a file hovers: in front of the cat, at its eye height. */
const HOLD: [number, number, number] = [-0.55, 1.12, -1.2]

const approach = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt)
/** A fully saturated color around the hue wheel (0..1), in sRGB. */
const rainbow = (h: number): [number, number, number] => {
  const k = (n: number) => (n + h * 6) % 6
  const c = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1))
  return [c(5), c(3), c(1)]
}

export class Cat3D implements CatActor {
  readonly #yard: HTMLElement
  readonly #view: StormView
  readonly #stage: Stage
  #cssWidth = 1
  #cssHeight = 1
  #viewM: M4 = []
  #projM: M4 = []
  readonly #eye: [number, number, number] = [0, EYE_HEIGHT, EYE_DISTANCE]
  #power = 0
  #powered = false
  #perk = 0
  #perked = false
  #tilt = 0
  #tilted = false
  #eyesResting = false
  #watched: HTMLElement | null = null
  #look = 0
  #last = performance.now()

  static async create(yard: HTMLElement): Promise<Cat3D> {
    const layer = Layer.createAnonymous('usdcat-yard.usda')
    if (!layer.importFromString(catYardUsda({ halfWidth: HALF_WIDTH, inboxX: worldX(INBOX_AT), outboxX: worldX(OUTBOX_AT) })))
      throw new Error('The cat stage did not parse.')
    const stage = await Stage.open(layer)
    const canvas = document.createElement('canvas')
    canvas.className = 'yard-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const view = await StormView.create(canvas, stage)
    view.clearColor = [0.78, 0.89, 0.98]
    view.lights = [
      { direction: [-0.5, 1, 0.7], color: [0.95, 0.9, 0.8] },
      { camera: true, color: [0.3, 0.3, 0.34] },
    ]
    yard.prepend(canvas)
    return new Cat3D(yard, view, stage)
  }

  private constructor(yard: HTMLElement, view: StormView, stage: Stage) {
    this.#yard = yard
    this.#view = view
    this.#stage = stage
    const set = (name: string, value: unknown) => stage.getPrim('/Yard/Cat')?.attr(name).set(value)
    set('xformOp:translate', SEAT)
    set('xformOp:rotateY', -90) // facing the viewer
    set('xformOp:scale', [SIZE, SIZE, SIZE])
    new ResizeObserver(() => this.#resize()).observe(yard)
    this.#resize()
    requestAnimationFrame(now => void this.#frame(now))
  }

  holdPoint(): [number, number] { return this.#screenOf(HOLD) }
  telekinesis(on: boolean): void { this.#powered = on }
  watch(target: HTMLElement | null): void { this.#watched = target }

  /** Where the cat's gaze should turn (degrees, + toward screen right):
   *  toward the watched element, else a slow look around. */
  #gaze(t: number): number {
    const target = this.#watched
    if (!target?.isConnected) return Math.sin(t * 0.35) * 22 + Math.sin(t * 0.13) * 8
    const r = target.getBoundingClientRect(), y = this.#yard.getBoundingClientRect()
    const [cx] = this.#screenOf([SEAT[0], 0.9, SEAT[2]])
    const u = (r.left + r.width / 2 - y.left - cx) / Math.max(1, y.width)
    return Math.max(-55, Math.min(55, u * 150))
  }
  perk(on: boolean): void { this.#perked = on }

  async puzzle(): Promise<void> {
    this.#tilted = true
    await new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : 900))
    this.#tilted = false
  }

  #screenOf(point: readonly [number, number, number]): [number, number] {
    return project(point, this.#viewM, this.#projM, this.#cssWidth, this.#cssHeight)
  }

  #resize(): void {
    const rect = this.#yard.getBoundingClientRect()
    this.#cssWidth = Math.max(1, rect.width)
    this.#cssHeight = Math.max(1, rect.height)
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.#view.canvas.width = Math.round(this.#cssWidth * dpr)
    this.#view.canvas.height = Math.round(this.#cssHeight * dpr)
    const aspect = this.#cssWidth / this.#cssHeight
    // Fit the yard's width: the vertical field of view follows the aspect.
    const distance = Math.hypot(EYE_DISTANCE, EYE_HEIGHT - LOOK_HEIGHT)
    const fovY = Math.min(70, 2 * Math.atan(HALF_WIDTH / distance / aspect) * 180 / Math.PI)
    this.#viewM = lookAt(this.#eye, [0, LOOK_HEIGHT, 0])
    this.#projM = perspective(fovY, aspect, 0.1, 60)
    this.#yard.style.setProperty('--ground-y', `${this.#screenOf([0, 0, 0])[1]}px`)
  }

  async #frame(now: number): Promise<void> {
    const dt = Math.min(0.05, (now - this.#last) / 1000)
    this.#last = now
    this.#power = approach(this.#power, this.#powered ? 1 : 0, 14, dt)
    this.#perk = approach(this.#perk, this.#perked ? 1 : 0, 10, dt)
    this.#tilt = approach(this.#tilt, this.#tilted ? 1 : 0, 9, dt)
    this.#look = approach(this.#look, this.#gaze(now / 1000), this.#watched ? 9 : 2.5, dt)
    this.#pose(now / 1000)
    try {
      await (this.#stage as unknown as { flushChanges?: () => Promise<void> }).flushChanges?.()
      this.#view.render(this.#viewM, this.#projM, this.#eye)
    } catch (error) { console.error('usdcat: the yard could not draw', error) }
    requestAnimationFrame(next => void this.#frame(next))
  }

  /** Sets the joints and eye colors for this frame. The cat always sits:
   *  body pitched up, front legs straight, back legs folded. */
  #pose(t: number): void {
    const p = this.#power
    const set = (path: string, name: string, value: unknown) => this.#stage.getPrim(path)?.attr(name).set(value)
    const body = '/Yard/Cat/Body', head = `${body}/Head`
    const breathe = Math.sin(t * 1.6) * 0.006
    sdfChangeBlock(() => {
      set(body, 'xformOp:translate', [0, breathe - 0.1, 0])
      set(body, 'xformOp:rotateZ', 30)
      // Sitting calmly: paws together, back legs folded.
      set(`${body}/LegFrontLeft`, 'xformOp:rotateZ', -30)
      set(`${body}/LegFrontRight`, 'xformOp:rotateZ', -30)
      set(`${body}/LegBackLeft`, 'xformOp:rotateZ', 50)
      set(`${body}/LegBackRight`, 'xformOp:rotateZ', 50)
      // The gaze: the head turns after the file it moves (or looks about),
      // lifting a little while it concentrates; ears perk, head tilts.
      set(head, 'xformOp:rotateZ', -30 + 8 * p + 10 * this.#perk)
      set(head, 'xformOp:rotateY', this.#look)
      set(head, 'xformOp:rotateX', 18 * this.#tilt - this.#look * 0.08)
      set(`${head}/EarLeft`, 'xformOp:rotateX', 8 - 10 * Math.max(this.#perk, p) + 6 * this.#tilt)
      set(`${head}/EarRight`, 'xformOp:rotateX', -8 + 10 * Math.max(this.#perk, p) + 6 * this.#tilt)
      // A slow, lazy tail.
      const sway = Math.sin(t * 0.8)
      set(`${body}/Tail`, 'xformOp:rotateZ', -24)
      set(`${body}/Tail`, 'xformOp:rotateY', sway * 9)
      set(`${body}/Tail/Tip`, 'xformOp:rotateZ', -26 + Math.sin(t * 0.8 + 1.2) * 6)
      set(`${body}/Tail/Tip`, 'xformOp:rotateY', sway * 8)
      // Rainbow eyes while the power is on; back to the resting color after.
      if (p > 0.01) {
        const hue = rainbow((t * 2.2) % 1)
        const color = linear(EYE.map((c, i) => c + (hue[i]! - c) * Math.min(1, p * 1.5)) as unknown as [number, number, number])
        set(`${head}/EyeLeft`, 'primvars:displayColor', [color])
        set(`${head}/EyeRight`, 'primvars:displayColor', [color])
        this.#eyesResting = false
      } else if (!this.#eyesResting) {
        set(`${head}/EyeLeft`, 'primvars:displayColor', [linear(EYE)])
        set(`${head}/EyeRight`, 'primvars:displayColor', [linear(EYE)])
        this.#eyesResting = true
      }
    })
  }
}
