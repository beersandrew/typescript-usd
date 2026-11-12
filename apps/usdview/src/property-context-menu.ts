// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdviewq/attributeViewContextMenu.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 attributeViewContextMenu.py:33-250. Native evidence lives in
// tests/fixtures/usdviewPropertyMenu. The menu shares the prim popup presenter.
import type {PropertySummary,ViewerRuntime} from './contracts'
import type {PrimContextMenuItem} from './edit-menu'
import {parseInspectionPath} from './inspection-navigation'
export function propertyContextMenuItems(property:PropertySummary,copyValue:string,targetPaths?:readonly string[]):PrimContextMenuItem[]{
 const copy=(text:string,value:string):PrimContextMenuItem=>({text,enabled:true,run:{kind:'copy',text:value}})
 const select=(text:string,paths:readonly string[]):PrimContextMenuItem=>({text,enabled:paths.length>0,run:{kind:'inspectPaths',paths:[...paths]}})
 if(targetPaths)return [copy('Copy Target Path As Text',targetPaths.join(', ')),select('Select Target Path',targetPaths)]
 const items=[copy('Copy Property Name',property.name),copy('Copy Property Value',copyValue)]
 if(property.role==='relationshipWithTargets'||property.role==='attributeWithConnections'){
  const paths=property.targets??[]
  // Native CopyAllTargetPathsMenuItem.RunCommand:244 raises TypeError joining
  // Sdf.Path objects. Keep this known native failure visible instead of masking it.
  items.push({text:'Copy Target Path(s) As Text',enabled:paths.length>0,run:{kind:'propertyError',message:'Native OpenUSD Copy Target Path(s) As Text raises TypeError (attributeViewContextMenu.py:244). Use the individual target rows to copy paths.'}},select('Select Target Path(s)',paths))
 }
 if((property.role??'attribute')==='attribute')items.push({text:'View Spline',enabled:false,run:{kind:'none'},unsupported:'The native spline editor is unavailable in this viewer.'})
 return items
}
/** Validate every target before replacing anything, as _selectPrimsAndProps:45-75. */
export function targetSelection(runtime:Pick<ViewerRuntime,'inspect'>,paths:readonly string[]):{prims:{path:string}[],properties:string[]}{
 const prims:{path:string}[]=[],properties:string[]=[]
 for(const path of paths){
  const {primPath,propertyName}=parseInspectionPath(path)
  if(!runtime.inspect?.(primPath))throw new Error(`No prim at ${primPath}`)
  if(propertyName&&!runtime.inspect(primPath,propertyName))throw new Error(`No property at ${path}`)
  if(!prims.some(prim=>prim.path===primPath))prims.push({path:primPath})
  if(propertyName&&!properties.includes(path))properties.push(path)
 }
 return {prims,properties}
}
