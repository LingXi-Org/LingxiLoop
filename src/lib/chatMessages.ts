export function hasBroadcastMention(value: string): boolean {
  return /(^|[^A-Za-z0-9_@])@(all|everyone)(?![\p{L}\p{N}_-])/iu.test(value.normalize('NFKC'))
}

/** Hide a durable Agent OS reply while its matching presentation stream is
 * still open. Once stream.close removes the run id, the final row appears. */
export function withoutFinalizedActiveRuns<T extends { runId?: string }>(
  messages: T[],
  activeRunIds: ReadonlySet<string>,
): T[] {
  if (activeRunIds.size === 0) return messages
  return messages.filter((message) => !message.runId || !activeRunIds.has(message.runId))
}
