// @vitest-environment jsdom
// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/validationWidget.py,
//  pxr/usdValidation/usdValidation/testenv/testUsdCoreValidators.cpp
// Copyright 2024, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Window > USD Validation (usdviewq/validationWidget.py). The runtime side
// runs typescript-usd/usdValidation over a real stage; the expected message is
// the one OpenUSD's testUsdCoreValidators.cpp:47-89 expects from
// StageMetadataChecker. The window is checked against a fake runtime (wiring,
// not USD semantics).
import { describe, expect, it, vi } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import type { ValidationRequest, ValidationResultRow, ValidatorEntry, ViewerRuntime } from '../src/contracts'
import { listValidators, runValidation } from '../src/usd-validation'
import { ValidationWindow, validationDialog } from '../src/validation-window'

const currentFrame: ValidationRequest['timeRange'] = { mode: 'currentFrame', includeDefaultTime: true }

describe('USD validation runtime', () => {
  it('lists the validators of every ported validator library, by plugin', () => {
    const entries = listValidators()
    const core = entries.filter(entry => entry.pluginName === 'usdValidation').map(entry => entry.name).sort()
    expect(core).toEqual(['AttributeTypeMismatch', 'CompositionErrorTest', 'StageMetadataChecker'])
    const plugins = new Set(entries.map(entry => entry.pluginName))
    for (const plugin of ['usdGeomValidators', 'usdShadeValidators', 'usdSkelValidators', 'usdPhysicsValidators',
      'usdLuxValidators', 'usdMediaValidators', 'usdLodValidators', 'usdUtilsValidators']) expect(plugins.has(plugin), plugin).toBe(true)
    // usdUtilsValidators/plugInfo.json: the five validators, by name without the plugin prefix.
    expect(entries.filter(entry => entry.pluginName === 'usdUtilsValidators').map(entry => entry.name).sort())
      .toEqual(['FileExtensionValidator', 'MissingReferenceValidator', 'PackageEncapsulationValidator',
        'RootPackageValidator', 'UsdzPackageValidator'])
  })

  it('runs the chosen validators over the stage and reports their errors as rows', async () => {
    const rootLayer = Layer.createAnonymous()
    const stage = await Stage.open(rootLayer)
    stage.definePrim('/test', 'Xform')
    const rows = await runValidation(stage, { validatorNames: ['usdValidation:StageMetadataChecker'], timeRange: currentFrame },
      { start: 0, end: 0, current: 0, framesPerSecond: 24, timeCodesPerSecond: 24 })
    expect(rows).toEqual([{
      validatorName: 'usdValidation:StageMetadataChecker', errorName: 'MissingDefaultPrim', sites: ['/'],
      primPaths: ['/'], propertyPaths: [], type: 'Error',
      message: `Stage with root layer <${rootLayer.identifier}> has an invalid or missing defaultPrim.`,
    }])
    stage.setDefaultPrim(stage.getPrim('/test')!)
    expect(await runValidation(stage, { validatorNames: ['usdValidation:StageMetadataChecker'], timeRange: currentFrame }, null)).toEqual([])
  })

  it('validates only the selected prims when asked, and the whole stage when the selection is the root', async () => {
    const stage = await Stage.open(Layer.createAnonymous())
    stage.definePrim('/A', 'Xform'); stage.definePrim('/B', 'Xform')
    const request = (primPaths: string[]): ValidationRequest =>
      ({ validatorNames: ['usdValidation:StageMetadataChecker'], primPaths, timeRange: currentFrame })
    // A stage validator does not run on prims.
    expect(await runValidation(stage, request(['/A']), null)).toEqual([])
    expect((await runValidation(stage, request(['/']), null)).map(row => row.errorName)).toEqual(['MissingDefaultPrim'])
  })
})

function windowSetup(runtime: Partial<ViewerRuntime>) {
  const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<button data-window="validation"></button>${validationDialog}`
  const select = vi.fn()
  const window = new ValidationWindow(root, () => runtime as ViewerRuntime, () => ['/World'], select)
  window.bind(new AbortController().signal)
  return { root, window, select }
}

describe('USD Validation window', () => {
  const validators: ValidatorEntry[] = [
    { pluginName: 'usdValidation', name: 'StageMetadataChecker', fullName: 'usdValidation:StageMetadataChecker', isSuite: false, doc: 'defaultPrim' },
    { pluginName: 'usdGeomValidators', name: 'StageMetadataChecker', fullName: 'usdGeomValidators:StageMetadataChecker', isSuite: false, doc: 'upAxis' },
    { pluginName: 'Uncategorized', name: 'dynamic', fullName: 'dynamic', isSuite: true, doc: 'A suite' },
  ]
  const row: ValidationResultRow = { validatorName: 'usdValidation:StageMetadataChecker', errorName: 'MissingDefaultPrim',
    sites: ['/World.radius'], primPaths: [], propertyPaths: ['/World.radius'], message: 'missing', type: 'Error' }

  it('groups validators by plugin, enables Run once one is checked, and shows the results', async () => {
    const runValidationFn = vi.fn(async () => [row])
    const { root, window, select } = windowSetup({ listValidators: async () => validators, runValidation: runValidationFn })
    await window.open()
    const plugins = [...root.querySelectorAll<HTMLElement>('.validation-tree li[data-plugin]')].map(li => li.dataset.plugin)
    expect(plugins).toEqual(['usdGeomValidators', 'usdValidation', 'Uncategorized'])
    expect(root.querySelector('[data-validator="dynamic"]')!.closest('li')!.textContent).toContain('(Suite) A suite')
    const run = root.querySelector<HTMLButtonElement>('.validation-run')!
    expect(run.disabled).toBe(true)

    const pluginToggle = root.querySelector<HTMLInputElement>('[data-plugin-toggle="usdValidation"]')!
    pluginToggle.checked = true; pluginToggle.dispatchEvent(new Event('change', { bubbles: true }))
    expect(window.selectedValidators()).toEqual(['usdValidation:StageMetadataChecker'])
    expect(root.querySelector<HTMLInputElement>('[data-all]')!.indeterminate).toBe(true)
    expect(run.disabled).toBe(false)

    const fromSelection = root.querySelector<HTMLInputElement>('[name="primsSetFromSelection"]')!
    fromSelection.checked = true; fromSelection.dispatchEvent(new Event('change'))
    expect(root.querySelector<HTMLInputElement>('[name="includeDescendantPrims"]')!.disabled).toBe(false)
    await window.run()
    expect(runValidationFn).toHaveBeenCalledWith({ validatorNames: ['usdValidation:StageMetadataChecker'],
      timeRange: { mode: 'currentFrame', includeDefaultTime: false }, primPaths: ['/World'], includeDescendantPrims: false })
    const cells = [...root.querySelectorAll('.validation-results tr[data-row] td')].map(td => td.textContent)
    expect(cells).toEqual(['usdValidation:StageMetadataChecker', 'MissingDefaultPrim', '/World.radius', 'missing', 'Error'])

    // Double-clicking a property site selects its prim (validationWidget.py:564-620).
    root.querySelector('.validation-results td')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(select).toHaveBeenCalledWith(['/World'])
  })

  it('re-checks Run when playback stops, as appController.py:2123-2124', async () => {
    const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<button data-window="validation"></button>${validationDialog}`
    let playing = true
    const runtime = { listValidators: async () => validators, runValidation: async () => [] }
    const window = new ValidationWindow(root, () => runtime as unknown as ViewerRuntime, () => ['/World'], vi.fn(), () => playing)
    window.bind(new AbortController().signal)
    await window.open()
    const toggle = root.querySelector<HTMLInputElement>('[data-plugin-toggle="usdValidation"]')!
    toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const run = root.querySelector<HTMLButtonElement>('.validation-run')!
    expect(run.disabled).toBe(true)
    playing = false; window.updateRunButtonState()
    expect(run.disabled).toBe(false)
  })

  it('filters the validator tree by plugin, name or doc', async () => {
    const { root, window } = windowSetup({ listValidators: async () => validators })
    await window.open()
    const search = root.querySelector<HTMLInputElement>('.validation-search')!
    search.value = 'upaxis'; search.dispatchEvent(new Event('input'))
    const visible = [...root.querySelectorAll<HTMLElement>('.validation-tree li[data-plugin]')].filter(li => !li.hidden).map(li => li.dataset.plugin)
    expect(visible).toEqual(['usdGeomValidators'])
  })

  it('says when a run finds no errors', async () => {
    const { root, window } = windowSetup({ listValidators: async () => validators, runValidation: async () => [] })
    await window.open()
    const box = root.querySelector<HTMLInputElement>('[data-validator="dynamic"]')!
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }))
    await window.run()
    expect(root.querySelector('.validation-status')!.textContent).toBe('No validation errors found.')
    expect(root.querySelector<HTMLTableElement>('.validation-results table')!.hidden).toBe(true)
  })
})
