/**
 * Tiny "HUMAN" label tag rendered next to a human author's name. Same
 * treatment in message rows and the members popover so the two surfaces
 * read as the same affordance. Liquid-glass dimensionality is kept very
 * subtle: a soft sky tint, a hairline edge, and a single top-edge sheen.
 */
export function HumanBadge() {
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold tracking-wider uppercase px-1.5 py-[1px] rounded-full"
      style={{
        color: 'var(--skype-deep)',
        background: 'color-mix(in srgb, var(--primary) 10%, var(--background))',
        border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
        boxShadow: 'inset 0 0.5px 0 color-mix(in srgb, var(--primary-foreground) 70%, transparent)',
      }}
    >
      成员
    </span>
  )
}
