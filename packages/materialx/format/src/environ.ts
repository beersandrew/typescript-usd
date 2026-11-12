// Ported from MaterialX 1.39.5: source/MaterialXFormat/Environ.h,
//  source/MaterialXFormat/Environ.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXFormat/Environ.h and Environ.cpp
//
// Backed by process.env in Node; in environments without a process global
// (browsers), an in-memory map provides the same API.

import { EMPTY_STRING } from '@mtlx/core'

const memoryEnv = new Map<string, string>()

function nodeEnv(): Record<string, string | undefined> | null {
  return typeof process !== 'undefined' && process.env ? process.env : null
}

// Return the value of an environment variable, if any.
export function getEnviron(name: string): string {
  const env = nodeEnv()
  if (env) return env[name] ?? EMPTY_STRING
  return memoryEnv.get(name) ?? EMPTY_STRING
}

// Set an environment variable to a given value.
export function setEnviron(name: string, value: string): boolean {
  const env = nodeEnv()
  if (env) {
    env[name] = value
  } else {
    memoryEnv.set(name, value)
  }
  return true
}

// Remove an environment variable, if present.
export function removeEnviron(name: string): boolean {
  const env = nodeEnv()
  if (env) {
    delete env[name]
  } else {
    memoryEnv.delete(name)
  }
  return true
}
