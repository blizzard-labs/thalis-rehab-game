import { useMemo, useState } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { CalibrationScene } from "./scenes/CalibrationScene";
import { GameModeSelect } from "./scenes/GameModeSelect";
import { GardenScene } from "./scenes/GardenScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { SessionStats } from "./session/SessionStats";
import { config } from "./config";

type View = "welcome" | "calibration" | "modeselect" | "garden" | "summary";

export default function App() {
  const [view, setView] = useState<View>("welcome");
  const stats = useMemo(() => new SessionStats(), []);

  // Quit abandons the session and returns to Welcome, resetting accumulated
  // stats. A single persistent button (rendered below) drives this from every
  // non-welcome scene so the patient/clinician can always bail out.
  const quit = () => { stats.reset(); setView("welcome"); };

  const scene = (() => {
    switch (view) {
      case "welcome":
        return <WelcomeScene firstName={config.patient.firstName} onBegin={() => setView("calibration")} />;
      case "calibration":
        return (
          <CalibrationScene
            affectedSide={config.patient.affectedSide}
            totalTrials={2 /* short demo block this round */}
            onComplete={() => setView("modeselect")}
          />
        );
      case "modeselect":
        // Only Garden Grow is wired this round; GameModeSelect disables the rest,
        // so onConfirm always resolves to the garden scene for now.
        return <GameModeSelect onConfirm={() => setView("garden")} />;
      case "garden":
        return (
          <GardenScene
            stats={stats}
            engagementThreshold={config.engagementThreshold}
            onEnd={() => setView("summary")}
          />
        );
      case "summary":
        return <SummaryScene stats={stats} onRestart={quit} />;
    }
  })();

  return (
    <>
      {scene}
      {view !== "welcome" && (
        <button type="button" className="app-quit-btn" data-testid="quit-btn" onClick={quit}>
          Quit
        </button>
      )}
    </>
  );
}
