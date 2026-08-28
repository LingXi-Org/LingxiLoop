export function LearningCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-hairline bg-card p-4 shadow-sm ${className}`}>{children}</section>
}
