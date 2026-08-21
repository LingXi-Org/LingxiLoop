import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base: IconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

export const IChat = (p: IconProps) => (
  <svg {...base} {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
)
export const IWhisper = (p: IconProps) => (
  <svg {...base} {...p}><path d="M3 12c0-4 4-8 9-8s9 4 9 8-4 8-9 8a10 10 0 01-3-.5L3 21l1.5-5A8 8 0 013 12z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>
)
export const IConvene = (p: IconProps) => (
  <svg {...base} {...p}><polygon points="5 3 19 12 5 21 5 3"/></svg>
)
export const IAgents = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
)
export const IAgent = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="10" cy="9" r="3.5"/><path d="M4.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6"/><path d="M18 4l.7 1.8 1.8.7-1.8.7L18 9l-.7-1.8-1.8-.7 1.8-.7L18 4z"/></svg>
)
export const IComputer = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
)
export const ITasks = (p: IconProps) => (
  <svg {...base} {...p}><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
)
export const IMemory = (p: IconProps) => (
  <svg {...base} {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h4M16 3h6v6"/><path d="M21 3l-5.5 5.5"/></svg>
)
export const IObserve = (p: IconProps) => (
  <svg {...base} {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20h16M7 20v-3M12 20v-2M17 20v-3"/></svg>
)
export const ISettings = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
)
export const ISearch = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
)
export const IBack = (p: IconProps) => (
  <svg {...base} {...p}><path d="M15 18l-6-6 6-6"/></svg>
)
export const IPlus = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>
)
export const ISend = (p: IconProps) => (
  <svg {...base} {...p} strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
)
export const IClip = (p: IconProps) => (
  <svg {...base} {...p}><path d="M21.4 11l-9.6 9.6a5.5 5.5 0 11-7.7-7.7l9.6-9.6a3.7 3.7 0 015.2 5.2l-9.6 9.6a1.8 1.8 0 11-2.6-2.6l8.8-8.8"/></svg>
)
export const IAt = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.9 7.9"/></svg>
)
export const ISmile = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
)
export const IPin = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 17v5M9 7v5l-3 4h12l-3-4V7M9 7h6M9 7l-2-3h10l-2 3"/></svg>
)
export const IMore = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
)
export const IPhone = (p: IconProps) => (
  <svg {...base} {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
)
export const IFile = (p: IconProps) => (
  <svg {...base} {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M14 13H8M14 17H8"/></svg>
)
export const IFigma = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="6" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><circle cx="12" cy="18" r="3"/></svg>
)
export const IExit = (p: IconProps) => (
  <svg {...base} {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
)
export const IMail = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 7l-10 6L2 7"/></svg>
)
export const IBoard = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/></svg>
)
export const IShip = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 3v13M8 7h8M5 21h14"/><path d="M4 13l8 5 8-5M6 10l-2 3M18 10l2 3"/></svg>
)
export const ITrash = (p: IconProps) => (
  <svg {...base} {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
)
export const ICalendar = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
)
export const IDoc = (p: IconProps) => (
  <svg {...base} {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>
)
export const IClock = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
)
export const IRepeat = (p: IconProps) => (
  <svg {...base} {...p}><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
)
