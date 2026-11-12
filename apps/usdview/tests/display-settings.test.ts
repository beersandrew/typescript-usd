import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { backgroundColors, complexities, defaultDisplaySettings, mergeDisplaySettings } from '../src/display-settings'
const native = JSON.parse(readFileSync(new URL('./fixtures/displaySettings/expected.json',import.meta.url),'utf8'))
it('uses installed native usdview linear background colors and complexity labels', () => {
 expect(backgroundColors).toEqual(native.backgrounds)
 expect(defaultDisplaySettings().showBBoxPlayback).toBe(native.showBBoxPlayback)
 for (const [id,setting] of Object.entries(complexities)) expect(setting.label).toBe(native.complexities[id].label)
})
it('rejects unknown settings and inherited object property names without changing current state', () => {
 const current = defaultDisplaySettings()
 expect(() => mergeDisplaySettings(current,{background:'toString' as never})).toThrow('Unknown background')
 expect(() => mergeDisplaySettings(current,{complexity:'constructor' as never})).toThrow('Unknown subdivision')
 expect(() => mergeDisplaySettings(current,{cameraLightEnabled:'yes' as never})).toThrow('boolean')
 expect(current).toEqual(defaultDisplaySettings())
})
