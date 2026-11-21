// The usdcat cat: an SVG ginger cat that walks across the yard, carries a
// file on its back, and sits. Positions are pixels along the yard's floor;
// the cat faces right unless it is walking left.

const SVG = `
<svg class="cat-svg" viewBox="0 0 140 100" aria-hidden="true">
  <g class="cat-tail-pivot">
    <path class="cat-tail" d="M30 58 C 12 56, 6 40, 12 24 C 14 19, 20 20, 19 26 C 15 38, 20 48, 33 50 Z"/>
  </g>
  <g class="cat-leg cat-leg-back-far"><rect x="34" y="62" width="9" height="24" rx="4.5"/></g>
  <g class="cat-leg cat-leg-front-far"><rect x="80" y="62" width="9" height="24" rx="4.5"/></g>
  <ellipse class="cat-body" cx="60" cy="58" rx="36" ry="19"/>
  <path class="cat-stripe" d="M46 41 q4 8 0 16"/>
  <path class="cat-stripe" d="M57 40 q4 9 0 17"/>
  <path class="cat-stripe" d="M68 41 q4 8 0 16"/>
  <ellipse class="cat-belly" cx="64" cy="66" rx="22" ry="8"/>
  <g class="cat-leg cat-leg-back"><rect x="40" y="64" width="10" height="24" rx="5"/><ellipse class="cat-paw" cx="45" cy="87" rx="6.5" ry="3.5"/></g>
  <g class="cat-leg cat-leg-front"><rect x="86" y="64" width="10" height="24" rx="5"/><ellipse class="cat-paw" cx="91" cy="87" rx="6.5" ry="3.5"/></g>
  <g class="cat-head">
    <path class="cat-ear" d="M92 24 L96 4 L108 18 Z"/>
    <path class="cat-ear" d="M114 16 L126 2 L128 24 Z"/>
    <path class="cat-ear-inner" d="M96 20 L98 10 L104 17 Z"/>
    <path class="cat-ear-inner" d="M117 16 L124 8 L125 21 Z"/>
    <circle class="cat-face" cx="110" cy="34" r="21"/>
    <path class="cat-stripe" d="M104 15 q2 5 0 8"/>
    <path class="cat-stripe" d="M111 14 q2 5 0 8"/>
    <ellipse class="cat-muzzle" cx="114" cy="42" rx="11" ry="7.5"/>
    <g class="cat-eyes">
      <ellipse class="cat-eye" cx="104" cy="31" rx="3.2" ry="4.2"/>
      <ellipse class="cat-eye" cx="121" cy="31" rx="3.2" ry="4.2"/>
      <circle class="cat-glint" cx="105" cy="29.5" r="1.1"/>
      <circle class="cat-glint" cx="122" cy="29.5" r="1.1"/>
    </g>
    <path class="cat-nose" d="M110.5 38 h6 l-3 3.5 Z"/>
    <path class="cat-mouth" d="M113.5 41.5 q-3 4 -6 1 M113.5 41.5 q3 4 6 1"/>
    <path class="cat-whisker" d="M100 41 l-14 -3 M100 44 l-14 2 M127 41 l12 -3 M127 44 l12 2"/>
    <ellipse class="cat-cheek" cx="99" cy="40" rx="3.5" ry="2.2"/>
    <ellipse class="cat-cheek" cx="127" cy="40" rx="3.5" ry="2.2"/>
  </g>
  <path class="cat-collar" d="M92 49 q12 9 26 2" />
  <circle class="cat-tag" cx="105" cy="56" r="4"/>
</svg>`

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

export class Cat {
  readonly element: HTMLElement
  /** Where a carried file rides: on the cat's back. */
  readonly back: HTMLElement
  #x = 0

  constructor(host: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'cat sitting'
    this.element.innerHTML = SVG
    this.back = document.createElement('div')
    this.back.className = 'cat-back'
    this.element.prepend(this.back)
    host.append(this.element)
  }

  get x(): number { return this.#x }
  get width(): number { return this.element.offsetWidth }

  /** Puts the cat at `x` at once. */
  place(x: number): void {
    this.#x = x
    this.element.style.transform = `translateX(${x}px)`
  }

  /** Walks to `x` at an easy pace and resolves on arrival. */
  async walkTo(x: number): Promise<void> {
    const from = this.#x
    this.#x = x
    const distance = Math.abs(x - from)
    this.element.classList.toggle('left', x < from)
    if (distance < 1 || reducedMotion()) {
      this.element.style.transform = `translateX(${x}px)`
      return
    }
    this.element.classList.remove('sitting')
    this.element.classList.add('walking')
    const duration = Math.max(450, distance / 0.22) // ~220 px a second
    const walk = this.element.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${x}px)` }],
      { duration, easing: 'cubic-bezier(.35,.05,.55,.95)', fill: 'forwards' })
    await walk.finished
    this.element.style.transform = `translateX(${x}px)`
    walk.cancel()
    this.element.classList.remove('walking')
  }

  /** Sits facing right. */
  sit(): void {
    this.element.classList.remove('walking', 'left')
    this.element.classList.add('sitting')
  }

  /** Ears up and eyes wide while a file is dragged over the page. */
  perk(on: boolean): void { this.element.classList.toggle('perked', on) }

  /** A puzzled head tilt, for a file that would not convert. */
  async puzzle(): Promise<void> {
    this.element.classList.add('puzzled')
    await new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : 900))
    this.element.classList.remove('puzzled')
  }

  /** Hops in place: the conversion's flourish. */
  async hop(): Promise<void> {
    if (reducedMotion()) return
    const hop = this.element.animate([
      { transform: `translateX(${this.#x}px) translateY(0)` },
      { transform: `translateX(${this.#x}px) translateY(-16px)`, offset: 0.45 },
      { transform: `translateX(${this.#x}px) translateY(0)` },
    ], { duration: 420, easing: 'ease-out' })
    await hop.finished
  }
}
