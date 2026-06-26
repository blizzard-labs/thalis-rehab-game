import type { SessionStats } from "../session/SessionStats";

export function SummaryScene({ stats, onRestart }: { stats: SessionStats; onRestart?: () => void }) {
  const minutes = Math.max(0, Math.round(stats.totalActiveSeconds / 60));
  const streak = Math.max(0, Math.round(stats.bestStreakSeconds));
  return (
    <main className="scene scene--summary">
      <div className="summary-badge" aria-hidden="true" />
      <h1 className="summary-title">Great work today!</h1>
      <div className="summary-tiles">
        <div className="summary-tile">
          <div className="summary-num">{minutes}</div>
          <div className="summary-label">minutes played</div>
        </div>
        <div className="summary-tile">
          <div className="summary-num">{streak}</div>
          <div className="summary-label">best streak (s)</div>
        </div>
      </div>
      <p className="summary-line">You kept the garden growing today ✓</p>
      <div className="summary-story">Lighthouse story progress — 1 more piece required</div>
      {onRestart && (
        <button type="button" className="big-button" onClick={onRestart}>
          Play again
        </button>
      )}
    </main>
  );
}
