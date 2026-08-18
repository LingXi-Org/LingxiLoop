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
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(194,230,251,0.22) 100%)',
        border: '1px solid rgba(0, 120, 200, 0.1)',
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.7)',
      }}
    >
      human
    </span>
  )
}
