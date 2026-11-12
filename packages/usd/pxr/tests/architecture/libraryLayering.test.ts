// Library layering: every import between pxr libraries must follow OpenUSD's
// CMake library graph (the LIBRARIES argument of each pxr_library(), recorded
// in libraryGraph.json, generated from OpenUSD v26.11.1's CMakeLists.txt
// files by the tooling kept outside this repository; FIXTURES.md). An import
// is permitted when the importing library depends on the imported one
// directly or transitively. A relative import into another
// library's src/ must instead use that library's package entry when one
// exists.
//
// Each violating import site is its own test; known gaps fail until the
// import is moved to where OpenUSD puts it.
import { describe, expect, it } from 'vitest'
import {
  aliasedLibraries,
  libraryOf,
  loadLibraryGraph,
  loadUpstreamLibraryGraph,
  packageEntries,
  repoLibraries,
  scanLibraryImports,
  transitiveDependencies,
} from './libraryImports.ts'

const graph = loadLibraryGraph()
const closure = transitiveDependencies(graph)
const { imports, unresolved } = scanLibraryImports()
const permitted = (from: string, to: string) => closure.get(from)?.has(to) ?? false

const librariesWithEntries = new Set(
  [...packageEntries().values()].map(libraryOf).filter((name): name is string => name !== undefined),
)

describe('OpenUSD library graph table', () => {
  it('is generated from OpenUSD v26.11.1', () => {
    expect(graph.source).toEqual({ tag: 'v26.11.1', commit: '96c1989167d2aaab5bd34627f32a321a6b79866b' })
  })

  it('names every typescript-usd library as an OpenUSD pxr_library', () => {
    const libraries = new Set(imports.flatMap((i) => [i.fromLibrary, i.toLibrary]))
    const upstream = loadUpstreamLibraryGraph().libraries
    expect([...libraries].filter((name) => !upstream[name] && !repoLibraries[name] && !aliasedLibraries[name])).toEqual([])
  })

  it('adds only libraries OpenUSD does not have', () => {
    const upstream = loadUpstreamLibraryGraph().libraries
    expect(Object.keys(repoLibraries).filter((name) => upstream[name])).toEqual([])
  })

  it('keeps the upstream direction between the imaging and usd layers', () => {
    // pxr/imaging/hio/CMakeLists.txt:4-13, pxr/imaging/pxOsd/CMakeLists.txt:4-9,
    // pxr/usdImaging/usdSkelImaging/CMakeLists.txt:4-9.
    expect(permitted('hio', 'usd')).toBe(false)
    expect(permitted('pxOsd', 'hd')).toBe(false)
    expect(permitted('usdSkelImaging', 'usdImaging')).toBe(true)
    expect(permitted('usdImaging', 'usdSkelImaging')).toBe(false)
    // hdSt reaches usdMtlx only through hdMtlx (hdSt/CMakeLists.txt:16-23,
    // hdMtlx/CMakeLists.txt:4-13).
    expect(graph.libraries.hdSt!.libraries).not.toContain('usdMtlx')
    expect(permitted('hdSt', 'usdMtlx')).toBe(true)
  })
})

describe('pxr library imports', () => {
  it('resolve every typescript-usd specifier and relative path to a library', () => {
    expect(unresolved).toEqual([])
    expect(imports.length).toBeGreaterThan(0)
  })

  for (const i of imports.filter((i) => !permitted(i.fromLibrary, i.toLibrary))) {
    it(`${i.file}:${i.line} imports ${i.toLibrary}, which OpenUSD ${i.fromLibrary} does not depend on`, () => {
      expect(permitted(i.fromLibrary, i.toLibrary), `${i.specifier} -> ${i.target}`).toBe(true)
    })
  }

  for (const i of imports.filter((i) => i.deepRelative && librariesWithEntries.has(i.toLibrary))) {
    it(`${i.file}:${i.line} reaches into ${i.toLibrary}/src instead of its package entry`, () => {
      expect(i.specifier, `use the typescript-usd/${i.toLibrary} entry for ${i.target}`).not.toMatch(/^\./)
    })
  }
})
