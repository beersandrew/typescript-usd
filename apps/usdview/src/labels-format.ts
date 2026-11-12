// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/scalarTypes.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native usdview common.py:289-317 uses str(dict); scalarTypes.py:110
// uses pprint.pformat(dict). This subset formats taxonomy -> list[str].
import {pyStringRepr} from './python-format'
type Labels = readonly (readonly [string, readonly string[]])[]
const length=(text:string)=>Array.from(text).length
const listRepr=(values:readonly string[])=>'['+values.map(pyStringRepr).join(', ')+']'
function formatString(value:string,indent:number,allowance:number):string {
 const repr=pyStringRepr(value),width=80-indent
 if(length(repr)<=width-allowance)return repr
 const lines=value.match(/[^\n]*\n|[^\n]+$/gu)??[''],chunks:string[]=[]
 for(const [i,line] of lines.entries()){
  const lastLine=i===lines.length-1,lineRepr=pyStringRepr(line)
  if(length(lineRepr)<=width-(lastLine?allowance:0)){chunks.push(lineRepr);continue}
  const parts=line.match(/\S*\s*/gu)?.filter(Boolean)??[];let current=''
  for(const [j,part] of parts.entries()){
   const candidate=current+part,max=width-(lastLine&&j===parts.length-1?allowance:0)
   if(length(pyStringRepr(candidate))>max){if(current)chunks.push(pyStringRepr(current));current=part}
   else current=candidate
  }
  if(current)chunks.push(pyStringRepr(current))
 }
 return chunks.length<=1?repr:chunks.join('\n'+' '.repeat(indent))
}
function formatList(values:readonly string[],indent:number,allowance:number):string {
 const flat=listRepr(values)
 if(length(flat)<=80-indent-allowance)return flat
 const inner=indent+1
 return '['+values.map((value,i)=>formatString(value,inner,i===values.length-1?allowance+1:1)).join(',\n'+' '.repeat(inner))+']'
}
export function formatLabels(entries:Labels):{short:string,text:string} {
 const flat='{'+entries.map(([name,labels])=>pyStringRepr(name)+': '+listRepr(labels)).join(', ')+'}'
 const text=length(flat)<=80?flat:'{'+entries.map(([name,labels])=>{
  const key=pyStringRepr(name)
  return key+': '+formatList(labels,1+length(key)+2,1)
 }).join(',\n ')+'}'
 return {short:Array.from(flat).slice(0,500).join(''),text}
}
