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
      <div
        className="companion-downloads"
        role="group"
        aria-label="Download the companion"
      >
        <a
          className="primary"
          href="https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-Windows-Setup.exe"
        >
          Download for Windows <small>Windows 10/11 · 64-bit Intel/AMD</small>
        </a>
        <a
          className="primary"
          href="https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-macOS-Apple-Silicon.dmg"
        >
          Download for Mac <small>Apple silicon · macOS 15+</small>
        </a>
        <a
          className="primary"
          href="https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-macOS-Intel.dmg"
        >
          Download for Mac <small>Intel · macOS 15+</small>
        </a>
      </div>
      <p>
        No Python installation or terminal commands needed. On a Mac, check
        Apple menu → About This Mac to find your chip.
      </p>
      <ol>
        <li>
          Open the download. On Windows, follow the installer; on Mac, drag
          NeuroReach to Applications.
        </li>
        <li>
          Open NeuroReach and wait for “Ready to use.” Keep its window open
          during sessions.
        </li>
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
      <p className="companion-install-note">
        These initial downloads are not publisher-signed; the Mac app is not yet
        Apple-notarized. Your computer may require approval before opening it.
        The setup instructions explain this step; managed computers may need IT
        approval.
      </p>
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
          href="https://github.com/blizzard-labs/thalis-rehab-game#companion-setup"
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
