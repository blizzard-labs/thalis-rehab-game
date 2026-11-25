import type { ReactNode } from "react";
import { companionUrl } from "../deployment";

export function CompanionAccess({
  staff = false,
  children,
}: {
  staff?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="practice-panel companion-access">
      <h1>{staff ? "Staff workspace" : "Play with your EEG headset"}</h1>
      <p>
        {staff
          ? "Supervised sessions and participant records run on your own computer through the NeuroReach companion."
          : "EEG play uses the NeuroReach companion on the computer connected to your headset. Camera and one-button games work directly on this website."}
      </p>
      <ol>
        <li>Install and start the companion on that computer.</li>
        <li>
          {staff
            ? "Open the local workspace below and unlock your station."
            : "Open the local player below and choose your game and EEG input."}
        </li>
        {staff && (
          <li>
            Create a supervised session to give the patient a private link or QR
            code. Both devices must be on the same network.
          </li>
        )}
      </ol>
      <p className="button-row">
        <a
          className="primary"
          href={companionUrl(staff ? "#staff" : "")}
          target="_blank"
          rel="noopener noreferrer"
        >
          {staff ? "Open local staff workspace" : "Open local player"}
        </a>
        <a
          href="https://github.com/blizzard-labs/thalis-rehab-game#local-eeg-companion"
          target="_blank"
          rel="noopener noreferrer"
        >
          Companion setup instructions
        </a>
      </p>
      <p>
        The local link opens a new tab. If it cannot connect, start the
        companion and try again. This website does not upload your station
        records or scan your network.
      </p>
      {children}
    </section>
  );
}
