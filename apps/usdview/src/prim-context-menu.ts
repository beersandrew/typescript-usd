// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/primContextMenu.py,
//  pxr/usdImaging/usdviewq/primContextMenuItems.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { PrimContextMenuItem } from './edit-menu'

// Presentation for usdviewq/primContextMenu.py: a popup built from
// primContextMenuItems.py entries at the pointer; separators and disabled items as native.
export const primContextMenuHtml = '<div class="context-menu menu-popup" role="menu" aria-label="Prim actions" hidden></div>'
export class PrimContextMenu {
  #items: PrimContextMenuItem[] = []
  #returnFocus: HTMLElement | null = null
  constructor(private root: ShadowRoot, private run: (item: PrimContextMenuItem) => void) {}
  get #menu() { return this.root.querySelector<HTMLElement>('.context-menu')! }
  get isOpen() { return !this.#menu.hidden }
  bind(signal: AbortSignal) {
    const options = { signal }
    this.#menu.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-context-index]')
      if (!button || button.disabled) return
      const item = this.#items[Number(button.dataset.contextIndex)]!
      this.close(); this.run(item)
    }, options)
    this.#menu.addEventListener('keydown', event => {
      const buttons = [...this.#menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = buttons.indexOf(this.root.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true) }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation()
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
      } else if (event.key === 'Tab') { event.preventDefault(); this.close(true) }
    }, options)
    this.root.addEventListener('pointerdown', event => { if (this.isOpen && !(event.target as Element).closest('.context-menu')) this.close() }, { ...options, capture: true })
  }
  open(items: (PrimContextMenuItem | '---')[], x: number, y: number, returnFocus: HTMLElement | null, label = 'Prim actions') {
    this.#items = []; this.#returnFocus = returnFocus
    const menu = this.#menu
    menu.setAttribute('aria-label',label)
    menu.replaceChildren(...items.map(item => {
      if (item === '---') return document.createElement('hr')
      const button = document.createElement('button')
      button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = item.text
      button.dataset.contextIndex = String(this.#items.push(item) - 1)
      button.disabled = !item.enabled
      if (item.unsupported) button.title = item.unsupported
      return button
    }))
    menu.hidden = false
    menu.style.left = `${x}px`; menu.style.top = `${y}px`
    // Keep the popup inside the viewport, as QMenu.exec does near screen edges.
    const rect = menu.getBoundingClientRect()
    if (rect.right > innerWidth) menu.style.left = `${Math.max(0, x - rect.width)}px`
    if (rect.bottom > innerHeight) menu.style.top = `${Math.max(0, y - rect.height)}px`
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }
  close(restoreFocus = false) {
    if (!this.isOpen) return
    this.#menu.hidden = true; this.#menu.replaceChildren(); this.#items = []
    if (restoreFocus) this.#returnFocus?.focus()
    this.#returnFocus = null
  }
}
