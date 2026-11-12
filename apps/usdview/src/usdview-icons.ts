// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/common.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Property view and prim tree icons from OpenUSD v26.11.1
// pxr/usdImaging/usdviewq/icons/ (usd-attr-plain-icon.svg, usd-attr-with-conn-icon.svg,
// usd-rel-plain-icon.svg, usd-rel-with-target-icon.svg, usd-cmp-icon.svg,
// usd-target-icon.svg, usd-conn-icon.svg, branch-{open,closed}[-selected].svg).
// Copyright 2016 Pixar, Tomorrow Open Source Technology License 1.0 (see NOTICE).
// Geometry and colours are copied unchanged; Inkscape editor metadata is dropped.
// common.py:110-129 PropertyViewIcons maps property roles to these files.
import type { PropertyRole } from './contracts'

const ring = '<circle cx="40" cy="40" r="34.827225" fill="none" stroke="#e6e6e6" stroke-width="7.10227" stroke-linecap="round" stroke-linejoin="round"/>'
const letterA = '<path fill="#e6e6e6" d="M 39.999999,22.189361 32.54677,42.400122 H 47.480428 Z M 36.89902,16.77625 h 6.229158 l 15.47769,40.611934 H 52.89354 L 49.194127,46.969985 H 30.887475 l -3.699413,10.418199 h -5.793933 z"/>'
const letterR = '<path fill="#e6e6e6" d="m 45.791737,40.681953 q 1.873593,0.63414 3.631889,2.709505 1.787119,2.075364 3.574239,5.707253 L 58.90689,60.859112 H 52.651971 L 47.146489,49.819324 q -2.133014,-4.323677 -4.15073,-5.736078 -1.988891,-1.412401 -5.447832,-1.412401 H 31.206534 V 60.859112 H 25.383983 V 17.824115 H 38.52796 q 7.379075,0 11.010964,3.084223 3.631888,3.084223 3.631888,9.310318 0,4.064256 -1.902418,6.744935 -1.873593,2.68068 -5.476657,3.718362 z M 31.206534,22.608984 v 15.276992 h 7.321426 q 4.208379,0 6.341393,-1.931243 2.161838,-1.960066 2.161838,-5.736077 0,-3.776011 -2.161838,-5.678429 -2.133014,-1.931243 -6.341393,-1.931243 z"/>'
const letterC = '<path fill="#e6e6e6" d="m 53.77832,22.391479 v 5.793933 q -2.77456,-2.584149 -5.929941,-3.862622 -3.12818,-1.278474 -6.664383,-1.278474 -6.9636,0 -10.663013,4.270646 -3.699412,4.243443 -3.699412,12.295106 0,8.024461 3.699412,12.295107 3.699413,4.243444 10.663013,4.243444 3.536203,0 6.664383,-1.278474 3.155381,-1.278473 5.929941,-3.862622 v 5.73953 q -2.883366,1.958512 -6.120352,2.937769 -3.209784,0.979256 -6.800391,0.979256 -9.22133,0 -14.525634,-5.630724 -5.304305,-5.657925 -5.304305,-15.423286 0,-9.792563 5.304305,-15.423286 5.304304,-5.657925 14.525634,-5.657925 3.64501,0 6.854794,0.979256 3.236986,0.952055 6.065949,2.883366 z"/>'
const badge = (color: string, cx: number, radii: readonly number[]) =>
  radii.map((r, i) => `<circle cx="${cx}" cy="${cx}" r="${r}" fill="${i % 2 ? '#ffffff' : color}"/>`).join('')
const smallBadge = [17.578915, 14.012943, 10.838849, 7.2400494, 3.5702181] as const
const largeBadge = [34.695961, 27.657711, 21.39292, 14.289874, 7.0466323] as const
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${body}</svg>`)}`

export const propertyIcons = {
  attribute: svg(ring + letterA),
  attributeWithConnections: svg(letterA + ring + badge('#1c8df6', 62.421085, smallBadge)),
  relationship: svg(letterR + ring),
  relationshipWithTargets: svg(letterR + ring + badge('#de3939', 62.421085, smallBadge)),
  computed: svg(ring + letterC),
  target: svg(badge('#de3939', 40, largeBadge)),
  connection: svg(badge('#1c8df6', 40, largeBadge)),
} as const

/** appController.py:4024-4048: computed materials use the COMPOSED icon. */
export function propertyIcon(role: PropertyRole): string {
  return role === 'computedMaterial' ? propertyIcons.computed : propertyIcons[role]
}

const branch = (d: string, fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.333332 17.333332"><path fill="${fill}" d="${d}"/></svg>`)}`
const closed = 'M 5.623808,13.61131 11.709525,8.666666 5.623808,3.722022 Z', open = 'M 3.722022,5.623808 8.666666,11.709525 13.61131,5.623808 Z'
export const branchIcons = {
  closed: branch(closed, '#6a6a6a'), open: branch(open, '#6a6a6a'),
  closedSelected: branch(closed, '#1c1c1c'), openSelected: branch(open, '#1c1c1c'),
} as const
