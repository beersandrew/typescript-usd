// The things usdzip's conveyor carries, as .usda text (conveyor-model.ts
// puts them in its stage): a folder with a front flap hinged at the bottom,
// a cardboard box (the .usdz) with four flaps and a ribbon and bow, and
// sheets of paper for the files peeking out of the folder.

type V3 = readonly [number, number, number]
type Shape = { points: V3[], faces: number[][] }
const f = (n: number) => Number(n.toFixed(4)).toString()
const v = (p: V3) => `(${f(p[0])}, ${f(p[1])}, ${f(p[2])})`
/** displayColor is linear: the palette is picked in sRGB. */
export const linear = (c: V3): V3 => c.map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) as unknown as V3

export function mesh(name: string, s: Shape, color: V3, indent: string): string {
  const lo = [0, 1, 2].map(i => Math.min(...s.points.map(p => p[i]!))) as unknown as V3
  const hi = [0, 1, 2].map(i => Math.max(...s.points.map(p => p[i]!))) as unknown as V3
  return `${indent}def Mesh "${name}"
${indent}{
${indent}    float3[] extent = [${v(lo)}, ${v(hi)}]
${indent}    int[] faceVertexCounts = [${s.faces.map(face => face.length).join(', ')}]
${indent}    int[] faceVertexIndices = [${s.faces.flat().join(', ')}]
${indent}    point3f[] points = [${s.points.map(v).join(', ')}]
${indent}    color3f[] primvars:displayColor = [${v(linear(color))}]
${indent}    uniform token subdivisionScheme = "none"
${indent}}
`
}

/** A box between two corners. */
export function box(lo: V3, hi: V3): Shape {
  const [a, b, c] = lo, [d, e, g] = hi
  const points: V3[] = [[a, b, c], [a, e, c], [a, e, g], [a, b, g], [d, b, c], [d, e, c], [d, e, g], [d, b, g]]
  return { points, faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }
}

/** A box of half sizes `h` at `c`, turned `deg` about Z: a bow's loop. */
function turnedBox(c: V3, h: V3, deg: number): Shape {
  const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a)
  const shape = box([-h[0], -h[1], -h[2]], [h[0], h[1], h[2]])
  return { points: shape.points.map(([x, y, z]): V3 => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos, c[2] + z]), faces: shape.faces }
}

/** A flat triangle in the plane z (a mountain on a picture). */
function triangle(a: [number, number], b: [number, number], c: [number, number], z: number): Shape {
  return { points: [[a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z]], faces: [[0, 1, 2]] }
}

export function xform(name: string, ops: [string, string, string][], body: string, indent: string): string {
  return `${indent}def Xform "${name}"
${indent}{
${ops.map(([type, op, value]) => `${indent}    ${type} xformOp:${op} = ${value}\n`).join('')}${indent}    uniform token[] xformOpOrder = [${ops.map(([, op]) => `"xformOp:${op}"`).join(', ')}]
${body}${indent}}
`
}

const MANILA: V3 = [0.94, 0.8, 0.5]
const MANILA_DARK: V3 = [0.86, 0.7, 0.4]
const CARDBOARD: V3 = [0.8, 0.6, 0.38]
const CARDBOARD_DARK: V3 = [0.68, 0.49, 0.3]
const RIBBON: V3 = [0.86, 0.24, 0.3]
const PAPER: V3 = [0.98, 0.98, 0.96]
const INK: V3 = [0.62, 0.64, 0.7]

/** What a sheet shows: a layer (lines under a header in its kind's color),
 *  an image (a little picture) or any other file (lines). */
export type { Shape }
export type SheetKind = 'usda' | 'usdc' | 'usd' | 'usdz' | 'image' | 'other'
const HEADER: Record<SheetKind, V3> = {
  usda: [0.36, 0.78, 0.56], usdc: [0.5, 0.54, 0.95], usd: [0.36, 0.74, 0.8], usdz: [0.9, 0.6, 0.3], image: [1, 0.72, 0.3], other: [0.7, 0.7, 0.74],
}

/** Sheet sizes: half width, height. */
export const SHEET_W = 0.16, SHEET_H = 0.42

export function sheet(kind: SheetKind, indent: string): string {
  const w = SHEET_W, h = SHEET_H, z = 0.006
  let marks = mesh('Paper', box([-w, 0, -0.004], [w, h, 0.004]), PAPER, indent)
  if (kind === 'image') {
    marks += mesh('Sky', box([-w + 0.03, h * 0.32, z - 0.002], [w - 0.03, h - 0.04, z]), [0.55, 0.78, 0.98], indent)
    marks += mesh('Hill', triangle([-w + 0.03, h * 0.32], [w - 0.03, h * 0.32], [0.02, h * 0.72], z + 0.001), [0.36, 0.7, 0.42], indent)
    marks += mesh('Sun', box([w - 0.1, h - 0.12, z], [w - 0.05, h - 0.07, z + 0.002]), [1, 0.85, 0.3], indent)
    marks += mesh('Caption', box([-w + 0.03, 0.06, z - 0.002], [w * 0.4, 0.085, z]), INK, indent)
  } else {
    marks += mesh('Header', box([-w + 0.03, h - 0.09, z - 0.002], [w - 0.03, h - 0.04, z]), HEADER[kind], indent)
    for (let k = 0; k < 5; k++) {
      const y = h - 0.15 - k * 0.055, right = k === 4 ? w * 0.1 : w - 0.03 - (k % 2) * 0.05
      marks += mesh(`Line${k}`, box([-w + 0.03, y - 0.012, z - 0.002], [right, y + 0.012, z]), INK, indent)
    }
  }
  return marks
}

/** The folder: a back with a tab, files between, and a front flap hinged at
 *  the bottom (rotateX: 0 closed, about 70 open, falling toward the viewer). */
export function folder(indent: string, inner = '', name = 'Folder'): string {
  const i = indent + '    '
  const body = mesh('Back', box([-0.55, 0, -0.04], [0.55, 0.78, -0.02]), MANILA_DARK, i) +
    mesh('Tab', box([-0.55, 0.78, -0.04], [-0.18, 0.88, -0.02]), MANILA_DARK, i) +
    mesh('Spine', box([-0.55, -0.01, -0.04], [0.55, 0.02, 0.08]), MANILA_DARK, i) +
    xform('Front', [['double3', 'translate', '(0, 0, 0.08)'], ['float', 'rotateX', '0']],
      mesh('Flap', box([-0.55, 0, -0.012], [0.55, 0.7, 0.008]), MANILA, i + '    '), i) + inner
  return xform(name, [['double3', 'translate', '(0, 0, 0)'], ['float', 'rotateZ', '0'], ['float', 'rotateY', '0'], ['float3', 'scale', '(0, 0, 0)']], body, indent)
}

/** The box: an open-topped carton with four flaps hinged at the top edges
 *  (0 closed, flat over the top; about 120 open, leaning out), and a ribbon
 *  and bow that pop on (scale 0 to 1). */
export function carton(indent: string, name = 'Box'): string {
  const i = indent + '    ', j = i + '    '
  const W = 0.45, H = 0.55, D = 0.32, t = 0.015
  const walls = mesh('Bottom', box([-W, 0, -D], [W, t, D]), CARDBOARD_DARK, i) +
    mesh('WallFront', box([-W, 0, D - t], [W, H, D]), CARDBOARD, i) +
    mesh('WallBack', box([-W, 0, -D], [W, H, -D + t]), CARDBOARD_DARK, i) +
    mesh('WallLeft', box([-W, 0, -D], [-W + t, H, D]), CARDBOARD_DARK, i) +
    mesh('WallRight', box([W - t, 0, -D], [W, H, D]), CARDBOARD, i) +
    mesh('Label', box([-0.2, 0.16, D], [0.2, 0.36, D + 0.004]), [0.97, 0.94, 0.85], i)
  const flap = (name: string, at: V3, op: string, shape: Shape, color: V3) =>
    xform(name, [['double3', 'translate', v(at)], ['float', op, '0']], mesh('Card', shape, color, j), i)
  // The front and back flaps fold over the side ones, a card's thickness higher.
  const flaps = flap('FlapFront', [0, H + t, D], 'rotateX', box([-W, 0, -D], [W, t, 0]), CARDBOARD) +
    flap('FlapBack', [0, H + t, -D], 'rotateX', box([-W, 0, 0], [W, t, D]), CARDBOARD_DARK) +
    flap('FlapLeft', [-W, H, 0], 'rotateZ', box([0, 0, -D], [W, t, D]), CARDBOARD) +
    flap('FlapRight', [W, H, 0], 'rotateZ', box([-W, 0, -D], [0, t, D]), CARDBOARD_DARK)
  const ribbon = xform('Ribbon', [['float3', 'scale', '(0, 0, 0)']],
    mesh('BandX', box([-W - 0.01, -0.005, -0.06], [W + 0.01, H + 0.03, 0.06]), RIBBON, i + '    ') +
    mesh('BandZ', box([-0.06, -0.005, -D - 0.01], [0.06, H + 0.03, D + 0.01]), RIBBON, i + '    ') +
    // The bow: two loops leaning out from a knot, and two short tails.
    mesh('LoopL', turnedBox([-0.09, H + 0.1, 0], [0.085, 0.035, 0.05], 28), RIBBON, i + '    ') +
    mesh('LoopR', turnedBox([0.09, H + 0.1, 0], [0.085, 0.035, 0.05], -28), RIBBON, i + '    ') +
    mesh('Knot', box([-0.035, H + 0.035, -0.055], [0.035, H + 0.11, 0.055]), [0.72, 0.16, 0.22], i + '    ') +
    mesh('TailL', turnedBox([-0.06, H + 0.045, 0.07], [0.05, 0.012, 0.025], -35), RIBBON, i + '    ') +
    mesh('TailR', turnedBox([0.06, H + 0.045, 0.07], [0.05, 0.012, 0.025], 35), RIBBON, i + '    '), i)
  return xform(name, [['double3', 'translate', '(0, 0, 0)'], ['float', 'rotateZ', '0'], ['float', 'rotateY', '0'], ['float3', 'scale', '(0, 0, 0)']], walls + flaps + ribbon, indent)
}
