import { useRef, useState } from "react";
import type { PracticeRound } from "./session";

export function BloomGoal({
  round,
  redraw,
}: {
  round: PracticeRound;
  redraw: () => void;
}) {
  const goal = round.flowerBed.goal;
  const [draft, setDraft] = useState(String(goal ?? ""));
  const details = useRef<HTMLDetailsElement>(null);
  function close() {
    if (details.current) {
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    }
    redraw();
  }
  return (
    <details ref={details} className="bloom-goal">
      <summary
        onClick={() => {
          if (!details.current?.open) setDraft(String(goal ?? ""));
        }}
      >
        {goal
          ? round.record.rewards >= goal
            ? `Goal reached · ${goal}`
            : `Goal · ${goal}`
          : "Set bloom goal"}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const target = Number(draft);
          if (Number.isSafeInteger(target) && target > 0) {
            round.flowerBed.goal = target;
            close();
          }
        }}
      >
        <label>
          My bloom goal{" "}
          <input
            type="number"
            min="1"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="submit" className="primary">
            Set goal
          </button>
          {goal && (
            <button
              type="button"
              onClick={() => {
                delete round.flowerBed.goal;
                close();
              }}
            >
              Clear goal
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
