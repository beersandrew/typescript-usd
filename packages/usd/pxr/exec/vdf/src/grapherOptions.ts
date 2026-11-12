// Ported from OpenUSD 26.11.1: pxr/exec/vdf/grapherOptions.cpp,
//  pxr/exec/vdf/grapherOptions.h, pxr/exec/vdf/object.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/grapherOptions.h and
// grapherOptions.cpp.
//
// VdfGrapherOptions configures aspects of VdfGrapher's output
// (grapherOptions.h:35-311).
//
// Mapping choices:
// - DisplayStyle is a TS enum, also reachable as the static members
//   VdfGrapherOptions.DisplayStyleFull etc. (grapherOptions.h:46-50).
// - The TfHashMaps keyed by VdfObjectPtr (grapherOptions.h:301-304, hashed
//   on the object pointer, object.h:169-176) are JS Maps keyed by the
//   referenced object (VdfObjectPtr.GetIdentity()). operator== on VdfObjectPtr
//   also compares the type (object.h:153-157); one object has exactly one
//   type, so the identity alone is the same key.
// - SetColor/GetColor/SetAnnotation/GetAnnotation take a VdfObjectPtr, or
//   a node, connection, input or output, as C++'s implicit VdfObjectPtr
//   constructors (object.h:63-115) accept them.
// - std::function callbacks are JS functions; an empty std::function is null.

import { TfStringContains } from 'typescript-usd/tf'

import { VdfConnection } from './connection.ts'
import { VdfInput } from './input.ts'
import { VdfNode } from './node.ts'
import { VdfObjectPtr } from './object.ts'
import { VdfOutput } from './output.ts'
import type { VdfConnectionVector } from './types.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/**
 * The display styles for nodes (grapherOptions.h:39-50).
 *
 * DisplayStyleFull: this is the default style and draws the full node.
 * DisplayStyleNoLabels: this draws the node as a box with a name in it.
 * DisplayStyleSummary: this draws the node as a small filled circle.
 */
export enum VdfGrapherOptions_DisplayStyle {
  DisplayStyleFull = 0,
  DisplayStyleNoLabels,
  DisplayStyleSummary,
}

/**
 * Callback used to filter nodes out of the graph: returns true if the node
 * should be in the graph, false if it should be left out
 * (grapherOptions.h:52-58).
 */
export type VdfGrapherOptions_NodeFilterCallback = (nodeToFilter: VdfNode) => boolean

/**
 * Callback used to determine what style a specific node should be rendered
 * with regardless of what was set via SetDisplayStyle()
 * (grapherOptions.h:60-67).
 */
export type VdfGrapherOptions_NodeStyleCallback = (
  node: VdfNode,
  drawnIn: VdfConnectionVector,
  drawnOut: VdfConnectionVector,
) => VdfGrapherOptions_DisplayStyle

/**
 * Allows the grapher to graph a subset of the nodes (grapherOptions.h:69-81).
 */
export class VdfGrapherOptions_NodeLimit {
  readonly node: VdfNode
  readonly maxInDepth: number
  readonly maxOutDepth: number

  constructor(n: VdfNode, maxin: number, maxout: number) {
    this.node = n
    this.maxInDepth = maxin
    this.maxOutDepth = maxout
  }
}

/** NodeLimitVector (grapherOptions.h:83). */
export type VdfGrapherOptions_NodeLimitVector = VdfGrapherOptions_NodeLimit[]

/** An object that converts to a VdfObjectPtr (object.h:63-115). */
export type VdfGrapherOptions_Object =
  VdfObjectPtr | VdfNode | VdfConnection | VdfInput | VdfOutput

// The key of the VdfObjectPtr-keyed maps (see the file header).
function _ObjectKey(object: VdfGrapherOptions_Object): object | null {
  return object instanceof VdfObjectPtr ? object.getIdentity() : object
}

export class VdfGrapherOptions {
  static readonly DisplayStyleFull = VdfGrapherOptions_DisplayStyle.DisplayStyleFull
  static readonly DisplayStyleNoLabels = VdfGrapherOptions_DisplayStyle.DisplayStyleNoLabels
  static readonly DisplayStyleSummary = VdfGrapherOptions_DisplayStyle.DisplayStyleSummary

  // Draws the masks on the connections if true.
  private _drawMasks: boolean

  // Draws the affects masks on outputs if true.
  private _drawAffectsMasks: boolean

  // The width of the page
  private _pageWidth: number

  // The height of the page
  private _pageHeight: number

  // Determines whether or not unique IDs are used.
  private _uniqueIds: boolean

  // The subset of nodes to draw.  If this list is empty, everything
  // in the network is drawn.
  private readonly _nodesToGraph: VdfGrapherOptions_NodeLimitVector = []

  // The callback used to filter nodes out of the graph.
  private _nodeFilterCallback: VdfGrapherOptions_NodeFilterCallback | null = null

  // The callback used to style nodes.
  private _nodeStyleCallback: VdfGrapherOptions_NodeStyleCallback | null = null

  // The display style for the nodes
  private _displayStyle: VdfGrapherOptions_DisplayStyle

  // If true, nodes that have a single output, will render that output.
  private _printSingleOutputs: boolean

  // Map of colored objects to color name.
  private readonly _objectColors = new Map<object | null, TfToken>()

  // Map of annotated objects to annotation.
  private readonly _objectAnnotations = new Map<object | null, string>()

  // If true, unconnected inputs/outputs will be omitted.
  private _omitUnconnectedSpecs: boolean

  // If true, draw connections with explicitly SetColor() only.
  private _drawColorizedConnectionsOnly: boolean

  /** VdfGrapherOptions() (grapherOptions.cpp:17-28). */
  constructor() {
    this._drawMasks = false
    this._drawAffectsMasks = false
    this._pageWidth = 8.5
    this._pageHeight = 11.0
    this._uniqueIds = true
    this._displayStyle = VdfGrapherOptions_DisplayStyle.DisplayStyleFull
    this._printSingleOutputs = false
    this._omitUnconnectedSpecs = false
    this._drawColorizedConnectionsOnly = false
  }

  /**
   * When `drawMasks` is true, the masks on the connections will be drawn
   * (grapherOptions.h:93).
   */
  setDrawMasks(drawMasks: boolean): void { this._drawMasks = drawMasks }

  /**
   * When `drawMasks` is true, the affects masks on node outputs will be
   * drawn.  Setting this to true implies SetPrintSingleOutputs() true as
   * well (grapherOptions.h:99).
   */
  setDrawAffectsMasks(drawMasks: boolean): void { this._drawAffectsMasks = drawMasks }

  /** Returns whether or not masks will be draw on the connections (grapherOptions.h:103). */
  getDrawMasks(): boolean { return this._drawMasks }

  /** Returns whether or not affects masks will be drawn (grapherOptions.h:107). */
  getDrawAffectsMasks(): boolean { return this._drawAffectsMasks }

  /**
   * When `enable` is false, nodes containing only a single output won't
   * render their full connector to reduce clutter (grapherOptions.h:112-113).
   */
  setPrintSingleOutputs(enable: boolean): void { this._printSingleOutputs = enable }

  /** Returns true, if skipping single outputs is enabled (grapherOptions.h:117-118). */
  getPrintSingleOutputs(): boolean { return this._printSingleOutputs }

  /**
   * Sets the desired size of the page output.  Setting the width and height
   * to -1 will disable the page statement in the dot file altogether
   * (grapherOptions.h:124-127).
   */
  setPageSize(width: number, height: number): void {
    this._pageWidth = width
    this._pageHeight = height
  }

  /** Returns the page height (grapherOptions.h:131). */
  getPageHeight(): number { return this._pageHeight }

  /** Returns the page width (grapherOptions.h:135). */
  getPageWidth(): number { return this._pageWidth }

  /**
   * When `uniqueIds` is false, the graph will be printed without using
   * unique ids for node names and ports, which is useful for comparing
   * output in a test (grapherOptions.h:144).
   */
  setUniqueIds(uniqueIds: boolean): void { this._uniqueIds = uniqueIds }

  /** Returns whether or not the graph should use unique ids (grapherOptions.h:148). */
  getUniqueIds(): boolean { return this._uniqueIds }

  /** When `omit` is set, unconnected specs will be omitted (grapherOptions.h:152). */
  setOmitUnconnectedSpecs(omit: boolean): void { this._omitUnconnectedSpecs = omit }

  /**
   * Returns whether or not the produced graph should include unconnected
   * specs (grapherOptions.h:157).
   */
  getOmitUnconnectedSpecs(): boolean { return this._omitUnconnectedSpecs }

  /**
   * When `drawColorizedConnectionsOnly` is set, only connections that have
   * a color set via SetColor() will be drawn (grapherOptions.h:162-164).
   */
  setDrawColorizedConnectionsOnly(drawColorizedConnectionsOnly: boolean): void {
    this._drawColorizedConnectionsOnly = drawColorizedConnectionsOnly
  }

  /**
   * Returns whether connections without a color set via SetColor() should
   * not be drawn (grapherOptions.h:169-171).
   */
  getDrawColorizedConnectionsOnly(): boolean {
    return this._drawColorizedConnectionsOnly
  }

  /**
   * Adds `node` to the list of nodes to be graphed.  If this list is empty,
   * the entire graph will be printed (grapherOptions.h:179-181).
   */
  addNodeToGraph(node: VdfNode, maxInDepth: number, maxOutDepth: number): void {
    this._nodesToGraph.push(new VdfGrapherOptions_NodeLimit(node, maxInDepth, maxOutDepth))
  }

  /**
   * Sets a `color` for `object` which can be a connection or node.  The
   * color must be in a format that is understood by dot
   * (grapherOptions.h:188-192).
   */
  setColor(object: VdfGrapherOptions_Object, color: TfToken): void {
    if (color !== '') {
      this._objectColors.set(_ObjectKey(object), color)
    }
  }

  /**
   * Returns the color for `object` or the empty TfToken if none was set
   * (grapherOptions.h:196-198).
   */
  getColor(object: VdfGrapherOptions_Object): TfToken {
    return this._objectColors.get(_ObjectKey(object)) ?? ''
  }

  /**
   * Sets an annotation `text` for `object` which gets rendered for the
   * object (grapherOptions.h:203-205).
   */
  setAnnotation(object: VdfGrapherOptions_Object, text: string): void {
    this._objectAnnotations.set(_ObjectKey(object), text)
  }

  /**
   * Returns the annotation for `object` or the empty string if none was set
   * (grapherOptions.h:210-212).
   */
  getAnnotation(object: VdfGrapherOptions_Object): string {
    return this._objectAnnotations.get(_ObjectKey(object)) ?? ''
  }

  /** Returns the list of nodes that should be graphed (grapherOptions.h:216). */
  getNodesToGraph(): readonly VdfGrapherOptions_NodeLimit[] { return this._nodesToGraph }

  /**
   * Sets the callback used to filter nodes out of the graph
   * (grapherOptions.h:223-225).
   */
  setNodeFilterCallback(callback: VdfGrapherOptions_NodeFilterCallback | null): void {
    this._nodeFilterCallback = callback
  }

  /** Returns the callback used to filter nodes out of the graph (grapherOptions.h:228-230). */
  getNodeFilterCallback(): VdfGrapherOptions_NodeFilterCallback | null {
    return this._nodeFilterCallback
  }

  /**
   * Sets the callback used to style nodes.  This style will override the
   * default style set via SetDisplayStyle() (grapherOptions.h:235-237).
   */
  setNodeStyleCallback(callback: VdfGrapherOptions_NodeStyleCallback | null): void {
    this._nodeStyleCallback = callback
  }

  /** Returns the (optional) callback used to style nodes (grapherOptions.h:241-243). */
  getNodeStyleCallback(): VdfGrapherOptions_NodeStyleCallback | null {
    return this._nodeStyleCallback
  }

  /**
   * Filters nodes based on debug names, when used as a NodeFilterCallback
   * (grapherOptions.h:246-256, grapherOptions.cpp:30-41).
   *
   * If any of the strings in `nameList` are a substring of the debug name
   * of `node`, returns `includeIfInNameList`.
   */
  static debugNameFilter(
    nameList: readonly string[],
    includeIfInNameList: boolean,
    node: VdfNode): boolean {
    for (const i of nameList) {
      if (TfStringContains(node.getDebugName(), i)) {
        return includeIfInNameList
      }
    }

    return !includeIfInNameList
  }

  /** Sets the default display style for nodes (grapherOptions.h:259-261). */
  setDisplayStyle(style: VdfGrapherOptions_DisplayStyle): void {
    this._displayStyle = style
  }

  /** Returns the default display style for a node (grapherOptions.h:265). */
  getDisplayStyle(): VdfGrapherOptions_DisplayStyle { return this._displayStyle }
}
