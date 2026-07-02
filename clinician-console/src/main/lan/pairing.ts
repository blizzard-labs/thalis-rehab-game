export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

export type SessionInfo = {
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
};

type Active = { code: string; session: SessionInfo; mintedAt: number; socketId: string | null };

export class SessionPairing {
  private active: Active | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly rng: () => number;

  constructor(opts: { ttlMs?: number; now?: () => number; rng?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 600_000; // 10 min
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? Math.random;
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
    this.active = { code, session, mintedAt: this.now(), socketId: null };
    return code;
  }

  validate(code: string): boolean {
    if (!this.active || this.expired()) return false;
    return this.active.code === code;
  }

  bind(socketId: string): boolean {
    if (!this.active || this.expired()) return false;
    if (this.active.socketId !== null) return false;
    this.active.socketId = socketId;
    return true;
  }

  boundSocketId(): string | null {
    return this.active?.socketId ?? null;
  }

  session(): SessionInfo | null {
    return this.active && !this.expired() ? this.active.session : null;
  }

  end(): void {
    this.active = null;
  }
}
