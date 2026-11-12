// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp, pxr/usd/sdf/spec.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/flattenSchemaTypeNameMismatch (FIXTURES.md).
// UsdStage::Flatten creates each attribute spec with the composed (schema)
// type name and sets the authored value through SdfSpec::SetInfo, which
// casts only to a field's fallback type; default and timeSamples have none,
// so a value whose type differs from the schema's is written as authored
// (usd/stage.cpp:5691-5755, sdf/spec.cpp:225-251, sdf/layer.cpp:3948-3973).
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'

const fixture = fileURLToPath(new URL('../fixtures/flattenSchemaTypeNameMismatch/', import.meta.url))

for (const name of ['repro', 'shapes']) {
  it(`Stage.flatten writes values authored with a non-schema type as OpenUSD does (${name})`, async () => {
    const stage = (await Stage.open(fixture + `${name}.usda`))!
    try {
      expect(stage.flatten(false).exportToString())
        .toBe(readFileSync(fixture + `${name}.flattened.usda`, 'utf8'))
    } finally {
      stage.dispose()
    }
  })
}
