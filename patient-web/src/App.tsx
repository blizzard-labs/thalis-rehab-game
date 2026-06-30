import { useMemo, useState } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { CalibrationScene } from "./scenes/CalibrationScene";
import { GardenScene } from "./scenes/GardenScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { SessionStats } from "./session/SessionStats";
import { config } from "./config";

type View = "welcome" | "calibration" | "garden" | "summary";

export default function App() {
  const [view, setView] = useState<View>("welcome");
  const stats = useMemo(() => new SessionStats(), []);

  switch (view) {
    case "welcome":
      return <WelcomeScene firstName={config.patient.firstName} onBegin={() => setView("calibration")} />;
    case "calibration":
      return (
        <CalibrationScene
          affectedSide={config.patient.affectedSide}
          totalTrials={2 /* short demo block this round */}
          onComplete={() => setView("garden")}
          onQuit={() => { stats.reset(); setView("welcome"); }}
        />
      );
    case "garden":
      return (
        <GardenScene
          stats={stats}
          engagementThreshold={config.engagementThreshold}
          onEnd={() => setView("summary")}
        />
      );
    case "summary":
      return <SummaryScene stats={stats} onRestart={() => { stats.reset(); setView("welcome"); }} />;
  }
}
