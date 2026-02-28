export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      {subtitle && <div className="empty-sub">{subtitle}</div>}
    </div>
  );
}
