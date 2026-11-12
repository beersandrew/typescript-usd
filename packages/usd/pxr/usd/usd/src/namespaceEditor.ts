// Ported from OpenUSD 26.11.1: pxr/usd/usd/namespaceEditor.cpp,
//  pxr/usd/usd/namespaceEditor.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/namespaceEditor.{h,cpp}: namespace edits
// (deleting, renaming and reparenting prims and properties) applied to every
// layer of the stage's root layer stack, with the dependent edits that keep
// composition arcs, relocates and path-bearing fields of dependent stages
// pointing at the edited objects.

import {
  BatchNamespaceEdit as SdfBatchNamespaceEdit, NamespaceEdit as SdfNamespaceEdit,
  ListOp as SdfListOp, PathExpression as SdfPathExpression,
  sdfChangeBlock, sdfCleanupEnabler, sdfJustCreatePrimInLayer,
  type Layer, type Spec as SdfSpec,
} from 'typescript-usd/sdf'
import {
  _SdfPathExpressionValue, _sdfGetDictionaryValueTypes, _sdfIsDictionary, _sdfRecordDictionaryValueTypes,
} from 'typescript-usd/sdf/_internal'
import { Array as VtArray } from 'typescript-usd/vt'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  pcpGatherDependentNamespaceEdits, pcpGatherLayersToEditForSpecMove,
  DependentNamespaceEdits as PcpDependentNamespaceEdits,
  type Cache as PcpCache, type Layer as PcpLayer, type LayerStack as PcpLayerStack,
  type Node as PcpNodeRef, type PrimIndex as PcpPrimIndex,
} from 'typescript-usd/pcp'
import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { usdPrimSpecSites } from './resolver.ts'
import type { Prim } from './prim.ts'
import type { Stage } from './stage.ts'

type PathLike = string | SdfPath

// UsdObject::GetPath: an invalid (absent) object has the empty path.
function objectPath(object: Prim | UsdPropertyLike | undefined | null): SdfPath {
  if (!object) return SdfPath.emptyPath
  return toPath('path' in object && typeof object.path === 'string' ? object.path : (object as UsdPropertyLike).getPath())
}

function toPath(path: PathLike): SdfPath {
  return path instanceof SdfPath ? path : path === '' ? SdfPath.emptyPath : SdfPath.fromString(path)
}

// A UsdProperty: anything with its property path.
type UsdPropertyLike = { getPath(): string | SdfPath }

// ------------------------------------------------------------------------- //
// Path-bearing fields (namespaceEditor.cpp:35-232)
// ------------------------------------------------------------------------- //

// The SdfPathListOp-valued fields of the Sdf schema (schema.cpp).
const PATH_LIST_OP_FIELDS = new Set(['connectionPaths', 'inheritPaths', 'specializes', 'targetPaths'])

// The value type of a stored value when it can't be told from the value
// itself: list ops and path expressions are stored as plain data, typed by
// the field, the attribute's typeName, or the dictionary's value types.
type ValueTypeHint = 'pathListOp' | 'pathExpression' | 'pathExpression[]' | 'dictionary' | undefined

// The path transforms namespaceEditor.cpp registers with VtValue
// (namespaceEditor.cpp:225-238), applied as VtValueTryTransform applies
// them: to SdfPath, SdfPathListOp and SdfPathExpression values, to arrays of
// path expressions (Vt_RegisterTransformImpl), and recursively to dictionary
// values (dictionary.cpp _DictionaryTryTransform).
interface PathXf {
  pathListOp(listOp: SdfListOp<string>): boolean
  pathExpression(expression: SdfPathExpression): SdfPathExpression
}

// VtValueTryTransform: the transformed value, or undefined when the value
// type has no transform (or, for dictionaries, nothing in it transformed).
function tryTransform(value: unknown, hint: ValueTypeHint, xf: PathXf): { value: unknown } | undefined {
  if (value instanceof _SdfPathExpressionValue) {
    return { value: new _SdfPathExpressionValue(xf.pathExpression(new SdfPathExpression(value.text)).getText()) }
  }
  if (value instanceof SdfPathExpression) return { value: xf.pathExpression(value) }
  if (hint === 'pathListOp') {
    if (value === undefined || value === null) return undefined
    const listOp = pathListOpOf(value)
    return { value: xf.pathListOp(listOp) ? listOp.toValue() : value }
  }
  if (hint === 'pathExpression' && typeof value === 'string') {
    return { value: xf.pathExpression(new SdfPathExpression(value)).getText() }
  }
  if (hint === 'pathExpression[]') {
    const items = value instanceof VtArray ? value.toArray() : Array.isArray(value) ? value : undefined
    if (!items) return undefined
    const mapped = items.map(item => tryTransform(item, 'pathExpression', xf)?.value ?? item)
    return { value: value instanceof VtArray ? new VtArray(mapped, value.getElementType()) : mapped }
  }
  if ((hint === undefined || hint === 'dictionary') && _sdfIsDictionary(value)) {
    const valueTypes = _sdfGetDictionaryValueTypes(value)
    let transformedAny = false
    const dst: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const typeName = valueTypes?.get(key)
      const itemHint: ValueTypeHint = typeName === 'pathExpression' || typeName === 'pathExpression[]'
        ? typeName : _sdfIsDictionary(item) ? 'dictionary' : undefined
      const transformed = itemHint === undefined && !(item instanceof _SdfPathExpressionValue) &&
        !(item instanceof SdfPathExpression) ? undefined : tryTransform(item, itemHint, xf)
      if (transformed) transformedAny = true
      dst[key] = transformed ? transformed.value : item
    }
    if (!transformedAny) return undefined
    if (valueTypes) _sdfRecordDictionaryValueTypes(dst, valueTypes)
    return { value: dst }
  }
  return undefined
}

// The hint for a field value on a spec in a layer.
function fieldValueTypeHint(layer: Layer, specPath: string, fieldName: string, value: unknown): ValueTypeHint {
  if (PATH_LIST_OP_FIELDS.has(fieldName)) return 'pathListOp'
  if (fieldName === 'default') {
    const typeName = layer.getField(specPath, 'typeName')
    return typeName === 'pathExpression' || typeName === 'pathExpression[]' ? typeName : undefined
  }
  return _sdfIsDictionary(value) ? 'dictionary' : undefined
}

function pathListOpOf(value: unknown): SdfListOp<string> {
  return SdfListOp.fromValue<string>(value, item => String(item))
}

// _CollectPathsXf: the paths a field's value refers to, or undefined when
// the value isn't path-bearing.
function collectPaths(value: unknown, hint: ValueTypeHint): SdfPath[] | undefined {
  const paths: SdfPath[] = []
  const result = tryTransform(value, hint, {
    // _PathListOpCollectPathsXf: every path anywhere in the list op.
    pathListOp: listOp => {
      const items = listOp.isExplicit()
        ? listOp.getExplicitItems()
        : [...listOp.getAddedItems(), ...listOp.getAppendedItems(), ...listOp.getDeletedItems(),
          ...listOp.getOrderedItems(), ...listOp.getPrependedItems()]
      for (const item of items) paths.push(toPath(item))
      return false
    },
    // _CollectPrefixes.
    pathExpression: expression => {
      expression.walk(
        () => {},
        ref => { if (!ref.path.isEmpty()) paths.push(ref.path) },
        pattern => { if (!pattern.getPrefix().isEmpty()) paths.push(pattern.getPrefix()) })
      return expression
    },
  })
  return result ? paths : undefined
}

// _NamespaceEditXf: the value with paths under oldPath moved to newPath, or
// undefined when unchanged.
function namespaceEditValue(value: unknown, hint: ValueTypeHint, oldPath: SdfPath, newPath: SdfPath): unknown {
  let changed = false
  const result = tryTransform(value, hint, {
    // _PathListOpNamespaceEdit.
    pathListOp: listOp => {
      const modified = listOp.modifyOperations(item => {
        const path = toPath(item)
        // Paths are always absolute within layer data.
        if (!path.isAbsolutePath()) return item
        if (!path.hasPrefix(oldPath)) return item
        // A deleted old path deletes the item.
        if (newPath.isEmpty()) return undefined
        return path.replacePrefix(oldPath, newPath).pathString
      })
      if (modified) changed = true
      return modified
    },
    // _PathExprReplacePrefix.
    pathExpression: expression => {
      const replaced = expression.replacePrefix(oldPath, newPath)
      if (replaced.getText() !== expression.getText()) changed = true
      return replaced
    },
  })
  return result && changed ? result.value : undefined
}

// A prim or property spec with an authored path-bearing field that may need
// updating as part of a namespace edit.
interface SpecWithPathBearingFieldsInfo {
  layer: Layer
  path: SdfPath
  fieldName: string
  hint: ValueTypeHint
  // The node in the composed prim index that introduces this spec.
  originatingNode: PcpNodeRef
}

function getFieldValue(specInfo: SpecWithPathBearingFieldsInfo): unknown {
  const value = specInfo.layer.getField(specInfo.path.pathString, specInfo.fieldName)
  if (value === undefined) {
    throw new TfError(`Field ${specInfo.fieldName} at site @${specInfo.layer.identifier}@` +
      `<${specInfo.path.pathString}> is expected to exist.`, TfDiagnosticType.CodingError)
  }
  return value
}

// The dependencies between stage object paths and the prim or property specs
// with fields whose paths include that object.
interface Dependencies {
  // Each composed object's specs (strongest to weakest) providing opinions
  // for its path-bearing fields.
  composedObjectToSpecsWithPathBearingFieldsMap: Map<string, SpecWithPathBearingFieldsInfo[]>
  // Each targeted stage path to the composed objects whose path-bearing
  // fields map to it.
  targetedPathToTargetingSpecPathsTable: Map<string, string[]>
}

// _DependencyCollector::GetDependencies: every path-bearing field on the
// stage.
function getDependencies(stage: Stage): Dependencies {
  const result: Dependencies = {
    composedObjectToSpecsWithPathBearingFieldsMap: new Map(),
    targetedPathToTargetingSpecPathsTable: new Map(),
  }
  const pseudoRoot = stage.getPrim('/')
  for (const prim of pseudoRoot?.getAllDescendants() ?? []) {
    const primIndex = stage.getPrimIndex(prim.path)
    if (!primIndex) continue
    const workEntriesPerObject = new Map<string, { specs: SpecWithPathBearingFieldsInfo[]; paths: Set<string> }>()
    const addEntry = (objectPath: string, node: PcpNodeRef, specInfo: SpecWithPathBearingFieldsInfo,
      paths: readonly SdfPath[]): void => {
      let workEntry = workEntriesPerObject.get(objectPath)
      if (!workEntry) workEntriesPerObject.set(objectPath, workEntry = { specs: [], paths: new Set() })
      for (const path of paths) {
        // Map the path into stage namespace.
        const mappedPath = node.getMapToRoot().evaluate().mapSourceToTarget(path)
        if (!mappedPath.isEmpty()) workEntry.paths.add(mappedPath.pathString)
      }
      workEntry.specs.push(specInfo)
    }

    // All of the prim's field opinions in strength order (Usd_Resolver).
    for (const { node, layer, specPath } of usdPrimSpecSites(primIndex)) {
      const primSpecPath = SdfPath.fromString(specPath)
      for (const fieldName of layer.listFields(specPath)) {
        // Inherits and specializes are tracked in the dependent namespace
        // edits' composition field edits.
        if (fieldName === 'inheritPaths' || fieldName === 'specializes') continue
        const value = layer.getField(specPath, fieldName)
        const hint = fieldValueTypeHint(layer, specPath, fieldName, value)
        const paths = collectPaths(value, hint)
        if (!paths) continue
        addEntry(prim.path, node,
          { layer, path: primSpecPath, fieldName, hint, originatingNode: node }, paths)
      }

      // The property specs locally authored on this prim spec.
      const primSpecPropertyNames = layer.getField(specPath, 'properties')
      if (!Array.isArray(primSpecPropertyNames)) continue
      for (const propName of primSpecPropertyNames as string[]) {
        const localPropPath = primSpecPath.appendProperty(propName)
        for (const fieldName of layer.listFields(localPropPath.pathString)) {
          const value = layer.getField(localPropPath.pathString, fieldName)
          const hint = fieldValueTypeHint(layer, localPropPath.pathString, fieldName, value)
          const paths = collectPaths(value, hint)
          if (!paths) continue
          addEntry(SdfPath.fromString(prim.path).appendProperty(propName).pathString, node,
            { layer, path: localPropPath, fieldName, hint, originatingNode: node }, paths)
        }
      }
    }

    for (const [composedObjectPath, workEntry] of workEntriesPerObject) {
      result.composedObjectToSpecsWithPathBearingFieldsMap.set(composedObjectPath, workEntry.specs)
      for (const targetedPath of workEntry.paths) {
        let paths = result.targetedPathToTargetingSpecPathsTable.get(targetedPath)
        if (!paths) result.targetedPathToTargetingSpecPathsTable.set(targetedPath, paths = [])
        paths.push(composedObjectPath)
      }
    }
  }
  return result
}

function getErrorString(errors: readonly string[]): string {
  return errors.join('; ')
}

// TfStringify(SdfPathVector).
function stringifyPaths(paths: readonly SdfPath[]): string {
  return `[ ${paths.map(p => `${p.pathString} `).join('')}]`
}

export interface UsdNamespaceEditorEditOptions {
  // Whether the editor may author relocates for prims whose edits require
  // them.
  allowRelocatesAuthoring?: boolean
}

/** UsdNamespaceEditor::CanApplyResult: truthy when there are no errors. */
export class UsdNamespaceEditorCanApplyResult {
  errors: string[] = []
  warnings: string[] = []
  valueOf(): boolean { return this.errors.length === 0 }
  get ok(): boolean { return this.errors.length === 0 }
}

enum EditType { Invalid, Delete, Rename, Reparent }

interface EditDescription {
  oldPath: SdfPath
  newPath: SdfPath
  editType: EditType
}

function isPropertyEdit(editDesc: EditDescription): boolean {
  return editDesc.oldPath.isPrimPropertyPath()
}

interface PathBearingFieldEdit {
  spec: SdfSpec
  fieldName: string
  newFieldValue: unknown
}

class ProcessedEdit {
  errors: string[] = []
  warnings: string[] = []
  editDescription: EditDescription = { oldPath: SdfPath.emptyPath, newPath: SdfPath.emptyPath, editType: EditType.Invalid }
  layersToEdit: Layer[] = []
  willAuthorRelocates = false
  pathBearingFieldEdits: PathBearingFieldEdit[] = []
  dependentStageNamespaceEdits = new PcpDependentNamespaceEdits()

  canApply(): UsdNamespaceEditorCanApplyResult {
    // Only errors that prevent the object from being moved or deleted
    // prevent applying; field fixup problems are warnings.
    const result = new UsdNamespaceEditorCanApplyResult()
    result.warnings = [...this.warnings]
    result.errors = [...this.errors]
    return result
  }

  apply(): boolean {
    // Preemptively prevent partial edits.
    const result = this.canApply()
    if (!result.ok) {
      throw new TfError('Failed to apply edits to the stage because of the following errors: ' +
        getErrorString(result.errors), TfDiagnosticType.CodingError)
    } else if (result.warnings.length > 0) {
      console.warn(`Encountered warnings when applying namespace edit: ${getErrorString(result.warnings)}`)
    }

    const edits = this.dependentStageNamespaceEdits
    sdfChangeBlock(() => {
      if (isPropertyEdit(this.editDescription)) {
        // Property edits only apply the spec moves.
        for (const [layer, editVec] of edits.layerSpecMoves) {
          for (const edit of editVec) applyLayerSpecMove(layer as Layer, edit.oldPath, edit.newPath)
        }
      } else {
        // First fix up composition arcs, then move the specs (so an arc to a
        // sibling of a moved parent is fixed before the move), then the
        // relocates, which live in layer metadata.
        for (const edit of edits.compositionFieldEdits) {
          const layer = edit.layer as Layer
          if (edit.newFieldValue === undefined) layer.eraseField(edit.path.pathString, edit.fieldName)
          else layer.setField(edit.path.pathString, edit.fieldName, edit.newFieldValue)
        }
        for (const [layer, editVec] of edits.layerSpecMoves) {
          for (const edit of editVec) applyLayerSpecMove(layer as Layer, edit.oldPath, edit.newPath)
        }
        for (const [layer, relocates] of edits.dependentRelocatesEdits) {
          (layer as Layer).setField('/', 'layerRelocates', relocates)
        }
      }

      // Path-bearing field fixups; the spec may have been deleted by the edit.
      for (const edit of this.pathBearingFieldEdits) {
        if (!edit.spec.isDormant()) edit.spec.setField(edit.fieldName, edit.newFieldValue)
      }
    })
    return true
  }
}

// _ApplyLayerSpecMove (namespaceEditor.cpp:1530-1610).
function applyLayerSpecMove(layer: Layer, oldPath: SdfPath, newPath: SdfPath): boolean {
  // The "Same" index keeps a renamed object in its original order.
  const batchEdit = new SdfBatchNamespaceEdit()
  batchEdit.add(oldPath, newPath, SdfNamespaceEdit.Same)

  const applyEditsToLayersFn = (createParentSpecIfNeededPath: SdfPath): boolean => {
    // The new parent exists on the composed stage but not necessarily as a
    // spec in every layer; create required overs.
    if (!createParentSpecIfNeededPath.isEmpty() &&
        !sdfJustCreatePrimInLayer(layer, createParentSpecIfNeededPath)) {
      throw new TfError(`Failed to find or create new parent spec at path ` +
        `'${createParentSpecIfNeededPath.pathString}' on layer '${layer.identifier}' which is ` +
        'necessary to apply edits. The edit will be incomplete.', TfDiagnosticType.CodingError)
    }
    if (!layer.apply(batchEdit)) {
      throw new TfError(`Failed to apply batch edit on layer '${layer.identifier}' which is ` +
        'necessary to apply edits. The edit will be incomplete.', TfDiagnosticType.CodingError)
    }
    return true
  }

  const isReparent = !newPath.isEmpty() && !newPath.getParentPath().equals(oldPath.getParentPath())
  if (isReparent) {
    // A cleanup enabler deletes ancestor overs left inert by the move, so a
    // reparent and its "undo" leave layers in their original state.
    return sdfCleanupEnabler(() => applyEditsToLayersFn(newPath.getParentPath()))
  }
  return applyEditsToLayersFn(SdfPath.emptyPath)
}

function isValidPrimEditPath(path: SdfPath): boolean {
  return path.isPrimPath() && path.isAbsolutePath() && !path.containsPrimVariantSelection()
}

function isValidPropertyEditPath(path: SdfPath): boolean {
  return path.isPrimPropertyPath() && path.isAbsolutePath() && !path.containsPrimVariantSelection()
}

function isPseudoRoot(prim: Prim): boolean { return prim.path === '/' }

function hasProperty(prim: Prim, propertyName: string): boolean {
  return prim.getPropertyNames().includes(propertyName)
}

// UsdStage::GetObjectAtPath.
function stageHasObjectAtPath(stage: Stage, path: SdfPath): boolean {
  if (path.isPropertyPath()) {
    const prim = stage.getPrim(path.getPrimPath().pathString)
    return prim !== undefined && hasProperty(prim, path.name)
  }
  return stage.getPrim(path.pathString) !== undefined
}

function isValidPrimToEdit(prim: Prim | undefined): string | undefined {
  if (!prim) return 'The prim to edit is not a valid prim'
  if (prim.isInPrototype()) return 'The prim to edit belongs to a prototype prim'
  if (prim.isInstanceProxy()) {
    return 'The prim to edit is a prototype proxy descendant of an instance prim'
  }
  return undefined
}

function isValidPropertyToEdit(prim: Prim | undefined, propertyName: string): string | undefined {
  if (!prim || !hasProperty(prim, propertyName)) return 'The property to edit is not a valid property'
  if (prim.isInPrototype()) return 'The property to edit belongs to a prototype prim'
  if (prim.isInstanceProxy()) return 'The property to edit belongs to an instance prototype proxy'
  if (prim.getPrimDefinition().getPropertyDefinition(propertyName).isValid()) {
    return 'The property to edit is a built-in property of its prim'
  }
  return undefined
}

function isValidNewParentPath(stage: Stage, pathToEdit: SdfPath, newParentPath: SdfPath): string | undefined {
  const newParentPrim = stage.getPrim(newParentPath.pathString)
  if (!newParentPrim) return 'The new parent prim is not a valid prim'
  if (newParentPrim.isInPrototype()) return 'The new parent prim belongs to a prototype prim'
  if (newParentPrim.isInstanceProxy()) {
    return 'The new parent prim is a prototype proxy descendant of an instance prim'
  }
  if (pathToEdit.isPrimPropertyPath()) {
    if (isPseudoRoot(newParentPrim)) return 'The new parent prim for a property cannot be the pseudo-root'
  } else {
    if (newParentPrim.isInstance()) {
      return 'The new parent prim is an instance prim whose children are provided exclusively by its prototype'
    }
    if (newParentPath.equals(pathToEdit)) return 'The new parent prim is the same as the prim to move'
    if (newParentPath.hasPrefix(pathToEdit)) return 'The new parent prim is a descendant of the prim to move'
  }
  return undefined
}

// UsdNamespaceEditor::_EditProcessor (namespaceEditor.cpp:840-1520).
class EditProcessor {
  private _nodeForEditTarget!: PcpNodeRef

  static processEdit(
    stage: Stage, dependentStages: ReadonlySet<Stage>, editDesc: EditDescription,
    editOptions: Required<UsdNamespaceEditorEditOptions>,
  ): ProcessedEdit {
    const processedEdit = new ProcessedEdit()
    new EditProcessor(stage, dependentStages, editDesc, editOptions, processedEdit)
    return processedEdit
  }

  private constructor(
    private readonly _stage: Stage,
    private readonly _dependentStages: ReadonlySet<Stage>,
    private readonly _editDesc: EditDescription,
    private readonly _editOptions: Required<UsdNamespaceEditorEditOptions>,
    private readonly _processedEdit: ProcessedEdit,
  ) {
    if (_editDesc.editType === EditType.Invalid) {
      _processedEdit.errors.push('There are no valid edits to perform')
      return
    }
    _processedEdit.editDescription = { ..._editDesc }

    // The stage must have the prim or property to edit.
    const prim = _stage.getPrim(_editDesc.oldPath.getPrimPath().pathString)
    const error = isPropertyEdit(_editDesc)
      ? isValidPropertyToEdit(prim, _editDesc.oldPath.name)
      : isValidPrimToEdit(prim)
    if (error !== undefined) {
      _processedEdit.errors.push(error)
      return
    }

    const primIndex = _stage.getPrimIndex(prim!.path)!
    // Namespace edits are performed using the root layer stack.
    this._nodeForEditTarget = primIndex.getRootNode()

    if (!this._processNewPath()) return

    if (isPropertyEdit(_editDesc)) this._processPropEditRequiresRelocates(primIndex)
    else this._processPrimEditRequiresRelocates(primIndex)

    this._gatherLayersToEdit()
    this._gatherDependentStageEdits()
    // Relies on the dependent stage edits.
    this._gatherPathBearingFieldEdits()
  }

  private _processNewPath(): boolean {
    const editDesc = this._editDesc
    // A delete has no new path to validate.
    if (editDesc.newPath.isEmpty()) return true

    if (stageHasObjectAtPath(this._stage, editDesc.newPath)) {
      this._processedEdit.errors.push('An object already exists at the new path')
      return false
    }

    if (editDesc.editType === EditType.Reparent) {
      const whyNot = isValidNewParentPath(this._stage, editDesc.oldPath, editDesc.newPath.getParentPath())
      if (whyNot !== undefined) {
        this._processedEdit.errors.push(whyNot)
        return false
      }
    }

    if (isPropertyEdit(editDesc)) return true

    // A prim's new path may be prohibited by relocates.
    const newParentPrim = this._stage.getPrim(editDesc.newPath.getParentPath().pathString)
    if (!newParentPrim) {
      throw new TfError(`Parent prim at path ${editDesc.newPath.getParentPath().pathString} does not exist`,
        TfDiagnosticType.CodingError)
    }
    const newParentPrimIndex = this._stage.getPrimIndex(newParentPrim.path)
    const prohibitedChildren = new Set<string>()
    newParentPrimIndex?.computePrimChildNames(prohibitedChildren)
    if (!prohibitedChildren.has(editDesc.newPath.name)) return true

    // A prim can be moved back to its original location by removing a
    // relocation from the new path to the old path.
    const localRelocates = this._nodeForEditTarget.getLayerStack().incrementalRelocatesSourceToTarget
    if (localRelocates.get(editDesc.newPath.pathString) === editDesc.oldPath.pathString) return true

    this._processedEdit.errors.push('The new path is a prohibited child of its parent path because of ' +
      'existing relocates.')
    return false
  }

  private _processPrimEditRequiresRelocates(primIndex: PcpPrimIndex): void {
    const requiresRelocatesAuthoring = ((): boolean => {
      // A path that is already a relocation target needs its relocates
      // updated.
      const targetToSourceRelocates = this._nodeForEditTarget.getLayerStack().incrementalRelocatesTargetToSource
      if (targetToSourceRelocates.has(this._editDesc.oldPath.pathString)) return true

      // Contributing specs across ancestral arcs keep mapping to the same
      // path after the edit.
      for (const child of this._nodeForEditTarget.getChildren()) {
        if (!child.isDueToAncestor()) continue
        for (const subtreeNode of primIndex.getNodeSubtreeRange(child)) {
          if (subtreeNode.hasSpecs && !subtreeNode.isInert) return true
        }
      }
      return false
    })()
    if (!requiresRelocatesAuthoring) return

    if (!this._editOptions.allowRelocatesAuthoring) {
      this._processedEdit.errors.push('The prim to edit requires authoring relocates since it composes ' +
        'opinions introduced by ancestral composition arcs; relocates authoring must be enabled to ' +
        'perform this edit')
      return
    }
    this._processedEdit.willAuthorRelocates = true
  }

  private _processPropEditRequiresRelocates(primIndex: PcpPrimIndex): void {
    const propName = this._editDesc.oldPath.name
    // Properties don't define arcs, so property specs in any node below the
    // edit target node can't be edited without relocates.
    const subtreeRange = primIndex.getNodeSubtreeRange(this._nodeForEditTarget).slice(1)
    for (const subtreeNode of subtreeRange) {
      if (!subtreeNode.hasSpecs || subtreeNode.isInert) continue
      // The node's path (not its map function, which drops variant
      // selections) with the property name.
      const mappedPropertyPath = subtreeNode.getPath().appendProperty(propName)
      if (mappedPropertyPath.isEmpty()) continue
      const hasPropertySpecs = subtreeNode.getLayerStack().getLayers()
        .some(layer => layer.hasSpec(mappedPropertyPath.pathString))
      if (hasPropertySpecs) {
        this._processedEdit.errors.push('The property to edit requires authoring relocates since it ' +
          'composes opinions introduced by ancestral composition arcs; authoring relocates is not ' +
          'supported for properties')
        return
      }
    }
  }

  private _gatherLayersToEdit(): void {
    const layerStack = this._nodeForEditTarget.getLayerStack()
    const layers = layerStack.getLayers()
    const editTarget = this._stage.getEditTarget()
    // Edit targets must map to the prim's local opinions in the root layer
    // stack.
    if (!editTarget.getMapFunction().isIdentityPathMapping()) {
      this._processedEdit.errors.push('Edit targets that map paths across composition arcs are not ' +
        'currently supported for namespace editing')
      return
    }
    if (!layers.includes(editTarget.getLayer() as PcpLayer)) {
      this._processedEdit.errors.push('Edit targets with layers outside of the root layer stack are not ' +
        'currently supported for namespace editing')
      return
    }
    this._processedEdit.layersToEdit = pcpGatherLayersToEditForSpecMove(
      layerStack, this._editDesc.oldPath, this._editDesc.newPath, this._processedEdit.errors) as Layer[]
  }

  private _gatherPathBearingFieldEdits(): void {
    const dependentCachePathChanges = this._processedEdit.dependentStageNamespaceEdits.dependentCachePathChanges
    const primaryChanges = dependentCachePathChanges.get(this._stage._getPcpCache()!)
    for (const edit of primaryChanges ?? []) {
      this._gatherPathBearingFieldEditsForStage(this._stage, edit.oldPath, edit.newPath,
        this._processedEdit.willAuthorRelocates)
    }
    // Relocates are only authored on the primary stage, so paths needing
    // relocates produce warnings for dependent stages.
    for (const stage of this._dependentStages) {
      const changes = dependentCachePathChanges.get(stage._getPcpCache()!)
      for (const edit of changes ?? []) {
        this._gatherPathBearingFieldEditsForStage(stage, edit.oldPath, edit.newPath, false)
      }
    }
  }

  private _gatherPathBearingFieldEditsForStage(
    stage: Stage, oldPath: SdfPath, newPath: SdfPath, willAuthorRelocates: boolean,
  ): void {
    const deps = getDependencies(stage)

    // Fields targeting the edited path or any descendant are affected.
    const objectPathSet = new Set<string>()
    for (const [targetedPath, paths] of deps.targetedPathToTargetingSpecPathsTable) {
      if (!SdfPath.fromString(targetedPath).hasPrefix(oldPath)) continue
      for (const path of paths) objectPathSet.add(path)
    }
    const objectPathsWithAffectedFields = [...objectPathSet].map(p => SdfPath.fromString(p))
      .sort(SdfPath.compare)

    for (const path of objectPathsWithAffectedFields) {
      const specs = deps.composedObjectToSpecsWithPathBearingFieldsMap.get(path.pathString)
      if (!specs) continue

      // Local opinions (root node specs, strongest first) can be edited.
      for (const specInfo of specs) {
        if (!specInfo.originatingNode.isRootNode()) break
        const spec = specInfo.layer.getObjectAtPath(specInfo.path)!
        const existing = this._processedEdit.pathBearingFieldEdits.find(
          e => e.spec === spec && e.fieldName === specInfo.fieldName)
        // An in-progress edit's new value is the base for the transform.
        const baseValue = existing ? existing.newFieldValue : getFieldValue(specInfo)
        const modifiedValue = namespaceEditValue(baseValue, specInfo.hint, oldPath, newPath)
        if (modifiedValue === undefined) continue
        if (existing) existing.newFieldValue = modifiedValue
        else this._processedEdit.pathBearingFieldEdits.push({ spec, fieldName: specInfo.fieldName, newFieldValue: modifiedValue })
      }

      // Authored relocates also map fields authored across arcs.
      if (willAuthorRelocates) continue

      // Fields from specs across arcs below the root node can't be edited;
      // ones affected by the edit would require relocates.
      const fieldsRequireRelocates = new Map<string, SdfPath[]>()
      for (let i = specs.length - 1; i >= 0; i--) {
        const specInfo = specs[i]!
        if (specInfo.originatingNode.isRootNode()) break
        const mapToRoot = specInfo.originatingNode.getMapToRoot().evaluate()
        const translatedPathAtIntroduction = mapToRoot.mapSourceToTarget(
          specInfo.originatingNode.getPathAtIntroduction())
        // Edits to the arc's source prim or its ancestors don't affect paths
        // from across the arc.
        if (translatedPathAtIntroduction.hasPrefix(oldPath)) continue
        const fieldValue = getFieldValue(specInfo)
        for (const fieldPath of collectPaths(fieldValue, specInfo.hint) ?? []) {
          const translatedPath = mapToRoot.mapSourceToTarget(fieldPath)
          if (translatedPath.isEmpty() || !translatedPath.hasPrefix(oldPath)) continue
          let paths = fieldsRequireRelocates.get(specInfo.fieldName)
          if (!paths) fieldsRequireRelocates.set(specInfo.fieldName, paths = [])
          paths.push(translatedPath)
        }
      }

      // These are warnings; they don't prevent applying the edit.
      for (const fieldName of [...fieldsRequireRelocates.keys()].sort()) {
        this._processedEdit.warnings.push(`Fixing the paths ${stringifyPaths(fieldsRequireRelocates.get(fieldName)!)} ` +
          `in the field ${fieldName} for the object at '${path.pathString}' would require ` +
          `'${oldPath.pathString}'to be relocated but we do not introduce relocates for ` +
          `${oldPath.isPrimPropertyPath() ? 'properties ever' : 'prims that do not have opinions across composition arcs'}.`)
      }
    }
  }

  private _gatherDependentStageEdits(): void {
    // The primary stage's cache is always first.
    const dependentCaches: PcpCache[] = [this._stage._getPcpCache()!]
    for (const stage of this._dependentStages) dependentCaches.push(stage._getPcpCache()!)

    const addRelocatesToLayerStack: PcpLayerStack | undefined =
      this._processedEdit.willAuthorRelocates ? this._nodeForEditTarget.getLayerStack() : undefined

    this._processedEdit.dependentStageNamespaceEdits = pcpGatherDependentNamespaceEdits(
      this._editDesc.oldPath, this._editDesc.newPath, this._processedEdit.layersToEdit,
      addRelocatesToLayerStack, this._stage.getEditTarget().getLayer() as PcpLayer | undefined,
      dependentCaches)

    this._processedEdit.warnings.push(...this._processedEdit.dependentStageNamespaceEdits.warnings)
  }
}

/** UsdNamespaceEditor (namespaceEditor.h). */
export class UsdNamespaceEditor {
  private readonly _dependentStages = new Set<Stage>()
  private readonly _editOptions: Required<UsdNamespaceEditorEditOptions>
  private _editDescription: EditDescription = {
    oldPath: SdfPath.emptyPath, newPath: SdfPath.emptyPath, editType: EditType.Invalid,
  }
  private _processedEdit: ProcessedEdit | undefined

  constructor(private readonly _stage: Stage, editOptions: UsdNamespaceEditorEditOptions = {}) {
    this._editOptions = { allowRelocatesAuthoring: editOptions.allowRelocatesAuthoring ?? true }
  }

  addDependentStage(stage: Stage): void {
    if (!stage || stage === this._stage) return
    this._clearProcessedEdits()
    this._dependentStages.add(stage)
  }

  removeDependentStage(stage: Stage): void {
    this._clearProcessedEdits()
    this._dependentStages.delete(stage)
  }

  setDependentStages(stages: readonly Stage[]): void {
    for (const stage of stages) this.addDependentStage(stage)
  }

  deletePrimAtPath(path: PathLike): boolean {
    return this._addPrimDelete(toPath(path))
  }

  movePrimAtPath(path: PathLike, newPath: PathLike): boolean {
    return this._addPrimMove(toPath(path), toPath(newPath))
  }

  deletePrim(prim: Prim | undefined): boolean {
    return this._addPrimDelete(objectPath(prim))
  }

  renamePrim(prim: Prim | undefined, newName: string): boolean {
    const primPath = objectPath(prim)
    return this._addPrimMove(primPath, primPath.replaceName(newName))
  }

  reparentPrim(prim: Prim | undefined, newParent: Prim | undefined, newName?: string): boolean {
    const primPath = objectPath(prim)
    return this._addPrimMove(primPath, objectPath(newParent).appendChild(newName ?? primPath.name))
  }

  deletePropertyAtPath(path: PathLike): boolean {
    return this._addPropertyDelete(toPath(path))
  }

  movePropertyAtPath(path: PathLike, newPath: PathLike): boolean {
    return this._addPropertyMove(toPath(path), toPath(newPath))
  }

  deleteProperty(property: UsdPropertyLike | undefined): boolean {
    return this._addPropertyDelete(objectPath(property))
  }

  renameProperty(property: UsdPropertyLike | undefined, newName: string): boolean {
    const propertyPath = objectPath(property)
    return this._addPropertyMove(propertyPath, propertyPath.replaceName(newName))
  }

  reparentProperty(property: UsdPropertyLike | undefined, newParent: Prim | undefined, newName?: string): boolean {
    const propertyPath = objectPath(property)
    return this._addPropertyMove(propertyPath,
      objectPath(newParent).appendProperty(newName ?? propertyPath.name))
  }

  // ApplyEdits (namespaceEditor.cpp:595-680).
  applyEdits(): boolean {
    const processedEdit = this._processEditsIfNeeded()

    // A namespace edit change block for the primary stage and each explicit
    // dependent stage, so each classifies the namespace edits in its
    // ObjectsChanged notice.
    const changeBlocks: Array<{ close(): void }> = []
    const addChangesForStage = (stage: Stage): void => {
      const pathChangesForStage = processedEdit.dependentStageNamespaceEdits.dependentCachePathChanges
        .get(stage._getPcpCache()!)
      if (!pathChangesForStage) return
      // Changes whose old object isn't on the stage are dropped.
      const changeBlockExpectedChanges: Array<{ oldPath: string; newPath?: string | undefined }> = []
      for (const change of pathChangesForStage) {
        if (!stageHasObjectAtPath(stage, change.oldPath)) continue
        changeBlockExpectedChanges.push({
          oldPath: change.oldPath.pathString,
          newPath: change.newPath.isEmpty() ? undefined : change.newPath.pathString,
        })
      }
      changeBlocks.push(stage._openNamespaceEditsChangeBlock(changeBlockExpectedChanges))
    }

    try {
      addChangesForStage(this._stage)
      for (const stage of this._dependentStages) addChangesForStage(stage)
      return processedEdit.apply()
    } finally {
      for (const block of changeBlocks) block.close()
      // Always clear the processed edits after applying them.
      this._clearProcessedEdits()
    }
  }

  // CanApplyEdits (namespaceEditor.cpp:682-704).
  canApplyEdits(): UsdNamespaceEditorCanApplyResult {
    return this._processEditsIfNeeded().canApply()
  }

  // GetLayersToEdit (namespaceEditor.cpp:706-721).
  getLayersToEdit(): Layer[] {
    const result = this.canApplyEdits()
    if (!result.ok) {
      throw new TfError('Cannot get layers to edit because edit cannot be applied due to the following ' +
        `errors: ${getErrorString(result.errors)}`, TfDiagnosticType.CodingError)
    }
    return [...this._processedEdit!.layersToEdit]
  }

  private _addPrimDelete(oldPath: SdfPath): boolean {
    this._clearProcessedEdits()
    this._editDescription = { oldPath, newPath: SdfPath.emptyPath, editType: EditType.Invalid }
    if (!isValidPrimEditPath(oldPath)) {
      throw new TfError(`Invalid path '${oldPath.pathString}' provided as the source for a prim namespace edit.`,
        TfDiagnosticType.CodingError)
    }
    this._editDescription.editType = EditType.Delete
    return true
  }

  private _addPrimMove(oldPath: SdfPath, newPath: SdfPath): boolean {
    this._clearProcessedEdits()
    this._editDescription = { oldPath, newPath, editType: EditType.Invalid }
    if (!isValidPrimEditPath(oldPath)) {
      throw new TfError(`Invalid path '${oldPath.pathString}' provided as the source for a prim namespace edit.`,
        TfDiagnosticType.CodingError)
    }
    if (!isValidPrimEditPath(newPath)) {
      throw new TfError(`Invalid path '${newPath.pathString}' provided as the destination for a prim ` +
        'namespace edit.', TfDiagnosticType.CodingError)
    }
    this._editDescription.editType = oldPath.getParentPath().equals(newPath.getParentPath())
      ? EditType.Rename : EditType.Reparent
    return true
  }

  private _addPropertyDelete(oldPath: SdfPath): boolean {
    this._clearProcessedEdits()
    this._editDescription = { oldPath, newPath: SdfPath.emptyPath, editType: EditType.Invalid }
    if (!isValidPropertyEditPath(oldPath)) {
      throw new TfError(`Invalid path '${oldPath.pathString}' provided as the source for a property ` +
        'namespace edit.', TfDiagnosticType.CodingError)
    }
    this._editDescription.editType = EditType.Delete
    return true
  }

  private _addPropertyMove(oldPath: SdfPath, newPath: SdfPath): boolean {
    this._clearProcessedEdits()
    this._editDescription = { oldPath, newPath, editType: EditType.Invalid }
    if (!isValidPropertyEditPath(oldPath)) {
      throw new TfError(`Invalid path '${oldPath.pathString}' provided as the source for a property ` +
        'namespace edit.', TfDiagnosticType.CodingError)
    }
    if (!isValidPropertyEditPath(newPath)) {
      throw new TfError(`Invalid path '${newPath.pathString}' provided as the destination for a property ` +
        'namespace edit.', TfDiagnosticType.CodingError)
    }
    this._editDescription.editType = oldPath.getPrimPath().equals(newPath.getPrimPath())
      ? EditType.Rename : EditType.Reparent
    return true
  }

  private _clearProcessedEdits(): void {
    this._processedEdit = undefined
  }

  private _processEditsIfNeeded(): ProcessedEdit {
    // Processed edits are reused between CanApplyEdits and ApplyEdits.
    this._processedEdit ??= EditProcessor.processEdit(
      this._stage, this._dependentStages, this._editDescription, this._editOptions)
    return this._processedEdit
  }
}
