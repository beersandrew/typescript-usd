// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/stitch.cpp,
//  pxr/usd/usdUtils/stitch.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/stitch.{h,cpp} (OpenUSD 26.11.1).
//
// Merging all scene description of a weaker layer (or spec) into a stronger
// one, field by field, through SdfCopySpec with stitching callbacks.

import {
  CopySpecsValueEdit as SdfCopySpecsValueEdit,
  Layer,
  ListOp as SdfListOp,
  Schema as SdfSchema,
  sdfCopySpec,
  type OptionalValue as SdfOptionalValue,
  type Spec as SdfSpec,
  type SpecType as SdfSpecType,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from 'typescript-usd/tf'

/**
 * Status returned by a UsdUtilsStitchValueFn describing the desired value
 * stitching behavior (stitch.h:62-70).
 */
export enum UsdUtilsStitchValueStatus {
  /** Don't stitch values for this field. */
  NoStitchedValue,
  /** Use the default stitching behavior for this field. */
  UseDefaultValue,
  /** Use the value supplied in stitchedValue. */
  UseSuppliedValue,
}

/**
 * Callback for customizing how values are stitched together
 * (stitch.h:72-89).
 *
 * Invoked for each field being stitched from the source spec at `path` in
 * `weakLayer` to the destination spec at `path` in `strongLayer`;
 * `fieldInStrongLayer` and `fieldInWeakLayer` say whether the field has a
 * value in either layer. `stitchedValue` stands in for the VtValue* out
 * parameter: if the callback returns UseSuppliedValue and leaves
 * `stitchedValue.value` undefined (the empty VtValue), the field is removed
 * from the destination spec.
 */
export type UsdUtilsStitchValueFn = (
  field: string, path: SdfPath,
  strongLayer: Layer, fieldInStrongLayer: boolean,
  weakLayer: Layer, fieldInWeakLayer: boolean,
  stitchedValue: { value?: unknown },
) => UsdUtilsStitchValueStatus

type Dictionary = Record<string, unknown>

function isDictionary(value: unknown): value is Dictionary {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// VtDictionaryOverRecursive(strong, weak) (dictionary.cpp): the strong
// dictionary with every key only the weak one has added, nested
// dictionaries composed recursively. Layers hold dictionaries as plain
// objects.
function dictionaryOverRecursive(strong: Dictionary, weak: Dictionary): Dictionary {
  const result: Dictionary = { ...strong }
  for (const [key, weakValue] of Object.entries(weak)) {
    if (!(key in result)) {
      result[key] = weakValue
    } else {
      const strongValue = result[key]
      if (isDictionary(strongValue) && isDictionary(weakValue)) {
        result[key] = dictionaryOverRecursive(strongValue, weakValue)
      }
    }
  }
  return result
}

// _Reduce for SdfVariantSelectionMap (stitch.cpp:28-35): std::map::insert
// keeps the stronger selection for a variant set both name.
function reduceVariantSelections(stronger: Dictionary, weaker: Dictionary): Dictionary {
  const result: Dictionary = { ...stronger }
  for (const [key, value] of Object.entries(weaker)) {
    if (!(key in result)) result[key] = value
  }
  return result
}

// _FixListOp (stitch.cpp:44-60): "fix" a list op to only use composable
// features, converting added items to appended and discarding reorders.
function fixListOp<T>(op: SdfListOp<T>): SdfListOp<T> {
  const fixed = op.clone()
  const items = fixed.getAppendedItems()
  for (const item of fixed.getAddedItems()) {
    if (!SdfListOp.createExplicit(items).hasItem(item)) items.push(item)
  }
  fixed.setAppendedItems(items)
  fixed.setAddedItems([])
  fixed.setOrderedItems([])
  return fixed
}

// _Reduce for SdfListOp<T> (stitch.cpp:62-84).
function reduceListOps(strongerValue: unknown, weakerValue: unknown): unknown {
  const stronger = SdfListOp.fromValue<unknown>(strongerValue)
  const weaker = SdfListOp.fromValue<unknown>(weakerValue)
  let r = stronger.applyOperations(weaker)
  if (r) return r.toValue()
  // List ops that use added or reordered items cannot, in general, be
  // composed into another listop. In those cases, we fall back to a
  // best-effort approximation by discarding reorders and converting
  // adds to appends.
  r = fixListOp(stronger).applyOperations(fixListOp(weaker))
  if (r) return r.toValue()
  // The approximation used should always be composable, so error if that
  // didn't work.
  TF_CODING_ERROR(`Could not reduce listOp ${stronger.toString()} over ${weaker.toString()}`)
  return undefined
}

// The kind of value a field's schema fallback holds, which selects the
// _Reduce overload (stitch.cpp:280-305 dispatch on fallback.IsHolding<T>()).
type MergeKind = 'dictionary' | 'variantSelectionMap' | 'listOp'

function fallbackValueTypeName(field: string): string | undefined {
  return SdfSchema.getInstance().getFieldDefinition(field)?._getValueTypeName()
}

function mergeKindForField(field: string): MergeKind | undefined {
  const valueType = fallbackValueTypeName(field)
  if (valueType === 'VtDictionary') return 'dictionary'
  if (valueType === 'map<string, string>') return 'variantSelectionMap'
  if (valueType?.startsWith('SdfListOp<')) return 'listOp'
  return undefined
}

// _MergeValue<T> (stitch.cpp:86-110), called with the stronger (dst) layer
// first: the value to copy is the reduction of the stronger value over the
// weaker one.
function mergeValue(
  kind: MergeKind, field: string,
  strongLayer: Layer, strongPath: SdfPath,
  weakLayer: Layer, weakPath: SdfPath,
  valueToCopy: SdfOptionalValue,
): boolean {
  const strongValue = strongLayer.getField(strongPath.pathString, field)
  const weakValue = weakLayer.getField(weakPath.pathString, field)
  if (!TF_VERIFY(strongValue !== undefined, 'srcLayer->HasField(srcPath, field, &srcValue)') ||
      !TF_VERIFY(weakValue !== undefined, 'dstLayer->HasField(dstPath, field, &dstValue)')) {
    return false
  }

  let mergedValue: unknown
  switch (kind) {
    case 'dictionary':
      // Dictionaries compose keys recursively (stitch.cpp:37-42).
      mergedValue = isDictionary(strongValue) && isDictionary(weakValue)
        ? dictionaryOverRecursive(strongValue, weakValue) : undefined
      break
    case 'variantSelectionMap':
      mergedValue = isDictionary(strongValue) && isDictionary(weakValue)
        ? reduceVariantSelections(strongValue, weakValue) : undefined
      break
    case 'listOp':
      mergedValue = reduceListOps(strongValue, weakValue)
      break
  }
  if (mergedValue !== undefined) {
    valueToCopy.value = mergedValue
    return true
  }
  return false
}

function setTimeSample(layer: Layer, path: SdfPath, time: number, value: unknown): void {
  layer.setAttrTimeSample(path.getParentPath().pathString, path.name, time, value)
}

// Field values that must match between the layers; the stronger value is
// kept (stitch.cpp:221-261).
const MATCHED_FIELDS: ReadonlySet<string> = new Set([
  'framesPerSecond', 'timeCodesPerSecond', 'framePrecision',
])

// _MergeValueFn (stitch.cpp:112-306).
function mergeValueFn(
  _specType: SdfSpecType, field: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, fieldInDst: boolean,
  valueToCopy: SdfOptionalValue,
  stitchFn: UsdUtilsStitchValueFn | undefined,
): boolean {
  TF_VERIFY(srcPath.equals(dstPath), 'srcPath == dstPath')

  if (stitchFn) {
    const value: { value?: unknown } = {}

    // Note that the source layer corresponds to the weaker layer and the
    // destination layer corresponds to the stronger layer in the callback
    // signature.
    const status = stitchFn(field, srcPath, dstLayer, fieldInDst, srcLayer, fieldInSrc, value)

    if (status === UsdUtilsStitchValueStatus.NoStitchedValue) {
      return false
    } else if (status === UsdUtilsStitchValueStatus.UseSuppliedValue) {
      valueToCopy.value = value.value
      return true
    }
    // Fall through to default stitching behavior.
  }

  // Field does not exist in source; don't copy this over, since that will
  // clear the value in the destination.
  if (!fieldInSrc) {
    return false
  }

  // Field does not exist in destination; just copy whatever's in the
  // source over.
  if (!fieldInDst) {
    return true
  }

  const src = srcPath.pathString
  const dst = dstPath.pathString

  // Merge specific fields together.
  if (field === 'specifier') {
    const srcSpecifier = srcLayer.getField(src, field)
    const dstSpecifier = dstLayer.getField(dst, field)
    TF_VERIFY(srcSpecifier !== undefined, 'srcLayer->HasField(srcPath, field, &srcSpecifier)')
    TF_VERIFY(dstSpecifier !== undefined, 'dstLayer->HasField(dstPath, field, &dstSpecifier)')
    // If the stronger (src) specifier is 'over', take the weaker (dst).
    // Otherwise take the stronger.
    valueToCopy.value = srcSpecifier === 'over' ? dstSpecifier : srcSpecifier
    return true
  } else if (field === 'timeSamples') {
    const dstTimes = new Set(dstLayer.listTimeSamplesForPath(dst))
    const edits = new Map<number, unknown>()
    for (const time of srcLayer.listTimeSamplesForPath(src)) {
      if (!dstTimes.has(time)) {
        edits.set(time, srcLayer.queryTimeSample(src, time))
      }
    }

    if (edits.size > 0) {
      valueToCopy.value = new SdfCopySpecsValueEdit((layer, path) => {
        for (const [time, value] of edits) setTimeSample(layer, path, time, value)
      })
      return true
    }
    return false
  } else if (field === 'startTimeCode') {
    const srcStartCode = srcLayer.getField(src, field)
    const dstStartCode = dstLayer.getField(dst, field)
    TF_VERIFY(typeof srcStartCode === 'number', 'srcLayer->HasField(srcPath, field, &srcStartCode)')
    TF_VERIFY(typeof dstStartCode === 'number', 'dstLayer->HasField(dstPath, field, &dstStartCode)')
    valueToCopy.value = Math.min(Number(srcStartCode), Number(dstStartCode))
    return true
  } else if (field === 'endTimeCode') {
    const srcEndCode = srcLayer.getField(src, field)
    const dstEndCode = dstLayer.getField(dst, field)
    TF_VERIFY(typeof srcEndCode === 'number', 'srcLayer->HasField(srcPath, field, &srcEndCode)')
    TF_VERIFY(typeof dstEndCode === 'number', 'dstLayer->HasField(dstPath, field, &dstEndCode)')
    valueToCopy.value = Math.max(Number(srcEndCode), Number(dstEndCode))
    return true
  }

  // Validate that certain fields match between both layers, but leave the
  // stronger value in place.
  if (MATCHED_FIELDS.has(field)) {
    const srcValue = srcLayer.getField(src, field)
    const dstValue = dstLayer.getField(dst, field)
    TF_VERIFY(srcValue !== undefined, 'srcLayer->HasField(srcPath, field, &srcValue)')
    TF_VERIFY(dstValue !== undefined, 'dstLayer->HasField(dstPath, field, &dstValue)')
    if (srcValue !== dstValue) {
      TF_WARN(`Mismatched ${field} values in @${srcLayer.identifier}@ and @${dstLayer.identifier}@`)
    }
    return false
  }

  // Merge fields based on type. If the field is not one of these types,
  // return false to indicate that the stronger value should not be copied
  // over.
  const kind = mergeKindForField(field)
  return kind !== undefined &&
    mergeValue(kind, field, dstLayer, dstPath, srcLayer, srcPath, valueToCopy)
}

// _DontCopyChildrenFn (stitch.cpp:308-318).
function dontCopyChildrenFn(): boolean {
  return false
}

// _MergeChildren<T> (stitch.cpp:320-357). Children vectors hold tokens or
// paths, both strings here; the empty string is the empty token or path,
// which SdfCopySpec skips.
function mergeChildren(
  field: string,
  srcLayer: Layer, srcPath: SdfPath,
  dstLayer: Layer, dstPath: SdfPath,
  finalSrcValue: SdfOptionalValue,
  finalDstValue: SdfOptionalValue,
): boolean {
  const srcChildren = srcLayer.getField(srcPath.pathString, field)
  const dstChildren = dstLayer.getField(dstPath.pathString, field)
  if (!TF_VERIFY(Array.isArray(srcChildren), 'srcLayer->HasField(srcPath, field, &srcChildren)') ||
      !TF_VERIFY(Array.isArray(dstChildren), 'dstLayer->HasField(dstPath, field, &dstChildren)')) {
    return false
  }

  const finalSrcChildren: string[] = (dstChildren as unknown[]).map(() => '')
  const finalDstChildren: string[] = (dstChildren as unknown[]).map(String)

  for (const child of srcChildren as unknown[]) {
    const srcChild = String(child)
    const idx = finalDstChildren.indexOf(srcChild)
    if (idx < 0) {
      finalSrcChildren.push(srcChild)
      finalDstChildren.push(srcChild)
    } else {
      finalSrcChildren[idx] = srcChild
    }
  }

  finalSrcValue.value = finalSrcChildren
  finalDstValue.value = finalDstChildren
  return true
}

// _MergeChildrenFn (stitch.cpp:359-394).
function mergeChildrenFn(
  childrenField: string,
  srcLayer: Layer, srcPath: SdfPath, childrenInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, childrenInDst: boolean,
  finalSrcChildren: SdfOptionalValue,
  finalDstChildren: SdfOptionalValue,
): boolean {
  if (!childrenInSrc) {
    // Children on the destination spec are never cleared if the source
    // spec does not have any children of the same type.
    return false
  }

  if (!childrenInDst) {
    // No children of the given type exist in the destination. Copy all of
    // the children from the source over.
    return true
  }

  // There are children under both the source and destination spec. We
  // need to merge the two lists. Children fields hold std::vector<TfToken>
  // or std::vector<SdfPath> (stitch.cpp:378-386).
  const valueType = fallbackValueTypeName(childrenField)
  if ((valueType === 'vector<TfToken>' || valueType === 'vector<SdfPath>') &&
      mergeChildren(childrenField, srcLayer, srcPath, dstLayer, dstPath,
        finalSrcChildren, finalDstChildren)) {
    return true
  }

  TF_CODING_ERROR(`Children field '${childrenField}' holding unexpected type '${valueType ?? ''}'`)
  return false
}

/**
 * Merge the scene description for `weakObj` into `strongObj`
 * (stitch.h:37-55; stitch.cpp:399-425). See UsdUtilsStitchLayers for a
 * description of the merging behavior; with `stitchValueFn`, that callback
 * customizes how fields are stitched together.
 */
export function UsdUtilsStitchInfo(
  strongObj: SdfSpec, weakObj: SdfSpec, stitchValueFn?: UsdUtilsStitchValueFn,
): void {
  sdfCopySpec(
    weakObj.getLayer(), weakObj.getPath(),
    strongObj.getLayer(), strongObj.getPath(),
    /* shouldCopyValueFn = */ (...args) => mergeValueFn(...args, stitchValueFn),
    /* shouldCopyChildrenFn = */ dontCopyChildrenFn)
}

/**
 * Merge all scene description in `weakLayer` into `strongLayer`
 * (stitch.h:28-36, 91-102; stitch.cpp:427-452).
 *
 * Prims and properties in `weakLayer` that do not exist in `strongLayer` are
 * copied into `strongLayer`; those that exist in both are merged field by
 * field. In general a field with a value in `strongLayer` keeps it, but:
 *
 * - map and dictionary-valued fields (including time samples) are merged,
 *   weaker keys copied only when the stronger dictionary lacks them;
 * - listOp-valued fields are combined into a single listOp ("add" becomes
 *   "append" and "reorder" is discarded where needed);
 * - the minimum startTimeCode and maximum endTimeCode are used.
 *
 * With `stitchValueFn`, that callback customizes how fields are stitched
 * together (UsdUtilsStitchValueFn).
 */
export function UsdUtilsStitchLayers(
  strongLayer: Layer, weakLayer: Layer, stitchValueFn?: UsdUtilsStitchValueFn,
): void {
  sdfCopySpec(
    weakLayer, SdfPath.absoluteRootPath,
    strongLayer, SdfPath.absoluteRootPath,
    /* shouldCopyValueFn = */ (...args) => mergeValueFn(...args, stitchValueFn),
    /* shouldCopyChildrenFn = */ mergeChildrenFn)
}
