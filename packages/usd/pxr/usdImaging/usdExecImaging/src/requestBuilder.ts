// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/requestBuilder.cpp,
//  pxr/usdImaging/usdExecImaging/requestBuilder.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/requestBuilder.{h,cpp}
// (OpenUSD 26.11.1).
//
// The two AddValueKey overloads (requestBuilder.cpp:13-34) are one method
// that tells a UsdPrim provider from a UsdAttribute provider at run time.
// The Take* methods move their member out, leaving it empty, as std::move
// of the vector and the map leave them.

import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { ExecUsdValueKey } from 'typescript-usd/execUsd'
import { TF_VERIFY } from 'typescript-usd/tf'
import { Prim as UsdPrim, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import type { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
import { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
import { UsdExecImagingValueKey, UsdExecImaging_ValueKeyMapKey } from './valueKey.ts'
import { UsdExecImaging_ValueKeyMap } from './valueKeyMap.ts'

/**
 * This class implements UsdExecImagingRequestBuilderInterface by building up a
 * set of ExecUsdValueKeys and an associated mapping of value keys back to
 * indices (requestBuilder.h:24-83).
 *
 * The UsdExecImaging_Request constructs an instance of this object when it
 * (re)builds the exec request. For each discovered prim that has an adapter,
 * the request sets the current prim and adapter on this object, then passes
 * the builder to the adapter for it to add its value keys. Those value keys
 * are accumulated in the builder as well as metadata for each value key
 * (stored as an instance of UsdExecImaging_ValueKeyMap).
 */
export class UsdExecImaging_RequestBuilder extends UsdExecImagingRequestBuilderInterface {
  // Path to the prim currently being adapted.
  private _adaptedPrimPath = ''

  // The current prim adapter that is adding value keys.
  private _primAdapter: UsdExecImagingPrimAdapterInterface | null = null

  // The accumulated vector of value keys.
  private _valueKeys: ExecUsdValueKey[] = []

  // Additional information for each added value key, including which prim
  // adapter added which value key.
  private _valueKeyMap = new UsdExecImaging_ValueKeyMap()

  /** requestBuilder.cpp:13-21 (prim, computationName) and
   *  requestBuilder.cpp:23-34 (attribute). */
  addValueKey(providerPrim: UsdPrim, computationName: string): void
  addValueKey(providerAttribute: UsdAttribute): void
  addValueKey(provider: UsdPrim | UsdAttribute, computationName?: string): void {
    if (provider instanceof UsdPrim) {
      this._valueKeys.push(new ExecUsdValueKey(provider, computationName!))

      this._addValueKey(new UsdExecImagingValueKey(provider.path, computationName!))
      return
    }

    this._valueKeys.push(new ExecUsdValueKey(
      provider,
      ExecBuiltinComputations.computeValue))

    this._addValueKey(new UsdExecImagingValueKey(
      provider.getPath(),
      ExecBuiltinComputations.computeValue))
  }

  /** Records that subsequent calls to AddValueKey are from primAdapter
   *  which is adapting the given prim (requestBuilder.cpp:36-46). */
  setAdaptedPrim(prim: UsdPrim, primAdapter: UsdExecImagingPrimAdapterInterface): void {
    this._adaptedPrimPath = prim.path
    this._primAdapter = primAdapter
    const primToAdapterMap = this._valueKeyMap.primToAdapterMap
    const emplaced = !primToAdapterMap.has(this._adaptedPrimPath)
    if (emplaced) {
      primToAdapterMap.set(this._adaptedPrimPath, this._primAdapter)
    }
    TF_VERIFY(emplaced, 'emplaced')
  }

  /** Moves the vector of ExecUsdValueKeys out of this object
   *  (requestBuilder.cpp:48-52). */
  takeValueKeys(): ExecUsdValueKey[] {
    const valueKeys = this._valueKeys
    this._valueKeys = []
    return valueKeys
  }

  /** Moves the value key map out of this object (requestBuilder.cpp:54-58). */
  takeValueKeyMap(): UsdExecImaging_ValueKeyMap {
    const valueKeyMap = this._valueKeyMap
    this._valueKeyMap = new UsdExecImaging_ValueKeyMap()
    return valueKeyMap
  }

  /** requestBuilder.cpp:60-75 */
  private _addValueKey(valueKey: UsdExecImagingValueKey): void {
    // This method should be called after the ExecUsdValueKey has been inserted.
    if (!TF_VERIFY(this._valueKeys.length !== 0, '!_valueKeys.empty()')) {
      return
    }

    const valueKeyIndex = this._valueKeys.length - 1
    this._valueKeyMap.valueKeyToIndexMap.set(UsdExecImaging_ValueKeyMapKey(valueKey), valueKeyIndex)
    this._valueKeyMap.indexToValueKeyInfo.push({
      valueKey,
      adaptedPrimPath: this._adaptedPrimPath,
      // SetAdaptedPrim is called before an adapter adds value keys.
      primAdapter: this._primAdapter!,
    })
  }
}
