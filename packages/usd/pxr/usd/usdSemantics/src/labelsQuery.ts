// Ported from OpenUSD 26.11.1: pxr/usd/usdSemantics/labelsQuery.cpp,
//  pxr/usd/usdSemantics/labelsQuery.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 usdSemantics/labelsQuery.cpp:17-267.
import { Interval } from 'typescript-usd/gf'
import { TimeCode, type Prim } from 'typescript-usd/usd'
import { Array as VtArray, ValueTypes } from 'typescript-usd/vt'
import { RaiseWarning } from 'typescript-usd/tf'
import { LabelsAPI, _ancestors, _sortTokens } from './labelsAPI.ts'

type QueryTime = number | TimeCode | Interval
const tokenArray=(values:Iterable<string>)=>new VtArray(_sortTokens(values),ValueTypes.token)
export class UsdSemanticsLabelsQuery {
  private readonly _time: TimeCode | Interval
  // Native queries retain a snapshot per populated prim path; create a new query
  // after stage edits (labelsQuery.h:26-35), rather than silently invalidating it.
  private readonly _cachedLabels = new Map<string,Set<string>>()
  constructor(private readonly _taxonomy:string,time:QueryTime) {
    if(!this._taxonomy)throw new Error('UsdSemanticsLabelsQuery created with empty taxonomy.')
    if(time instanceof Interval) {
      if(time.IsEmpty())throw new Error('UsdSemanticsLabelsQuery created with empty interval.')
      this._time=time.clone()
    } else this._time=time instanceof TimeCode ? new TimeCode(time,time.isPreTime()) : new TimeCode(time)
  }
  getTime(): TimeCode | Interval { return this._time instanceof Interval ? this._time.clone() : new TimeCode(this._time,this._time.isPreTime()) }
  getTaxonomy(): string { return this._taxonomy }
  private _populateLabels(prim:Prim):boolean {
    if(prim.path==='/'||!prim.hasAPI('SemanticsLabelsAPI',this._taxonomy))return false
    if(this._cachedLabels.has(prim.path))return true
    const attr=LabelsAPI.get(prim,this._taxonomy).getLabelsAttr()
    const labels=new Set<string>()
    if(attr) {
      const read=(time:TimeCode|number):boolean=>{
        const value=attr.getValueAtTime(time)
        if(attr.typeName!=='token[]' || !(value instanceof VtArray) || [...value].some(v=>typeof v!=='string')) {
          RaiseWarning(`Failed to read tokens from ${attr.getPath()}`);return false
        }
        for(const label of value as VtArray<string>)labels.add(label)
        return true
      }
      if(this._time instanceof Interval) {
        const times=attr.getTimeSamplesInInterval(this._time)
        const earliest=this._time.isMinFinite()?this._time.getMin():TimeCode.EarliestTime().GetValue()
        if(!times.length||times[0]!==earliest)times.push(earliest)
        for(const time of times)if(!read(time)){labels.clear();break}
      } else read(this._time)
    } else RaiseWarning(`Labels attribute undefined at ${prim.path}`)
    this._cachedLabels.set(prim.path,labels)
    return true
  }
  private _populateInherited(prim:Prim):boolean {
    let found=false
    for(const ancestor of _ancestors(prim))if(this._populateLabels(ancestor))found=true
    return found
  }
  computeUniqueDirectLabels(prim:Prim):VtArray<string> {
    return tokenArray(this._populateLabels(prim)?this._cachedLabels.get(prim.path)!:[])
  }
  computeUniqueInheritedLabels(prim:Prim):VtArray<string> {
    const labels=new Set<string>()
    if(this._populateInherited(prim))for(const ancestor of _ancestors(prim))for(const label of this._cachedLabels.get(ancestor.path)??[])labels.add(label)
    return tokenArray(labels)
  }
  hasDirectLabel(prim:Prim,label:string):boolean {
    return this._populateLabels(prim)&&(this._cachedLabels.get(prim.path)?.has(label)??false)
  }
  hasInheritedLabel(prim:Prim,label:string):boolean {
    if(!this._populateInherited(prim))return false
    return [..._ancestors(prim)].some(ancestor=>this._cachedLabels.get(ancestor.path)?.has(label))
  }
}
