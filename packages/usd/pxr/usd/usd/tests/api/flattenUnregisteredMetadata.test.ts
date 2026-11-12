// Ported from OpenUSD 26.11.1: pxr/usd/sdf/spec.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/flattenUnregisteredMetadata (FIXTURES.md).
// UsdStage::Flatten copies metadata through SdfSpec::SetInfo, which refuses
// fields with no schema definition, so unregistered metadata is dropped
// with a warning (usd/stage.cpp:5658-5675, sdf/spec.cpp:194-223).
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'

const fixture = fileURLToPath(new URL('../fixtures/flattenUnregisteredMetadata/', import.meta.url))

it('Stage.flatten drops unregistered metadata as OpenUSD does', async () => {
  const stage = (await Stage.open(fixture + 'root.usda'))!
  try {
    expect(stage.flatten(false).exportToString())
      .toBe(readFileSync(fixture + 'flattened.usda', 'utf8'))
  } finally {
    stage.dispose()
  }
})
