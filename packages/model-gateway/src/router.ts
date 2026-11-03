import type { ProviderId } from "./gateway";
import type { RouteChoice, TaskKind } from "./types";

export class RouteBlockedError extends Error {
  constructor(readonly reason: "provider_not_allowed" | "fallback_disabled" | "no_route") {
    super(reason);
    this.name = "RouteBlockedError";
  }
}

export function chooseRoute(input: {
  taskKind: TaskKind;
  routes: Record<TaskKind, RouteChoice>;
  fallbacks: RouteChoice[];
  manual?: RouteChoice | null;
  allowed: ReadonlySet<ProviderId>;
  configured: ReadonlySet<ProviderId>;
  allowFallback: boolean;
  /** The first choice was contacted and failed in a way that may be retried elsewhere. */
  primaryFailed: boolean;
}): { route: RouteChoice; fallbackFrom: RouteChoice | null } {
  const primary = input.manual ?? input.routes[input.taskKind];
  if (!input.allowed.has(primary.provider)) throw new RouteBlockedError("provider_not_allowed");

  const usable = (route: RouteChoice) =>
    input.allowed.has(route.provider) && input.configured.has(route.provider);

  if (!input.primaryFailed && usable(primary)) return { route: primary, fallbackFrom: null };
  if (!input.allowFallback) throw new RouteBlockedError("fallback_disabled");

  const next = input.fallbacks.find(
    (candidate) =>
      usable(candidate) &&
      !(candidate.provider === primary.provider && candidate.model === primary.model),
  );
  if (!next) throw new RouteBlockedError("no_route");
  return { route: next, fallbackFrom: primary };
}
