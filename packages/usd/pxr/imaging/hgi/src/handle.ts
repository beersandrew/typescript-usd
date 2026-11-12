// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/handle.h,
//  pxr/imaging/hgiMetal/hgi.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/handle.h (OpenUSD 26.11.1).
//
// C++ -> TypeScript:
// - HgiHandle<T> is a small value type in C++ (pointer + unique id). Here it
//   is a class; `HgiHandle()` is `new HgiHandle()`.
// - `explicit operator bool` (handle.h:48) is IsSet(); `operator->` (:51) is
//   Get() (null for an empty handle).
// - Destroy* functions take `HgiXxxHandle*` upstream and reset the caller's
//   handle (e.g. hgiMetal/hgi.mm:206-210 through _TrashObject). They take the
//   handle object here and reset it in place with _Reset(). Because a
//   TypeScript assignment shares the object rather than copying it, every
//   holder of that same handle object sees the reset; upstream copies keep a
//   dangling pointer instead. Either way the destroyed object must not be used.

/** handle.h:31-64 */
export class HgiHandle<T> {
  private _ptr: T | null
  private _id: number

  /** handle.h:35-36 */
  constructor(obj: T | null = null, id = 0) {
    this._ptr = obj
    this._id = id
  }

  /** handle.h:38-41 */
  Get(): T | null {
    return this._ptr
  }

  /** handle.h:43-45 */
  getId(): number {
    return this._id
  }

  /** `explicit operator bool` (handle.h:47-48). Note this only checks if a
   *  ptr is set, it does not offer weak_ptr safety. */
  isSet(): boolean {
    return this._ptr !== null
  }

  /** operator== (handle.h:53-55): compares ids only. */
  equals(other: HgiHandle<T> | null | undefined): boolean {
    return this._id === (other?._id ?? 0)
  }

  /** Assign an empty handle (`*handle = HgiXxxHandle()`) in a Destroy call. */
  _reset(): void {
    this._ptr = null
    this._id = 0
  }
}

/** Element-wise operator== of two std::vector<HgiHandle<T>>. */
export function HgiHandleVectorEquals<T>(
  lhs: readonly HgiHandle<T>[],
  rhs: readonly HgiHandle<T>[],
): boolean {
  if (lhs.length !== rhs.length) return false
  for (let i = 0; i < lhs.length; i++) {
    if (!lhs[i]!.equals(rhs[i])) return false
  }
  return true
}
