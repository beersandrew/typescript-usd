// usdzip's scene as USD: a conveyor belt across the room with the usdzip
// machine in the middle, and the two things that ride it, a folder (its
// sheets peeking out) and a wrapped box (the .usdz), from pack-model.ts.
// conveyor.ts moves the belt's ribs, the item and the machine's curtain
// strips and lights each frame.
import { box, carton, folder, mesh, sheet, xform, type Shape } from './pack-model'

type V3 = readonly [number, number, number]
const f = (n: number) => Number(n.toFixed(4)).toString()

/** The belt's top surface height, its half length, and where the machine's
 *  openings are. */
export const BELT_Y = 0.36
export const BELT_HALF = 3.5
export const MACHINE_HALF = 0.62
/** Ribs across the belt, moved along it to show it running. */
export const RIBS = 16
/** Curtain strips at each opening of the machine. */
export const STRIPS = 6
/** Lights on the machine. */
export const LIGHTS = 3
/** The zipper on the machine's front: teeth per side, and its track (x, the
 *  bottom and top heights, z of the front face). */
export const TEETH = 14
export const ZIP_X = 0, ZIP_Y0 = 0.5, ZIP_Y1 = 1.16, ZIP_Z = 0.535
/** The status sign on the machine's housing (its middle, for the page's text). */
export const SIGN: readonly [number, number, number] = [0, 1.25 + 0.21, 0.6]

const RUBBER: V3 = [0.2, 0.2, 0.22]
const RIB: V3 = [0.32, 0.32, 0.35]
const STEEL: V3 = [0.62, 0.64, 0.68]
const STEEL_DARK: V3 = [0.42, 0.44, 0.48]
const MACHINE: V3 = [0.96, 0.72, 0.22]
const MACHINE_DARK: V3 = [0.82, 0.56, 0.14]
const STRIP: V3 = [0.7, 0.82, 0.9]

/** A prism along Z (a roller). */
function roller(r: number, z0: number, z1: number, sides = 12): Shape {
  const points: [number, number, number][] = []
  for (const z of [z0, z1]) for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2; points.push([Math.cos(a) * r, Math.sin(a) * r, z]) }
  const faces = [Array.from({ length: sides }, (_, k) => sides - 1 - k), Array.from({ length: sides }, (_, k) => sides + k)]
  for (let k = 0; k < sides; k++) { const n = (k + 1) % sides; faces.push([k, n, sides + n, sides + k]) }
  return { points, faces }
}

function belt(i: string): string {
  const L = BELT_HALF, Z = 0.42, y = BELT_Y
  let out = mesh('Belt', box([-L, y - 0.06, -Z], [L, y, Z]), RUBBER, i) +
    mesh('RailFront', box([-L - 0.05, y - 0.12, Z], [L + 0.05, y + 0.04, Z + 0.05]), STEEL, i) +
    mesh('RailBack', box([-L - 0.05, y - 0.12, -Z - 0.05], [L + 0.05, y + 0.04, -Z]), STEEL_DARK, i)
  for (const [n, x] of [[0, -L + 0.2], [1, -L / 3], [2, L / 3], [3, L - 0.2]] as const) {
    out += mesh(`LegFront${n}`, box([x - 0.05, 0, Z - 0.02], [x + 0.05, y - 0.12, Z + 0.06]), STEEL_DARK, i)
    out += mesh(`LegBack${n}`, box([x - 0.05, 0, -Z - 0.06], [x + 0.05, y - 0.12, -Z + 0.02]), STEEL_DARK, i)
  }
  for (const [n, x] of [[0, -L], [1, L]] as const) {
    out += xform(`Roller${n}`, [['double3', 'translate', `(${f(x)}, ${f(y - 0.06)}, 0)`]], mesh('Drum', roller(0.07, -Z, Z), STEEL, i + '    '), i)
  }
  for (let k = 0; k < RIBS; k++) {
    out += xform(`Rib${k}`, [['double3', 'translate', '(0, 0, 0)']], mesh('Bar', box([-0.025, y, -Z + 0.02], [0.025, y + 0.012, Z - 0.02]), RIB, i + '    '), i)
  }
  return out
}

function machine(i: string): string {
  const M = MACHINE_HALF, Z = 0.55, y = BELT_Y, top = 1.25
  const j = i + '    '
  let out = mesh('PostFL', box([-M - 0.08, 0, Z - 0.08], [-M, top, Z]), MACHINE_DARK, i) +
    mesh('PostFR', box([M, 0, Z - 0.08], [M + 0.08, top, Z]), MACHINE_DARK, i) +
    mesh('PostBL', box([-M - 0.08, 0, -Z], [-M, top, -Z + 0.08]), MACHINE_DARK, i) +
    mesh('PostBR', box([M, 0, -Z], [M + 0.08, top, -Z + 0.08]), MACHINE_DARK, i) +
    mesh('Housing', box([-M - 0.1, top, -Z - 0.02], [M + 0.1, top + 0.42, Z + 0.02]), MACHINE, i) +
    // The front and back walls hide what happens inside.
    mesh('WallFront', box([-M, y + 0.02, Z - 0.06], [M, top, Z - 0.02]), MACHINE, i) +
    mesh('WallBack', box([-M, y + 0.02, -Z + 0.02], [M, top, -Z + 0.06]), MACHINE_DARK, i) +
    mesh('Sign', box([-0.42, top + 0.08, Z + 0.02], [0.42, top + 0.34, Z + 0.05]), [0.06, 0.12, 0.08], i) +
    zipper(i)
  for (let k = 0; k < LIGHTS; k++) {
    const x = -0.3 + k * 0.3
    out += mesh(`Light${k}`, box([x - 0.06, top + 0.42, -0.06], [x + 0.06, top + 0.52, 0.06]), [0.3, 0.9, 0.4], i)
  }
  // Strip curtains at both openings, each strip hinged at its top.
  for (const [side, x] of [['In', -M], ['Out', M]] as const) {
    for (let k = 0; k < STRIPS; k++) {
      const z = -Z + 0.1 + (2 * Z - 0.2) * (k + 0.5) / STRIPS
      const w = (2 * Z - 0.2) / STRIPS / 2 - 0.008
      out += xform(`Strip${side}${k}`, [['double3', 'translate', `(${f(x)}, ${f(top)}, ${f(z)})`], ['float', 'rotateZ', '0']],
        mesh('Strip', box([-0.006, y + 0.04 - top, -w], [0.006, 0, w]), STRIP, j), i)
    }
  }
  return xform('Machine', [['double3', 'translate', '(0, 0, 0)']], out, '    ')
}

/** The zipper: two tapes, a tooth on each per step (conveyor.ts slides
 *  them together or apart), and the slider with its pull. */
function zipper(i: string): string {
  const j = i + '    '
  const step = (ZIP_Y1 - ZIP_Y0) / TEETH
  let out = mesh('TapeL', box([ZIP_X - 0.075, ZIP_Y0 - 0.03, ZIP_Z - 0.004], [ZIP_X - 0.02, ZIP_Y1 + 0.03, ZIP_Z]), [0.22, 0.22, 0.28], j) +
    mesh('TapeR', box([ZIP_X + 0.02, ZIP_Y0 - 0.03, ZIP_Z - 0.004], [ZIP_X + 0.075, ZIP_Y1 + 0.03, ZIP_Z]), [0.22, 0.22, 0.28], j) +
    mesh('Stop', box([ZIP_X - 0.03, ZIP_Y0 - 0.05, ZIP_Z], [ZIP_X + 0.03, ZIP_Y0 - 0.02, ZIP_Z + 0.012]), [0.78, 0.62, 0.3], j)
  for (let k = 0; k < TEETH; k++) {
    const yL = ZIP_Y0 + (k + 0.25) * step, yR = ZIP_Y0 + (k + 0.75) * step
    out += xform(`ToothL${k}`, [['double3', 'translate', `(${f(ZIP_X)}, ${f(yL)}, ${f(ZIP_Z)})`]], mesh('Tooth', box([-0.03, -0.011, 0], [0.004, 0.011, 0.012]), [0.88, 0.72, 0.36], j + '    '), j)
    out += xform(`ToothR${k}`, [['double3', 'translate', `(${f(ZIP_X)}, ${f(yR)}, ${f(ZIP_Z)})`]], mesh('Tooth', box([-0.004, -0.011, 0], [0.03, 0.011, 0.012]), [0.88, 0.72, 0.36], j + '    '), j)
  }
  out += xform('Slider', [['double3', 'translate', `(${f(ZIP_X)}, ${f(ZIP_Y0)}, ${f(ZIP_Z)})`]],
    mesh('Body', box([-0.045, -0.02, 0.008], [0.045, 0.05, 0.03]), [0.72, 0.74, 0.8], j + '    ') +
    mesh('Pull', box([-0.018, -0.1, 0.03], [0.018, -0.015, 0.04]), [0.62, 0.64, 0.7], j + '    ') +
    mesh('PullHole', box([-0.008, -0.085, 0.04], [0.008, -0.06, 0.042]), [0.25, 0.25, 0.3], j + '    '), j)
  return xform('Zipper', [], out, i)
}

/** Sheets peeking out of the folder that rides the belt. */
function peeking(i: string): string {
  return xform('Papers', [['double3', 'translate', '(0, 0.1, 0.02)']],
    xform('A', [['double3', 'translate', '(-0.15, 0, 0)'], ['float', 'rotateZ', '5']], sheet('usda', i + '        '), i + '    ') +
    xform('B', [['double3', 'translate', '(0.12, 0, 0.01)'], ['float', 'rotateZ', '-4']], sheet('image', i + '        '), i + '    '), i)
}

export function conveyorUsda(): string {
  const i = '    '
  return `#usda 1.0
(
    defaultPrim = "Room"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Room"
{
${mesh('Floor', box([-14, -0.06, -6], [14, 0, 5]), [0.74, 0.72, 0.68], i)}${mesh('Wall', box([-14, 0, -6.1], [14, 9, -6]), [0.88, 0.87, 0.84], i)}${belt(i)}${machine(i)}${folder(i, peeking(i + '    '))}${carton(i)}${folder(i, peeking(i + '    '), 'ParkedFolder')}${carton(i, 'ParkedBox')}}
`
}
