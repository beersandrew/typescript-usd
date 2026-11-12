// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/samplerObjectRegistry.cpp,
//  pxr/imaging/hdSt/samplerObjectRegistry.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/samplerObjectRegistry.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence (lifetime): see samplerObject.ts; GarbageCollect destroys the
// sampler objects whose owner released them.

import type { SamplerParameters as HdSamplerParameters } from 'typescript-usd/hd'
import { HdStTextureType } from './enums.ts'
import { HdStPtexTextureObject } from './ptexTextureObject.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStFieldSamplerObject,
  HdStPtexSamplerObject,
  HdStUdimSamplerObject,
  HdStUvSamplerObject,
  type HdStSamplerObject,
} from './samplerObject.ts'
import {
  HdStFieldTextureObject,
  HdStUvTextureObject,
  type HdStTextureObject,
} from './textureObject.ts'
import { HdStUdimTextureObject } from './udimTextureObject.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** samplerObjectRegistry.cpp:29-53 _MakeTypedSamplerObject<textureType>
 *  (the dynamic_cast to HdStTypedTextureObject<textureType>). */
function _MakeTypedSamplerObject(
  textureType: HdStTextureType,
  texture: HdStTextureObject,
  samplerParameters: HdSamplerParameters,
  samplerObjectRegistry: HdSt_SamplerObjectRegistry,
): HdStSamplerObject | null {
  switch (textureType) {
    case HdStTextureType.Uv:
    case HdStTextureType.Cubemap:
      if (texture instanceof HdStUvTextureObject) {
        return new HdStUvSamplerObject(texture, samplerParameters, samplerObjectRegistry)
      }
      break
    case HdStTextureType.Field:
      if (texture instanceof HdStFieldTextureObject) {
        return new HdStFieldSamplerObject(texture, samplerParameters, samplerObjectRegistry)
      }
      break
    case HdStTextureType.Ptex:
      if (texture instanceof HdStPtexTextureObject) {
        return new HdStPtexSamplerObject(texture, samplerParameters, samplerObjectRegistry)
      }
      break
    case HdStTextureType.Udim:
      if (texture instanceof HdStUdimTextureObject) {
        return new HdStUdimSamplerObject(texture, samplerParameters, samplerObjectRegistry)
      }
      break
  }
  TF_CODING_ERROR('Bad texture object')
  return null
}

/** samplerObjectRegistry.cpp:55-93 */
function _MakeSamplerObject(
  texture: HdStTextureObject,
  samplerParameters: HdSamplerParameters,
  samplerObjectRegistry: HdSt_SamplerObjectRegistry,
): HdStSamplerObject | null {
  switch (texture.getTextureType()) {
    case HdStTextureType.Uv:
    case HdStTextureType.Field:
    case HdStTextureType.Ptex:
    case HdStTextureType.Udim:
    case HdStTextureType.Cubemap:
      return _MakeTypedSamplerObject(texture.getTextureType(), texture,
        samplerParameters, samplerObjectRegistry)
  }

  TF_CODING_ERROR('Unsupported texture type')
  return null
}

/** samplerObjectRegistry.h:26-72. A simple registry for GPU samplers.
 *
 *  The registry makes no attempt at de-duplication. But construction is
 *  dispatched by texture type returing a matching sampler (e.g.,
 *  HdStFieldSamplerObject for a HdStFieldTextureObject or
 *  HdStPtexSamplerObject for the (not yet existing) HdStPtexTextureObject).
 *  Also, it keeps a shared pointer to a sampler around until garbage
 *  collection so that clients can safely drop their shared pointers from
 *  different threads. */
export class HdSt_SamplerObjectRegistry {
  private _samplerObjects: HdStSamplerObject[] = []
  private _garbageCollectionNeeded = false
  private readonly _resourceRegistry: HdStResourceRegistry

  /** samplerObjectRegistry.cpp:17-22 */
  constructor(registry: HdStResourceRegistry) {
    this._resourceRegistry = registry
  }

  /** samplerObjectRegistry.cpp:95-111. Create new Hgi sampler object
   *  matching the given texture object. */
  allocateSampler(
    texture: HdStTextureObject,
    samplerParameters: HdSamplerParameters,
  ): HdStSamplerObject | null {
    const result = _MakeSamplerObject(texture, samplerParameters, this)

    if (result) {
      // Record sampler object
      this._samplerObjects.push(result)
    }

    return result
  }

  /** samplerObjectRegistry.cpp:113-117. Marks that there is potential
   *  garbage that needs to be collected. */
  markGarbageCollectionNeeded(): void {
    this._garbageCollectionNeeded = true
  }

  /** samplerObjectRegistry.cpp:119-123. Get resource registry. */
  getResourceRegistry(): HdStResourceRegistry {
    return this._resourceRegistry
  }

  /** samplerObjectRegistry.cpp:125-154. Delete samplers no longer used by
   *  a client. */
  garbageCollect(): void {
    if (!this._garbageCollectionNeeded) {
      return
    }

    const kept: HdStSamplerObject[] = []
    for (const sampler of this._samplerObjects) {
      if (sampler._expired) {
        sampler._destroy()
      } else {
        kept.push(sampler)
      }
    }
    this._samplerObjects = kept

    this._garbageCollectionNeeded = false
  }
}
