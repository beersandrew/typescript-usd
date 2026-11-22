// Pieces the playful tool pages share: the Settings button with its panel,
// saving a result, and remembered settings.
import { el } from './dom'


/** A Settings button and the panel it opens; a click elsewhere closes it. */
export function settingsGear(label: string): { gear: HTMLButtonElement, panel: HTMLDivElement } {
  const gear = el('button', { className: 'gear', type: 'button', ariaExpanded: 'false' }, 'Settings')
  const panel = el('div', { className: 'settings', hidden: true, role: 'dialog', ariaLabel: label })
  gear.addEventListener('click', () => { panel.hidden = !panel.hidden; gear.ariaExpanded = String(!panel.hidden) })
  document.addEventListener('click', e => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !gear.contains(e.target as Node)) {
      panel.hidden = true
      gear.ariaExpanded = 'false'
    }
  })
  return { gear, panel }
}

/** Settings kept in this browser (a per-viewer convenience; any failure
 *  falls back to the defaults). */
export function rememberedSettings<T extends object>(key: string, defaults: T): { settings: T, save(): void } {
  let settings = { ...defaults }
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T> } } catch { /* unavailable */ }
  return { settings, save: () => { try { localStorage.setItem(key, JSON.stringify(settings)) } catch { /* private mode */ } } }
}

/** Hands a result to the viewer: the share sheet on touch devices (Files on
 *  the phone), a download elsewhere. */
export async function saveFile(name: string, data: Uint8Array | string, type = 'application/octet-stream'): Promise<void> {
  const file = new File([data as Uint8Array<ArrayBuffer> | string], name, { type })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
}

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Phones and tablets: the drag-and-drop pages are for desktops, and say so
 *  there instead of showing their scene (playful.css .desktop-only). */
export const onDesktop = (): boolean => !matchMedia('(max-width: 700px), (pointer: coarse)').matches

/** The note a phone or tablet sees in place of the scene. */
export function desktopOnlyNote(place: string): HTMLElement {
  return el('div', { className: 'desktop-only' },
    el('strong', {}, 'This one’s for desktop'),
    el('span', {}, `Open it on a computer (Chrome, Safari, Edge) to drop files on the ${place}.`))
}
export const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms))
