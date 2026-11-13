import { useState } from "react";
import { familiarGames, services } from "./catalog";
import { useGameController } from "./bridge";
import "./library.css";

export function ExtensionHelp() {
  return (
    <details className="library-help">
      <summary>Set up camera / EEG controls</summary>
      <ol>
        <li>Open NeuroReach in desktop Chrome or Edge.</li>
        <li>
          <a href="/game-controller-extension.zip" download>
            Download the Game Controller extension
          </a>{" "}
          and unzip it.
        </li>
        <li>
          Open your browser’s Extensions page, turn on Developer mode, choose{" "}
          <strong>Load unpacked</strong>, and select the unzipped folder. Pin
          NeuroReach to the toolbar. Reload this library page after installing.
        </li>
        <li>
          Open a game below. Click the NeuroReach extension button and choose
          its playable area. The input controller opens beside the game.
        </li>
        <li>
          Set up your camera or EEG, then choose{" "}
          <strong>Enable controls</strong>. Keep both windows visible.
        </li>
      </ol>
      <p>
        The extension requests browser debugging access to send controls to your
        selected game. <strong>Alt+Shift+S</strong> stops controls at any time.
      </p>
    </details>
  );
}

export function GameLibrary({ back }: { back: () => void }) {
  const status = useGameController();
  const [search, setSearch] = useState("");
  const filtered = familiarGames.filter((game) =>
    `${game.name} ${game.controls}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="game-library">
      <button onClick={back}>← NeuroReach games</button>
      <div className="library-hero">
        <div>
          <p className="library-eyebrow">Independent play</p>
          <h1>A whole world of games.</h1>
          <p>
            Play familiar favorites on their original sites. Connect your camera
            or EEG with the NeuroReach Game Controller in desktop Chrome or
            Edge.
          </p>
        </div>
        <div className="library-emblem" aria-hidden="true">
          ✦
          <span>
            PLAY
            <br />
            YOUR WAY
          </span>
        </div>
      </div>
      <div className="library-status">
        <span aria-hidden="true">{status.installed ? "●" : "○"}</span>{" "}
        {status.installed
          ? "Game Controller extension connected"
          : "Touch and keyboard play is ready. Add the extension for camera or EEG."}
      </div>
      <ExtensionHelp />
      <div className="library-heading">
        <div>
          <h2>Explore full libraries</h2>
          <p>
            Browse thousands of premade games. Pick a game, then connect its
            play area with the extension.
          </p>
        </div>
      </div>
      <div className="library-services">
        {services.map((service) => (
          <a
            key={service.name}
            className={`library-service ${service.color}`}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="library-icon" aria-hidden="true">
              {service.icon}
            </span>
            <h3>{service.name}</h3>
            <p>{service.detail}</p>
            <b>Browse full library ↗</b>
            <span className="sr-only"> Opens a new tab</span>
          </a>
        ))}
      </div>
      <div className="library-heading">
        <h2>Familiar favorites</h2>
        <label>
          Find a favorite
          <input
            type="search"
            placeholder="Title or controls"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="library-favorites">
        {filtered.map((game) => (
          <a
            key={game.name}
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="library-game-icon" aria-hidden="true">
              {game.icon}
            </span>
            <div>
              <small>{game.provider}</small>
              <h3>
                {game.name} <span aria-hidden="true">↗</span>
              </h3>
              <p>{game.description}</p>
              <span className="library-control-tag">{game.controls}</span>
            </div>
            <span className="sr-only"> Opens a new tab</span>
          </a>
        ))}
      </div>
      {filtered.length === 0 && (
        <p role="status">
          No matching favorite. Explore one of the full libraries above for more
          games.
        </p>
      )}
      <p className="library-note">
        Games open on external websites and may include ads, accounts or
        purchases. Internet is required. Camera/EEG compatibility depends on the
        game; use its usual controls or try a different control preset when
        needed. These games are for independent play and do not create
        NeuroReach clinical session reports.
      </p>
    </section>
  );
}
