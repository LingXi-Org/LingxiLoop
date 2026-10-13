export function ProductLogo({ size = 22, rounded = false }: { size?: number; rounded?: boolean }) {
  return (
    <img
      src="/logo.svg"
      alt="LingxiLoop"
      draggable={false}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        borderRadius: rounded ? Math.max(6, Math.round(size * 0.22)) : undefined,
      }}
    />
  )
}
