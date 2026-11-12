// Ported from OpenUSD 26.11.1: pxr/usd/sdf/path.cpp, pxr/usd/sdf/path.h,
//  pxr/usd/sdf/pathNode.cpp, pxr/usd/sdf/pathNode.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfPath — faithful port of OpenUSD pxr/usd/sdf/path.{h,cpp} + pathNode.{h,cpp}.
//
// A path is an immutable chain of TYPED nodes from a root down, one node per
// element. The node TYPE is the path's axis: a prim child, a variant selection,
// a property, a relationship target, etc. — NOT all elements are namespace, which
// is exactly the structure pcp's string paths lacked (variant selections live on
// their own axis: StripAllVariantSelections drops them, GetPrimPath keeps them).
//
// String form (matches SdfPath::GetAsString and pcp.txt): "/A/B" prim children,
// "/A{set=sel}B" a variant selection on A then its child B (NO "/" after a variant
// — "/A{set=sel}/B" is ill-formed), "/A.prop" a property, "/A.rel[/Tgt]" a target.
//
// This is a LEAF module: no typescript-usd/usd / typescript-usd/sdf-barrel imports, so typescript-usd/pcp (which
// must stay below typescript-usd/usd) can depend on it — SdfPath lives in Sdf, below Pcp,
// exactly as in OpenUSD.

import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'

const CHILD_DELIM = '/'
const PROP_DELIM = '.'
const REL_TARGET_OPEN = '['
const REL_TARGET_CLOSE = ']'
const ABS_ROOT_STR = '/'
const RELATIVE_ROOT_STR = '.'
const PARENT_PATH_ELEMENT = '..'
const NS_DELIM = ':'
const EXPRESSION_INDICATOR = 'expression'
const MAPPER_INDICATOR = 'mapper'

// TF_WARN.
function tfWarn(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

// TF_CODING_ERROR.
function tfCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

// Sdf_PathNode::NodeType (pathNode.h:56-110).
export type NodeKind =
  | 'root' | 'prim' | 'variant' | 'property'
  | 'target' | 'mapper' | 'relationalAttribute' | 'mapperArg' | 'expression'

function isPropKind(kind: NodeKind): boolean {
  return kind !== 'root' && kind !== 'prim' && kind !== 'variant'
}

// One node in the path chain. Immutable. `parent` is null only for a root node.
class PathNode {
  readonly kind: NodeKind
  readonly parent: PathNode | null
  readonly isAbsolute: boolean
  readonly elementCount: number
  readonly containsVariantSelection: boolean
  readonly containsTargetPath: boolean
  // Element payload, by kind:
  readonly name: string                 // prim / property / relationalAttribute / mapperArg
  readonly variantSet: string           // variant
  readonly variant: string              // variant
  readonly targetPath: SdfPath | null   // target / mapper
  private _str: string | undefined

  constructor(
    kind: NodeKind, parent: PathNode | null, isAbsolute: boolean,
    name = '', variantSet = '', variant = '', targetPath: SdfPath | null = null,
  ) {
    this.kind = kind
    this.parent = parent
    this.isAbsolute = isAbsolute
    this.elementCount = parent ? parent.elementCount + 1 : 0
    this.containsVariantSelection = (parent?.containsVariantSelection ?? false) || kind === 'variant'
    // _NodeTypeToFlags (pathNode.h:288-295).
    this.containsTargetPath =
      (parent?.containsTargetPath ?? false) || kind === 'target' || kind === 'mapper'
    this.name = name
    this.variantSet = variantSet
    this.variant = variant
    this.targetPath = targetPath
  }

  // Sdf_PathNode::GetElement / _GetElementImpl: this node's text in isolation.
  element(): string {
    switch (this.kind) {
      case 'root': return ''
      case 'prim': return this.name
      case 'variant': return `{${this.variantSet}=${this.variant}}`
      case 'property':
      case 'relationalAttribute':
      case 'mapperArg': return PROP_DELIM + this.name
      case 'target': return REL_TARGET_OPEN + this.targetPath!.pathString + REL_TARGET_CLOSE
      case 'mapper':
        return PROP_DELIM + MAPPER_INDICATOR + REL_TARGET_OPEN + this.targetPath!.pathString + REL_TARGET_CLOSE
      case 'expression': return PROP_DELIM + EXPRESSION_INDICATOR
    }
  }

  // Sdf_PathNode::GetName (pathNode.h:680-700).
  getName(): string {
    switch (this.kind) {
      case 'root': return this.isAbsolute ? ABS_ROOT_STR : RELATIVE_ROOT_STR
      case 'variant': return this.variant !== '' ? this.variant : this.variantSet
      case 'target':
      case 'mapper': return ''
      case 'expression': return EXPRESSION_INDICATOR
      default: return this.name
    }
  }

  // The path text through this node, per Sdf_PathNode::_WriteTextToBuffer
  // (pathNode.cpp:639-686): '/' separates two prim elements, a property part
  // after a trailing '..' is preceded by '/', and absolute paths lead with '/'.
  // Cached per node.
  text(): string {
    if (this._str !== undefined) return this._str
    const p = this.parent
    let s: string
    if (p === null) {
      s = this.isAbsolute ? ABS_ROOT_STR : RELATIVE_ROOT_STR
    } else if (p.kind === 'root') {
      s = (p.isAbsolute ? ABS_ROOT_STR : '') + this.element()
    } else if (this.kind === 'prim' && p.kind === 'prim') {
      s = p.text() + CHILD_DELIM + this.name
    } else if (isPropKind(this.kind) && p.kind === 'prim' && p.name === PARENT_PATH_ELEMENT) {
      s = p.text() + CHILD_DELIM + this.element()
    } else {
      s = p.text() + this.element()
    }
    return (this._str = s)
  }
}

// Interning of root nodes so AbsoluteRootPath()/EmptyPath() are singletons; the
// rest compare by string (pcp compares paths by value, which the string gives).
const ABS_ROOT_NODE = new PathNode('root', null, true)
const REL_ROOT_NODE = new PathNode('root', null, false)

const NODE_TYPE_ORDER: Record<NodeKind, number> = {
  root: 0, prim: 1, variant: 2, property: 3, target: 4, mapper: 5,
  relationalAttribute: 6, mapperArg: 7, expression: 8,
}

// Sdf_PathNode::Compare<_NodeEqual>: same type and same element value.
function nodesEqual(a: PathNode, b: PathNode): boolean {
  if (a === b) return true
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'variant': return a.variantSet === b.variantSet && a.variant === b.variant
    case 'target':
    case 'mapper': return a.targetPath!.pathString === b.targetPath!.pathString
    case 'root': return a.isAbsolute === b.isAbsolute
    default: return a.name === b.name
  }
}

// The nearest prim-part node at or above `node` (the prim part's leaf).
function primPartLeaf(node: PathNode): PathNode {
  let n = node
  while (isPropKind(n.kind)) n = n.parent!
  return n
}

// A path's prim-part and property-part nodes, root first (the root node is
// left out of the prim part).
function splitPathParts(node: PathNode): [PathNode[], PathNode[]] {
  const chain: PathNode[] = []
  for (let n: PathNode | null = node; n && n.kind !== 'root'; n = n.parent) chain.push(n)
  chain.reverse()
  let split = chain.findIndex(n => n.kind !== 'prim' && n.kind !== 'variant')
  if (split < 0) split = chain.length
  return [chain.slice(0, split), chain.slice(split)]
}

// _LessThanCompareNodes over node chains, as a three-way comparison.
function compareNodeChains(l: readonly PathNode[], r: readonly PathNode[]): number {
  const n = Math.min(l.length, r.length)
  for (let i = 0; i < n; i++) {
    const a = l[i]!, b = r[i]!
    if (a === b) continue
    if (a.kind !== b.kind) return NODE_TYPE_ORDER[a.kind] - NODE_TYPE_ORDER[b.kind]
    let x: string, y: string
    switch (a.kind) {
      case 'variant':
        if (a.variantSet !== b.variantSet) { x = a.variantSet; y = b.variantSet } else { x = a.variant; y = b.variant }
        break
      case 'expression':
        continue
      case 'target':
      case 'mapper': {
        const order = SdfPath.compare(a.targetPath!, b.targetPath!)
        if (order !== 0) return order
        continue
      }
      default:
        x = a.name; y = b.name
    }
    if (x !== y) return x < y ? -1 : 1
  }
  return l.length - r.length
}

// SdfPath.fromString's parsed paths, by string; cleared when full.
const _PARSED_PATHS_LIMIT = 1 << 17
const _parsedPaths = new Map<string, SdfPath>()

export class SdfPath {
  // null node === the EMPTY path (SdfPath()).
  private readonly _node: PathNode | null

  private constructor(node: PathNode | null) {
    this._node = node
  }

  // ---- Well-known paths -------------------------------------------------------

  static readonly emptyPath = new SdfPath(null)
  static readonly absoluteRootPath = new SdfPath(ABS_ROOT_NODE)
  static readonly reflexiveRelativePath = new SdfPath(REL_ROOT_NODE)
  // SdfPathTokens (tokens.h:36-48), exposed on Sdf.Path by wrapPath.cpp:401-410.
  static readonly absoluteIndicator = '/'
  static readonly childDelimiter = '/'
  static readonly propertyDelimiter = '.'
  static readonly relationshipTargetStart = '['
  static readonly relationshipTargetEnd = ']'
  static readonly parentPathElement = '..'
  static readonly mapperIndicator = 'mapper'
  static readonly expressionIndicator = 'expression'
  static readonly mapperArgDelimiter = '.'
  static readonly namespaceDelimiter = ':'

  // ---- Construction -----------------------------------------------------------

  // SdfPath(const std::string &) (path.cpp:121-131): parse, or warn with the
  // parser's diagnostic and return the empty path if ill-formed.
  static fromString(s: string): SdfPath {
    if (s === ABS_ROOT_STR) return SdfPath.absoluteRootPath
    // typescript-usd: paths are immutable values, so a string parsed before
    // gives the same path again. Upstream's parse is cheap and its nodes are
    // interned (pathNode.cpp); here the parsed paths of recent strings are
    // kept instead (well-formed ones only: an ill-formed string warns on
    // every parse, as upstream).
    const parsed = _parsedPaths.get(s)
    if (parsed !== undefined) return parsed
    try {
      const path = parsePath(s)
      if (_parsedPaths.size >= _PARSED_PATHS_LIMIT) _parsedPaths.clear()
      _parsedPaths.set(s, path)
      return path
    } catch (err) {
      if (!(err instanceof PathParseError)) throw err
      tfWarn(formatParseError(s, err))
      return SdfPath.emptyPath
    }
  }

  /** @internal */ static _wrap(node: PathNode | null): SdfPath {
    return node === null ? SdfPath.emptyPath
      : node === ABS_ROOT_NODE ? SdfPath.absoluteRootPath
      : node === REL_ROOT_NODE ? SdfPath.reflexiveRelativePath
      : new SdfPath(node)
  }

  // ---- Classification ---------------------------------------------------------

  isEmpty(): boolean { return this._node === null }
  isAbsolutePath(): boolean { return this._node?.isAbsolute ?? false }
  isAbsoluteRootPath(): boolean { return this._node === ABS_ROOT_NODE }
  get pathElementCount(): number { return this._node?.elementCount ?? 0 }

  // A path that identifies a prim: a prim child, or the reflexive relative root
  // '.'. The ABSOLUTE root '/' is NOT a prim path (it is the pseudo-root).
  isPrimPath(): boolean {
    const n = this._node
    return n !== null && (n.kind === 'prim' || (n.kind === 'root' && !n.isAbsolute))
  }
  isPrimVariantSelectionPath(): boolean { return this._node?.kind === 'variant' }
  // IsPrimOrPrimVariantSelectionPath (path.cpp:264-277): a prim, a variant
  // selection, or the reflexive relative root '.'; not the absolute root.
  isPrimOrPrimVariantSelectionPath(): boolean {
    const n = this._node
    return n !== null && (n.kind === 'prim' || n.kind === 'variant' || n === REL_ROOT_NODE)
  }
  // A root prim path: "/Foo" (absolute, exactly one element).
  isRootPrimPath(): boolean {
    const n = this._node
    return n !== null && n.kind === 'prim' && n.isAbsolute && n.elementCount === 1
  }
  isPropertyPath(): boolean {
    return this._node?.kind === 'property' || this._node?.kind === 'relationalAttribute'
  }
  isPrimPropertyPath(): boolean { return this._node?.kind === 'property' }
  // IsNamespacedPropertyPath (path.cpp:238-250).
  isNamespacedPropertyPath(): boolean {
    const n = this._node
    return n !== null && (n.kind === 'property' || n.kind === 'relationalAttribute') &&
      n.name.includes(NS_DELIM)
  }
  isRelationalAttributePath(): boolean { return this._node?.kind === 'relationalAttribute' }
  isTargetPath(): boolean { return this._node?.kind === 'target' }
  isMapperPath(): boolean { return this._node?.kind === 'mapper' }
  isMapperArgPath(): boolean { return this._node?.kind === 'mapperArg' }
  isExpressionPath(): boolean { return this._node?.kind === 'expression' }
  containsPrimVariantSelection(): boolean { return this._node?.containsVariantSelection ?? false }
  // ContainsTargetPath: any target or mapper element.
  containsTargetPath(): boolean { return this._node?.containsTargetPath ?? false }
  // IsAbsoluteRootOrPrimPath: the pseudo-root or a prim path.
  isAbsoluteRootOrPrimPath(): boolean { return this.isAbsoluteRootPath() || this.isPrimPath() }
  // ContainsPropertyElements: a non-empty property part.
  containsPropertyElements(): boolean {
    return this._node !== null && isPropKind(this._node.kind)
  }

  // ---- Element accessors ------------------------------------------------------

  // GetName (path.cpp:436-449, pathNode.h:680-700): '/' or '.' for a root;
  // for a variant selection the variant, or the variant set when the
  // selection is empty; "" for a target or mapper; 'expression' for an
  // expression.
  get name(): string {
    return this._node?.getName() ?? ''
  }
  // GetElementString (path.cpp:451-462): the leaf element's text.
  get elementString(): string {
    return this._node?.element() ?? ''
  }
  // GetVariantSelection: [set, variant] for a variant-selection path, else ["",""].
  getVariantSelection(): [string, string] {
    const n = this._node
    return n && n.kind === 'variant' ? [n.variantSet, n.variant] : ['', '']
  }
  // GetTargetPath (path.cpp:495-502): the target path of the nearest target
  // or mapper element in the property part.
  getTargetPath(): SdfPath {
    for (let n = this._node; n !== null && isPropKind(n.kind); n = n.parent) {
      if (n.kind === 'target' || n.kind === 'mapper') return n.targetPath!
    }
    return SdfPath.emptyPath
  }

  // ---- Navigation -------------------------------------------------------------

  // GetParentPath (path.cpp:580-613): the parent of a relative path that is
  // '.' or ends with '..' appends a '..' element.
  getParentPath(): SdfPath {
    const n = this._node
    if (n === null) return SdfPath.emptyPath
    if (!n.isAbsolute && (n === REL_ROOT_NODE ||
        (n.kind === 'prim' && n.name === PARENT_PATH_ELEMENT))) {
      return SdfPath._wrap(new PathNode('prim', n, false, PARENT_PATH_ELEMENT))
    }
    return SdfPath._wrap(n.parent)
  }

  // MakeAbsolutePath (path.cpp:1639-1713): this path anchored at a prim-like
  // absolute path; empty if it would go outside the root.
  makeAbsolutePath(anchor: SdfPath): SdfPath {
    if (anchor.isEmpty()) {
      tfWarn('MakeAbsolutePath(): anchor is the empty path.')
      return SdfPath.emptyPath
    }
    if (!anchor.isAbsolutePath()) {
      tfWarn('MakeAbsolutePath() requires an absolute path as an argument.')
      return SdfPath.emptyPath
    }
    if (!anchor.isAbsoluteRootOrPrimPath() && !anchor.isPrimVariantSelectionPath()) {
      tfWarn('MakeAbsolutePath() requires a prim path as an argument.')
      return SdfPath.emptyPath
    }
    if (this.isEmpty()) return SdfPath.emptyPath
    const [primNodes, propNodes] = splitPathParts(this._node!)
    let result: SdfPath
    if (!this.isAbsolutePath()) {
      result = anchor
      for (const node of primNodes) {
        result = appendNode(result, node)
        if (result.isEmpty()) break
      }
    } else {
      result = SdfPath._wrap(primPartLeaf(this._node!))
    }
    if (result.isEmpty()) return result
    // Tack on any property path.
    result = tackOnPropPart(result, propNodes)
    // Now make target paths absolute (recursively) if we need to.
    const targetPath = result.getTargetPath()
    if (!targetPath.isEmpty()) {
      result = result.replaceTargetPath(targetPath.makeAbsolutePath(result.getPrimPath()))
    }
    return result
  }

  // MakeRelativePath (path.cpp:1715-1813): this path relative to a prim-like
  // absolute anchor, with the fewest possible '..' elements.
  makeRelativePath(anchor: SdfPath): SdfPath {
    if (anchor.isEmpty()) {
      tfWarn('MakeRelativePath(): anchor is the invalid path.')
      return SdfPath.emptyPath
    }
    if (!anchor.isAbsolutePath()) {
      tfWarn('MakeRelativePath() requires an absolute path as an argument.')
      return SdfPath.emptyPath
    }
    if (!anchor.isAbsoluteRootOrPrimPath() && !anchor.isPrimVariantSelectionPath()) {
      tfWarn('MakeRelativePath() requires a prim, prim variant selection, ' +
        `or absolute root path as an anchor (got '${anchor.pathString}').`)
      return SdfPath.emptyPath
    }
    if (this.isEmpty()) return SdfPath.emptyPath
    if (!this.isAbsolutePath()) {
      // Canonicalize... make sure the relative path has the fewest possible
      // dot-dots.
      return this.makeAbsolutePath(anchor).makeRelativePath(anchor)
    }
    const [thisPrim, thisProp] = splitPathParts(this._node!)
    const [anchorPrim] = splitPathParts(anchor._node!)
    let common = 0
    while (common < thisPrim.length && common < anchorPrim.length &&
        nodesEqual(thisPrim[common]!, anchorPrim[common]!)) {
      ++common
    }
    let result = SdfPath.reflexiveRelativePath
    for (let dotdotCount = anchorPrim.length - common; dotdotCount > 0; --dotdotCount) {
      result = result.getParentPath()
    }
    for (const node of thisPrim.slice(common)) result = appendNode(result, node)
    // Tack on any property part.
    return tackOnPropPart(result, thisProp)
  }

  // Re-apply THIS path's variant selections onto `target`, matching by namespace
  // prefix: a selection owned by prim P (the stripped prefix up through P) is
  // inserted at P in `target` when P is also a prefix of `target`. Used by
  // PcpMapFunction after a namespace prefix-replacement drops the variant axis —
  // the selection rides along wherever its owning prim survived the mapping
  // ('/Model{v=s}Inst' mapped to the class '/Model/_proto' → '/Model{v=s}_proto').
  reapplyVariantSelectionsOnto(target: SdfPath): SdfPath {
    if (target.isEmpty() || !this.containsPrimVariantSelection()) return target
    // Owner prim (stripped pathString) -> [set, sel].
    const selByOwner = new Map<string, [string, string]>()
    for (let p: SdfPath = this; p._node !== null && !p.isAbsoluteRootPath(); p = p.getParentPath()) {
      if (p.isPrimVariantSelectionPath()) {
        selByOwner.set(p.getParentPath().stripAllVariantSelections().pathString, p.getVariantSelection())
      }
    }
    const stripped = target.stripAllVariantSelections()
    const names: string[] = []
    for (let p = stripped; p._node !== null && !p.isAbsoluteRootPath(); p = p.getParentPath()) names.unshift(p.name)
    let result = stripped.isAbsolutePath() ? SdfPath.absoluteRootPath : SdfPath.reflexiveRelativePath
    for (const nm of names) {
      result = result.appendChild(nm)
      const sel = selByOwner.get(result.stripAllVariantSelections().pathString)
      if (sel !== undefined) result = result.appendVariantSelection(sel[0], sel[1])
    }
    return result
  }

  // GetPrimPath: strip trailing properties/targets to the nearest enclosing prim
  // (KEEPING variant selections — they're part of the prim's identity). Returns
  // the EMPTY path if that leaves only a root (matches SdfPath: /.GetPrimPath()
  // and ..GetPrimPath() are both empty).
  getPrimPath(): SdfPath {
    let n = this._node
    // Strip trailing non-prim elements — properties, targets, AND a trailing
    // variant selection ('/A{v=x}'.GetPrimPath() == '/A'). A variant with a prim
    // after it ('/A{v=x}B') is kept, since the walk stops at that prim.
    while (n !== null && n.kind !== 'prim' && n.kind !== 'root') n = n.parent
    return n === null || n.kind === 'root' ? SdfPath.emptyPath : SdfPath._wrap(n)
  }

  // GetAbsoluteRootOrPrimPath: the absolute root for '/', else GetPrimPath.
  getAbsoluteRootOrPrimPath(): SdfPath {
    return this.isAbsoluteRootPath() ? this : this.getPrimPath()
  }

  // GetPrimOrPrimVariantSelectionPath: strip trailing properties and targets,
  // keeping a trailing variant selection.
  getPrimOrPrimVariantSelectionPath(): SdfPath {
    let n = this._node
    while (n !== null && n.kind !== 'prim' && n.kind !== 'variant' && n.kind !== 'root') n = n.parent
    return n === null || n.kind === 'root' ? SdfPath.emptyPath : SdfPath._wrap(n)
  }

  // StripAllVariantSelections: the pure namespace path — every variant node removed.
  stripAllVariantSelections(): SdfPath {
    if (this._node === null || !this._node.containsVariantSelection) return this
    // Rebuild the chain skipping variant nodes.
    const kept: PathNode[] = []
    for (let n: PathNode | null = this._node; n !== null; n = n.parent) {
      if (n.kind !== 'variant') kept.push(n)
    }
    kept.reverse()
    let node: PathNode | null = null
    for (const orig of kept) {
      node = orig.kind === 'root' ? orig : rebuildNode(orig, node)
    }
    return SdfPath._wrap(node)
  }

  // GetPrefixes (path.cpp:373-428): the paths from the first element down to
  // this path, root excluded; with numPrefixes > 0, only the last
  // numPrefixes of them.
  getPrefixes(numPrefixes = 0): SdfPath[] {
    const elemCount = this.pathElementCount
    if (numPrefixes === 0 || numPrefixes > elemCount) numPrefixes = elemCount
    const prefixes: SdfPath[] = new Array(numPrefixes)
    let n = this._node
    for (let i = numPrefixes - 1; i >= 0; --i) {
      prefixes[i] = SdfPath._wrap(n)
      n = n!.parent
    }
    return prefixes
  }

  // GetAncestorsRange (path.cpp:430-434, 2288-2302): this path and its
  // ancestors, leaf first, ending at the first element.
  *getAncestorsRange(): Generator<SdfPath> {
    let n = this._node
    while (n !== null) {
      yield SdfPath._wrap(n)
      n = (isPropKind(n.kind) || n.elementCount > 1) ? n.parent : null
    }
  }

  // ReplaceName (path.cpp:465-479): this path with its leaf name replaced.
  replaceName(newName: string): SdfPath {
    if (this.isPrimPath()) return this.getParentPath().appendChild(newName)
    if (this.isPrimPropertyPath()) return this.getParentPath().appendProperty(newName)
    if (this.isRelationalAttributePath()) {
      return this.getParentPath().appendRelationalAttribute(newName)
    }
    tfCodingError(`${this.pathString} is not a prim, property, or relational attribute path`)
    return SdfPath.emptyPath
  }

  // ---- Building ---------------------------------------------------------------

  // AppendPath (path.cpp:703-764).
  appendPath(newSuffix: SdfPath): SdfPath {
    if (this.isEmpty()) {
      tfCodingError('Cannot append to invalid path')
      return SdfPath.emptyPath
    }
    if (newSuffix.isEmpty()) {
      tfCodingError(`Cannot append invalid path to <${this.pathString}>`)
      return SdfPath.emptyPath
    }
    if (newSuffix.isAbsolutePath()) {
      tfWarn(`Cannot append absolute path <${newSuffix.pathString}> to another path <${this.pathString}>.`)
      return SdfPath.emptyPath
    }
    if (newSuffix._node === REL_ROOT_NODE) return this
    const kind = this._node!.kind
    if (kind !== 'root' && kind !== 'prim' && kind !== 'variant') {
      tfWarn('Cannot append a path to another path that is not a root or a prim path.')
      return SdfPath.emptyPath
    }
    const tailNodes: PathNode[] = []
    for (let n: PathNode | null = newSuffix._node; n !== null && n.kind !== 'root'; n = n.parent) {
      tailNodes.push(n)
    }
    if (tailNodes[tailNodes.length - 1]!.kind === 'property' && this.isAbsoluteRootPath()) {
      tfWarn('Cannot append a property path to the absolute root path.')
      return SdfPath.emptyPath
    }
    let result: SdfPath = this
    for (let i = tailNodes.length - 1; i >= 0 && !result.isEmpty(); --i) {
      result = appendNode(result, tailNodes[i]!)
    }
    return result
  }

  // AppendChild (path.cpp:838-886).
  appendChild(childName: string): SdfPath {
    const n = this._node
    if (n !== null && isPropKind(n.kind)) {
      tfWarn(`Cannot append child '${childName}' to path '${this.pathString}'.`)
      return SdfPath.emptyPath
    }
    if (n === null) {
      tfWarn(`Cannot append child '${childName}' to path ''.`)
      return SdfPath.emptyPath
    }
    if (childName === PARENT_PATH_ELEMENT) return this.getParentPath()
    if (!isValidIdentifier(childName)) {
      tfWarn(`Invalid prim name '${childName}'`)
      return SdfPath.emptyPath
    }
    return SdfPath._wrap(new PathNode('prim', n, n.isAbsolute, childName))
  }

  // AppendProperty (path.cpp:941-983).
  appendProperty(propName: string): SdfPath {
    const n = this._node
    if (n !== null && isPropKind(n.kind)) {
      tfWarn(`Can only append a property '${propName}' to a prim path (${this.pathString})`)
      return SdfPath.emptyPath
    }
    // The per-thread property cache (path.cpp:893-939) is keyed on the name
    // alone, and a hit skips the validity checks (path.cpp:957-971), so a
    // name already appended elsewhere also appends to the absolute root.
    if (n !== null && propertyNameCache.has(propName)) {
      return SdfPath._wrap(new PathNode('property', n, n.isAbsolute, propName))
    }
    if (!SdfPath.isValidNamespacedIdentifier(propName)) return SdfPath.emptyPath
    if (n === null || (n.kind !== 'prim' && n.kind !== 'variant' && n !== REL_ROOT_NODE)) {
      tfWarn(`Can only append a property '${propName}' to a prim path (${this.pathString})`)
      return SdfPath.emptyPath
    }
    rememberPropertyName(propName)
    return SdfPath._wrap(new PathNode('property', n, n.isAbsolute, propName))
  }

  // AppendVariantSelection (path.cpp:985-1006).
  appendVariantSelection(variantSet: string, variant: string): SdfPath {
    if (!this.isPrimOrPrimVariantSelectionPath()) {
      tfCodingError(`Cannot append variant selection ${variantSet} = ${variant} to <${this.pathString}>; ` +
        'can only append a variant selection to a prim or prim variant selection path.')
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('variant', n, n.isAbsolute, '', variantSet, variant))
  }

  // AppendTarget (path.cpp:1008-1027).
  appendTarget(targetPath: SdfPath): SdfPath {
    if (!this.isPropertyPath()) {
      tfWarn('Can only append a target to a property path.')
      return SdfPath.emptyPath
    }
    if (targetPath.isEmpty()) {
      tfWarn('Target path cannot be invalid.')
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('target', n, n.isAbsolute, '', '', '', targetPath))
  }

  // AppendRelationalAttribute (path.cpp:1029-1050).
  appendRelationalAttribute(attrName: string): SdfPath {
    if (!SdfPath.isValidNamespacedIdentifier(attrName)) {
      tfWarn('Invalid property name.')
      return SdfPath.emptyPath
    }
    if (!this.isTargetPath()) {
      tfWarn('Can only append a relational attribute to a target path.')
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('relationalAttribute', n, n.isAbsolute, attrName))
  }

  // AppendMapper (path.cpp:1052-1073).
  appendMapper(targetPath: SdfPath): SdfPath {
    if (!this.isPropertyPath()) {
      tfWarn(`Cannnot append mapper '${targetPath.pathString}' to non-property path <${this.pathString}>.`)
      return SdfPath.emptyPath
    }
    if (targetPath.isEmpty()) {
      tfWarn(`Cannot append an empty mapper target path to <${this.pathString}>`)
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('mapper', n, n.isAbsolute, '', '', '', targetPath))
  }

  // AppendMapperArg (path.cpp:1075-1094).
  appendMapperArg(argName: string): SdfPath {
    if (!isValidIdentifier(argName)) {
      tfWarn('Invalid arg name.')
      return SdfPath.emptyPath
    }
    if (!this.isMapperPath()) {
      tfWarn('Can only append a mapper arg to a mapper path.')
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('mapperArg', n, n.isAbsolute, argName))
  }

  // AppendExpression (path.cpp:1096-1111).
  appendExpression(): SdfPath {
    if (!this.isPropertyPath()) {
      tfWarn('Can only append an expression to a property path.')
      return SdfPath.emptyPath
    }
    const n = this._node!
    return SdfPath._wrap(new PathNode('expression', n, n.isAbsolute))
  }

  // AppendElementString / AppendElementToken (path.cpp:1113-1197).
  appendElementString(element: string): SdfPath {
    if (this.isEmpty()) {
      tfCodingError(`Cannot append element '${element}' to the EmptyPath.`)
      return SdfPath.emptyPath
    }
    const first = element[0]
    if (first === '{') {
      const tokens = element.split(/[{=}]/).filter(t => t !== '')
      if (tokens.length === 2) return this.appendVariantSelection(tokens[0]!, tokens[1]!)
      if (tokens.length !== 1) return SdfPath.emptyPath
      return this.appendVariantSelection(tokens[0]!, '')
    }
    if (first === REL_TARGET_OPEN) {
      return this.appendTarget(SdfPath.fromString(element.slice(1, element.length - 1)))
    }
    if (first === PROP_DELIM) {
      if (this.isPropertyPath()) {
        const mapperPrefix = PROP_DELIM + MAPPER_INDICATOR + REL_TARGET_OPEN
        if (element === PROP_DELIM + EXPRESSION_INDICATOR) return this.appendExpression()
        if (element.startsWith(mapperPrefix)) {
          return this.appendMapper(SdfPath.fromString(
            element.slice(mapperPrefix.length, element.length - 1)))
        }
      }
      const property = element.slice(1)
      if (this.isMapperPath()) return this.appendMapperArg(property)
      if (this.isTargetPath()) return this.appendRelationalAttribute(property)
      return this.appendProperty(property)
    }
    return this.appendChild(element)
  }

  // ---- Validation -------------------------------------------------------------

  // SdfPath::IsValidIdentifier (path.cpp:1818-1863): '_' or an XID_Start
  // character, then XID_Continue characters.
  static isValidIdentifier(name: string): boolean {
    return isValidIdentifier(name)
  }

  // SdfPath::IsValidNamespacedIdentifier (path.cpp:1865-1908): identifiers
  // joined by ':' namespace delimiters.
  static isValidNamespacedIdentifier(name: string): boolean {
    const len = name.length
    if (len === 0) return false
    let i = 0
    for (;;) {
      const end = identifierEnd(name, i)
      if (end === i) return false
      if (end === len) return true
      if (name.charCodeAt(end) !== 0x3a /* ':' */ || end + 1 === len) return false
      i = end + 1
    }
  }

  // SdfPath::IsValidPathString (path.cpp:2079-2084): whether the string
  // parses as a path; the parser's diagnostic goes to errMsg.value.
  static isValidPathString(pathString: string, errMsg?: { value?: string }): boolean {
    try {
      parsePath(pathString)
      return true
    } catch (err) {
      if (!(err instanceof PathParseError)) throw err
      if (errMsg) errMsg.value = formatParseError(pathString, err)
      return false
    }
  }

  // SdfPath::TokenizeIdentifier (path.cpp:1910-1966).
  static tokenizeIdentifier(name: string): string[] {
    if (name === '' || name.endsWith(NS_DELIM)) return []
    const result: string[] = []
    let anchor = 0
    let i = identifierStartEnd(name, 0)
    if (i === 0) return []
    while (i < name.length) {
      if (name.charCodeAt(i) === 0x3a /* ':' */) {
        result.push(name.slice(anchor, i))
        anchor = ++i
        const next = identifierStartEnd(name, i)
        if (next === i) return []
        i = next
      } else {
        const next = xidContinueEnd(name, i)
        if (next === i) return []
        i = next
      }
    }
    result.push(name.slice(anchor, i))
    return result
  }

  // SdfPath::JoinIdentifier (path.cpp:1979-2026): non-empty names joined by
  // ':'.
  static joinIdentifier(names: readonly string[]): string
  static joinIdentifier(lhs: string, rhs: string): string
  static joinIdentifier(lhsOrNames: string | readonly string[], rhs?: string): string {
    if (typeof lhsOrNames !== 'string') return lhsOrNames.filter(n => n !== '').join(NS_DELIM)
    if (lhsOrNames === '') return rhs ?? ''
    if (!rhs) return lhsOrNames
    return lhsOrNames + NS_DELIM + rhs
  }

  // SdfPath::StripNamespace (path.cpp:2028-2040).
  static stripNamespace(name: string): string {
    const n = name.lastIndexOf(NS_DELIM)
    return n < 0 ? name : name.slice(n + 1)
  }

  // SdfPath::StripPrefixNamespace (path.cpp:2042-2077).
  static stripPrefixNamespace(name: string, matchNamespace: string): [string, boolean] {
    if (matchNamespace === '') return [name, false]
    if (name.startsWith(matchNamespace)) {
      const len = matchNamespace.length
      if (matchNamespace[len - 1] === NS_DELIM) return [name.slice(len), true]
      if (name[len] === NS_DELIM) return [name.slice(len + 1), true]
    }
    return [name, false]
  }

  // SdfPath::GetConciseRelativePaths (path.cpp:2164-2252).
  static getConciseRelativePaths(paths: readonly SdfPath[]): SdfPath[] {
    const primPaths: SdfPath[] = []
    let anchors: SdfPath[] = []
    let labels: SdfPath[] = []
    for (const path of paths) {
      if (!path.isAbsolutePath()) {
        tfWarn('argument to GetConciseRelativePaths contains a relative path.')
        return [...paths]
      }
      const primPath = path.getPrimPath()
      const anchor = primPath.getParentPath()
      primPaths.push(primPath)
      anchors.push(anchor)
      labels.push(anchor.isAbsoluteRootPath() ? primPath : primPath.makeRelativePath(anchor))
    }
    let ambiguous: boolean
    do {
      ambiguous = false
      const newAnchors: SdfPath[] = []
      const newLabels: SdfPath[] = []
      for (let i = 0; i < labels.length; ++i) {
        let ok = true
        for (let j = 0; j < labels.length; ++j) {
          if (i !== j && labels[i]!.equals(labels[j]!) && !primPaths[i]!.equals(primPaths[j]!)) {
            ok = false
            break
          }
        }
        if (!ok) {
          const newAnchor = anchors[i]!.getParentPath()
          newAnchors.push(newAnchor)
          newLabels.push(newAnchor.isAbsoluteRootPath()
            ? primPaths[i]! : primPaths[i]!.makeRelativePath(newAnchor))
          ambiguous = true
        } else {
          newAnchors.push(anchors[i]!)
          newLabels.push(labels[i]!)
        }
      }
      anchors = newAnchors
      labels = newLabels
    } while (ambiguous)
    return paths.map((path, i) =>
      anchors[i]!.isAbsoluteRootPath() ? path : path.makeRelativePath(anchors[i]!))
  }

  // SdfPath::RemoveDescendentPaths (path.cpp:2254-2268): sorts `paths` and
  // removes, in place, every path that has another path in it as a prefix.
  static removeDescendentPaths(paths: SdfPath[]): SdfPath[] {
    paths.sort(SdfPath.compare)
    let kept = 0
    for (let i = 0; i < paths.length; ++i) {
      if (kept > 0 && paths[i]!.hasPrefix(paths[kept - 1]!)) continue
      paths[kept++] = paths[i]!
    }
    paths.length = kept
    return paths
  }

  // SdfPath::RemoveAncestorPaths (path.cpp:2270-2284): sorts `paths` and
  // removes, in place, every path that is a prefix of another path in it.
  static removeAncestorPaths(paths: SdfPath[]): SdfPath[] {
    paths.sort(SdfPath.compare)
    const kept: SdfPath[] = []
    for (let i = paths.length - 1; i >= 0; --i) {
      if (kept.length > 0 && kept[kept.length - 1]!.hasPrefix(paths[i]!)) continue
      kept.push(paths[i]!)
    }
    kept.reverse()
    paths.length = 0
    paths.push(...kept)
    return paths
  }

  // ---- Prefix relations -------------------------------------------------------

  // HasPrefix: is `prefix` an ancestor-or-equal of this path?
  // SdfPath::operator< (path.h:919-928, path.cpp:2085-2158): absolute
  // paths precede relative ones; prim parts compare before property parts;
  // within a part, a path precedes its descendants and siblings compare by
  // node type, then by element.
  static compare(lhs: SdfPath, rhs: SdfPath): number {
    if (lhs._node === rhs._node) return 0
    if (!lhs._node || !rhs._node) return !lhs._node ? -1 : 1
    if (lhs._node.isAbsolute !== rhs._node.isAbsolute) return lhs._node.isAbsolute ? -1 : 1
    const [lPrim, lProp] = splitPathParts(lhs._node)
    const [rPrim, rProp] = splitPathParts(rhs._node)
    const primOrder = compareNodeChains(lPrim, rPrim)
    if (primOrder !== 0) return primOrder
    return compareNodeChains(lProp, rProp)
  }

  hasPrefix(prefix: SdfPath): boolean {
    if (prefix.isEmpty() || this.isEmpty()) return false
    const pc = prefix.pathElementCount
    let n: PathNode | null = this._node
    while (n !== null && n.elementCount > pc) n = n.parent
    return n !== null && SdfPath._wrap(n).pathString === prefix.pathString
  }

  // ReplacePrefix (path.cpp:1403-1478): replace `oldPrefix` with `newPrefix`
  // at the front of this path and, with fixTargetPaths, in its target paths
  // ('/a.rel[/target]' with '/target' -> '/other' is '/a.rel[/other]').
  replacePrefix(oldPrefix: SdfPath, newPrefix: SdfPath, fixTargetPaths = true): SdfPath {
    if (this.isEmpty() || oldPrefix.pathString === newPrefix.pathString) return this
    if (oldPrefix.isEmpty() || newPrefix.isEmpty()) return SdfPath.emptyPath
    if (this.pathString === oldPrefix.pathString) return newPrefix
    let result: SdfPath = this
    if (this.hasPrefix(oldPrefix)) {
      // Collect the suffix nodes below oldPrefix, then re-append onto newPrefix.
      const oc = oldPrefix.pathElementCount
      const suffix: PathNode[] = []
      for (let n: PathNode | null = this._node; n !== null && n.elementCount > oc; n = n.parent) suffix.push(n)
      suffix.reverse()
      let node = newPrefix._node!
      for (const orig of suffix) node = rebuildNode(orig, node)
      result = SdfPath._wrap(node)
    }
    if (!fixTargetPaths) return result
    return result.replaceTargetPaths(target => target.replacePrefix(oldPrefix, newPrefix, true))
  }

  // GetAllTargetPathsRecursively (path.cpp:504-516): every target and mapper
  // path in this path, including targets of targets, leafmost first.
  getAllTargetPathsRecursively(): SdfPath[] {
    const out: SdfPath[] = []
    for (let n = this._node; n !== null && isPropKind(n.kind); n = n.parent) {
      if (n.kind === 'target' || n.kind === 'mapper') {
        out.push(n.targetPath!)
        out.push(...n.targetPath!.getAllTargetPathsRecursively())
      }
    }
    return out
  }

  /**
   * This path with each target and mapper path element replaced by `fn`'s
   * result, or the empty path if `fn` returns the empty path for any target
   * (the target fix-up ReplacePrefix performs for paths inside targets).
   */
  replaceTargetPaths(fn: (target: SdfPath) => SdfPath): SdfPath {
    if (this._node === null || !this._node.containsTargetPath) return this
    const chain: PathNode[] = []
    for (let n: PathNode | null = this._node; n !== null; n = n.parent) chain.push(n)
    chain.reverse()
    let node: PathNode | null = null
    for (const orig of chain) {
      if (orig.kind === 'root') {
        node = orig
        continue
      }
      if (orig.kind === 'target' || orig.kind === 'mapper') {
        const mapped = fn(orig.targetPath!)
        if (mapped.isEmpty()) return SdfPath.emptyPath
        node = new PathNode(orig.kind, node, node!.isAbsolute, '', '', '', mapped)
      } else {
        node = rebuildNode(orig, node)
      }
    }
    return SdfPath._wrap(node)
  }

  // ReplaceTargetPath (path.cpp:1603-1637): this path with its leafmost
  // target or mapper path replaced.
  replaceTargetPath(newTargetPath: SdfPath): SdfPath {
    const n = this._node
    if (n === null) return SdfPath.emptyPath
    if (newTargetPath.isEmpty()) {
      tfWarn('ReplaceTargetPath(): invalid new target path.')
      return SdfPath.emptyPath
    }
    switch (n.kind) {
      case 'target': return this.getParentPath().appendTarget(newTargetPath)
      case 'relationalAttribute':
        return this.getParentPath().replaceTargetPath(newTargetPath).appendRelationalAttribute(n.name)
      case 'mapper': return this.getParentPath().appendMapper(newTargetPath)
      case 'mapperArg':
        return this.getParentPath().replaceTargetPath(newTargetPath).appendMapperArg(n.name)
      case 'expression':
        return this.getParentPath().replaceTargetPath(newTargetPath).appendExpression()
      default: return this
    }
  }

  // GetCommonPrefix (path.cpp:1473-1530): the longest shared ancestor path.
  getCommonPrefix(other: SdfPath): SdfPath {
    if (other.isEmpty()) {
      tfWarn('GetCommonPrefix(): invalid path.')
      return SdfPath.emptyPath
    }
    if (this.isEmpty()) return SdfPath.emptyPath
    let a: PathNode | null = this._node
    let b: PathNode | null = other._node
    while (a !== null && b !== null && a.elementCount > b.elementCount) a = a.parent
    while (a !== null && b !== null && b.elementCount > a.elementCount) b = b.parent
    while (a !== null && b !== null && a !== b && a.text() !== b.text()) {
      a = a.parent; b = b.parent
    }
    return SdfPath._wrap(a)
  }

  // RemoveCommonSuffix (path.cpp:1541-1601): both paths with their longest
  // common suffix removed; with stopAtRootPrim, root prims are never removed.
  removeCommonSuffix(otherPath: SdfPath, stopAtRootPrim = false): [SdfPath, SdfPath] {
    if (this.isEmpty() || otherPath.isEmpty()) return [this, otherPath]
    let a = this._node!
    let b = otherPath._node!
    const aHasProp = isPropKind(a.kind)
    if (aHasProp !== isPropKind(b.kind)) return [this, otherPath]
    if (aHasProp) {
      while (isPropKind(a.kind) && isPropKind(b.kind)) {
        if (!nodesEqual(a, b)) return [SdfPath._wrap(a), SdfPath._wrap(b)]
        a = a.parent!
        b = b.parent!
      }
      if (isPropKind(a.kind) || isPropKind(b.kind)) return [SdfPath._wrap(a), SdfPath._wrap(b)]
    }
    while (a.elementCount > 1 && b.elementCount > 1) {
      if (!nodesEqual(a, b)) return [SdfPath._wrap(a), SdfPath._wrap(b)]
      a = a.parent!
      b = b.parent!
    }
    // If stopAtRootPrim is not true and neither path is a root then we can
    // scan upwards one more level.
    if (!stopAtRootPrim && a.elementCount >= 1 && b.elementCount >= 1 && nodesEqual(a, b)) {
      a = a.parent!
      b = b.parent!
    }
    return [SdfPath._wrap(a), SdfPath._wrap(b)]
  }

  // ---- Stringify --------------------------------------------------------------

  // GetAsString (path.cpp:346-350).
  get pathString(): string {
    return this._node === null ? '' : this._node.text()
  }
  toString(): string { return this.pathString }
  // SdfPath is an immutable value (path.h): its copy constructor shares the
  // path node, so a copy (VtValue, VdfVector) is the same object.
  Clone(): SdfPath { return this }
  equals(other: SdfPath): boolean { return this.pathString === other.pathString }
}

// _PerThreadPropertyPathCache (path.cpp:893-939): property names that have
// been appended, bounded at the upstream cache's 1 << 10 entries.
const PROPERTY_NAME_CACHE_SIZE = 1 << 10
const propertyNameCache = new Set<string>()
function rememberPropertyName(name: string): void {
  if (propertyNameCache.size >= PROPERTY_NAME_CACHE_SIZE) {
    propertyNameCache.delete(propertyNameCache.values().next().value!)
  }
  propertyNameCache.add(name)
}

// Re-create `orig`'s node with a new `parent` (used by strip/replacePrefix).
function rebuildNode(orig: PathNode, parent: PathNode | null): PathNode {
  return new PathNode(orig.kind, parent, parent?.isAbsolute ?? orig.isAbsolute,
    orig.name, orig.variantSet, orig.variant, orig.targetPath)
}

// "Tack on any property part" (path.cpp:1704, 1810): re-create `propNodes`
// (root-most first) below `path`'s prim part without validation.
function tackOnPropPart(path: SdfPath, propNodes: readonly PathNode[]): SdfPath {
  if (propNodes.length === 0 || path.isEmpty()) return path
  let node = (path as unknown as { _node: PathNode })._node
  for (const orig of propNodes) node = rebuildNode(orig, node)
  return SdfPath._wrap(node)
}

// _AppendNode (path.cpp:644-677).
function appendNode(path: SdfPath, node: PathNode): SdfPath {
  switch (node.kind) {
    case 'prim': return path.appendChild(node.name)
    case 'property': return path.appendProperty(node.name)
    case 'variant': return path.appendVariantSelection(node.variantSet, node.variant)
    case 'target': return path.appendTarget(node.targetPath!)
    case 'relationalAttribute': return path.appendRelationalAttribute(node.name)
    case 'mapper': return path.appendMapper(node.targetPath!)
    case 'mapperArg': return path.appendMapperArg(node.name)
    case 'expression': return path.appendExpression()
    default:
      tfCodingError(`Unexpected node type ${node.kind}`)
      return SdfPath.emptyPath
  }
}

// ---- Identifier character classes -------------------------------------------
//
// Utf8IdentifierStart / XidContinue (pathParser.h:29-91) and
// _IsValidIdentifier (path.cpp:1818-1854), with an ASCII fast path.

const XID_START = /^\p{XID_Start}$/u
const XID_CONTINUE = /^\p{XID_Continue}$/u

function isAsciiAlpha(c: number): boolean {
  return (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)
}
function isAsciiDigit(c: number): boolean { return c >= 0x30 && c <= 0x39 }

// End index of one code point at `i` satisfying `re`, or `i`.
function nonAsciiEnd(s: string, i: number, re: RegExp): number {
  const cp = s.codePointAt(i)!
  const len = cp > 0xffff ? 2 : 1
  return re.test(s.slice(i, i + len)) ? i + len : i
}

// End of a Utf8IdentifierStart character at `i`, or `i`.
function identifierStartEnd(s: string, i: number): number {
  if (i >= s.length) return i
  const c = s.charCodeAt(i)
  if (c < 0x80) return (isAsciiAlpha(c) || c === 0x5f) ? i + 1 : i
  return nonAsciiEnd(s, i, XID_START)
}

// End of an XidContinue character at `i`, or `i`.
function xidContinueEnd(s: string, i: number): number {
  if (i >= s.length) return i
  const c = s.charCodeAt(i)
  if (c < 0x80) return (isAsciiAlpha(c) || isAsciiDigit(c) || c === 0x5f) ? i + 1 : i
  return nonAsciiEnd(s, i, XID_CONTINUE)
}

// End of a Utf8Identifier starting at `i`, or `i` if there is none.
function identifierEnd(s: string, i: number): number {
  let e = identifierStartEnd(s, i)
  if (e === i) return i
  for (;;) {
    const n = xidContinueEnd(s, e)
    if (n === e) return e
    e = n
  }
}

function isValidIdentifier(name: string): boolean {
  return name.length !== 0 && identifierEnd(name, 0) === name.length
}

// ---- Parser -----------------------------------------------------------------
//
// Sdf_ParsePath (pathParser.cpp:207-243) over the PEGTL grammar of
// pathParser.h:93-206, as recursive descent. Committed rules (if_must/must)
// throw PathParseError with the rule's error message (pathParser.cpp:174-191)
// at the input position where the rule failed; a failing must<> does not
// rewind what its rule consumed (e.g. the blanks of pad<>, or the 'mapper' of
// a keyword not followed by a non-identifier character).

class PathParseError {
  constructor(readonly message: string, readonly pos: number) {}
}

const MSG_PATH_END = 'expected end of path'
const MSG_PATH = "expected a path beginning with '/', '.', or a prim name"
const MSG_PRIM_NAME = 'expected prim name'
const MSG_PROPERTY_NAME = "expected property name after '.'"
const MSG_PROPERTY_NAME_PART = "expected identifier after ':'"
const MSG_VARIANT_SET_NAME = "expected variant set name after '{'"
const MSG_VARIANT_SEL_EQ = "expected '=' after variant set name"
const MSG_VAR_SEL_CLOSE = "expected variant set name or '}' to close variant selection"
const MSG_TARGET_PATH = 'expected target or connection path in []'
const MSG_MAPPER_PATH = 'expected connection path in [] for mapper'
const MSG_TARGET_PATH_CLOSE = "expected ']' to close target path"
const MSG_MAPPER = "expected target path after 'mapper'"
const MSG_MAPPER_OR_EXPRESSION = "expected 'mapper' or 'expression' after '.'"
const MSG_MAPPER_ARG = "expected mapper argument name after '.'"

// "Ill-formed SdfPath <%s>%s: %s" (pathParser.cpp:222-236). PEGTL columns
// count UTF-8 bytes; the quoted character is the one at that position.
function formatParseError(s: string, err: PathParseError): string {
  let byteOffset = 0
  for (let i = 0; i < err.pos; i++) {
    const c = s.charCodeAt(i)
    byteOffset += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c <= 0xdbff) ? 4 : (c >= 0xdc00 && c <= 0xdfff) ? 0 : 3
  }
  const col = byteOffset + 1
  const location = err.pos < s.length
    ? ` at character ${col} ('${String.fromCodePoint(s.codePointAt(err.pos)!)}')`
    : ` at character ${col}`
  return `Ill-formed SdfPath <${s}>${location}: ${err.message}`
}

class Sdf_PathParser {
  i = 0
  constructor(readonly s: string) {}

  fail(message: string, pos = this.i): never {
    throw new PathParseError(message, pos)
  }

  // eolf: length of the end of line/input at `p` (0 at end of input), or -1.
  eolfAt(p: number): number {
    const s = this.s
    if (p >= s.length) return 0
    const c = s.charCodeAt(p)
    if (c === 0x0a) return 1
    if (c === 0x0d && s.charCodeAt(p + 1) === 0x0a) return 2
    return -1
  }

  skipBlanks(p: number): number {
    const s = this.s
    for (;;) {
      const c = s.charCodeAt(p)
      if (c !== 0x20 && c !== 0x09) return p
      p++
    }
  }

  // Path (pathParser.h:186-191). Returns null if no alternative matches.
  path(): PathNode | null {
    const s = this.s
    const c = s.charCodeAt(this.i)
    if (c === 0x2f /* '/' */) {
      // seq<AbsoluteRoot, opt<PrimFirstPathElts>>
      this.i++
      let node: PathNode = ABS_ROOT_NODE
      if (identifierStartEnd(s, this.i) > this.i) {
        node = this.primElts(node)
        if (s.charCodeAt(this.i) === 0x2e) node = this.propElts(node)
      }
      return node
    }
    if (c === 0x2e /* '.' */ && s.charCodeAt(this.i + 1) === 0x2e) {
      // seq<DotDots, opt<if_must<Slash, PathElts>>>
      let node: PathNode = REL_ROOT_NODE
      for (;;) {
        node = new PathNode('prim', node, false, PARENT_PATH_ELEMENT)
        this.i += 2
        if (s.charCodeAt(this.i) === 0x2f && s.charCodeAt(this.i + 1) === 0x2e &&
            s.charCodeAt(this.i + 2) === 0x2e) {
          this.i++
          continue
        }
        break
      }
      if (s.charCodeAt(this.i) === 0x2f) {
        this.i++
        const elts = this.pathElts(node)
        // PathElts has no error message of its own.
        if (elts === null) this.fail('')
        node = elts
      }
      return node
    }
    if (c === 0x2e) {
      // ReflexiveRelative: seq<Dot, eolf>
      const eol = this.eolfAt(this.i + 1)
      if (eol >= 0) {
        this.i += 1 + eol
        return REL_ROOT_NODE
      }
    }
    return this.pathElts(REL_ROOT_NODE)
  }

  // PathElts: if_then_else<PrimElts, opt<PropElts>, PropElts>.
  pathElts(base: PathNode): PathNode | null {
    if (identifierStartEnd(this.s, this.i) > this.i) {
      const node = this.primElts(base)
      return this.s.charCodeAt(this.i) === 0x2e ? this.propElts(node) : node
    }
    if (this.s.charCodeAt(this.i) === 0x2e) return this.propElts(base)
    return null
  }

  // PrimElts: PrimName, star<sor<VsStep, PrimStep>>, opt<VariantSelections>.
  // Caller ensures a prim name starts at the current position.
  primElts(base: PathNode): PathNode {
    const s = this.s
    let e = identifierEnd(s, this.i)
    let node = new PathNode('prim', base, base.isAbsolute, s.slice(this.i, e))
    this.i = e
    for (;;) {
      // VsStep; when no prim name follows the selections they are the
      // trailing opt<VariantSelections>, which match identically.
      const sels = this.variantSelections(this.i)
      if (sels !== null) {
        for (const [vset, vsel] of sels.selections) {
          node = new PathNode('variant', node, node.isAbsolute, '', vset, vsel)
        }
        this.i = sels.end
        e = identifierEnd(s, this.i)
        if (e === this.i) break
        node = new PathNode('prim', node, node.isAbsolute, s.slice(this.i, e))
        this.i = e
        continue
      }
      // PrimStep: if_must<Slash, PrimName>
      if (s.charCodeAt(this.i) === 0x2f) {
        this.i++
        e = identifierEnd(s, this.i)
        if (e === this.i) this.fail(MSG_PRIM_NAME)
        node = new PathNode('prim', node, node.isAbsolute, s.slice(this.i, e))
        this.i = e
        continue
      }
      break
    }
    return node
  }

  // VariantSelections: plus<VariantSelection> starting at `p`, or null.
  variantSelections(p: number): { selections: [string, string][]; end: number } | null {
    const s = this.s
    let selections: [string, string][] | null = null
    for (;;) {
      // VarSelOpen: pad<one<'{'>, blank>
      let q = this.skipBlanks(p)
      if (s.charCodeAt(q) !== 0x7b /* '{' */) break
      q = this.skipBlanks(q + 1)
      // VariantSetName: Utf8IdentifierStart, star<sor<XidContinue, '-'>>
      const setStart = q
      q = identifierStartEnd(s, q)
      if (q === setStart) this.fail(MSG_VARIANT_SET_NAME, q)
      for (;;) {
        if (s.charCodeAt(q) === 0x2d /* '-' */) { q++; continue }
        const n = xidContinueEnd(s, q)
        if (n === q) break
        q = n
      }
      const vset = s.slice(setStart, q)
      // VariantSelEq: pad<one<'='>, blank>
      q = this.skipBlanks(q)
      if (s.charCodeAt(q) !== 0x3d /* '=' */) this.fail(MSG_VARIANT_SEL_EQ, q)
      q = this.skipBlanks(q + 1)
      // VariantName: opt<'.'>, star<sor<XidContinue, '|', '-'>>
      const selStart = q
      if (s.charCodeAt(q) === 0x2e) q++
      for (;;) {
        const c = s.charCodeAt(q)
        if (c === 0x7c /* '|' */ || c === 0x2d /* '-' */) { q++; continue }
        const n = xidContinueEnd(s, q)
        if (n === q) break
        q = n
      }
      const vsel = s.slice(selStart, q)
      // VarSelClose: pad<one<'}'>, blank>
      q = this.skipBlanks(q)
      if (s.charCodeAt(q) !== 0x7d /* '}' */) this.fail(MSG_VAR_SEL_CLOSE, q)
      p = this.skipBlanks(q + 1)
      ;(selections ??= []).push([vset, vsel])
    }
    return selections === null ? null : { selections, end: p }
  }

  // PropertyName: Utf8Identifier, star<if_must<':', PropertyNamePart>>.
  propertyName(firstMessage: string): string {
    const s = this.s
    const start = this.i
    let e = identifierEnd(s, this.i)
    if (e === this.i) this.fail(firstMessage)
    this.i = e
    while (s.charCodeAt(this.i) === 0x3a /* ':' */) {
      this.i++
      e = identifierEnd(s, this.i)
      if (e === this.i) this.fail(MSG_PROPERTY_NAME_PART)
      this.i = e
    }
    return s.slice(start, this.i)
  }

  // PropElts: if_must<Dot, PropertyName, opt<sor<
  //   seq<BracketPath<TargetPath>, opt<RelAttrSeq>>,
  //   if_must<Dot, MapperOrExpression>>>>.
  propElts(base: PathNode): PathNode {
    this.i++
    const name = this.propertyName(MSG_PROPERTY_NAME)
    let node = new PathNode('property', base, base.isAbsolute, name)
    rememberPropertyName(name)
    const c = this.s.charCodeAt(this.i)
    if (c === 0x5b /* '[' */) {
      node = new PathNode('target', node, node.isAbsolute, '', '', '', this.bracketPath(false))
      if (this.s.charCodeAt(this.i) === 0x2e) node = this.relAttrSeq(node)
    } else if (c === 0x2e) {
      this.i++
      node = this.mapperOrExpression(node)
    }
    return node
  }

  // RelAttrSeq: if_must<Dot, RelationalAttributeName, opt<sor<
  //   BracketPath<TargetPath>, if_must<Dot, MapperOrExpression>>>>.
  // RelationalAttributeName has no error message of its own.
  relAttrSeq(base: PathNode): PathNode {
    this.i++
    const name = this.propertyName('')
    let node = new PathNode('relationalAttribute', base, base.isAbsolute, name)
    const c = this.s.charCodeAt(this.i)
    if (c === 0x5b) {
      node = new PathNode('target', node, node.isAbsolute, '', '', '', this.bracketPath(false))
    } else if (c === 0x2e) {
      this.i++
      node = this.mapperOrExpression(node)
    }
    return node
  }

  // MapperOrExpression: sor<ExpressionKW, if_must<MapperKW, Mapper>>.
  mapperOrExpression(base: PathNode): PathNode {
    const s = this.s
    if (s.startsWith(EXPRESSION_INDICATOR, this.i) &&
        !isIdentifierOther(s.charCodeAt(this.i + EXPRESSION_INDICATOR.length))) {
      this.i += EXPRESSION_INDICATOR.length
      return new PathNode('expression', base, base.isAbsolute)
    }
    if (s.startsWith(MAPPER_INDICATOR, this.i)) {
      this.i += MAPPER_INDICATOR.length
      if (isIdentifierOther(s.charCodeAt(this.i))) this.fail(MSG_MAPPER_OR_EXPRESSION)
      // Mapper: seq<BracketPath<MapperPath>, opt<if_must<Dot, MapperArg>>>
      if (s.charCodeAt(this.i) !== 0x5b) this.fail(MSG_MAPPER)
      let node = new PathNode('mapper', base, base.isAbsolute, '', '', '', this.bracketPath(true))
      if (s.charCodeAt(this.i) === 0x2e) {
        this.i++
        // MapperArg: PEGTL identifier (ASCII).
        const start = this.i
        let e = start
        const c0 = s.charCodeAt(e)
        if (isAsciiAlpha(c0) || c0 === 0x5f) {
          e++
          while (isIdentifierOther(s.charCodeAt(e))) e++
        }
        if (e === start) this.fail(MSG_MAPPER_ARG)
        node = new PathNode('mapperArg', node, node.isAbsolute, s.slice(start, e))
        this.i = e
      }
      return node
    }
    this.fail(MSG_MAPPER_OR_EXPRESSION)
  }

  // BracketPath<TargetPath|MapperPath>: if_must<'[', Path, ']'>.
  bracketPath(isMapper: boolean): SdfPath {
    this.i++
    const inner = this.path()
    if (inner === null) this.fail(isMapper ? MSG_MAPPER_PATH : MSG_TARGET_PATH)
    if (this.s.charCodeAt(this.i) !== 0x5d /* ']' */) this.fail(MSG_TARGET_PATH_CLOSE)
    this.i++
    return SdfPath._wrap(inner)
  }
}

// PEGTL identifier_other: [a-zA-Z0-9_].
function isIdentifierOther(c: number): boolean {
  return isAsciiAlpha(c) || isAsciiDigit(c) || c === 0x5f
}

// parse<must<Path, PathEnd>>: the parsed path, or throws PathParseError.
// Input after the first end of line is ignored, as PathEnd is eolf.
function parsePath(s: string): SdfPath {
  const parser = new Sdf_PathParser(s)
  const node = parser.path()
  if (node === null) parser.fail(MSG_PATH)
  if (parser.eolfAt(parser.i) < 0) parser.fail(MSG_PATH_END)
  return SdfPath._wrap(node)
}

// ---- Sorted-range searches (path.h:1155-1340) --------------------------------

/**
 * SdfPathFindPrefixedRange: the [begin, end) index range of the
 * SdfPath::operator<-sorted `paths` holding every path prefixed by `prefix`.
 */
export function sdfPathFindPrefixedRange<T>(
  range: readonly T[], prefix: SdfPath,
  getPath: (item: T) => SdfPath = item => item as unknown as SdfPath,
): [number, number] {
  const begin = lowerBound(range, 0, range.length, prefix, getPath)
  // TfFindBoundary: the first element not prefixed by `prefix`.
  let lo = begin
  let hi = range.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (getPath(range[mid]!).hasPrefix(prefix)) lo = mid + 1
    else hi = mid
  }
  return [begin, lo]
}

/**
 * SdfPathFindLongestPrefix: the index of the element of the sorted `range`
 * that is the longest prefix of `path` (including `path` itself), or
 * range.length if there is none.
 */
export function sdfPathFindLongestPrefix<T>(
  range: readonly T[], path: SdfPath,
  getPath: (item: T) => SdfPath = item => item as unknown as SdfPath,
): number {
  return findLongestPrefixImpl(range, path, false, getPath)
}

/**
 * SdfPathFindLongestStrictPrefix: as sdfPathFindLongestPrefix, excluding
 * `path` itself.
 */
export function sdfPathFindLongestStrictPrefix<T>(
  range: readonly T[], path: SdfPath,
  getPath: (item: T) => SdfPath = item => item as unknown as SdfPath,
): number {
  return findLongestPrefixImpl(range, path, true, getPath)
}

function lowerBound<T>(
  range: readonly T[], begin: number, end: number, path: SdfPath, getPath: (item: T) => SdfPath,
): number {
  let lo = begin
  let hi = end
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (SdfPath.compare(getPath(range[mid]!), path) < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Sdf_PathFindLongestPrefixImpl (path.h:1192-1260).
function findLongestPrefixImpl<T>(
  range: readonly T[], path: SdfPath, strictPrefix: boolean, getPath: (item: T) => SdfPath,
): number {
  const origEnd = range.length
  if (origEnd === 0) return origEnd
  let result = lowerBound(range, 0, origEnd, path, getPath)
  if (!strictPrefix && result !== origEnd && getPath(range[result]!).equals(path)) return result
  if (result === 0) return origEnd
  if (path.hasPrefix(getPath(range[--result]!))) return result
  let newPath = path.getCommonPrefix(getPath(range[result]!))
  for (;;) {
    const end = result
    result = lowerBound(range, 0, end, newPath, getPath)
    if (result !== end && getPath(range[result]!).equals(newPath)) return result
    if (result === 0) return origEnd
    if (newPath.hasPrefix(getPath(range[--result]!))) return result
    newPath = newPath.getCommonPrefix(getPath(range[result]!))
  }
}

// SdfPathSet (std::set<SdfPath>): a set of paths iterated in path order, where
// a path precedes its descendants.
export class SdfPathSet implements Iterable<SdfPath> {
  private readonly _map = new Map<string, SdfPath>()
  private _sorted: SdfPath[] | null = null

  constructor(paths?: Iterable<SdfPath>) {
    if (paths) for (const p of paths) this.add(p)
  }

  get size(): number { return this._map.size }
  empty(): boolean { return this._map.size === 0 }

  add(path: SdfPath): this {
    if (!this._map.has(path.pathString)) {
      this._map.set(path.pathString, path)
      this._sorted = null
    }
    return this
  }

  has(path: SdfPath): boolean { return this._map.has(path.pathString) }

  delete(path: SdfPath): boolean {
    const removed = this._map.delete(path.pathString)
    if (removed) this._sorted = null
    return removed
  }

  clear(): void {
    this._map.clear()
    this._sorted = null
  }

  toArray(): SdfPath[] {
    if (!this._sorted) {
      this._sorted = [...this._map.values()].sort((a, b) =>
        a.pathString < b.pathString ? -1 : a.pathString > b.pathString ? 1 : 0)
    }
    return this._sorted
  }

  [Symbol.iterator](): Iterator<SdfPath> { return this.toArray()[Symbol.iterator]() }

  clone(): SdfPathSet { return new SdfPathSet(this._map.values()) }
}
