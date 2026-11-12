// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/requestBuilderInterface.cpp,
//  pxr/usdImaging/usdExecImaging/requestBuilderInterface.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/requestBuilderInterface.{h,cpp}
// (OpenUSD 26.11.1).
//
// The two AddValueKey overloads are one method dispatching on its arguments:
// (providerPrim, computationName) or (providerAttribute).

import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'

/**
 * Interface for building up an exec request within an implementation of
 * UsdExecImagingPrimAdapterInterface (requestBuilderInterface.h:21-43).
 */
export abstract class UsdExecImagingRequestBuilderInterface {
  /** The calling UsdExecImagingPrimAdapterInterface requires the computation of
   *  computationName provided by the prim providerPrim. */
  abstract addValueKey(providerPrim: UsdPrim, computationName: string): void
  /** The calling UsdExecImagingPrimAdapterInterface requires the computed value of
   *  providerAttribute. */
  abstract addValueKey(providerAttribute: UsdAttribute): void
}
