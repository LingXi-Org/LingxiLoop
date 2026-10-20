import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

type BlockPosition = readonly [offset: number, index: number]
type Summary = { owner: object; words: number; position: BlockPosition }

/** Only capped word counts cross block boundaries; completed ASTs stay cached. */
function createTail() {
  const blocks = new Map<string, Summary>()
  const listeners = new Map<string, Set<() => void>>()
  const order: string[] = []
  let positions = new Map<string, number>()
  const publish = () => {
    const next = new Map<string, number>()
    let trailing = 0
    for (let i = order.length - 1; i >= 0 && trailing < 2; i--) {
      const key = order[i]
      // Bit 2 owns the single caret; low bits count words in later blocks.
      next.set(key, trailing + (i === order.length - 1 ? 4 : 0))
      trailing = Math.min(2, trailing + blocks.get(key)!.words)
    }
    const previous = positions
    positions = next
    for (const key of new Set([...previous.keys(), ...next.keys()])) {
      if ((previous.get(key) ?? 2) !== (next.get(key) ?? 2)) {
        for (const listener of listeners.get(key) ?? []) listener()
      }
    }
  }
  return {
    snapshot: (key: string) => positions.get(key) ?? 2,
    subscribe(key: string, listener: () => void) {
      const set = listeners.get(key) ?? new Set()
      listeners.set(key, set)
      set.add(listener)
      return () => { set.delete(listener); if (!set.size) listeners.delete(key) }
    },
    register(key: string, position: BlockPosition, words: number) {
      const owner = {}
      if (!blocks.has(key)) {
        const index = order.findIndex(item => {
          const other = blocks.get(item)!.position
          return other[0] > position[0] || other[0] === position[0] && other[1] > position[1]
        })
        order.splice(index < 0 ? order.length : index, 0, key)
      }
      blocks.set(key, { owner, words, position })
      publish()
      return () => {
        if (blocks.get(key)?.owner !== owner) return
        blocks.delete(key)
        order.splice(order.indexOf(key), 1)
        publish()
      }
    },
  }
}

const PartTail = createContext<{ tail: ReturnType<typeof createTail>; offset: number } | null>(null)

/** Nested Markdown slices share their original text-part's window. */
export function StreamingPart({ children, offset = 0 }: { children: ReactNode; offset?: number }) {
  const parent = useContext(PartTail)
  const [own] = useState(createTail)
  const tail = parent?.tail ?? own
  const value = useMemo(() => ({ tail, offset }), [tail, offset])
  return <PartTail.Provider value={value}>{children}</PartTail.Provider>
}

export const StreamingBlock = createContext({
  streaming: false, animate: false, after: 2, isTail: false,
  register: (_words: number): (() => void) => () => {},
})

export function useStreamingBlock(index: number, streaming: boolean, animate: boolean) {
  const part = useContext(PartTail)
  if (!part) throw new Error('Streaming block requires a text-part owner')
  const { tail, offset } = part
  const key = `${offset}:${index}`
  const binding = useMemo(() => ({
    subscribe: (listener: () => void) => tail.subscribe(key, listener),
    snapshot: () => tail.snapshot(key),
    register: (words: number) => tail.register(key, [offset, index], words),
  }), [tail, key, offset, index])
  const position = useSyncExternalStore(binding.subscribe, binding.snapshot, binding.snapshot)
  return useMemo(() => ({ streaming, animate, register: binding.register,
    after: position & 3, isTail: Boolean(position & 4) }), [streaming, animate, binding, position])
}
