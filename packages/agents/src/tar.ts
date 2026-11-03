import { gunzipSync } from "node:zlib";

/**
 * The small part of tar the sandbox needs: read a repository tarball (GitHub's are pax ustar,
 * gzipped, with one top-level folder) and write files for `tar -x` inside a container.
 */

export type TarFile = { path: string; bytes: Uint8Array };

const BLOCK = 512;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function field(block: Uint8Array, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return decoder.decode(end === -1 ? raw : raw.subarray(0, end));
}

function octal(block: Uint8Array, start: number, length: number): number {
  const text = field(block, start, length).trim();
  return text ? parseInt(text, 8) : 0;
}

function paxPath(bytes: Uint8Array): string | null {
  // Records are "<length> <key>=<value>\n".
  for (const record of decoder.decode(bytes).split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match) return match[1] ?? null;
  }
  return null;
}

/** Regular files in a tar archive. `strip` drops leading folders, as `tar --strip-components`. */
export function readTar(archive: Uint8Array, options: { strip?: number } = {}): TarFile[] {
  const data = archive[0] === 0x1f && archive[1] === 0x8b ? gunzipSync(archive) : archive;
  const files: TarFile[] = [];
  let offset = 0;
  let longName: string | null = null;
  while (offset + BLOCK <= data.length) {
    const header = data.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] ?? 0);
    const body = data.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      longName = paxPath(body);
      continue;
    }
    if (type === "L") {
      longName = field(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    const prefix = field(header, 345, 155);
    const name =
      longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longName = null;
    if (type !== "0" && type !== "\0") continue;
    const parts = name.split("/").slice(options.strip ?? 0);
    if (parts.length === 0 || parts.every((part) => part === "")) continue;
    files.push({ path: parts.join("/"), bytes: new Uint8Array(body) });
  }
  return files;
}

function header(name: string, size: number, type: string): Uint8Array {
  const block = new Uint8Array(BLOCK);
  const put = (text: string, start: number, length: number) => {
    block.set(encoder.encode(text).subarray(0, length), start);
  };
  put(name, 0, 100);
  put("0000644\0", 100, 8);
  put("0001750\0", 108, 8); // uid 1000
  put("0001750\0", 116, 8); // gid 1000
  put(size.toString(8).padStart(11, "0") + "\0", 124, 12);
  put("00000000000\0", 136, 12);
  put("        ", 148, 8);
  put(type, 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  let sum = 0;
  for (const byte of block) sum += byte;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return block;
}

function padded(bytes: Uint8Array): Uint8Array[] {
  const rest = bytes.length % BLOCK;
  return rest === 0 ? [bytes] : [bytes, new Uint8Array(BLOCK - rest)];
}

/** An uncompressed tar of regular files. Long paths use a pax header. */
export function writeTar(files: readonly TarFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const file of files) {
    if (encoder.encode(file.path).length > 99) {
      const body = encoder.encode(` path=${file.path}\n`).length;
      // The length prefix counts its own digits.
      let length = body + 1;
      while (String(length).length + body !== length) length = String(length).length + body;
      const pax = encoder.encode(`${length} path=${file.path}\n`);
      parts.push(header("././@PaxHeader", pax.length, "x"), ...padded(pax));
    }
    parts.push(header(file.path.slice(0, 99), file.bytes.length, "0"), ...padded(file.bytes));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
