// Ported from OpenUSD 26.11.1:
//  pxr/imaging/geomUtil/testenv/testMeshGenerators.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/geomUtil/testenv/testMeshGenerators.cpp (OpenUSD
// 26.11.1). Upstream writes generatedMeshes_closed.txt and
// generatedMeshes_open.txt and DIFF_COMPAREs them (geomUtil/CMakeLists.txt:
// pxr_register_test(testMeshGenerators)) with the baselines in
// testenv/testMeshGenerators/baseline/, copied unchanged to
// fixtures/testMeshGenerators/. Node test, no browser.
//
// The ostream forms the test writes (testMeshGenerators.cpp:44-59) are
// reproduced here: PxOsdMeshTopology's operator<< is ToString(); a float
// prints as its shortest round-trip decimal (TfStreamFloat /
// Gf_OstreamHelperP), and VtArray<GfVec3f> as "[(x, y, z), ...]".
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import { GeomUtilCapsuleMeshGenerator } from '../../src/capsuleMeshGenerator.ts'
import { GeomUtilConeMeshGenerator } from '../../src/coneMeshGenerator.ts'
import { GeomUtilCuboidMeshGenerator } from '../../src/cuboidMeshGenerator.ts'
import { GeomUtilCylinderMeshGenerator } from '../../src/cylinderMeshGenerator.ts'
import { GeomUtilDiskMeshGenerator } from '../../src/diskMeshGenerator.ts'
import { GeomUtilPointIter } from '../../src/meshGeneratorBase.ts'
import { GeomUtilPlaneMeshGenerator } from '../../src/planeMeshGenerator.ts'
import { GeomUtilSphereMeshGenerator } from '../../src/sphereMeshGenerator.ts'

/** A float (already representable in binary32) as its shortest round-trip
 *  decimal, the way TfStreamFloat writes it. */
function _Float(value: number): string {
  if (value === 0) return '0'
  for (let precision = 1; precision <= 9; ++precision) {
    const text = value.toPrecision(precision)
    if (Math.fround(Number(text)) === value) return String(Number(text))
  }
  return String(value)
}

function _Vec3fArray(values: readonly GfVec3f[]): string {
  return `[${values.map(v => `(${_Float(v.get(0))}, ${_Float(v.get(1))}, ${_Float(v.get(2))})`).join(', ')}]`
}

class _Out {
  text = ''
  write(...parts: (string | number)[]): this {
    for (const part of parts) this.text += typeof part === 'number' ? _Float(Math.fround(part)) : part
    return this
  }
}

/** testMeshGenerators.cpp:31-36 */
function _LogHeader(msg: string, out: _Out): void {
  out.write(msg, '\n')
  out.write('-'.repeat(msg.length), '\n')
}

/** testMeshGenerators.cpp:38-42 */
function _LogFooter(out: _Out): void {
  out.write('\n', '\n')
}

/** testMeshGenerators.cpp:44-59 */
function _Log(topology: PxOsdMeshTopology, points: readonly GfVec3f[],
  normals: readonly GfVec3f[], out: _Out): void {
  out.write('Topology:\n')
  out.write('  ', topology.ToString(), '\n', '\n')

  out.write('Points:\n')
  out.write('  ', _Vec3fArray(points), '\n', '\n')

  out.write('Normals:\n')
  out.write('  ', _Vec3fArray(normals), '\n', '\n')
}

/** VtVec3fArray points(numPoints) */
function _Vec3fArrayOfSize(size: number): GfVec3f[] {
  return Array.from({ length: size }, () => new GfVec3f(0, 0, 0))
}

/** testMeshGenerators.cpp:63-397 */
function TestTopologyAndPointGeneration(sweep: number, out: _Out): boolean {
  const closedSweep =
    Math.abs(Math.cos(sweep * (Math.PI / 180.0)) - 1.0) < 1e-4
  {
    _LogHeader('1. Capsule', out)

    const MeshGen = GeomUtilCapsuleMeshGenerator

    const numRadial = 10, numCapAxial = 4
    const radius = 0.5, height = 2

    out.write('radius = ', radius, ', height = ', height, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, numCapAxial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, numCapAxial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, numCapAxial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    if (closedSweep) {
      MeshGen.generatePoints(
        GeomUtilPointIter.Vec3f(points), numRadial, numCapAxial, radius, height)
      MeshGen.generateNormals(
        GeomUtilPointIter.Vec3f(normals), numRadial, numCapAxial, radius, height)
    } else {
      MeshGen.generatePoints(
        GeomUtilPointIter.Vec3f(points), numRadial, numCapAxial,
        /* bottomRadius =    */ radius,
        /* topRadius    =    */ radius,
        height,
        sweep)
      MeshGen.generateNormals(
        GeomUtilPointIter.Vec3f(normals), numRadial, numCapAxial,
        /* bottomRadius =    */ radius,
        /* topRadius    =    */ radius,
        height,
        sweep)
    }

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('2. Cone', out)

    const MeshGen = GeomUtilConeMeshGenerator

    const numRadial = 10
    const radius = 0.5, height = 2

    out.write('radius = ', radius, ', height = ', height, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(
      GeomUtilPointIter.Vec3f(points), numRadial, radius, height, sweep)

    MeshGen.generateNormals(
      GeomUtilPointIter.Vec3f(normals), numRadial, radius, height, sweep)

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('3. Cube', out)

    const MeshGen = GeomUtilCuboidMeshGenerator

    const side = 1.0

    out.write('side = ', side, '\n', '\n')

    const topology = MeshGen.generateTopology()

    const numPoints = MeshGen.computeNumPoints()
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals()
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(GeomUtilPointIter.Vec3f(points), side, side, side)

    MeshGen.generateNormals(GeomUtilPointIter.Vec3f(normals))

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('4. Cylinder', out)

    const MeshGen = GeomUtilCylinderMeshGenerator

    const numRadial = 10
    const radius = 0.5, height = 2

    out.write('radius = ', radius, ', height = ', height, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    if (closedSweep) {
      MeshGen.generatePoints(
        GeomUtilPointIter.Vec3f(points), numRadial, radius, height)

      MeshGen.generateNormals(
        GeomUtilPointIter.Vec3f(normals), numRadial, radius, height)
    } else {
      MeshGen.generatePoints(
        GeomUtilPointIter.Vec3f(points), numRadial,
        /* bottomRadius = */ radius,
        /* topRadius =    */ radius,
        height, sweep)

      MeshGen.generateNormals(
        GeomUtilPointIter.Vec3f(normals), numRadial,
        /* bottomRadius = */ radius,
        /* topRadius =    */ radius,
        height, sweep)
    }

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('5. Sphere', out)

    const MeshGen = GeomUtilSphereMeshGenerator

    const numRadial = 10, numAxial = 10
    const radius = 0.5

    out.write('radius = ', radius, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, numAxial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, numAxial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, numAxial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(
      GeomUtilPointIter.Vec3f(points), numRadial, numAxial, radius, sweep)

    MeshGen.generateNormals(
      GeomUtilPointIter.Vec3f(normals), numRadial, numAxial, sweep)

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('6. Plane', out)

    const MeshGen = GeomUtilPlaneMeshGenerator

    const width = 4.0
    const length = 3.0

    out.write('width = ', width, '\n', '\n')
    out.write('length = ', length, '\n', '\n')

    const topology = MeshGen.generateTopology()

    const numPoints = MeshGen.computeNumPoints()
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals()
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(GeomUtilPointIter.Vec3f(points), width, length)

    MeshGen.generateNormals(GeomUtilPointIter.Vec3f(normals))

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('7. Tapered Capsule', out)

    const MeshGen = GeomUtilCapsuleMeshGenerator

    const numRadial = 10, numCapAxial = 4
    const bottomRadius = 0.5, topRadius = 0.3, height = 2

    out.write('bottomRadius = ', bottomRadius, ', topRadius = ', topRadius,
      ', height = ', height, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, numCapAxial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, numCapAxial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, numCapAxial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(
      GeomUtilPointIter.Vec3f(points), numRadial, numCapAxial,
      bottomRadius, topRadius, height, sweep)

    MeshGen.generateNormals(
      GeomUtilPointIter.Vec3f(normals), numRadial, numCapAxial,
      bottomRadius, topRadius, height, sweep)

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('8. Tapered Cylinder', out)

    const MeshGen = GeomUtilCylinderMeshGenerator

    const numRadial = 10
    const bottomRadius = 0.5, topRadius = 0.3, height = 2

    out.write('bottomRadius = ', bottomRadius, ', topRadius = ', topRadius,
      ', height = ', height, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals(numRadial, closedSweep)
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(
      GeomUtilPointIter.Vec3f(points), numRadial,
      bottomRadius, topRadius, height, sweep)

    MeshGen.generateNormals(
      GeomUtilPointIter.Vec3f(normals), numRadial,
      bottomRadius, topRadius, height, sweep)

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  {
    _LogHeader('9. Disk', out)

    const MeshGen = GeomUtilDiskMeshGenerator

    const numRadial = 10
    const radius = 0.5

    out.write('radius = ', radius, ', sweep = ', sweep, '\n', '\n')

    const topology = MeshGen.generateTopology(numRadial, closedSweep)

    const numPoints = MeshGen.computeNumPoints(numRadial, closedSweep)
    const points = _Vec3fArrayOfSize(numPoints)

    const numNormals = MeshGen.computeNumNormals()
    const normals = _Vec3fArrayOfSize(numNormals)

    MeshGen.generatePoints(
      GeomUtilPointIter.Vec3f(points), numRadial, radius, sweep)

    MeshGen.generateNormals(
      GeomUtilPointIter.Vec3f(normals))

    _Log(topology, points, normals, out)

    _LogFooter(out)
  }

  return true
}

function _Baseline(name: string): string {
  return readFileSync(new URL(`./fixtures/testMeshGenerators/${name}`, import.meta.url), 'utf8')
}

/** One section of the output, for a readable diff on failure. */
function _Sections(text: string): string[] {
  return text.split(/\n\n\n(?=\d\. )/)
}

describe('testMeshGenerators (testMeshGenerators.cpp:399-422)', () => {
  for (const [sweep, file] of [[360, 'generatedMeshes_closed.txt'], [120, 'generatedMeshes_open.txt']] as const) {
    it(`sweep = ${sweep} matches baseline/${file}`, () => {
      const out = new _Out()
      expect(TestTopologyAndPointGeneration(sweep, out)).toBe(true)
      expect(_Sections(out.text)).toEqual(_Sections(_Baseline(file)))
    })
  }
})
