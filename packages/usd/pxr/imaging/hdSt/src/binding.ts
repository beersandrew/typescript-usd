// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/binding.cpp,
//  pxr/imaging/hdSt/binding.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/binding.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The HdStBindingRequest constructor overloads (binding.h:110-185) are one
//   constructor dispatching on its third argument, as C++ overload resolution
//   does.
// - ComputeHash: the hash is a cache key only (binding.h:276-283), so any
//   stable hash of the same fields is used.

import { Token as TfToken, Hash as TfHash } from 'typescript-usd/tf'
import { Type as HdType, type BufferArrayRange as HdBufferArrayRange } from 'typescript-usd/hd'
import { HgiShaderStageBits, type HgiShaderStage } from 'typescript-usd/hgi'
import type { HdStBufferResource } from './bufferResource.ts'

/** HdStBinding::Type (binding.h:31-80) */
export enum HdStBindingType {
  // primvar, drawing coordinate and dispatch buffer bindings
  // also shader fallback values
  UNKNOWN,
  DISPATCH,            // GL_DRAW_INDIRECT_BUFFER
  DRAW_INDEX,          // per-drawcall. not instanced
  DRAW_INDEX_INSTANCE, // per-drawcall. attribdivisor=on
  DRAW_INDEX_INSTANCE_ARRAY, // per-drawcall. attribdivisor=on, array
  VERTEX_ATTR,         // vertex-attribute
  INDEX_ATTR,          // GL_ELEMENT_ARRAY_BUFFER
  SSBO,                //
  BINDLESS_SSBO_RANGE, //
  UBO,                 //
  BINDLESS_UNIFORM,    //
  UNIFORM,             //
  UNIFORM_ARRAY,       //

  // shader parameter bindings
  FALLBACK,             // fallback value
  TEXTURE_2D,           // non-bindless uv texture
  ARRAY_OF_TEXTURE_2D,  // non-bindless array of uv textures. Not
                        // to be confused with a texture array
                        // (what udim and ptex textures use).
  TEXTURE_FIELD,        // non-bindless field texture
                        // creates accessor that samples uvw
                        // texture after transforming coordinates
                        // by a sampling transform
  TEXTURE_UDIM_ARRAY,   // non-bindless udim texture array
  TEXTURE_UDIM_LAYOUT,  // non-bindless udim layout
  TEXTURE_PTEX_TEXEL,   // non-bindless ptex texels
  TEXTURE_PTEX_LAYOUT,  // non-bindless ptex layout
  TEXTURE_CUBEMAP,      // non-bindless cubemap texture
  BINDLESS_TEXTURE_2D,          // bindless uv texture
  BINDLESS_ARRAY_OF_TEXTURE_2D, // bindless array of uv textures
  BINDLESS_TEXTURE_FIELD,       // bindless field texture
                                // (see above)
  BINDLESS_TEXTURE_UDIM_ARRAY,  // bindless uv texture array
  BINDLESS_TEXTURE_UDIM_LAYOUT, // bindless udim layout
  BINDLESS_TEXTURE_PTEX_TEXEL,  // bindless ptex texels
  BINDLESS_TEXTURE_PTEX_LAYOUT, // bindless ptex layout
  BINDLESS_TEXTURE_CUBEMAP,     // bindless cubemap texture
  PRIMVAR_REDIRECT,    // primvar redirection
  FIELD_REDIRECT, // accesses a field texture by name and
                  // uses fallbackValue if no accessor for
                  // the texture exists.
  TRANSFORM_2D,   // transform2d
}

/** HdStBinding::Location (binding.h:81-85) */
export enum HdStBindingLocation {
  // NOT_EXIST is a special value of location for a uniform
  // which is assigned but optimized out after linking program.
  NOT_EXIST = 0xffff,
}

/** binding.h:28-111. Bindings consist of type, location and texture unit
 *  packed into one int. */
export class HdStBinding {
  // Upstream's nested enums, reachable as HdStBinding.SSBO etc.
  static readonly UNKNOWN = HdStBindingType.UNKNOWN
  static readonly DISPATCH = HdStBindingType.DISPATCH
  static readonly DRAW_INDEX = HdStBindingType.DRAW_INDEX
  static readonly DRAW_INDEX_INSTANCE = HdStBindingType.DRAW_INDEX_INSTANCE
  static readonly DRAW_INDEX_INSTANCE_ARRAY = HdStBindingType.DRAW_INDEX_INSTANCE_ARRAY
  static readonly VERTEX_ATTR = HdStBindingType.VERTEX_ATTR
  static readonly INDEX_ATTR = HdStBindingType.INDEX_ATTR
  static readonly SSBO = HdStBindingType.SSBO
  static readonly BINDLESS_SSBO_RANGE = HdStBindingType.BINDLESS_SSBO_RANGE
  static readonly UBO = HdStBindingType.UBO
  static readonly BINDLESS_UNIFORM = HdStBindingType.BINDLESS_UNIFORM
  static readonly UNIFORM = HdStBindingType.UNIFORM
  static readonly UNIFORM_ARRAY = HdStBindingType.UNIFORM_ARRAY
  static readonly FALLBACK = HdStBindingType.FALLBACK
  static readonly TEXTURE_2D = HdStBindingType.TEXTURE_2D
  static readonly ARRAY_OF_TEXTURE_2D = HdStBindingType.ARRAY_OF_TEXTURE_2D
  static readonly TEXTURE_FIELD = HdStBindingType.TEXTURE_FIELD
  static readonly TEXTURE_UDIM_ARRAY = HdStBindingType.TEXTURE_UDIM_ARRAY
  static readonly TEXTURE_UDIM_LAYOUT = HdStBindingType.TEXTURE_UDIM_LAYOUT
  static readonly TEXTURE_PTEX_TEXEL = HdStBindingType.TEXTURE_PTEX_TEXEL
  static readonly TEXTURE_PTEX_LAYOUT = HdStBindingType.TEXTURE_PTEX_LAYOUT
  static readonly TEXTURE_CUBEMAP = HdStBindingType.TEXTURE_CUBEMAP
  static readonly BINDLESS_TEXTURE_2D = HdStBindingType.BINDLESS_TEXTURE_2D
  static readonly BINDLESS_ARRAY_OF_TEXTURE_2D = HdStBindingType.BINDLESS_ARRAY_OF_TEXTURE_2D
  static readonly BINDLESS_TEXTURE_FIELD = HdStBindingType.BINDLESS_TEXTURE_FIELD
  static readonly BINDLESS_TEXTURE_UDIM_ARRAY = HdStBindingType.BINDLESS_TEXTURE_UDIM_ARRAY
  static readonly BINDLESS_TEXTURE_UDIM_LAYOUT = HdStBindingType.BINDLESS_TEXTURE_UDIM_LAYOUT
  static readonly BINDLESS_TEXTURE_PTEX_TEXEL = HdStBindingType.BINDLESS_TEXTURE_PTEX_TEXEL
  static readonly BINDLESS_TEXTURE_PTEX_LAYOUT = HdStBindingType.BINDLESS_TEXTURE_PTEX_LAYOUT
  static readonly BINDLESS_TEXTURE_CUBEMAP = HdStBindingType.BINDLESS_TEXTURE_CUBEMAP
  static readonly PRIMVAR_REDIRECT = HdStBindingType.PRIMVAR_REDIRECT
  static readonly FIELD_REDIRECT = HdStBindingType.FIELD_REDIRECT
  static readonly TRANSFORM_2D = HdStBindingType.TRANSFORM_2D
  static readonly NOT_EXIST = HdStBindingLocation.NOT_EXIST

  private _typeAndLocation: number

  /** binding.h:87-90. `new HdStBinding()` is the invalid binding. */
  constructor(type?: HdStBindingType, location = 0, textureUnit = 0) {
    this._typeAndLocation = -1
    if (type !== undefined) {
      this.Set(type, location, textureUnit)
    }
  }

  /** binding.h:91-93 */
  Set(type: HdStBindingType, location: number, textureUnit: number): void {
    this._typeAndLocation = (textureUnit << 24) | (location << 8) | type
  }

  /** binding.h:94 */
  isValid(): boolean { return this._typeAndLocation >= 0 }
  /** binding.h:95 */
  getType(): HdStBindingType { return this._typeAndLocation & 0xff }
  /** binding.h:96 */
  getLocation(): number { return (this._typeAndLocation >> 8) & 0xffff }
  /** binding.h:97 */
  getTextureUnit(): number { return (this._typeAndLocation >> 24) & 0xff }
  /** binding.h:98 */
  GetValue(): number { return this._typeAndLocation }
  /** operator< (binding.h:99-101) */
  lessThan(b: HdStBinding): boolean {
    return this._typeAndLocation < b._typeAndLocation
  }
}
export type HdStBindingVector = HdStBinding[]

/** binding.h:111-330. BindingRequest allows externally allocated buffers to
 *  be bound at render time. */
export class HdStBindingRequest {
  private _bindingType: HdStBindingType
  private _dataType: HdType
  private _name: TfToken
  private _resource: HdStBufferResource | null
  private _bar: HdBufferArrayRange | null
  private _isInterleaved: boolean
  private _isWritable: boolean
  private _arraySize: number
  private _concatenateNames: boolean
  private _stageVisibility: HgiShaderStage

  /**
   * The constructor overloads:
   * - (bindingType, name): typeless named binding (binding.h:119-130);
   * - (bindingType, name, dataType: HdType) (binding.h:134-146);
   * - (bindingType, name, resource: HdStBufferResource) (binding.h:150-162);
   * - (type, name, bar, interleave, writable = false, arraySize = 0,
   *   concatenateNames = false, stageVisibility = HgiShaderStageAll)
   *   (binding.h:169-186).
   * A HdBufferArrayRange third argument needs `interleave` (no default
   * upstream); a null bar is passed as `{ bar: null }`.
   */
  constructor(
    bindingType: HdStBindingType,
    name: TfToken,
    third?: HdType | HdStBufferResource | HdBufferArrayRange | { bar: null },
    interleave?: boolean,
    writable = false,
    arraySize = 0,
    concatenateNames = false,
    stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number,
  ) {
    this._bindingType = bindingType
    this._dataType = HdType.HdTypeInvalid
    this._name = name
    this._resource = null
    this._bar = null
    this._isInterleaved = false
    this._isWritable = false
    this._arraySize = 0
    this._concatenateNames = false
    // Uninitialized upstream for the first three overloads; codegen reads it
    // only for interleaved requests.
    this._stageVisibility = HgiShaderStageBits.HgiShaderStageAll as number
    if (third === undefined) {
      return
    }
    if (typeof third === 'number') {
      this._dataType = third
      return
    }
    if (interleave === undefined) {
      // buffer resource binding: the data type is set from the resource.
      const resource = third as HdStBufferResource
      this._dataType = resource.getTupleType().type
      this._resource = resource
      return
    }
    this._bar = 'bar' in third && (third as { bar: unknown }).bar === null
      ? null : third as HdBufferArrayRange
    this._isInterleaved = interleave
    this._isWritable = writable
    this._arraySize = arraySize
    this._concatenateNames = concatenateNames
    this._stageVisibility = stageVisibility
  }

  // Discriminators

  /** binding.h:194-196 */
  isResource(): boolean {
    return Boolean(this._resource)
  }

  /** binding.h:201-203 */
  isBufferArray(): boolean {
    return Boolean(this._bar) && !this._isInterleaved
  }

  /** binding.h:209-211 */
  isInterleavedBufferArray(): boolean {
    return Boolean(this._bar) && this._isInterleaved
  }

  /** binding.h:215-217 */
  isWritable(): boolean {
    return Boolean(this._bar) && this._isWritable
  }

  /** binding.h:221-223 */
  isTypeless(): boolean {
    return (!this._bar) && (!this._resource) &&
      (this._dataType === HdType.HdTypeInvalid)
  }

  // Accessors

  /** binding.h:231-233 */
  getName(): TfToken {
    return this._name
  }

  /** binding.h:235-237 */
  getBindingType(): HdStBindingType {
    return this._bindingType
  }

  /** binding.h:240-242 */
  getResource(): HdStBufferResource | null {
    return this._resource
  }

  /** binding.h:245-253 */
  getByteOffset(): number {
    // buffer resource binding
    if (this._resource) return this._resource.getOffset()

    // named struct binding (interleaved) - the resource name doesn't matter
    // since a single binding point is used.
    if (this._bar) return this._bar.getByteOffset(TfToken())
    return 0
  }

  /** binding.h:256-258 */
  getBar(): HdBufferArrayRange | null {
    return this._bar
  }

  /** binding.h:261-263 */
  getDataType(): HdType {
    return this._dataType
  }

  /** binding.h:266-268 */
  getArraySize(): number {
    return this._arraySize
  }

  /** binding.h:272-274 */
  concatenateNames(): boolean {
    return this._concatenateNames
  }

  /** binding.h:277-279 */
  getStageVisibility(): HgiShaderStage {
    return this._stageVisibility
  }

  /** operator== (binding.cpp:12-25) */
  equals(other: HdStBindingRequest): boolean {
    return this._bindingType === other._bindingType &&
      this._dataType === other._dataType &&
      this._name === other._name &&
      this._resource === other._resource &&
      this._bar === other._bar &&
      this._isInterleaved === other._isInterleaved &&
      this._isWritable === other._isWritable &&
      this._arraySize === other._arraySize &&
      this._concatenateNames === other._concatenateNames
  }

  /** ComputeHash (binding.cpp:33-37) over the TfHashAppend fields
   *  (binding.h:298-305). A cache key only. */
  computeHash(): bigint {
    return TfHash([this._name, this._bindingType, this._dataType,
      this._isInterleaved])
  }
}
export type HdStBindingRequestVector = HdStBindingRequest[]
