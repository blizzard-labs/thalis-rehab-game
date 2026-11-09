import type { ReactNode } from "react";
import { GardenLandscape } from "../garden/GardenLandscape";
import { FlowerHead } from "../garden/Flower";
import { seeds } from "../garden/seeds";
import type { PracticeRound } from "./session";

function WateringCan() {
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <path d="M78 29 Q115 4 112 39 Q109 57 91 57" fill="none" stroke="#395c61" strokeWidth="8" />
      <path d="M51 53 L24 35 L13 38 L40 71 Z" fill="#6b9a94" stroke="#395c61" strokeWidth="3" />
      <path d="M39 31 Q64 24 85 29 L94 71 Q72 87 43 74 Z" fill="#83b0a5" stroke="#395c61" strokeWidth="3" />
      <path d="M52 36 L56 66 M62 35 L66 69" fill="none" stroke="#bed8c3" strokeWidth="3" />
      <ellipse cx="15" cy="37" rx="12" ry="6" transform="rotate(-35 15 37)" fill="#456d73" />
    </svg>
  );
}

function Pollinator() {
  return (
    <svg className="garden-bee" viewBox="0 0 74 58" aria-hidden="true">
      <g stroke="#604522" strokeWidth="2">
        <ellipse cx="34" cy="17" rx="10" ry="14" fill="#eefbff" transform="rotate(-30 34 17)" />
        <ellipse cx="47" cy="18" rx="9" ry="13" fill="#eefbff" transform="rotate(26 47 18)" />
        <ellipse cx="36" cy="34" rx="21" ry="12" fill="#f2be4a" />
        <path d="M29 23 Q21 33 29 44 M39 22 Q32 34 40 46" fill="none" strokeWidth="5" />
        <circle cx="53" cy="32" r="8" fill="#604522" />
      </g>
    </svg>
  );
}

export function GardenPlay({ round, camera, water }: {
  round: PracticeRound; camera?: ReactNode; water: () => void;
}) {
  const { bed, next } = round.flowerBed;
  const blooming = bed.length > 0 && round.progress === 0;
  const seed = blooming ? bed[bed.length - 1] : next;
  const manual = round.source === "button";
  const meter = Math.round(100 * (manual ? (blooming ? 1 : round.progress) : round.level));
  return (
    <GardenLandscape seed={seed} growth={Math.max(0.12, round.plant.currentGrowth)}
      bloom={blooming} meter={meter} label={manual ? "Growth" : "Effort"} camera={camera}>
      <div className="garden-hill garden-hill--far" aria-hidden="true" />
      <div className="garden-hill garden-hill--near" aria-hidden="true" />
      <div className="flower-border" aria-label="Your flower bed">
        {bed.map((flower, i) => (
          <svg key={round.record.rewards - bed.length + i} viewBox="0 0 90 130" role="img" aria-label={flower}>
            <path d="M45 130 Q53 86 45 52" fill="none" stroke="#376640" strokeWidth="5" />
            <path d="M48 103 Q24 100 20 82 Q40 80 48 103 M48 89 Q65 88 74 72 Q53 72 48 89" fill="#578649" />
            <g transform="translate(45 47) scale(.39)"><FlowerHead seed={flower} /></g>
          </svg>
        ))}
      </div>
      {blooming && <Pollinator />}
      {manual && (
        <button type="button" className="watering-can" aria-label="Pour onto the plant"
          disabled={round.paused} onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }} onClick={water}><WateringCan /></button>
      )}
      {round.record.actions > 0 && (
        <div className="water-drops" key={round.record.actions} aria-hidden="true">
          <i /><i /><i />
        </div>
      )}
    </GardenLandscape>
  );
}

export function SeedTray({ round, select }: { round: PracticeRound; select: () => void }) {
  return (
    <div className="seed-tray" role="group" aria-label="Choose a seed">
      <span>{round.progress ? "Growing" : "Plant next"}</span>
      {seeds.map((seed) => (
        <button type="button" key={seed} aria-pressed={round.flowerBed.next === seed}
          disabled={round.paused || round.progress > 0}
          onClick={() => { round.chooseSeed(seed); select(); }}>
          <svg viewBox="-90 -90 180 180" aria-hidden="true"><FlowerHead seed={seed} /></svg>
          {seed}
        </button>
      ))}
    </div>
  );
}
