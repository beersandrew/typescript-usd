import {expect,it} from 'vitest'
import native from './fixtures/viewPreferences/expected.json' with {type:'json'}
import {defaultViewPreferences,readViewPreferences,ViewPreferenceStore} from '../src/view-preferences'
const tree={showInactivePrims:true,showAllPrototypePrims:false,showUndefinedPrims:false,showAbstractPrims:false,showPrimDisplayNames:true}
const defaults=()=>defaultViewPreferences(tree)
it('restores native typed values independently and excludes native transient state',()=>{
 const good=readViewPreferences({tree:{showInactivePrims:native.valid.showInactivePrims},camera:{fovDegrees:native.valid.freeCameraFOV},ui:{fontSize:native.valid.fontSize},presentation:{cameraMaskMode:native.valid.cameraMaskMode}},defaults()).preferences
 expect(good.tree.showInactivePrims).toBe(false);expect(good.camera.fovDegrees).toBe(45);expect(good.ui.fontSize).toBe(18);expect(good.presentation.cameraMaskMode).toBe('partial')
 const bad=readViewPreferences({tree:{showInactivePrims:'false'},camera:{fovDegrees:false},ui:{fontSize:'18',showHUD:false}},defaults())
 expect(bad.preferences.tree.showInactivePrims).toBe(native.invalid.showInactivePrims);expect(bad.preferences.camera.fovDegrees).toBe(native.invalid.freeCameraFOV);expect(bad.preferences.ui.fontSize).toBe(native.invalid.fontSize);expect(bad.preferences.ui.showHUD).toBe(native.invalid.showHUD);expect(bad.warnings).toHaveLength(3)
 for(const key of native.excludedKeys)expect(native.savedKeys).not.toContain(key)
})
it('writes only supported view preferences and preserves other schema versions',()=>{
 let saved='{"2":{"future":true}}',writes=0
 const storage={getItem:()=>saved,setItem:(_key:string,v:string)=>{saved=v;writes++}}
 const store=new ViewPreferenceStore(()=>storage,'prefs',defaults());const p=store.load().preferences
 const contaminated={...p,currentFrame:12,selection:['/World'],sessionLayer:'edit',cameraPath:'/Cam',display:{...p.display,complexity:'high'},tree:{...p.tree,expanded:['/World']}}
 store.save(contaminated);store.save(contaminated)
 const parsed=JSON.parse(saved);expect(parsed['2']).toEqual({future:true});expect(parsed['1']).toEqual(p);expect(writes).toBe(1)
})
it('keeps corrupt or inaccessible storage nonfatal and does not overwrite corrupt JSON',()=>{
 let saved='broken',writes=0;const storage={getItem:()=>saved,setItem:()=>{writes++}}
 const store=new ViewPreferenceStore(()=>storage,'prefs',defaults());expect(store.load().warnings).toHaveLength(1);store.save(defaults());expect(writes).toBe(0);expect(saved).toBe('broken')
 const unavailable=new ViewPreferenceStore(()=>{throw new Error('denied')},'prefs',defaults());expect(unavailable.load().preferences).toEqual(defaults());expect(unavailable.save(defaults())).toEqual([])
})
