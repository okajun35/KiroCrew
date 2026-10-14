import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRowAnimSettled } from './rowAnimSettle'

describe('useRowAnimSettled', () => {
  let frames: FrameRequestCallback[]
  const flushFrame = () => act(() => {
    const pending = frames
    frames = []
    for (const cb of pending) cb(performance.now())
  })

  beforeEach(() => {
    vi.useFakeTimers()
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = () => {} })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('holds while the reads that place rows are outstanding', () => {
    const { result } = renderHook(() => useRowAnimSettled(false))
    flushFrame()
    flushFrame()
    expect(result.current).toBe(false)
  })

  it('settles two frames after the reads settle, not on the same commit', () => {
    const { result, rerender } = renderHook(({ ready }) => useRowAnimSettled(ready), { initialProps: { ready: false } })
    rerender({ ready: true })
    expect(result.current).toBe(false)
    flushFrame()
    expect(result.current).toBe(false)
    flushFrame()
    expect(result.current).toBe(true)
  })

  it('stays settled when a read later goes back to unsettled (a reconnect)', () => {
    const { result, rerender } = renderHook(({ ready }) => useRowAnimSettled(ready), { initialProps: { ready: true } })
    flushFrame()
    flushFrame()
    expect(result.current).toBe(true)
    rerender({ ready: false })
    expect(result.current).toBe(true)
  })

  it('gives up holding after the cap even if a read never settles', () => {
    const { result } = renderHook(() => useRowAnimSettled(false, 500))
    act(() => { vi.advanceTimersByTime(499) })
    expect(result.current).toBe(false)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe(true)
  })
})
