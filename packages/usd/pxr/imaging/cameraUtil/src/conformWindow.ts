// Ported from OpenUSD 26.11.1: pxr/imaging/cameraUtil/conformWindow.cpp,
//  pxr/imaging/cameraUtil/conformWindow.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/cameraUtil/conformWindow.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the C++ overloads of CameraUtilConformedWindow /
// CameraUtilConformWindow are one function each, dispatching on the
// argument's type. TF_ADD_ENUM_NAME registration (conformWindow.cpp:24-31)
// is CameraUtilConformWindowPolicyNames.

import {
  Matrix4d as GfMatrix4d,
  Range2d as GfRange2d,
  Vec2d as GfVec2d,
  Vec4d as GfVec4d,
  type Camera as GfCamera,
  type Frustum as GfFrustum,
} from 'typescript-usd/gf'

/** conformWindow.h:30-61 */
export enum CameraUtilConformWindowPolicy {
  CameraUtilMatchVertically,
  CameraUtilMatchHorizontally,
  CameraUtilFit,
  CameraUtilCrop,
  CameraUtilDontConform,
}

/** conformWindow.cpp:24-31 (TF_ADD_ENUM_NAME; "MatchHotizontally" is
 *  upstream's spelling). */
export const CameraUtilConformWindowPolicyNames: Readonly<Record<CameraUtilConformWindowPolicy, string>> = {
  [CameraUtilConformWindowPolicy.CameraUtilMatchVertically]: 'MatchVertically',
  [CameraUtilConformWindowPolicy.CameraUtilMatchHorizontally]: 'MatchHotizontally',
  [CameraUtilConformWindowPolicy.CameraUtilFit]: 'Fit',
  [CameraUtilConformWindowPolicy.CameraUtilCrop]: 'Crop',
  [CameraUtilConformWindowPolicy.CameraUtilDontConform]: 'DontConform',
}

const P = CameraUtilConformWindowPolicy

/** conformWindow.cpp:33-42 */
function _SafeDivOne(a: number, b: number): number {
  if (b !== 0.0) {
    return a / b
  }
  return 1.0
}

/** conformWindow.cpp:44-53 */
function _SafeDiv(a: number, b: number): number {
  if (b !== 0.0) {
    return a / b
  }
  return a
}

/** conformWindow.cpp:55-72 */
function _ResolveConformWindowPolicy(
  size: readonly [number, number],
  policy: CameraUtilConformWindowPolicy,
  targetAspect: number,
): CameraUtilConformWindowPolicy {
  if (policy === P.CameraUtilMatchVertically || policy === P.CameraUtilMatchHorizontally) {
    return policy
  }

  const aspect = _SafeDivOne(size[0], size[1])

  if ((policy === P.CameraUtilFit) !== (aspect > targetAspect)) {
    return P.CameraUtilMatchVertically
  }
  return P.CameraUtilMatchHorizontally
}

/** conformWindow.cpp:74-79 */
function _DoesNotRequireAdjustment(policy: CameraUtilConformWindowPolicy): boolean {
  return policy === P.CameraUtilDontConform
}

/** conformWindow.cpp:81-98 */
function _ConformedVec2d(window: GfVec2d, policy: CameraUtilConformWindowPolicy,
  targetAspect: number): GfVec2d {
  if (_DoesNotRequireAdjustment(policy)) {
    return window
  }

  const resolvedPolicy = _ResolveConformWindowPolicy(
    [window.get(0), window.get(1)], policy, targetAspect)

  if (resolvedPolicy === P.CameraUtilMatchHorizontally) {
    return new GfVec2d(window.get(0), _SafeDiv(window.get(0), targetAspect))
  } else {
    return new GfVec2d(window.get(1) * targetAspect, window.get(1))
  }
}

/** conformWindow.cpp:100-128 */
function _ConformedRange2d(window: GfRange2d, policy: CameraUtilConformWindowPolicy,
  targetAspect: number): GfRange2d {
  if (_DoesNotRequireAdjustment(policy)) {
    return window
  }

  const min = window.getMin()
  const max = window.getMax()
  const size: [number, number] = [max.get(0) - min.get(0), max.get(1) - min.get(1)]
  const center: [number, number] = [(min.get(0) + max.get(0)) / 2.0, (min.get(1) + max.get(1)) / 2.0]

  const resolvedPolicy = _ResolveConformWindowPolicy(size, policy, targetAspect)

  if (resolvedPolicy === P.CameraUtilMatchHorizontally) {
    const height = _SafeDiv(size[0], targetAspect)

    return new GfRange2d(
      new GfVec2d(min.get(0), center[1] - height / 2.0),
      new GfVec2d(max.get(0), center[1] + height / 2.0))
  } else {
    const width = size[1] * targetAspect

    return new GfRange2d(
      new GfVec2d(center[0] - width / 2.0, min.get(1)),
      new GfVec2d(center[0] + width / 2.0, max.get(1)))
  }
}

/** conformWindow.cpp:130-147 */
function _ConformedVec4d(window: GfVec4d, policy: CameraUtilConformWindowPolicy,
  targetAspect: number): GfVec4d {
  if (_DoesNotRequireAdjustment(policy)) {
    return window
  }

  const original = new GfRange2d(new GfVec2d(window.get(0), window.get(2)),
    new GfVec2d(window.get(1), window.get(3)))

  const conformed = _ConformedRange2d(original, policy, targetAspect)

  return new GfVec4d(conformed.getMin().get(0), conformed.getMax().get(0),
    conformed.getMin().get(1), conformed.getMax().get(1))
}

/** conformWindow.cpp:149-158 */
function _Sign(x: number): number {
  if (x < 0.0) {
    return -1.0
  }
  return 1.0
}

/** conformWindow.cpp:160-219 */
function _ConformedMatrix4d(projectionMatrix: GfMatrix4d,
  policy: CameraUtilConformWindowPolicy, targetAspect: number): GfMatrix4d {
  if (_DoesNotRequireAdjustment(policy)) {
    return projectionMatrix
  }

  const result = new GfMatrix4d(projectionMatrix)
  const pm = (i: number, j: number): number => projectionMatrix.getElement(i, j)

  // The aspect ratio of the frustum corresponding to the given
  // projectionMatrix (assume is square pixels) is given by the ratio of
  // the two top diaognal entries.
  const window: [number, number] = [Math.abs(pm(1, 1)), Math.abs(pm(0, 0))]

  // This tells us whether we need to adjust the parameters affecting the
  // vertical or horizontal aspects of the projectionMatrix.
  const resolvedPolicy = _ResolveConformWindowPolicy(window, policy, targetAspect)

  if (resolvedPolicy === P.CameraUtilMatchHorizontally) {
    // Adjust vertical size
    result.SetElement(1, 1, _Sign(pm(1, 1)) * window[1] * targetAspect)

    // Now handle the case that the frustum is asymetric, e.g., the angle
    // on the left is different from the angle on the right.
    // First compute the factor by which we scaled vertically...
    const scaleFactor = _SafeDiv(result.getElement(1, 1), pm(1, 1))

    // ...and then apply it to the offsets making the frustum asymetric.
    // This one is important for perspective:
    result.SetElement(2, 1, result.getElement(2, 1) * scaleFactor)
    // This one is important for orthographic:
    result.SetElement(3, 1, result.getElement(3, 1) * scaleFactor)
  } else {
    // As above, but horizontally.
    result.SetElement(0, 0, _Sign(pm(0, 0)) * _SafeDiv(window[0], targetAspect))

    const scaleFactor = _SafeDiv(result.getElement(0, 0), pm(0, 0))

    result.SetElement(2, 0, result.getElement(2, 0) * scaleFactor)
    result.SetElement(3, 0, result.getElement(3, 0) * scaleFactor)
  }

  return result
}

/** conformWindow.h:63-93 (CameraUtilConformedWindow, all four overloads) */
export function CameraUtilConformedWindow(window: GfRange2d,
  policy: CameraUtilConformWindowPolicy, targetAspect: number): GfRange2d
export function CameraUtilConformedWindow(window: GfVec4d,
  policy: CameraUtilConformWindowPolicy, targetAspect: number): GfVec4d
export function CameraUtilConformedWindow(window: GfVec2d,
  policy: CameraUtilConformWindowPolicy, targetAspect: number): GfVec2d
export function CameraUtilConformedWindow(projectionMatrix: GfMatrix4d,
  policy: CameraUtilConformWindowPolicy, targetAspect: number): GfMatrix4d
export function CameraUtilConformedWindow(
  window: GfRange2d | GfVec4d | GfVec2d | GfMatrix4d,
  policy: CameraUtilConformWindowPolicy,
  targetAspect: number,
): GfRange2d | GfVec4d | GfVec2d | GfMatrix4d {
  if (window instanceof GfMatrix4d) return _ConformedMatrix4d(window, policy, targetAspect)
  if (window instanceof GfRange2d) return _ConformedRange2d(window, policy, targetAspect)
  if (window instanceof GfVec4d) return _ConformedVec4d(window, policy, targetAspect)
  return _ConformedVec2d(window, policy, targetAspect)
}

/** conformWindow.cpp:221-251 (CameraUtilConformWindow, both overloads).
 *  A GfCamera has its apertures conformed; a GfFrustum its window. */
export function CameraUtilConformWindow(
  target: GfCamera | GfFrustum,
  policy: CameraUtilConformWindowPolicy,
  targetAspect: number,
): void {
  if (_DoesNotRequireAdjustment(policy)) {
    return
  }
  if ('GetHorizontalAperture' in target) {
    const original = new GfVec2d(target.GetHorizontalAperture(), target.getVerticalAperture())
    const conformed = _ConformedVec2d(original, policy, targetAspect)
    target.setHorizontalAperture(conformed.get(0))
    target.setVerticalAperture(conformed.get(1))
  } else {
    const screenWindowFitted = _ConformedRange2d(target.getWindow(), policy, targetAspect)
    target.setWindow(screenWindowFitted)
  }
}
