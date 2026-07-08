import { useEffect, useMemo, useState } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { CalibrationScene } from "./scenes/CalibrationScene";
import { GameModeSelect } from "./scenes/GameModeSelect";
import { GardenScene } from "./scenes/GardenScene";
import { StarCatchScene } from "./scenes/StarCatchScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { PairingScene } from "./scenes/PairingScene";
import { FramingCheckScene } from "./scenes/FramingCheckScene";
import { SessionStats } from "./session/SessionStats";
import { config, readSessionCode } from "./config";
import { usePatientLink } from "./net/usePatientLink";
import { useCameraPublish } from "./net/useCameraPublish";

type View = "pairing" | "welcome" | "framing" | "calibration" | "modeselect" | "garden" | "stars" | "summary";

export default function App() {
  // A pairing code in the URL (`?c=`) means this device was launched from the
  // clinician console over the LAN: pair before Welcome. Without a code we are
  // in local/dev mode and boot straight to Welcome against the localhost sidecar.
  const code = useMemo(() => readSessionCode(), []);
  const wssUrl = useMemo(() => `wss://${window.location.host}`, []);
  // One connection owned here and kept alive for the whole session; scenes read
  // its shared score store instead of each opening their own socket (a per-scene
  // localhost socket never reaches a remote patient over the LAN relay).
  const link = usePatientLink(code, wssUrl);
  // Publish the patient camera over the paired socket's WebRTC signaling once
  // paired and connected. Local/dev (no code) stays preview-only.
  useCameraPublish(link, Boolean(code) && link.conn === "open");
  const paired = link.session;
  const [view, setView] = useState<View>(code ? "pairing" : "welcome");
  const identity = (code ? paired : null) ?? config.patient;
  const firstName = code && paired ? paired.patientFirstName : config.patient.firstName;
  const stats = useMemo(() => new SessionStats(), []);

  // Advance past the pairing gate once the LAN handshake lands.
  useEffect(() => {
    if (view === "pairing" && paired) setView("welcome");
  }, [view, paired]);

  // Quit abandons the session and returns to Welcome, resetting accumulated
  // stats. A single persistent button (rendered below) drives this from every
  // non-welcome scene so the patient/clinician can always bail out.
  const quit = () => { stats.reset(); setView("welcome"); };

  const scene = (() => {
    switch (view) {
      case "pairing":
        return <PairingScene error={link.error} />;
      case "welcome":
        return <WelcomeScene firstName={firstName} onBegin={() => setView("framing")} />;
      case "framing":
        return <FramingCheckScene onConfirm={() => setView("calibration")} />;
      case "calibration":
        return (
          <CalibrationScene
            affectedSide={identity.affectedSide}
            totalTrials={2 /* per class → 4 cued trials; short demo block */}
            baselineMs={3000 /* demo: real block is 60 s (spec §6 step 1) */}
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
            store={link.store}
            conn={link.conn}
            onEnd={() => setView("summary")}
          />
        );
      case "stars":
        return (
          <StarCatchScene
            stats={stats}
            engagementThreshold={config.engagementThreshold}
            affectedSide={identity.affectedSide}
            store={link.store}
            conn={link.conn}
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
