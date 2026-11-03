import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readZip, sha256Hex, ZipTooLargeError } from "./zip";

const enc = (text: string) => new TextEncoder().encode(text);
const LIMITS = { maxFiles: 10, maxUploadMb: 1, maxFileMb: 1 };

describe("readZip", () => {
  it("keeps the folder structure and drops folder entries and OS junk", () => {
    const zip = zipSync({
      "site/index.html": enc("<h1>hi</h1>"),
      "site/css/app.css": enc("body{}"),
      "site/.DS_Store": enc("x"),
      "__MACOSX/site/._index.html": enc("x"),
    });
    const { files, skipped } = readZip(zip, LIMITS);
    expect(files.map((file) => file.path).sort()).toEqual(["site/css/app.css", "site/index.html"]);
    expect(new TextDecoder().decode(files.find((f) => f.path === "site/index.html")!.bytes)).toBe(
      "<h1>hi</h1>",
    );
    expect(skipped).toEqual([]);
  });

  it("skips a file over the per-file limit without unpacking it", () => {
    const zip = zipSync({ "big.bin": new Uint8Array(2 * 1024 * 1024), "ok.txt": enc("ok") });
    const { files, skipped } = readZip(zip, { ...LIMITS, maxUploadMb: 10 });
    expect(files.map((file) => file.path)).toEqual(["ok.txt"]);
    expect(skipped[0]).toContain("big.bin");
  });

  it("refuses an archive that unpacks past the upload limits (zip bomb)", () => {
    // Zeros compress to almost nothing; the declared size is what counts.
    const entries = Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [`part${i}.bin`, new Uint8Array(900 * 1024)]),
    );
    const zip = zipSync(entries, { level: 9 });
    expect(zip.byteLength).toBeLessThan(20_000);
    expect(() => readZip(zip, LIMITS)).toThrow(ZipTooLargeError);
    const many = zipSync(
      Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, enc("x")])),
    );
    expect(() => readZip(many, LIMITS)).toThrow(ZipTooLargeError);
  });

  it("hashes like the server", async () => {
    expect(await sha256Hex(enc("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
