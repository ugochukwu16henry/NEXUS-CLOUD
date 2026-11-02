import { REDACTED } from "@nexus/observability";
import { describe, expect, it } from "vitest";
import { sentryOptions } from "./sentry";

describe("sentryOptions", () => {
  it("redacts secrets and emails before an event leaves the app", () => {
    const event = sentryOptions.beforeSend({
      type: undefined,
      message: "failed for henry@example.com with sb_secret_abcdefghijklmnop",
      request: { headers: { authorization: "Bearer abc.def.ghi", cookie: "sb-access=1" } },
      extra: { accessToken: "t0ps3cret" },
    });
    expect(event.message).toBe(`failed for h***@example.com with ${REDACTED}`);
    expect(event.request?.headers).toEqual({ authorization: REDACTED, cookie: REDACTED });
    expect(event.extra).toEqual({ accessToken: REDACTED });
  });

  it("collects no user data and no traces", () => {
    expect(sentryOptions.dataCollection.userInfo).toBe(false);
    expect(sentryOptions.tracesSampleRate).toBe(0);
  });
});
