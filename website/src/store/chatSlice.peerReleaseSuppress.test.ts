import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'

/* #19958: removing an ADOPTED remote-crew row (a local slot bound to a session a
 * peer owns) must not let that session RE-SURFACE in the merged sidebar while
 * the peer's listing is still stale. The close drops only the local binding, so
 * the peer still lists the session; we suppress its row by the identity the peer
 * row shares (`row_identity` = `<instance_id>:<peer_key>`) until the peer's next
 * list no longer carries it, then forget the entry so nothing is hidden forever.
 *
 * This is the behaviour-level pin for that fix. It fails on origin/main (no
 * `peerReleaseSuppressed`, no suppress/clear reducers, and `deleteSlot` records
 * nothing on an adopted close); it passes with the fix. The merged-list FILTER
 * and the peer-refresh CLEAR driver live in sessionSources; this proves the two
 * ends the sidebar reads: the entry is written on an adopted close and dropped
 * on demand, and an ordinary local close writes nothing. */

vi.mock('../lib/scrollQuiet', () => ({ whenScrollQuiet: () => Promise.resolve() }))
vi.mock('../api/client', () => ({
  api: {
    deleteChatSlot: vi.fn(() => Promise.resolve({ ok: true })),
    chatSlotDetail: vi.fn(() => Promise.resolve({ messages: [], has_more: false, total: 0, next_before: 0, running: false })),
  },
}))

import dashboardReducer, { addSlotOptimistic } from './dashboardSlice'
import chatReducer, { deleteSlot, clearPeerReleaseSuppression } from './chatSlice'

const makeStore = () => configureStore({
  reducer: { chat: chatReducer, dashboard: dashboardReducer },
  middleware: g => g({ serializableCheck: false, immutableCheck: false }),
})

const ADOPTED_ID = 'nobita:peer-key-42'

describe('#19958 adopted remote-crew removal suppresses the re-surfacing peer row', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('records the peer-row identity on a confirmed close of an adopted (executor=remote) row', async () => {
    const store = makeStore()
    // An adopted row: a LOCAL slot whose turns run on crew "nobita"; its
    // row_identity is the identity the peer row carries.
    store.dispatch(addSlotOptimistic({
      key: 'adopted', title: 'adopted', messages: 0, running: false,
      executor: 'remote', instance_id: 'nobita', row_identity: ADOPTED_ID,
    }))
    expect(store.getState().chat.peerReleaseSuppressed).toEqual([])

    await store.dispatch(deleteSlot('adopted'))
    // The peer still lists the session, so the identity is suppressed to stop it
    // re-surfacing in the merged list until the peer drops it.
    expect(store.getState().chat.peerReleaseSuppressed).toEqual([ADOPTED_ID])
  })

  it('forgets the suppression once the peer no longer lists it (clear), so nothing is hidden forever', async () => {
    const store = makeStore()
    store.dispatch(addSlotOptimistic({
      key: 'adopted', title: 'adopted', messages: 0, running: false,
      executor: 'remote', instance_id: 'nobita', row_identity: ADOPTED_ID,
    }))
    await store.dispatch(deleteSlot('adopted'))
    expect(store.getState().chat.peerReleaseSuppressed).toEqual([ADOPTED_ID])

    // The peer's next list no longer carries it (the session really ended there).
    store.dispatch(clearPeerReleaseSuppression([ADOPTED_ID]))
    expect(store.getState().chat.peerReleaseSuppressed).toEqual([])
  })

  it('suppresses nothing when an ORDINARY local row is closed', async () => {
    const store = makeStore()
    store.dispatch(addSlotOptimistic({ key: 'local', title: 'local', messages: 0, running: false }))
    await store.dispatch(deleteSlot('local'))
    expect(store.getState().chat.peerReleaseSuppressed).toEqual([])
  })
})
