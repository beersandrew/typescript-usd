// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hd/renderIndex.cpp, pxr/imaging/hd/engine.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  ChangeTracker as HdChangeTracker,
  CollectionSchema as HdCollectionSchema,
  CollectionsSchema as HdCollectionsSchema,
  Engine as HdEngine,
  Format as HdFormat,
  ParsedAovToken as HdParsedAovToken,
  RenderBufferDescriptor as HdRenderBufferDescriptor,
  RenderBufferSchema as HdRenderBufferSchema,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RenderPassState as HdRenderPassState,
  RenderIndex as HdRenderIndex,
  RenderSettingsSchema as HdRenderSettingsSchema,
  RenderVarSchema as HdRenderVarSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  Selection as HdSelection,
  SelectionHighlightMode as HdSelectionHighlightMode,
  SelectionsSchema as HdSelectionsSchema,
  Task as HdTask,
  TaskContext as HdTaskContext,
  DirtyBits as HdDirtyBits,
} from '../../src/index.ts'
import type { HdRenderDelegate } from '../../src/renderDelegate.ts'

class RecordingTask extends HdTask {
  constructor(id: string, private readonly calls: string[]) { super(id) }
  sync(_delegate: unknown, _context: HdTaskContext, _bits: HdDirtyBits): void {
    this.calls.push('sync')
  }
  Prepare(): void { this.calls.push('prepare') }
  Execute(): void { this.calls.push('execute') }
}
describe('Phase 28 renderer-neutral Hd breadth', () => {
  it('owns AOV descriptors, semantics and token parsing', () => {
    const descriptor = new HdRenderBufferDescriptor(
      [1920, 1080, 1], HdFormat.HdFormatFloat16Vec4, true)
    expect(descriptor.Equals(new HdRenderBufferDescriptor(
      [1920, 1080, 1], HdFormat.HdFormatFloat16Vec4, true))).toBe(true)
    expect(HdAovHasDepthSemantic('cameraDepth')).toBe(true)
    expect(HdAovHasDepthStencilSemantic('mainDepthStencil')).toBe(true)
    expect(new HdParsedAovToken('primvars:displayColor')).toMatchObject({
      name: 'displayColor', isPrimvar: true, isLpe: false, isShader: false,
    })
    expect(new HdRenderPassAovBinding().renderBuffer).toBeUndefined()
  })

  it('owns selection population and merge semantics', () => {
    const selected = new HdSelection()
    selected.addRprim(HdSelectionHighlightMode.HighlightModeSelect, '/Mesh')
    selected.addPoints(
      HdSelectionHighlightMode.HighlightModeSelect, '/Mesh', [1, 3], [1, 0, 0, 1])
    const located = new HdSelection()
    located.addInstance(HdSelectionHighlightMode.HighlightModeLocate, '/Mesh', [7])
    const merged = HdSelection.merge(selected, located)!
    expect(merged.getAllSelectedPrimPaths()).toEqual(['/Mesh', '/Mesh'])
    expect(merged.getPrimSelectionState(
      HdSelectionHighlightMode.HighlightModeSelect, '/Mesh')?.pointIndices)
      .toEqual([[1, 3]])
  })

  it('owns collection, render-buffer, render-var and render-settings schema locations', () => {
    expect(HdCollectionSchema.getDefaultLocator().GetString()).toBe('collection')
    expect(HdCollectionsSchema.getDefaultLocator().GetString()).toBe('collections')
    expect(HdRenderBufferSchema.getFormatLocator().GetString()).toBe('renderBuffer/format')
    expect(HdRenderVarSchema.getNamespacedSettingsLocator().GetString())
      .toBe('renderVar/namespacedSettings')
    expect(HdRenderSettingsSchema.getCameraLocator().GetString())
      .toBe('renderSettings/camera')
    expect(HdSelectionsSchema.getDefaultLocator().GetString()).toBe('selections')
  })

  it('keeps render-pass state defaults and task dirty bits at upstream values', () => {
    const state = new HdRenderPassState()
    expect([0, 1, 2, 3].map(i => state.getViewport().get(i))).toEqual([0, 0, 1, 1])
    expect(state.getPointSize()).toBe(3)
    expect(state.getAlphaThreshold()).toBe(0.5)
    expect(HdChangeTracker.DirtyParams).toBe(1 << 2)
    expect(HdChangeTracker.DirtyCollection).toBe(1 << 3)
    expect(HdChangeTracker.DirtyRenderTags).toBe(1 << 4)
    expect(new HdEngine().getTaskContextData('missing')).toBeUndefined()
  })

  it('owns render-index task lifecycle and the sync/prepare/commit/execute order', () => {
    const calls: string[] = []
    const task = new RecordingTask('/task', calls)
    // HdRenderIndex::New builds scene index emulation (renderIndex.cpp:148-252),
    // which asks the delegate for its supported prim types.
    const index = HdRenderIndex.new({ getSupportedRprimTypes: () => [], getSupportedSprimTypes: () => [],
      getSupportedBprimTypes: () => [], setTerminalSceneIndex() {} } as unknown as HdRenderDelegate)
    index.insertTask(task, { sceneDelegate: true })
    expect(index.getTask('/task')).toBe(task)
    index.syncTasks([task], new Map())
    expect(calls).toEqual(['sync'])
    index.removeTask('/task')
    expect(index.getTask('/task')).toBeUndefined()

    const engineIndex = {
      getTask: () => task,
      getDrivers: () => [],
      // engine.cpp:97 SyncAll(tasks, taskContext): the render index syncs the
      // tasks before the rprims (renderIndex.cpp:1712-1790).
      SyncAll: (tasks: HdTask[], context: HdTaskContext) => {
        tasks.forEach(value => value.sync(undefined, context, value.getInitialDirtyBitsMask()))
        calls.push('rprim-sync')
      },
      CommitResources: () => calls.push('commit'),
    } as unknown as HdRenderIndex
    calls.length = 0
    new HdEngine().Execute(engineIndex, [task])
    expect(calls).toEqual(['sync', 'rprim-sync', 'prepare', 'commit', 'execute'])
  })

  it('retrieves retained schema members without changing their identity', () => {
    const format = HdRetainedTypedSampledDataSource.new(HdFormat.HdFormatFloat32Vec4)
    const buffer = HdRenderBufferSchema.buildRetained(undefined, format)
    const parent = HdRetainedContainerDataSource.new(['renderBuffer'], [buffer])
    expect(HdRenderBufferSchema.getFromParent(parent).GetFormat()?.getTypedValue(0))
      .toBe(HdFormat.HdFormatFloat32Vec4)
  })
})
