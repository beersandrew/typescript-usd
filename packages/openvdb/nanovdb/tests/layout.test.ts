// The TS port hard-codes the NanoVDB struct layouts; this suite pins them
// to testdata/fixtures/layout.json, which is sizeof/offsetof dumped from
// the pinned upstream checkout by tools/oracle/layout_dump.cc. Any upstream
// layout drift fails here before it can silently misparse.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { FLOAT_LAYOUT, VEC3F_LAYOUT, GRID_DATA_SIZE, TREE_DATA_SIZE, type GridLayout } from '../src/index.ts'

const layout = JSON.parse(
  readFileSync(join(__dirname, '../../testdata/fixtures/layout.json'), 'utf-8'),
) as Record<string, Record<string, number>>

describe('layout constants match the C++ oracle', () => {
  it('GridData', () => {
    expect(layout['GridData']!['size']).toBe(GRID_DATA_SIZE)
  })

  it('TreeData', () => {
    expect(layout['TreeData']!['size']).toBe(TREE_DATA_SIZE)
  })

  function checkTyped(name: string, ours: GridLayout): void {
    const theirs = layout[name]!
    for (const [key, value] of Object.entries(ours)) {
      expect(theirs[key], `${name}.${key}`).toBe(value)
    }
  }

  it('float node layouts', () => {
    checkTyped('float', FLOAT_LAYOUT)
  })

  it('Vec3f node layouts', () => {
    checkTyped('Vec3f', VEC3F_LAYOUT)
  })
})
