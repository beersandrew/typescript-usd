// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpCompositionResults.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpCompositionResults.py.

import path from 'node:path'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Spec as SdfSpec } from 'typescript-usd/sdf'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  ArcType as PcpArcType,
  Cache as PcpCache,
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  PrimIndex as PcpPrimIndex,
  pcpBuildPrimPropertyIndex,
} from '../../src/index.ts'

export interface CompositionResultsOptions {
  layerPath: string
  rootLayer?: PcpLayer
  layerLabel?: string
  sessionPath?: string
  sessionLabel?: string
  payloads?: RegExp
  variantFallbacks?: Record<string, readonly string[]>
  dumpPath?: string
  dumpMaps?: boolean
  errorFile?: boolean
  consistencyChecks?: boolean
  overrideInstanceable?: boolean
}

export interface CompositionResults {
  stdout: string
  stderr: string
  errorFile: string
  hadError: boolean
}

const RULE = '-'.repeat(72)
const ARC_NAMES: Record<PcpArcType, string> = {
  [PcpArcType.Root]: 'root',
  [PcpArcType.Inherit]: 'inherit',
  [PcpArcType.Variant]: 'variant',
  [PcpArcType.Relocate]: 'relocate',
  [PcpArcType.Reference]: 'reference',
  [PcpArcType.Payload]: 'payload',
  [PcpArcType.Specialize]: 'specialize',
}

function pythonList(values: readonly string[]): string {
  return `[${values.map(value => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`).join(', ')}]`
}

function appendLine(lines: string[], line = ''): void {
  lines.push(`${line}\n`)
}

function specLine(layer: string, specPath: string): string {
  return `    ${layer.padEnd(20)} ${specPath}`
}

function propertyPath(primPath: string, propertyName: string): string {
  return primPath === '/' ? `.${propertyName}` : `${primPath}.${propertyName}`
}

function realOpener(rootLayer?: PcpLayer): PcpLayerOpener {
  const layers = new Map<string, PcpLayer>()
  if (rootLayer) layers.set(rootLayer.filePath, rootLayer)
  return async (filePath: string) => {
    const retained = layers.get(filePath)
    if (retained) return retained
    try {
      const layer = (await Layer.open(filePath))!
      layers.set(filePath, layer)
      return layer
    } catch {
      return null
    }
  }
}

function nodeVariantSelections(index: PcpPrimIndex): Map<string, string> {
  const selections = new Map<string, string>()
  for (const node of index.getNodeRange()) {
    if (!node.path.isPrimVariantSelectionPath()) continue
    const [setName, selection] = node.path.getVariantSelection()
    if (!selections.has(setName)) selections.set(setName, selection)
  }
  return selections
}

function cleanTestRunPaths(message: string, workingDirectory: string): string {
  const normalized = message.replaceAll('\\', '/')
  const prefix = `${workingDirectory.replaceAll('\\', '/').replace(/\/$/, '')}/`
  return normalized.replaceAll(prefix, '')
}

/**
 * Runs the observable portion of testPcpCompositionResults.py in USD mode.
 * The caller supplies the same command-line choices carried by the upstream
 * CMake registration; returned strings correspond to stdout, stderr, and an
 * optional --errorFile destination.
 */
export async function testPcpCompositionResults(
  options: CompositionResultsOptions,
): Promise<CompositionResults> {
  // OpenUSD v26.08 pcp/CMakeLists.txt sets PCP_ENABLE_CONSISTENCY_CHECKS=1
  // library-wide. PcpPrimIndex construction in this port maintains those
  // invariants eagerly; the option records that registered execution mode.
  if (options.consistencyChecks === false) {
    throw new Error('testPcpCompositionResults requires consistency checks')
  }
  // PCP_OVERRIDE_INSTANCEABLE=1 differs from the default only for non-USD
  // caches (OpenUSD v26.08 pcp/instancing.cpp:43-57). This driver is always
  // in --usd mode, so the registered override is faithfully a semantic no-op.
  const stdout: string[] = []
  const stderr: string[] = []
  const errorOutput: string[] = []
  let hadError = false
  const layerDirectory = path.dirname(options.layerPath)
  const layerLabel = options.layerLabel ?? path.basename(options.layerPath)
  const normalizedLayerPath = options.layerPath.replaceAll('\\', '/')
  const normalizedLayerLabel = layerLabel.replaceAll('\\', '/')
  const testRunDirectory = normalizedLayerPath.endsWith(normalizedLayerLabel)
    ? normalizedLayerPath.slice(0, -normalizedLayerLabel.length).replace(/\/$/, '')
    : layerDirectory

  if (options.sessionPath) {
    appendLine(stdout, `Loading session @${options.sessionLabel ?? path.basename(options.sessionPath)}@`)
    appendLine(stdout)
  }
  appendLine(stdout, `Loading @${layerLabel}@`)
  appendLine(stdout)

  const opener = realOpener(options.rootLayer)
  const rootLayer = await opener(options.layerPath)
  if (!rootLayer) throw new Error(`Could not open root layer ${options.layerPath}`)
  const sessionLayer = options.sessionPath
    ? await opener(options.sessionPath)
    : undefined
  if (options.sessionPath && !sessionLayer) {
    throw new Error(`Could not open session layer ${options.sessionPath}`)
  }

  const payloads = options.payloads ?? /.*/
  const cache = await PcpCache.create(
    rootLayer, opener, sessionLayer ?? undefined, primPath => payloads.test(primPath),
  )
  cache.setVariantFallbacks(
    options.variantFallbacks ?? { standin: ['render'] },
  )
  const layerStack = cache.getLayerStack()
  const getLayerLabel = (layer: PcpLayer): string => {
    const normalizedDirectory =
      layerDirectory.replaceAll('\\', '/').replace(/\/$/, '')
    const normalizedPath = layer.filePath.replaceAll('\\', '/')
    return normalizedPath.startsWith(`${normalizedDirectory}/`)
      ? normalizedPath.slice(normalizedDirectory.length + 1)
      : path.basename(normalizedPath)
  }
  const printErrors = (heading: string, errors: readonly { message: string }[]): void => {
    if (errors.length === 0) return
    hadError = true
    const destination = options.errorFile ? errorOutput : stderr
    appendLine(destination, RULE)
    appendLine(destination, heading)
    appendLine(destination)
    for (const error of errors) {
      appendLine(destination, cleanTestRunPaths(error.message, testRunDirectory))
    }
    appendLine(destination)
  }

  appendLine(stdout, RULE)
  appendLine(stdout, 'Layer Stack:')
  for (const { layer } of layerStack.layers) {
    appendLine(stdout, `     ${getLayerLabel(layer)}`)
  }
  appendLine(stdout)
  printErrors('Errors while computing Layer Stack', layerStack.localErrors)

  const dumpPath = options.dumpPath ?? ''
  let prims: string[]
  if (dumpPath) {
    cache.requestPayloads(
      dumpPath.split('/').filter(Boolean).map(
        (_, index, parts) => `/${parts.slice(0, index + 1).join('/')}`,
      ),
      [],
    )
    prims = [dumpPath]
  } else {
    const pseudoRoot = await cache.computePrimIndex('/')
    prims = pseudoRoot.computePrimChildNames().map(name => `/${name}`)
  }

  while (prims.length > 0) {
    const primPath = prims.shift()!
    if (payloads.test(primPath)) cache.requestPayloads([primPath], [])
    const primIndex = await cache.computePrimIndex(primPath)

    appendLine(stdout, RULE)
    appendLine(stdout, `Results for composing <${primPath}>`)

    if (primPath === dumpPath) {
      // testPcpCompositionResults.py passes --dumpMaps as the first wrapped
      // DumpToString argument (includeInheritOriginInfo); includeMaps keeps its
      // upstream default of true.
      // print() appends a newline.
      stdout.push(cleanTestRunPaths(
        `${primIndex.dumpToString(options.dumpMaps ?? false)}\n`, testRunDirectory))
    }

    const selections = nodeVariantSelections(primIndex)
    const nodes = [...primIndex.getNodeRange()]
    const nodesHaveOffsets = nodes.some(node =>
      node.mapToParent.evaluate().getTimeOffset().offset !== 0 ||
      node.mapToParent.evaluate().getTimeOffset().scale !== 1 ||
      node.layerStack.layers.some(({ offset }) =>
        offset.offset !== 0 || offset.scale !== 1))
    const prohibited = new Set<string>()
    const childNames = primIndex.computePrimChildNames(prohibited)
    const propertyNames = primIndex.computePrimPropertyNames()
    prims.unshift(...childNames.map(name => `${primPath}/${name}`))

    appendLine(stdout)
    appendLine(stdout, 'Prim Stack:')
    for (const spec of primIndex.composePrimStack()) {
      appendLine(stdout, specLine(getLayerLabel(spec.layer), spec.path.pathString))
    }

    if (nodesHaveOffsets) {
      appendLine(stdout)
      appendLine(stdout, 'Time Offsets:')
      for (const node of nodes) {
        const offset = node.mapToRoot.evaluate().getTimeOffset()
        appendLine(
          stdout,
          `    ${getLayerLabel(node.layerStack.layers[0]!.layer).padEnd(20)} ` +
          `${node.path.pathString.padEnd(15)} ${ARC_NAMES[node.arcType].padEnd(10)} ` +
          `(offset=${offset.offset.toFixed(2)}, scale=${offset.scale.toFixed(2)})`,
        )
        for (const { layer, offset: sublayerOffset } of node.layerStack.layers) {
          if (sublayerOffset.offset === 0 && sublayerOffset.scale === 1) continue
          appendLine(
            stdout,
            `        ${getLayerLabel(layer).padEnd(32)} ${'sublayer'.padEnd(10)} ` +
            `(offset=${sublayerOffset.offset.toFixed(2)}, ` +
            `scale=${sublayerOffset.scale.toFixed(2)})`,
          )
        }
      }
    }

    if (selections.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Variant Selections:')
      for (const setName of [...selections.keys()].sort()) {
        appendLine(stdout, `    {${setName} = ${selections.get(setName)}}`)
      }
    }
    if (childNames.length > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Child names:')
      appendLine(stdout, `     ${pythonList(childNames)}`)
    }
    if (prohibited.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Prohibited child names:')
      appendLine(stdout, `     ${pythonList([...prohibited].sort())}`)
    }
    const errors: { message: string }[] = [...primIndex.localErrors]
    const propStackMap = new Map<string, readonly SdfSpec[]>()
    const targetsMap = new Map<string, readonly SdfPath[]>()
    const connectionsMap = new Map<string, readonly SdfPath[]>()
    const deletedTargetPathsMap = new Map<string, readonly SdfPath[]>()
    for (const propertyName of propertyNames) {
      const propPath = SdfPath.fromString(propertyPath(primPath, propertyName))
      // In USD mode, property indexes are not cached so we build it here.
      const [propIndex, propIndexErrors] =
        pcpBuildPrimPropertyIndex(propPath, cache, primIndex)
      errors.push(...propIndexErrors)
      if (propIndex.propertyStack.length === 0) continue
      propStackMap.set(propPath.pathString, propIndex.propertyStack)
      const specType = propIndex.propertyStack[0]!.getSpecType()
      if (specType === 'relationship') {
        const { paths: targets, deletedPaths, errors: targetErrors } =
          await cache.computeRelationshipTargetPaths(propPath)
        errors.push(...targetErrors)
        if (targets.length > 0) targetsMap.set(propPath.pathString, targets)
        if (deletedPaths.length > 0) deletedTargetPathsMap.set(propPath.pathString, deletedPaths)
      } else if (specType === 'attribute') {
        const { paths: conns, deletedPaths, errors: connErrors } =
          await cache.computeAttributeConnectionPaths(propPath)
        errors.push(...connErrors)
        if (conns.length > 0) connectionsMap.set(propPath.pathString, conns)
        if (deletedPaths.length > 0) deletedTargetPathsMap.set(propPath.pathString, deletedPaths)
      }
    }

    if (propertyNames.length > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Property names:')
      appendLine(stdout, `     ${pythonList(propertyNames)}`)
    }

    if (propStackMap.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Property stacks:')
      for (const propPath of [...propStackMap.keys()].sort()) {
        appendLine(stdout, `${propPath}:`)
        for (const propSpec of propStackMap.get(propPath)!) {
          appendLine(stdout, specLine(getLayerLabel(propSpec.getLayer()), propSpec.getPath().pathString))
        }
      }
    }

    const printTargets = (targetMap: ReadonlyMap<string, readonly SdfPath[]>): void => {
      for (const propPath of [...targetMap.keys()].sort()) {
        appendLine(stdout, `${propPath}:`)
        for (const targetPath of targetMap.get(propPath)!) {
          appendLine(stdout, `    ${targetPath.pathString}`)
          // Target paths should never include variant selections.
          if (targetPath.containsPrimVariantSelection()) {
            throw new Error(`Target path ${targetPath.pathString} has variant selections`)
          }
        }
      }
    }
    if (targetsMap.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Relationship targets:')
      printTargets(targetsMap)
    }
    if (connectionsMap.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Attribute connections:')
      printTargets(connectionsMap)
    }
    if (deletedTargetPathsMap.size > 0) {
      appendLine(stdout)
      appendLine(stdout, 'Deleted target paths:')
      printTargets(deletedTargetPathsMap)
    }

    printErrors(
      `Errors while composing <${primPath}>`,
      errors,
    )
    appendLine(stdout)
    if (primPath === dumpPath) break
  }

  if (hadError && !options.errorFile) {
    appendLine(stderr, 'ERROR: Unexpected error(s) encountered during test!')
  }
  return {
    stdout: stdout.join(''),
    stderr: stderr.join(''),
    errorFile: errorOutput.join(''),
    hadError,
  }
}
