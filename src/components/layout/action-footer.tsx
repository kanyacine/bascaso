export function ActionFooter({ left, children }: { left?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-sidebar px-6 py-3">
      <div className="min-w-0 flex-1">{left}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
