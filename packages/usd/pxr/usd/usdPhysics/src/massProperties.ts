// Ported from OpenUSD 26.11.1: pxr/usd/usdPhysics/massProperties.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mass properties computation helpers.
// Ported from OpenUSD v26.11.1 pxr/usd/usdPhysics/massProperties.h.
//
// Precision: upstream computes in float (GfMatrix3f/GfVec3f/GfQuatf/float).
// GfMatrix3f/GfVec3f/GfQuatf here round every stored component through
// Math.fround; scalar float temporaries are rounded with Math.fround where
// upstream stores them in a float variable.

import {
  Matrix3f as GfMatrix3f,
  type Matrix4f as GfMatrix4f,
  Quatf as GfQuatf,
  Vec3f as GfVec3f,
  rotationToQuat,
} from 'typescript-usd/gf'

const f = Math.fround

// GfMatrix3f(const GfQuatf&) (pxr/base/gf/matrix3f.cpp: SetRotate(GfQuatf)
// -> _SetRotateFromQuat(real, imaginary)), without normalization.
function matrix3fFromQuat(q: GfQuatf): GfMatrix3f {
  const im = q.GetImaginary()
  return new GfMatrix3f([q.GetReal(), im.get(0), im.get(1), im.get(2)])
}

// massProperties.h:22-27
export function indexedRotation(axis: number, s: number, c: number): GfQuatf {
  const v = [0, 0, 0]
  v[axis] = s
  return new GfQuatf(c, v[0]!, v[1]!, v[2]!)
}

// massProperties.h:29-32
export function getNextIndex3(i: number): number {
  return (i + 1 + (i >> 1)) & 3
}

// massProperties.h:35-75. Upstream writes the mass frame through the
// `GfQuatf& massFrame` out-parameter; here the passed GfQuatf is updated in
// place.
export function diagonalize(m: GfMatrix3f, massFrame: GfQuatf): GfVec3f {
  const MAX_ITERS = 24

  let q = new GfQuatf(1.0)

  let d = new GfMatrix3f()
  for (let i = 0; i < MAX_ITERS; i++) {
    const axes = matrix3fFromQuat(q)
    d = axes.getMultiply(m).getMultiply(axes.getTranspose())

    const d0 = Math.abs(d.getElement(1, 2)), d1 = Math.abs(d.getElement(0, 2)), d2 = Math.abs(d.getElement(0, 1))
    // rotation axis index, from largest off-diagonal element
    const a = d0 > d1 && d0 > d2 ? 0 : d1 > d2 ? 1 : 2

    const a1 = getNextIndex3(a), a2 = getNextIndex3(a1)
    if (d.getElement(a1, a2) === 0.0 ||
      Math.abs(d.getElement(a1, a1) - d.getElement(a2, a2)) > 2e6 * Math.abs(2.0 * d.getElement(a1, a2)))
      break

    // cot(2 * phi), where phi is the rotation angle
    const w = f((d.getElement(a1, a1) - d.getElement(a2, a2)) / f(2.0 * d.getElement(a1, a2)))
    const absw = Math.abs(w)

    let r: GfQuatf
    if (absw > 1000) {
      // h will be very close to 1, so use small angle approx instead
      r = indexedRotation(a, f(1 / f(4 * w)), 1.0)
    } else {
      const t = f(1 / f(absw + Math.sqrt(w * w + 1))) // absolute value of tan phi
      const h = f(1 / Math.sqrt(t * t + 1)) // absolute value of cos phi

      r = indexedRotation(a, f(Math.sqrt((1 - h) / 2)) * ((w >= 0.0) ? 1.0 : -1.0), f(Math.sqrt((1 + h) / 2)))
    }

    q = q.getMultiply(r).GetNormalized()
  }

  massFrame.setReal(q.GetReal())
  massFrame.setImaginary(q.GetImaginary())
  return new GfVec3f(d.getColumn(0).get(0), d.getColumn(1).get(1), d.getColumn(2).get(2))
}

// Mass properties computation class. Used to combine together individual mass
// properties and produce final one (massProperties.h:81-230).
export class MassProperties {
  private _inertiaTensor: GfMatrix3f // The inertia tensor of the object.
  private _centerOfMass: GfVec3f // The center of mass of the object.
  private _mass: number // The mass of the object.

  // massProperties.h:90-103: the default constructor (unit mass, identity
  // inertia, origin center of mass) or construction from individual elements.
  constructor()
  constructor(m: number, inertiaT: GfMatrix3f, com: GfVec3f)
  constructor(m?: number, inertiaT?: GfMatrix3f, com?: GfVec3f) {
    if (m === undefined) {
      this._inertiaTensor = new GfMatrix3f(0.0)
      this._centerOfMass = new GfVec3f(0.0)
      this._mass = 1.0
      this._inertiaTensor.SetElement(0, 0, 1.0)
      this._inertiaTensor.SetElement(1, 1, 1.0)
      this._inertiaTensor.SetElement(2, 2, 1.0)
      return
    }
    this._inertiaTensor = new GfMatrix3f(inertiaT!)
    this._centerOfMass = new GfVec3f(com!)
    this._mass = f(m)
  }

  // Scale mass properties (operator*, massProperties.h:107-110).
  scale(scale: number): MassProperties {
    return new MassProperties(f(this._mass * scale), this._inertiaTensor.getScalarMultiply(scale), this._centerOfMass)
  }

  // Translate the center of mass by a given vector and adjust the inertia
  // tensor accordingly (massProperties.h:112-118).
  translate(t: GfVec3f): void {
    this._inertiaTensor = MassProperties.translateInertia(this._inertiaTensor, this._mass, t)
    this._centerOfMass = this._centerOfMass.add(t)
  }

  // Get the entries of the diagonalized inertia tensor and the corresponding
  // reference rotation (massProperties.h:120-129). `massFrame` is the
  // upstream out-parameter, updated in place.
  static getMassSpaceInertia(inertia: GfMatrix3f, massFrame: GfQuatf): GfVec3f {
    const diagT = diagonalize(inertia, massFrame)
    return diagT
  }

  // Translate an inertia tensor using the parallel axis theorem
  // (massProperties.h:131-145).
  static translateInertia(inertia: GfMatrix3f, mass: number, t: GfVec3f): GfMatrix3f {
    const s = new GfMatrix3f()
    s.setColumn(0, new GfVec3f(0, t.get(2), -t.get(1)))
    s.setColumn(1, new GfVec3f(-t.get(2), 0, t.get(0)))
    s.setColumn(2, new GfVec3f(t.get(1), -t.get(0), 0))

    const translatedIT = s.getMultiply(s.getTranspose()).getScalarMultiply(mass).getAdd(inertia)
    return translatedIT
  }

  // Rotate an inertia tensor around the center of mass
  // (massProperties.h:148-157).
  static rotateInertia(inertia: GfMatrix3f, q: GfQuatf): GfMatrix3f {
    const m = matrix3fFromQuat(q)
    const rotatedIT = m.getTranspose().getMultiply(inertia).getMultiply(m)
    return rotatedIT
  }

  // Sum up individual mass properties (massProperties.h:160-187). Upstream
  // takes parallel arrays plus a count; the count is the arrays' length here.
  static sum(props: readonly MassProperties[], transforms: readonly GfMatrix4f[], count = props.length): MassProperties {
    let combinedMass = 0.0
    let combinedCoM = new GfVec3f(0.0)
    let combinedInertiaT = new GfMatrix3f(0.0)

    for (let i = 0; i < count; i++) {
      combinedMass = f(combinedMass + props[i]!._mass)
      const comTm = new GfVec3f(transforms[i]!.Transform(props[i]!._centerOfMass))
      combinedCoM = combinedCoM.add(comTm.getScaled(props[i]!._mass))
    }

    if (combinedMass > 0)
      combinedCoM = combinedCoM.getDivided(combinedMass)

    for (let i = 0; i < count; i++) {
      const comTm = new GfVec3f(transforms[i]!.Transform(props[i]!._centerOfMass))
      // GfQuatf(transforms[i].ExtractRotation().GetQuat())
      const rq = rotationToQuat(transforms[i]!.extractRotation())
      combinedInertiaT = combinedInertiaT.getAdd(MassProperties.translateInertia(
        MassProperties.rotateInertia(props[i]!._inertiaTensor, new GfQuatf(rq[0], rq[1], rq[2], rq[3])),
        props[i]!._mass, combinedCoM.subtract(comTm)))
    }

    return new MassProperties(combinedMass, combinedInertiaT, combinedCoM)
  }

  // Get inertia tensor (massProperties.h:189-196).
  getInertiaTensor(): GfMatrix3f {
    return this._inertiaTensor
  }

  // Set inertia tensor (massProperties.h:198-203).
  setInertiaTensor(inTensor: GfMatrix3f): void {
    this._inertiaTensor = inTensor
  }

  // Get center of mass (massProperties.h:205-210).
  getCenterOfMass(): GfVec3f {
    return this._centerOfMass
  }

  // Get mass (massProperties.h:212-217).
  getMass(): number {
    return this._mass
  }

  // Set mass (massProperties.h:219-224).
  setMass(inMass: number): void {
    this._mass = f(inMass)
  }
}
