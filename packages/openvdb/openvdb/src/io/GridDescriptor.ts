// Ported from OpenVDB 13.0.1: openvdb/openvdb/io/GridDescriptor.h,
//  openvdb/openvdb/io/GridDescriptor.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of openvdb/io/GridDescriptor.h/.cc (read side).

import type { Stream } from './Stream.ts'

const HALF_FLOAT_TYPENAME_SUFFIX = '_HalfFloat'
const SEP = '\x1e' // ASCII record separator: uniquified names are "name\x1eN"

export class GridDescriptor {
  gridName = ''
  uniqueName = ''
  gridType = ''
  saveFloatAsHalf = false
  instanceParentName = ''
  gridPos = 0
  blockPos = 0
  endPos = 0

  static read(s: Stream): GridDescriptor {
    const gd = new GridDescriptor()
    gd.uniqueName = s.string()
    gd.gridName = GridDescriptor.stripSuffix(gd.uniqueName)
    gd.gridType = s.string()
    if (gd.gridType.endsWith(HALF_FLOAT_TYPENAME_SUFFIX)) {
      gd.saveFloatAsHalf = true
      gd.gridType = gd.gridType.slice(0, -HALF_FLOAT_TYPENAME_SUFFIX.length)
    }
    gd.instanceParentName = s.string()
    gd.gridPos = s.int64()
    gd.blockPos = s.int64()
    gd.endPos = s.int64()
    return gd
  }

  isInstance(): boolean {
    return this.instanceParentName.length > 0
  }

  static stripSuffix(name: string): string {
    const i = name.indexOf(SEP)
    return i < 0 ? name : name.slice(0, i)
  }

  /** "name[N]" display form of a uniquified name (upstream nameAsString) */
  static nameAsString(name: string): string {
    const i = name.indexOf(SEP)
    return i < 0 ? name : `${name.slice(0, i)}[${name.slice(i + 1)}]`
  }
}
