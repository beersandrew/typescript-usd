// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/listEditor.h,
//  pxr/usdImaging/usdviewq/appController.py, pxr/usdImaging/usdviewq/common.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { AssetPath, Layer, sdfNormalizeListOp, type Spec } from 'typescript-usd/sdf'
import type { Stage, PrimStackEntry, PropertyStackWithLayerOffsetEntry } from 'typescript-usd/usd'
import type { NodeRef } from 'typescript-usd/pcp'
import { isRelationship } from './property-view'
import { metadataValueText } from './metadata-inspection'
import { pyFloat, pyStr, shortStringForValue } from './python-format'

export interface LayerStackRow {
  identifier: string
  layer: string
  offset: string
  path: string
  value: string
  depth: number
  muted: boolean
  valueSource?: 'default' | 'samples'
}
export interface LayerStackPresentation {
  headers: [string, string, string, string]
  hidden: [boolean, boolean, boolean, boolean]
  rows: LayerStackRow[]
}
type LayerTree = NonNullable<ReturnType<ReturnType<NodeRef['getLayerStack']>['getLayerTree']>>
const offsetText = (offset: number, scale: number) => offset === 0 && scale === 1 ? '' : `${pyFloat(offset)} , ${pyFloat(scale)}`
const displayName = (identifier: string) => Layer.find(identifier)?.getDisplayName() ?? identifier.split('/').at(-1) ?? identifier

function metadataDisplayValue(value: unknown): unknown {
  if (value instanceof AssetPath) return pyStr(value,'asset')
  if (Array.isArray(value)) return value.map(metadataDisplayValue)
  if (value && typeof value==='object' && (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,metadataDisplayValue(item)]))
  return value
}

function metadataText(spec: Spec): string {
  const data: Record<string, string> = {}
  for (const key of spec.getMetaDataInfoKeys()) {
    if (!spec.hasInfo(key)) continue
    const value = spec.getInfo(key)
    const list = value && typeof value === 'object' && 'isExplicit' in value ? sdfNormalizeListOp(value) : null
    if (list) {
      const typeName=spec.getSchema().getFieldDefinition(key)?.getTypeName().replace(/listop$/i,'')
      const type=({int:'Int',int64:'Int64',uint:'UInt',uint64:'UInt64',token:'Token',string:'String'} as Record<string,string>)[typeName??'']??(key==='apiSchemas'?'Token':'String')
      const buckets = list.isExplicit ? [['Explicit', list.explicitItems] as const] : [
        ['Deleted', list.deletedItems], ['Added', list.addedItems], ['Prepended', list.prependedItems],
        ['Appended', list.appendedItems], ['Ordered', list.orderedItems],
      ] as const
      data[key] = `Sdf${type}ListOp(${buckets.filter(([,items]) => list.isExplicit || items.length).map(([name,items]) => `${name} Items: [${items.join(', ')}]`).join(', ')})`
    } else data[key] = metadataValueText(metadataDisplayValue(value), key)
  }
  return metadataValueText(data, '')
}

/** Native appController.py:4497-4650, common.py:378-511. Keep the raw
 * inspection stack independent from this table's display strings. */
export function inspectLayerStack(stage: Stage, path: string, propertyName?: string, time = 0, entries?: readonly (PrimStackEntry|PropertyStackWithLayerOffsetEntry)[]): LayerStackPresentation {
  const root = path === '/' && !propertyName
  const prim = stage.getPrim(path)
  const property = propertyName ? prim?.getAttr(propertyName) : undefined
  const relationship = !!prim && !!property && isRelationship(prim,property)
  const used = new Map(stage.getUsedLayers().map(layer => [layer.identifier, layer]))
  const rows: LayerStackRow[] = []
  if (root) {
    const tree = stage.getPrim('/')?.getPrimIndex().getRootNode().getLayerStack().getLayerTree()
    const visit = (tree: LayerTree, depth: number) => {
      const layer = tree.getLayer()
      if (!layer) return
      const offset = tree.getOffset()
      rows.push({identifier:layer.filePath,layer:'    '.repeat(depth)+displayName(layer.filePath),offset:offsetText(offset.offset,offset.scale),path:'',value:'',depth,muted:false})
      const children = tree.getChildTrees()
      let childIndex = 0
      const paths = layer.getField('/', 'subLayers') as string[] | undefined
      for (const subPath of paths ?? []) {
        const identifier = layer.resolveAsset(subPath)
        if (stage.isLayerMuted(identifier)) {
          rows.push({identifier,layer:'    '.repeat(depth+1)+displayName(identifier),offset:'',path:'',value:'',depth:depth+1,muted:true})
        } else if (children[childIndex]?.getLayer()?.filePath === identifier) visit(children[childIndex++]!, depth+1)
      }
    }
    if (tree) visit(tree, 0)
  } else {
    const stack = entries ?? (property ? stage.getPropertyStackWithLayerOffsets(`${path}.${propertyName}`, time) : stage.getPrimStack(path))
    for (const entry of stack) {
      const layer = used.get(entry.layerIdentifier) ?? Layer.find(entry.layerIdentifier)
      const spec = layer?.getObjectAtPath(entry.specPath)
      if (!spec) throw new Error('Layer stack spec expired; refresh inspection to read the current stage.')
      let value = ''
      let valueSource: LayerStackRow['valueSource']
      if (property) {
        valueSource = 'default'
        if (relationship) {
          const list = sdfNormalizeListOp<string>(layer?.getField(entry.specPath, 'targetPaths'))
          // sdf/listEditor.h:288-331, via pyListEditorProxy.h:184-187.
          // Preserve native non-explicit proxy punctuation and bucket order.
          const paths = (items:readonly string[]) => `[${items.join(', ')}]`
          value = !list ? "{ 'added': []'prepended': []'appended': [], 'deleted': [], 'ordered': [] }"
            : list.isExplicit ? paths(list.explicitItems)
            : `{ 'added': ${paths(list.addedItems)}'prepended': ${paths(list.prependedItems)}'appended': ${paths(list.appendedItems)}, 'deleted': ${paths(list.deletedItems)}, 'ordered': ${paths(list.orderedItems)} }`
        } else {
          const samples = 'timeSamples' in entry ? entry.timeSamples : undefined
          if (samples?.length) { value = `${samples.length} time sample${samples.length === 1 ? '' : 's'}`; valueSource = 'samples' }
          else value = shortStringForValue('value' in entry ? entry.value : undefined, String(layer?.getField(entry.specPath,'typeName')??property.typeName))
        }
      } else if (spec) value = metadataText(spec)
      rows.push({identifier:entry.layerIdentifier,layer:layer?.getDisplayName() ?? displayName(entry.layerIdentifier),offset:offsetText(entry.offset.offset,entry.offset.scale),path:entry.specPath,value,depth:0,muted:false,...(valueSource?{valueSource}:{})})
    }
  }
  return {headers:['Layer','Offset , Scale','Path',root?'Value':property?relationship?'Target Paths':'Value':'Metadata'],hidden:[false,!root&&!rows.some(row=>row.offset!==''),root,root],rows}
}
