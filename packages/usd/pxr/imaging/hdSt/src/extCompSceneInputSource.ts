// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompSceneInputSource.cpp,
//  pxr/imaging/hdSt/extCompSceneInputSource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompSceneInputSource.{h,cpp} (OpenUSD
// 26.11.1).

import type { Value as VtValue } from 'typescript-usd/vt'
import { HdSt_ExtCompInputSource } from './extCompInputSource.ts'

/** extCompSceneInputSource.h:19-55. An Hd Buffer Source Computation that is
 *  used to bind an ExtComputation input to a value provided by the scene
 *  delegate. */
export class HdSt_ExtCompSceneInputSource extends HdSt_ExtCompInputSource {
  /** extCompSceneInputSource.cpp:13-19. Constructs the computation, binding
   *  inputName to the provided value. */
  constructor(inputName: string, private readonly _value: VtValue) {
    super(inputName)
  }

  /** extCompSceneInputSource.cpp:23-30. Set the state of the computation to
   *  resolved and returns true. */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    this._setResolved()
    return true
  }

  /** extCompSceneInputSource.cpp:32-36. Returns the value associated with
   *  this input. */
  GetValue(): VtValue {
    return this._value
  }

  /** extCompSceneInputSource.cpp:38-42. Returns if this computation binding
   *  is valid. */
  protected override _checkValid(): boolean {
    return true
  }
}
