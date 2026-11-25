import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type ComponentProps,
} from "react";
import type { AdventurePlay } from "./AdventurePlay";
import {
  keeperStory,
  keeperCast,
  keeperChapters,
  keeperStoryLength,
} from "./keeperStory";
import { KeeperPortrait } from "./KeeperCharacter";
import { KeeperSceneArt, keeperPlaces } from "./KeeperScene";
import { sourceNames } from "../practice/session";
import "./keeper.css";

export function KeeperPlay({
  round,
  sourceLabel,
  camera,
  status,
  controls,
  action,
  redraw,
  onEnd,
  lockedPause,
  clock,
  reducedMotion,
}: Omit<ComponentProps<typeof AdventurePlay>, "side" | "aim">) {
  const work = (round.record.harborBase ?? 0) + round.record.rewards;
  const story = useMemo(() => keeperStory(work), [work]);
  const manual = round.source === "button";
  const person = keeperCast[story.speaker];
  const [journalOpen, setJournalOpen] = useState(false);
  const journal = useRef<HTMLDialogElement>(null);
  const journalButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (journalOpen) journal.current?.showModal();
  }, [journalOpen]);
  // A clinician resume can arrive while the patient is reading the journal.
  // Close the overlay so active sensor input always has a visible task.
  useEffect(() => {
    if (!round.paused && journalOpen) journal.current?.close();
  }, [round.paused, journalOpen]);
  const act = () => {
    if (manual && !round.paused) {
      round.press(true);
      redraw();
    }
  };
  const effort = manual || round.needsRest ? 0 : round.level;
  const visualWork =
    (round.record.harborBase ?? 0) +
    (reducedMotion ? round.record.rewards : round.travelDistance);
  const hint = round.paused
    ? "Paused"
    : manual
      ? story.cue
      : round.needsRest
        ? "Relax before the next task."
        : round.source === "eeg"
          ? `Imagine moving your hand to ${story.action.toLowerCase()}.`
          : `Reach to ${story.action.toLowerCase()}, then rest.`;
  return (
    <section
      className="live-game adventure keeper-story"
      data-paused={round.paused}
    >
      <header className="keeper-heading">
        <div>
          <h1>Lighthouse Keeper</h1>
          <span>The lights of Greyhaven</span>
        </div>
        <div className="keeper-session">
          <span>
            {sourceLabel ?? sourceNames[round.source]} · {clock}
          </span>
          <strong className="game-score" aria-live="polite">
            {round.record.rewards}{" "}
            {round.record.rewards === 1 ? "task" : "tasks"}
          </strong>
        </div>
      </header>
      <div className="keeper-layout">
        <div className="keeper-world">
          <div className="keeper-scene-caption">
            <span>{keeperPlaces[story.scene]}</span>
            <span>
              {story.chapter.weather === "storm"
                ? "The storm watch"
                : story.epilogue
                  ? "The next watch"
                  : `Chapter ${story.chapterIndex + 1} of ${keeperChapters.length}`}
            </span>
          </div>
          <div
            className="adventure-scene keeper-stage"
            data-scene={story.scene}
          >
            <div
              className="keeper-illustration"
              key={`${story.scene}-${story.chapterIndex}`}
            >
              <KeeperSceneArt
                {...{ story, effort, visualWork }}
                onWork={manual && !round.paused ? act : undefined}
              />
            </div>
          </div>
          <div className="keeper-log">
            <span>
              <strong>
                {story.epilogue
                  ? "Story complete"
                  : `${story.chapterIndex} of ${keeperChapters.length} chapters complete`}
              </strong>
            </span>
            <span>
              {story.shipsHome} {story.shipsHome === 1 ? "boat" : "boats"} home
            </span>
          </div>
        </div>
        <aside
          className="keeper-story-panel"
          aria-label="Current story and task"
        >
          <div className="keeper-sign">
            <span className="keeper-eyebrow">
              {story.epilogue
                ? "A new day at Greyhaven"
                : `Chapter ${story.chapterIndex + 1}`}
            </span>
            <h2>{story.title}</h2>
            <div className="keeper-chapter-track" aria-hidden="true">
              {keeperChapters.map((c, i) => (
                <i
                  key={c.title}
                  className={
                    story.epilogue || i < story.chapterIndex
                      ? "complete"
                      : i === story.chapterIndex
                        ? "current"
                        : ""
                  }
                />
              ))}
            </div>
          </div>
          <div
            className="keeper-dialogue"
            key={work}
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="keeper-speaker">
              <KeeperPortrait character={story.speaker} />
              <div>
                <strong>{person.name}</strong>
                <span>{person.role}</span>
              </div>
            </div>
            <p className="keeper-line">“{story.line}”</p>
            <div className="keeper-reply">
              <span>
                {story.speaker === "elias" ? "Elias, to himself" : "Elias"}
              </span>
              <p>“{story.reply}”</p>
            </div>
          </div>
          <div className="keeper-objective">
            <strong>{story.goal}</strong>
            <div className="keeper-goal-progress">
              <progress
                aria-label="Chapter tasks completed"
                value={story.step}
                max={story.length}
              />
              <span>
                {story.step} / {story.length}
              </span>
            </div>
            <p className="game-cue" role="status">
              {hint}
            </p>
            {manual ? (
              <button
                ref={action}
                className="primary keeper-action"
                disabled={round.paused}
                onClick={act}
                onKeyDown={(e) => {
                  if (e.repeat) e.preventDefault();
                }}
              >
                {story.action}
                <span aria-hidden="true"> →</span>
              </button>
            ) : (
              <div className="keeper-effort">
                <span>{story.action}</span>
                <progress
                  value={Math.max(0, Math.min(1, round.catchProgress))}
                  max={1}
                  aria-label="Task progress"
                />
              </div>
            )}
          </div>
        </aside>
      </div>
      <footer className="keeper-controls">
        {camera && <div className="keeper-camera">{camera}</div>}
        <div className="keeper-control-content">
          <div className="button-row">
            <button
              disabled={lockedPause}
              onClick={() => {
                round.setPaused(!round.paused);
                redraw();
              }}
            >
              {round.paused ? "Resume" : "Pause"}
            </button>
            <button
              ref={journalButton}
              onClick={() => {
                round.setPaused(true);
                redraw();
                setJournalOpen(true);
              }}
            >
              Story journal
            </button>
            <button onClick={onEnd}>End session</button>
          </div>
          {status && <p role="status">{status}</p>}
          {controls}
        </div>
      </footer>
      {journalOpen && (
        <dialog
          ref={journal}
          className="keeper-journal"
          aria-labelledby="keeper-journal-title"
          onClose={() => {
            setJournalOpen(false);
            journalButton.current?.focus();
          }}
        >
          <header>
            <div>
              <span className="keeper-eyebrow">The lights of Greyhaven</span>
              <h2 id="keeper-journal-title">The keeper’s journal</h2>
            </div>
            <button onClick={() => journal.current?.close()}>
              Close journal
            </button>
          </header>
          <p>
            Play is paused. {Math.min(keeperStoryLength, work)} of{" "}
            {keeperStoryLength} story tasks completed.
          </p>
          {keeperChapters.map((chapter, i) => {
            const start = i * 6;
            const unlocked = work >= start;
            const complete = work >= start + 6;
            return unlocked ? (
              <details key={chapter.title} open={i === story.chapterIndex}>
                <summary>
                  <span>
                    Chapter {i + 1} · {chapter.title}
                  </span>
                  <small>{complete ? "Complete" : "In progress"}</small>
                </summary>
                {complete && (
                  <div className="keeper-memory">
                    <strong>{chapter.souvenir}</strong>
                    <p>{chapter.memory}</p>
                  </div>
                )}
                <ol>
                  {chapter.tasks
                    .slice(0, Math.min(6, work - start + 1))
                    .map((task) => (
                      <li key={task.action}>
                        <strong>{task.action}</strong>
                        <p>
                          <b>{keeperCast[task.speaker].name}</b> · {task.line}
                        </p>
                        <p>
                          <b>Elias</b> · {task.reply}
                        </p>
                      </li>
                    ))}
                </ol>
              </details>
            ) : (
              <div className="keeper-unread" key={chapter.title}>
                Chapter {i + 1} · {chapter.title}
                <span>Ahead</span>
              </div>
            );
          })}
          {story.epilogue && (
            <div className="keeper-memory">
              <strong>Keeper of Greyhaven</strong>
              <p>
                The story is complete. Your watch continues with new arrivals,
                changing weather and a growing harbor.
              </p>
            </div>
          )}
        </dialog>
      )}
    </section>
  );
}
