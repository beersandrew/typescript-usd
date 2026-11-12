import {expect,it} from 'vitest'
import native from './fixtures/usdviewLabelsFormatting/expected.json' with {type:'json'}
import {formatLabels} from '../src/labels-format'
for(const [i,row] of native.cases.entries())it(`native usdview label formatting ${i}`,()=>{
 expect(formatLabels(row.entries as [string,string[]][])).toEqual({short:row.short,text:row.text})
})
