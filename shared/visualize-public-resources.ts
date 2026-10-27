/** Fixed renderer assets only; authored documents, state and capabilities are private. */
export const VISUALIZE_PUBLIC_RESOURCES = [
  'visualize.css', 'visualize.html', 'gen-ui.js', 'calendar.js',
  'kit-tooltip.js', 'kit-carousel.js', 'kit-tabs.js', 'kit-icons.js', 'kit.css', 'capture.js',
  'vendor/d3-7.9.0.min.js', 'vendor/floating-ui-core-1.7.3.min.js',
  'vendor/floating-ui-dom-1.7.4.min.js', 'vendor/lucide-1.17.0.js',
] as const
const publicNames = new Set<string>(VISUALIZE_PUBLIC_RESOURCES)
export function isVisualizePublicResource(name: string): boolean { return publicNames.has(name) }

/** These names resolve only to immutable, repository-owned bytes. */
export function visualizeResourceFile(name: string): string | undefined {
  if (!isVisualizePublicResource(name)) return undefined
  return ['gen-ui.js', 'kit-tooltip.js', 'kit-carousel.js', 'kit-tabs.js', 'kit-icons.js', 'kit.css', 'capture.js'].includes(name)
    ? `server/assets/visualize-runtime/${name}`
    : `third_party/zcode/skills/visualize/assets/${name}`
}
export function visualizeResourceUrl(name: string, digest: unknown): string | undefined {
  if (!isVisualizePublicResource(name) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) return undefined
  return `/assets/visualize-${digest}.${name.endsWith('.js') ? 'js' : name.endsWith('.css') ? 'css' : 'txt'}`
}
export function visualizeResourceIntegrity(digest: string): string {
  return `sha256-${btoa(String.fromCharCode(...digest.match(/../g)!.map(byte => Number.parseInt(byte, 16))))}`
}

/** Current kit/generator examples and acceptance fixtures; all other names retain compatibility. */
export const VISUALIZE_SMALL_ICONS = ['chevronleft','chevronright','play','search'] as const
