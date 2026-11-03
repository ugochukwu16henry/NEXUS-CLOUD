import { unzipSync } from "fflate";

/**
 * Zip handling in the browser. Phones can't pick a folder, so a zipped folder is unpacked here and
 * each file goes through the normal upload checks (the server re-checks every file it receives).
 * Sizes are read from the zip's directory before anything is inflated, so an archive that would
 * unpack past the upload limits is refused without being expanded.
 */

export type ZipEntry = { path: string; bytes: Uint8Array };

/** Finder and Windows add these; they are never part of a project. */
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

export class ZipTooLargeError extends Error {
  override name = "ZipTooLargeError";
}

export function readZip(
  data: Uint8Array,
  limits: { maxFiles: number; maxUploadMb: number; maxFileMb: number },
): { files: ZipEntry[]; skipped: string[] } {
  let total = 0;
  let count = 0;
  const skipped: string[] = [];
  const entries = unzipSync(data, {
    filter: (file) => {
      if (file.name.endsWith("/") || JUNK.test(file.name)) return false;
      if (file.originalSize > limits.maxFileMb * 1024 * 1024) {
        skipped.push(`${file.name} (larger than ${limits.maxFileMb} MB)`);
        return false;
      }
      total += file.originalSize;
      count += 1;
      if (total > limits.maxUploadMb * 1024 * 1024 || count > limits.maxFiles) {
        throw new ZipTooLargeError(
          `This zip unpacks to more than ${limits.maxFiles} files or ${limits.maxUploadMb} MB. Raise the limits in Project → Settings → Workspace, or split it.`,
        );
      }
      return true;
    },
  });
  return {
    files: Object.entries(entries).map(([path, bytes]) => ({ path, bytes })),
    skipped,
  };
}

/** Unpacks a picked .zip into files the uploader accepts, keeping the folder structure. */
export async function filesFromZip(
  zip: File,
  limits: { maxFiles: number; maxUploadMb: number; maxFileMb: number },
): Promise<{ files: { file: File; path: string }[]; skipped: string[] }> {
  const { files, skipped } = readZip(new Uint8Array(await zip.arrayBuffer()), limits);
  return {
    files: files.map(({ path, bytes }) => ({
      path,
      file: new File([bytes.slice().buffer], path.split("/").at(-1) ?? path),
    })),
    skipped,
  };
}

export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes instanceof Uint8Array ? bytes.slice().buffer : bytes,
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
