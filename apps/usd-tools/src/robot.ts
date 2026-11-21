// The usdfixbrokenpixarschemas robot: a boxy fix-it robot with a wrench and
// an antenna light. It tinkers (wrench turning, sparks) while the tool runs,
// gives a thumbs-up with a green light when it fixed something, shrugs when
// there was nothing to fix, and turns red when it could not.
import { pause, reducedMotion } from './playful'

const SVG = `
<svg class="robot-svg" viewBox="0 0 170 170" aria-hidden="true">
  <ellipse class="r-shadow" cx="80" cy="162" rx="46" ry="6"/>
  <line class="r-antenna" x1="80" y1="30" x2="80" y2="14"/>
  <circle class="r-light" cx="80" cy="11" r="6"/>
  <rect class="r-head" x="50" y="30" width="60" height="44" rx="10"/>
  <rect class="r-visor" x="58" y="40" width="44" height="22" rx="8"/>
  <g class="r-eyes"><circle class="r-eye" cx="70" cy="51" r="4.5"/><circle class="r-eye" cx="90" cy="51" r="4.5"/></g>
  <path class="r-mouth r-mouth-ok" d="M70 66 q10 6 20 0"/>
  <path class="r-mouth r-mouth-meh" d="M71 67 h18"/>
  <path class="r-mouth r-mouth-bad" d="M70 69 q10 -6 20 0"/>
  <rect class="r-neck" x="72" y="74" width="16" height="8"/>
  <rect class="r-body" x="44" y="82" width="72" height="58" rx="10"/>
  <rect class="r-panel" x="56" y="92" width="48" height="24" rx="4"/>
  <circle class="r-dial" cx="66" cy="104" r="5"/>
  <rect class="r-bar r-bar1" x="76" y="98" width="22" height="4" rx="2"/>
  <rect class="r-bar r-bar2" x="76" y="106" width="16" height="4" rx="2"/>
  <rect class="r-leg" x="56" y="140" width="14" height="18" rx="4"/>
  <rect class="r-leg" x="90" y="140" width="14" height="18" rx="4"/>
  <g class="r-arm-l"><path class="r-arm" d="M46 96 Q30 104 30 120"/><circle class="r-hand" cx="30" cy="122" r="7"/><path class="r-thumb" d="M27 116 v-9"/></g>
  <g class="r-arm-r">
    <path class="r-arm" d="M114 96 Q132 100 136 114"/>
    <g class="r-wrench"><path class="r-wrench-shape" d="M136 114 L150 86 M144 82 a8 8 0 1 0 12 6 l-6 -2 l-2 -6 Z"/></g>
    <circle class="r-hand" cx="136" cy="116" r="7"/>
  </g>
  <g class="r-sparks"><path d="M150 76 l4 -8 M156 82 l8 -3 M146 72 l-1 -9"/></g>
</svg>`

export type Outcome = 'fixed' | 'nothing' | 'failed'

export class Robot {
  readonly element: HTMLElement
  readonly says: HTMLElement

  constructor(host: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'robot'
    this.element.innerHTML = SVG
    this.says = document.createElement('div')
    this.says.className = 'robot-says'
    this.says.hidden = true
    this.element.append(this.says)
    host.append(this.element)
  }

  /** Tinkers, then runs `work`; the tinkering is on screen before the work
   *  starts (a tool run keeps the page's main thread busy). */
  async tinker<T>(work: () => Promise<T>): Promise<T> {
    this.element.classList.remove('fixed', 'nothing', 'failed')
    this.says.hidden = true
    this.element.classList.add('tinkering')
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await pause(reducedMotion() ? 0 : 1100)
      return await work()
    } finally {
      this.element.classList.remove('tinkering')
    }
  }

  outcome(outcome: Outcome, words: string): void {
    this.element.classList.add(outcome)
    this.says.textContent = words
    this.says.hidden = false
  }
}
