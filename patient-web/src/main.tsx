import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { readSessionCode } from "./config";
import { NoticeGate, SafetyLink } from "./legal/LegalNotice";
import { ResourceLink } from "./brand/ResourceLink";

async function start() {
  // Keep the paired calibration's 3D renderer out of the standalone startup path.
  const App =
    location.hash === "#game-controller"
      ? (await import("./library/GameController")).GameController
      : location.hash.startsWith("#display=")
        ? (await import("./practice/PairedDisplay")).PairedDisplay
        : readSessionCode()
          ? (await import("./App")).default
          : (await import("./practice/PracticeApp")).PracticeApp;
  const supervised =
    location.hash.startsWith("#display=") || !!readSessionCode();
  const controlled = location.hash === "#game-controller";
  const player =
    supervised || controlled ? (
      <NoticeGate
        kind={supervised ? "supervised" : "controller"}
        session={supervised}
        scope={location.hash || location.search}
        onCancel={() => {
          location.href = location.pathname;
        }}
      >
        <App />
      </NoticeGate>
    ) : (
      <App />
    );
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {player}
      <ResourceLink />
      <SafetyLink />
    </StrictMode>,
  );
  if (
    import.meta.env.PROD &&
    !readSessionCode() &&
    "serviceWorker" in navigator
  ) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Private browsing may disable offline caching. Online play still works.
    });
  }
}
void start();
