// Ported from OpenVDB 13.0.1: openvdb/openvdb/MetaMap.h,
//  openvdb/openvdb/MetaMap.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of openvdb/MetaMap.h/.cc (read side): an ordered string -> Metadata
// map. Temporary entries (double-underscore prefix on the TYPE name) are
// dropped on read, mirroring upstream.

import { Metadata, readMetadata } from './Metadata.ts'
import type { Stream } from './io/Stream.ts'

export class MetaMap {
  readonly meta = new Map<string, Metadata>()

  readMeta(s: Stream): void {
    this.meta.clear()
    const count = s.uint32()
    for (let i = 0; i < count; ++i) {
      const { name, metadata } = readMetadata(s)
      const temporary = metadata.typeName.startsWith('__')
      if (!temporary) this.meta.set(name, metadata)
    }
  }

  getMetadata(name: string): Metadata | undefined {
    return this.meta.get(name)
  }

  metaCount(): number {
    return this.meta.size
  }

  [Symbol.iterator](): IterableIterator<[string, Metadata]> {
    return this.meta[Symbol.iterator]()
  }
}
