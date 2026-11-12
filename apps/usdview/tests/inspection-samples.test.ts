// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Stage } from 'typescript-usd/usd'
import { inspectObject } from '../src/inspection'
import { renderInspection } from '../src/inspector-view'
import expected from './fixtures/inspection-samples/expected.json'
import nativeView from './fixtures/layer-stack-inspection/expected.json'

it('matches native26.11 sampled-spec summaries, authored sample pairs and layer offsets at review times', async () => {
  const stage = (await Stage.open(resolve('tests/fixtures/inspection-samples/root.usda')))!
  try {
    for (const native of expected.rows) {
      const snapshot = inspectObject(stage, '/World', native.property, native.time)!
      expect(stage.getPrim('/World')!.getAttr(native.property)!.getValueAtTime(native.time) ?? null).toEqual(native.composed)
      expect(snapshot.layers.map(row => ({
        layer: row.layer.split('/').pop(), specPath: row.specPath, offset: row.offset, scale: row.scale,
        display: row.value === '—' ? '' : row.value,
        value: row.samples ? row.samples.map(s => [s.time, JSON.parse(s.value)]) : row.value === '—' ? null : JSON.parse(row.value),
        sampleCount: row.sampleCount ?? 0,
      }))).toEqual(native.stack.map(row => ({...row, display: row.sampleCount ? row.display : row.value == null ? '' : JSON.stringify(row.value)})))
    }
    const snapshot = inspectObject(stage, '/World', 'weight', 12)!
    const host = document.createElement('section')
    renderInspection(host, snapshot, 'layers')
    const native = nativeView.rows.find(row => row.fixture==='inspection-samples'&&row.property==='weight')!
    expect([...host.querySelectorAll('tbody tr')].map(row=>row.lastElementChild!.textContent)).toEqual(native.rows.map(row=>row.text[3]))
    expect(host.querySelectorAll('p,summary,details')).toHaveLength(0)
  } finally { stage.dispose() }
})

it('retains bounded raw samples while the native table shows the total sample count', async () => {
  const stage = (await Stage.open(resolve('tests/fixtures/inspection-samples/root.usda')))!
  try {
    const attr = stage.getPrim('/World')!.getAttr('single')!
    stage.setEditTarget(stage.getSessionLayer())
    for (let time = 0; time < 105; time++) attr.setTimeSample(time, time)
    await stage.flushChanges()
    const snapshot = inspectObject(stage, '/World', 'single', 3)!
    expect(snapshot.layers[0]!.value).toBe('105 time samples')
    expect(snapshot.layers[0]!.samples).toHaveLength(100)
    const host = document.createElement('section'); renderInspection(host, snapshot, 'layers')
    const native = nativeView.rows.find(row=>row.sessionSamples===105)!
    expect(host.querySelector('tbody tr')!.lastElementChild!.textContent).toBe(native.rows[0]!.text[3])
    expect(host.querySelectorAll('p,summary,details')).toHaveLength(0)
  } finally { stage.dispose() }
})
