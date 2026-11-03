import type { ContentPart, GatewayMessage } from "./types";

export function partsOf(message: GatewayMessage): ContentPart[] {
  return typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : message.content;
}

export function textOf(message: GatewayMessage): string {
  return partsOf(message)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
