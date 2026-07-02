import { useMemo, useState } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { CalibrationScene } from "./scenes/CalibrationScene";
import { GameModeSelect } from "./scenes/GameModeSelect";
import { GardenScene } from "./scenes/GardenScene";
import { StarCatchScene } from "./scenes/StarCatchScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { PairingScene } from "./scenes/PairingScene";
import { SessionStats } from "./session/SessionStats";
import { config, readSessionCode } from "./config";
import type { PairedSession } from "./net/lanClient";

type View = "pairing" | "welcome" | "calibration" | "modeselect" | "garden" | "stars" | "summary";

export default function App() {
  // A pairing code in the URL (`?c=`) means this device was launched from the
  // clinician console over the LAN: pair before Welcome. Without a code we are
  // in local/dev mode and boot straight to Welcome against the localhost sidecar.
  const code = useMemo(() => readSessionCode(), []);
  const wssUrl = useMemo(() => `wss://${window.location.host}`, []);
  const [view, setView] = useState<View>(code ? "pairing" : "welcome");
  const [paired, setPaired] = useState<PairedSession | null>(null);
  const identity = paired ?? config.patient;
  const firstName = paired ? paired.patientFirstName : config.patient.firstName;
  const stats = useMemo(() => new SessionStats(), []);

  // Quit abandons the session and returns to Welcome, resetting accumulated
  // stats. A single persistent button (rendered below) drives this from every
  // non-welcome scene so the patient/clinician can always bail out.
  const quit = () => { stats.reset(); setView("welcome"); };

  const scene = (() => {
    switch (view) {
      case "pairing":
        return (
          <PairingScene
            code={code!}
            wssUrl={wssUrl}
            onPaired={(s) => { setPaired(s); setView("welcome"); }}
          />
        );
      case "welcome":
        return <WelcomeScene firstName={firstName} onBegin={() => setView("calibration")} />;
      case "calibration":
        return (
          <CalibrationScene
            affectedSide={identity.affectedSide}
            totalTrials={2 /* short demo block this round */}
            onComplete={() => setView("modeselect")}
          />
        );
      case "modeselect":
        // Garden Grow and Star Catcher are wired; GameModeSelect disables the rest.
        return <GameModeSelect onConfirm={(id) => setView(id === "stars" ? "stars" : "garden")} />;
      case "garden":
        return (
          <GardenScene
            stats={stats}
            engagementThreshold={config.engagementThreshold}
            onEnd={() => setView("summary")}
          />
        );
      case "stars":
        return (
          <StarCatchScene
            stats={stats}
            engagementThreshold={config.engagementThreshold}
            affectedSide={identity.affectedSide}
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
