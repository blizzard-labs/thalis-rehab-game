import type { Point } from "../practice/motion";

/** One drag per sweep and one tap per deliberate dwell, using fresh pose frames. */
export class CameraSlice {
  private anchor: Point | null = null;
  private lastFrame = -Infinity;
  private settledSince = 0;
  private dragging = false;
  private tapped = false;

  reset() {
    this.anchor = null;
    this.lastFrame = -Infinity;
    this.dragging = this.tapped = false;
  }

  update(
    point: Point,
    time: number,
    area: { width: number; height: number },
    dwellMs: number,
  ) {
    if (time <= this.lastFrame) return;
    this.lastFrame = time;
    const radius = Math.max(
      6,
      Math.min(24, Math.min(area.width, area.height) / 24),
    );
    if (!this.anchor) {
      this.anchor = point;
      this.settledSince = time;
      return;
    }
    const distance = Math.hypot(
      (point.x - this.anchor.x) * area.width,
      (point.y - this.anchor.y) * area.height,
    );
    if (distance > radius * (this.tapped ? 1.5 : 1)) {
      this.anchor = point;
      this.settledSince = time;
      this.tapped = false;
      if (!this.dragging) {
        this.dragging = true;
        return "hold";
      }
    } else if (this.dragging && time - this.settledSince >= 220) {
      this.dragging = false;
      return "release";
    } else if (
      !this.dragging &&
      !this.tapped &&
      time - this.settledSince >= dwellMs
    ) {
      this.tapped = true;
      return "click";
    }
  }
}
