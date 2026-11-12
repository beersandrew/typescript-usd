// Ported from OpenUSD 26.11.1: pxr/imaging/hd/overlayContainerDataSource.cpp,
//  pxr/imaging/hd/overlayContainerDataSource.h, pxr/imaging/hd/dataSource.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/overlayContainerDataSource.{h,cpp} and the
// HdBlockDataSource from pxr/imaging/hd/dataSource.h.

import { HdContainerDataSource, HdDataSourceBase } from './dataSource.ts'

// ---- HdBlockDataSource ----

// A data source representing the absence of a data source. When composing
// containers, a block masks (shadows) a value coming from a lower layer.
export class HdBlockDataSource extends HdDataSourceBase {
  static new(): HdBlockDataSource {
    return new HdBlockDataSource()
  }
}

// ---- HdOverlayContainerDataSource ----

// Composes an ordered list of containers. For any name, the first container
// that provides a non-null value wins; nested containers are themselves
// overlaid so that descendants of later containers can still come through.
export class HdOverlayContainerDataSource extends HdContainerDataSource {
  private _containers: (HdContainerDataSource | undefined)[]

  constructor(containers: (HdContainerDataSource | undefined)[]) {
    super()
    this._containers = containers
  }

  static new(
    ...containers: (HdContainerDataSource | undefined)[]
  ): HdOverlayContainerDataSource {
    return new HdOverlayContainerDataSource(containers)
  }

  static overlayedContainerDataSources(
    src1: HdContainerDataSource | undefined,
    src2: HdContainerDataSource | undefined,
  ): HdContainerDataSource | undefined {
    if (!src1) return src2
    if (!src2) return src1
    return HdOverlayContainerDataSource.new(src1, src2)
  }

  getNames(): string[] {
    const usedNames: string[] = []
    const seen = new Set<string>()
    for (const c of this._containers) {
      if (c) {
        for (const name of c.getNames()) {
          if (!seen.has(name)) {
            seen.add(name)
            usedNames.push(name)
          }
        }
      }
    }
    return usedNames
  }

  Get(name: string): HdDataSourceBase | undefined {
    const childContainers: HdContainerDataSource[] = []

    for (const c of this._containers) {
      if (c) {
        const child = c.Get(name)
        if (child) {
          if (child instanceof HdContainerDataSource) {
            childContainers.push(child)
          } else {
            // if there are already containers to our left, we should return
            // those rather than replace it with a non-container value
            if (childContainers.length > 0) break

            // HdBlockDataSource's role is to mask values
            if (child instanceof HdBlockDataSource) return undefined
            return child
          }
        }
      }
    }

    switch (childContainers.length) {
      case 0:
        return undefined
      case 1:
        return childContainers[0]
      default:
        return HdOverlayContainerDataSource.new(...childContainers)
    }
  }
}
