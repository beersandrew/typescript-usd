// Ported from OpenUSD 26.11.1: pxr/usd/usdVol/testenv/testUsdVolVolume.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdVol/testenv/testUsdVolVolume.py.
// Python SdfPath values are compared as path strings; SdfPath.isEmpty is
// the empty string (UsdVolVolume::GetFieldPath returns SdfPath::EmptyPath()).
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Xform } from 'typescript-usd/usdGeom'
import { Volume, Field3DAsset, OpenVDBAsset } from 'typescript-usd/usdVol'

describe('testUsdVolVolume', () => {
  it('test_VolumeFieldManagement', async () => {
    // We'll set up a stage where we have a referenced volume and fields,
    // so that we can test blocking field rels.
    const stage = Stage.createNew()
    const base = Xform.define(stage, '/base')
    const vol = Volume.define(stage, '/base/volume')
    const f1 = Field3DAsset.define(stage, '/base/volume/f3dField')
    const f2 = OpenVDBAsset.define(stage, '/base/volume/vdbField')

    vol.createFieldRelationship('diffuse', f1.path)
    vol.createFieldRelationship('emissive', f2.path)

    const refed = stage.definePrim('/volModel')
    // UsdReferences::AddInternalReference: an empty asset path.
    await refed.getReferences().addReference('', base.path)
    const refVol = Volume.get(stage, '/volModel/volume')

    expect(refVol.isValid()).toBe(true)
    expect(refVol.hasFieldRelationship('diffuse')).toBe(true)
    expect(refVol.getFieldPath('diffuse')).toBe('/volModel/volume/f3dField')

    const fieldMap = refVol.getFieldPaths()
    expect(fieldMap.size).toBe(2)
    expect(fieldMap.get('diffuse')).toBe('/volModel/volume/f3dField')
    expect(fieldMap.get('emissive')).toBe('/volModel/volume/vdbField')

    expect(refVol.getFieldPath('diffuse')).toBe('/volModel/volume/f3dField')
    expect(refVol.hasFieldRelationship('diffuse')).toBe(true)

    // Now block diffuse, and ensure API reflects it.
    refVol.blockFieldRelationship('diffuse')
    const fieldMap2 = refVol.getFieldPaths()
    expect(fieldMap2.size).toBe(1)
    expect(refVol.getFieldPath('diffuse')).toBe('')
    expect(refVol.hasFieldRelationship('diffuse')).toBe(true)

    // Add a field to a bogus prim path.  We do not attempt to
    // validate bad paths in the API
    refVol.createFieldRelationship('specular', '/no/such/prim')
    const fieldMap3 = refVol.getFieldPaths()
    expect(fieldMap3.size).toBe(2)
    expect(refVol.getFieldPath('specular')).not.toBe('')
    expect(refVol.hasFieldRelationship('specular')).toBe(true)

    // re-establish diffuse, locally
    refVol.createFieldRelationship('diffuse', '/volModel/volume/f3dField')
    const fieldMap4 = refVol.getFieldPaths()
    expect(fieldMap4.size).toBe(3)
    expect(fieldMap4.get('diffuse')).toBe('/volModel/volume/f3dField')
    expect(fieldMap4.get('emissive')).toBe('/volModel/volume/vdbField')
  })
})
