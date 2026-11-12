/** Time-based one-turn animation. Every sampled angle must actually draw. */
export function animateOrbit(drawAngle: (radians: number) => void, signal: AbortSignal, duration = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0, start: number | undefined, finished = false
    const finish = (error?: unknown) => {
      if (finished) return
      finished = true
      cancelAnimationFrame(frame)
      signal.removeEventListener('abort', abort)
      if (error !== undefined) reject(error)
      else resolve()
    }
    const abort = () => finish(signal.reason ?? new DOMException('Orbit cancelled', 'AbortError'))
    const step = (time: number) => {
      if (signal.aborted) { abort(); return }
      start ??= time
      const progress = Math.min((time - start) / duration, 1)
      try { drawAngle(progress * Math.PI * 2) } catch (error) { finish(error); return }
      if (progress >= 1) finish()
      else frame = requestAnimationFrame(step)
    }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    frame = requestAnimationFrame(step)
  })
}
