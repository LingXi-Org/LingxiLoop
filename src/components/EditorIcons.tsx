import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base: P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

export const IBold = (p: P) => (
  <svg {...base} {...p}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>
)
export const IItalic = (p: P) => (
  <svg {...base} {...p}><path d="M14 4h-4M14 20H6M15 4l-6 16"/></svg>
)
export const IStrike = (p: P) => (
  <svg {...base} {...p}><path d="M4 12h16M16 6c-1-2-3-2.5-5-2.5-3 0-5 1.5-5 4 0 1.8 1.5 2.5 3.5 3M8.5 17c1 1.6 3 2.5 5 2.5 3 0 5-1.5 5-4 0-2-1.5-3-3.5-3.5"/></svg>
)
export const IH1 = (p: P) => (
  <svg {...base} {...p}><path d="M4 6v12M12 6v12M4 12h8M16 9l3-2v11"/></svg>
)
export const IH2 = (p: P) => (
  <svg {...base} {...p}><path d="M4 6v12M11 6v12M4 12h7M15 9.5c0-1.4 1-2.5 2.5-2.5S20 8 20 9.5 18 12 17 13l-2.5 2.5h5.5"/></svg>
)
export const IH3 = (p: P) => (
  <svg {...base} {...p}><path d="M4 6v12M11 6v12M4 12h7M15 8c.5-1 1.5-1.5 2.5-1.5S20 7.5 20 9c0 1.2-1 2-2.5 2 1.5 0 2.5.8 2.5 2.2 0 1.5-1.2 2.3-2.5 2.3s-2.2-.5-2.5-1.5"/></svg>
)
export const IList = (p: P) => (
  <svg {...base} {...p}><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>
)
export const IListOrdered = (p: P) => (
  <svg {...base} {...p}><path d="M10 6h11M10 12h11M10 18h11M4 5v3M3 5h2M4 11h2c0 1-2 1.5-2 2.5V14h2M3 17h2v1H4v1h1v1H3"/></svg>
)
export const IQuote = (p: P) => (
  <svg {...base} {...p}><path d="M7 7c-2 1-3 3-3 5v5h5v-5H5M17 7c-2 1-3 3-3 5v5h5v-5h-4"/></svg>
)
export const ICode = (p: P) => (
  <svg {...base} {...p}><path d="M8 6L2 12l6 6M16 6l6 6-6 6M14 4l-4 16"/></svg>
)
export const ICodeBlock = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 9l-2 3 2 3M15 9l2 3-2 3M13 8l-2 8"/></svg>
)
export const ILink = (p: P) => (
  <svg {...base} {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66L11 7"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66L13 17"/></svg>
)
export const IImage = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.4"/><path d="M21 15l-4.5-4.5L8 19"/></svg>
)
export const IUndo = (p: P) => (
  <svg {...base} {...p}><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>
)
export const IRedo = (p: P) => (
  <svg {...base} {...p}><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/></svg>
)
