// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/triRefinement.h,
//  opensubdiv/vtr/triRefinement.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenSubdiv v3.7.0 opensubdiv/vtr/triRefinement.cpp:26-810.
// DIVERGENCE from upstream: uniform-only, as in the shared Refinement driver.
// Relation arrays are accumulated then packed instead of resize/trim writes;
// the native component numbering and incident ordering are retained.
import { Refinement } from './refinement.ts'
import type { Level } from './level.ts'
import type { Options } from '../sdc/options.ts'
import { Split } from '../sdc/types.ts'
type Pair=[number,number]
function pack(rows:Pair[][]){const co=new Int32Array(rows.length*2),values:number[]=[],local:number[]=[];rows.forEach((row,i)=>{co[i*2]=row.length;co[i*2+1]=values.length;for(const [v,l] of row){values.push(v);local.push(l)}});return {co,values:new Int32Array(values),local:new Int32Array(local)}}
export class TriRefinement extends Refinement {
  constructor(parent:Level,child:Level,options:Options){super(parent,child,options);this._splitType=Split.TO_TRIS;this._regFaceSize=3}
  override getFaceChildFaces(face:number):Int32Array{return this._faceChildFaceIndices.subarray(face*4,face*4+4)}
  override getFaceChildVertex(_face:number):number{return -1}
  allocateParentChildIndices():void {
    const p=this._parent
    for(let f=0;f<p.getNumFaces();f++)if(p.getNumFaceVertices(f)!==3)throw Error('TriRefinement requires triangular faces')
    this._faceChildFaceIndices=new Int32Array(p.getNumFaces()*4);this._faceChildEdgeIndices=new Int32Array(p.getNumFaces()*3)
    this._edgeChildEdgeIndices=new Int32Array(p.getNumEdges()*2);this._faceChildVertIndex=new Int32Array(0)
    this._edgeChildVertIndex=new Int32Array(p.getNumEdges());this._vertChildVertIndex=new Int32Array(p.getNumVertices())
  }
  populateFaceVertexRelation():void {
    const p=this._parent,c=this._child;c._faceVertCountsAndOffsets=new Int32Array(c.getNumFaces()*2);c._faceVertIndices=new Int32Array(c.getNumFaces()*3)
    for(let f=0;f<c.getNumFaces();f++){c._faceVertCountsAndOffsets[f*2]=3;c._faceVertCountsAndOffsets[f*2+1]=f*3}
    for(let f=0;f<p.getNumFaces();f++){
      const v=Array.from(p.getFaceVertices(f),i=>this._vertChildVertIndex[i]!),e=Array.from(p.getFaceEdges(f),i=>this._edgeChildVertIndex[i]!)
      c._faceVertIndices.set([v[0]!,e[0]!,e[2]!,e[0]!,v[1]!,e[1]!,e[2]!,e[1]!,v[2]!,e[1]!,e[2]!,e[0]!],f*12)
    }
  }
  populateFaceEdgeRelation():void {
    const p=this._parent,c=this._child;c._faceEdgeIndices=new Int32Array(c.getNumFaces()*3)
    for(let f=0;f<p.getNumFaces();f++){
      const pv=p.getFaceVertices(f),pe=p.getFaceEdges(f),inter=this.getFaceChildEdges(f),ends:number[][]=[]
      for(let i=0;i<3;i++){const ev=p.getEdgeVertices(pe[i]!),ce=this.getEdgeChildEdges(pe[i]!),rev=ev[0]!==ev[1]&&pv[i]!==ev[0];ends.push([ce[rev?1:0]!,ce[rev?0:1]!])}
      c._faceEdgeIndices.set([ends[0]![0]!,inter[0]!,ends[2]![1]!,ends[0]![1]!,ends[1]![0]!,inter[1]!,inter[2]!,ends[1]![1]!,ends[2]![0]!,inter[2]!,inter[0]!,inter[1]!],f*12)
    }
  }
  populateEdgeVertexRelation():void {
    const p=this._parent,c=this._child;c._edgeVertIndices=new Int32Array(c.getNumEdges()*2)
    for(let f=0;f<p.getNumFaces();f++){const e=Array.from(p.getFaceEdges(f),i=>this._edgeChildVertIndex[i]!);c._edgeVertIndices.set([e[0]!,e[2]!,e[1]!,e[0]!,e[2]!,e[1]!],f*6)}
    for(let e=0;e<p.getNumEdges();e++){const pv=p.getEdgeVertices(e),ce=this.getEdgeChildEdges(e);for(let j=0;j<2;j++)c.getEdgeVertices(ce[j]!).set([this._edgeChildVertIndex[e]!,this._vertChildVertIndex[pv[j]!]!])}
  }
  populateEdgeFaceRelation():void {
    const p=this._parent,c=this._child,rows:Pair[][]=Array.from({length:c.getNumEdges()},()=>[])
    for(let f=0;f<p.getNumFaces();f++){const cf=this.getFaceChildFaces(f),ce=this.getFaceChildEdges(f);for(let j=0;j<3;j++)rows[ce[j]!]!.push([cf[j]!, (j+1)%3],[cf[3]!, (j+1)%3])}
    for(let e=0;e<p.getNumEdges();e++){const faces=p.getEdgeFaces(e),local=p.getEdgeFaceLocalIndices(e),v=p.getEdgeVertices(e),ce=this.getEdgeChildEdges(e)
      for(let j=0;j<2;j++)for(let i=0;i<faces.length;i++){const f=faces[i]!,li=local[i]!,fv=p.getFaceVertices(f);const child=(li+(v[0]===v[1]?j:Number(fv[li]!==v[j])))%3;rows[ce[j]!]!.push([this.getFaceChildFaces(f)[child]!,li])}
    }
    const r=pack(rows);c._edgeFaceCountsAndOffsets=r.co;c._edgeFaceIndices=r.values;c._edgeFaceLocalIndices=r.local;c._maxEdgeFaces=Math.max(2,p._maxEdgeFaces)
  }
  populateVertexFaceRelation():void {
    const p=this._parent,c=this._child,rows:Pair[][]=Array.from({length:c.getNumVertices()},()=>[])
    for(let e=0;e<p.getNumEdges();e++){const faces=p.getEdgeFaces(e),local=p.getEdgeFaceLocalIndices(e),row=rows[this._edgeChildVertIndex[e]!]!;for(let i=0;i<faces.length;i++){const li=local[i]!,cf=this.getFaceChildFaces(faces[i]!);row.push([cf[(li+1)%3]!,li],[cf[3]!,(li+2)%3],[cf[li]!,(li+1)%3])}}
    for(let v=0;v<p.getNumVertices();v++){const faces=p.getVertexFaces(v),local=p.getVertexFaceLocalIndices(v),row=rows[this._vertChildVertIndex[v]!]!;for(let i=0;i<faces.length;i++)row.push([this.getFaceChildFaces(faces[i]!)[local[i]!]!,local[i]!])}
    const r=pack(rows);c._vertFaceCountsAndOffsets=r.co;c._vertFaceIndices=r.values;c._vertFaceLocalIndices=r.local
  }
  populateVertexEdgeRelation():void {
    const p=this._parent,c=this._child,rows:Pair[][]=Array.from({length:c.getNumVertices()},()=>[])
    for(let e=0;e<p.getNumEdges();e++){const faces=p.getEdgeFaces(e),local=p.getEdgeFaceLocalIndices(e),ev=p.getEdgeVertices(e),ce=this.getEdgeChildEdges(e),row=rows[this._edgeChildVertIndex[e]!]!
      for(let i=0;i<faces.length;i++){const f=faces[i]!,li=local[i]!,inter=this.getFaceChildEdges(f),rev=ev[0]!==ev[1]&&p.getFaceVertices(f)[li]!==ev[0];if(i===0)row.push([ce[rev?0:1]!,0]);row.push([inter[(li+1)%3]!,1],[inter[li]!,0]);if(i===0)row.push([ce[rev?1:0]!,0])}
    }
    for(let v=0;v<p.getNumVertices();v++){const edges=p.getVertexEdges(v),local=p.getVertexEdgeLocalIndices(v),row=rows[this._vertChildVertIndex[v]!]!;for(let i=0;i<edges.length;i++)row.push([this.getEdgeChildEdges(edges[i]!)[local[i]!]!,1])}
    const r=pack(rows);c._vertEdgeCountsAndOffsets=r.co;c._vertEdgeIndices=r.values;c._vertEdgeLocalIndices=r.local
  }
  override subdivideTopology():void {super.subdivideTopology();this._child._maxValence=Math.max(this._parent._maxValence,6,2+2*this._parent._maxEdgeFaces)}
}
