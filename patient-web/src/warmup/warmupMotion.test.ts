import { describe, it, expect } from "vitest";
import { poseForPhase, CUE_RAMP_MS, IMAGINE_DURATION_MS } from "./warmupMotion";
import { getPose } from "./handPoses";

const neutral = getPose("neutral");
const open = getPose("open");
const closed = getPose("closedGrasp");

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("poseForPhase", () => {
  it("holds neutral during fixation and rest", () => {
    close(poseForPhase("fixation", 0).index.mcp, neutral.index.mcp);
    close(poseForPhase("fixation", 9999).index.mcp, neutral.index.mcp);
    close(poseForPhase("rest", 0).index.mcp, neutral.index.mcp);
    close(poseForPhase("rest", 9999).index.mcp, neutral.index.mcp);
  });

  it("ramps neutral -> open across the cue phase", () => {
    close(poseForPhase("cue", 0).index.mcp, neutral.index.mcp);
    close(poseForPhase("cue", CUE_RAMP_MS).index.mcp, open.index.mcp);
    // clamps after the ramp completes
    close(poseForPhase("cue", CUE_RAMP_MS * 2).index.mcp, open.index.mcp);
  });

  it("ramps open -> closed once across the imagine phase", () => {
    close(poseForPhase("imagine", 0).index.mcp, open.index.mcp);
    close(
      poseForPhase("imagine", IMAGINE_DURATION_MS / 2).index.mcp,
      (open.index.mcp + closed.index.mcp) / 2,
    );
    close(poseForPhase("imagine", IMAGINE_DURATION_MS).index.mcp, closed.index.mcp);
    // clamps after the ramp completes (no looping back to open)
    close(poseForPhase("imagine", IMAGINE_DURATION_MS * 2).index.mcp, closed.index.mcp);
  });
});
