// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfBatchNamespaceEdit.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfBatchNamespaceEdit.py,
// with its testSdfBatchNamespaceEdit.testenv fixtures.

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BatchNamespaceEdit, Layer, NamespaceEdit, NamespaceEditDetail, NamespaceEditDetailResult,
  type NamespaceEditDetail as SdfNamespaceEditDetail,
} from '../../src/index.ts'
import { SdfPath } from '../../src/path.ts'

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/batchNamespaceEdit/${name}`, import.meta.url))

// Process() returns (bool, edits) in Python; here the processed edits or
// undefined.
function checkFail(result: unknown): void {
  expect(result).toBeUndefined()
}

function assertCanApply(layer: Layer, edit: BatchNamespaceEdit): void {
  const details: SdfNamespaceEditDetail[] = []
  expect(layer.canApply(edit, details), details.map(d => d.reason).join(', '))
    .toBe(NamespaceEditDetailResult.Okay)
}

describe('testSdfBatchNamespaceEdit', () => {
  it('test_EqualityOperators', () => {
    expect(new NamespaceEdit('/A', '/B').equals(new NamespaceEdit('/A', '/B'))).toBe(true)
    expect(new NamespaceEdit('/B', '/A').equals(new NamespaceEdit('/A', '/B'))).toBe(false)

    // Vary a single field from a prototype detail at a time.
    const prototype = new NamespaceEditDetail(
      NamespaceEditDetail.Okay, new NamespaceEdit('/A', '/B'), 'reason')
    expect(prototype.equals(new NamespaceEditDetail(prototype.result, prototype.edit, prototype.reason)))
      .toBe(true)
    expect(prototype.equals(new NamespaceEditDetail(
      NamespaceEditDetail.Unbatched, prototype.edit, prototype.reason))).toBe(false)
    expect(prototype.equals(new NamespaceEditDetail(
      prototype.result, new NamespaceEdit('/C', '/D'), prototype.reason))).toBe(false)
    expect(prototype.equals(new NamespaceEditDetail(
      prototype.result, prototype.edit, 'a different reason'))).toBe(false)
  })

  it('test_Basic', async () => {
    const testEdits = [
      new NamespaceEdit('/C', '/D'),
      new NamespaceEdit('/B', '/C'),
      new NamespaceEdit('/D', '/B'),
      new NamespaceEdit('/X', ''),
    ]
    const editsEqual = (a: readonly NamespaceEdit[], b: readonly NamespaceEdit[]): boolean =>
      a.length === b.length && a.every((e, i) => e.equals(b[i]!))

    // Test constructors.
    let edit = new BatchNamespaceEdit()
    expect(edit.getEdits()).toEqual([])
    let edit2 = new BatchNamespaceEdit(edit.getEdits())
    expect(edit2.getEdits()).toEqual([])
    edit = new BatchNamespaceEdit(testEdits)
    expect(editsEqual(edit.getEdits(), testEdits)).toBe(true)
    edit2 = new BatchNamespaceEdit(edit.getEdits())
    expect(editsEqual(edit2.getEdits(), testEdits)).toBe(true)

    // Test Add().
    edit = new BatchNamespaceEdit()
    edit.add(new NamespaceEdit('/C', '/D'))
    edit.add('/B', '/C')
    edit.add(edit2.getEdits()[edit2.getEdits().length - 2]!)
    edit.add('/X', SdfPath.emptyPath)
    expect(editsEqual(edit.getEdits(), edit2.getEdits())).toBe(true)

    // Test Process().
    const layer = (await Layer.findOrOpen(fixture('test.usda')))!
    const final = (await Layer.findOrOpen(fixture('final.usda')))!

    // Try things that work.
    const hasObject = (p: SdfPath): boolean => layer.getObjectAtPath(p) !== undefined
    const canEdit = (): undefined => undefined
    edit = new BatchNamespaceEdit()
    edit.add('/C', '/D') // Prim renames
    edit.add('/B', '/C')
    edit.add('/D', '/B')
    edit.add('/G', '/E/G') // Prim reparents
    edit.add('/H', '/E/F/H')
    edit.add('/I', '/E/H') // Prim reparent/rename
    edit.add('/J', '/L/J') // Prim reparent
    edit.add('/L/J/K', '/K') // Prim reparent from under a reparented prim
    edit.add('/X', SdfPath.emptyPath) // Prim remove
    edit.add('/E', SdfPath.emptyPath) // Prim with descendants remove

    edit.add('/P.c', '/P.d') // Prim property renames
    edit.add('/P.b', '/P.c')
    edit.add('/P.d', '/P.b')
    edit.add('/P.g', '/Q.g') // Prim property reparents
    edit.add('/P.h', '/Q/R.h')
    edit.add('/P.i', '/Q.h') // Prim property reparent/rename
    edit.add('/P.x', SdfPath.emptyPath) // Prim property remove

    edit.add('/S', '/T') // Rename prim used in targets

    edit.add('/V{v=three}.x', '/V{v2=three}.x') // Same variant name
    edit.add('/V{v=three}X', '/V{v2=three}X') // Same variant name
    edit.add('/V{v=one}U', '/V{v=two}W/U') // Variant prim reparent/rename
    edit.add('/V{v=two}W', SdfPath.emptyPath) // Variant prim remove
    edit.add('/V{v=one}.u', '/V{v=two}.u') // Variant property reparent/rename
    edit.add('/V{v=two}.w', SdfPath.emptyPath) // Variant property remove

    let processed = edit.process(hasObject, canEdit)
    expect(processed && editsEqual(processed, edit.getEdits())).toBe(true)

    // Again: nothing actually changed in the layer.
    processed = edit.process(hasObject, canEdit)
    expect(processed && editsEqual(processed, edit.getEdits())).toBe(true)

    // A redundant edit is not returned by Process().
    edit.add('/E/F', SdfPath.emptyPath) // Remove implicitly removed prim
    expect(edit.process(hasObject, canEdit)).toBeDefined()

    // Try lots of things that don't work.
    const failing = (edits: Array<[string, string]>, has = hasObject,
      can: (e: NamespaceEdit) => string | undefined = canEdit): void => {
      const batch = new BatchNamespaceEdit()
      for (const [from, to] of edits) batch.add(from, to)
      checkFail(batch.process(has, can))
    }
    failing([['/Y', '/Z']]) // Unknown object.
    failing([['/X', '/B']]) // Object exists at new path.
    failing([['/X', '/B/Y/Z']]) // Object doesn't exist for parent.
    failing([['/E', '/E/F/E']]) // Object would be its own ancestor.
    failing([['/G', '/E/G'], ['/H', '/E/G']]) // Object will already exist.
    failing([['/', '/']]) // Unsupported path: root.
    failing([['/X.a.mapper[/B]', '/Z']]) // Unsupported path: mapper.
    failing([['/X.a.mapper[/B].c', '/Z']]) // Unsupported path: mapper arg.
    failing([['/X.a.expression', '/Z']]) // Unsupported path: expression.
    failing([['/Z', '/Z.z']]) // Path type mismatch.
    failing([['/Z', '/Z.z[/Z].z']]) // Path type mismatch.
    failing([['/Z.z', '/Z']]) // Path type mismatch.
    failing([['/C', '/D']], () => false) // hasObject fails.
    failing([['/C', '/D']], hasObject, () => "Can't edit") // canEdit fails.

    // Test live edits on layer.
    edit = new BatchNamespaceEdit()
    edit.add('/C', '/D', NamespaceEdit.Same) // Prim renames
    edit.add('/B', '/C', NamespaceEdit.Same)
    edit.add('/D', '/B', NamespaceEdit.Same)
    edit.add('/G', '/E/G') // Prim reparents
    edit.add('/H', '/E/F/H')
    edit.add('/I', '/E/H') // Prim reparent/rename
    edit.add('/J', '/L/J') // Prim reparent
    edit.add('/L/J/K', '/K') // Prim reparent from under a reparented prim
    edit.add('/X', SdfPath.emptyPath) // Prim remove
    edit.add('/E', SdfPath.emptyPath) // Prim with descendants remove
    edit.add('/E/F', SdfPath.emptyPath) // Remove implicitly removed prim

    edit.add('/P.c', '/P.d') // Prim property renames
    edit.add('/P.b', '/P.c')
    edit.add('/P.d', '/P.b')
    edit.add('/P.g', '/Q.g') // Prim property reparents
    edit.add('/P.h', '/Q/R.h')
    edit.add('/P.i', '/Q.h') // Prim property reparent/rename
    edit.add('/P.x', SdfPath.emptyPath) // Prim property remove

    edit.add('/V{v=three}.x', '/V{v2=three}.x') // Same variant name
    edit.add('/V{v=three}X', '/V{v2=three}X') // Same variant name
    edit.add('/V{v=one}U', '/V{v=two}W/U') // Variant prim reparent/rename
    edit.add('/V{v=two}W', SdfPath.emptyPath) // Variant prim remove
    edit.add('/V{v=one}.u', '/V{v=two}.u') // Variant property reparent/rename
    edit.add('/V{v=two}.w', SdfPath.emptyPath) // Variant property remove

    assertCanApply(layer, edit)
    layer.apply(edit)
    expect(layer.exportToString()).toBe(final.exportToString())
  })

  it('test_DescendantMoveDeadspace', () => {
    const layer = Layer.createAnonymous()
    layer.importFromString(`#usda 1.0
            def Prim "A" {
                custom double a
                def Prim "B" {
                    custom double b
                }
            }`)
    const edit = new BatchNamespaceEdit()
    edit.add(new NamespaceEdit('/A/B', '/_B'))
    edit.add(new NamespaceEdit('/A', '/_A'))
    edit.add(new NamespaceEdit('/_B', '/_A/B'))

    assertCanApply(layer, edit)
    expect(layer.apply(edit)).toBe(true)
    // </A> -> </_A>
    expect(layer.getPropertyAtPath('/_A.a')).toBeDefined()
    // </A/B> -> </_B> -> </_A/B>
    expect(layer.getPropertyAtPath('/_A/B.b')).toBeDefined()
  })

  it('test_DescendantPreserveDeadspace', () => {
    const layer = Layer.createAnonymous()
    layer.importFromString(`#usda 1.0
            def Prim "A" {
                custom double a
                def Prim "B" {
                    custom double b
                }
            }
            def Prim "C" {
                custom double c
            }`)
    const edit = new BatchNamespaceEdit()
    edit.add(new NamespaceEdit('/A/B', '/_B'))
    edit.add(new NamespaceEdit('/A', '/_A'))
    edit.add(new NamespaceEdit('/_A', '/A'))
    edit.add(new NamespaceEdit('/C', '/A/B'))

    assertCanApply(layer, edit)
    expect(layer.apply(edit)).toBe(true)
    // </A/B> -> </_B>
    expect(layer.getPropertyAtPath('/_B.b')).toBeDefined()
    // </A> -> </_A> -> </A>
    expect(layer.getPropertyAtPath('/A.a')).toBeDefined()
    // </C> -> </A/B>
    expect(layer.getPropertyAtPath('/A/B.c')).toBeDefined()
  })

  it('test_ParentRemoved', () => {
    const layer = Layer.createAnonymous()
    layer.importFromString(`#usda 1.0
            def Prim "A" {
                def Prim "B" {}
            }
            def Prim "C" {}`)
    const edit = new BatchNamespaceEdit()
    edit.add(new NamespaceEdit('/A/B', '/_B'))
    edit.add(new NamespaceEdit('/A', '/_A'))
    edit.add(new NamespaceEdit('/_B', '/_A/B/C'))
    const details: SdfNamespaceEditDetail[] = []
    checkFail(edit.process(path => layer.getObjectAtPath(path) !== undefined, () => undefined, details))
    expect(details.at(-1)?.reason).toBe('New parent was removed')
  })
})
