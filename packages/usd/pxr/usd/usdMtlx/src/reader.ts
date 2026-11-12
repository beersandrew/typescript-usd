// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/reader.cpp,
//  pxr/usd/usdMtlx/reader.h
// Copyright 2018-2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdMtlx/reader.cpp (UsdMtlxRead) — translates a MaterialX
// document into USD prim specs:
//
//   /MaterialX/Materials/<mat>          Material (MaterialXConfigAPI,
//                                       config:mtlx:version, the full nodedef
//                                       input interface, outputs:mtlx:surface)
//   /MaterialX/Materials/<mat>/<shader> Shader (references the shared shader,
//                                       every input connected to the material
//                                       interface)
//   /MaterialX/Shaders/<shader>         Shader (info:id = ND_*, outputs:<ctx>)
//   /MaterialX/NodeGraphs/<graph>       NodeGraph (outputs + node children)
//
//   /MaterialX/Collections                  CollectionAPI:<name> instances
//                                            (collection:<name>:includes/excludes)
//   /MaterialX/Looks/<look>                  MaterialBindingAPI + material:binding
//                                            rels (direct + collection) + a
//                                            Materials child per <materialassign>
//   /ModelRoot                               external root with a LookVariant
//                                            variant set, one variant per look
//
// Scope (the slice the Hydra path needs): materials, shader nodes, explicit
// and implicit (document-root) nodegraphs, plus looks/materialassign/
// collections/variantassign (UsdMtlxRead's ReadLook). Custom nodedefs with
// local implementations are an upstream feature not yet ported. Dangling
// MaterialX connections are dropped silently, matching upstream's baselines.

import { RelationshipSpec, type Layer } from 'typescript-usd/sdf'
import type {
  Collection, Document, Element, Input, Look, MaterialAssign,
  Node as MtlxNode, NodeGraph, NodeDef, Output,
} from '@mtlx/core'
import { ARRAY_VALID_SEPARATORS, NodeGraph as MtlxNodeGraph, getShaderNodes, splitString, targetStringsMatch } from '@mtlx/core'
import { Version } from 'typescript-usd/sdr'
import { isAbsolute as _ArIsAbsolute, normalizePath, normalizeRelative } from 'typescript-usd/ar/_internal'
import { TF_WARN } from 'typescript-usd/tf'
import { UsdMtlxGetDocument } from './document.ts'
import { shaderContext, usdTypeName, usdValue } from './utils.ts'

// OpenUSD v26.11.1 usdMtlx/reader.cpp::_GetNodeDef and
// _FindMatchingNodeDef: local declarations win; the last implicit default
// is selected unless an explicitly default definition is found.
function getNodeDef(node: MtlxNode): NodeDef | null {
  const local = node.getNodeDef()
  if (local) return local
  const standard = UsdMtlxGetDocument('')
  if (!standard) return null
  if (node.hasNodeDefString()) {
    const explicit = standard.getNodeDef(node.getNodeDefString())
    if (explicit) return explicit
  }
  const shader = ['surfaceshader','displacementshader','volumeshader','lightshader'].includes(node.getType())
  const version = new Version(node.getVersionString())
  let result: NodeDef | null = null
  for (const def of standard.getMatchingNodeDefs(node.getCategory())) {
    if (!targetStringsMatch(node.getTarget(), def.getTarget()) || def.getType() !== node.getType()) continue
    if (!shader && !node.hasExactInputMatch(def)) continue
    if (!version.isValid()) {
      result = def
      if (def.getDefaultVersion()) break
    } else if (version.equals(new Version(def.getVersionString()))) { result = def; break }
  }
  return result
}

// The output of `node` a port connects to (_NodeGraphBuilder::_ConnectPorts,
// reader.cpp:1031-1060): the one named by the port's output attribute, else
// the node's output when its nodedef has one, else "out".
function nodeOutputName(node: MtlxNode, explicit: string): string {
  if (explicit) return explicit
  const outputs = getNodeDef(node)?.getActiveOutputs() ?? []
  return outputs.length === 1 ? outputs[0]!.getName() : 'out'
}

// utils.cpp:503-513 (UsdMtlxGetSourceURI)
function getSourceURI(element: Element | null): string {
  for (let scan = element; scan; scan = scan.getParent()) {
    const uri = scan.getSourceUri()
    if (uri !== '') return uri
  }
  return element?.getSourceUri() ?? ''
}

// reader.cpp:413-454 (_IsLocalCustomNode): the absolute path of the file
// defining `nodeDef` when it is a locally defined custom node with a
// nodegraph implementation, else null.
//
// Divergences: a URL counts as absolute (TfIsRelativePath and TfNormPath are
// for filesystem paths; assets read here may be http URLs), and a nodedef
// of the standard library document itself counts as included in it (that
// document is bundled from one string, so its elements carry no source
// URIs for getReferencedSourceUris to report; document.ts).
let _stdlibIncludes: Set<string> | null = null
function isLocalCustomNode(nodeDef: NodeDef | null): string | null {
  if (!nodeDef) return null

  // Get the absolute path to the NodeDef source uri
  let nodeDefUri = getSourceURI(nodeDef)
  if (nodeDefUri === '' || !_ArIsAbsolute(nodeDefUri)) {
    // Get the absolute path to the containing directory and combine
    // with the nodeDef relative path
    const parentUri = getSourceURI(nodeDef.getParent())
    const dirPath = parentUri.slice(0, parentUri.lastIndexOf('/') + 1)
    const joined = dirPath + nodeDefUri
    nodeDefUri = _ArIsAbsolute(joined) ? normalizePath(joined) : (normalizeRelative(joined) || '.')
  }

  // This is a locally defined custom node if the absolute path to the
  // nodedef is not included in the stdlib doc.
  const stdlib = UsdMtlxGetDocument('')
  _stdlibIncludes ??= stdlib?.getReferencedSourceUris() ?? new Set<string>()
  if (nodeDef.getDocument() === stdlib || _stdlibIncludes.has(nodeDefUri)) return null
  // Verify we have an associated nodegraph, since only locally defined
  // custom nodes with nodegraphs (not implementations) are supported.
  const impl = nodeDef.getImplementation()
  if (impl && impl instanceof MtlxNodeGraph) return nodeDefUri
  TF_WARN('Locally defined custom nodes without nodegraph implementations' +
    ' are not currently supported.')
  return null
}

const SHADER_TYPES = ['surfaceshader', 'displacementshader', 'volumeshader']

// A MaterialX name may carry a namespace prefix separated by a colon, which
// is not a legal USD name char; upstream _MakeName replaces it with "__".
function makeName(mtlxName: string): string {
  return mtlxName.replace(':', '__')
}

// UsdMtlxSplitStringArray — comma/space-separated string list, empties dropped.
function splitStringArray(value: string): string[] {
  return splitString(value, ARRAY_VALID_SEPARATORS)
}

// A variant's [variantSet, variant] selection, last-wins per set within a
// materialassign (mirrors VariantAssignments::_Get's reverse/dedup).
interface VariantSelection { variantSet: string; variant: string }

function emptyListOp(): {
  isExplicit: boolean; explicitItems: unknown[]; prependedItems: unknown[]
  appendedItems: unknown[]; deletedItems: unknown[]
} {
  return { isExplicit: false, explicitItems: [], prependedItems: [], appendedItems: [], deletedItems: [] }
}

export function UsdMtlxRead(doc: Document, layer: Layer, internalPath = '/MaterialX'): void {
  new _Reader(doc, layer, internalPath).read()
}

// Mirrors UsdMtlxReadNodeGraphs — authors every (non-functional) nodegraph
// and standalone node in the document, independent of materials. The file
// format uses UsdMtlxRead, which authors only the material dependency
// closure; this entry point serves tooling that wants the graphs themselves.
export function UsdMtlxReadNodeGraphs(doc: Document, layer: Layer, internalPath = '/MaterialX'): void {
  new _Reader(doc, layer, internalPath).readNodeGraphs()
}

class _Reader {
  private readonly _sharedShaders = new Set<string>()
  private readonly _authoredGraphs = new Set<string>()
  // MaterialX material name → authored USD material path (GetMaterial).
  private readonly _materials = new Map<string, string>()

  constructor(
    private readonly doc: Document,
    private readonly layer: Layer,
    private readonly root: string,
    private readonly externalRoot = '/ModelRoot',
  ) {}

  // The file-format read: materials and their dependency closure, then looks
  // (collections, material bindings, variant assignments). A document with no
  // materials produces an empty layer (Pixar parity — only doc-level color
  // management metadata is carried over).
  read(): void {
    this._readDocMetadata()
    // Read in locally defined Custom Nodes defined with a nodegraph
    // (reader.cpp:2619-2620, ReadNodeGraphsWithDefs 2247-2262).
    for (const graph of this.doc.getNodeGraphs()) {
      const nodeDef = graph.getNodeDef()
      if (nodeDef) this._readNodeGraphWithDef(graph, nodeDef)
    }
    const materials = this.doc.getMaterialNodes()
    if (!materials.length) return
    this.layer.definePrimSpec(this.root)
    this.layer.definePrimSpec(`${this.root}/Materials`)
    for (const mat of materials) this._readMaterial(mat)
    this._readLooks()
  }

  // All document nodegraphs + standalone root nodes (UsdMtlxReadNodeGraphs).
  readNodeGraphs(): void {
    this._readDocMetadata()
    for (const graph of this.doc.getNodeGraphs()) {
      if (!this._isDocumentGraph(graph)) continue
      this._readNodeGraph(graph)
    }
    // Document-root standalone nodes live in the implicit nodegraph
    // container (upstream authors them directly under /MaterialX/NodeGraphs).
    for (const node of this.doc.getNodes()) {
      if (node.getType() === 'material') continue
      if (SHADER_TYPES.includes(node.getType())) continue
      if (node.hasSourceUri()) continue
      this._ensureNodeGraphsScope()
      this._readNode(node, `${this.root}/NodeGraphs`)
    }
  }

  private _readDocMetadata(): void {
    const cms = this.doc.getAttribute('cms')
    if (cms) this.layer.setField('/', 'colorManagementSystem', cms)
    const colorSpace = this.doc.getAttribute('colorspace')
    if (colorSpace) this.layer.setField('/', 'customLayerData', { colorSpace })
  }

  // Graphs that implement a nodedef are definitions, not scene content; the
  // attached standard library's graphs surface through doc.getNodeGraphs()
  // but carry a source URI (the document's own content, read from a string,
  // has none). reader.cpp filters both the same way.
  private _isDocumentGraph(graph: NodeGraph): boolean {
    return !graph.getAttribute('nodedef') && !graph.hasSourceUri()
  }

  private _ensureNodeGraphsScope(): void {
    if (this._authoredGraphs.has('')) return
    this._authoredGraphs.add('')
    this.layer.definePrimSpec(this.root)
    this.layer.definePrimSpec(`${this.root}/NodeGraphs`)
  }

  // ---- Materials ----

  private _readMaterial(mat: MtlxNode): void {
    const matPath = `${this.root}/Materials/${makeName(mat.getName())}`
    this._materials.set(mat.getName(), matPath)
    this.layer.definePrimSpec(matPath, 'Material')

    const apiSchemas = emptyListOp()
    apiSchemas.prependedItems.push('MaterialXConfigAPI')
    this.layer.setField(matPath, 'apiSchemas', apiSchemas)
    this.layer.declareProperty(matPath, 'config:mtlx:version', 'string')
    this.layer.setAttrDefault(matPath, 'config:mtlx:version', this.doc.getVersionString())

    for (const shaderType of SHADER_TYPES) {
      for (const shader of getShaderNodes(mat, shaderType)) {
        this._readMaterialShader(mat, matPath, shader)
      }
    }
  }

  private _readMaterialShader(mat: MtlxNode, matPath: string, shader: MtlxNode): void {
    const ctx = shaderContext(shader.getType())
    if (!ctx) return
    const name = shader.getName()
    const nodeDef = getNodeDef(shader)
    const sharedPath = `${this.root}/Shaders/${name}`
    const childPath = `${matPath}/${name}`

    // Shared shader prim holding the nodedef identity (authored once even
    // when several materials use the same shader node).
    if (!this._sharedShaders.has(sharedPath)) {
      this._sharedShaders.add(sharedPath)
      this.layer.definePrimSpec(`${this.root}/Shaders`)
      this.layer.definePrimSpec(sharedPath, 'Shader')
      this.layer.declareProperty(sharedPath, 'info:id', 'token')
      this.layer.setAttrDefault(sharedPath, 'info:id',
        nodeDef?.getName() ?? '')
      this.layer.setField(`${sharedPath}.info:id`, 'variability', 'uniform')
      this.layer.declareProperty(sharedPath, `outputs:${ctx}`, 'token')
    }

    // Child shader prim referencing the shared one; its full input interface
    // is proxied through the material prim.
    this.layer.definePrimSpec(childPath, 'Shader')
    const refs = emptyListOp()
    refs.prependedItems.push({ assetPath: '', primPath: sharedPath, layerOffset: { offset: 0, scale: 1 } })
    this.layer.setField(childPath, 'references', refs)

    // For locally defined custom nodes - set the sourceAsset as the absolute
    // path to the mtlx file, and the subIdentifier to the nodeDef name
    // (reader.cpp:1533-1541).
    this._setSourceAsset(childPath, nodeDef)

    // The material interface mirrors the NODEDEF's inputs: every input is
    // declared; authored values land on the interface and the child shader
    // connects back to it. Inputs connected to a nodegraph bypass the
    // interface — the child shader connects directly to a material-LOCAL
    // copy of the graph (a typeless child prim referencing the shared one).
    const interfaceInputs = nodeDef?.getActiveInputs() ?? shader.getInputs()
    for (const defInput of interfaceInputs) {
      const inputName = defInput.getName()
      const attr = `inputs:${inputName}`
      const sdfType = usdTypeName(defInput.getType())
      this.layer.declareProperty(matPath, attr, sdfType)

      let childTarget = `${matPath}.${attr}`
      const instInput = shader.getInput(inputName)
      if (instInput) {
        const value = usdValue(instInput)
        if (value !== undefined) {
          this.layer.setAttrDefault(matPath, attr, value)
        } else {
          const local = this._localGraphTarget(matPath, instInput)
          if (local) childTarget = local
        }
      }

      if (instInput) this._setInputColorSpace(matPath, attr, instInput, shader)
      this.layer.declareProperty(childPath, attr, sdfType)
      this.layer.setAttrConnections(childPath, attr, [childTarget])
    }

    // Material terminal in the "mtlx" render context.
    const terminal = `outputs:mtlx:${ctx}`
    this.layer.declareProperty(matPath, terminal, 'token')
    this.layer.setAttrConnections(matPath, terminal, [`${childPath}.outputs:${ctx}`])
  }

  // A shader input connected to a nodegraph resolves to a material-local
  // copy of that graph: a typeless child prim referencing the shared
  // /MaterialX/NodeGraphs/<name> prim (authored once per material).
  private readonly _localGraphs = new Set<string>()

  private _localGraphTarget(matPath: string, input: Input): string | null {
    const graphName = input.getNodeGraphString()
    if (!graphName) {
      // OpenUSD v26.11.1 reader.cpp:1583-1593,1879-1918: a root
      // nodename connection binds through a material-local implicit graph.
      const nodeName = input.getNodeName()
      if (!nodeName || !this.doc.getNode(nodeName)) return null
      this.readNodeGraphs()
      this.layer.definePrimSpec(`${this.root}/NodeGraphs`, 'NodeGraph')
      const localPath = `${matPath}/NodeGraphs`
      if (!this._localGraphs.has(localPath)) {
        this._localGraphs.add(localPath)
        this.layer.definePrimSpec(localPath)
        const refs = emptyListOp()
        refs.prependedItems.push({assetPath:'',primPath:`${this.root}/NodeGraphs`,layerOffset:{offset:0,scale:1}})
        this.layer.setField(localPath,'references',refs)
      }
      return `${localPath}/${nodeName}.outputs:${nodeOutputName(this.doc.getNode(nodeName)!, input.getOutputString())}`
    }
    const graph = this.doc.getNodeGraph(graphName)
    if (!graph || !this._isDocumentGraph(graph)) return null
    const explicit = input.getOutputString()
    if (explicit && !graph.getOutput(explicit)) return null
    const outName = explicit
      || (graph.getOutputs().length === 1 ? graph.getOutputs()[0]!.getName() : 'out')

    // Dependency closure: the shared graph is authored on first use.
    this._readNodeGraph(graph)

    const localPath = `${matPath}/${graphName}`
    if (!this._localGraphs.has(localPath)) {
      this._localGraphs.add(localPath)
      this.layer.definePrimSpec(localPath)
      const refs = emptyListOp()
      refs.prependedItems.push({
        assetPath: '', primPath: `${this.root}/NodeGraphs/${graphName}`,
        layerOffset: { offset: 0, scale: 1 },
      })
      this.layer.setField(localPath, 'references', refs)
    }
    return `${localPath}.outputs:${outName}`
  }

  // ---- Looks, collections, variants ----

  // Collected variant sets: setName → variantName → (inputName → Input).
  private readonly _variantSets = new Map<string, Map<string, Map<string, Input>>>()
  private readonly _variantSetOrder: string[] = []
  // mtlx collection name → authored CollectionAPI instance name.
  private readonly _collections = new Map<string, string>()
  // A geom-expression key (sorted, joined) → auto-named collection instance.
  private readonly _geomSets = new Map<string, string>()
  private _nextGeomIndex = 1
  // Each materialassign → the collection instance name it binds through (or null
  // for a direct binding). Keyed by materialassign identity.
  private readonly _collectionMapping = new Map<MaterialAssign, string | null>()
  private _collectionsAuthored = false

  // Mirrors the looks portion of UsdMtlxRead: collect variants, read
  // collections, build the per-materialassign variant assignments, author the
  // material variant sets, then each look prim and the external LookVariant.
  private _readLooks(): void {
    const looks = this.doc.getLooks()
    if (!looks.length) return

    this._addVariants()
    const hasCollections = this._readCollections()

    // Collect all of the material/variant assignments, composing each look's
    // assigns (and its inherited looks') under each materialassign's own.
    // assignments: materialassign → ordered VariantSelection[] (last-wins/set).
    const assignments = new Map<MaterialAssign, VariantSelection[]>()
    const materialAssigns: MaterialAssign[] = []
    for (const look of looks) {
      const lookAssigns = this._lookVariantAssigns(look)
      for (const ma of look.getMaterialAssigns()) {
        const own = this._variantAssignsOf(ma)
        const composed = this._composeAssignments(own, lookAssigns)
        assignments.set(ma, composed)
        materialAssigns.push(ma)
      }
    }

    // Create the variants on each material (copy variant value opinions).
    for (const ma of materialAssigns) {
      this._addMaterialVariants(ma, assignments.get(ma) ?? [])
    }

    const looksPath = `${this.root}/Looks`

    // Create the external root prim with a LookVariant variant set.
    this.layer.definePrimSpec(this.externalRoot)
    const lookVariantSet = 'LookVariant'
    const lookVariantNames: string[] = []
    const externalVsChildren = (this.layer.getField(this.externalRoot, 'variantSetChildren') as string[] | undefined) ?? []
    if (!externalVsChildren.includes(lookVariantSet)) {
      this.layer.setField(this.externalRoot, 'variantSetChildren', [...externalVsChildren, lookVariantSet])
      this.layer.setField(this.externalRoot, 'variantSetNames', { ...emptyListOp(), prependedItems: [...externalVsChildren, lookVariantSet] })
    }

    // Author each look (inherited looks first so internal references resolve).
    const authoredLooks = new Set<string>()
    for (const mostDerived of looks) {
      for (const look of this._inheritanceStack(mostDerived)) {
        const lookName = look.getName()
        if (authoredLooks.has(lookName)) continue
        authoredLooks.add(lookName)
        const lookPath = `${looksPath}/${makeName(lookName)}`
        this._readLook(look, lookPath, assignments, hasCollections)

        // A variant for this look in the external root, referencing the look.
        lookVariantNames.push(lookName)
        const variantPath = `${this.externalRoot}{${lookVariantSet}=${lookName}}`
        const refs = emptyListOp()
        refs.prependedItems.push({ assetPath: '', primPath: lookPath, layerOffset: { offset: 0, scale: 1 } })
        this.layer.setField(variantPath, 'references', refs)
      }
    }
    this.layer.setField(`${this.externalRoot}{${lookVariantSet}=}`, 'variantChildren', lookVariantNames)
  }

  // _Context::AddVariants — collect every variant set's variants and their
  // value elements, preserving document order of the sets.
  private _addVariants(): void {
    for (const variantSet of this.doc.getVariantSets()) {
      const setName = variantSet.getName()
      const variants = new Map<string, Map<string, Input>>()
      for (const variant of variantSet.getVariants()) {
        const values = new Map<string, Input>()
        for (const input of variant.getInputs()) values.set(input.getName(), input)
        if (values.size) variants.set(variant.getName(), values)
      }
      if (variants.size) {
        this._variantSets.set(setName, variants)
        this._variantSetOrder.push(setName)
      }
    }
  }

  // ReadCollections — author every collection plus the geom-expression
  // collections referenced by materialassigns. Returns whether any collection
  // exists (so looks know to reference the Collections prim for bindings).
  private _readCollections(): boolean {
    let hasAny = false
    for (const collection of this.doc.getCollections()) {
      this._addCollection(collection, new Set())
      hasAny = true
    }
    // Note the geometry on each material assignment (collection= or geom=).
    for (const look of this.doc.getLooks()) {
      for (const ma of look.getMaterialAssigns()) {
        this._addGeometryReference(ma)
      }
    }
    return hasAny
  }

  private _collectionsPath(): string {
    return `${this.root}/Collections`
  }

  private _ensureCollectionsPrim(): void {
    if (this._collectionsAuthored) return
    this._collectionsAuthored = true
    this.layer.definePrimSpec(this.root)
    this.layer.definePrimSpec(this._collectionsPath())
  }

  // _Context::_AddCollection — apply a CollectionAPI instance and author its
  // include/exclude relationships (recursing into included collections).
  private _addCollection(collection: Collection, visited: Set<string>): string | null {
    const name = collection.getName()
    if (visited.has(name)) return null // cycle guard
    visited.add(name)

    this._ensureCollectionsPrim()
    const instance = makeName(name)
    this._collections.set(name, instance)
    this._applyCollectionApi(instance)
    // CreateIncludesRel is touched for every collection (baseline parity).
    this._ensureRel(`collection:${instance}:includes`)

    const colPath = this._collectionsPath()
    const geomPrefix = collection.getActiveGeomPrefix()

    const includeCollections = collection.getIncludeCollectionString()
    if (includeCollections) {
      for (const childName of splitStringArray(includeCollections)) {
        const child = this.doc.getCollection(childName)
        if (!child) continue
        const childInstance = this._addCollection(child, visited)
        if (childInstance) {
          this._addRelTarget(`collection:${instance}:includes`,
            `${colPath}.collection:${childInstance}`)
        }
      }
    }
    const includeGeom = collection.getIncludeGeom()
    if (includeGeom) {
      for (const p of splitStringArray(includeGeom)) {
        this._addGeom(`collection:${instance}:includes`, geomPrefix + p)
      }
    }
    const excludeGeom = collection.getExcludeGeom()
    if (excludeGeom) {
      for (const p of splitStringArray(excludeGeom)) {
        this._addGeom(`collection:${instance}:excludes`, geomPrefix + p)
      }
    }
    return instance
  }

  // _Context::AddGeometryReference — resolve a materialassign's binding target
  // to a collection: a named collection=, else a geom= expression collection.
  private _addGeometryReference(ma: MaterialAssign): void {
    const collectionName = ma.getCollectionString()
    if (collectionName) {
      const instance = this._collections.get(collectionName) ?? null
      this._collectionMapping.set(ma, instance)
      return
    }
    const geomInstance = this._addGeomExpr(ma)
    this._collectionMapping.set(ma, geomInstance)
  }

  // _Context::_AddGeomExpr — a geom= attribute becomes an auto-named
  // ("geom_N") collection, deduplicated by its sorted geometry set.
  private _addGeomExpr(ma: MaterialAssign): string | null {
    const geom = ma.getGeom()
    if (!geom) return null
    const paths = [...new Set(splitStringArray(geom))].sort()
    const key = paths.join(',')
    const existing = this._geomSets.get(key)
    if (existing) return existing

    this._ensureCollectionsPrim()
    const instance = `geom_${this._nextGeomIndex++}`
    this._geomSets.set(key, instance)
    this._applyCollectionApi(instance)
    const geomPrefix = ma.getActiveGeomPrefix()
    for (const p of paths) this._addGeom(`collection:${instance}:includes`, geomPrefix + p)
    return instance
  }

  // _Context::_AddGeom — a geometry path is reparented under the Collections
  // prim (SdfPath::ReplacePrefix of the absolute root with the collections
  // path); non-path strings are ignored.
  private _addGeom(relName: string, pathString: string): void {
    if (!pathString.startsWith('/')) return
    this._addRelTarget(relName, `${this._collectionsPath()}${pathString}`)
  }

  // Append CollectionAPI:<instance> to the Collections prim's apiSchemas.
  private _applyCollectionApi(instance: string): void {
    const authored = this.layer.getField(this._collectionsPath(), 'apiSchemas') as ReturnType<typeof emptyListOp> | undefined
    const schema = `CollectionAPI:${instance}`
    // The field value is the layer's; edit a copy (SdfLayer::GetField
    // returns a copy, layer.cpp:3861-3880).
    const lop = authored ? { ...authored, prependedItems: [...authored.prependedItems] } : emptyListOp()
    if (!lop.prependedItems.includes(schema)) lop.prependedItems.push(schema)
    this.layer.setField(this._collectionsPath(), 'apiSchemas', lop)
  }

  // SdfRelationshipSpec::New preserves relationship spec identity; declaring
  // an attribute named "rel" cannot represent a relationship in SdfData.
  private _setRelTargets(primPath: string, name: string, targets: string[]): void {
    if (!this.layer.getRelationshipAtPath(`${primPath}.${name}`)) {
      RelationshipSpec.new(this.layer.getPrimAtPath(primPath), name, false)
    }
    this.layer.setRelTargets(primPath, name, targets)
  }

  private _ensureRel(relName: string): void {
    if (!this.layer.getRelationshipAtPath(`${this._collectionsPath()}.${relName}`)) {
      RelationshipSpec.new(this.layer.getPrimAtPath(this._collectionsPath()), relName, false)
    }
  }

  // Append a relationship target, deduplicating — UsdRelationship::AddTarget
  // is a prepend list-op edit that never adds a duplicate. A collection
  // included from two paths (e.g. directly and via includecollection) is
  // authored once.
  private _addRelTarget(relName: string, target: string): void {
    const path = `${this._collectionsPath()}.${relName}`
    const targets = (this.layer.getField(path, 'targetPaths') as readonly string[] | undefined) ?? []
    if (targets.includes(target)) return
    this._setRelTargets(this._collectionsPath(), relName, [...targets, target])
  }

  // VariantAssignments::_Get — a materialassign's own variant assigns, last
  // assignment winning per variant set (the reverse/dedup of upstream).
  private _variantAssignsOf(ma: MaterialAssign): VariantSelection[] {
    const result: VariantSelection[] = []
    const seen = new Set<string>()
    const assigns = [...ma.getVariantAssigns()].reverse()
    for (const va of assigns) {
      const set = va.getVariantSetString()
      if (seen.has(set)) continue
      seen.add(set)
      result.push({ variantSet: set, variant: va.getVariantString() })
    }
    return result.reverse()
  }

  // VariantAssignments::AddInherited — a look's own variant assigns composed
  // (as weaker) under its inherited looks' assigns.
  private _lookVariantAssigns(look: Look): VariantSelection[] {
    let result: VariantSelection[] = []
    let current: Look | null = look
    const visited = new Set<string>()
    while (current && !visited.has(current.getName())) {
      visited.add(current.getName())
      result = this._composeAssignments(result, this._variantAssignsOfLook(current))
      const inherit = current.getInheritString()
      current = inherit ? this.doc.getLook(inherit) : null
    }
    return result
  }

  // A look element's direct <variantassign> children (no material context).
  private _variantAssignsOfLook(look: Look): VariantSelection[] {
    const result: VariantSelection[] = []
    const seen = new Set<string>()
    const assigns = [...look.getVariantAssigns()].reverse()
    for (const va of assigns) {
      const set = va.getVariantSetString()
      if (seen.has(set)) continue
      seen.add(set)
      result.push({ variantSet: set, variant: va.getVariantString() })
    }
    return result.reverse()
  }

  // VariantAssignments::Compose — apply `weaker` to `stronger`, ignoring any
  // variant set already present in stronger.
  private _composeAssignments(stronger: VariantSelection[], weaker: VariantSelection[]): VariantSelection[] {
    const seen = new Set(stronger.map(s => s.variantSet))
    const result = [...stronger]
    for (const w of weaker) {
      if (!seen.has(w.variantSet)) { seen.add(w.variantSet); result.push(w) }
    }
    return result
  }

  // AddMaterialVariants / AddMaterialVariant — author the assigned variants as
  // variant sets on the bound material, copying each variant's value opinions
  // into the material's variant edit context.
  private _addMaterialVariants(ma: MaterialAssign, selections: VariantSelection[]): void {
    const matPath = this._materials.get(ma.getMaterial())
    if (!matPath) return
    for (const setName of this._variantSetOrder) {
      for (const { variantSet, variant } of selections) {
        if (variantSet !== setName) continue
        const values = this._variantSets.get(variantSet)?.get(variant)
        if (!values) continue

        // Register the variant set + variant on the material.
        const vsChildren = (this.layer.getField(matPath, 'variantSetChildren') as string[] | undefined) ?? []
        if (!vsChildren.includes(variantSet)) {
          this.layer.setField(matPath, 'variantSetChildren', [...vsChildren, variantSet])
          this.layer.setField(matPath, 'variantSetNames', { ...emptyListOp(), prependedItems: [...vsChildren, variantSet] })
        }
        const emptyVariantPath = `${matPath}{${variantSet}=}`
        const variantChildren = (this.layer.getField(emptyVariantPath, 'variantChildren') as string[] | undefined) ?? []
        if (!variantChildren.includes(variant)) {
          this.layer.setField(emptyVariantPath, 'variantChildren', [...variantChildren, variant])
        }

        // Copy the variant's value opinions into the variant edit context.
        const variantPath = `${matPath}{${variantSet}=${variant}}`
        for (const [inputName, input] of values) {
          const value = usdValue(input)
          if (value === undefined) continue
          const attr = `inputs:${inputName}`
          this.layer.declareProperty(variantPath, attr, usdTypeName(input.getType()))
          this.layer.setAttrDefault(variantPath, attr, value)
        }
      }
    }
  }

  // ReadLook — author a Looks/<look> prim: an internal inherit reference, the
  // Collections reference (for collection bindings), a MaterialBindingAPI, and
  // a Materials child + material binding for each <materialassign>.
  private _readLook(
    look: Look, lookPath: string,
    assignments: Map<MaterialAssign, VariantSelection[]>,
    hasCollections: boolean,
  ): void {
    this.layer.definePrimSpec(lookPath)

    const refs = emptyListOp()
    const inherit = look.getInheritString()
    if (inherit) {
      const inheritPath = `${this.root}/Looks/${makeName(inherit)}`
      refs.prependedItems.push({ assetPath: '', primPath: inheritPath, layerOffset: { offset: 0, scale: 1 } })
    }
    if (hasCollections) {
      refs.prependedItems.push({ assetPath: '', primPath: this._collectionsPath(), layerOffset: { offset: 0, scale: 1 } })
    }
    if (refs.prependedItems.length) this.layer.setField(lookPath, 'references', refs)

    // MaterialBindingAPI on the look root.
    const apiSchemas = emptyListOp()
    apiSchemas.prependedItems.push('MaterialBindingAPI')
    this.layer.setField(lookPath, 'apiSchemas', apiSchemas)

    const lookMaterialsPath = `${lookPath}/Materials`
    this.layer.definePrimSpec(lookMaterialsPath)

    // Unique material-assign prim names (inherited names already taken).
    const inheritedNames = this._inheritedMaterialNames(look)
    const used = new Map<string, number>()
    for (const name of inheritedNames) used.set(name, 1)

    const order: string[] = []
    for (const ma of look.getMaterialAssigns()) {
      const matPath = this._materials.get(ma.getMaterial())
      if (!matPath) continue // unknown material

      let materialName = makeName(ma.getName())
      const n = used.get(materialName)
      if (n) {
        let k = n
        let candidate: string
        do { candidate = `${materialName}_${k++}` } while (used.has(candidate))
        used.set(materialName, k)
        materialName = candidate
      }
      used.set(materialName, 1)

      // The look-local material prim references the original material and
      // carries this assign's variant selections.
      const lookMaterialPath = `${lookMaterialsPath}/${materialName}`
      this.layer.definePrimSpec(lookMaterialPath)
      const matRefs = emptyListOp()
      matRefs.prependedItems.push({ assetPath: '', primPath: matPath, layerOffset: { offset: 0, scale: 1 } })
      this.layer.setField(lookMaterialPath, 'references', matRefs)

      const sel = { ...(this.layer.getField(lookMaterialPath, 'variantSelection') as Record<string, string> | undefined) }
      for (const { variantSet, variant } of assignments.get(ma) ?? []) {
        // Only record selections for variant sets that actually exist.
        if (this._variantSets.has(variantSet)) sel[variantSet] = variant
      }
      if (Object.keys(sel).length) this.layer.setField(lookMaterialPath, 'variantSelection', sel)

      // Bind the material — to a collection if the assign has one, else direct.
      const collectionInstance = this._collectionMapping.get(ma)
      if (collectionInstance) {
        const relName = `material:binding:collection:${materialName}`
        this._setRelTargets(lookPath, relName,
          [`${lookPath}.collection:${collectionInstance}`, lookMaterialPath])
        order.push(relName)
      } else {
        this._setRelTargets(lookPath, 'material:binding', [lookMaterialPath])
        order.push('material:binding')
      }
    }

    if (order.length) {
      const inheritedOrder = (this.layer.getField(lookPath, 'propertyOrder') as string[] | undefined) ?? []
      this.layer.setField(lookPath, 'propertyOrder', [...order, ...inheritedOrder])
    }
  }

  // The material-assign prim names a look inherits (so we can keep ours unique,
  // mirroring lookMaterialsPrim.GetAllChildren in ReadLook).
  private _inheritedMaterialNames(look: Look): string[] {
    const names: string[] = []
    let inherit = look.getInheritString()
    const visited = new Set<string>()
    while (inherit && !visited.has(inherit)) {
      visited.add(inherit)
      const parent = this.doc.getLook(inherit)
      if (!parent) break
      for (const ma of parent.getMaterialAssigns()) {
        if (this._materials.has(ma.getMaterial())) names.push(makeName(ma.getName()))
      }
      inherit = parent.getInheritString()
    }
    return names
  }

  // _GetInheritanceStack — most-derived last, so inherited looks are authored
  // first (their internal references must already exist).
  private _inheritanceStack(mostDerived: Look): Look[] {
    const stack: Look[] = []
    let current: Look | null = mostDerived
    const visited = new Set<string>()
    while (current && !visited.has(current.getName())) {
      visited.add(current.getName())
      stack.push(current)
      const inherit = current.getInheritString()
      current = inherit ? this.doc.getLook(inherit) : null
    }
    stack.reverse()
    return stack
  }

  // ---- NodeGraphs ----

  // _IsLocalCustomNode's sourceAsset and subIdentifier in the "mtlx" render
  // context (UsdShadeShader::SetSourceAsset, SetSourceAssetSubIdentifier).
  private _setSourceAsset(shaderPath: string, nodeDef: NodeDef | null): void {
    const uri = isLocalCustomNode(nodeDef)
    if (uri === null) return
    const set = (name: string, type: string, value: unknown) => {
      this.layer.declareProperty(shaderPath, name, type)
      this.layer.setAttrDefault(shaderPath, name, value)
      this.layer.setField(`${shaderPath}.${name}`, 'variability', 'uniform')
    }
    set('info:implementationSource', 'token', 'sourceAsset')
    set('info:mtlx:sourceAsset', 'asset', uri)
    set('info:mtlx:sourceAsset:subIdentifier', 'token', nodeDef!.getName())
  }

  // _Context::AddNodeGraphWithDef (reader.cpp:1421-1436) and
  // _NodeGraphBuilder::Build (reader.cpp:784-832) for a nodegraph that
  // implements a nodedef: a NodeGraph named for the nodedef, its interface
  // the nodedef's inputs (with their values) and the graph's inputs, its
  // nodes those with a shader id, its outputs connected to their nodes.
  private _readNodeGraphWithDef(graph: NodeGraph, nodeDef: NodeDef): void {
    const name = makeName(nodeDef.getName())
    if (this._authoredGraphs.has(name)) return
    this._authoredGraphs.add(name)
    this._ensureNodeGraphsScope()
    const ngPath = `${this.root}/NodeGraphs/${name}`
    this.layer.definePrimSpec(ngPath, 'NodeGraph')

    const declareInterfaceInput = (input: Input) => {
      const attr = `inputs:${input.getName()}`
      this.layer.declareProperty(ngPath, attr, usdTypeName(input.getType()))
      const value = usdValue(input)
      if (value !== undefined) this.layer.setAttrDefault(ngPath, attr, value)
    }
    // _GetInheritanceStack: the inherited nodedefs first.
    const defs: NodeDef[] = []
    const seen = new Set<string>()
    for (let nd: NodeDef | null = nodeDef; nd && !seen.has(nd.getName());
      nd = nd.getInheritsFrom() as NodeDef | null) {
      seen.add(nd.getName())
      defs.unshift(nd)
    }
    for (const nd of defs) for (const input of nd.getInputs()) declareInterfaceInput(input)
    for (const input of graph.getInputs()) declareInterfaceInput(input)

    // _AddNode skips nodes without a shader id in a nodedef's graph
    // (reader.cpp:855-862).
    for (const node of graph.getNodes()) {
      if (!getNodeDef(node)) continue
      this._readNode(node, ngPath, graph)
    }

    for (const output of graph.getOutputs()) {
      const attr = `outputs:${output.getName()}`
      this.layer.declareProperty(ngPath, attr, usdTypeName(output.getType()))
      const nodeName = output.getNodeName()
      if (nodeName && graph.getNode(nodeName) && getNodeDef(graph.getNode(nodeName)!)) {
        const outName = nodeOutputName(graph.getNode(nodeName)!, output.getOutputString())
        this.layer.setAttrConnections(ngPath, attr, [`${ngPath}/${nodeName}.outputs:${outName}`])
      }
    }
  }

  private _readNodeGraph(graph: NodeGraph): void {
    const name = graph.getName()
    if (this._authoredGraphs.has(name)) return
    this._authoredGraphs.add(name)
    this._ensureNodeGraphsScope()
    const ngPath = `${this.root}/NodeGraphs/${name}`
    this.layer.definePrimSpec(ngPath, 'NodeGraph')

    for (const output of graph.getOutputs()) {
      const attr = `outputs:${output.getName()}`
      this.layer.declareProperty(ngPath, attr, usdTypeName(output.getType()))
      const nodeName = output.getNodeName()
      if (nodeName && graph.getNode(nodeName)) {
        const outName = nodeOutputName(graph.getNode(nodeName)!, output.getOutputString())
        this.layer.setAttrConnections(ngPath, attr, [`${ngPath}/${nodeName}.outputs:${outName}`])
      }
    }

    for (const node of graph.getNodes()) this._readNode(node, ngPath, graph)
  }

  // OpenUSD v26.11.1 reader.cpp:455-497,557-559: inherit the effective
  // MaterialX colorspace, but only author metadata for color inputs and
  // filename inputs belonging to color-output image nodes, and only when it
  // differs from the document's default source colorspace.
  private _setInputColorSpace(primPath: string, name: string, input: Input, node: MtlxNode): void {
    const type = input.getType()
    const supports = type === 'color3' || type === 'color4' ||
      (type === 'filename' && (getNodeDef(node)?.getActiveOutputs() ?? [])
        .some(output => output.getType() === 'color3' || output.getType() === 'color4'))
    const space = input.getActiveColorSpace()
    if (supports && space && space !== this.doc.getActiveColorSpace())
      this.layer.setField(`${primPath}.${name}`, 'colorSpace', space)
  }

  private _readNode(node: MtlxNode, parentPath: string, graph: NodeGraph | null = null): void {
    const nodePath = `${parentPath}/${node.getName()}`
    this.layer.definePrimSpec(nodePath, 'Shader')
    const nodeDef = getNodeDef(node)
    this.layer.declareProperty(nodePath, 'info:id', 'token')
    this.layer.setAttrDefault(nodePath, 'info:id',
      nodeDef?.getName() ?? '')
    this.layer.setField(`${nodePath}.info:id`, 'variability', 'uniform')
    // reader.cpp:876-892
    this._setSourceAsset(nodePath, nodeDef)

    for (const input of node.getInputs()) {
      const attr = `inputs:${input.getName()}`
      const sdfType = usdTypeName(input.getType())
      const value = usdValue(input)
      // An input connected to its graph's interface (reader.cpp:513-525).
      const interfaceName = input.getAttribute('interfacename')
      if (value !== undefined) {
        this.layer.declareProperty(nodePath, attr, sdfType)
        this.layer.setAttrDefault(nodePath, attr, value)
      }
      if (interfaceName && graph) {
        this.layer.declareProperty(nodePath, attr, sdfType)
        if (this.layer.getAttributeAtPath(`${parentPath}.inputs:${interfaceName}`)) {
          this.layer.setAttrConnections(nodePath, attr, [`${parentPath}.inputs:${interfaceName}`])
        } else {
          TF_WARN(`No interface name '${interfaceName}' for node '${input.getName()}'`)
        }
      } else if (value === undefined) {
        const target = this._connectionTarget(input, graph, parentPath)
        if (target) {
          this.layer.declareProperty(nodePath, attr, sdfType)
          this.layer.setAttrConnections(nodePath, attr, [target])
        }
      }
    }

    for (const input of node.getInputs()) {
      const attr = `inputs:${input.getName()}`
      if (this.layer.getAttributeAtPath(`${nodePath}.${attr}`)) this._setInputColorSpace(nodePath, attr, input, node)
    }

    // Outputs come from the nodedef interface (single implicit "out" for
    // most nodes; multi-output nodes declare each).
    const outputs = nodeDef?.getActiveOutputs() ?? []
    if (outputs.length) {
      for (const output of outputs) {
        this.layer.declareProperty(nodePath, `outputs:${output.getName()}`, usdTypeName(output.getType()))
      }
    } else {
      this.layer.declareProperty(nodePath, 'outputs:out', usdTypeName(node.getType()))
    }
  }

  // Resolves a MaterialX port connection (nodename= / nodegraph= [+ output=])
  // to the USD attribute path it composes to. `graph` is the explicit
  // nodegraph the connecting port lives in (null at document scope).
  // Returns null for dangling connections — upstream drops them silently.
  private _connectionTarget(input: Input, graph: NodeGraph | null, graphPath = graph ? `${this.root}/NodeGraphs/${graph.getName()}` : ''): string | null {
    const graphName = input.getNodeGraphString()
    if (graphName) {
      const target = this.doc.getNodeGraph(graphName)
      if (!target) return null
      const explicit = input.getOutputString()
      if (explicit && !target.getOutput(explicit)) return null
      const outName = explicit
        || (target.getOutputs().length === 1 ? target.getOutputs()[0]!.getName() : 'out')
      return `${this.root}/NodeGraphs/${graphName}.outputs:${outName}`
    }

    const nodeName = input.getNodeName()
    if (!nodeName) return null
    // Sibling node inside the same explicit nodegraph?
    const sibling = graph?.getNode(nodeName)
    if (sibling) {
      return `${graphPath}/${nodeName}.outputs:${nodeOutputName(sibling, input.getOutputString())}`
    }

    // Document-root node (implicit nodegraph container).
    const rootNode = this.doc.getNode(nodeName)
    if (rootNode) {
      return `${this.root}/NodeGraphs/${nodeName}.outputs:${nodeOutputName(rootNode, input.getOutputString())}`
    }
    return null
  }
}
