import type { ReactNode } from "react";
import { Flower } from "./Flower";
import type { Seed } from "./seeds";

export function GardenLandscape({
  growth,
  bloom,
  seed,
  meter,
  label,
  camera,
  children,
}: {
  growth: number;
  bloom: boolean;
  seed?: Seed;
  meter: number;
  label: string;
  camera?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="garden-row">
      <div className="garden-sun" aria-hidden="true" />
      <div className="garden-ground" aria-hidden="true" />
      {camera && <div className="garden-camera">{camera}</div>}
      <div className="garden-stage">
        <Flower growth={growth} bloom={bloom} seed={seed} />
      </div>
      <div className="focus-meter">
        <span className="focus-meter__label">{label}</span>
        <div
          className="intent-bar"
          data-testid="intent-bar"
          role="progressbar"
          aria-label={`${label} level`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={meter}
        >
          <div className="intent-bar-fill" style={{ height: `${meter}%` }} />
        </div>
        <span className="focus-meter__value">{meter}</span>
      </div>
      {children}
    </div>
  );
}
