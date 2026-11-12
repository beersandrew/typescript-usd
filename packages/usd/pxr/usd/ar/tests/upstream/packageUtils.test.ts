// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArPackageUtils.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful 1:1 port of pxr/usd/ar/testenv/testArPackageUtils.py
//
// Exercises the four package-relative path functions, including the corner
// cases where literal '[' / ']' characters inside a path segment must be
// escaped/unescaped as they cross the package delimiters.

import { describe, expect, it } from 'vitest'
import {
  ArIsPackageRelativePath,
  ArJoinPackageRelativePath,
  ArSplitPackageRelativePathInner,
  ArSplitPackageRelativePathOuter,
} from '../../src/packageUtils.ts'

describe('ArPackageUtils', () => {
  it('test_IsPackageRelativePath', () => {
    expect(ArIsPackageRelativePath('')).toBe(false)
    expect(ArIsPackageRelativePath('/tmp/foo.pack')).toBe(false)
    expect(ArIsPackageRelativePath('foo[0].pack')).toBe(false)

    expect(ArIsPackageRelativePath('foo.pack[bar.file]')).toBe(true)
    expect(ArIsPackageRelativePath('foo.pack[bar.pack[baz.file]]')).toBe(true)
  })

  it('test_JoinPackageRelativePath', () => {
    expect(ArJoinPackageRelativePath([''])).toBe('')
    expect(ArJoinPackageRelativePath(['foo.pack'])).toBe('foo.pack')
    expect(ArJoinPackageRelativePath(['foo.pack', ''])).toBe('foo.pack')
    expect(ArJoinPackageRelativePath(['foo.pack', 'bar.file'])).toBe(
      'foo.pack[bar.file]',
    )
    expect(ArJoinPackageRelativePath(['foo.pack', 'bar.pack', 'baz.file'])).toBe(
      'foo.pack[bar.pack[baz.file]]',
    )
    expect(ArJoinPackageRelativePath(['foo.pack[bar.pack]', 'baz.file'])).toBe(
      'foo.pack[bar.pack[baz.file]]',
    )
    expect(ArJoinPackageRelativePath(['foo[0].pack', 'baz.file'])).toBe(
      'foo[0].pack[baz.file]',
    )

    // Corner case: ensure delimiter characters in paths are escaped when
    // enclosed in delimiters. (The \\ in the JS string literal is a single
    // literal backslash, matching the Python raw expectation.)
    expect(
      ArJoinPackageRelativePath(['foo]a.pack', 'bar[b.pack', 'baz]c.file']),
    ).toBe('foo]a.pack[bar\\[b.pack[baz\\]c.file]]')
  })

  it('test_SplitPackageRelativePathInner', () => {
    expect(ArSplitPackageRelativePathInner('')).toEqual(['', ''])
    expect(ArSplitPackageRelativePathInner('foo.file')).toEqual(['foo.file', ''])
    expect(ArSplitPackageRelativePathInner('foo.pack[bar.file]')).toEqual([
      'foo.pack',
      'bar.file',
    ])
    expect(
      ArSplitPackageRelativePathInner('foo.pack[bar.pack[baz.file]]'),
    ).toEqual(['foo.pack[bar.pack]', 'baz.file'])
    expect(ArSplitPackageRelativePathInner('foo[0].pack[bar.file]')).toEqual([
      'foo[0].pack',
      'bar.file',
    ])

    // Corner case: delimiters unescaped when removed from delimiters.
    expect(
      ArSplitPackageRelativePathInner('foo]a.pack[bar\\[b.pack[baz\\]c.file]]'),
    ).toEqual(['foo]a.pack[bar\\[b.pack]', 'baz]c.file'])
  })

  it('test_SplitPackageRelativePathOuter', () => {
    expect(ArSplitPackageRelativePathOuter('')).toEqual(['', ''])
    expect(ArSplitPackageRelativePathOuter('foo.file')).toEqual(['foo.file', ''])
    expect(ArSplitPackageRelativePathOuter('foo.pack[bar.file]')).toEqual([
      'foo.pack',
      'bar.file',
    ])
    expect(
      ArSplitPackageRelativePathOuter('foo.pack[bar.pack[baz.file]]'),
    ).toEqual(['foo.pack', 'bar.pack[baz.file]'])
    expect(ArSplitPackageRelativePathOuter('foo[0].pack[bar.file]')).toEqual([
      'foo[0].pack',
      'bar.file',
    ])

    // Corner case: only the outermost delimiters are stripped, so the inner
    // ']' stays escaped in the packaged remainder.
    expect(
      ArSplitPackageRelativePathOuter('foo]a.pack[bar\\[b.pack[baz\\]c.file]]'),
    ).toEqual(['foo]a.pack', 'bar[b.pack[baz\\]c.file]'])
  })
})
