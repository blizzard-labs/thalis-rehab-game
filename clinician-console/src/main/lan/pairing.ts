import { randomBytes, randomInt } from "node:crypto";
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

export type SessionInfo = {
  harborBase?: number;
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
  source: "sim" | "live";
};

type Active = { code: string; session: SessionInfo; mintedAt: number; socketId: string | null; resumeToken: string | null };

export class SessionPairing {
  private active: Active | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly rng: () => number;

  constructor(opts: { ttlMs?: number; now?: () => number; rng?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 600_000; // 10 min
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? (() => randomInt(CODE_ALPHABET.length) / CODE_ALPHABET.length);
  }

  private generateCode(): string {
    let out = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
    }
    return out;
  }

  private expired(): boolean {
    return !!this.active && this.now() - this.active.mintedAt > this.ttlMs;
  }

  mint(session: SessionInfo): string {
    const code = this.generateCode();
    this.active = { code, session, mintedAt: this.now(), socketId: null, resumeToken: null };
    return code;
  }

  validate(code: string, resumeToken?: string): boolean {
    if (!this.active || this.active.code !== code) return false;
    if (this.active.resumeToken) return this.active.resumeToken === resumeToken;
    return !this.expired();
  }

  mintResumeToken(): string {
    if (!this.active?.socketId) throw new Error("No paired socket");
    return this.active.resumeToken ??= randomBytes(24).toString("hex");
  }

  bind(socketId: string): boolean {
    if (!this.active || (!this.active.resumeToken && this.expired())) return false;
    if (this.active.socketId !== null) return false;
    this.active.socketId = socketId;
    return true;
  }

  boundSocketId(): string | null {
    return this.active?.socketId ?? null;
  }

  /**
   * Release the bound socket without ending the session, so the same code can
   * be re-claimed after the patient drops (reconnect). Keeps single-claimant
   * semantics: only frees the slot once the current holder is gone.
   */
  releaseSocket(): void {
    if (this.active) this.active.socketId = null;
  }

  session(): SessionInfo | null {
    return this.active && (this.active.resumeToken || !this.expired()) ? this.active.session : null;
  }

  end(): void {
    this.active = null;
  }
}
