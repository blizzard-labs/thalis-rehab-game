import type { ClinicalScore, Patient, Protocol } from "./types";
import { seedPatients } from "./seed";

// In-memory patient store. Single source of truth for C1/C4/C5. Mutations
// notify subscribers so React views re-render via useSyncExternalStore. No
// persistence — restart resets to seed (per the prototype data decision).

export class PatientStore {
  private patients: Patient[];
  private subscribers = new Set<() => void>();

  constructor(initial: Patient[] = seedPatients()) {
    this.patients = initial;
  }

  list(): Patient[] {
    return this.patients;
  }

  get(id: string): Patient | undefined {
    return this.patients.find((p) => p.id === id);
  }

  search(query: string): Patient[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.patients;
    return this.patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q),
    );
  }

  addScore(id: string, score: ClinicalScore): void {
    const p = this.get(id);
    if (!p) return;
    p.scores = [...p.scores, score].sort((a, b) => a.date.localeCompare(b.date));
    this.emit();
  }

  updateProtocol(id: string, patch: Partial<Protocol>): void {
    const p = this.get(id);
    if (!p) return;
    p.protocol = { ...p.protocol, ...patch };
    this.emit();
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private emit(): void {
    for (const cb of this.subscribers) cb();
  }
}

// App-wide singleton; views import this directly.
export const patientStore = new PatientStore();
