"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/** Last-resort error page for errors in the root layout; reports them to Sentry. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* The App Router doesn't expose a status code here, so 0 renders a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
