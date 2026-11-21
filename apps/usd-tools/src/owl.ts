// The usddiff owl: perched between the two files, one big eye on each. It
// looks from one to the other while usddiff compares them, then closes its
// eyes contentedly when they match or goes wide-eyed and ruffled when they
// differ.
import { pause, reducedMotion } from './playful'

const SVG = `
<svg class="owl-svg" viewBox="0 0 160 170" aria-hidden="true">
  <path class="branch" d="M4 150 Q80 138 156 152 L156 160 Q80 148 4 160 Z"/>
  <path class="leaf" d="M138 146 q10 -14 20 -8 q-8 12 -20 8 Z"/>
  <g class="owl-body">
    <path class="tuft tuft-l" d="M44 46 L34 14 L60 36 Z"/>
    <path class="tuft tuft-r" d="M116 46 L126 14 L100 36 Z"/>
    <ellipse class="feathers" cx="80" cy="92" rx="48" ry="56"/>
    <ellipse class="belly" cx="80" cy="110" rx="32" ry="34"/>
    <path class="scallop" d="M62 100 q6 6 12 0 M80 100 q6 6 12 0 M70 114 q6 6 12 0 M56 126 q6 6 12 0 M86 126 q6 6 12 0 M72 138 q6 6 12 0"/>
    <path class="wing wing-l" d="M34 84 Q22 116 42 140 Q48 112 44 88 Z"/>
    <path class="wing wing-r" d="M126 84 Q138 116 118 140 Q112 112 116 88 Z"/>
    <g class="eye eye-l">
      <circle class="eye-ring" cx="57" cy="66" r="21"/>
      <circle class="eye-white" cx="57" cy="66" r="16"/>
      <g class="pupil"><circle cx="57" cy="66" r="8"/><circle class="glint" cx="60" cy="62" r="2.4"/></g>
      <path class="eye-shut" d="M44 68 Q57 58 70 68"/>
    </g>
    <g class="eye eye-r">
      <circle class="eye-ring" cx="103" cy="66" r="21"/>
      <circle class="eye-white" cx="103" cy="66" r="16"/>
      <g class="pupil"><circle cx="103" cy="66" r="8"/><circle class="glint" cx="106" cy="62" r="2.4"/></g>
      <path class="eye-shut" d="M90 68 Q103 58 116 68"/>
    </g>
    <path class="beak" d="M74 80 L86 80 L80 94 Z"/>
    <path class="feet" d="M64 146 l-4 8 M68 146 v9 M72 146 l4 8 M88 146 l-4 8 M92 146 v9 M96 146 l4 8"/>
  </g>
</svg>`

export type Finding = 'same' | 'different' | 'error'

export class Owl {
  readonly element: HTMLElement
  readonly says: HTMLElement

  constructor(host: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'owl'
    this.element.innerHTML = SVG
    this.says = document.createElement('div')
    this.says.className = 'owl-says'
    this.says.hidden = true
    this.element.append(this.says)
    host.append(this.element)
  }

  /** Looks at one side (a file arrived there) for a moment. */
  glance(side: 'left' | 'right'): void {
    this.element.classList.remove('glance-left', 'glance-right')
    void this.element.offsetWidth
    this.element.classList.add(`glance-${side}`)
  }

  /** Looks from one file to the other; then runs `work`. The looking starts
   *  first and is on screen before `work` begins (a tool run keeps the
   *  page's main thread busy). */
  async compare<T>(work: () => Promise<T>): Promise<T> {
    this.element.classList.remove('same', 'different', 'error', 'glance-left', 'glance-right')
    this.says.hidden = true
    this.element.classList.add('comparing')
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await pause(reducedMotion() ? 0 : 1000)
      return await work()
    } finally {
      this.element.classList.remove('comparing')
    }
  }

  /** Shows what it found, with a word in a speech bubble. */
  verdict(finding: Finding, words: string): void {
    this.element.classList.add(finding)
    this.says.textContent = words
    this.says.hidden = false
  }
}
