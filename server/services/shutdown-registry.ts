/**
 * Central process-shutdown registry.
 *
 * Resolves audit finding H-DEP-1: module-load `setInterval` services had no
 * SIGTERM hooks, so a rolling Replit Deployment would leave in-flight DB
 * writes racing with the new container.
 *
 * Services register a named `stop()` function once at startup. On SIGTERM
 * / SIGINT we invoke every registered stopper with a bounded timeout. Each
 * stopper's failure is logged but does not block the others.
 */

export type ShutdownStopFn = () => void | Promise<void>;

interface Registration {
  name: string;
  stop: ShutdownStopFn;
}

const registrations: Registration[] = [];
let signalsBound = false;
let shuttingDown = false;

export function registerShutdown(name: string, stop: ShutdownStopFn): void {
  registrations.push({ name, stop });
}

export function getRegisteredShutdowns(): ReadonlyArray<string> {
  return registrations.map((r) => r.name);
}

export async function runShutdownRegistry(perStopperTimeoutMs = 5000): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // Iterate in reverse registration order so the most recently started
  // service stops first. Best-effort: never throw.
  for (let i = registrations.length - 1; i >= 0; i -= 1) {
    const { name, stop } = registrations[i];
    try {
      await Promise.race([
        Promise.resolve(stop()),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`shutdown_timeout_${name}`)), perStopperTimeoutMs),
        ),
      ]);
    } catch (err) {
      console.error(`[shutdown] ${name} failed:`, (err as Error)?.message || err);
    }
  }
}

export function bindShutdownSignals(perStopperTimeoutMs = 5000): void {
  if (signalsBound) return;
  signalsBound = true;
  const handler = (signal: NodeJS.Signals) => {
    console.log(`[shutdown] received ${signal}, stopping ${registrations.length} service(s)`);
    runShutdownRegistry(perStopperTimeoutMs)
      .catch((err) => console.error("[shutdown] registry error:", err))
      .finally(() => {
        // Give logs a tick to flush, then exit. process.exit is intentional —
        // the goal is a clean termination after intervals are cleared.
        setTimeout(() => process.exit(0), 50).unref();
      });
  };
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}

/** Test-only: clear all registrations + reset the singleton state. */
export function __resetShutdownRegistryForTests(): void {
  registrations.length = 0;
  shuttingDown = false;
  signalsBound = false;
}
