// The resource bindings an entry point statically uses (WGSL "Resource
// Interface of a Shader": the module-scope resource variables referenced by
// the entry point or by any function it calls, whatever the control flow).
// Used to give each bind group layout entry the visibility of only the
// stages that reference it (see HgiWebGPUShaderGenerator
// _restrictVisibilityToStaticUse).
//
// The analysis works on the generated WGSL text. It over-approximates (a
// local that shadows a module-scope name counts as a use, and every call
// target is followed), which only keeps a binding visible to a stage that
// does not need it; it never drops a binding the stage does use.

/** `@group(g) @binding(b)` (either order) followed by a module-scope `var`. */
const _resourceDecl =
  /@(group|binding)\s*\(\s*(\d+)\s*\)\s*@(group|binding)\s*\(\s*(\d+)\s*\)\s*var\s*(?:<[^>]*>)?\s*([A-Za-z_]\w*)/g

/** The module-scope resource variables of `code`, by `group:binding`. */
export function HgiWebGPUResourceVariables(code: string): Map<string, string> {
  const stripped = _stripComments(code)
  const vars = new Map<string, string>()
  for (const m of stripped.matchAll(_resourceDecl)) {
    if (m[1] === m[3]) continue
    const group = m[1] === 'group' ? m[2]! : m[4]!
    const binding = m[1] === 'group' ? m[4]! : m[2]!
    vars.set(`${group}:${binding}`, m[5]!)
  }
  return vars
}

/** The identifiers referenced by `entryPoint` and every function it calls,
 *  transitively, or null when the entry point is not found. */
export function HgiWebGPUStaticallyUsedNames(code: string, entryPoint: string): Set<string> | null {
  const src = _stripComments(code)
  // Function name -> identifiers in its header and body.
  const functions = new Map<string, string[]>()
  const fnRe = /\bfn\s+([A-Za-z_]\w*)\s*\(/g
  for (let m = fnRe.exec(src); m; m = fnRe.exec(src)) {
    const open = src.indexOf('{', m.index)
    if (open < 0) break
    let depth = 0, end = open
    for (; end < src.length; end++) {
      const c = src[end]
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
    }
    functions.set(m[1]!, _identifiers(src.slice(m.index + m[0].length, end + 1)))
    fnRe.lastIndex = end + 1
  }
  if (!functions.has(entryPoint)) return null

  const used = new Set<string>()
  const visited = new Set<string>()
  const stack = [entryPoint]
  while (stack.length) {
    const fn = stack.pop()!
    if (visited.has(fn)) continue
    visited.add(fn)
    for (const id of functions.get(fn)!) {
      used.add(id)
      if (functions.has(id) && !visited.has(id)) stack.push(id)
    }
  }
  return used
}

const _isWord = (c: number) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57)
const _isWordStart = (c: number) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95

/** The identifiers of `text` (words starting with a letter or '_'), without
 *  member names (after '.' and optional whitespace): one scan, as the regex
 *  /(\.\s*)?\b([A-Za-z_]\w*)\b/g with the member matches dropped. */
function _identifiers(text: string): string[] {
  const out: string[] = []
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text.charCodeAt(i)
    if (!_isWord(c)) { i++; continue }
    // A word: [i, end).
    let end = i + 1
    while (end < n && _isWord(text.charCodeAt(end))) end++
    if (_isWordStart(c)) {
      // Member access: '.' then whitespace before the word.
      let k = i - 1
      while (k >= 0 && /\s/.test(text[k]!)) k--
      if (!(k >= 0 && text.charCodeAt(k) === 46)) out.push(text.slice(i, end))
    }
    i = end
  }
  return out
}

/** WGSL comments: `//` to end of line and nesting block comments. The last
 *  result is kept: the resource variables and the static use of one module
 *  (each stage's entry point) strip the same code. */
let _strippedFrom: string | undefined, _stripped = ''
function _stripComments(code: string): string {
  if (!code.includes('/')) return code
  if (code === _strippedFrom) return _stripped
  const parts: string[] = []
  let i = 0, kept = 0
  while (i < code.length) {
    const slash = code.indexOf('/', i)
    if (slash < 0) break
    i = slash
    const next = code[i + 1]
    if (next === '/') {
      parts.push(code.slice(kept, i))
      while (i < code.length && code[i] !== '\n') i++
      kept = i
    } else if (next === '*') {
      parts.push(code.slice(kept, i))
      let depth = 0
      while (i < code.length) {
        if (code[i] === '/' && code[i + 1] === '*') { depth++; i += 2 }
        else if (code[i] === '*' && code[i + 1] === '/') { i += 2; if (--depth === 0) break }
        else i++
      }
      parts.push(' ')
      kept = i
    } else {
      i++
    }
  }
  parts.push(code.slice(kept))
  _strippedFrom = code
  _stripped = parts.join('')
  return _stripped
}
