// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/envSetting.cpp,
//  pxr/base/tf/envSetting.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/envSetting.cpp, registration
// TfEnvSetting (Test_TfEnvSetting, envSetting.cpp:39-51), run by testTf with
// the environment registered at pxr/base/tf/CMakeLists.txt:529-540:
//   TF_TEST_BOOL_ENV_SETTING=1 TF_TEST_INT_ENV_SETTING=123
//   TF_TEST_STRING_ENV_SETTING=alpha TF_ENV_SETTING_ALERTS_ENABLED=0
// and its stderr compared with testenv/baseline/TfEnvSetting/
// debugTfEnvSettingStderr.txt, which is empty.
//
// Adaptation: TF_DEFINE_ENV_SETTING is a module-level TfEnvSetting; the
// ARCH_CONSTRUCTOR check (envSetting.cpp:34-37) runs first in the test body.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TfEnvSetting, TfGetEnvSetting } from '../../src/index.ts'

const TF_TEST_BOOL_ENV_SETTING_X = new TfEnvSetting('TF_TEST_BOOL_ENV_SETTING_X', false, 'bool env setting (not set by test)')
const TF_TEST_BOOL_ENV_SETTING = new TfEnvSetting('TF_TEST_BOOL_ENV_SETTING', false, 'bool env setting')
const TF_TEST_INT_ENV_SETTING_X = new TfEnvSetting('TF_TEST_INT_ENV_SETTING_X', 1, 'int env setting (not set by test)')
const TF_TEST_INT_ENV_SETTING = new TfEnvSetting('TF_TEST_INT_ENV_SETTING', 1, 'int env setting')
const TF_TEST_STRING_ENV_SETTING_X = new TfEnvSetting('TF_TEST_STRING_ENV_SETTING_X', 'default',
  'string env setting (not set by test)')
const TF_TEST_STRING_ENV_SETTING = new TfEnvSetting('TF_TEST_STRING_ENV_SETTING', 'default', 'string env setting')
const TF_TEST_POST_ENV_SETTING_X = new TfEnvSetting('TF_TEST_POST_ENV_SETTING_X', false,
  'post-registry-manager setting (not set by test)')

const registeredEnv: Record<string, string> = {
  TF_TEST_BOOL_ENV_SETTING: '1',
  TF_TEST_INT_ENV_SETTING: '123',
  TF_TEST_STRING_ENV_SETTING: 'alpha',
  TF_ENV_SETTING_ALERTS_ENABLED: '0',
}
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const [name, value] of Object.entries(registeredEnv)) {
    saved[name] = process.env[name]
    process.env[name] = value
  }
})
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('TfEnvSetting (testenv/envSetting.cpp)', () => {
  it('reads the registered environment, with an empty stderr', () => {
    const stderr = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    try {
      // envSetting.cpp:34-37
      expect(TfGetEnvSetting(TF_TEST_POST_ENV_SETTING_X)).toBe(false)

      // envSetting.cpp:42-49
      expect(TfGetEnvSetting(TF_TEST_BOOL_ENV_SETTING_X)).toBe(false)
      expect(TfGetEnvSetting(TF_TEST_BOOL_ENV_SETTING)).toBe(true)

      expect(TfGetEnvSetting(TF_TEST_INT_ENV_SETTING_X)).toBe(1)
      expect(TfGetEnvSetting(TF_TEST_INT_ENV_SETTING)).toBe(123)

      expect(TfGetEnvSetting(TF_TEST_STRING_ENV_SETTING_X)).toBe('default')
      expect(TfGetEnvSetting(TF_TEST_STRING_ENV_SETTING)).toBe('alpha')

      // baseline/TfEnvSetting/debugTfEnvSettingStderr.txt is empty.
      expect(stderr).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      stderr.mockRestore()
      warn.mockRestore()
    }
  })
})
