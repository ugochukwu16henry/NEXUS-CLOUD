import { testEnv } from "./env";

type MailpitSearch = { messages: { ID: string; Created: string }[] };

export async function clearMailbox(): Promise<void> {
  await fetch(`${testEnv.mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

export async function countMessagesTo(email: string): Promise<number> {
  const response = await fetch(
    `${testEnv.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  return ((await response.json()) as MailpitSearch).messages.length;
}

/** Waits for the newest sign-in email to `email` sent after `since`, and returns its link. */
export async function waitForMagicLink(
  email: string,
  since: Date,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${testEnv.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await response.json()) as MailpitSearch;
    const latest = messages.find((message) => new Date(message.Created) >= since);
    if (latest) {
      const message = (await (
        await fetch(`${testEnv.mailpitUrl}/api/v1/message/${latest.ID}`)
      ).json()) as {
        Text: string;
        HTML: string;
      };
      const link = `${message.HTML}\n${message.Text}`.match(
        /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/,
      );
      if (!link) throw new Error("Sign-in email has no verification link");
      return link[0].replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in email for ${email} within ${timeoutMs} ms`);
}
