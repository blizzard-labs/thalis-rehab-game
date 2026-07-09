export function WaitingSpinner({ label }: { label: string }) {
  return (
    <div className="waiting" role="status" data-testid="waiting-spinner">
      <span className="waiting__spin" aria-hidden="true" />
      <span className="waiting__label">{label}</span>
    </div>
  );
}
