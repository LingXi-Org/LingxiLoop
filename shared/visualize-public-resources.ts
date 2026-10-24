/** Fixed renderer assets only; authored documents, state and capabilities are private. */
export const VISUALIZE_PUBLIC_RESOURCES = [
  'visualize.css', 'visualize.html', 'gen-ui.js', 'calendar.js',
  'vendor/d3-7.9.0.min.js', 'vendor/floating-ui-core-1.7.3.min.js',
  'vendor/floating-ui-dom-1.7.4.min.js', 'vendor/lucide-1.17.0.js',
] as const
const publicNames = new Set<string>(VISUALIZE_PUBLIC_RESOURCES)
export function isVisualizePublicResource(name: string): boolean { return publicNames.has(name) }
