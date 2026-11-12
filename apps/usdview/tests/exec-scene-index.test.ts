// Controller test (no browser): the page's env parameters reach the
// environment UsdImagingGLEngine reads USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX
// from, and the exec plugins load only when it is on.
import { afterEach, describe, expect, it } from 'vitest'
import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import { applyEnvParameters, envParameters, execSceneIndexSetting, prepareExecSceneIndex } from '../src/exec-scene-index'

const setting = new TfEnvSetting(execSceneIndexSetting, false)
afterEach(() => { delete process.env[execSceneIndexSetting] })

describe('exec scene index switch', () => {
  it('parses repeatable NAME=VALUE env parameters', () => {
    expect(envParameters(`?env=${execSceneIndexSetting}=1&env=A=b=c&env=bad`)).toEqual({ [execSceneIndexSetting]: '1', A: 'b=c' })
  })

  it('applies them where TfGetEnvSetting reads', () => {
    expect(TfGetEnvSetting(setting)).toBe(false)
    applyEnvParameters({ [execSceneIndexSetting]: '1' })
    expect(TfGetEnvSetting(setting)).toBe(true)
  })

  it('loads the exec plugins when the setting is on', async () => {
    await prepareExecSceneIndex()
    const { Registry } = await import('typescript-usd/plug')
    expect(Registry.GetInstance().GetPluginWithName('execGeom')).toBeNull()
    applyEnvParameters({ [execSceneIndexSetting]: '1' })
    await prepareExecSceneIndex()
    expect(Registry.GetInstance().GetPluginWithName('execGeom')?.isLoaded()).toBe(true)
    expect(Registry.GetInstance().GetPluginWithName('usdExecImaging')).not.toBeNull()
  // The first prepare imports the exec library graph cold (about 2 s alone,
  // past vitest's 5 s default when the full suite runs in parallel).
  }, 30_000)
})
