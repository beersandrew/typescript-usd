// The usdcat cat as USD: a low-poly ginger cat in a small yard, written as
// .usda text and opened as a stage. Every part is a faceted Mesh with a
// displayColor; the joints the page animates are Xforms with their own ops
// (cat3d.ts sets them each frame). The cat's local frame: +X forward, +Y up,
// +Z its left side. Units are metres-ish: the cat is about 0.9 long.

type V3 = readonly [number, number, number]
const f = (n: number) => Number(n.toFixed(4)).toString()
const v = (p: V3) => `(${f(p[0])}, ${f(p[1])}, ${f(p[2])})`
/** displayColor is linear: the palette below is picked in sRGB. */
export const linear = (c: V3): V3 => c.map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) as unknown as V3

/** A Mesh from points and faces, with its extent and one color. */
function mesh(name: string, points: V3[], faces: number[][], color: V3, indent: string): string {
  const lo = [0, 1, 2].map(i => Math.min(...points.map(p => p[i]!))) as unknown as V3
  const hi = [0, 1, 2].map(i => Math.max(...points.map(p => p[i]!))) as unknown as V3
  return `${indent}def Mesh "${name}"
${indent}{
${indent}    float3[] extent = [${v(lo)}, ${v(hi)}]
${indent}    int[] faceVertexCounts = [${faces.map(face => face.length).join(', ')}]
${indent}    int[] faceVertexIndices = [${faces.flat().join(', ')}]
${indent}    point3f[] points = [${points.map(v).join(', ')}]
${indent}    color3f[] primvars:displayColor = [${v(linear(color))}]
${indent}    uniform token subdivisionScheme = "none"
${indent}}
`
}

/** A box between two corners, optionally tapered: the +X end's half sizes
 *  scaled by `taper` (y, z), and lifted by `lift`. Outward-facing quads. */
function block(lo: V3, hi: V3, taper: readonly [number, number] = [1, 1], lift = 0): { points: V3[], faces: number[][] } {
  const cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2
  const hy = (hi[1] - lo[1]) / 2, hz = (hi[2] - lo[2]) / 2
  const end = (x: number, sy: number, sz: number, dy: number): V3[] => [
    [x, cy - hy * sy + dy, cz - hz * sz], [x, cy + hy * sy + dy, cz - hz * sz],
    [x, cy + hy * sy + dy, cz + hz * sz], [x, cy - hy * sy + dy, cz + hz * sz]]
  const points = [...end(lo[0], 1, 1, 0), ...end(hi[0], taper[0], taper[1], lift)]
  // 0-3 the -X end, 4-7 the +X end; counter-clockwise seen from outside.
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
  return { points, faces }
}

/** A square pyramid standing on y = 0 (an ear). */
function pyramid(w: number, d: number, h: number, lean: V3): { points: V3[], faces: number[][] } {
  const points: V3[] = [[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d], [lean[0], h, lean[2]]]
  return { points, faces: [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]] }
}

function part(name: string, shape: { points: V3[], faces: number[][] }, color: V3, indent: string): string {
  return mesh(name, shape.points, shape.faces, color, indent)
}

/** An Xform with a translate and the rotate ops the page drives. */
function joint(name: string, at: V3, ops: string[], body: string, indent: string): string {
  const order = ['"xformOp:translate"', ...ops.map(op => `"xformOp:${op}"`)]
  return `${indent}def Xform "${name}"
${indent}{
${indent}    double3 xformOp:translate = ${v(at)}
${ops.map(op => `${indent}    float xformOp:${op} = 0\n`).join('')}${indent}    uniform token[] xformOpOrder = [${order.join(', ')}]
${body}${indent}}
`
}

/** An octagonal prism along X between two corners: a box with its long
 *  edges cut by `chamfer` (a fraction of the smaller half size), so it reads
 *  round from the front. The +X end's half sizes are scaled by `taper`
 *  (y, z) and lifted by `lift`. Outward-facing faces. */
function rounded(lo: V3, hi: V3, chamfer = 0.4, taper: readonly [number, number] = [1, 1], lift = 0): { points: V3[], faces: number[][] } {
  const cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2
  const hy = (hi[1] - lo[1]) / 2, hz = (hi[2] - lo[2]) / 2
  const ring = (x: number, sy: number, sz: number, dy: number): V3[] => {
    const y = hy * sy, z = hz * sz, c = Math.min(y, z) * chamfer
    // Counter-clockwise in (z, y).
    const zy: [number, number][] = [[z, -y + c], [z, y - c], [z - c, y], [-z + c, y], [-z, y - c], [-z, -y + c], [-z + c, -y], [z - c, -y]]
    return zy.map(([pz, py]) => [x, cy + py + dy, cz + pz])
  }
  const points = [...ring(lo[0], 1, 1, 0), ...ring(hi[0], taper[0], taper[1], lift)]
  const faces = [[0, 1, 2, 3, 4, 5, 6, 7], [15, 14, 13, 12, 11, 10, 9, 8]]
  for (let k = 0; k < 8; k++) { const n = (k + 1) % 8; faces.push([n, k, k + 8, n + 8]) }
  return { points, faces }
}

// A black cat: near-black fur, a shade lighter on the muzzle and paws.
const FUR: V3 = [0.11, 0.105, 0.12]
const DARK_FUR: V3 = [0.07, 0.065, 0.075]
const LIGHT_FUR: V3 = [0.22, 0.21, 0.23]
const PINK: V3 = [0.95, 0.58, 0.64]
const INK: V3 = [0.02, 0.02, 0.02]
const WHITE: V3 = [1, 1, 1]
/** The eyes' resting color; cat3d.ts cycles them through the rainbow. */
export const EYE: V3 = [0.78, 0.86, 0.22]

function legs(indent: string): string {
  const leg = (name: string, x: number, z: number, far: boolean) => joint(name, [x, 0.34, z], ['rotateZ'],
    part('Leg', rounded([-0.035, -0.31, -0.035], [0.035, 0, 0.035], 0.5), far ? DARK_FUR : FUR, indent + '    ') +
    part('Paw', rounded([-0.045, -0.34, -0.045], [0.06, -0.29, 0.045], 0.5), LIGHT_FUR, indent + '    '), indent)
  return leg('LegFrontLeft', 0.24, 0.07, false) + leg('LegFrontRight', 0.24, -0.07, true) +
    leg('LegBackLeft', -0.22, 0.08, false) + leg('LegBackRight', -0.22, -0.08, true)
}

/** A big round head with big eyes: what makes the cat cute. */
function head(indent: string): string {
  const i = indent + '    '
  const ear = (name: string, z: number, lean: number) => joint(name, [-0.03, 0.15, z], ['rotateX', 'rotateZ'],
    part('Ear', pyramid(0.065, 0.06, 0.15, [-0.02, 0, lean]), FUR, i + '    ') +
    part('Inner', pyramid(0.04, 0.035, 0.11, [-0.015, 0, lean * 0.8]), PINK, i + '    '), i)
  // Eyes: big, a little tall, with a slit pupil and a glint.
  const eye = (name: string, z: number) =>
    part(name, rounded([0.18, -0.025, z - 0.052], [0.2, 0.085, z + 0.052], 0.45), EYE, i) +
    part(`${name}Pupil`, rounded([0.2, -0.01, z - 0.016], [0.207, 0.07, z + 0.016], 0.5), INK, i) +
    part(`${name}Glint`, block([0.207, 0.045, z + 0.012], [0.211, 0.07, z + 0.034]), WHITE, i)
  const shapes = part('Skull', rounded([-0.17, -0.16, -0.21], [0.19, 0.17, 0.21], 0.45, [0.92, 0.92]), FUR, i) +
    part('Cheeks', rounded([0.08, -0.15, -0.17], [0.2, -0.04, 0.17], 0.6, [0.85, 0.8]), FUR, i) +
    part('Muzzle', rounded([0.15, -0.12, -0.06], [0.23, -0.05, 0.06], 0.6), LIGHT_FUR, i) +
    part('Nose', rounded([0.225, -0.07, -0.02], [0.235, -0.045, 0.02], 0.6), PINK, i) +
    eye('EyeLeft', 0.09) + eye('EyeRight', -0.09) +
    ear('EarLeft', 0.12, 0.035) + ear('EarRight', -0.12, -0.035)
  return joint('Head', [0.36, 0.7, 0], ['rotateY', 'rotateZ', 'rotateX'], shapes, indent)
}

function tail(indent: string): string {
  const i = indent + '    '
  const tip = joint('Tip', [-0.22, 0, 0], ['rotateZ', 'rotateY'],
    part('Segment', rounded([-0.24, -0.026, -0.026], [0, 0.026, 0.026], 0.5, [1.15, 1.15]), DARK_FUR, i + '    '), i)
  const body = part('Segment', rounded([-0.24, -0.03, -0.03], [0, 0.03, 0.03], 0.5, [1.1, 1.1]), FUR, i) + tip
  return joint('Tail', [-0.34, 0.48, 0], ['rotateZ', 'rotateY'], body, indent)
}

function cat(indent: string): string {
  const i = indent + '    '
  // A slim body, narrower at the chest than at the haunches.
  const torso = part('Torso', rounded([-0.36, 0.3, -0.13], [0.3, 0.56, 0.13], 0.5, [0.95, 0.8], 0.02), FUR, i) +
    part('Chest', rounded([0.12, 0.3, -0.085], [0.31, 0.5, 0.085], 0.6), LIGHT_FUR, i)
  const body = joint('Body', [0, 0, 0], ['rotateZ'], torso + head(i) + tail(i) + legs(i), i)
  return `${indent}def Xform "Cat" (
${indent}    kind = "component"
${indent})
${indent}{
${indent}    double3 xformOp:translate = (0, 0, 0)
${indent}    float xformOp:rotateY = 0
${indent}    float3 xformOp:scale = (1, 1, 1)
${indent}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY", "xformOp:scale"]
${body}${indent}}
`
}

/** A faceted meadow: a grid with a little height noise, greens varied per
 *  face by splitting it into a few meshes. */
function ground(indent: string, halfWidth: number): string {
  const nx = 34, nz = 16, x0 = -halfWidth * 1.4, x1 = halfWidth * 1.4, z0 = -11, z1 = 5
  const height = (i: number, j: number) => j === 0 || j === nz ? 0 : (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1) * 0.03
  const at = (i: number, j: number): V3 => [x0 + (x1 - x0) * i / nx, height(i, j) - 0.01, z1 - (z1 - z0) * j / nz]
  const greens: V3[] = [[0.47, 0.7, 0.36], [0.42, 0.65, 0.33], [0.52, 0.74, 0.4]]
  const groups = greens.map(() => ({ points: [] as V3[], faces: [] as number[][] }))
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const g = groups[(i * 7 + j * 3) % greens.length]!
    const n = g.points.length
    g.points.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1))
    g.faces.push([n, n + 1, n + 2], [n, n + 2, n + 3])
  }
  return groups.map((g, k) => mesh(`Meadow${k}`, g.points, g.faces, greens[k]!, indent)).join('')
}

/** A low-poly tree: a trunk and two stacked cones (octagonal pyramids). */
function tree(name: string, at: V3, scale: number, indent: string): string {
  const cone = (r: number, y0: number, h: number) => {
    const points: V3[] = []
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; points.push([Math.cos(a) * r, y0, Math.sin(a) * r]) }
    points.push([0, y0 + h, 0])
    const faces = [[0, 1, 2, 3, 4, 5, 6], ...Array.from({ length: 7 }, (_, k) => [(k + 1) % 7, k, 7])]
    return { points, faces }
  }
  const i = indent + '    '
  const shapes = part('Trunk', block([-0.06, 0, -0.06], [0.06, 0.4, 0.06]), [0.5, 0.33, 0.2], i) +
    part('Low', cone(0.42, 0.3, 0.7), [0.27, 0.55, 0.3], i) +
    part('High', cone(0.3, 0.75, 0.6), [0.32, 0.62, 0.34], i)
  return `${indent}def Xform "${name}"
${indent}{
${indent}    double3 xformOp:translate = ${v(at)}
${indent}    float3 xformOp:scale = (${f(scale)}, ${f(scale)}, ${f(scale)})
${indent}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
${shapes}${indent}}
`
}

/** The yard's mats under the two stacks of files (page x positions are
 *  matched to them in cat3d.ts). */
function mat(name: string, x: number, color: V3, indent: string): string {
  return part(name, block([x - 0.65, 0.02, -0.4], [x + 0.65, 0.07, 0.4]), color, indent)
}

export interface YardLayout { halfWidth: number, inboxX: number, outboxX: number }

export function catYardUsda(layout: YardLayout): string {
  const { halfWidth, inboxX, outboxX } = layout
  return `#usda 1.0
(
    defaultPrim = "Yard"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Yard"
{
${ground('    ', halfWidth + 3)}${mat('Inbox', inboxX, [0.62, 0.47, 0.3], '    ')}${mat('Outbox', outboxX, [0.55, 0.42, 0.28], '    ')}${tree('TreeA', [-halfWidth * 0.68, 0, -6.5], 1.55, '    ')}${tree('TreeB', [halfWidth * 0.3, 0, -8.0], 1.75, '    ')}${tree('TreeC', [halfWidth * 0.95, 0, -6.0], 1.6, '    ')}${tree('TreeD', [-halfWidth * 1.25, 0, -5.2], 1.4, '    ')}${tree('TreeE', [-halfWidth * 0.18, 0, -9.0], 1.9, '    ')}${cat('    ')}}
`
}
