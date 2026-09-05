/**
 * A small, refined "scroll to latest message" pill that appears in the
 * bottom-right of the chat stream once the user has scrolled up off the
 * bottom. ChatPane owns
 * the at-bottom signal (via Virtuoso's `atBottomStateChange`) and the
 * scroll action; this component is presentation-only.
 *
 * Design notes:
 * - Pill, not a hard circle — reads as a "jump back to where new things
 *   land", not a generic FAB. ~36px tall, ~36px wide for the icon-only
 *   variant; the layout naturally grows if we ever surface an unread count.
 * - Paper-toned palette (sky/ink) + a soft brand-blue glow. Border + shadow
 *   are tuned so the pill reads as floating without an aggressive drop.
 * - Entrance: fade + small lift via `animate-rise` (same utility the rest of
 *   the app uses for transient overlays). When toggled off we unmount, so
 *   the next appearance always replays the entrance — no stale "ghost".
 * - aria: a real button with a descriptive label, focus ring matches the
 *   app's `outline-sky2-300` convention.
 */
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  visible: boolean
  onClick: () => void
  /** Optional override of the pill's vertical inset from the bottom of its
   *  positioned ancestor. The default sits just above the composer line. */
  bottomOffset?: number
  zh?: boolean
}

export function ScrollToLatestButton({ visible, onClick, bottomOffset = 16, zh = false }: Props) {
  if (!visible) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={zh ? '回到最新消息' : "滚动到最新消息"}
      title={zh ? '回到最新消息' : "最新消息"}
      className={cn(
        // Positioning: absolute within the chat stream's relative container.
        'absolute right-4 z-20 grid place-items-center',
        // Shape + size — pill, 36×36 default, comfortable touch target.
        'size-9 rounded-full bg-background/95 text-primary shadow-lg backdrop-blur-md',
        // Interaction — quick fade, gentle scale on press for tactile feel.
        'transition-all duration-150 hover:bg-accent hover:text-accent-foreground',
        'active:scale-[0.96]',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Entrance animation matches other transient overlays.
        'animate-rise',
      )}
      style={{ bottom: bottomOffset }}
    >
      <ChevronDown />
    </Button>
  )
}

/** Minimal chevron-down — tuned weight (1.75 stroke) so it reads at 18px
 *  without looking either spindly or chunky. Lives inline because this is
 *  the only place we draw it. */
function ChevronDown() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
