// Ported from OpenUSD 26.11.1: pxr/usd/usd/module.cpp,
//  pxr/usd/usd/testenv/testUsdGenSchema/baseline/init/moduleDeps.cpp
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdGenSchema (pinned v26.05) —
// the REGISTRY-OUTPUT slice: usdGenSchema's two registry artifacts,
// generatedSchema.usda + plugInfo.json, diffed against upstream's checked-in
// baselines.
//
// FLIPPED GREEN 2026-07-06 (F2): all 33 scoreboard cases self-promoted in one
// sweep when the usdGenSchema implementation landed — semantic + byte cases
// for basic/codeless/codeless_sublayer/namespace/useLiteralIdentifier and all
// 24 schemaFail rejections. Every '(byte-identical)' case is exact: the sdf
// writer gained the upstream text-writer behaviors (Quote's quote-selection/
// triple-quoting, VtValue bools as 1/0, @asset@ paths, GfMatrix "( (..) )"
// spacing, dictionary-sorted metadata sections, multiline dictionaries), so
// no graded formatting divergences remain here.
//
// F2 follow-up (not covered here): running usdGenSchema over a REAL vendored
// domain's schema.usda (e.g. usdShade) and diffing against the vendored
// generatedSchema.usda needs upstream's schema.usda inputs — including the
// full usd-core schema.usda sublayer — which are deliberately NOT vendored
// (RFC §7.1: vendoring stays limited to the two registry artifacts). The
// closest in-tree input, fixtures/codelessPortability/usdSchemaExamples/
// schema.usda, sublayers @usd/schema.usda@ and is skipped for the same
// reason.
//
// Inputs + baselines are vendored VERBATIM from
// OpenUSD/pxr/usd/usd/testenv/testUsdGenSchema/ into
// fixtures/genSchema/ (upstream subdir structure kept). The testenv is
// self-contained: every variant sublayers the testenv's own baseSchema.usda
// (a mini usd-core defining Typed/Model/APISchemaBase — libraryName "usd"),
// not the real pxr/usd/usd/schema.usda, so resolveAsset serves the vendored
// fixture files by basename.
//
// Variant → input mapping (derived from the input headers + baseline diffs):
//   basic                → schema.usda (⊂ schema_sublayer.usda ⊂ baseSchema.usda)
//   codeless             → codeless_schema.usda (skipCodeGeneration=true;
//                          baseline has plugInfo.json ONLY — no
//                          generatedSchema.usda is checked in upstream, and
//                          its plugInfo differs from basic's solely in
//                          "Type": "resource" vs "library")
//   codeless_sublayer    → codeless_sublayer_schema.usda (⊂ codeless_schema.usda)
//   namespace            → ns_schema.usda
//   useLiteralIdentifier → schema_useLiteralIdentifier.usda
//   schemaFail*.usda     → 24 error inputs, must be rejected
//
// EXCLUDED from this port (enumerated per task):
//   * All C++/Python codegen baselines — *.h/*.cpp/wrap*.cpp/tokens.*/api.h,
//     generatedSchema.module.h, generatedSchema.classes.txt in
//     baseline/basic + the per-namespace dirs, and baseline/init/ entirely
//     (__init__.py, module.cpp, moduleDeps.cpp, CMakeLists.txt, userDoc):
//     TS-class codegen is a later phase (RFC §5 F4).
//   * baseline/nestedNamespace and baseline/headerTerminatorString as
//     separate CASES: their distinguishing knobs (C++ namespace wrapping,
//     --headerTerminatorString) affect codegen only — their
//     generatedSchema.usda and plugInfo.json are byte-identical to
//     baseline/namespace's (verified below by a green fixture-integrity
//     test over the vendored copies). The namespace case covers all three.
//
// Byte-identity note: the '(byte-identical)' cases are kept SEPARATE from the
// semantic cases so that any future downgrade of exact text equality to a
// graded formatting divergence stays visible on the scoreboard. As of the F2
// flip all byte cases pass exactly.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { usdGenSchema } from 'typescript-usd/usd'
import { Layer } from 'typescript-usd/usd/_internal'
import type { Info as PlugInfo, InfoPlugin as PlugInfoPlugin } from 'typescript-usd/plug'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures', 'genSchema')

function readFixture(...rel: string[]): string {
  return readFileSync(path.join(FIXTURES, ...rel), 'utf8')
}

// resolveAsset for sublayer references (@baseSchema.usda@ etc.) — serves the
// vendored testenv files by basename, mirroring upstream's resolver finding
// them next to the input schema.usda.
async function resolveAsset(assetPath: string): Promise<string> {
  return readFixture(assetPath)
}

// Upstream plugInfo.json files carry '#' comment lines; the Js parser can't,
// so plug/info.cpp strips lines whose first non-whitespace run is the comment
// ("Convert any # comments to whitespace", info.cpp:153). Same treatment here
// before JSON.parse.
function parsePlugInfoText(text: string): PlugInfo {
  const stripped = text
    .split('\n')
    .map((line) => (line.search(/\S/) === line.indexOf('#') && line.includes('#') ? '' : line))
    .join('\n')
  return JSON.parse(stripped) as PlugInfo
}

// Structural view of a plugInfo document for comparison: the build-path keys
// (Root/LibraryPath/ResourcePath — upstream @PLUG_INFO_*@ placeholders) are
// filesystem locators with no TS analog and are ignored; everything
// registry-relevant (Name, Type, Info.Types, ...) is kept.
function comparablePlugins(info: PlugInfo): Array<Record<string, unknown>> {
  return (info.Plugins ?? []).map((plugin: PlugInfoPlugin) => {
    const { Root: _r, LibraryPath: _l, ResourcePath: _p, ...rest } = plugin
    return rest
  })
}

// Semantic snapshot of a usda text: parse with the repo's own layer API and
// collect every spec's fields. Comparing snapshots compares composed spec
// CONTENT (fallbacks, allowedTokens, apiSchemas listOps, property order
// fields, ...) independent of text formatting.
function layerSnapshot(usdaText: string, tag: string): Record<string, Record<string, unknown>> {
  const layer = Layer.createInMemory(`${tag}.usda`, usdaText)
  const snapshot: Record<string, Record<string, unknown>> = {}
  for (const specPath of layer.getSpecPaths().sort()) {
    const fields: Record<string, unknown> = {}
    for (const field of layer.getFieldNames(specPath).sort()) {
      fields[field] = layer.getField(specPath, field)
    }
    snapshot[specPath] = fields
  }
  return snapshot
}

describe('usdGenSchema registry outputs vs upstream baselines (testUsdGenSchema)', () => {
  it('fixture integrity: namespace / nestedNamespace / headerTerminatorString registry baselines are byte-identical', () => {
    // Justifies collapsing the three variants into the single namespace case:
    // their knobs only vary the C++ codegen, never the registry artifacts.
    const ns = readFixture('baseline', 'namespace', 'generatedSchema.usda')
    const nsPlug = readFixture('baseline', 'namespace', 'plugInfo.json')
    for (const variant of ['nestedNamespace', 'headerTerminatorString']) {
      expect(readFixture('baseline', variant, 'generatedSchema.usda')).toBe(ns)
      expect(readFixture('baseline', variant, 'plugInfo.json')).toBe(nsPlug)
    }
  })

  it('basic: generatedSchema.usda spec content + plugInfo Types match baseline/basic', async () => {
    const result = await usdGenSchema(readFixture('schema.usda'), { resolveAsset })

    expect(result.isCodeless).toBe(false)
    expect(layerSnapshot(result.generatedSchemaUsda, 'ours-basic')).toEqual(
      layerSnapshot(readFixture('baseline', 'basic', 'generatedSchema.usda'), 'baseline-basic'),
    )
    // All Types entries in the baseline are autoGenerated=true, so generation
    // from scratch must reproduce them exactly (upstream's merge-with-existing
    // plugInfo.json only preserves non-autoGenerated hand edits).
    expect(comparablePlugins(result.plugInfo)).toEqual(
      comparablePlugins(parsePlugInfoText(readFixture('baseline', 'basic', 'plugInfo.json'))),
    )
  })

  it('basic: generatedSchema.usda (byte-identical)', async () => {
    const result = await usdGenSchema(readFixture('schema.usda'), { resolveAsset })
    expect(result.generatedSchemaUsda).toBe(readFixture('baseline', 'basic', 'generatedSchema.usda'))
  })

  it('codeless: plugInfo Types match baseline/codeless with Type "resource"', async () => {
    // baseline/codeless contains ONLY plugInfo.json (no generatedSchema.usda
    // is checked in upstream); it differs from baseline/basic solely in
    // "Type": "resource". skipCodeGeneration=true must flow through.
    const result = await usdGenSchema(readFixture('codeless_schema.usda'), { resolveAsset })

    expect(result.isCodeless).toBe(true)
    const baseline = parsePlugInfoText(readFixture('baseline', 'codeless', 'plugInfo.json'))
    expect(baseline.Plugins?.[0]?.Type).toBe('resource') // fixture-derived expectation
    expect(comparablePlugins(result.plugInfo)).toEqual(comparablePlugins(baseline))
  })

  it('codeless_sublayer: generatedSchema.usda spec content + plugInfo match baseline/codeless_sublayer', async () => {
    // Sublayers the codeless schema: only the NEW class (DerivedTestPxHairman)
    // lands in the output artifacts; codelessness carries through
    // (Type: "resource" in the baseline).
    const result = await usdGenSchema(readFixture('codeless_sublayer_schema.usda'), { resolveAsset })

    expect(result.isCodeless).toBe(true)
    expect(layerSnapshot(result.generatedSchemaUsda, 'ours-codeless-sublayer')).toEqual(
      layerSnapshot(
        readFixture('baseline', 'codeless_sublayer', 'generatedSchema.usda'),
        'baseline-codeless-sublayer',
      ),
    )
    expect(comparablePlugins(result.plugInfo)).toEqual(
      comparablePlugins(parsePlugInfoText(readFixture('baseline', 'codeless_sublayer', 'plugInfo.json'))),
    )
  })

  it('codeless_sublayer: generatedSchema.usda (byte-identical)', async () => {
    const result = await usdGenSchema(readFixture('codeless_sublayer_schema.usda'), { resolveAsset })
    expect(result.generatedSchemaUsda).toBe(
      readFixture('baseline', 'codeless_sublayer', 'generatedSchema.usda'),
    )
  })

  it('namespace (ns_schema): generatedSchema.usda spec content + plugInfo match baseline/namespace', async () => {
    const result = await usdGenSchema(readFixture('ns_schema.usda'), { resolveAsset })

    expect(result.isCodeless).toBe(false)
    expect(layerSnapshot(result.generatedSchemaUsda, 'ours-namespace')).toEqual(
      layerSnapshot(readFixture('baseline', 'namespace', 'generatedSchema.usda'), 'baseline-namespace'),
    )
    expect(comparablePlugins(result.plugInfo)).toEqual(
      comparablePlugins(parsePlugInfoText(readFixture('baseline', 'namespace', 'plugInfo.json'))),
    )
  })

  it('namespace (ns_schema): generatedSchema.usda (byte-identical)', async () => {
    const result = await usdGenSchema(readFixture('ns_schema.usda'), { resolveAsset })
    expect(result.generatedSchemaUsda).toBe(readFixture('baseline', 'namespace', 'generatedSchema.usda'))
  })

  it('useLiteralIdentifier: generatedSchema.usda spec content + plugInfo match baseline/useLiteralIdentifier', async () => {
    const result = await usdGenSchema(readFixture('schema_useLiteralIdentifier.usda'), { resolveAsset })

    expect(result.isCodeless).toBe(false)
    expect(layerSnapshot(result.generatedSchemaUsda, 'ours-literal')).toEqual(
      layerSnapshot(
        readFixture('baseline', 'useLiteralIdentifier', 'generatedSchema.usda'),
        'baseline-literal',
      ),
    )
    expect(comparablePlugins(result.plugInfo)).toEqual(
      comparablePlugins(parsePlugInfoText(readFixture('baseline', 'useLiteralIdentifier', 'plugInfo.json'))),
    )
  })

  it('useLiteralIdentifier: generatedSchema.usda (byte-identical)', async () => {
    const result = await usdGenSchema(readFixture('schema_useLiteralIdentifier.usda'), { resolveAsset })
    expect(result.generatedSchemaUsda).toBe(
      readFixture('baseline', 'useLiteralIdentifier', 'generatedSchema.usda'),
    )
  })
})

describe('usdGenSchema rejects invalid schema.usda inputs (schemaFail*)', () => {
  // Each fixture is upstream's schemaFail input verbatim; usdGenSchema must
  // reject it with a real validation error. The assertion still excludes the
  // (retired) scoreboard-stub error message so a regression back to a
  // blanket-throw stub could never masquerade as validation.
  const failCases: Array<[file: string, reason: string]> = [
    ['schemaFail.usda', 'properties whose apiName collide into a duplicate API name'],
    ['schemaFail2.usda', 'token clash: "myVarying:Token" and "myVaryingToken" generate the same identifier'],
    ['schemaFail3.usda', 'two attributes sharing customData apiName "temp"'],
    ['schemaFail4.usda', 'two relationships sharing customData apiName "temp"'],
    ['schemaFail5.usda', 'class typeName and prim name must match'],
    ['schemaFail6.usda', 'disallowed fields authored on a class (active, clips) + rel target / attr connection'],
    ['schemaFail7.usda', 'concrete (typed-named) class that does not inherit </Typed>'],
    ['schemaFail8.usda', 'ill-defined API schema: class name missing the required "API" suffix'],
    ['schemaFail9.usda', 'non-applied API schema inheriting from an applied API schema'],
    ['schemaFail10.usda', 'single-apply API schema inheriting from another API schema'],
    ['schemaFail11.usda', 'multiple-apply API schema inheriting from another API schema'],
    ['schemaFail12.usda', 'multiple-apply API schema with properties but no propertyNamespacePrefix'],
    ['schemaFail13.usda', 'multiple-apply API schema with propertyNamespacePrefix but no properties'],
    ['schemaFail14.usda', 'single-apply API schema using propertyNamespacePrefix'],
    ['schemaFail15.usda', 'API schema using the fallbackPrimTypes metadata field'],
    ['schemaFail16.usda', 'abstract typed schema using the fallbackPrimTypes metadata field'],
    ['schemaFail17.usda', 'typed schema using the apiSchemaAutoApplyTo customData field'],
    ['schemaFail18.usda', 'multiple-apply API schema using the apiSchemaAutoApplyTo customData field'],
    ['schemaFail19.usda', "multiple-apply API schema including 'apiSchemas'"],
    ['schemaFail20.usda', "non-applied API schema including 'apiSchemas'"],
    ['schemaFail21.usda', 'versioned schema inheriting from another schema in the same family'],
    ['schemaFail22.usda', 'schema identifier that cannot parse into a valid family and version'],
    ['schemaFail23.usda', 'disallowed field "kind" authored on a class'],
    ['schemaFail24.usda', 'multiple-apply API schema authoring propertyOrder (reorder properties)'],
  ]

  for (const [file, reason] of failCases) {
    it(`rejects ${file}: ${reason}`, async () => {
      const error = await usdGenSchema(readFixture(file), { resolveAsset }).then(
        () => null,
        (e: unknown) => e,
      )
      // Must be rejected...
      expect(error).not.toBeNull()
      // ...by a real validation error, not the F2 scoreboard stub.
      expect(String(error)).not.toMatch(/scoreboard stub/)
    })
  }
})
