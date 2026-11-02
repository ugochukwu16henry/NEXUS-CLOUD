import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Browser errors are sent same-origin through the /monitoring tunnel, so the CSP needs no Sentry host.
if (sentryOptions.dsn) Sentry.init(sentryOptions);
