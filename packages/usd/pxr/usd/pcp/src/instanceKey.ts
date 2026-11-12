// Ported from OpenUSD 26.11.1: pxr/usd/pcp/instanceKey.cpp,
//  pxr/usd/pcp/instanceKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpInstanceKey. Port of OpenUSD v26.08 pxr/usd/pcp/instanceKey.{h,cpp}:
// two instanceable prim indexes share a prototype iff they have the same
// instancing arcs and the same composed variant selections.

import { pcpComposeSiteVariantSelections } from './composeSite.ts'
import { PcpArcType } from './arc.ts'
import type { SdfLayerOffset } from 'typescript-usd/sdf/layerOffset'
import { pcpLayerStackIdentifierKey, type PcpLayerStackIdentifier } from './layerStackIdentifier.ts'
import { pcpTraverseInstanceableStrongToWeak } from './instancing.ts'
import type { PcpPrimIndex } from './primIndex.ts'

// PcpInstanceKey::_Arc (instanceKey.h).
interface InstanceArc {
  readonly arcType: PcpArcType
  readonly sourceIdentifier: PcpLayerStackIdentifier
  readonly sourcePath: string
  readonly timeOffset: SdfLayerOffset
}

const ARC_DISPLAY_NAMES: Record<PcpArcType, string> = {
  [PcpArcType.Root]: 'root',
  [PcpArcType.Inherit]: 'inherit',
  [PcpArcType.Variant]: 'variant',
  [PcpArcType.Relocate]: 'relocate',
  [PcpArcType.Reference]: 'reference',
  [PcpArcType.Payload]: 'payload',
  [PcpArcType.Specialize]: 'specialize',
}

export class PcpInstanceKey {
  private readonly _arcs: InstanceArc[] = []
  private readonly _variantSelection: [string, string][] = []
  private readonly _key: string | null = null

  // PcpInstanceKey(primIndex) (instanceKey.cpp:42-69).
  constructor(primIndex?: PcpPrimIndex) {
    if (!primIndex?.isValid() || !primIndex.isInstanceable()) return
    const indexHasPayload = primIndex.hasAnyPayloads()
    pcpTraverseInstanceableStrongToWeak(primIndex, {
      visit: (node, nodeIsInstanceable) => {
        if (nodeIsInstanceable) {
          this._arcs.push({
            arcType: node.getArcType(),
            sourceIdentifier: node.getLayerStack().identifier,
            sourcePath: node.getPath().pathString,
            timeOffset: node.getMapToRoot().evaluate().getTimeOffset(),
          })
          if (!indexHasPayload) return false
        }
        return true
      },
    })
    const variantSelection: Record<string, string> = {}
    for (const node of primIndex.getNodeRange()) {
      if (!node.canContributeSpecs()) continue
      const composed = pcpComposeSiteVariantSelections(node.getLayerStack(), node.getPath())
      for (const [set, sel] of Object.entries(composed)) {
        if (!(set in variantSelection)) variantSelection[set] = sel
      }
    }
    this._variantSelection = Object.entries(variantSelection)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    this._key = 'Arcs:' + this._arcs.map(arc =>
      `${arc.arcType}|${pcpLayerStackIdentifierKey(arc.sourceIdentifier)}|${arc.sourcePath}|` +
      `${arc.timeOffset.offset},${arc.timeOffset.scale}`).join(';') +
      '|Variants:' + this._variantSelection.map(([k, v]) => `${k}=${v}`).join(';')
  }

  /** @internal Canonical equality key; null for the empty key. */
  get _canonicalKey(): string | null { return this._key }

  equals(other: PcpInstanceKey): boolean { return this._key === other._key }

  // GetString (instanceKey.cpp:79-111).
  getString(): string {
    let s = 'Arcs:\n'
    if (this._arcs.length === 0) {
      s += '  (none)\n'
    } else {
      for (const arc of this._arcs) {
        const offset = arc.timeOffset
        const offsetText = offset.offset === 0 && offset.scale === 1
          ? '' : ` (offset: ${offset.offset.toFixed(6)} scale: ${offset.scale.toFixed(6)})`
        const name = (identifier: string): string => {
          const normalized = identifier.replaceAll('\\', '/')
          return normalized.slice(normalized.lastIndexOf('/') + 1)
        }
        const id = arc.sourceIdentifier
        let site = `@${name(id.rootLayer.filePath)}@`
        if (id.sessionLayer) site += `,@${name(id.sessionLayer.filePath)}@`
        s += `  ${ARC_DISPLAY_NAMES[arc.arcType]}${offsetText} : ${site}<${arc.sourcePath}>\n`
      }
    }
    s += 'Variant selections:\n'
    if (this._variantSelection.length === 0) return `${s}  (none)`
    return s + this._variantSelection.map(([k, v]) => `  ${k} = ${v}`).join('\n')
  }

  toString(): string { return this.getString() }

  hash(): number {
    if (this._key === null) return 0
    let value = 2166136261
    for (let i = 0; i < this._key.length; i++) {
      value ^= this._key.charCodeAt(i)
      value = Math.imul(value, 16777619)
    }
    return value >>> 0
  }
}

// The canonical instance key string for an instanceable prim index, or null.
export function pcpInstanceKey(primIndex: PcpPrimIndex): string | null {
  return new PcpInstanceKey(primIndex)._canonicalKey
}
