// The tailor mouse of usdstitch and usdstitchclips: a grey mouse with a
// needle and red thread who sews files together, patches into a quilt or
// frames into a film strip.
import { pause, reducedMotion } from './playful'

const SVG = `
<svg class="mouse-svg" viewBox="0 0 150 120" aria-hidden="true">
  <path class="m-thread" d="M118 40 C 140 70, 120 100, 146 112"/>
  <path class="m-tail" d="M30 92 C 6 92, 4 70, 16 62 C 24 56, 30 64, 22 70"/>
  <ellipse class="m-body" cx="56" cy="84" rx="30" ry="24"/>
  <ellipse class="m-belly" cx="62" cy="90" rx="17" ry="14"/>
  <ellipse class="m-foot" cx="44" cy="106" rx="9" ry="4"/>
  <ellipse class="m-foot" cx="70" cy="106" rx="9" ry="4"/>
  <g class="m-head">
    <circle class="m-ear" cx="66" cy="30" r="15"/>
    <circle class="m-ear-in" cx="66" cy="30" r="9"/>
    <circle class="m-ear" cx="98" cy="28" r="14"/>
    <circle class="m-ear-in" cx="98" cy="28" r="8"/>
    <ellipse class="m-face" cx="86" cy="52" rx="22" ry="19"/>
    <ellipse class="m-snout" cx="104" cy="58" rx="9" ry="7"/>
    <circle class="m-nose" cx="111" cy="56" r="3.4"/>
    <g class="m-eyes"><circle class="m-eye" cx="84" cy="48" r="3"/><circle class="m-eye" cx="97" cy="47" r="3"/></g>
    <path class="m-smile" d="M98 63 q4 4 8 0"/>
    <path class="m-whisker" d="M106 60 l16 -4 M106 62 l16 2 M100 62 l-10 6"/>
    <ellipse class="m-cheek" cx="80" cy="58" rx="4" ry="2.5"/>
  </g>
  <g class="m-arm">
    <path class="m-paw-arm" d="M76 80 Q96 72 108 56"/>
    <line class="m-needle" x1="104" y1="70" x2="122" y2="30"/>
    <circle class="m-needle-eye" cx="121" cy="33" r="1.6"/>
  </g>
  <path class="m-tape" d="M36 70 q20 10 40 0"/>
</svg>`

export class Mouse {
  readonly element: HTMLElement
  #x = 0

  constructor(host: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'mouse'
    this.element.innerHTML = SVG
    host.append(this.element)
  }

  place(x: number): void {
    this.#x = x
    this.element.style.transform = `translateX(${x}px)`
  }

  /** Scurries to `x`. */
  async scurry(x: number): Promise<void> {
    const from = this.#x
    this.#x = x
    this.element.classList.toggle('left', x < from)
    if (reducedMotion() || Math.abs(x - from) < 1) { this.element.style.transform = `translateX(${x}px)`; return }
    this.element.classList.add('scurrying')
    const a = this.element.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${x}px)` }],
      { duration: Math.max(300, Math.abs(x - from) * 2.5), easing: 'ease-in-out', fill: 'forwards' })
    await a.finished
    this.element.style.transform = `translateX(${x}px)`
    a.cancel()
    this.element.classList.remove('scurrying', 'left')
  }

  /** Sews (the needle goes up and down) for `ms`, or until `work` settles
   *  when given one; the sewing is on screen before the work starts. */
  async sew<T>(work?: () => Promise<T>, ms = 700): Promise<T | undefined> {
    this.element.classList.remove('proud', 'puzzled')
    this.element.classList.add('sewing')
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await pause(ms)
      return work ? await work() : undefined
    } finally {
      this.element.classList.remove('sewing')
    }
  }

  proud(): void { this.element.classList.add('proud') }
  puzzled(): void { this.element.classList.add('puzzled') }
}
