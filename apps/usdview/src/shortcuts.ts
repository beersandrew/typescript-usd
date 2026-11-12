// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Qt key sequences as written in OpenUSD v26.11.1 usdviewq/mainWindowUI.ui. On macOS Qt
// maps "Ctrl" to the Command key and "Meta" to Control, and menus show ⌃⌥⇧⌘ glyphs.
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
interface Sequence { key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean }
function parse(sequence: string): Sequence {
  const parts = sequence === '+' ? ['+'] : sequence.split('+')
  const key = parts.pop()!
  return { key, ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), meta: parts.includes('Meta') }
}
const codes: Record<string, string> = { Space: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', '|':'Backslash', '\\': 'Backslash', '=': 'Equal', '-': 'Minus' }
function code(key: string) {
  if (/^[A-Z]$/.test(key)) return `Key${key}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return codes[key] ?? key
}
/** Physical-key match (Option changes event.key on macOS) with exact modifiers. */
export function matchesShortcut(event: KeyboardEvent, sequence: string, mac = isMac()): boolean {
  const s = parse(sequence)
  if(sequence==='|')s.shift=true
  const command = mac ? event.metaKey : event.ctrlKey, control = mac ? event.ctrlKey : event.metaKey
  return event.code === code(s.key) && command === s.ctrl && control === s.meta && event.shiftKey === s.shift && event.altKey === s.alt
}
export function shortcutLabel(sequence: string, mac = isMac()): string {
  const s = parse(sequence)
  if (!mac) return [s.meta && 'Meta', s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', s.key].filter(Boolean).join('+')
  return `${s.meta ? '⌃' : ''}${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${s.ctrl ? '⌘' : ''}${s.key}`
}
