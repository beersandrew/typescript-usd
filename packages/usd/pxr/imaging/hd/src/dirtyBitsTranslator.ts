// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dirtyBitsTranslator.cpp,
//  pxr/imaging/hd/dirtyBitsTranslator.h, pxr/imaging/hd/camera.h,
//  pxr/imaging/hd/coordSys.h, pxr/imaging/hd/extComputation.h,
//  pxr/imaging/hd/field.h, and 5 more cited below
// Copyright 2016, 2017, 2018, 2019, 2021, 2022, 2023 Pixar. Tomorrow Open
//  Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dirtyBitsTranslator.{h,cpp} (OpenUSD 26.11.1).
//
// A set of optimized functions for translating between dirty bits and data
// source locators for different prim types.
//
// Divergences:
// - Upstream HdDataSourceLocatorSet is kept sorted and normalized (no element
//   has a proper prefix in the set), which _FindLocator relies on. This port's
//   HdDataSourceLocatorSet is an insertion-ordered list, so the *LocatorSetTo
//   DirtyBits functions first build the sorted, normalized element list
//   (_SortedLocators) and then walk it exactly as upstream does.
// - The C++ `HdDirtyBits *bits` out-parameter of the custom translators is an
//   HdDirtyBitsRef holder; the `HdDataSourceLocatorSet *set` out-parameter is
//   the set object itself (a null set cannot be passed).
// - The sprim/bprim dirty-bit enums of camera.h, coordSys.h, light.h,
//   material.h, extComputation.h, imageShader.h, renderBuffer.h,
//   renderSettings.h and field.h are spelled locally below (values copied from
//   those headers) so this module reads nothing from other modules at
//   evaluation time; HdChangeTracker is read only inside functions because
//   changeTracker.ts imports this module.

import { HdChangeTracker } from './changeTracker.ts'
import type { HdDirtyBits } from './changeTracker.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdPrimTypeIsLight, HdPrimTypeTokens } from './tokens.ts'

import { HdBasisCurvesTopologySchema } from './basisCurvesTopologySchema.ts'
import { HdCameraSchema } from './cameraSchema.ts'
import { HdCapsuleSchema } from './capsuleSchema.ts'
import { HdCategoriesSchema } from './categoriesSchema.ts'
import { HdCollectionsSchema } from './collectionsSchema.ts'
import { HdConeSchema } from './coneSchema.ts'
import { HdCoordSysSchema, HdCoordSysSchemaTokens } from './coordSysSchema.ts'
import { HdCubeSchema } from './cubeSchema.ts'
import { HdCylinderSchema } from './cylinderSchema.ts'
import { HdDisplayFilterSchema } from './displayFilterSchema.ts'
import { HdEnergyFilterSchema } from './energyFilterSchema.ts'
import { HdExtComputationPrimvarsSchema } from './extComputationPrimvarsSchema.ts'
import { HdExtComputationSchema } from './extComputationSchema.ts'
import { HdExtentSchema } from './extentSchema.ts'
import { HdImageShaderSchema } from './imageShaderSchema.ts'
import { HdInstanceCategoriesSchema } from './instanceCategoriesSchema.ts'
import { HdInstancedBySchema } from './instancedBySchema.ts'
import { HdInstancerTopologySchema } from './instancerTopologySchema.ts'
import { HdIntegratorSchema } from './integratorSchema.ts'
import { HdLegacyDisplayStyleSchema } from './legacyDisplayStyleSchema.ts'
import { HdLegacyTaskSchema } from './legacyTaskSchema.ts'
import { HdLightSchema } from './lightSchema.ts'
import { HdMaterialBindingsSchema } from './materialBindingsSchema.ts'
import { HdMaterialSchema, HdMaterialSchemaTokens } from './materialSchema.ts'
import { HdMeshSchema } from './meshSchema.ts'
import { HdMeshTopologySchema } from './meshTopologySchema.ts'
import { HdPrimIdSchema } from './primIdSchema.ts'
import { HdPrimvarsSchema } from './primvarsSchema.ts'
import { HdPurposeSchema } from './purposeSchema.ts'
import { HdRenderBufferSchema } from './renderBufferSchema.ts'
import { HdRenderSettingsSchema } from './renderSettingsSchema.ts'
import { HdSampleFilterSchema } from './sampleFilterSchema.ts'
import { HdSphereSchema } from './sphereSchema.ts'
import { HdSubdivisionTagsSchema } from './subdivisionTagsSchema.ts'
import { HdVisibilitySchema } from './visibilitySchema.ts'
import { HdVolumeFieldBindingSchema } from './volumeFieldBindingSchema.ts'
import { HdVolumeFieldSchema } from './volumeFieldSchema.ts'
import { HdXformSchema } from './xformSchema.ts'

// Mutable holder mirroring upstream's `HdDirtyBits *bits` out-parameter.
export interface HdDirtyBitsRef {
  value: HdDirtyBits
}

/** dirtyBitsTranslator.h:47-48 */
export type LocatorSetToDirtyBitsFnc =
  (set: HdDataSourceLocatorSet, bits: HdDirtyBitsRef) => void

/** dirtyBitsTranslator.h:50-51 */
export type DirtyBitsToLocatorSetFnc =
  (bits: HdDirtyBits, set: HdDataSourceLocatorSet) => void

// ---- Sprim / bprim dirty bits (enum DirtyBits of the named headers) ----

/** material.h HdMaterial::DirtyBits */
const _HdMaterial = {
  DirtyParams: 1 << 2, DirtyResource: 1 << 3, DirtySurface: 1 << 4,
  DirtyDisplacement: 1 << 5, DirtyVolume: 1 << 6,
  AllDirty: (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6),
} as const
/** coordSys.h HdCoordSys::DirtyBits */
const _HdCoordSys = {
  DirtyName: 1 << 0, DirtyTransform: 1 << 1, AllDirty: (1 << 0) | (1 << 1),
} as const
/** camera.h HdCamera::DirtyBits */
const _HdCamera = {
  DirtyTransform: 1 << 0, DirtyParams: 1 << 1, DirtyClipPlanes: 1 << 2,
  DirtyWindowPolicy: 1 << 3,
  AllDirty: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3),
} as const
/** light.h HdLight::DirtyBits */
const _HdLight = {
  DirtyTransform: 1 << 0, DirtyParams: 1 << 1, DirtyShadowParams: 1 << 2,
  DirtyCollection: 1 << 3, DirtyResource: 1 << 4, DirtyInstancer: 1 << 16,
  AllDirty: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 16),
} as const
/** extComputation.h HdExtComputation::DirtyBits */
const _HdExtComputation = {
  DirtyInputDesc: 1 << 0, DirtyOutputDesc: 1 << 1, DirtyElementCount: 1 << 2,
  DirtySceneInput: 1 << 3, DirtyCompInput: 1 << 4, DirtyKernel: 1 << 5,
  DirtyDispatchCount: 1 << 6,
} as const
/** imageShader.h HdImageShader::DirtyBits */
const _HdImageShader = {
  DirtyEnabled: 1 << 0, DirtyPriority: 1 << 1, DirtyFilePath: 1 << 2,
  DirtyConstants: 1 << 3, DirtyMaterialNetwork: 1 << 4,
  AllDirty: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
} as const
/** renderBuffer.h HdRenderBuffer::DirtyBits */
const _HdRenderBuffer = { DirtyDescription: 1 << 0 } as const
/** renderSettings.h HdRenderSettings::DirtyBits */
const _HdRenderSettings = {
  DirtyActive: 1 << 1, DirtyNamespacedSettings: 1 << 2,
  DirtyRenderProducts: 1 << 3, DirtyIncludedPurposes: 1 << 4,
  DirtyMaterialBindingPurposes: 1 << 5, DirtyRenderingColorSpace: 1 << 6,
  DirtyUnionedSamplingInterval: 1 << 7, DirtyFrameNumber: 1 << 8,
  DirtyCamera: 1 << 9, DirtyDisableDepthOfField: 1 << 10,
  DirtyDisableMotionBlur: 1 << 11,
} as const
/** field.h HdField::DirtyBits */
const _HdField = { DirtyTransform: 1 << 0, DirtyParams: 1 << 1 } as const

/** dataSourceLegacyPrim.cpp:93-98 HdLegacyPrimTypeIsVolumeField, spelled
 * locally (the HdLegacyPrimTypeTokens values) so this module does not pull the
 * dataSourceLegacyPrim.ts module graph into the changeTracker.ts import cycle. */
function HdLegacyPrimTypeIsVolumeField(primType: string): boolean {
  return primType === 'openvdbAsset' || primType === 'field3dAsset'
}

// dirtyBitsTranslator.cpp:77-86
const Hd_SPrimSToBFncs = new Map<string, LocatorSetToDirtyBitsFnc>()
const Hd_SPrimBToSFncs = new Map<string, DirtyBitsToLocatorSetFnc>()
const Hd_RPrimSToBFncs = new Map<string, LocatorSetToDirtyBitsFnc>()
const Hd_RPrimBToSFncs = new Map<string, DirtyBitsToLocatorSetFnc>()

// dirtyBitsTranslator.cpp:88-101
let _customBitsLocator: HdDataSourceLocator | undefined
function _GetCustomBitsLocator(): HdDataSourceLocator {
  return _customBitsLocator ??= new HdDataSourceLocator('__customBits')
}
function _GetCustomBitLocator(i: number): HdDataSourceLocator {
  return _GetCustomBitsLocator().append(String(i))
}

// Lazily built locators that upstream keeps in function-local statics.
let _coordSysNameLocator: HdDataSourceLocator | undefined
function _GetCoordSysNameLocator(): HdDataSourceLocator {
  return _coordSysNameLocator ??=
    HdCoordSysSchema.getDefaultLocator().append(HdCoordSysSchemaTokens.name)
}
let _drawTargetLocator: HdDataSourceLocator | undefined
function _GetDrawTargetLocator(): HdDataSourceLocator {
  return _drawTargetLocator ??= new HdDataSourceLocator(HdPrimTypeTokens.drawTarget)
}
const _energyFilterLpe = 'ri:energyFilter:lpe'
const _energyFilterEnabled = 'ri:energyFilter:enabled'
const _energyFilterOrder = 'ri:energyFilter:order'

// ---- Locator ordering (dataSourceLocator.cpp operator<, TfToken operator<) ----

function _TokenLess(a: string, b: string): boolean {
  return a !== b && a < b
}

/** HdDataSourceLocator::operator< : lexicographic over the elements. */
function _LocatorLess(a: HdDataSourceLocator, b: HdDataSourceLocator): boolean {
  const n = Math.min(a.getElementCount(), b.getElementCount())
  for (let i = 0; i < n; i++) {
    const ea = a.getElement(i)
    const eb = b.getElement(i)
    if (_TokenLess(ea, eb)) return true
    if (_TokenLess(eb, ea)) return false
  }
  return a.getElementCount() < b.getElementCount()
}

/** The element order of an upstream (sorted, normalized) HdDataSourceLocatorSet:
 * sorted by operator< and without elements that have a prefix in the set
 * (dataSourceLocator.cpp HdDataSourceLocatorSet::_Normalize). */
function _SortedLocators(set: HdDataSourceLocatorSet): HdDataSourceLocator[] {
  const sorted = [...set].sort((a, b) =>
    _LocatorLess(a, b) ? -1 : _LocatorLess(b, a) ? 1 : 0)
  const result: HdDataSourceLocator[] = []
  for (const l of sorted) {
    const last = result[result.length - 1]
    if (last && l.hasPrefix(last)) continue
    result.push(l)
  }
  return result
}

/** Iterator over a sorted locator list (the C++ const_iterator). */
class _It {
  i = 0
  constructor(readonly items: readonly HdDataSourceLocator[]) {}
  AtEnd(): boolean { return this.i >= this.items.length }
  Get(): HdDataSourceLocator { return this.items[this.i]! }
}

/** dirtyBitsTranslator.cpp:545-583 */
function _FindLocator(
  locator: HdDataSourceLocator, it: _It, advanceToNext = true,
): boolean {
  if (it.AtEnd()) return false

  // Check for a universal locator set.  If we find it we never want
  // to advance regardless of advanceToNext.
  if (it.Get().getElementCount() === 0) return true

  // The range between *it and end can be divided into:
  // 1.) items < locator and not a prefix.
  // 2.) items < locator and a prefix.
  // 3.) locator
  // 4.) items > locator and a suffix.
  // 5.) items > locator and not a suffix.

  // We want to return true if sets [2-4] are nonempty.
  // If (advanceToNext) is true, we leave it pointing at the first element
  // of 5; otherwise, we leave it pointing at the first element of [2-4].
  let found = false
  for (; !it.AtEnd(); ++it.i) {
    if (it.Get().intersects(locator)) {
      found = true
      if (!advanceToNext) break
    } else if (_LocatorLess(locator, it.Get())) {
      break
    }
  }
  return found
}

function _IsEmptyLocator(l: HdDataSourceLocator): boolean {
  return l.getElementCount() === 0
}

export class HdDirtyBitsTranslator {
  // ----- Dirty bits to locators. -----

  /** dirtyBitsTranslator.cpp:103-262 */
  static rprimDirtyBitsToLocatorSet(
    primType: string, bits: HdDirtyBits, set: HdDataSourceLocatorSet,
  ): void {
    const T = HdChangeTracker
    if (bits === T.AllDirty) {
      set.add(HdDataSourceLocator.EmptyLocator)
      return
    }

    // To minimize the cost of building the locator set, we append to the set
    // in the locator-defined order. If you add to this function, make sure
    // you sort the addition by locator name, so as not to slow down append.
    // Also note, this should match RprimLocatorSetToDirtyBits.

    if (primType === HdPrimTypeTokens.basisCurves) {
      if (bits & T.DirtyTopology) {
        set.add(HdBasisCurvesTopologySchema.getDefaultLocator())
      }
    }

    if (primType === HdPrimTypeTokens.capsule) {
      if (bits & T.DirtyPrimvar) set.add(HdCapsuleSchema.getDefaultLocator())
    }

    if (bits & T.DirtyCategories) set.add(HdCategoriesSchema.getDefaultLocator())

    if (primType === HdPrimTypeTokens.cone) {
      if (bits & T.DirtyPrimvar) set.add(HdConeSchema.getDefaultLocator())
    }

    if (primType === HdPrimTypeTokens.cube) {
      if (bits & T.DirtyPrimvar) set.add(HdCubeSchema.getDefaultLocator())
    }

    if (primType === HdPrimTypeTokens.cylinder) {
      if (bits & T.DirtyPrimvar) set.add(HdCylinderSchema.getDefaultLocator())
    }

    if (bits & T.DirtyDisplayStyle) {
      set.add(HdLegacyDisplayStyleSchema.getDefaultLocator())
    } else {
      if (bits & T.DirtyCullStyle) {
        set.add(HdLegacyDisplayStyleSchema.getCullStyleLocator())
      }
      if (bits & T.DirtyRepr) {
        set.add(HdLegacyDisplayStyleSchema.getReprSelectorLocator())
      }
    }

    if (bits & T.DirtyExtent) set.add(HdExtentSchema.getDefaultLocator())

    if (bits & T.DirtyPrimvar) {
      set.add(HdExtComputationPrimvarsSchema.getDefaultLocator())
    }

    if (bits & T.DirtyInstancer) set.add(HdInstancedBySchema.getDefaultLocator())

    if (bits & T.DirtyInstanceIndex) {
      set.add(HdInstancerTopologySchema.getDefaultLocator())
    }

    if (bits & T.DirtyMaterialId) {
      set.add(HdMaterialBindingsSchema.getDefaultLocator())
    }

    if (primType === HdPrimTypeTokens.mesh) {
      if (bits & T.DirtyDoubleSided) set.add(HdMeshSchema.getDoubleSidedLocator())
      if (bits & T.DirtyTopology) set.add(HdMeshSchema.getSubdivisionSchemeLocator())
      if (bits & T.DirtySubdivTags) set.add(HdSubdivisionTagsSchema.getDefaultLocator())
      if (bits & T.DirtyTopology) set.add(HdMeshTopologySchema.getDefaultLocator())
    }

    if (bits & T.DirtyPrimID) set.add(HdPrimIdSchema.getDefaultLocator())

    if (bits & T.DirtyPrimvar) {
      set.add(HdPrimvarsSchema.getDefaultLocator())
    } else {
      if (bits & T.DirtyNormals) set.add(HdPrimvarsSchema.getNormalsLocator())
      if (bits & T.DirtyPoints) set.add(HdPrimvarsSchema.getPointsLocator())
      if (bits & T.DirtyWidths) set.add(HdPrimvarsSchema.getWidthsLocator())
    }

    if (bits & T.DirtyRenderTag) set.add(HdPurposeSchema.getDefaultLocator())

    if (primType === HdPrimTypeTokens.sphere) {
      if (bits & T.DirtyPrimvar) set.add(HdSphereSchema.getDefaultLocator())
    }

    if (bits & T.DirtyVisibility) set.add(HdVisibilitySchema.getDefaultLocator())

    if (bits & T.DirtyVolumeField) {
      set.add(HdVolumeFieldBindingSchema.getDefaultLocator())
    }

    if (bits & T.DirtyTransform) set.add(HdXformSchema.getDefaultLocator())

    if (bits & T.CustomBitsMask) {
      for (let i = 0, bit = T.CustomBitsBegin; bit <= T.CustomBitsEnd; bit *= 2, i++) {
        if (bits & bit) set.add(_GetCustomBitLocator(i))
      }
    }

    // call custom handler registered for this type
    Hd_RPrimBToSFncs.get(primType)?.(bits, set)
  }

  /** dirtyBitsTranslator.cpp:264-417 */
  static sprimDirtyBitsToLocatorSet(
    primType: string, bits: HdDirtyBits, set: HdDataSourceLocatorSet,
  ): void {
    const T = HdChangeTracker

    // To minimize the cost of building the locator set, we append to the set
    // in the locator-defined order. If you add to this function, make sure
    // you sort the addition by locator name, so as not to slow down append.
    // Also note, this should match SprimLocatorSetToDirtyBits.

    if (primType === HdPrimTypeTokens.material) {
      if (bits & _HdMaterial.AllDirty) set.add(HdMaterialSchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.coordSys) {
      if (bits & _HdCoordSys.DirtyName) set.add(_GetCoordSysNameLocator())
      if (bits & _HdCoordSys.DirtyTransform) set.add(HdXformSchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.camera) {
      if (bits & (_HdCamera.DirtyParams | _HdCamera.DirtyClipPlanes |
                  _HdCamera.DirtyWindowPolicy)) {
        set.add(HdCameraSchema.getDefaultLocator())
      }
      if (bits & _HdCamera.DirtyTransform) set.add(HdXformSchema.getDefaultLocator())
    } else if (HdPrimTypeIsLight(primType)
        // Lights and light filters are handled similarly in emulation.
        || primType === HdPrimTypeTokens.lightFilter
        // special case for mesh lights coming from emulated scene
        // for which the type will be mesh even though we are receiving
        // sprim-specific dirty bits.
        // NOTE: The absence of this would still work but would
        //       over-invalidate since the fallback value is "".
        || primType === HdPrimTypeTokens.mesh) {
      if (bits & (_HdLight.DirtyParams | _HdLight.DirtyShadowParams |
                  _HdLight.DirtyCollection)) {
        set.add(HdLightSchema.getDefaultLocator())
      }
      if (bits & _HdLight.DirtyResource) set.add(HdMaterialSchema.getDefaultLocator())
      if (bits & _HdLight.DirtyParams) {
        // for mesh lights, don't want changing light parameters to trigger
        // mesh primvar updates.
        if (primType !== HdPrimTypeTokens.mesh) {
          set.add(HdPrimvarsSchema.getDefaultLocator())
        }
        set.add(HdVisibilitySchema.getDefaultLocator())

        // Invalidate collections manufactured for light linking in
        // emulation.
        set.add(HdCollectionsSchema.getDefaultLocator())
      }
      if (bits & _HdLight.DirtyTransform) set.add(HdXformSchema.getDefaultLocator())
      if (bits & _HdLight.DirtyInstancer) set.add(HdInstancedBySchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.drawTarget) {
      if (bits) set.add(_GetDrawTargetLocator())
    } else if (primType === HdPrimTypeTokens.extComputation) {
      if (bits & _HdExtComputation.DirtyDispatchCount) {
        set.add(HdExtComputationSchema.getDispatchCountLocator())
      }
      if (bits & _HdExtComputation.DirtyElementCount) {
        set.add(HdExtComputationSchema.getElementCountLocator())
      }
      if (bits & _HdExtComputation.DirtyKernel) {
        set.add(HdExtComputationSchema.getGlslKernelLocator())
      }
      if (bits & (_HdExtComputation.DirtyInputDesc |
                  _HdExtComputation.DirtySceneInput)) {
        set.add(HdExtComputationSchema.getInputComputationsLocator())
        set.add(HdExtComputationSchema.getInputValuesLocator())
      }
      if (bits & _HdExtComputation.DirtyOutputDesc) {
        set.add(HdExtComputationSchema.getOutputsLocator())
      }
    } else if (primType === HdPrimTypeTokens.integrator) {
      if (bits & T.DirtyParams) set.add(HdIntegratorSchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.sampleFilter) {
      if (bits & T.DirtyParams) set.add(HdSampleFilterSchema.getDefaultLocator())
      if (bits & T.DirtyVisibility) set.add(HdVisibilitySchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.displayFilter) {
      if (bits & T.DirtyParams) set.add(HdDisplayFilterSchema.getDefaultLocator())
      if (bits & T.DirtyVisibility) set.add(HdVisibilitySchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.energyFilter) {
      if (bits & T.DirtyParams) {
        set.add(HdEnergyFilterSchema.getDefaultLocator())
        set.add(new HdDataSourceLocator(_energyFilterLpe))
        set.add(new HdDataSourceLocator(_energyFilterEnabled))
        set.add(new HdDataSourceLocator(_energyFilterOrder))
      }
      if (bits & T.DirtyVisibility) set.add(HdVisibilitySchema.getDefaultLocator())
    } else if (primType === HdPrimTypeTokens.imageShader) {
      if (bits & _HdImageShader.DirtyEnabled) {
        set.add(HdImageShaderSchema.getEnabledLocator())
      }
      if (bits & _HdImageShader.DirtyPriority) {
        set.add(HdImageShaderSchema.getPriorityLocator())
      }
      if (bits & _HdImageShader.DirtyFilePath) {
        set.add(HdImageShaderSchema.getFilePathLocator())
      }
      if (bits & _HdImageShader.DirtyConstants) {
        set.add(HdImageShaderSchema.getConstantsLocator())
      }
      if (bits & _HdImageShader.DirtyMaterialNetwork) {
        set.add(HdImageShaderSchema.getMaterialNetworkLocator())
      }
    } else {
      const fnc = Hd_SPrimBToSFncs.get(primType)
      if (fnc === undefined) {
        // unknown prim type, use AllDirty for anything
        if (bits) set.add(new HdDataSourceLocator())
      } else {
        // call custom handler registered for this type
        fnc(bits, set)
      }
    }
  }

  /** dirtyBitsTranslator.cpp:419-461 */
  static instancerDirtyBitsToLocatorSet(
    _primType: string, bits: HdDirtyBits, set: HdDataSourceLocatorSet,
  ): void {
    const T = HdChangeTracker

    // To minimize the cost of building the locator set, we append to the set
    // in the locator-defined order. If you add to this function, make sure
    // you sort the addition by locator name, so as not to slow down append.
    // Also note, this should match InstancerLocatorSetToDirtyBits.

    if (bits === T.AllDirty) {
      set.add(HdDataSourceLocator.EmptyLocator)
      return
    }

    if (bits & T.DirtyInstancer) set.add(HdInstancedBySchema.getDefaultLocator())
    if (bits & T.DirtyInstanceIndex) {
      set.add(HdInstancerTopologySchema.getDefaultLocator())
    }
    if (bits & T.DirtyPrimvar) set.add(HdPrimvarsSchema.getDefaultLocator())
    if (bits & T.DirtyVisibility) set.add(HdVisibilitySchema.getDefaultLocator())
    if (bits & T.DirtyTransform) set.add(HdXformSchema.getDefaultLocator())
    if (bits & T.DirtyCategories) {
      // Note: We don't have a DirtyInstanceCategories bit.
      // For point instancers, instance categories is not relevant (i.e. all
      // instances are affected), so we invalidate both categories and
      // instanceCategories locators.
      set.add(HdInstanceCategoriesSchema.getDefaultLocator())
      set.add(HdCategoriesSchema.getDefaultLocator())
    }
  }

  /** dirtyBitsTranslator.cpp:463-521 */
  static bprimDirtyBitsToLocatorSet(
    primType: string, bits: HdDirtyBits, set: HdDataSourceLocatorSet,
  ): void {
    // To minimize the cost of building the locator set, we append to the set
    // in the locator-defined order. If you add to this function, make sure
    // you sort the addition by locator name, so as not to slow down append.
    // Also note, this should match BprimLocatorSetToDirtyBits.

    if (primType === HdPrimTypeTokens.renderBuffer) {
      if (bits & _HdRenderBuffer.DirtyDescription) {
        set.add(HdRenderBufferSchema.getDefaultLocator())
      }
    } else if (primType === HdPrimTypeTokens.renderSettings) {
      const S = HdRenderSettingsSchema
      const R = _HdRenderSettings
      if (bits & R.DirtyActive) set.add(S.getActiveLocator())
      if (bits & R.DirtyCamera) set.add(S.getCameraLocator())
      if (bits & R.DirtyDisableDepthOfField) set.add(S.getDisableDepthOfFieldLocator())
      if (bits & R.DirtyDisableMotionBlur) set.add(S.getDisableMotionBlurLocator())
      if (bits & R.DirtyFrameNumber) set.add(S.getFrameLocator())
      if (bits & R.DirtyIncludedPurposes) set.add(S.getIncludedPurposesLocator())
      if (bits & R.DirtyMaterialBindingPurposes) {
        set.add(S.getMaterialBindingPurposesLocator())
      }
      if (bits & R.DirtyNamespacedSettings) set.add(S.getNamespacedSettingsLocator())
      if (bits & R.DirtyRenderProducts) set.add(S.getRenderProductsLocator())
      if (bits & R.DirtyRenderingColorSpace) set.add(S.getRenderingColorSpaceLocator())
      if (bits & R.DirtyUnionedSamplingInterval) {
        set.add(S.getUnionedSamplingIntervalLocator())
      }
    } else if (HdLegacyPrimTypeIsVolumeField(primType)) {
      if (bits & _HdField.DirtyParams) set.add(HdVolumeFieldSchema.getDefaultLocator())
      // XXX: DirtyTransform seems unused...
    }
  }

  /** dirtyBitsTranslator.cpp:523-541 */
  static taskDirtyBitsToLocatorSet(bits: HdDirtyBits, set: HdDataSourceLocatorSet): void {
    const T = HdChangeTracker
    if (bits & T.DirtyCollection) set.add(HdLegacyTaskSchema.getCollectionLocator())
    if (bits & T.DirtyParams) set.add(HdLegacyTaskSchema.getParametersLocator())
    if (bits & T.DirtyRenderTags) set.add(HdLegacyTaskSchema.getRenderTagsLocator())
  }

  // ----- Locators to dirty bits. -----

  /** dirtyBitsTranslator.cpp:585-901 */
  static rprimLocatorSetToDirtyBits(
    primType: string, set: HdDataSourceLocatorSet,
  ): HdDirtyBits {
    const T = HdChangeTracker
    const it = new _It(_SortedLocators(set))

    if (it.AtEnd()) return T.Clean

    // If the empty locator is in the set, there shouldn't be any other elements
    // in the set...
    if (_IsEmptyLocator(it.Get())) return T.AllDirty

    let bits: HdDirtyBits = T.Clean

    // (*) Attention: the _FindLocator calls below are sorted by locator name
    // (see dirtyBitsTranslator.cpp:605-620).

    // Locator (*): __customBits
    if (_FindLocator(_GetCustomBitsLocator(), it, false)) {
      if (_GetCustomBitsLocator().Equals(it.Get())) {
        bits |= T.CustomBitsMask
      } else {
        for (let i = 0, bit = T.CustomBitsBegin; bit <= T.CustomBitsEnd; bit *= 2, i++) {
          // Locator (*): __customBits > 0 ... __customBits > 6
          // where 0 <= i < 7, so lexicographic order of tokens is correct.
          if (_FindLocator(_GetCustomBitLocator(i), it)) bits |= bit
        }
      }
    }

    if (primType === HdPrimTypeTokens.basisCurves) {
      // Locator (*): basisCurves > topology
      if (_FindLocator(HdBasisCurvesTopologySchema.getDefaultLocator(), it)) {
        bits |= T.DirtyTopology
      }
    }

    if (primType === HdPrimTypeTokens.capsule) {
      // Locator (*): capsule
      if (_FindLocator(HdCapsuleSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    }

    // Locator (*): categories
    if (_FindLocator(HdCategoriesSchema.getDefaultLocator(), it)) bits |= T.DirtyCategories

    if (primType === HdPrimTypeTokens.cone) {
      // Locator (*): cone
      if (_FindLocator(HdConeSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    }

    if (primType === HdPrimTypeTokens.cube) {
      // Locator (*): cube
      if (_FindLocator(HdCubeSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    }

    if (primType === HdPrimTypeTokens.cylinder) {
      // Locator (*): cylinder
      if (_FindLocator(HdCylinderSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    }

    // Locator (*): displayStyle (dirtyBitsTranslator.cpp:686-764)
    {
      const Schema = HdLegacyDisplayStyleSchema
      if (_FindLocator(Schema.getDefaultLocator(), it, false)) {
        if (Schema.getDefaultLocator().hasPrefix(it.Get())) {
          bits |= T.DirtyDisplayStyle | T.DirtyCullStyle | T.DirtyRepr
        } else {
          if (_FindLocator(Schema.getCullStyleLocator(), it)) bits |= T.DirtyCullStyle
          if (_FindLocator(Schema.getDisplacementEnabledLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getDisplayInOverlayLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getFlatShadingEnabledLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getMaterialIsFinalLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getOccludedSelectionShowsThroughLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getPointsShadingEnabledLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getRefineLevelLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
          if (_FindLocator(Schema.getReprSelectorLocator(), it)) bits |= T.DirtyRepr
          if (_FindLocator(Schema.getShadingStyleLocator(), it)) {
            bits |= T.DirtyDisplayStyle
          }
        }
      }
    }

    // Locator (*): extent
    if (_FindLocator(HdExtentSchema.getDefaultLocator(), it)) bits |= T.DirtyExtent

    // Locator (*): extComputationPrimvars
    if (_FindLocator(HdExtComputationPrimvarsSchema.getDefaultLocator(), it)) {
      bits |= T.DirtyPrimvar
    }

    // Locator (*): instancedBySchema
    if (_FindLocator(HdInstancedBySchema.getDefaultLocator(), it)) bits |= T.DirtyInstancer

    // Locator (*): instancerToplogySchema
    if (_FindLocator(HdInstancerTopologySchema.getDefaultLocator(), it)) {
      bits |= T.DirtyInstanceIndex
    }

    // Locator (*): materialBindingSchema
    if (_FindLocator(HdMaterialBindingsSchema.getDefaultLocator(), it)) {
      bits |= T.DirtyMaterialId
    }

    if (primType === HdPrimTypeTokens.mesh) {
      // Locator (*): mesh > doubleSided
      if (_FindLocator(HdMeshSchema.getDoubleSidedLocator(), it)) bits |= T.DirtyDoubleSided
      // Locator (*): mesh > subdivisionScheme
      if (_FindLocator(HdMeshSchema.getSubdivisionSchemeLocator(), it)) {
        bits |= T.DirtyTopology
      }
      // Locator (*): mesh > subdivisionTags
      if (_FindLocator(HdMeshSchema.getSubdivisionTagsLocator(), it)) {
        bits |= T.DirtySubdivTags
      }
      // Locator (*): mesh > topology
      if (_FindLocator(HdMeshTopologySchema.getDefaultLocator(), it)) bits |= T.DirtyTopology
    }

    // Locator (*): primId
    if (_FindLocator(HdPrimIdSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimID

    // Locator (*): primvars
    if (_FindLocator(HdPrimvarsSchema.getDefaultLocator(), it, false)) {
      // NOTE: this potentially over-invalidates; "primvars" will map to
      // DirtyPrimvar | DirtyPoints.  Importantly, we make sure that
      // "primvars/points" only maps to DirtyPoints, rather than DirtyPrimvar.
      if (HdPrimvarsSchema.getDefaultLocator().hasPrefix(it.Get())) {
        bits |= T.DirtyPrimvar | T.DirtyNormals | T.DirtyPoints | T.DirtyWidths
      } else {
        do {
          const l = it.Get()
          if (l.hasPrefix(HdPrimvarsSchema.getNormalsLocator())) {
            bits |= T.DirtyNormals
          } else if (l.hasPrefix(HdPrimvarsSchema.getPointsLocator())) {
            bits |= T.DirtyPoints
          } else if (l.hasPrefix(HdPrimvarsSchema.getWidthsLocator())) {
            bits |= T.DirtyWidths
          } else {
            bits |= T.DirtyPrimvar
          }
          ++it.i
        } while (!it.AtEnd() && it.Get().intersects(HdPrimvarsSchema.getDefaultLocator()))
      }
    }

    // Locator (*): purpose
    if (_FindLocator(HdPurposeSchema.getDefaultLocator(), it)) bits |= T.DirtyRenderTag

    if (primType === HdPrimTypeTokens.sphere) {
      // Locator (*): sphere
      if (_FindLocator(HdSphereSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    }

    // Locator (*): visibility
    if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) bits |= T.DirtyVisibility

    // Locator (*): volumeFieldBinding
    if (_FindLocator(HdVolumeFieldBindingSchema.getDefaultLocator(), it)) {
      bits |= T.DirtyVolumeField
    }

    // Locator (*): xform
    if (_FindLocator(HdXformSchema.getDefaultLocator(), it)) bits |= T.DirtyTransform

    const fnc = Hd_RPrimSToBFncs.get(primType)
    if (fnc) {
      // call custom handler registered for this type
      const ref: HdDirtyBitsRef = { value: bits }
      fnc(set, ref)
      bits = ref.value
    }
    return bits
  }

  /** dirtyBitsTranslator.cpp:903-1155 */
  static sprimLocatorSetToDirtyBits(
    primType: string, set: HdDataSourceLocatorSet,
    renderContexts: readonly string[] = [],
  ): HdDirtyBits {
    const T = HdChangeTracker
    const sorted = _SortedLocators(set)
    const it = new _It(sorted)

    if (it.AtEnd()) return T.Clean

    let bits: HdDirtyBits = T.Clean

    // Note, for efficiency we search for locators in the set in order, so that
    // we only end up making one trip through the set. If you add to this
    // function, make sure you sort the addition by locator name, or
    // _FindLocator won't work.
    // Also note, this should match SprimDirtyBitsToLocatorSet.
    // Additionally, since Sprim's define their own dirty bit enum, we need to
    // explicitly translate the empty locator to the appropriate value below.

    if (primType === HdPrimTypeTokens.material) {
      if (_IsEmptyLocator(it.Get())) return _HdMaterial.AllDirty

      if (_FindLocator(HdMaterialSchema.getDefaultLocator(), it)) {
        bits |= _HdMaterial.DirtyParams | _HdMaterial.DirtyResource
        const materialLocator = HdMaterialSchema.getDefaultLocator()
        for (const locator of sorted) {
          if (locator.Equals(materialLocator)) {
            bits |= _HdMaterial.AllDirty
          } else {
            const terminal = HdMaterialSchema.getLocatorTerminal(locator, renderContexts)
            if (terminal === HdMaterialSchemaTokens.surface) {
              bits |= _HdMaterial.DirtySurface
            } else if (terminal === HdMaterialSchemaTokens.displacement) {
              bits |= _HdMaterial.DirtyDisplacement
            } else if (terminal === HdMaterialSchemaTokens.volume) {
              bits |= _HdMaterial.DirtyVolume
            } else {
              // There is no specific terminal mentioned,
              // so consider the entire material dirty.
              // This can happen, for example, when a
              // material/{renderContext} locator is invalidated.
              bits |= _HdMaterial.AllDirty
            }
          }
        }
      }
    } else if (primType === HdPrimTypeTokens.coordSys) {
      if (_IsEmptyLocator(it.Get())) return _HdCoordSys.AllDirty

      if (_FindLocator(_GetCoordSysNameLocator(), it)) bits |= _HdCoordSys.DirtyName
      if (_FindLocator(HdXformSchema.getDefaultLocator(), it)) {
        bits |= _HdCoordSys.DirtyTransform
      }
    } else if (primType === HdPrimTypeTokens.camera) {
      if (_IsEmptyLocator(it.Get())) return _HdCamera.AllDirty

      if (_FindLocator(HdCameraSchema.getDefaultLocator(), it)) {
        bits |= _HdCamera.DirtyWindowPolicy | _HdCamera.DirtyClipPlanes |
          _HdCamera.DirtyParams
      }
      if (_FindLocator(HdXformSchema.getDefaultLocator(), it)) {
        bits |= _HdCamera.DirtyTransform
      }
    } else if (HdPrimTypeIsLight(primType)
        // Lights and light filters are handled similarly in emulation.
        || primType === HdPrimTypeTokens.lightFilter) {
      if (_IsEmptyLocator(it.Get())) return _HdLight.AllDirty

      if (_FindLocator(HdInstancedBySchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyInstancer
      }
      if (_FindLocator(HdLightSchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyParams | _HdLight.DirtyResource |
          _HdLight.DirtyShadowParams | _HdLight.DirtyCollection
      }
      if (_FindLocator(HdMaterialSchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyResource
      }
      if (_FindLocator(HdPrimvarsSchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyParams
      }
      if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyParams
      }
      if (_FindLocator(HdXformSchema.getDefaultLocator(), it)) {
        bits |= _HdLight.DirtyTransform
      }
    } else if (primType === HdPrimTypeTokens.drawTarget) {
      // The clause below also handles the case where the locator is
      // the empty locator.
      if (_FindLocator(_GetDrawTargetLocator(), it)) {
        // XXX: We cannot use HdChangeTracker::AllDirty here (see
        // dirtyBitsTranslator.cpp:1023-1028).
        bits |= T.AllSceneDirtyBits
      }
    } else if (primType === HdPrimTypeTokens.extComputation) {
      // The clause below also handles the case where the locator is
      // the empty locator.
      const S = HdExtComputationSchema
      const E = _HdExtComputation
      if (_FindLocator(S.getDefaultLocator(), it, false)) {
        if (S.getDefaultLocator().hasPrefix(it.Get())) {
          bits |= E.DirtyDispatchCount | E.DirtyElementCount | E.DirtyKernel |
            E.DirtyInputDesc | E.DirtySceneInput | E.DirtyOutputDesc
        } else {
          do {
            const l = it.Get()
            if (l.hasPrefix(S.getDispatchCountLocator())) bits |= E.DirtyDispatchCount
            if (l.hasPrefix(S.getElementCountLocator())) bits |= E.DirtyElementCount
            if (l.hasPrefix(S.getGlslKernelLocator())) bits |= E.DirtyKernel
            if (l.hasPrefix(S.getInputValuesLocator()) ||
                l.hasPrefix(S.getInputComputationsLocator())) {
              bits |= E.DirtyInputDesc | E.DirtySceneInput
            }
            if (l.hasPrefix(S.getOutputsLocator())) bits |= E.DirtyOutputDesc
            ++it.i
          } while (!it.AtEnd() && it.Get().intersects(S.getDefaultLocator()))
        }
      }
    } else if (primType === HdPrimTypeTokens.integrator) {
      if (_FindLocator(HdIntegratorSchema.getDefaultLocator(), it)) bits |= T.DirtyParams
    } else if (primType === HdPrimTypeTokens.sampleFilter) {
      if (_FindLocator(HdSampleFilterSchema.getDefaultLocator(), it)) bits |= T.DirtyParams
      if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) bits |= T.DirtyVisibility
    } else if (primType === HdPrimTypeTokens.displayFilter) {
      if (_FindLocator(HdDisplayFilterSchema.getDefaultLocator(), it)) bits |= T.DirtyParams
      if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) bits |= T.DirtyVisibility
    } else if (primType === HdPrimTypeTokens.energyFilter) {
      if (_FindLocator(HdEnergyFilterSchema.getDefaultLocator(), it) ||
          _FindLocator(new HdDataSourceLocator(_energyFilterLpe), it) ||
          _FindLocator(new HdDataSourceLocator(_energyFilterEnabled), it) ||
          _FindLocator(new HdDataSourceLocator(_energyFilterOrder), it)) {
        bits |= T.DirtyParams
      }
      if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) bits |= T.DirtyVisibility
    } else if (primType === HdPrimTypeTokens.imageShader) {
      // The clause below also handles the case where the locator is
      // the empty locator.
      const S = HdImageShaderSchema
      const I = _HdImageShader
      if (_FindLocator(S.getDefaultLocator(), it, false)) {
        if (S.getDefaultLocator().hasPrefix(it.Get())) {
          bits |= I.AllDirty
        } else {
          do {
            const l = it.Get()
            if (l.hasPrefix(S.getEnabledLocator())) bits |= I.DirtyEnabled
            if (l.hasPrefix(S.getPriorityLocator())) bits |= I.DirtyPriority
            if (l.hasPrefix(S.getFilePathLocator())) bits |= I.DirtyFilePath
            if (l.hasPrefix(S.getConstantsLocator())) bits |= I.DirtyConstants
            if (l.hasPrefix(S.getMaterialNetworkLocator())) bits |= I.DirtyMaterialNetwork
            ++it.i
          } while (!it.AtEnd() && it.Get().intersects(S.getDefaultLocator()))
        }
      }
    } else {
      const fnc = Hd_SPrimSToBFncs.get(primType)
      if (fnc === undefined) {
        // unknown prim type, use AllDirty for anything
        if (_FindLocator(new HdDataSourceLocator(), it)) bits |= T.AllDirty
      } else {
        // call custom handler registered for this type
        const ref: HdDirtyBitsRef = { value: bits }
        fnc(set, ref)
        bits = ref.value
      }
    }

    return bits
  }

  /** dirtyBitsTranslator.cpp:1157-1207 */
  static instancerLocatorSetToDirtyBits(
    _primType: string, set: HdDataSourceLocatorSet,
  ): HdDirtyBits {
    const T = HdChangeTracker
    const it = new _It(_SortedLocators(set))

    if (it.AtEnd()) return T.Clean

    // Note, for efficiency we search for locators in the set in order, so that
    // we only end up making one trip through the set.
    // Also note, this should match InstancerDirtyBitsToLocatorSet

    if (_IsEmptyLocator(it.Get())) return T.AllDirty

    let bits: HdDirtyBits = T.Clean

    if (_FindLocator(HdCategoriesSchema.getDefaultLocator(), it)) {
      // This is relevant for point instancers.
      bits |= T.DirtyCategories
    }
    if (_FindLocator(HdInstanceCategoriesSchema.getDefaultLocator(), it)) {
      // We don't have an instance categories dirty bit.
      // This is relevant for native instancers.
      bits |= T.DirtyCategories
    }
    if (_FindLocator(HdInstancedBySchema.getDefaultLocator(), it)) bits |= T.DirtyInstancer
    if (_FindLocator(HdInstancerTopologySchema.getDefaultLocator(), it)) {
      bits |= T.DirtyInstanceIndex
    }
    if (_FindLocator(HdPrimvarsSchema.getDefaultLocator(), it)) bits |= T.DirtyPrimvar
    if (_FindLocator(HdVisibilitySchema.getDefaultLocator(), it)) bits |= T.DirtyVisibility
    if (_FindLocator(HdXformSchema.getDefaultLocator(), it)) bits |= T.DirtyTransform

    return bits
  }

  /** dirtyBitsTranslator.cpp:1209-1244 */
  static taskLocatorSetToDirtyBits(set: HdDataSourceLocatorSet): HdDirtyBits {
    const T = HdChangeTracker
    const it = new _It(_SortedLocators(set))

    if (it.AtEnd()) return T.Clean

    if (_IsEmptyLocator(it.Get())) return T.AllDirty

    let bits: HdDirtyBits = T.Clean

    if (_FindLocator(HdLegacyTaskSchema.getCollectionLocator(), it)) {
      bits |= T.DirtyCollection
    }
    if (_FindLocator(HdLegacyTaskSchema.getParametersLocator(), it)) bits |= T.DirtyParams
    if (_FindLocator(HdLegacyTaskSchema.getRenderTagsLocator(), it)) {
      bits |= T.DirtyRenderTags
    }

    return bits
  }

  /** dirtyBitsTranslator.cpp:1246-1328 */
  static bprimLocatorSetToDirtyBits(
    primType: string, set: HdDataSourceLocatorSet,
  ): HdDirtyBits {
    const T = HdChangeTracker
    const it = new _It(_SortedLocators(set))

    if (it.AtEnd()) return T.Clean

    let bits: HdDirtyBits = T.Clean

    // Note, for efficiency we search for locators in the set in order, so that
    // we only end up making one trip through the set.
    // Also note, this should match BprimDirtyBitsToLocatorSet

    if (primType === HdPrimTypeTokens.renderBuffer) {
      if (_FindLocator(HdRenderBufferSchema.getDefaultLocator(), it)) {
        bits |= _HdRenderBuffer.DirtyDescription
      }
    } else if (primType === HdPrimTypeTokens.renderSettings) {
      const S = HdRenderSettingsSchema
      const R = _HdRenderSettings
      if (_FindLocator(S.getActiveLocator(), it)) bits |= R.DirtyActive
      if (_FindLocator(S.getCameraLocator(), it)) bits |= R.DirtyCamera
      if (_FindLocator(S.getDisableDepthOfFieldLocator(), it)) {
        bits |= R.DirtyDisableDepthOfField
      }
      if (_FindLocator(S.getDisableMotionBlurLocator(), it)) {
        bits |= R.DirtyDisableMotionBlur
      }
      if (_FindLocator(S.getFrameLocator(), it)) bits |= R.DirtyFrameNumber
      if (_FindLocator(S.getIncludedPurposesLocator(), it)) bits |= R.DirtyIncludedPurposes
      if (_FindLocator(S.getMaterialBindingPurposesLocator(), it)) {
        bits |= R.DirtyMaterialBindingPurposes
      }
      if (_FindLocator(S.getNamespacedSettingsLocator(), it)) {
        bits |= R.DirtyNamespacedSettings
      }
      // In lexicographic ordering of camel case strings, uppercase comes
      // before lowercase, so renderProducts < renderingColorSpace
      if (_FindLocator(S.getRenderProductsLocator(), it)) bits |= R.DirtyRenderProducts
      if (_FindLocator(S.getRenderingColorSpaceLocator(), it)) {
        bits |= R.DirtyRenderingColorSpace
      }
      if (_FindLocator(S.getUnionedSamplingIntervalLocator(), it)) {
        bits |= R.DirtyUnionedSamplingInterval
      }
    } else if (HdLegacyPrimTypeIsVolumeField(primType)) {
      if (_FindLocator(HdVolumeFieldSchema.getDefaultLocator(), it)) {
        bits |= _HdField.DirtyParams
      }
    }

    return bits
  }

  // ----- Custom-type registration. -----

  /** dirtyBitsTranslator.cpp:1330-1339 (std::unordered_map::insert keeps an
   * existing registration). */
  static registerTranslatorsForCustomSprimType(
    primType: string,
    sToBFnc: LocatorSetToDirtyBitsFnc,
    bToSFnc: DirtyBitsToLocatorSetFnc,
  ): void {
    if (!Hd_SPrimSToBFncs.has(primType)) Hd_SPrimSToBFncs.set(primType, sToBFnc)
    if (!Hd_SPrimBToSFncs.has(primType)) Hd_SPrimBToSFncs.set(primType, bToSFnc)
  }

  /** dirtyBitsTranslator.cpp:1341-1349 */
  static registerTranslatorsForCustomRprimType(
    primType: string,
    sToBFnc: LocatorSetToDirtyBitsFnc,
    bToSFnc: DirtyBitsToLocatorSetFnc,
  ): void {
    if (!Hd_RPrimSToBFncs.has(primType)) Hd_RPrimSToBFncs.set(primType, sToBFnc)
    if (!Hd_RPrimBToSFncs.has(primType)) Hd_RPrimBToSFncs.set(primType, bToSFnc)
  }
}
