// usdzip's scene: a conveyor belt with the usdzip machine in the middle,
// drawn by Storm (storm-view.ts) from conveyor-model.ts. What is dropped
// rides on at the left, as a folder (its sheets peeking out) or a wrapped
// box (a .usdz); it goes into the machine through its strip curtains, the
// lights blink while it works, and the other form rolls out and on to the
// right end, where the page takes it off to the Output pile. The ride takes
// one base time (BASE_MS, or ?pace=<ms>).
import { Stage } from 'typescript-usd/usd'
import { Layer, sdfChangeBlock } from 'typescript-usd/sdf'
import { conveyorUsda, BELT_Y, BELT_HALF, MACHINE_HALF, RIBS, STRIPS, LIGHTS, TEETH, ZIP_X, ZIP_Y0, ZIP_Y1, SIGN } from './conveyor-model'
import { linear } from './pack-model'
import { StormView, lookAt, perspective, project, type M4 } from './storm-view'
import { reducedMotion } from './playful'

type V3 = [number, number, number]
/** How long a ride along the belt takes, in milliseconds (?pace= overrides it). */
export const BASE_MS = Number(new URLSearchParams(location.search).get('pace')) || 1600

const EYE: V3 = [0, 2.3, 6.6], LOOK: V3 = [0, 0.55, 0]
const HALF_WIDTH = 3.9
/** Where items get on and off. */
const START = -BELT_HALF + 0.45, END = BELT_HALF - 0.45
const ITEM_SIZE = 0.68
const RIB_GAP = (2 * BELT_HALF) / RIBS

const ease = (u: number) => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
const LIGHT_OFF: V3 = [0.3, 0.42, 0.32]

export type Item = 'folder' | 'package'

export class Conveyor {
  readonly #host: HTMLElement
  readonly #view: StormView
  readonly #stage: Stage
  readonly #screen: HTMLElement
  /** The parked result's tag: its name and size on its face, its buttons
   *  above it (.tag-label and .tag-actions). */
  #tag: HTMLElement | undefined
  /** The zipper's slider, 0 at the bottom to 1 at the top: zipping runs it
   *  up, unzipping down; teeth below it are meshed, above it apart. */
  #zip = 0.5
  /** Where the slider rests when nothing rides (the middle); a hovering
   *  file moves it to its start. */
  #zipRest = 0.5
  #restText: [string, boolean] = ['READY', false]
  #previewing: 'zip' | 'unzip' | null = null
  #viewM: M4 = []
  #projM: M4 = []
  #w = 1
  #h = 1
  /** What is on the belt, where, and how big. */
  #item: Item = 'folder'
  #x = START
  #scale = 0
  #ribs = 0
  #working = 0
  /** The last result, parked at the belt's end until the next one comes out
   *  of the machine and pushes it off (#off: 0 parked, 1 gone). */
  #parked: Item | undefined
  #off = 0
  #tween: { start: number, ms: number, step: (u: number) => void, done: () => void } | undefined

  static async create(host: HTMLElement, screen: HTMLElement): Promise<Conveyor> {
    const layer = Layer.createAnonymous('usdzip-conveyor.usda')
    if (!layer.importFromString(conveyorUsda())) throw new Error('The conveyor stage did not parse.')
    const stage = await Stage.open(layer)
    const canvas = document.createElement('canvas')
    canvas.className = 'pack-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const view = await StormView.create(canvas, stage)
    view.clearColor = [0.88, 0.87, 0.84]
    view.lights = [{ direction: [-0.4, 1, 0.8], color: [0.88, 0.86, 0.8] }, { camera: true, color: [0.36, 0.36, 0.4] }]
    host.prepend(canvas)
    return new Conveyor(host, view, stage, screen)
  }

  private constructor(host: HTMLElement, view: StormView, stage: Stage, screen: HTMLElement) {
    this.#host = host
    this.#view = view
    this.#stage = stage
    this.#screen = screen
    host.append(screen)
    this.#show('READY', false)
    const set = (path: string, name: string, value: unknown) => stage.getPrim(path)?.attr(name).set(value)
    set('/Room/Box/Ribbon', 'xformOp:scale', [1, 1, 1])
    set('/Room/ParkedBox/Ribbon', 'xformOp:scale', [1, 1, 1])
    new ResizeObserver(() => this.#resize()).observe(host)
    this.#resize()
    requestAnimationFrame(() => void this.#frame())
  }

  #resize(): void {
    const r = this.#host.getBoundingClientRect()
    this.#w = Math.max(1, r.width); this.#h = Math.max(1, r.height)
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.#view.canvas.width = Math.round(this.#w * dpr)
    this.#view.canvas.height = Math.round(this.#h * dpr)
    const aspect = this.#w / this.#h
    const distance = Math.hypot(EYE[2], EYE[1] - LOOK[1])
    const fovY = Math.min(70, 2 * Math.atan(HALF_WIDTH / distance / aspect) * 180 / Math.PI)
    this.#viewM = lookAt(EYE, LOOK)
    this.#projM = perspective(fovY, aspect, 0.1, 60)
    this.#host.style.setProperty('--belt-start-x', `${this.screenOf([START, BELT_Y, 0])[0]}px`)
    this.#host.style.setProperty('--belt-end-x', `${this.screenOf([END, BELT_Y, 0])[0]}px`)
    this.#host.style.setProperty('--belt-y', `${this.screenOf([0, BELT_Y, 0.42])[1]}px`)
  }

  screenOf(point: readonly [number, number, number]): [number, number] {
    return project(point, this.#viewM, this.#projM, this.#w, this.#h)
  }

  /** A file is hovering over the scene (or has left it): the screen asks
   *  ZIP? or UNZIP? and the slider goes to where that would start. */
  preview(kind: 'zip' | 'unzip' | null): void {
    if (kind === this.#previewing || this.#tween) return
    this.#previewing = kind
    if (kind) this.#show(kind === 'zip' ? 'ZIP' : 'UNZIP', false)
    else this.#show(...this.#restText)
  }

  /** What the machine's screen says. */
  #show(text: string, lit: boolean): void {
    this.#screen.textContent = text
    this.#screen.classList.toggle('lit', lit)
    this.#screen.classList.toggle('long', text.length > 5)
  }

  /** Where items get on and off, on screen. */
  startAt(): [number, number] { return this.screenOf([START, BELT_Y + 0.3, 0]) }
  endAt(): [number, number] { return this.screenOf([END, BELT_Y + 0.3, 0]) }

  #run(ms: number, step: (u: number) => void): Promise<void> {
    if (reducedMotion() || ms <= 0) { step(1); return Promise.resolve() }
    return new Promise(done => { this.#tween = { start: performance.now(), ms, step, done } })
  }

  /** Puts `item` on the belt's left end. */
  async load(item: Item): Promise<void> {
    this.#item = item
    this.#x = START
    await this.#run(BASE_MS * 0.12, u => { this.#scale = ease(u) * ITEM_SIZE })
  }

  /** The ride: to the machine (35%), inside it while it works (25%; the
   *  item becomes `becomes` halfway), out and on to the right end (40%). */
  async ride(becomes: Item): Promise<void> {
    const inX = -MACHINE_HALF - 0.1, outX = MACHINE_HALF + 0.1
    const zipping = becomes === 'package'
    this.#previewing = null
    const zipFrom = this.#zip
    let last = this.#x
    this.#show(zipping ? 'ZIP' : 'UNZIP', true)
    await this.#run(BASE_MS, u => {
      const a = clamp01(u / 0.35), b = clamp01((u - 0.35) / 0.25), c = clamp01((u - 0.6) / 0.4)
      if (u < 0.35) this.#x = START + (inX - START) * ease(a) * 0.5 + (inX - START) * a * 0.5
      else if (u < 0.6) this.#x = inX + (outX - inX) * b
      else this.#x = outX + (END - outX) * (c * 0.5 + ease(c) * 0.5)
      if (u >= 0.47 && this.#item !== becomes) this.#item = becomes
      // The last result is pushed off the end as this one comes out.
      if (this.#parked) this.#off = clamp01((u - 0.6) / 0.3)
      this.#working = u > 0.33 && u < 0.62 ? 1 : 0
      // The zipper runs while the item is inside: up to zip, down to unzip.
      // (On the way in, the slider goes back to where it starts: down to zip, up to unzip.)
      const z = ease(clamp01((u - 0.33) / 0.29))
      if (u < 0.33) this.#zip = zipFrom + ((zipping ? 0 : 1) - zipFrom) * ease(clamp01(u / 0.3))
      else this.#zip = zipping ? z : 1 - z
      this.#ribs += this.#x - last
      last = this.#x
    })
    this.#working = 0
    // READY again: the slider goes back to the middle.
    this.#zipRest = 0.5
    this.#restText = ['READY', false]
    this.#show(...this.#restText)
  }

  /** The item stays at the belt's end, parked, with its tag, until the
   *  next one pushes it off. */
  park(tag?: HTMLElement): void {
    this.#tag?.remove()
    this.#tag = tag
    if (tag) { tag.classList.add('item-tag'); this.#host.append(tag) }
    this.#parked = this.#item
    this.#off = 0
    this.#scale = 0
  }

  /** The item leaves the belt without a result (it could not be made). */
  async unload(): Promise<void> {
    await this.#run(BASE_MS * 0.1, u => { this.#scale = (1 - ease(u)) * ITEM_SIZE })
  }

  // ----------------------------------------------------------- per frame

  async #frame(): Promise<void> {
    const now = performance.now()
    const t = this.#tween
    if (t) {
      const u = Math.min(1, (now - t.start) / t.ms)
      t.step(u)
      if (u >= 1) { this.#tween = undefined; t.done() }
    }
    // Between rides the slider eases to its rest, or to a hovering file's start.
    if (!this.#tween) {
      const target = this.#previewing === 'zip' ? 0 : this.#previewing === 'unzip' ? 1 : this.#zipRest
      this.#zip += (target - this.#zip) * Math.min(1, 0.12 * (reducedMotion() ? 10 : 1))
    }
    this.#pose(now / 1000)
    try {
      await (this.#stage as unknown as { flushChanges?: () => Promise<void> }).flushChanges?.()
      this.#view.render(this.#viewM, this.#projM, EYE)
    } catch (error) { console.error('usdzip: the conveyor could not draw', error) }
    const [cx, cy] = this.screenOf(SIGN)
    this.#screen.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`
    this.#placeTag()
    requestAnimationFrame(() => void this.#frame())
  }

  /** The parked item's tag: the label on its face, the buttons above it;
   *  it fades as the item is pushed off. */
  #placeTag(): void {
    const tag = this.#tag
    if (!tag) return
    const box = this.#parked === 'package'
    const x = END + this.#off * 0.9, y = BELT_Y - this.#off * this.#off * 0.9
    const face = this.screenOf([x, y + (box ? 0.18 : 0.26) * ITEM_SIZE, box ? 0.24 : 0.12])
    const top = this.screenOf([x, y + (box ? 0.66 : 0.95) * ITEM_SIZE, 0.1])
    const label = tag.querySelector<HTMLElement>('.tag-label'), actions = tag.querySelector<HTMLElement>('.tag-actions')
    if (label) label.style.transform = `translate(${face[0]}px, ${face[1]}px) translate(-50%, -50%)`
    if (actions) actions.style.transform = `translate(${top[0]}px, ${top[1]}px) translate(-50%, -100%)`
    tag.style.opacity = String(1 - Math.min(1, this.#off * 3))
    if (this.#off >= 1) { tag.remove(); this.#tag = undefined }
  }

  #pose(t: number): void {
    const set = (path: string, name: string, value: unknown) => this.#stage.getPrim(path)?.attr(name).set(value)
    sdfChangeBlock(() => {
      // The ribs ride with the belt, wrapping round at the ends.
      for (let k = 0; k < RIBS; k++) {
        const x = ((k * RIB_GAP + this.#ribs) % (2 * BELT_HALF) + 2 * BELT_HALF) % (2 * BELT_HALF) - BELT_HALF
        set(`/Room/Rib${k}`, 'xformOp:translate', [x, 0, 0])
      }
      // The zipper: the slider, and each tooth meshed (below it) or apart.
      const sliderY = ZIP_Y0 + (ZIP_Y1 - ZIP_Y0) * this.#zip
      set('/Room/Machine/Zipper/Slider', 'xformOp:translate', [ZIP_X, sliderY - 0.015, 0.535])
      for (let k = 0; k < TEETH; k++) {
        const y = ZIP_Y0 + (k + 0.5) * (ZIP_Y1 - ZIP_Y0) / TEETH
        const open = clamp01((y - sliderY) / 0.12) * 0.032
        set(`/Room/Machine/Zipper/ToothL${k}`, 'xformOp:translate', [ZIP_X - open, y - 0.25 * (ZIP_Y1 - ZIP_Y0) / TEETH, 0.535])
        set(`/Room/Machine/Zipper/ToothR${k}`, 'xformOp:translate', [ZIP_X + open, y + 0.25 * (ZIP_Y1 - ZIP_Y0) / TEETH, 0.535])
      }
      const shake = this.#working ? Math.sin(t * 60) * 0.004 : 0
      set('/Room/Machine', 'xformOp:translate', [0, shake, 0])
      for (let k = 0; k < LIGHTS; k++) {
        const on = this.#working && Math.floor(t * 8 + k) % LIGHTS === 0
        set(`/Room/Machine/Light${k}`, 'primvars:displayColor', [linear(on ? [0.35, 1, 0.45] : LIGHT_OFF)])
      }
      // Curtain strips swing as the item passes through them.
      for (const [side, x] of [['In', -MACHINE_HALF], ['Out', MACHINE_HALF]] as const) {
        const d = this.#x - x
        const swing = this.#scale > 0 && Math.abs(d) < 0.45 ? (1 - Math.abs(d) / 0.45) * 55 : 0
        for (let k = 0; k < STRIPS; k++) set(`/Room/Machine/Strip${side}${k}`, 'xformOp:rotateZ', -swing * (1 - Math.abs(k - (STRIPS - 1) / 2) / STRIPS))
      }
      const folder = this.#item === 'folder' ? this.#scale : 0, pkg = this.#item === 'package' ? this.#scale : 0
      set('/Room/Folder', 'xformOp:translate', [this.#x, BELT_Y + 0.012, 0.05])
      set('/Room/Folder', 'xformOp:scale', [folder, folder, folder])
      set('/Room/Box', 'xformOp:translate', [this.#x, BELT_Y + 0.012, 0])
      set('/Room/Box', 'xformOp:rotateY', -8)
      set('/Room/Box', 'xformOp:scale', [pkg, pkg, pkg])
      // The parked result: off the end it tips over, drops and is gone.
      const o = this.#off, drop = o * o
      const parkedScale = this.#parked ? ITEM_SIZE * (o < 0.85 ? 1 : 1 - (o - 0.85) / 0.15) : 0
      const at = [END + o * 0.9, BELT_Y + 0.012 - drop * 0.9, 0.02]
      for (const [path, kind] of [['/Room/ParkedFolder', 'folder'], ['/Room/ParkedBox', 'package']] as const) {
        const s = this.#parked === kind ? parkedScale : 0
        set(path, 'xformOp:translate', at)
        set(path, 'xformOp:rotateZ', -o * 70)
        set(path, 'xformOp:rotateY', kind === 'package' ? -8 : 0)
        set(path, 'xformOp:scale', [s, s, s])
      }
    })
  }
}
