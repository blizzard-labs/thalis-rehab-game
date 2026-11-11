import { StationHeader } from "./ClinicalPanels";
import { PatientOverview } from "./PatientOverview";
import { useEffect, useRef, useState } from "react";
import type { Game, Side } from "./session";
import { DisplayMonitor } from "./DisplayMonitor";
import {
  api,
  errorText,
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
  const [search, setSearch] = useState("");
  const [admin, setAdmin] = useState<"patient" | "backup">("patient");
  const working = useRef(false);
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
      const roster = await api<Participant[]>("participants");
      setPeople(roster);
      setSelected((id) =>
        roster.some((p) => p.id === id) ? id : (roster[0]?.id ?? ""),
      );
      const active = await api<DisplayState | null>("display");
      if (active && active.state !== "complete") {
        if (!active.participant || !active.target) {
          setError(
            "Restart the local NeuroReach companion before opening this session.",
          );
          return;
        }
        setSelected(active.participant);
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
  async function launch() {
    if (!participant) return;
    await act(async () => {
      try {
        // A dev player can update while the previously launched Python process is still running.
        const health = await fetch("/api/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!health.ok || (await health.json()).staffRuns !== 3)
          throw new Error(
            "Restart the local NeuroReach companion to load supervised session controls, then retry.",
          );
        setDisplay(
          await api<DisplayState>("display", "POST", {
            participant: participant.id,
            game,
            target: "display",
          }),
        );
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
        onClose={() => {
          setDisplay(null);
        }}
        onLock={() => {
          setSelected("");
          setError("");
          setDisplay(null);
          setPeople([]);
          setVisits([]);
          setAuth({ configured: true, authenticated: false });
        }}
      />
    );

  async function leave(lockOnly: boolean) {
    await act(async () => {
      if (auth?.authenticated) await api("logout", "POST");
      setPeople([]);
      setVisits([]);
      setSelected("");
      setSearch("");
      setAdmin("patient");
      if (lockOnly) await load();
      else onExit();
    });
  }
  if (!auth?.authenticated)
    return (
      <section className="cl-shell">
        <StationHeader>
          <button onClick={() => leave(false)}>Back to games</button>
        </StationHeader>
        <div className="cl-access">
          <div className="cl-access-rule" />
          <p className="cl-overline">Local workstation</p>
          <h1>Staff workspace</h1>
          {error && <p role="alert">{error}</p>}
          {!auth ? (
            <button onClick={() => act(load)}>
              Connect to local companion
            </button>
          ) : (
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
                  ? "Unlock patient records and supervised session controls."
                  : "Create a staff password for the patient records on this computer."}
              </p>
              <label>
                Staff password
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
              <button className="cl-primary" disabled={busy}>
                {auth.configured ? "Unlock" : "Set password"}
              </button>
            </form>
          )}
        </div>
      </section>
    );

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <section className="cl-shell">
      <StationHeader>
        <button disabled={busy} onClick={() => leave(false)}>
          Back to games
        </button>
        <button disabled={busy} onClick={() => leave(true)}>
          Lock workstation
        </button>
      </StationHeader>
      <div className="cl-body">
        <aside className="cl-rail" aria-label="Patient roster">
          <div className="cl-rail-title">
            <h2>Patient roster</h2>
            <span>{people.length}</span>
          </div>
          <label className="cl-search">
            <span className="sr-only">Search patients</span>
            <input
              type="search"
              placeholder="Search patients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="cl-roster">
            {filtered.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                aria-pressed={p.id === selected && admin === "patient"}
                onClick={() => {
                  setError("");
                  setAdmin("patient");
                  setSelected(p.id);
                }}
              >
                <i aria-hidden="true">
                  {p.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase()}
                </i>
                <span>
                  {p.name}
                  <small>{p.side} practice arm</small>
                </span>
              </button>
            ))}
          </div>
          {search && !filtered.length && <p>No matching patients.</p>}
          <button
            className="cl-new"
            disabled={busy}
            onClick={() => {
              setAdmin("patient");
              setSelected("");
              setError("");
            }}
          >
            + New participant
          </button>
          <button
            className="cl-station-data"
            disabled={busy}
            onClick={() => {
              setAdmin("backup");
              setError("");
            }}
          >
            Station backup
          </button>
        </aside>
        <div className="cl-content">
          {error && (
            <p className="cl-alert" role="alert">
              {error}
            </p>
          )}
          {admin === "backup" ? (
            <>
              <p className="cl-overline">Station data</p>
              <h1>Backup and restore</h1>
              <section className="cl-card">
                <p>
                  Backups include identifiable participant records. Keep the
                  downloaded file in protected storage.
                </p>
                <a href="/api/staff/backup" download>
                  Download station backup
                </a>
                <label>
                  Restore to an empty roster
                  <input
                    type="file"
                    accept=".json"
                    disabled={!!people.length || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void act(async () => {
                          await api(
                            "backup",
                            "POST",
                            JSON.parse(await f.text()),
                          );
                          setAdmin("patient");
                          await load();
                        });
                    }}
                  />
                </label>
              </section>
            </>
          ) : participant ? (
            <PatientOverview
              key={participant.id}
              person={participant}
              visits={visits}
              loaded={loadedParticipant === selected}
              busy={busy}
              game={game}
              setGame={setGame}
              launch={launch}
              protocol={(protocol) =>
                act(async () => {
                  await api("participants/" + selected, "PUT", { protocol });
                  await load();
                })
              }
              assessment={(fma, arat) =>
                act(async () => {
                  await api("participants/" + selected, "PUT", {
                    assessment: { fma, arat },
                  });
                  await load();
                })
              }
              note={(v, n) =>
                act(async () => {
                  await api("sessions/" + v.id + "/feedback", "PUT", {
                    note: n,
                  });
                  setVisits((list) =>
                    list.map((x) => (x.id === v.id ? { ...x, note: n } : x)),
                  );
                })
              }
              remove={() =>
                act(async () => {
                  await api("participants/" + selected, "DELETE");
                  setSelected("");
                  await load();
                })
              }
            />
          ) : (
            <>
              <p className="cl-overline">Patient registration</p>
              <h1>New participant</h1>
              <form
                className="cl-card cl-registration"
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
                    setSearch("");
                  });
                }}
              >
                <label>
                  Participant label
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Practice arm
                  <select
                    aria-label="Practice arm"
                    value={side}
                    onChange={(e) => setSide(e.target.value as Side)}
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label className="cl-check">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Participant agreed to save sessions on this station
                </label>
                <button className="cl-primary" disabled={busy}>
                  Add participant
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
