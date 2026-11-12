// Ported from OpenUSD 26.11.1: pxr/base/tf/notice.cpp, pxr/base/tf/notice.h,
//  pxr/base/tf/noticeRegistry.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfNotice's synchronous publish/subscribe surface, ported from OpenUSD v26.08
// pxr/base/tf/notice.h:32-912, notice.cpp and noticeRegistry.cpp.

type Constructor<T> = abstract new (...args: never[]) => T
type Callback<T extends TfNotice> = (notice: T, sender: object | undefined) => void
export interface TfNoticeProbe {
  beginSend?(notice: TfNotice, sender: object | undefined): void
  endSend?(): void
  beginDelivery?(notice: TfNotice, sender: object | undefined): void
  endDelivery?(): void
}

// TfNotice::_DelivererBase. Upstream's deliverer holds its sender through a
// TfWeakPtr (notice.h:736, 779, 819); here the sender is only the key of the
// per-sender table below, so the deliverer does not reference it.
interface Deliverer {
  readonly callback: Callback<TfNotice>
  active: boolean
}

// Tf_NoticeRegistry::_DelivererContainer: the listeners for one notice type,
// per sender and global, newest first (_Prepend). The per-sender table is
// keyed by the sender's TfWeakBase* (noticeRegistry.h:123-128), so it does not
// keep senders alive; a WeakMap gives the same lifetime: listeners registered
// for a sender are dropped with it.
interface DelivererContainer {
  readonly bySender: WeakMap<object, Deliverer[]>
  readonly global: Deliverer[]
}

const containers = new Map<Function, DelivererContainer>()
const probes = new Set<TfNoticeProbe>()
let blockCount = 0

export class TfNoticeKey {
  #revoked = false
  readonly #revoke: () => void
  constructor(revoke: () => void) { this.#revoke = revoke }
  revoke(): void {
    if (!this.#revoked) this.#revoke()
    this.#revoked = true
  }
  isValid(): boolean { return !this.#revoked }
}

function deliver(
  notice: TfNotice, sender: object | undefined, list: readonly Deliverer[] | undefined,
): number {
  if (!list || list.length === 0) return 0
  let count = 0
  // Listeners registered during delivery are not delivered to; revoked ones
  // are deactivated (Tf_NoticeRegistry::_Deliver).
  for (const deliverer of [...list]) {
    if (!deliverer.active) continue
    for (const probe of probes) probe.beginDelivery?.(notice, sender)
    deliverer.callback(notice, sender)
    for (const probe of probes) probe.endDelivery?.()
    count++
  }
  return count
}

export class TfNotice {
  static insertProbe(probe: TfNoticeProbe): void { probes.add(probe) }
  static removeProbe(probe: TfNoticeProbe): void { probes.delete(probe) }

  // Tf_NoticeRegistry::_Register.
  static Register<T extends TfNotice>(
    type: Constructor<T>,
    callback: Callback<T>,
    sender?: object,
  ): TfNoticeKey {
    let container = containers.get(type)
    if (!container) containers.set(type, container = { bySender: new WeakMap(), global: [] })
    const deliverer: Deliverer = { callback: callback as Callback<TfNotice>, active: true }
    let list: Deliverer[]
    if (sender === undefined) {
      list = container.global
    } else {
      list = container.bySender.get(sender) ?? []
      container.bySender.set(sender, list)
    }
    list.unshift(deliverer)
    const owner = container
    // TfNotice::Key holds the deliverer weakly and never the sender
    // (notice.h:243-266), so a key kept by a listener does not keep the
    // sender alive either.
    const senderRef = sender === undefined ? undefined : new WeakRef(sender)
    return new TfNoticeKey(() => {
      deliverer.active = false
      const index = list.indexOf(deliverer)
      if (index >= 0) list.splice(index, 1)
      const liveSender = senderRef?.deref()
      if (liveSender !== undefined && list.length === 0 && owner.bySender.get(liveSender) === list) {
        owner.bySender.delete(liveSender)
      }
    })
  }

  // The Python Tf.Notice.RegisterGlobally spelling.
  static registerGlobally<T extends TfNotice>(
    type: Constructor<T>, callback: Callback<T>,
  ): TfNoticeKey {
    return TfNotice.Register(type, callback)
  }

  // Tf_NoticeRegistry::_Send: walk up the notice's base types, delivering to
  // per-sender listeners and then to global listeners of each.
  send(sender?: object): number {
    if (blockCount > 0) return 0
    let count = 0
    for (const probe of probes) probe.beginSend?.(this, sender)
    try {
      let proto: object | null = Object.getPrototypeOf(this)
      while (proto && proto !== Object.prototype) {
        const container = containers.get((proto as { constructor: Function }).constructor)
        if (container) {
          if (sender !== undefined) count += deliver(this, sender, container.bySender.get(sender))
          count += deliver(this, sender, container.global)
        }
        if (proto === TfNotice.prototype) break
        proto = Object.getPrototypeOf(proto)
      }
    } finally {
      for (const probe of probes) probe.endSend?.()
    }
    return count
  }

  sendGlobally(): number { return this.send() }
  getNoticeType(): Function { return this.constructor }
  static revoke(key: TfNoticeKey): void { key.revoke() }
}

// TfNotice::Block: blocks all notice delivery while open.
export class TfNoticeBlock {
  #open = true
  constructor() { blockCount++ }
  close(): void {
    if (!this.#open) return
    this.#open = false
    blockCount--
  }
}
