// Ported from OpenUSD 26.11.1: pxr/exec/vdf/grapher.cpp,
//  pxr/exec/vdf/grapher.h, pxr/base/arch/fileSystem.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/grapher.h and grapher.cpp.
//
// VdfGrapher produces printable graphs of Vdf networks (grapher.h:24-108).
// The simplest way to use it is the static API:
//
//     VdfGrapher.GraphToFile(network, 'filename.dot')
//
// Mapping choices:
// - std::ofstream (grapher.cpp:43): the file is written synchronously with
//   node:fs (process.getBuiltinModule), the host's file system. Where there
//   is none (a browser), GraphToFile posts a runtime error and writes
//   nothing; upstream's ofstream would fail to open silently, and a dropped
//   graph must not pass silently here.
// - GraphToTemporaryFile: ArchMakeTmpFileName (arch/fileSystem.cpp:686-705)
//   and ArchGetProgramNameForErrors are not in typescript-usd/arch; their
//   naming scheme ("<tmpdir>/<prefix>.<pid>[.<n>]<suffix>") is inlined
//   below, with node:os's tmpdir and the process title. std::cerr is
//   console.error.

import { TF_RUNTIME_ERROR } from 'typescript-usd/tf'

import { Vdf_DotGrapher } from './dotGrapher.ts'
import { VdfGrapherOptions } from './grapherOptions.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfNode } from './node.ts'

interface _NodeFs {
  writeFileSync(path: string, data: string): void
}

interface _NodeOs {
  tmpdir(): string
}

interface _Process {
  pid?: number
  argv?: string[]
  getBuiltinModule?: (id: string) => unknown
}

function _Process(): _Process | undefined {
  return (globalThis as { process?: _Process }).process
}

function _BuiltinModule<T>(id: string): T | undefined {
  const getBuiltinModule = _Process()?.getBuiltinModule
  return typeof getBuiltinModule === 'function' ?
    getBuiltinModule(id) as T | undefined : undefined
}

// ArchMakeTmpFileName(prefix, suffix) (arch/fileSystem.cpp:686-705).
let _nCalls = 1
function _ArchMakeTmpFileName(prefix: string, suffix = ''): string {
  const tmpDir = _BuiltinModule<_NodeOs>('node:os')?.tmpdir() ?? '/tmp'
  const n = _nCalls++
  const pid = _Process()?.pid ?? 0
  if (n === 1) {
    return `${tmpDir}/${prefix}.${pid}${suffix}`
  }
  return `${tmpDir}/${prefix}.${pid}.${n}${suffix}`
}

// ArchGetProgramNameForErrors (arch/errno.h): the program's base name.
function _ArchGetProgramNameForErrors(): string {
  const argv1 = _Process()?.argv?.[1] ?? ''
  return argv1.split('/').pop() || 'typescript-usd'
}

export class VdfGrapher {
  /**
   * Produces a graph of the given `network` and writes it to `filename`,
   * using `options` to configure the output, or the default grapher options
   * (grapher.cpp:38-54).
   */
  static graphToFile(
    network: VdfNetwork,
    filename: string,
    options: VdfGrapherOptions = new VdfGrapherOptions()): void {
    const chunks: string[] = []
    const grapher = new Vdf_DotGrapher({ write: (s: string) => chunks.push(s) }, options)
    grapher.graph(network)

    const fs = _BuiltinModule<_NodeFs>('node:fs')
    if (!fs) {
      TF_RUNTIME_ERROR(
        `VdfGrapher::GraphToFile (pxr/exec/vdf/grapher.cpp:43): cannot open ` +
        `'${filename}' for writing: no file system in this host`)
      return
    }
    try {
      fs.writeFileSync(filename, chunks.join(''))
    } catch (error) {
      TF_RUNTIME_ERROR(
        `VdfGrapher::GraphToFile (pxr/exec/vdf/grapher.cpp:43): cannot write ` +
        `'${filename}': ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Produces a graph of the given `network` and writes it to a temporary
   * file, using `options` to configure the output (grapher.cpp:56-75).
   */
  static graphToTemporaryFile(network: VdfNetwork, options: VdfGrapherOptions): void {
    // Generate a temporary file name
    const dotFile =
      _ArchMakeTmpFileName(`vdfgraph_${_ArchGetProgramNameForErrors()}`) +
      '.dot'

    VdfGrapher.graphToFile(network, dotFile, options)

    console.error(
      'The graph can be found in ' + dotFile + '\n' +
      'The graph can be viewed by running the following command: ' + '\n' +
      VdfGrapher.getDotCommand(dotFile))
  }

  /** Produces a graph in the neighborhood of `node` (grapher.cpp:77-104). */
  static graphNodeNeighborhood(
    node: VdfNode,
    maxInDepth: number,
    maxOutDepth: number,
    exclude: readonly string[] = []): void {
    // Graph
    const opts = new VdfGrapherOptions()
    opts.setDrawMasks(true)
    opts.setPageSize(1000, 1000)
    opts.setDrawAffectsMasks(true)
    opts.addNodeToGraph(node, maxInDepth, maxOutDepth)
    opts.setNodeFilterCallback(
      (n: VdfNode) => VdfGrapherOptions.debugNameFilter(exclude, false, n))

    VdfGrapher.graphToTemporaryFile(node.getNetwork(), opts)

    // Print out a message saying that the graph was generated.
    console.error(
      '--------------------------------------------------------------' + '\n' +
      'A graph was generated for the neighborhood around node: ' + '\n' +
      node.getDebugName())
  }

  /**
   * Returns the list of all registered nodes in the given `network` with
   * the given `name` (grapher.cpp:107-119).
   */
  static getNodesNamed(network: VdfNetwork, name: string): VdfNode[] {
    const result: VdfNode[] = []
    for (let i = 0; i < network.getNodeCapacity(); ++i) {
      const node = network.getNode(i)
      if (node) {
        if (node.getDebugName() === name) {
          result.push(node)
        }
      }
    }
    return result
  }

  /**
   * Returns a string that represents a shell command that will view the
   * file `dotFileName` (grapher.cpp:121-125).
   */
  static getDotCommand(dotFileName: string): string {
    return 'xdot ' + dotFileName
  }
}
