// Native hdx/CMakeLists.txt:102 bundles this texture beside the hdx package.
import {cpSync,mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const source=new URL('../pxr/imaging/hdx/textures/',import.meta.url)
const destination=new URL('../dist/pxr/imaging/hdx/textures/',import.meta.url)
mkdirSync(destination,{recursive:true})
for(const name of ['StinsonBeach.hdr','PROVENANCE.md'])cpSync(fileURLToPath(new URL(name,source)),fileURLToPath(new URL(name,destination)))
