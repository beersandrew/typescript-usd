// Ported from OpenUSD 26.11.1: pxr/base/tf/envSetting.cpp,
//  pxr/base/tf/envSetting.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Environment setting surface from OpenUSD v26.08
// pxr/base/tf/envSetting.h:114-170.

export class TfEnvSetting<T extends boolean | number | string> {
  constructor(
    readonly name: string,
    readonly defaultValue: T,
    readonly description = '',
  ) {}
}

function environmentValue(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name]
}

export function TfGetEnvSetting<T extends boolean | number | string>(setting: TfEnvSetting<T>): T {
  // envSetting.cpp:156-164 reads the setting with TfGetenv / TfGetenvBool /
  // TfGetenvInt, each of which returns the default for an unset or empty
  // variable (getenv.cpp:18-56). Upstream caches the value at first use and
  // prints an override alert to stderr (envSetting.cpp:180-210); neither is
  // done here.
  const value = environmentValue(setting.name)
  if (value === undefined || value === '') return setting.defaultValue
  if (typeof setting.defaultValue === 'boolean') {
    // getenv.cpp:47-54
    return (/^(?:1|true|yes|on)$/i.test(value)) as T
  }
  // getenv.cpp:37 (std::stoi)
  if (typeof setting.defaultValue === 'number') return Number.parseInt(value, 10) as T
  return value as T
}
