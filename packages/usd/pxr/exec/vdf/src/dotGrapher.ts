// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dotGrapher.cpp,
//  pxr/exec/vdf/dotGrapher.h,
//  pxr/exec/vdf/testenv/testVdfGrapher/normalizeDotFiles.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dotGrapher.h and dotGrapher.cpp.
//
// Vdf_DotGrapher produces .dot files of a VdfNetwork (dotGrapher.h:24-91).
//
// Mapping choices:
// - The std::ostream is any object with a write(string) method (VdfOStream,
//   network.ts), as DumpStats takes it.
// - _FormatAddress (dotGrapher.cpp:74-82) prints an object's address as
//   "0x<hex>". JS objects have no address: each node, input and output gets
//   a distinct, stable number the first time it is printed (a WeakMap), and
//   that number is printed the same way (std::hex with std::showbase). The
//   ids are unique, which is all a dot file and upstream's tests rely on
//   (the normalizeDotFiles.py scripts replace every `0x\w*`).
// - `os << double` (_PrintHeader, dotGrapher.cpp:635-638) uses the default
//   stream format, %g with 6 significant digits (Vdf_StreamDouble,
//   vectorData.ts).
// - The _NodePrinter class hierarchy (dotGrapher.cpp:37-262) is kept as
//   module-private classes; `new`/`delete` of the printer is a local.

import { TF_AXIOM, TfGetXmlEscapedString } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import {
  VdfGrapherOptions_DisplayStyle as DisplayStyle,
  type VdfGrapherOptions,
} from './grapherOptions.ts'
import { VdfInput } from './input.ts'
import { VdfInputSpec } from './inputSpec.ts'
import type { VdfNetwork, VdfOStream } from './network.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import type { VdfConnectionVector, VdfNodePtrSet } from './types.ts'
import { Vdf_StreamDouble } from './vectorData.ts'

//////////////////////////////////////////////////////////////////////////////
// Internal helper classes

// This is an abstract base class that has methods for printing a node.  It is
// derived from for various display styles (dotGrapher.cpp:37-70).
abstract class _NodePrinter {
  protected readonly _os: VdfOStream

  constructor(os: VdfOStream) {
    this._os = os
  }

  // Print the node header.
  abstract printNodeHeader(nodeid: string, nodecolor: string): void

  // Print all the inputs in `inputs`.
  printInputs(
    _inputs: readonly VdfInput[],
    _options: VdfGrapherOptions,
    _colspan: number): void {}

  // Print the name of the node.  The argument `colspan` can be used
  // if needed to decide how wide the name column should be.
  printNodeName(_name: string, _colspan: number): void {}

  // Print all the outputs in `outputs`.
  printOutputs(
    _outputs: readonly VdfOutput[],
    _nodeid: string,
    _options: VdfGrapherOptions,
    _colspan: number): void {}

  // Print the node footer to close off the node.
  printNodeFooter(): void {}
}

// The stand-in addresses (see the file header).
const _addresses = new WeakMap<object, number>()
let _nextAddress = 0x1000

function _GetAddress(addr: object): number {
  let address = _addresses.get(addr)
  if (address === undefined) {
    address = _nextAddress
    _nextAddress += 0x10
    _addresses.set(addr, address)
  }
  return address
}

// Returns a string containing the address in hexadecimal with a leading
// 0x, all enclosed in double-quotes (dotGrapher.cpp:74-82).
function _FormatAddress(addr: object): string {
  return '"0x' + _GetAddress(addr).toString(16) + '"'
}

// Returns the color string for a given input spec (dotGrapher.cpp:84-89).
function _GetInputSpecColor(inSpec: VdfInputSpec): string {
  return (inSpec.getAccess() === VdfInputSpec.READ) ? '#9999cc' : '#99cc99'
}

// Returns a unique string for a given `output` or `input` to be used as
// port (dotGrapher.cpp:91-109).
function _GetPortId(connector: VdfOutput | VdfInput, unique: boolean): string {
  if (unique) {
    return _FormatAddress(connector)
  }
  return `"${connector.getName()}"`
}

// This is the node printer when the draw style is set to draw the full node
// (dotGrapher.cpp:112-210).
class _NodePrinterFull extends _NodePrinter {
  printNodeHeader(nodeid: string, nodecolor: string): void {
    this._os.write('\tnode [shape=plaintext];\n')
    this._os.write('\t\t' + nodeid + ' [label=<\n')
    this._os.write('\t\t<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0"')
    if (nodecolor !== '') {
      this._os.write(' BGCOLOR="' + nodecolor + '"')
    }
    this._os.write('>\n')
  }

  override printInputs(
    inputs: readonly VdfInput[],
    options: VdfGrapherOptions,
    colspan: number): void {
    this._os.write('\t\t\t<TR>')

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!

      const col = (i === inputs.length - 1) ? colspan : 1
      colspan -= col
      TF_AXIOM(col > 0)

      this._os.write('<TD PORT=' + _GetPortId(input, options.getUniqueIds()) + ' ' +
        'COLSPAN="' + col + '">' +
        '<FONT POINT-SIZE="10" FACE="Arial" COLOR="' +
        _GetInputSpecColor(input.getSpec()) + '">' +
        TfGetXmlEscapedString(input.getName()) + '</FONT></TD>')
    }

    this._os.write('</TR>\n')
  }

  override printNodeName(name: string, colspan: number): void {
    this._os.write('\t\t\t<TR><TD ')
    if (colspan) {
      this._os.write('COLSPAN="' + colspan + '"')
    }
    this._os.write('> ' + TfGetXmlEscapedString(name) + ' </TD></TR>\n')
  }

  override printOutputs(
    outputs: readonly VdfOutput[],
    _nodeid: string,
    options: VdfGrapherOptions,
    colspan: number): void {
    // If we only have one output, we're leaving it off the graph to reduce
    // clutter.

    const drawOutputs =
      outputs.length > 1 ||
      options.getDrawAffectsMasks() ||
      options.getPrintSingleOutputs()

    if (!drawOutputs) {
      return
    }

    this._os.write('\t\t\t<TR>')

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i]!

      const col = (i === outputs.length - 1) ? colspan : 1
      colspan -= col
      TF_AXIOM(col > 0)

      this._os.write('<TD PORT=' + _GetPortId(output, options.getUniqueIds()) + ' ' +
        'COLSPAN="' + col + '"' +
        '>' +
        '<FONT POINT-SIZE="10" FACE="Arial" COLOR="#cc9999">')

      // Actual port name.
      this._os.write(TfGetXmlEscapedString(output.getName()))

      const mask = output.getAffectsMask()
      if (mask) {
        this._os.write('   ' + mask.getRLEString())
      }

      this._os.write('</FONT></TD>')
    }

    this._os.write('</TR>\n')
  }

  override printNodeFooter(): void {
    this._os.write('\t\t</TABLE>>];\n')
  }
}

// This is the node printer when the draw style is set to draw the node
// without input or output connectors (dotGrapher.cpp:212-242).
class _NodePrinterNoLabels extends _NodePrinter {
  // XXX:codeCleanup
  // This should not output an HTML table, it should just use a simple
  // shape=box.
  printNodeHeader(nodeid: string, nodecolor: string): void {
    this._os.write('\tnode [shape=plaintext];\n')
    this._os.write('\t\t' + nodeid + ' [label=<\n')
    this._os.write('\t\t<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0"')
    if (nodecolor !== '') {
      this._os.write(' BGCOLOR="' + nodecolor + '"')
    }
    this._os.write('>\n')
  }

  override printNodeName(name: string, _colspan: number): void {
    this._os.write('\t\t\t<TR><TD> ' + TfGetXmlEscapedString(name) +
      ' </TD></TR>\n')
  }

  override printNodeFooter(): void {
    this._os.write('\t\t</TABLE>>];\n')
  }
}

// This is the node printer when the draw style is set to draw a summary
// node (dotGrapher.cpp:244-260).
class _NodePrinterSummary extends _NodePrinter {
  // The summary printer just draws a little circle for each node.
  printNodeHeader(nodeid: string, nodecolor: string): void {
    this._os.write('\tnode [shape=circle, style=filled, ' +
      'label="", width=0.2, height=0.2')
    if (nodecolor !== '') {
      this._os.write(',color=' + nodecolor)
    }
    this._os.write(']; ' + nodeid + ';\n')
  }
}

//////////////////////////////////////////////////////////////////////////////
//
// class Vdf_DotGrapher
//

/** A grapher class that produces .dot files (dotGrapher.h:24-91). */
export class Vdf_DotGrapher {
  // Output streams to which any graphing operations go.
  private readonly _os: VdfOStream

  // Temporary structure to mark the visited nodes in a traversal.
  private readonly _visitedNodes: VdfNodePtrSet = new Set()

  // The options for this graph.
  private readonly _options: VdfGrapherOptions

  /**
   * Constructs a Vdf_DotGrapher object.  Output from this grapher will go
   * to the given output stream `os` (dotGrapher.cpp:267-273).
   */
  constructor(os: VdfOStream, options: VdfGrapherOptions) {
    this._os = os
    this._options = options
  }

  /** Produces the graph for the given `network` (dotGrapher.cpp:275-345). */
  graph(network: VdfNetwork): void {
    this._printHeader()

    const numNodes = network.getNodeCapacity()

    // Clear the list of nodes we've visited.
    this._visitedNodes.clear()

    // This is the vector of all nodes that we will graph.
    // Note that we use a vector instead of a set to keep track of the
    // printed nodes so that insertion is stable for diffing in test runs.
    const nodesToGraph: VdfNode[] = []

    // If the specific nodes to graph haven't been specified, graph everyone.
    if (this._options.getNodesToGraph().length === 0) {
      const filterCallback = this._options.getNodeFilterCallback()

      // Graph all nodes in the network.
      for (let i = 0; i < numNodes; ++i) {
        const node = network.getNode(i)

        if (!node) {
          continue
        }

        // Filter out the nodes that need filtering
        if (filterCallback && (!filterCallback(node))) {
          continue
        }

        nodesToGraph.push(node)

        this._visitedNodes.add(node)
      }
    } else {
      // Otherwise we want to graph a subset of the network.
      for (const iter of this._options.getNodesToGraph()) {
        // Use a separate visited set for each traversal so we don't
        // constrain a traversal based on previous traversals.
        const visitedThisTraversal: VdfNodePtrSet = new Set()
        this._getLimitedNodes(iter.node, iter.maxInDepth, iter.maxOutDepth,
          visitedThisTraversal, nodesToGraph)

        // Merge the visited nodes from this traversal into the global set.
        for (const node of visitedThisTraversal) {
          this._visitedNodes.add(node)
        }
      }
    }

    // Set of nodes that we should render using a summary style only.
    const usedStyle = new Map<VdfNode, DisplayStyle>()

    // Now print all the nodes that we've determined should be printed.
    for (const n of nodesToGraph) {
      usedStyle.set(n, this._printNode(n))
    }

    // Print the dependencies last. This is so that all the nodes referenced
    // have their attributes specified before we reference them in the
    // dependency chart.  This both makes dot faster and correct.
    for (const n of nodesToGraph) {
      // usedStyle[n] value-initializes a missing entry (DisplayStyleFull).
      this._printInputDependencies(n, usedStyle.get(n) ?? DisplayStyle.DisplayStyleFull)
    }

    this._printFooter()
  }

  // Prints the node's dependencies.  Printing of the dependencies must come
  // at the end of printing the node's attributes.  This is a limitation of
  // dot (dotGrapher.cpp:347-458).
  private _printInputDependencies(node: VdfNode, style: DisplayStyle): void {
    // Determine whether or not we should link to ports or not.  Only the
    // Full display style uses ports.
    const usePorts = style === DisplayStyle.DisplayStyleFull

    // Process input dependencies.
    for (const [inputName, input] of node.getInputsIterator()) {
      for (const connection of input.getConnections()) {
        // If this node has never been visited, we shouldn't include it.
        if (!this._visitedNodes.has(connection.getSourceNode())) {
          continue
        }

        const color = this._options.getColor(connection)

        if (this._options.getDrawColorizedConnectionsOnly() && color === '') {
          continue
        }

        this._os.write('\t\t' + this._dotId(connection.getSourceNode()))

        const numOutputs =
          connection.getSourceNode().getOutputSpecs().getSize()

        // If we have more than 1 output, draw links to them explicitly.
        if (usePorts && numOutputs > 1) {
          this._os.write(':' + _GetPortId(
            connection.getSourceOutput(), this._options.getUniqueIds()))
        }

        this._os.write(' -> ' + this._dotId(node))
        if (usePorts) {
          // Compass point is "n" for north.
          this._os.write(':' + _GetPortId(
            connection.getTargetInput(), this._options.getUniqueIds()) +
            ':n')
        }

        const attributes: string[] = []

        // Adding a weight on links called "pool" so that they will
        // tend towards a straight line.  "pool" is chosen because the
        // execution system uses that label for the point pool input which
        // has special meaning.
        //
        // XXX:codeCleanup
        // It would be nice not to hard code the word ".pool" for our
        // current specific usage in the execution system.
        if (inputName === '.pool') {
          attributes.push('weight = "100"')
        }

        let label = ''

        if (this._options.getDrawMasks()) {
          const mask = connection.GetMask()

          // If the number of bits is greater than 10 (arbitrary)
          // we will draw out the full mask, otherwise we will
          // display it in a compressed format.

          if (mask.getSize() === 0) {
            label += '(empty)'
          } else if (mask.getSize() <= 10) {
            label += mask.getBits().getAsStringLeftToRight()
          } else {
            label += mask.getRLEString()
          }
        }

        // Append any annotation?
        const annotation = this._options.getAnnotation(connection)
        if (annotation !== '') {
          if (label !== '') {
            label += ' '
          }
          label += '[' + annotation + ']'
        }

        //XXX: The ' ' before label should be removed, but it requires
        //     baseline upgrades.
        if (label !== '') {
          attributes.push(' label = "' + label + '"')
        }

        if (color !== '') {
          attributes.push('color = "' + color + '"')
        }

        if (attributes.length !== 0) {
          this._os.write('[ ')

          for (let i = 0; i < attributes.length; i++) {
            this._os.write(attributes[i]!)
            if (i + 1 < attributes.length) {
              this._os.write(', ')
            }
          }
          this._os.write('];')
        } else {
          this._os.write(';')
        }

        this._os.write('\n')
      }
    }
  }

  // Helper for _PrintNode (dotGrapher.cpp:460-496). `isInput` is the
  // std::is_same<PortType, VdfInput> dispatch.
  private _collectConnections<PortType extends VdfInput | VdfOutput>(
    port: PortType,
    connectionCollection: VdfConnectionVector,
    portCollection: PortType[]): void {
    const isInput = port instanceof VdfInput
    let include = !this._options.getOmitUnconnectedSpecs()
    if (!include) {
      for (const c of port.getConnections() as readonly VdfConnection[]) {
        if (this._options.getDrawColorizedConnectionsOnly() &&
          this._options.getColor(c) === '') {
          continue
        }

        // Note that we want to populate result, so we can't break.
        if (isInput) {
          if (this._visitedNodes.has(c.getSourceNode())) {
            connectionCollection.push(c)
            include = true
          }
        } else {
          if (this._visitedNodes.has(c.getTargetNode())) {
            connectionCollection.push(c)
            include = true
          }
        }
      }
    }

    if (include) {
      portCollection.push(port)
    }
  }

  // Prints a node (dotGrapher.cpp:498-554).
  private _printNode(node: VdfNode): DisplayStyle {
    const drawnIn: VdfConnectionVector = []
    const drawnOut: VdfConnectionVector = []

    // Filter inputs and outputs as needed.
    const inputs: VdfInput[] = []
    for (const [, i] of node.getInputsIterator()) {
      this._collectConnections(i, drawnIn, inputs)
    }

    const outputs: VdfOutput[] = []
    for (const [, i] of node.getOutputsIterator()) {
      this._collectConnections(i, drawnOut, outputs)
    }

    // Select the node printer to use based on the draw style in our options.
    let printer: _NodePrinter | null = null

    let style = this._options.getDisplayStyle()

    // Switch to summary style if needed.
    const nodeStyleCallback = this._options.getNodeStyleCallback()
    if (nodeStyleCallback) {
      style = nodeStyleCallback(node, drawnIn, drawnOut)
    }

    if (style === DisplayStyle.DisplayStyleSummary) {
      printer = new _NodePrinterSummary(this._os)
    } else if (style === DisplayStyle.DisplayStyleFull) {
      printer = new _NodePrinterFull(this._os)
    } else if (style === DisplayStyle.DisplayStyleNoLabels) {
      printer = new _NodePrinterNoLabels(this._os)
    }

    // Print the node header.
    printer!.printNodeHeader(this._dotId(node), this._options.getColor(node))

    // Compute max. # col.
    const numCol = Math.max(inputs.length, outputs.length)

    // Print input connectors
    if (inputs.length) {
      printer!.printInputs(inputs, this._options, numCol)
    }

    // Print node name, values, etc...
    printer!.printNodeName(node.getDebugName(), numCol)

    // Print output connectors.
    if (outputs.length) {
      printer!.printOutputs(outputs, this._dotId(node), this._options, numCol)
    }

    // Close off the table
    printer!.printNodeFooter()

    return style
  }

  // Populates `visitedThisTraversal` with the nodes that can be reached from
  // `node` within `maxInDepth` and `maxOutDepth`. Nodes not part of the
  // global set (_visitedNodes) are added to `nodesToGraph`
  // (dotGrapher.cpp:556-623).
  private _getLimitedNodes(
    node: VdfNode,
    maxInDepth: number,
    maxOutDepth: number,
    visitedThisTraversal: VdfNodePtrSet,
    nodesToGraph: VdfNode[]): void {
    TF_AXIOM(maxInDepth >= 0 && maxOutDepth >= 0)

    const filterCallback = this._options.getNodeFilterCallback()

    // Filter out the nodes that need filtering
    if (filterCallback && (!filterCallback(node))) {
      return
    }

    // If we've already visited this node in *this traversal*, don't do it again.
    if (visitedThisTraversal.has(node)) {
      return
    }
    visitedThisTraversal.add(node)

    // If the node hasn't been visited in *any traversal*, add it to the list.
    if (!this._visitedNodes.has(node)) {
      nodesToGraph.push(node)
    }

    // If we haven't exhausted our input limit, traverse our inputs.
    if (maxInDepth) {
      for (const [, inputConnector] of node.getInputsIterator()) {
        for (const iter of inputConnector.getConnections()) {
          // Print our inputs with one less depth level on its inputs
          // and none of its outputs.  Another possibly good choice
          // for outputDepth here is 1.
          this._getLimitedNodes(iter.getSourceNode(), maxInDepth - 1, 0,
            visitedThisTraversal, nodesToGraph)
        }
      }
    }

    // If we haven't exhausted our output limit, traverse our outputs.
    if (maxOutDepth) {
      // Iterate through the outputs.
      for (const [, output] of node.getOutputsIterator()) {
        const outputConnections = output.getConnections()

        for (const iter of outputConnections) {
          // Recurse through our outputs, this time with one less output
          // depth.
          // We use a depth of zero on the inputs of our outputs, because
          // we don't want any of their inputs drawn.  Another possibly
          // good option is 1.
          this._getLimitedNodes(
            iter.getTargetNode(), 0, maxOutDepth - 1,
            visitedThisTraversal, nodesToGraph)
        }
      }
    }
  }

  // Prints the header of the .dot file (dotGrapher.cpp:625-641).
  private _printHeader(): void {
    this._os.write('digraph network {\n')

    // Configure the page direction (Top-Bottom)
    this._os.write('\trankdir=TB;\n')

    // Configure the page dimensions
    const w = this._options.getPageWidth()
    const h = this._options.getPageHeight()

    if (w > 0.0 && h > 0.0) {
      this._os.write('\tpage="' + Vdf_StreamDouble(w) + ', ' +
        Vdf_StreamDouble(h) + '";\n')
    }

    this._os.write('\n')
  }

  // Prints the footer of the .dot file (dotGrapher.cpp:643-647).
  private _printFooter(): void {
    this._os.write('}\n')
  }

  // Produces a unique string for the given node (dotGrapher.cpp:649-656).
  private _dotId(node: VdfNode): string {
    if (this._options.getUniqueIds()) {
      return _FormatAddress(node)
    }
    return '"' + node.getDebugName() + '"'
  }
}
