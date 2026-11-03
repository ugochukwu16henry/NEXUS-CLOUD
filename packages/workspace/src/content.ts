/**
 * What an uploaded file really is, judged by its bytes rather than its name (T31): a PNG renamed
 * `.txt` is still a PNG, and an SVG is treated as active content that is never shown inline.
 */

export type ContentKind =
  | { kind: "image"; type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; inline: true }
  | { kind: "image"; type: "image/svg+xml"; inline: false }
  | { kind: "pdf"; type: "application/pdf"; inline: false }
  | { kind: "archive"; type: "application/zip"; inline: false }
  | { kind: "text"; type: "text/plain"; inline: false }
  | { kind: "binary"; type: "application/octet-stream"; inline: false };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** Looks at the first few kilobytes only; that is all the signatures need. */
export function detectContent(head: Uint8Array): ContentKind {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", type: "image/png", inline: true };
  }
  if (startsWith(head, [0xff, 0xd8, 0xff]))
    return { kind: "image", type: "image/jpeg", inline: true };
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38]))
    return { kind: "image", type: "image/gif", inline: true };
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { kind: "image", type: "image/webp", inline: true };
  }
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { kind: "pdf", type: "application/pdf", inline: false };
  }
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    return { kind: "archive", type: "application/zip", inline: false };
  }
  if (isBinary(head)) return { kind: "binary", type: "application/octet-stream", inline: false };
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head.slice(0, 1024)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) {
    return { kind: "image", type: "image/svg+xml", inline: false };
  }
  return { kind: "text", type: "text/plain", inline: false };
}

/** Git's own rule of thumb: a NUL byte in the first 8 KB means binary. */
export function isBinary(head: Uint8Array): boolean {
  return head.subarray(0, 8000).includes(0);
}
