// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBase.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBase.py: shared
// utilities for verifying the outcomes of edits in the
// testUsdNamespaceEditorDependentEditsXXX tests.

import { expect } from 'vitest'
import type { Layer } from 'typescript-usd/sdf'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Notice as UsdNotice, type NamespaceEditor, type Prim, type Stage } from 'typescript-usd/usd'

export const PrimResyncType = UsdNotice.PrimResyncType
export type PrimResyncType = UsdNotice.PrimResyncType

export type ExpectedContents = { '.'?: string[] } & { [childName: string]: ExpectedContents | string[] | undefined }

export class NsEditorDependentEditsBase {
  resyncedObjectsPerStage = new Map<Stage, Record<string, PrimResyncType>>()

  /**
   * ApplyEdits: adds the namespace edits with addEdits, verifies they can be
   * applied (with the expected warnings), and applies them while recording
   * each stage's ObjectsChanged resyncs. Replaces the Python context manager:
   *
   *   base.applyEdits(editor, 'Move /Foo to /Bar', () => {
   *     expect(editor.movePrimAtPath('/Foo', '/Bar')).toBe(true)
   *   })
   */
  applyEdits(editor: NamespaceEditor, label: string, addEdits: () => void,
    expectedWarnings: readonly string[] = []): void {
    void label
    addEdits()

    // The edit can be applied, potentially with the expected warnings.
    const result = editor.canApplyEdits()
    expect(result.ok, result.errors.join('; ')).toBe(true)
    expect(result.warnings.length, result.warnings.join('\n')).toBe(expectedWarnings.length)
    expectedWarnings.forEach((expectedWarn, i) => {
      expect(result.warnings[i]).toContain(expectedWarn)
    })

    this.resyncedObjectsPerStage = new Map()
    const objectsChanged = TfNotice.registerGlobally(UsdNotice.ObjectsChanged,
      (notice: UsdNotice.ObjectsChanged) => this.onObjectsChanged(notice))
    try {
      expect(editor.applyEdits()).toBe(true)
    } finally {
      objectsChanged.revoke()
    }
  }

  // _OnObjectsChanged: classifies each resynced path, verifying the
  // associated paths of Source/Destination resync types.
  protected onObjectsChanged(notice: UsdNotice.ObjectsChanged): void {
    const complement = new Map<PrimResyncType, PrimResyncType>([
      [PrimResyncType.RenameSource, PrimResyncType.RenameDestination],
      [PrimResyncType.ReparentSource, PrimResyncType.ReparentDestination],
      [PrimResyncType.RenameAndReparentSource, PrimResyncType.RenameAndReparentDestination],
      [PrimResyncType.RenameDestination, PrimResyncType.RenameSource],
      [PrimResyncType.ReparentDestination, PrimResyncType.ReparentSource],
      [PrimResyncType.RenameAndReparentDestination, PrimResyncType.RenameAndReparentSource],
    ])
    const getResyncTypeWithVerification = (path: string): PrimResyncType => {
      const [resyncType, associatedPath] = notice.getPrimResyncType(path)
      const associatesResyncType = complement.get(resyncType)
      if (associatesResyncType !== undefined) {
        expect(associatedPath, `Failed check of GetPrimResyncType(${path}) on ObjectsChanged notice`)
          .toBeTruthy()
        expect(notice.getPrimResyncType(associatedPath),
          `Failed check of associated GetPrimResyncType(${associatedPath}) on ObjectsChanged notice`)
          .toEqual([associatesResyncType, path])
      } else {
        expect(associatedPath).toBeFalsy()
      }
      return resyncType
    }
    const resyncs: Record<string, PrimResyncType> = {}
    for (const resyncedPath of notice.getResyncedPaths().toArray()) {
      resyncs[String(resyncedPath)] = getResyncTypeWithVerification(String(resyncedPath))
    }
    this.resyncedObjectsPerStage.set(notice.getStage(), resyncs)
  }

  // _VerifyStageResyncNotices: null expects no notice from the stage.
  verifyStageResyncNotices(stage: Stage, expectedResyncsDict: Record<string, PrimResyncType> | null): void {
    if (expectedResyncsDict === null) {
      expect(this.resyncedObjectsPerStage.has(stage)).toBe(false)
    } else {
      expect(this.resyncedObjectsPerStage.get(stage)).toEqual(expectedResyncsDict)
    }
  }

  // _VerifyPrimContents: a prim's property names ('.') and children, all
  // children included (unloaded and undefined ones too).
  verifyPrimContents(stage: Stage, prim: Prim, expectedContentsDict: ExpectedContents): void {
    const expectedPropertyNameSet = new Set(expectedContentsDict['.'] ?? [])
    const propertyNameSet = new Set(prim.getPropertyNames())
    expect([...propertyNameSet].sort(),
      `The actual property set does not match the expected property set for the prim at path ${prim.path}`)
      .toEqual([...expectedPropertyNameSet].sort())

    const expectedChildNameSet = new Set(Object.keys(expectedContentsDict).filter(k => k !== '.'))
    const childrenNameSet = new Set(prim.getAllChildren().map(child => child.path.slice(child.path.lastIndexOf('/') + 1)))
    expect([...childrenNameSet].sort(),
      `The actual child prim set does not match the expected children set for the prim at path ${prim.path}`)
      .toEqual([...expectedChildNameSet].sort())

    for (const childName of expectedChildNameSet) {
      const childPath = prim.path === '/' ? `/${childName}` : `${prim.path}/${childName}`
      this.verifyPrimContents(stage, stage.getPrim(childPath)!, expectedContentsDict[childName] as ExpectedContents)
    }
  }

  // _VerifyStageContents.
  verifyStageContents(stage: Stage, expectedContentsDict: ExpectedContents): void {
    this.verifyPrimContents(stage, stage.getPrim('/')!, expectedContentsDict)
  }

  // _GetCompositionFieldsInLayer: each prim spec path with composition fields
  // mapped to the fields' applied items; layer relocates under '/'.
  getCompositionFieldsInLayer(layer: Layer): Record<string, Record<string, unknown>> {
    const compositionFields: Record<string, Record<string, unknown>> = {}
    const relocates = layer.getField('/', 'layerRelocates')
    if (relocates !== undefined) compositionFields['/'] = { relocates }

    layer.traverse('/', (specPath: string) => {
      const prim = layer.getPrimAtPath(specPath)
      if (!prim) return
      const add = (fieldName: string, items: unknown[]): void => {
        (compositionFields[specPath] ??= {})[fieldName] = items
      }
      if (prim.hasReferences()) add('references', prim.getReferenceList().getAppliedItems())
      if (prim.hasPayloads()) add('payload', prim.getPayloadList().getAppliedItems())
      if (prim.hasInheritPaths()) add('inherits', prim.getInheritPathList().getAppliedItems())
      if (prim.hasSpecializes()) add('specializes', prim.getSpecializesList().getAppliedItems())
    })
    return compositionFields
  }
}
