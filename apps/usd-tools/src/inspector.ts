// The usdchecker inspector: an SVG character in a deerstalker and trench
// coat who looks a file over with a magnifying glass, then stamps it. His
// face shows the verdict.
import { pause, reducedMotion } from './playful'

const SVG = `
<svg class="inspector-svg" viewBox="0 0 220 230" aria-hidden="true">
  <g class="insp-body">
    <path class="coat" d="M46 232 L60 150 Q110 126 160 150 L174 232 Z"/>
    <path class="lapel" d="M92 138 L110 182 L128 138 L120 136 L110 160 L100 136 Z"/>
    <path class="shirt" d="M100 137 L110 160 L120 137 Z"/>
    <path class="tie" d="M107 143 L113 143 L115 170 L110 178 L105 170 Z"/>
    <circle class="button" cx="110" cy="196" r="2.6"/>
    <circle class="button" cx="110" cy="214" r="2.6"/>
    <path class="pocket" d="M128 196 h20"/>
  </g>
  <g class="insp-stamp-arm">
    <path class="arm" d="M70 156 Q50 150 44 128"/>
    <g class="stamp">
      <rect class="stamp-handle" x="37" y="92" width="14" height="18" rx="6"/>
      <rect class="stamp-neck" x="41" y="108" width="6" height="8"/>
      <rect class="stamp-block" x="32" y="115" width="24" height="9" rx="2"/>
      <rect class="stamp-ink" x="33" y="123" width="22" height="3" rx="1"/>
    </g>
  </g>
  <g class="insp-head">
    <rect class="skin" x="102" y="110" width="16" height="22" rx="4"/>
    <circle class="skin" cx="80" cy="90" r="7"/>
    <circle class="skin" cx="140" cy="90" r="7"/>
    <ellipse class="skin" cx="110" cy="88" rx="30" ry="32"/>
    <path class="hat" d="M78 72 Q80 34 110 32 Q140 34 142 72 Z"/>
    <path class="hat-check" d="M88 40 L96 72 M104 33 L106 72 M118 33 L114 72 M132 40 L124 72 M80 56 Q110 50 140 56"/>
    <path class="hat-brim" d="M68 72 Q110 84 152 72 L154 79 Q110 93 66 79 Z"/>
    <path class="hat-bow" d="M104 31 q6 -8 6 0 q0 -8 6 0 q-6 4 -12 0 Z"/>
    <path class="brow brow-l" d="M90 78 Q98 74 105 78"/>
    <path class="brow brow-r" d="M115 78 Q122 74 130 78"/>
    <g class="eyes"><circle class="eye" cx="98" cy="90" r="2.7"/><circle class="eye" cx="122" cy="90" r="2.7"/></g>
    <circle class="lens-glass" cx="98" cy="90" r="9"/>
    <circle class="lens-glass" cx="122" cy="90" r="9"/>
    <path class="bridge" d="M107 89 Q110 86 113 89"/>
    <ellipse class="nose" cx="110" cy="99" rx="4" ry="5"/>
    <ellipse class="cheek" cx="91" cy="102" rx="4" ry="2.5"/>
    <ellipse class="cheek" cx="129" cy="102" rx="4" ry="2.5"/>
    <path class="mustache" d="M95 106 Q102 100 110 104 Q118 100 125 106 Q118 110 110 107 Q102 110 95 106 Z"/>
    <path class="mouth mouth-neutral" d="M104 114 h12"/>
    <path class="mouth mouth-happy" d="M101 112 Q110 121 119 112"/>
    <path class="mouth mouth-sad" d="M102 117 Q110 110 118 117"/>
  </g>
  <g class="insp-glass">
    <path class="arm" d="M152 154 Q172 144 176 122"/>
    <path class="glass-handle" d="M176 122 L186 104"/>
    <circle class="glass-lens" cx="194" cy="90" r="16"/>
    <path class="glass-glint" d="M186 84 q4 -6 10 -6"/>
  </g>
</svg>`

export type Verdict = 'pass' | 'warn' | 'fail'

export class Inspector {
  readonly element: HTMLElement
  readonly thought: HTMLElement
  readonly loupe: HTMLElement

  constructor(host: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'inspector'
    this.element.innerHTML = SVG
    this.thought = document.createElement('div')
    this.thought.className = 'thought'
    this.thought.innerHTML = '<span></span><span></span><span></span>'
    this.element.append(this.thought)
    host.append(this.element)
    // While he inspects, the glass leaves his hand and hovers over the file
    // on the bench: an overlay, so it is drawn above the bench.
    this.loupe = document.createElement('div')
    this.loupe.className = 'loupe'
    this.loupe.innerHTML = '<svg viewBox="0 0 70 70" aria-hidden="true"><path class="glass-handle" d="M44 44 L64 64"/><circle class="glass-lens" cx="28" cy="28" r="20"/><path class="glass-glint" d="M17 22 q5 -8 13 -8"/></svg>'
    host.append(this.loupe)
  }

  #mood(verdict: Verdict | undefined): void {
    this.element.classList.remove('pass', 'warn', 'fail')
    if (verdict) this.element.classList.add(verdict)
  }

  /** Leans in with the glass and scans; then runs `work` and resolves with
   *  its result. The scan starts first and is on screen before `work`
   *  begins: a tool run keeps the page's main thread busy. */
  async inspect<T>(work: () => Promise<T>): Promise<T> {
    this.#mood(undefined)
    this.element.classList.add('inspecting')
    this.loupe.classList.add('scanning')
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await pause(1100)
      return await work()
    } finally {
      this.element.classList.remove('inspecting')
      this.loupe.classList.remove('scanning')
    }
  }

  /** Brings the stamp down; resolves as it lands. */
  async stamp(verdict: Verdict): Promise<void> {
    this.#mood(verdict)
    if (reducedMotion()) return
    this.element.classList.remove('stamping')
    void this.element.offsetWidth
    this.element.classList.add('stamping')
    await pause(420)
  }

  /** Back to waiting. */
  idle(): void {
    this.element.classList.remove('stamping', 'inspecting')
  }
}
