// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/hgi.h,
//  pxr/imaging/hgiVulkan/garbageCollector.cpp,
//  pxr/imaging/hgiVulkan/garbageCollector.h, pxr/imaging/hgiVulkan/hgi.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUGarbageCollector. Modelled on
// pxr/imaging/hgiVulkan/garbageCollector.{h,cpp}: Destroy* calls trash the
// object (hgiVulkan/hgi.h:149-162 TrashObject), and the object is destroyed
// once no command work that may use it is in flight
// (garbageCollector.cpp:44-70 _EmptyTrash, :138- PerformGarbageCollection).
//
// hgiVulkan tags a trashed object with the in-flight bits of every command
// buffer in use at that moment, recording or submitted
// (HgiVulkanCommandQueue::GetInflightCommandBuffersBits), and destroys it
// when none of them is still in flight. WebGPU exposes neither command
// buffer completion per buffer nor in-use bits, so the WebGPU counterpart
// is:
// - the "in-flight bits" of a trashed object are the HgiCmds objects created
//   and not yet submitted when it was trashed (each records its own
//   GPUCommandEncoder, which may already reference the object);
// - once all of those are submitted, the object waits for
//   GPUQueue.onSubmittedWorkDone(), which resolves when every submission so
//   far has completed, and is then destroyed.
// hgiMetal can delete at once (hgiMetal/hgi.h:208-212 _TrashObject) because
// Metal command buffers retain the resources they use; WebGPU's destroy()
// invalidates the object for already recorded commands, so HgiWebGPU follows
// hgiVulkan.

import type { HgiCmds } from 'typescript-usd/hgi'

/** An HgiWebGPU object whose GPU resources _Destroy releases. */
export interface HgiWebGPUTrashable {
  _destroy(): void
}

interface _TrashedObject {
  object: HgiWebGPUTrashable
  /** Cmds that were recording when the object was trashed. */
  waitFor: Set<HgiCmds>
}

export class HgiWebGPUGarbageCollector {
  /** Cmds created and not yet submitted (hgiVulkan's in-use command buffers). */
  private readonly _recordingCmds = new Set<HgiCmds>()
  /** Objects waiting for recording cmds to be submitted. */
  private _trash: _TrashedObject[] = []
  private _pendingCompletions = 0

  constructor(private readonly _queue: GPUQueue) {}

  /** A cmds object started recording (HgiWebGPU::Create*Cmds). */
  cmdsCreated(cmds: HgiCmds): void {
    this._recordingCmds.add(cmds)
  }

  /** A cmds object was submitted to the queue (HgiWebGPU::_SubmitCmds). */
  cmdsSubmitted(cmds: HgiCmds): void {
    this._recordingCmds.delete(cmds)
    const ready: HgiWebGPUTrashable[] = []
    this._trash = this._trash.filter((t) => {
      t.waitFor.delete(cmds)
      if (t.waitFor.size > 0) return true
      ready.push(t.object)
      return false
    })
    this._destroyAfterSubmittedWork(ready)
  }

  /** hgiVulkan/hgi.h:149-162 (TrashObject). */
  trashObject(object: HgiWebGPUTrashable | null): void {
    if (!object) return
    if (this._recordingCmds.size > 0) {
      this._trash.push({ object, waitFor: new Set(this._recordingCmds) })
    } else {
      this._destroyAfterSubmittedWork([object])
    }
  }

  /** Objects trashed and not yet destroyed. */
  getPendingCount(): number {
    return this._trash.length + this._pendingCompletions
  }

  /** Destroy everything now (HgiWebGPU::_Destroy; the device is going away,
   *  as hgiVulkan/hgi.cpp:57-66 collects all garbage before destroying it). */
  destroyAll(): void {
    for (const t of this._trash) t.object._destroy()
    this._trash = []
    this._recordingCmds.clear()
  }

  /** garbageCollector.cpp:44-70: destroy once the work submitted so far,
   *  which includes every submission that may use the objects, completes. */
  private _destroyAfterSubmittedWork(objects: HgiWebGPUTrashable[]): void {
    if (objects.length === 0) return
    this._pendingCompletions += objects.length
    const destroy = () => {
      this._pendingCompletions -= objects.length
      for (const o of objects) o._destroy()
    }
    // A lost device rejects; its objects are invalid either way.
    void this._queue.onSubmittedWorkDone().then(destroy, destroy)
  }
}
