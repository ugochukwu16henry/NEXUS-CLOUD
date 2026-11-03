import { describe, expect, it } from "vitest";
import { PROVISIONAL_FALLBACKS, PROVISIONAL_ROUTES } from "./prices";
import { chooseRoute, RouteBlockedError } from "./router";

const configured = new Set(["anthropic" as const, "openai" as const]);
const allowed = new Set(["anthropic" as const, "openai" as const]);

describe("router", () => {
  it("uses the configured model for each task type", () => {
    expect(
      chooseRoute({
        taskKind: "planning",
        routes: PROVISIONAL_ROUTES,
        fallbacks: [...PROVISIONAL_FALLBACKS],
        allowed,
        configured,
        allowFallback: false,
        primaryFailed: false,
      }).route,
    ).toEqual(PROVISIONAL_ROUTES.planning);
    expect(
      chooseRoute({
        taskKind: "routine",
        routes: PROVISIONAL_ROUTES,
        fallbacks: [...PROVISIONAL_FALLBACKS],
        allowed,
        configured,
        allowFallback: false,
        primaryFailed: false,
      }).route.model,
    ).toBe("gpt-6-luna");
  });

  it("prefers a manual model when the project allows that provider", () => {
    const choice = chooseRoute({
      taskKind: "planning",
      routes: PROVISIONAL_ROUTES,
      fallbacks: [...PROVISIONAL_FALLBACKS],
      manual: { provider: "openai", model: "gpt-6.1-sol" },
      allowed,
      configured,
      allowFallback: false,
      primaryFailed: false,
    });
    expect(choice.route).toEqual({ provider: "openai", model: "gpt-6.1-sol" });
    expect(choice.fallbackFrom).toBeNull();
  });

  it("blocks a provider the project has switched off", () => {
    expect(() =>
      chooseRoute({
        taskKind: "planning",
        routes: PROVISIONAL_ROUTES,
        fallbacks: [...PROVISIONAL_FALLBACKS],
        allowed: new Set(["openai"]),
        configured,
        allowFallback: true,
        primaryFailed: false,
      }),
    ).toThrow(RouteBlockedError);
  });

  it("does not switch models unless the project allows fallback", () => {
    expect(() =>
      chooseRoute({
        taskKind: "planning",
        routes: PROVISIONAL_ROUTES,
        fallbacks: [...PROVISIONAL_FALLBACKS],
        allowed,
        configured,
        allowFallback: false,
        primaryFailed: true,
      }),
    ).toThrow(/fallback_disabled/);
  });

  it("records which model it left when fallback is allowed", () => {
    const choice = chooseRoute({
      taskKind: "planning",
      routes: PROVISIONAL_ROUTES,
      fallbacks: [...PROVISIONAL_FALLBACKS],
      allowed,
      configured,
      allowFallback: true,
      primaryFailed: true,
    });
    expect(choice.fallbackFrom).toEqual(PROVISIONAL_ROUTES.planning);
    expect(choice.route.provider).toBe("openai");
  });
});
