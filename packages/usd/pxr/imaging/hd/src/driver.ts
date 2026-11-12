// Ported from OpenUSD 26.11.1: pxr/imaging/hd/driver.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/driver.h (OpenUSD 26.11.1).

import type { Token as TfToken } from 'typescript-usd/tf'

/**
 * driver.h:18-27. HdDriver represents a device object, commonly a render
 * device, that is owned by the application and passed to HdRenderIndex.
 * The RenderIndex passes it to the render delegate and rendering tasks.
 * The application manages the lifetime (destruction) of HdDriver and must
 * ensure it remains valid while Hydra is running.
 *
 * The VtValue `driver` holds the device object (for example an Hgi).
 */
export interface HdDriver {
  name: TfToken | string
  driver: unknown
}

/** renderDelegate.h:40 (std::vector<HdDriver*>) */
export type HdDriverVector = HdDriver[]
