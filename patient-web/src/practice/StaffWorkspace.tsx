import { ReportButton } from "../reports/ReportReader";
import { useEffect, useRef, useState } from "react";
import { gameNames, sourceNames } from "./session";
import type { Game, Side } from "./session";
import { DisplayMonitor } from "./DisplayMonitor";
import {
  api,
  checkReportAccess,
  errorText,
  playerToken,
  StationError,
  type Auth,
  type Participant,
  type Visit,
  type DisplayState,
} from "./station";

export function StaffWorkspace({ onExit }: { onExit: () => void }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [password, setPassword] = useState("");
  const [people, setPeople] = useState<Participant[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side>("right");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const working = useRef(false);
  const [localToken, setLocalToken] = useState("");
  const [display, setDisplay] = useState<DisplayState | null>(null);

  const [savedVisits, setVisits] = useState<Visit[]>([]);
  const visits = savedVisits.filter((v) => v.participant === selected);
  const [loadedParticipant, setLoadedParticipant] = useState("");
  const [game, setGame] = useState<Game>("garden");
  const participant = people.find((p) => p.id === selected);
  async function load() {
    const session = await api<Auth>("state");
    setAuth(session);
    if (session.authenticated) {
      setPeople(await api<Participant[]>("participants"));
      const active = await api<DisplayState | null>("display");
      if (active && active.state !== "complete") {
        setSelected(active.participant);
        setLocalToken(playerToken(active.session));
        setDisplay(active);
      }
    }
  }
  async function act(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      if (
        err instanceof StationError &&
        err.status === 401 &&
        auth?.authenticated
      ) {
        setAuth({ configured: true, authenticated: false });
        setPeople([]);
        setVisits([]);
        setSelected("");
        setDisplay(null);
      }
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void load().catch((err) => setError(errorText(err)));
  }, []);
  useEffect(() => {
    let current = true;
    setRemove(false);
    setVisits([]);
    setLoadedParticipant("");
    if (selected && !display)
      api<Visit[]>("participants/" + selected)
        .then((rows) => {
          if (current) {
            setVisits(rows);
            setLoadedParticipant(selected);
          }
        })
        .catch((err) => {
          if (current) setError(errorText(err));
        });
    return () => {
      current = false;
    };
  }, [selected, display]);
  async function launch(target: "workstation" | "display") {
    if (!participant) return;
    await act(async () => {
      try {
        if (target === "workstation") {
          const result = await api<{ display: DisplayState; token: string }>(
            "display",
            "POST",
            { participant: participant.id, game, target },
          );
          playerToken(result.display.session, result.token);
          setLocalToken(result.token);
          setDisplay(result.display);
        } else {
          setLocalToken("");
          setDisplay(
            await api<DisplayState>("display", "POST", {
              participant: participant.id,
              game,
              target,
            }),
          );
        }
      } catch (err) {
        if (err instanceof StationError && err.status === 409) await load();
        throw err;
      }
    });
  }
  if (display)
    return (
      <DisplayMonitor
        key={display.session}
        initial={display}
        participant={participant}
        localToken={localToken}
        onToken={(token) => {
          playerToken(display.session, token);
          setLocalToken(token);
        }}
        onClose={() => {
          setLocalToken("");
          setDisplay(null);
        }}
        onLock={() => {
          setDisplay(null);
          setPeople([]);
          setVisits([]);
          setAuth({ configured: true, authenticated: false });
        }}
      />
    );

  return (
    <section className="practice-panel staff-panel">
      <div className="button-row">
        <button
          disabled={busy}
          onClick={() =>
            act(async () => {
              if (auth?.authenticated) await api("logout", "POST");
              onExit();
            })
          }
        >
          ← Games
        </button>
        {auth?.authenticated && (
          <button
            onClick={() =>
              act(async () => {
                await api("logout", "POST");
                setSelected("");
                setPeople([]);
                setVisits([]);
                await load();
              })
            }
          >
            Lock workstation
          </button>
        )}
      </div>
      <h1>Staff workspace</h1>
      {error && <p role="alert">{error}</p>}
      {!auth && (
        <button onClick={() => act(load)}>Connect to local companion</button>
      )}
      {auth && !auth.authenticated && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api(auth.configured ? "login" : "setup", "POST", {
                password,
              });
              setPassword("");
              await load();
            });
          }}
        >
          <p>
            {auth.configured
              ? "Unlock this station to view its records."
              : "Create a staff password for this station. Use an OS account with encrypted storage."}
          </p>
          <label>
            Staff password{" "}
            <input
              required
              minLength={10}
              type="password"
              autoComplete={
                auth.configured ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={busy} className="primary">
            {auth.configured ? "Unlock" : "Set password"}
          </button>
        </form>
      )}
      {auth?.authenticated && (
        <>
          <fieldset>
            <legend>Roster</legend>
            <label>
              Participant{" "}
              <select
                aria-label="Participant"
                disabled={busy}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a participant</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {!participant && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    const next = await api<Participant[]>(
                      "participants",
                      "POST",
                      { name, side, consent },
                    );
                    setSelected(
                      next.find((p) => !people.some((old) => old.id === p.id))
                        ?.id ?? "",
                    );
                    setPeople(next);
                    setName("");
                    setConsent(false);
                  });
                }}
              >
                <fieldset>
                  <legend>New participant</legend>
                  <label>
                    Participant label{" "}
                    <input
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Practice arm{" "}
                    <select
                      value={side}
                      onChange={(e) => setSide(e.target.value as Side)}
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    Participant agreed to save sessions on this station
                  </label>
                  <button className="primary" disabled={busy}>
                    Add participant
                  </button>
                </fieldset>
              </form>
              <details>
                <summary>Backup and restore</summary>
                <p>
                  Backups include identifiable participant records. Keep the
                  downloaded file in protected storage.
                </p>
                <a href="/api/staff/backup" download>
                  Download station backup
                </a>
                <label>
                  Restore to an empty roster{" "}
                  <input
                    type="file"
                    accept=".json"
                    disabled={people.length > 0 || busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void act(async () => {
                          await api(
                            "backup",
                            "POST",
                            JSON.parse(await file.text()),
                          );
                          await load();
                        });
                    }}
                  />
                </label>
              </details>
            </>
          )}
          {participant && (
            <>
              <h2>{participant.name}</h2>
              <p>
                {participant.side} arm · Consent recorded{" "}
                {new Date(participant.consent).toLocaleDateString()}
              </p>
              <fieldset>
                <legend>Session settings</legend>
                <label>
                  Game{" "}
                  <select
                    aria-label="Game"
                    disabled={busy}
                    value={game}
                    onChange={(e) => setGame(e.target.value as Game)}
                  >
                    {Object.entries(gameNames).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Input{" "}
                  <select
                    aria-label="Input"
                    value={participant.protocol.source}
                    disabled={busy}
                    onChange={(e) => {
                      const source = e.target.value;
                      void act(async () => {
                        await api("participants/" + selected, "PUT", {
                          protocol: { ...participant.protocol, source },
                        });
                        await load();
                      });
                    }}
                  >
                    {Object.entries(sourceNames).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={participant.protocol.easy}
                    disabled={busy}
                    onChange={(e) => {
                      const easy = e.target.checked;
                      void act(async () => {
                        await api("participants/" + selected, "PUT", {
                          protocol: { ...participant.protocol, easy },
                        });
                        await load();
                      });
                    }}
                  />{" "}
                  Gentle pace
                </label>
                <label>
                  Session length{" "}
                  <select
                    aria-label="Session length"
                    value={participant.protocol.schedule ?? "short"}
                    disabled={busy}
                    onChange={(e) => {
                      const schedule = e.target.value;
                      void act(async () => {
                        await api("participants/" + selected, "PUT", {
                          protocol: { ...participant.protocol, schedule },
                        });
                        await load();
                      });
                    }}
                  >
                    <option value="short">5 minutes</option>
                    <option value="clinic">
                      Two 9-minute blocks with a rest
                    </option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => launch("workstation")}
                >
                  Start supervised session
                </button>
                <button disabled={busy} onClick={() => launch("display")}>
                  Pair a patient display
                </button>
              </fieldset>
              <h3>Session history</h3>
              {loadedParticipant === selected && (
                <ReportButton
                  key={selected}
                  reader={{
                    name: participant.name,
                    id: participant.id,
                    assessments: participant.assessments,
                  }}
                  visits={visits}
                  authorize={checkReportAccess}
                />
              )}
              {!visits.length && <p>No sessions recorded yet.</p>}
              <ul className="session-list">
                {visits.map((v) => (
                  <li key={v.id}>
                    <div>
                      <strong>{gameNames[v.record.game]}</strong>
                      <br />
                      {new Date(v.record.started).toLocaleString()} ·{" "}
                      {v.status === "playing" ? "Unfinished" : v.status} ·{" "}
                      {Math.round(v.record.elapsed)} s · {v.record.actions}{" "}
                      actions
                      <details>
                        <summary>Session feedback</summary>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const note = String(
                              new FormData(e.currentTarget).get("note") ?? "",
                            );
                            void act(async () => {
                              await api(
                                "sessions/" + v.id + "/feedback",
                                "PUT",
                                { note },
                              );
                              setVisits((rows) =>
                                rows.map((row) =>
                                  row.id === v.id ? { ...row, note } : row,
                                ),
                              );
                            });
                          }}
                        >
                          <label>
                            Participant or staff observations{" "}
                            <textarea
                              name="note"
                              defaultValue={v.note}
                              maxLength={4000}
                            />
                          </label>
                          <button disabled={busy}>Save feedback</button>
                        </form>
                      </details>
                    </div>
                    <span className="button-row">
                      <ReportButton
                        reader={{
                          name: participant.name,
                          id: participant.id,
                          assessments: participant.assessments,
                        }}
                        visit={v}
                        visits={visits}
                        authorize={checkReportAccess}
                      />
                      <a href={"/api/staff/reports/" + v.id + ".csv"} download>
                        Event CSV
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
              <details>
                <summary>Clinician-entered assessments</summary>
                <ul>
                  {participant.assessments.map((a, i) => (
                    <li key={i}>
                      {a.date} · FMA-UE {a.fma} · ARAT {a.arat}
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    void act(async () => {
                      await api("participants/" + selected, "PUT", {
                        assessment: {
                          fma: Number(fields.get("fma")),
                          arat: Number(fields.get("arat")),
                        },
                      });
                      await load();
                    });
                  }}
                >
                  <label>
                    FMA-UE{" "}
                    <input required name="fma" type="number" min="0" max="66" />
                  </label>
                  <label>
                    ARAT{" "}
                    <input
                      required
                      name="arat"
                      type="number"
                      min="0"
                      max="57"
                    />
                  </label>
                  <button disabled={busy}>Save assessment</button>
                </form>
              </details>
              <details>
                <summary>Remove participant</summary>
                <p>
                  This deletes this participant and all of their sessions from
                  the station.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    remove
                      ? act(async () => {
                          await api("participants/" + selected, "DELETE");
                          setSelected("");
                          await load();
                        })
                      : setRemove(true)
                  }
                >
                  {remove ? "Confirm deletion" : "Delete participant"}
                </button>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
