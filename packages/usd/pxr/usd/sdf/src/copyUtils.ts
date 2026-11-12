// Ported from OpenUSD 26.11.1: pxr/usd/sdf/copyUtils.cpp,
//  pxr/usd/sdf/copyUtils.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/copyUtils.{h,cpp}: copying spec data, recursively,
// from a path in one layer to a path in another (or the same) layer, with
// callbacks that control which fields and children are copied.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfSpecType } from './abstractData.ts'
import { sdfChangeBlock } from './changeManager.ts'
import {
  Sdf_AttributeChildPolicy, Sdf_AttributeConnectionChildPolicy, Sdf_ExpressionChildPolicy,
  Sdf_MapperArgChildPolicy, Sdf_MapperChildPolicy, Sdf_PrimChildPolicy, Sdf_PropertyChildPolicy, Sdf_RelationshipChildPolicy, Sdf_RelationshipTargetChildPolicy,
  Sdf_VariantChildPolicy, Sdf_VariantSetChildPolicy, type Sdf_ChildPolicy,
} from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { Layer } from './layer.ts'
import { SdfListOp } from './listOp.ts'
import { SdfPath } from './path.ts'
import { sdfCreatePrimInLayer } from './primSpec.ts'
import { SdfPayload, SdfReference } from './reference.ts'
import { SdfSchema } from './schema.ts'

/**
 * An out parameter standing in for std::optional<VtValue>* (copyUtils.h:88-100,
 * 140-145). The optional is engaged when the holder has a `value` property
 * (`'value' in holder`); an engaged `undefined` is the empty VtValue, which
 * removes the field (or, for children, copies no children).
 */
export interface SdfOptionalValue {
  value?: unknown
}

/**
 * SdfShouldCopyValueFn (copyUtils.h:88-92): returns true if `field` should be
 * copied from the spec at srcPath in srcLayer to the spec at dstPath in
 * dstLayer. Setting `valueToCopy.value` copies that value instead of the
 * source's; an empty value (undefined) removes the field from the
 * destination. A value that is an SdfCopySpecsValueEdit is applied by its
 * edit function instead of being set.
 */
export type SdfShouldCopyValueFn = (
  specType: SdfSpecType, field: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, fieldInDst: boolean,
  valueToCopy: SdfOptionalValue,
) => boolean

/**
 * SdfShouldCopyChildrenFn (copyUtils.h:140-145): returns true if the children
 * in `childrenField` should be copied. Setting both `srcChildren.value` and
 * `dstChildren.value` copies each listed source child to the corresponding
 * destination child instead of copying every child.
 */
export type SdfShouldCopyChildrenFn = (
  childrenField: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, fieldInDst: boolean,
  srcChildren: SdfOptionalValue, dstChildren: SdfOptionalValue,
) => boolean

/**
 * SdfCopySpecsValueEdit (copyUtils.h:105-131): a value a SdfShouldCopyValueFn
 * may return to edit the destination spec itself instead of setting the
 * field's value.
 */
export class SdfCopySpecsValueEdit {
  constructor(private readonly _edit: SdfCopySpecsValueEditFunction) {}

  getEditFunction(): SdfCopySpecsValueEditFunction { return this._edit }

  // SdfCopySpecsValueEdit objects are not comparable (copyUtils.h:124-127).
  equals(_rhs: SdfCopySpecsValueEdit): boolean { return false }
}

/**
 * SdfCopySpecsValueEdit::EditFunction (copyUtils.h:110-111): applies a scene
 * description edit to the given layer and spec path.
 */
export type SdfCopySpecsValueEditFunction = (layer: Layer, path: SdfPath) => void

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

function toPath(path: string | SdfPath): SdfPath {
  return typeof path === 'string' ? SdfPath.fromString(path) : path
}

function isEngaged(holder: SdfOptionalValue): boolean {
  return 'value' in holder
}

// A _CopyStackEntry is a (source path, destination path) pair indicating a
// spec that should be copied (copyUtils.cpp:30-40). An empty source path
// marks the destination spec for removal.
interface CopyStackEntry {
  srcPath: SdfPath
  dstPath: SdfPath
}

// Collection of (field name, value) pairs (copyUtils.cpp:42-44).
type FieldValuePair = [string, unknown]

// A _SpecDataEntry contains all of the information being copied for a single
// spec (copyUtils.cpp:46-61).
interface SpecDataEntry {
  dstPath: SdfPath
  specType: SdfSpecType
  dataToCopy: FieldValuePair[]
}

// The token ordering _ForEachField merges by (TfTokenFastArbitraryLessThan,
// copyUtils.cpp:78): any consistent total order.
function lessThan(a: string, b: string): boolean {
  return a < b
}

// _GetFilteredFieldNames (copyUtils.cpp:65-81).
function getFilteredFieldNames(
  layer: Layer, path: SdfPath, pred: (schema: SdfSchema, fieldName: string) => boolean,
): string[] {
  const schema = SdfSchema.getInstance()
  return layer.listFields(path.pathString)
    .filter(fieldName => pred(schema, fieldName))
    .sort((a, b) => (lessThan(a, b) ? -1 : lessThan(b, a) ? 1 : 0))
}

// _GetValueFieldNames (copyUtils.cpp:83-94).
function getValueFieldNames(layer: Layer, path: SdfPath): string[] {
  return getFilteredFieldNames(layer, path, (schema, fieldName) => !schema.holdsChildren(fieldName))
}

// _GetChildrenFieldNames (copyUtils.cpp:96-107).
function getChildrenFieldNames(layer: Layer, path: SdfPath): string[] {
  return getFilteredFieldNames(layer, path, (schema, fieldName) => schema.holdsChildren(fieldName))
}

function childrenVector(value: unknown): string[] | undefined {
  if (value === undefined) return []
  return Array.isArray(value) ? value.map(child => child instanceof SdfPath ? child.pathString : String(child))
    : undefined
}

// _ProcessChildren (copyUtils.cpp:109-170): adds the children specs the copy
// policy indicates to the copy stack.
function processChildren(
  policy: Sdf_ChildPolicy, childrenField: string,
  srcChildrenValue: unknown, dstChildrenValue: unknown,
  _srcLayer: Layer, srcPath: SdfPath, _childrenInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, childrenInDst: boolean,
  copyStack: CopyStackEntry[],
): void {
  const srcChildren = childrenVector(srcChildrenValue)
  const dstChildren = childrenVector(dstChildrenValue)
  if (!srcChildren || !dstChildren) return

  for (let i = 0; i < srcChildren.length; ++i) {
    const srcChild = srcChildren[i]!
    const dstChild = dstChildren[i] ?? ''
    if (srcChild === '' || dstChild === '') continue
    copyStack.push({
      srcPath: policy.getChildPath(srcPath, srcChild),
      dstPath: policy.getChildPath(dstPath, dstChild),
    })
  }

  // Add entries to the copy stack to mark the removal of child specs in the
  // destination layer that aren't included in the list of children to copy.
  if (childrenInDst) {
    const oldDstChildren = childrenVector(dstLayer.getField(dstPath.pathString, childrenField))
    if (!oldDstChildren) return
    for (const oldDstChild of oldDstChildren) {
      if (!dstChildren.includes(oldDstChild)) {
        copyStack.push({ srcPath: SdfPath.emptyPath, dstPath: policy.getChildPath(dstPath, oldDstChild) })
      }
    }
  }
}

// The child policy of each children field (copyUtils.cpp:195-257).
function childPolicyForField(childField: string): Sdf_ChildPolicy | undefined {
  switch (childField) {
    case 'connectionChildren': return Sdf_AttributeConnectionChildPolicy
    case 'mapperChildren': return Sdf_MapperChildPolicy
    case 'mapperArgChildren': return Sdf_MapperArgChildPolicy
    case 'expressionChildren': return Sdf_ExpressionChildPolicy
    case 'targetChildren': return Sdf_RelationshipTargetChildPolicy
    case 'variantChildren': return Sdf_VariantChildPolicy
    case 'variantSetChildren': return Sdf_VariantSetChildPolicy
    case 'properties': return Sdf_PropertyChildPolicy
    case 'primChildren': return Sdf_PrimChildPolicy
    default: return undefined
  }
}

// _ProcessChildField (copyUtils.cpp:172-260).
function processChildField(
  childField: string,
  srcLayer: Layer, srcPath: SdfPath, childrenInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, childrenInDst: boolean,
  shouldCopyChildren: SdfShouldCopyChildrenFn, copyStack: CopyStackEntry[],
): void {
  const srcChildrenToCopy: SdfOptionalValue = {}
  const dstChildrenToCopy: SdfOptionalValue = {}
  if (!shouldCopyChildren(
    childField, srcLayer, srcPath, childrenInSrc, dstLayer, dstPath, childrenInDst,
    srcChildrenToCopy, dstChildrenToCopy)) {
    return
  }

  let srcChildren: unknown, dstChildren: unknown
  if (!isEngaged(srcChildrenToCopy) || !isEngaged(dstChildrenToCopy)) {
    srcChildren = srcLayer.getField(srcPath.pathString, childField)
    dstChildren = srcChildren
  } else {
    srcChildren = srcChildrenToCopy.value
    dstChildren = dstChildrenToCopy.value
  }

  const policy = childPolicyForField(childField)
  if (!policy) codingError(`Unknown child field '${childField}'`)
  processChildren(policy, childField, srcChildren, dstChildren,
    srcLayer, srcPath, childrenInSrc, dstLayer, dstPath, childrenInDst, copyStack)
}

// _DoAddNewPrimSpec (copyUtils.cpp:271-297): whether the new prim is inert
// mimics the SdfPrimSpec constructor.
function doAddNewPrimSpec(destLayer: Layer, specData: SpecDataEntry): void {
  let type = ''
  let specifier = 'over'
  for (const [field, value] of specData.dataToCopy) {
    if (value === undefined) continue
    if (field === 'typeName') type = String(value)
    else if (field === 'specifier') specifier = String(value)
  }
  const inert = specifier === 'over' && type === ''
  Sdf_ChildrenUtils.createSpec(Sdf_PrimChildPolicy, destLayer, specData.dstPath, 'prim', inert)
}

// _DoAddNewPropertySpec (copyUtils.cpp:299-320): whether the new property has
// only required fields mimics the SdfAttributeSpec/SdfRelationshipSpec
// constructors.
function doAddNewPropertySpec(policy: Sdf_ChildPolicy, destLayer: Layer, specData: SpecDataEntry): void {
  let custom = false
  for (const [field, value] of specData.dataToCopy) {
    if (field === 'custom') {
      custom = value === true
      break
    }
  }
  const hasOnlyRequiredFields = !custom
  Sdf_ChildrenUtils.createSpec(policy, destLayer, specData.dstPath, specData.specType, hasOnlyRequiredFields)
}

// _AddNewSpecToLayer (copyUtils.cpp:322-367).
function addNewSpecToLayer(destLayer: Layer, specData: SpecDataEntry): void {
  if (destLayer.hasSpec(specData.dstPath.pathString)) return

  switch (specData.specType) {
    case 'attribute':
      doAddNewPropertySpec(Sdf_AttributeChildPolicy, destLayer, specData)
      break
    case 'connection':
      Sdf_ChildrenUtils.createSpec(Sdf_AttributeConnectionChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'prim':
      doAddNewPrimSpec(destLayer, specData)
      break
    case 'relationship':
      doAddNewPropertySpec(Sdf_RelationshipChildPolicy, destLayer, specData)
      break
    case 'relationshipTarget':
      Sdf_ChildrenUtils.createSpec(Sdf_RelationshipTargetChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'variant':
      Sdf_ChildrenUtils.createSpec(Sdf_VariantChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'variantSet':
      Sdf_ChildrenUtils.createSpec(Sdf_VariantSetChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'expression':
      Sdf_ChildrenUtils.createSpec(Sdf_ExpressionChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'mapper':
      Sdf_ChildrenUtils.createSpec(Sdf_MapperChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'mapperArg':
      Sdf_ChildrenUtils.createSpec(Sdf_MapperArgChildPolicy, destLayer, specData.dstPath, specData.specType)
      break
    case 'pseudoRoot':
    case 'unknown':
      break
  }
}

// _RemoveSpecFromLayer (copyUtils.cpp:369-421).
function removeSpecFromLayer(dstLayer: Layer, dstPath: SdfPath): void {
  let policy: Sdf_ChildPolicy | undefined
  switch (dstLayer.getSpecType(dstPath.pathString)) {
    case 'attribute': policy = Sdf_AttributeChildPolicy; break
    case 'connection': policy = Sdf_AttributeConnectionChildPolicy; break
    case 'expression': policy = Sdf_ExpressionChildPolicy; break
    case 'mapper': policy = Sdf_MapperChildPolicy; break
    case 'mapperArg': policy = Sdf_MapperArgChildPolicy; break
    case 'prim': policy = Sdf_PrimChildPolicy; break
    case 'relationship': policy = Sdf_RelationshipChildPolicy; break
    case 'relationshipTarget': policy = Sdf_RelationshipTargetChildPolicy; break
    case 'variant': policy = Sdf_VariantChildPolicy; break
    case 'variantSet': policy = Sdf_VariantSetChildPolicy; break
    default: return
  }
  // _DoRemoveSpec (copyUtils.cpp:369-378).
  Sdf_ChildrenUtils.removeChild(policy, dstLayer, policy.getParentPath(dstPath), policy.getFieldValue(dstPath))
}

// _AddFieldValueToCopy (copyUtils.cpp:423-448): the value may be empty
// (undefined) to indicate that the field should be removed from the
// destination.
function addFieldValueToCopy(
  specType: SdfSpecType, field: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  dstLayer: Layer, dstPath: SdfPath, fieldInDst: boolean,
  shouldCopyValue: SdfShouldCopyValueFn, valueList: FieldValuePair[],
): void {
  const value: SdfOptionalValue = {}
  if (shouldCopyValue(specType, field, srcLayer, srcPath, fieldInSrc, dstLayer, dstPath, fieldInDst, value)) {
    valueList.push([field, isEngaged(value) ? value.value : srcLayer.getField(srcPath.pathString, field)])
  }
}

// _ForEachField (copyUtils.cpp:450-495): calls fn once for each unique field
// of the sorted srcFields and dstFields, with flags for which list it is in.
function forEachField(
  srcFields: readonly string[], dstFields: readonly string[],
  fn: (field: string, fieldInSrc: boolean, fieldInDst: boolean) => void,
): void {
  let srcIt = 0, dstIt = 0
  const srcEnd = srcFields.length, dstEnd = dstFields.length
  while (srcIt !== srcEnd && dstIt !== dstEnd) {
    if (srcFields[srcIt] === dstFields[dstIt]) {
      fn(srcFields[srcIt]!, true, true)
      ++srcIt, ++dstIt
    } else if (lessThan(srcFields[srcIt]!, dstFields[dstIt]!)) {
      for (; srcIt !== srcEnd && lessThan(srcFields[srcIt]!, dstFields[dstIt]!); ++srcIt) {
        fn(srcFields[srcIt]!, true, false)
      }
    } else {
      for (; dstIt !== dstEnd && lessThan(dstFields[dstIt]!, srcFields[srcIt]!); ++dstIt) {
        fn(dstFields[dstIt]!, false, true)
      }
    }
  }

  const inSrc = srcIt !== srcEnd
  const finalFields = inSrc ? srcFields : dstFields
  for (let it = inSrc ? srcIt : dstIt; it !== finalFields.length; ++it) {
    fn(finalFields[it]!, inSrc, !inSrc)
  }
}

function setOrEraseField(layer: Layer, path: SdfPath, field: string, value: unknown): void {
  // SdfLayer::SetField with an empty VtValue erases the field.
  if (value === undefined) layer.eraseField(path.pathString, field)
  else layer.setField(path.pathString, field, value)
}

// The advanced SdfCopySpec (copyUtils.cpp:497-713).
function copySpecAdvanced(
  srcLayer: Layer, srcPath: SdfPath, dstLayer: Layer, dstPath: SdfPath,
  shouldCopyValueFn: SdfShouldCopyValueFn, shouldCopyChildrenFn: SdfShouldCopyChildrenFn,
): boolean {
  if (!srcLayer || !dstLayer) codingError('Invalid layer handle')

  if (srcPath.isEmpty() || dstPath.isEmpty()) codingError('Invalid empty path')

  // Validate compatible source and destination path types.
  if ((srcPath.isAbsoluteRootOrPrimPath() || srcPath.isPrimVariantSelectionPath())
      !== (dstPath.isAbsoluteRootOrPrimPath() || dstPath.isPrimVariantSelectionPath())
      || srcPath.isPropertyPath() !== dstPath.isPropertyPath()
      || srcPath.isTargetPath() !== dstPath.isTargetPath()
      || srcPath.isMapperPath() !== dstPath.isMapperPath()
      || srcPath.isMapperArgPath() !== dstPath.isMapperArgPath()
      || srcPath.isExpressionPath() !== dstPath.isExpressionPath()) {
    codingError('Incompatible source and destination paths')
  }

  // For target paths (relationship targets and connections), verify the
  // destination spec already exists.
  if (dstPath.isTargetPath() && !dstLayer.hasSpec(dstPath.pathString)) {
    codingError('Spec does not exist at destination target path')
  }

  // If we're copying within a single layer and either srcPath or dstPath is a
  // prefix of the other, first copy the src scene description to a temporary
  // anonymous layer, then copy from _that_ temporary src to dstPath. This way
  // we avoid mutating the src as we're copying.
  if (srcLayer === dstLayer && (srcPath.hasPrefix(dstPath) || dstPath.hasPrefix(srcPath))) {
    // Create an anon layer with the same format & args as the src layer.
    const tmpSrcLayer = Layer.createAnonymous('SdfCopySpec_tmp_src_layer',
      srcLayer.getFileFormat(), srcLayer.getFileFormatArguments())
    // Get the nearest prim path and copy that to the tmpSrc. Note that this
    // in general copies more than necessary.
    const srcPrimPath = srcPath.getPrimPath()
    sdfCreatePrimInLayer(tmpSrcLayer, srcPrimPath)

    if (!sdfCopySpec(srcLayer, srcPrimPath, tmpSrcLayer, srcPrimPath)) {
      throw new TfError(`Failed to create temporary source for overlapped SdfCopySpec ` +
        `<${srcPath.pathString}> -> <${dstPath.pathString}>`, TfDiagnosticType.RuntimeError)
    }

    // Now copy the temporary src to the dst.
    return copySpecAdvanced(tmpSrcLayer, srcPath, dstLayer, dstPath, shouldCopyValueFn, shouldCopyChildrenFn)
  }

  return sdfChangeBlock(() => {
    // Create a stack of source/dest copy requests, initially populated with
    // the passed parameters. The copy routine adds requests as needed to
    // handle children and runs until the stack is empty.
    const copyStack: CopyStackEntry[] = [{ srcPath, dstPath }]
    while (copyStack.length > 0) {
      const toCopy = copyStack.shift()!

      // If the source path is empty, it indicates that the spec at the
      // destination path should be removed.
      if (toCopy.srcPath.isEmpty()) {
        removeSpecFromLayer(dstLayer, toCopy.dstPath)
        continue
      }

      // Figure out the concrete type of the spec we're copying. The spec type
      // dictates copying behavior below.
      const specType = srcLayer.getSpecType(toCopy.srcPath.pathString)
      if (specType === 'unknown') {
        codingError(`Cannot copy unknown spec at <${toCopy.srcPath.pathString}> from layer ` +
          `<${srcLayer.identifier}>`)
      }

      const copyEntry: SpecDataEntry = { dstPath: toCopy.dstPath, specType, dataToCopy: [] }

      // Determine what data is present for the current source and dest specs
      // and what needs to be copied.
      const dstValueFields = getValueFieldNames(dstLayer, toCopy.dstPath)
      const srcValueFields = getValueFieldNames(srcLayer, toCopy.srcPath)

      // From the list of value fields, retrieve all values that the copy
      // policy says we need to copy over to the destination.
      forEachField(srcValueFields, dstValueFields, (field, fieldInSrc, fieldInDst) => {
        addFieldValueToCopy(specType, field,
          srcLayer, toCopy.srcPath, fieldInSrc, dstLayer, toCopy.dstPath, fieldInDst,
          shouldCopyValueFn, copyEntry.dataToCopy)
      })

      // Since prims and variants hold the same information, a prim can be
      // copied to a variant and vice-versa. If this is the case, we need to
      // update the copy entry since the code below expects the source and
      // destination spec types to be the same.
      const copyingPrimToVariant = specType === 'prim' && toCopy.dstPath.isPrimVariantSelectionPath()
      const copyingVariantToPrim = specType === 'variant' && toCopy.dstPath.isPrimPath()

      if (copyingPrimToVariant || copyingVariantToPrim) {
        // Clear out any specifier or typename fields in the data to copy,
        // since we'll want to set those specially.
        copyEntry.dataToCopy = copyEntry.dataToCopy.filter(([field]) =>
          field !== 'specifier' && field !== 'typeName')

        if (copyingPrimToVariant) {
          // Set the specifier for the destination variant to over, since
          // that's the value used in SdfVariantSpec's c'tor.
          copyEntry.dataToCopy.push(['specifier', 'over'])
          copyEntry.specType = 'variant'
        } else {
          // Variants don't have a specifier or typename, but for convenience
          // we copy those values from the owning prim.
          const srcPrimPath = toCopy.srcPath.getPrimPath()
          const srcFields: string[] = [], dstFields: string[] = []
          for (const field of ['specifier', 'typeName']) {
            if (srcLayer.hasField(srcPrimPath.pathString, field)) srcFields.push(field)
            if (dstLayer.hasField(toCopy.dstPath.pathString, field)) dstFields.push(field)
          }

          forEachField(srcFields, dstFields, (field, fieldInSrc, fieldInDst) => {
            addFieldValueToCopy(specType, field,
              srcLayer, srcPrimPath, fieldInSrc, dstLayer, toCopy.dstPath, fieldInDst,
              shouldCopyValueFn, copyEntry.dataToCopy)
          })

          copyEntry.specType = 'prim'
        }
      }

      // Create the new spec and copy all of the specified fields over.
      addNewSpecToLayer(dstLayer, copyEntry)
      for (const [field, value] of copyEntry.dataToCopy) {
        if (value instanceof SdfCopySpecsValueEdit) {
          value.getEditFunction()(dstLayer, copyEntry.dstPath)
        } else {
          setOrEraseField(dstLayer, copyEntry.dstPath, field, value)
        }
      }

      // Retrieve the children fields to be copied. Don't retrieve them before
      // value fields are copied as children fields may be modified during
      // copying value fields.
      const dstChildrenFields = getChildrenFieldNames(dstLayer, toCopy.dstPath)
      const srcChildrenFields = getChildrenFieldNames(srcLayer, toCopy.srcPath)

      // Now add any children specs that need to be copied to our copy stack.
      forEachField(srcChildrenFields, dstChildrenFields, (field, fieldInSrc, fieldInDst) => {
        processChildField(field,
          srcLayer, toCopy.srcPath, fieldInSrc, dstLayer, toCopy.dstPath, fieldInDst,
          shouldCopyChildrenFn, copyStack)
      })
    }

    return true
  })
}

// ------------------------------------------------------------

function remapPath(path: string, srcPrefix: SdfPath, dstPrefix: SdfPath): string {
  return SdfPath.fromString(path).replacePrefix(srcPrefix, dstPrefix).pathString
}

// _FixInternalSubrootPaths (copyUtils.cpp:717-733): only internal sub-root
// references and payloads are fixed up.
function fixInternalSubrootPaths<T extends SdfReference | SdfPayload>(
  ref: T, srcPrefix: SdfPath, dstPrefix: SdfPath,
): T {
  if (ref.getAssetPath() !== '' || ref.getPrimPath().isEmpty() || ref.getPrimPath().isRootPrimPath()) {
    return ref
  }
  const primPath = ref.getPrimPath().replacePrefix(srcPrefix, dstPrefix)
  if (ref instanceof SdfReference) {
    return new SdfReference(ref.assetPath, primPath, ref.layerOffset, ref.getCustomData()) as T
  }
  return new SdfPayload(ref.assetPath, primPath, ref.layerOffset) as T
}

/**
 * SdfShouldCopyValue (copyUtils.cpp:735-818): the SdfShouldCopyValueFn the
 * simple SdfCopySpec uses. Copies every field, remapping connection, target,
 * inherit and specializes paths, internal sub-root references and payloads,
 * and relocates that point beneath srcRootPath to dstRootPath.
 */
export function sdfShouldCopyValue(
  srcRootPath: SdfPath, dstRootPath: SdfPath,
  _specType: SdfSpecType, field: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  _dstLayer: Layer, _dstPath: SdfPath, _fieldInDst: boolean,
  valueToCopy: SdfOptionalValue,
): boolean {
  if (!fieldInSrc) return true
  const srcPrefix = srcRootPath.getPrimPath().stripAllVariantSelections()
  const dstPrefix = dstRootPath.getPrimPath().stripAllVariantSelections()

  if (field === 'connectionPaths' || field === 'targetPaths' ||
      field === 'inheritPaths' || field === 'specializes') {
    const value = srcLayer.getField(srcPath.pathString, field)
    if (value !== undefined) {
      const srcListOp = SdfListOp.fromValue<string>(value,
        item => item instanceof SdfPath ? item.pathString : String(item))
      srcListOp.modifyOperations(path => remapPath(path, srcPrefix, dstPrefix))
      valueToCopy.value = srcListOp.toValue()
    }
  } else if (field === 'references') {
    const value = srcLayer.getField(srcPath.pathString, field)
    if (value !== undefined) {
      const refListOp = SdfListOp.fromValue(value, SdfReference._from)
      refListOp.modifyOperations(ref => fixInternalSubrootPaths(ref, srcPrefix, dstPrefix))
      valueToCopy.value = refListOp.toValue()
    }
  } else if (field === 'payload') {
    const value = srcLayer.getField(srcPath.pathString, field)
    if (value !== undefined) {
      const payloadListOp = SdfListOp.fromValue(value, SdfPayload._from)
      payloadListOp.modifyOperations(payload => fixInternalSubrootPaths(payload, srcPrefix, dstPrefix))
      valueToCopy.value = payloadListOp.toValue()
    }
  } else if (field === 'relocates') {
    const relocates = srcLayer.getField(srcPath.pathString, field)
    if (relocates && typeof relocates === 'object') {
      const updatedRelocates: Record<string, string> = {}
      for (const [source, target] of Object.entries(relocates as Record<string, unknown>)) {
        updatedRelocates[remapPath(source, srcPrefix, dstPrefix)] =
          remapPath(target instanceof SdfPath ? target.pathString : String(target), srcPrefix, dstPrefix)
      }
      valueToCopy.value = updatedRelocates
    }
  }

  return true
}

/**
 * SdfShouldCopyChildren (copyUtils.cpp:820-853): the SdfShouldCopyChildrenFn
 * the simple SdfCopySpec uses. Copies every child, remapping connection,
 * relationship target and mapper children that point beneath srcRootPath to
 * dstRootPath.
 */
export function sdfShouldCopyChildren(
  srcRootPath: SdfPath, dstRootPath: SdfPath,
  childrenField: string,
  srcLayer: Layer, srcPath: SdfPath, fieldInSrc: boolean,
  _dstLayer: Layer, _dstPath: SdfPath, _fieldInDst: boolean,
  srcChildren: SdfOptionalValue, dstChildren: SdfOptionalValue,
): boolean {
  if (fieldInSrc) {
    if (childrenField === 'connectionChildren' || childrenField === 'targetChildren' ||
        childrenField === 'mapperChildren') {
      const children = childrenVector(srcLayer.getField(srcPath.pathString, childrenField))
      if (children && srcLayer.hasField(srcPath.pathString, childrenField)) {
        srcChildren.value = [...children]
        const srcPrefix = srcRootPath.getPrimPath().stripAllVariantSelections()
        const dstPrefix = dstRootPath.getPrimPath().stripAllVariantSelections()
        dstChildren.value = children.map(child => remapPath(child, srcPrefix, dstPrefix))
      }
    }
  }
  return true
}

/**
 * SdfCopySpec (copyUtils.h:62-66, 214-220; copyUtils.cpp:497-713, 855-875):
 * copies the spec at srcPath in srcLayer to dstPath in dstLayer,
 * recursively, overwriting any destination specs that already exist. Parent
 * specs of the destination must already exist.
 *
 * With shouldCopyValueFn and shouldCopyChildrenFn, those callbacks control
 * which fields and children are copied; without them, sdfShouldCopyValue
 * and sdfShouldCopyChildren bound to srcPath and dstPath are used.
 */
export function sdfCopySpec(
  srcLayer: Layer, srcPath: string | SdfPath, dstLayer: Layer, dstPath: string | SdfPath,
): boolean
export function sdfCopySpec(
  srcLayer: Layer, srcPath: string | SdfPath, dstLayer: Layer, dstPath: string | SdfPath,
  shouldCopyValueFn: SdfShouldCopyValueFn, shouldCopyChildrenFn: SdfShouldCopyChildrenFn,
): boolean
export function sdfCopySpec(
  srcLayer: Layer, srcPath: string | SdfPath, dstLayer: Layer, dstPath: string | SdfPath,
  shouldCopyValueFn?: SdfShouldCopyValueFn, shouldCopyChildrenFn?: SdfShouldCopyChildrenFn,
): boolean {
  const src = toPath(srcPath)
  const dst = toPath(dstPath)
  return copySpecAdvanced(srcLayer, src, dstLayer, dst,
    shouldCopyValueFn ?? ((...args) => sdfShouldCopyValue(src, dst, ...args)),
    shouldCopyChildrenFn ?? ((...args) => sdfShouldCopyChildren(src, dst, ...args)))
}
