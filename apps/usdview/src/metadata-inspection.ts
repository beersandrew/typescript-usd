// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {pyFloat,pyStr,pyStringRepr} from './python-format'
import type { Stage } from 'typescript-usd/usd'

export interface MetadataRow {
  name: string
  value: unknown
  /** Field-level provenance; dictionaries can combine authored and fallback keys. */
  source: 'authored' | 'fallback' | 'derived'
}
export interface MetadataInspection { rows: MetadataRow[]; limitations: string[] }

/** Read-only counterpart of OpenUSD v26.11.1 usdviewq/appController.py:4284-4421.
 * Native enumeration excludes composition keys, which the application requests
 * explicitly. All values and fallback semantics come from public USD APIs.
 */
export function inspectMetadata(stage: Stage, path: string, propertyName?: string): MetadataInspection | null {
  const prim = stage.getPrim(path)
  if (!prim) return null
  const property = propertyName ? prim.getAttr(propertyName) : undefined
  if (propertyName && !prim.getPropertyNames().includes(propertyName)) return null
  const object = property ?? prim
  const values = {...object.getAllMetadata()}
  for (const key of ['references','specializes','payload','subLayers','clips']) {
    const value = object.getMetadata(key)
    if (value !== undefined && value !== null) values[key] = value
  }
  const rows: MetadataRow[] = [
    {name:'[object type]',value:property ? property.isRelationship ? 'Relationship' : 'Attribute' : 'Prim',source:'derived'},
    ...(!property ? [{name:'[applied API schemas]',value:prim.getAppliedSchemas(),source:'derived' as const}] : []),
    {name:'[path]',value:property ? `${path}.${propertyName}` : path,source:'derived'},
  ]
  if (!property) {
    const inherited = prim.getInherits().getAllDirectInherits()
    if (inherited.length) values.inherits = inherited
    const sets = stage.getVariantSets(path), selections = sets.getAllVariantSelections()
    for (const name of Object.keys(selections).sort()) rows.push({name:`${name} variant${sets.hasVariantSet(name) ? '' : ' (no defined set)'}`,value:selections[name],source:'derived'})
  }
  const first = ['active','assetInfo','kind']
  const names = Object.keys(values).sort((a,b) => {
    const ai=first.indexOf(a),bi=first.indexOf(b)
    return ai>=0 || bi>=0 ? (ai<0?first.length:ai)-(bi<0?first.length:bi) : a.localeCompare(b)
  })
  for (const name of names) rows.push({name,value:values[name],source:name==='inherits'?'derived':object.hasAuthoredMetadata(name)?'authored':'fallback'})
  return {rows,limitations:[]}
}

/** appController.py:4211-4263 _formatMetadataValueView: compact Python text,
 * dictionary quotes removed and at most300 display characters. Keep this
 * separate from JSON inspection/export data and property Value formatting. */
export function metadataValueText(value:unknown, name:string):string {
 const floatingFields=new Set(['metersPerUnit','startTimeCode','endTimeCode','timeCodesPerSecond','framesPerSecond'])
 const repr=(item:unknown, nested=false):string=>{
  if(item==null)return 'None'
  if(typeof item==='string')return nested?pyStringRepr(item):item
  if(typeof item==='boolean')return item?'True':'False'
  if(typeof item==='number')return floatingFields.has(name)&&!nested||!Number.isInteger(item)?pyFloat(item):String(item)
  if(Array.isArray(item))return '['+item.map(v=>repr(v,true)).join(', ')+']'
  if(typeof item==='object'){
   if(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null)
    return '{'+Object.entries(item).map(([key,v])=>`${pyStringRepr(key)}: ${repr(v,true)}`).join(', ')+'}'
   return pyStr(item,'')
  }
  return String(item)
 }
 let text=repr(value)
 if(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))text=text.replace(/['"]/g,'')
 // Native _cleanStr replaces newlines/whitespace and collapses repeated words.
 return text.split(/\s+/).filter((word,i,words)=>i===0||word!==words[i-1]).join(' ').trim().slice(0,300)
}
