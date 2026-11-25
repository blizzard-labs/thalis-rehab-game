export function superviseCompanion(options?: {
  root?: string;
  url?: string;
  command?: string;
  args?: string[];
  interval?: number;
  startupTimeout?: number;
  retryDelay?: number;
  log?: Pick<Console, "info" | "warn">;
  stdio?: "inherit" | "ignore";
}): { ready: Promise<void>; stop: () => void };
