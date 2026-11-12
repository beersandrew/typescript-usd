// Scans every pxr/**/src/**/*.ts import and maps it to the pxr library that
// owns the imported file. Used by libraryLayering.test.ts to check imports
// against OpenUSD's CMake library graph (libraryGraph.json).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const pxrRoot = path.join(repoRoot, 'pxr')

export interface LibraryImport {
  /** Repo-relative importing file. */
  file: string
  line: number
  specifier: string
  fromLibrary: string
  toLibrary: string
  /** Repo-relative imported file. */
  target: string
  /** Relative import that reaches into another library's src/ directory. */
  deepRelative: boolean
}

/** pxr/<group>/<library>/... -> <library>; undefined outside a library. */
export function libraryOf(repoRelative: string): string | undefined {
  const parts = repoRelative.split('/')
  if (parts[0] !== 'pxr' || parts.length < 4) return undefined
  if (!['base', 'exec', 'imaging', 'usd', 'usdImaging', 'usdValidation'].includes(parts[1]!)) return undefined
  return parts[2]
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts')) found.push(full)
  }
  return found
}

/** Every library src directory: pxr/<group>/<library>/src. */
export function librarySourceFiles(): string[] {
  const files: string[] = []
  for (const group of readdirSync(pxrRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const library of readdirSync(path.join(pxrRoot, group.name), { withFileTypes: true })) {
      const src = path.join(pxrRoot, group.name, library.name, 'src')
      try { files.push(...sourceFiles(src)) } catch { /* no src directory */ }
    }
  }
  return files.sort()
}

/** package.json `exports`: subpath ('typescript-usd/hd') -> repo-relative file. */
export function packageEntries(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const entries = new Map<string, string>()
  for (const [subpath, target] of Object.entries(manifest.exports as Record<string, string>)) {
    const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`
    entries.set(specifier, path.posix.normalize(target))
  }
  return entries
}

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

// Blank out // and /* */ comments, keeping string literals and line numbers.
function stripComments(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? text.length : end + 2
      for (; i < stop; i++) out += text[i] === '\n' ? '\n' : ' '
    } else if (c === '"' || c === "'" || c === '`') {
      out += c; i++
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') { out += text[i]; i++ }
        out += text[i] ?? ''; i++
      }
      out += text[i] ?? ''; i++
    } else { out += c; i++ }
  }
  return out
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

export function scanLibraryImports(): { imports: LibraryImport[]; unresolved: string[] } {
  const entries = packageEntries()
  const imports: LibraryImport[] = []
  const unresolved: string[] = []
  for (const absolute of librarySourceFiles()) {
    const file = path.relative(repoRoot, absolute).split(path.sep).join('/')
    const fromLibrary = libraryOf(file)!
    const text = stripComments(readFileSync(absolute, 'utf8'))
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const specifier = match[1]!
        let target: string | undefined
        const relative = specifier.startsWith('.')
        if (relative) {
          target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
        } else if (specifier === 'typescript-usd' || specifier.startsWith('typescript-usd/')) {
          target = entries.get(specifier)
          if (!target) { unresolved.push(`${file}: ${specifier}`); continue }
        } else {
          continue // node: builtins and bundled third-party dependencies
        }
        const toLibrary = libraryOf(target)
        if (!toLibrary) { unresolved.push(`${file}: ${specifier} -> ${target}`); continue }
        if (toLibrary === fromLibrary) continue
        const deepRelative = relative && target.split('/')[3] === 'src'
        imports.push({
          file, line: lineOf(text, match.index), specifier, fromLibrary, toLibrary, target, deepRelative,
        })
      }
    }
  }
  return { imports, unresolved }
}

export interface LibraryGraph {
  source: { tag: string; commit: string }
  libraries: Record<string, { cmake: string; libraries: string[]; optionalLibraries: string[] }>
}

/** OpenUSD's library graph as generated (libraryGraph.json). */
export function loadUpstreamLibraryGraph(): LibraryGraph {
  return JSON.parse(readFileSync(path.join(repoRoot, 'pxr', 'tests', 'architecture', 'libraryGraph.json'), 'utf8'))
}

/** Libraries typescript-usd adds beside OpenUSD's, each layered as the
 *  upstream library it is modelled on. hgiWebGPU is the WebGPU Hgi backend,
 *  modelled on hgiMetal and hgiVulkan (pxr/imaging/hgiMetal/CMakeLists.txt
 *  LIBRARIES: arch, hgi, tf, trace). */
export const repoLibraries: LibraryGraph['libraries'] = {
  hgiWebGPU: {
    cmake: '(typescript-usd) layered as pxr/imaging/hgiMetal/CMakeLists.txt',
    libraries: ['arch', 'hgi', 'tf', 'trace'],
    optionalLibraries: [],
  },
}

/** Libraries typescript-usd keeps beside an upstream library under another
 *  name, layered exactly as that library (none at present). */
export const aliasedLibraries: Record<string, string> = {}

/** The upstream graph plus repoLibraries and aliasedLibraries. */
export function loadLibraryGraph(): LibraryGraph {
  const graph = loadUpstreamLibraryGraph()
  const libraries = { ...graph.libraries, ...repoLibraries }
  for (const [alias, original] of Object.entries(aliasedLibraries)) {
    const entry = graph.libraries[original]!
    libraries[alias] = { ...entry, cmake: `(typescript-usd) layered as ${entry.cmake}` }
    for (const [name, other] of Object.entries(libraries)) {
      if (other.libraries.includes(original)) libraries[name] = { ...other, libraries: [...other.libraries, alias] }
      if (other.optionalLibraries.includes(original)) libraries[name] = { ...libraries[name]!, optionalLibraries: [...other.optionalLibraries, alias] }
    }
  }
  return { ...graph, libraries }
}

/** Transitive closure of each library's direct and optional dependencies. */
export function transitiveDependencies(graph: LibraryGraph): Map<string, Set<string>> {
  const closure = new Map<string, Set<string>>()
  const visit = (name: string): Set<string> => {
    const cached = closure.get(name)
    if (cached) return cached
    const result = new Set<string>()
    closure.set(name, result)
    const entry = graph.libraries[name]
    for (const dependency of [...(entry?.libraries ?? []), ...(entry?.optionalLibraries ?? [])]) {
      result.add(dependency)
      for (const indirect of visit(dependency)) result.add(indirect)
    }
    return result
  }
  for (const name of Object.keys(graph.libraries)) visit(name)
  return closure
}
