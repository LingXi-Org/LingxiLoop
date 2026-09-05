export function hasBroadcastMention(value: string): boolean {
  return /(^|[^A-Za-z0-9_@])@all(?![\p{L}\p{N}_-])/iu.test(value.normalize('NFKC'))
}
