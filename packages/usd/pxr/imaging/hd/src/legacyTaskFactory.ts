// Ported from OpenUSD 26.11.1: pxr/imaging/hd/legacyTaskFactory.cpp,
//  pxr/imaging/hd/legacyTaskFactory.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyTaskFactory.h (OpenUSD 26.11.1).
//
// Divergence: the C++ factory is a template over the task class
// (HdLegacyTaskFactory_Impl<T>, HdMakeLegacyTaskFactory<T>()); here the task
// constructor is passed as a value.

import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdTask } from './task.ts'

/** legacyTaskFactory.h:19-31: an abstract base class to create
 *  implementations of HdTask. */
export abstract class HdLegacyTaskFactory {
  abstract create(delegate: HdSceneDelegate, id: string): HdTask
}

/** The constructor shape std::make_shared<T>(delegate, id) uses. */
export type HdLegacyTaskConstructor<T extends HdTask> =
  new (delegate: HdSceneDelegate, id: string) => T

/** legacyTaskFactory.h:33-42 */
export class HdLegacyTaskFactory_Impl<T extends HdTask> extends HdLegacyTaskFactory {
  constructor(private readonly _ctor: HdLegacyTaskConstructor<T>) { super() }

  create(delegate: HdSceneDelegate, id: string): HdTask {
    return new this._ctor(delegate, id)
  }
}

/** legacyTaskFactory.h:44-51: given a subclass implementing HdTask, create a
 *  factory for that subclass. */
export function HdMakeLegacyTaskFactory<T extends HdTask>(
  ctor: HdLegacyTaskConstructor<T>): HdLegacyTaskFactory {
  return new HdLegacyTaskFactory_Impl(ctor)
}
