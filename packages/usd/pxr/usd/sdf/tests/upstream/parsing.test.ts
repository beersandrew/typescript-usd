// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfParsing.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/sdf/testenv/testSdfParsing.py, with its
// testSdfParsing.testenv inputs and baselines (fixtures/testSdfParsing.testenv,
// copied unmodified; see fixtures/testSdfParsing.README.md).
//
// testSdfParsing.py:43-321 opens every listed file. A file with "_bad_" in its
// name must fail to open with an error (Tf.ErrorException; for the BOM cases
// one whose message asks for UTF-8 without the BOM, :258-263). Every other
// file must open, then Sdf.Layer.Export, Sdf.Layer.ExportToString and
// Sdf.Layer.OpenAsAnonymous(metadataOnly=True).Export must each reproduce
// its baseline (:266-310), the metadata-only export against the baseline's
// layer-metadata block under a "#usda 1.0" header (:284-301). Upstream runs
// all files in one test_Basic; here each file is its own case, and the
// metadata-only comparison is a case of its own so it is reported separately.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'

const layerDir = fileURLToPath(new URL('./fixtures/testSdfParsing.testenv', import.meta.url))
const baselineDir = path.join(layerDir, 'baseline')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testSdfParsing-'))
afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }))

// testSdfParsing.py:166-168: Plug.Registry().RegisterPlugins(layerDir).
PlugRegistry.GetInstance().RegisterPlugins(
  JSON.parse(fs.readFileSync(path.join(layerDir, 'plugInfo.json'), 'utf8')))

// testSdfParsing.py:47-234, verbatim and in upstream order.
const testFiles = [
  '233_dictionary_pathExpressions.usda',
  '232_bad_layer_with_utf32_BOM.usda',
  '231_bad_layer_with_utf16_BOM.usda',
  '230_bad_layer_with_utf8_BOM.usda',
  '229_bad_spline_extrap_loop_boundary.usda',
  '228_spline_extrap_loop_boundary.usda',
  '227_arrayEdits.usda',
  '226_version_1.1.usda',
  '225_multiline_with_SplineKnotParamList.usda',
  '224_spline_post_shaping_with_comment.usda',
  '223_bad_spline_post_shaping_spacing.usda',
  '222_dict_key_control_characters.usda',
  '221_bad_spline_type.usda',
  '220_splines.usda',
  '219_utf8_bad_type_name.usda',
  '218_utf8_bad_identifier.usda',
  '217_utf8_identifiers.usda',
  '216_bad_variant_in_relocates_path.usda',
  '215_bad_variant_in_specializes_path.usda',
  '214_bad_variant_in_inherits_path.usda',
  '213_bad_variant_in_payload_path.usda',
  '212_bad_variant_in_reference_path.usda',
  '211_bad_authored_opaque_attributes.usda',
  '210_opaque_attributes.usda',
  '209_bad_escaped_string4.usda',
  '208_bad_escaped_string3.usda',
  '207_bad_escaped_string2.usda',
  '206_bad_escaped_string1.usda',
  '205_bad_assetPaths.usda',
  '204_really_empty.usda',
  '203_newlines.usda',
  '202_displayGroups.usda',
  '201_format_specifiers_in_strings.usda',
  '200_bad_emptyFile.usda',
  '199_bad_colorSpace_metadata.usda',
  '198_colorSpace_metadata.usda',
  '197_bad_colorConfiguration_metadata.usda',
  '196_colorConfiguration_metadata.usda',
  '195_specializes.usda',
  '194_bad_customLayerData_metadata.usda',
  '193_customLayerData_metadata.usda',
  '192_listop_metadata.usda',
  '191_instanceable.usda',
  '190_property_assetInfo.usda',
  '189_prim_assetInfo.usda',
  '188_defaultRefTarget_metadata.usda',
  '187_displayName_metadata.usda',
  '186_bad_prefix_substitution_key.usda',
  '185_namespaced_properties.usda',
  '184_def_AnyType.usda',
  '183_unknown_type_and_metadata.usda',
  '183_time_samples.usda',
  '182_bad_variant_in_relationship.usda',
  '181_bad_variant_in_connection.usda',
  '180_asset_paths.usda',
  '179_bad_shaped_attr_dimensions1_oldtypes.usda',
  '179_bad_shaped_attr_dimensions1.usda',
  '178_invalid_typeName.usda',
  '177_bad_empty_lists.usda',
  '176_empty_lists.usda',
  '175_asset_path_with_colons.usda',
  '163_bad_variant_selection2.usda',
  '162_bad_variant_selection1.usda',
  '161_bad_variant_name2.usda',
  '160_bad_variant_name1.usda',
  '159_symmetryFunction_empty.usda',
  '155_bad_relationship_noLoadHint.usda',
  '154_relationship_noLoadHint.usda',
  '153_bad_payloads.usda',
  '152_payloads.usda',
  '150_bad_kind_metadata_1.usda',
  '149_kind_metadata.usda',
  '148_relocates_empty_map.usda',
  '147_bad_relocates_formatting_5.usda',
  '146_bad_relocates_formatting_4.usda',
  '145_bad_relocates_formatting_3.usda',
  '144_bad_relocates_formatting_2.usda',
  '143_bad_relocates_formatting_1.usda',
  '142_bad_relocates_paths_3.usda',
  '141_bad_relocates_paths_2.usda',
  '140_bad_relocates_paths_1.usda',
  '139_relocates_metadata.usda',
  '133_bad_reference.usda',
  '132_references.usda',
  '127_varyingRelationship.usda',
  '119_bad_permission_metadata_3.usda',
  '118_bad_permission_metadata_2.usda',
  '117_bad_permission_metadata.usda',
  '116_permission_metadata.usda',
  '115_symmetricPeer_metadata.usda',
  '114_bad_prefix_metadata.usda',
  '113_displayName_metadata.usda',
  '112_nested_dictionaries_oldtypes.usda',
  '112_nested_dictionaries.usda',
  '111_string_arrays.usda',
  '108_bad_inheritPath.usda',
  '104_uniformAttributes.usda',
  '103_bad_attributeVariability.usda',
  '100_bad_roleNameChange.usda',
  '99_bad_typeNameChange.usda',
  '98_bad_valueType.usda',
  '97_bad_valueType.usda',
  '96_bad_valueType_oldtypes.usda',
  '96_bad_valueType.usda',
  '95_bad_hiddenRel.usda',
  '94_bad_hiddenAttr.usda',
  '93_hidden.usda',
  '92_bad_variantSelectionType.usda',
  '91_bad_valueType.usda',
  '90_bad_dupePrim.usda',
  '89_bad_attribute_displayUnit.usda',
  '88_attribute_displayUnit.usda',
  '86_bad_tuple_dimensions5.usda',
  '85_bad_tuple_dimensions4_oldtypes.usda',
  '85_bad_tuple_dimensions4.usda',
  '84_bad_tuple_dimensions3_oldtypes.usda',
  '84_bad_tuple_dimensions3.usda',
  '83_bad_tuple_dimensions2_oldtypes.usda',
  '83_bad_tuple_dimensions2.usda',
  '82_bad_tuple_dimensions1_oldtypes.usda',
  '82_bad_tuple_dimensions1.usda',
  '81_namespace_reorder.usda',
  '80_bad_hidden.usda',
  '76_relationship_customData.usda',
  '75_attribute_customData.usda',
  '74_prim_customData.usda',
  '71_empty_shaped_attrs.usda',
  '70_bad_list.usda',
  '69_bad_list.usda',
  '66_bad_attrVariability.usda',
  '64_bad_boolPrimInstantiate.usda',
  '61_bad_primName.usda',
  '60_bad_groupListEditing.usda',
  '59_bad_connectListEditing.usda',
  '58_bad_relListEditing.usda',
  '57_bad_relListEditing.usda',
  '56_bad_value_oldtypes.usda',
  '56_bad_value.usda',
  '55_bad_value_oldtypes.usda',
  '55_bad_value.usda',
  '54_bad_value.usda',
  '53_bad_typeName.usda',
  '52_bad_attr.usda',
  '51_propPath.usda',
  '50_bad_primPath.usda',
  '49_bad_list.usda',
  '47_miscSceneInfo.usda',
  '46_weirdStringContent.usda',
  '45_rareValueTypes.usda',
  '42_bad_noNewlineBetweenComps.usda',
  '41_noEndingNewline.usda',
  '40_repeater.usda',
  '39_variants.usda',
  '38_attribute_connections.usda',
  '37_keyword_properties.usda',
  '36_tasks.usda',
  '33_bad_relationship_duplicate_target.usda',
  '32_relationship_syntax.usda',
  '31_attribute_values_oldtypes.usda',
  '31_attribute_values.usda',
  '30_bad_specifier.usda',
  '29_bad_newline9.usda',
  '28_bad_newline8.usda',
  '27_bad_newline7.usda',
  '26_bad_newline6.usda',
  '25_bad_newline5.usda',
  '24_bad_newline4.usda',
  '23_bad_newline3.usda',
  '22_bad_newline2.usda',
  '21_bad_newline1.usda',
  '20_optionalsemicolons.usda',
  '16_bad_list.usda',
  '15_bad_list.usda',
  '14_bad_value.usda',
  '13_bad_value.usda',
  '12_bad_value.usda',
  '11_debug.usda',
  '10_bad_value.usda',
  '09_bad_type.usda',
  '08_bad_file.usda',
  '06_largevalue.usda',
  '05_bad_file.usda',
  '04_general_oldtypes.usda',
  '04_general.usda',
  '03_bad_file.usda',
  '02_simple.usda',
  '01_empty.usda',
]

// Python's readlines(): lines keep their terminators.
const readLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? []

// testSdfParsing.py:284-301: the expected metadata-only export.
function metadataOnlyExpectation(baseline: string): string {
  const lines = readLines(baseline)
  const mdStart = lines.indexOf('(\n', 1)
  const mdEnd = mdStart < 0 ? -1 : lines.indexOf(')\n', mdStart)
  const expected = mdEnd < 0 ? [lines[0] ?? '', '\n'] : [...lines.slice(0, mdEnd + 1), '\n']
  expected[0] = '#usda 1.0\n'
  return expected.join('')
}

// Upstream accepts only Tf.ErrorException from a failed open (:311-336):
// SdfLayer::FindOrOpen posted errors (here: returns undefined with errors
// posted). A JavaScript engine error escaping the reader, which the open
// posts as "Exception thrown while opening layer", is the analog of its
// "Non-TfError" failure.
function expectParseErrors(errors: readonly string[], file: string) {
  expect(errors.length, `${file} posted no errors`).toBeGreaterThan(0)
  for (const error of errors) {
    expect(error, `${file} failed with ${error}`).not.toMatch(/^Exception thrown while opening layer: /)
  }
  if (file.includes('_BOM')) {
    expect(errors.join('\n')).toContain('please convert the file to UTF-8 without the BOM')
  }
}

describe('testSdfParsing', { timeout: 120_000 }, () => {
  for (const file of testFiles) {
    const layerFile = path.join(layerDir, file)
    if (file.includes('_bad_')) {
      it(`${file}: fails to open with an error`, async () => {
        const mark = new TfErrorMark()
        try {
          const layer = await Layer.findOrOpen(layerFile)
          const errors = mark.getErrors().map(e => e.getCommentary())
          mark.clear()
          expect(layer, `should not be able to load '${layerFile}'`).toBeUndefined()
          expectParseErrors(errors, file)
        } finally {
          mark.dispose()
        }
      })
      continue
    }

    const expectedFile = path.join(baselineDir, file)

    it(`${file}: Export and ExportToString reproduce the baseline`, async () => {
      const layer = (await Layer.findOrOpen(layerFile))!
      expect(layer, `failed to open @${layerFile}@`).toBeTruthy()
      const expected = fs.readFileSync(expectedFile, 'utf8')
      const exportFile = path.join(outDir, `${file.replace(/\.usda$/, '')}_Export.usda`)
      expect(await layer.export(exportFile)).toBe(true)
      expect(fs.readFileSync(exportFile, 'utf8')).toBe(expected)
      expect(layer.exportToString()).toBe(expected)
    })

    it(`${file}: the metadata-only layer exports the baseline's layer metadata`, async () => {
      // Sdf.Layer.OpenAsAnonymous(layerFile, metadataOnly=True), :244-246.
      const openAsAnonymous = (Layer as unknown as {
        openAsAnonymous?: (filePath: string, metadataOnly?: boolean) => Promise<Layer | undefined>
      }).openAsAnonymous
      expect(openAsAnonymous, 'Layer.openAsAnonymous').toBeTypeOf('function')
      const metadataOnlyLayer = await openAsAnonymous!.call(Layer, layerFile, true)
      expect(metadataOnlyLayer, `failed to open @${layerFile}@ for metadata only`).toBeTruthy()
      const exportFile = path.join(outDir, `${file.replace(/\.usda$/, '')}_MetadataOnly.usda`)
      expect(await metadataOnlyLayer!.export(exportFile)).toBe(true)
      expect(fs.readFileSync(exportFile, 'utf8')).toBe(
        metadataOnlyExpectation(fs.readFileSync(expectedFile, 'utf8')))
    })
  }

  it('FindOrOpen of the empty identifier returns no layer', async () => {
    // testSdfParsing.py:317: self.assertEqual(None, Sdf.Layer.FindOrOpen('')).
    expect(await Layer.findOrOpen('')).toBeFalsy()
  })
})
