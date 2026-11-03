import { describe, expect, it } from "vitest";
import { detectContent } from "./content";
import { diffText } from "./diff";
import { canWriteBranch, commitMessage, taskBranchName } from "./git";
import { decideLock } from "./lock";
import { attachmentName, normalizePath, skipReason } from "./paths";
import { scanForSecrets } from "./secrets";
import { DEFAULT_LIMITS, planUpload } from "./uploads";

// Fake credentials are assembled at runtime so this file never contains one (gitleaks, Semgrep).
const fake = (...parts: string[]) => parts.join("");

describe("path guard (T09, T31)", () => {
  it.each([
    ["src/app.ts", "src/app.ts"],
    ["./src/app.ts", "src/app.ts"],
    ["docs\\guide\\intro.md", "docs/guide/intro.md"],
    [".github/workflows/ci.yml", ".github/workflows/ci.yml"],
    ["assets/logo final.png", "assets/logo final.png"],
  ])("accepts %j as %j", (input, path) => {
    expect(normalizePath(input)).toEqual({ ok: true, path });
  });

  it.each([
    ["../secrets.txt", "path climbs out of the repository"],
    ["src/../../etc/passwd", "path climbs out of the repository"],
    ["/etc/passwd", "absolute path"],
    ["C:\\Windows\\win.ini", "absolute path"],
    ["\\\\server\\share", "absolute path"],
    [".git/config", "git internals"],
    ["src/.GIT/hooks/pre-commit", "git internals"],
    ["src//app.ts", "empty folder name"],
    ["bad\u0000name.ts", "control characters"],
    ["", "empty name"],
    [`${"a".repeat(256)}.ts`, "name too long"],
  ])("rejects %j (%s)", (input, reason) => {
    expect(normalizePath(input)).toEqual({ ok: false, reason });
  });

  it("skips dependency folders and OS junk at any depth", () => {
    const skip = DEFAULT_LIMITS.skipFolders;
    expect(skipReason("web/node_modules/react/index.js", skip)).toBe("node_modules is skipped");
    expect(skipReason("app/.next/cache/x", skip)).toBe(".next is skipped");
    expect(skipReason("photos/.DS_Store", skip)).toBe("system file");
    expect(skipReason("__MACOSX/a.png", skip)).toBe("system folder");
    expect(skipReason("src/build-tools/x.ts", skip)).toBeNull(); // whole names only
  });

  it("makes safe attachment names", () => {
    expect(attachmentName("C:\\Users\\me\\Screenshot 1.png")).toBe("Screenshot 1.png");
    expect(attachmentName("../..")).toBe("file");
  });
});

describe("upload plan", () => {
  it("accepts a nested folder, lists skipped files, rejects bad names one by one", () => {
    const plan = planUpload(
      [
        { path: "site/index.html", size: 100 },
        { path: "site/css/app.css", size: 50 },
        { path: "site/node_modules/x/index.js", size: 10 },
        { path: "site/../escape.txt", size: 1 },
      ],
      DEFAULT_LIMITS,
    );
    expect(plan).toEqual({
      ok: true,
      accepted: [
        { path: "site/index.html", size: 100 },
        { path: "site/css/app.css", size: 50 },
      ],
      skipped: [{ path: "site/node_modules/x/index.js", reason: "node_modules is skipped" }],
      rejected: [{ path: "site/../escape.txt", reason: "path climbs out of the repository" }],
    });
  });

  it("rejects a file over the per-file limit", () => {
    const plan = planUpload([{ path: "video.mp4", size: 26 * 1024 * 1024 }], DEFAULT_LIMITS);
    expect(plan).toMatchObject({
      ok: true,
      accepted: [],
      rejected: [{ reason: "larger than 25 MB" }],
    });
  });

  it("refuses 1,001 files, and over 200 MB, with a message to act on", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ path: `f/${i}.txt`, size: 1 }));
    expect(planUpload(many, DEFAULT_LIMITS)).toMatchObject({
      ok: false,
      message: /1001 files.*limit is 1000/,
    });
    const big = Array.from({ length: 9 }, (_, i) => ({
      path: `big/${i}.bin`,
      size: 24 * 1024 * 1024,
    }));
    expect(planUpload(big, DEFAULT_LIMITS)).toMatchObject({
      ok: false,
      message: /limit is 200 MB/,
    });
  });

  it("rejects the same path twice, ignoring case", () => {
    const plan = planUpload(
      [
        { path: "README.md", size: 1 },
        { path: "readme.md", size: 1 },
      ],
      DEFAULT_LIMITS,
    );
    expect(plan).toMatchObject({
      ok: true,
      rejected: [{ path: "readme.md", reason: "appears twice" }],
    });
  });
});

describe("content detection (T31)", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const text = (value: string) => new TextEncoder().encode(value);

  it("detects images by their bytes, whatever the file is called", () => {
    expect(detectContent(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toMatchObject({
      type: "image/png",
      inline: true,
    });
    expect(detectContent(bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ type: "image/jpeg" });
    expect(detectContent(text("GIF89a"))).toMatchObject({ type: "image/gif" });
    expect(
      detectContent(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)),
    ).toMatchObject({ type: "image/webp" });
    expect(detectContent(text("%PDF-1.7"))).toMatchObject({ kind: "pdf" });
    expect(detectContent(bytes(0x50, 0x4b, 0x03, 0x04))).toMatchObject({ kind: "archive" });
  });

  it("treats SVG as active content that is never shown inline", () => {
    const svg =
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect(detectContent(text(svg))).toEqual({
      kind: "image",
      type: "image/svg+xml",
      inline: false,
    });
  });

  it("tells text from binary", () => {
    expect(detectContent(text("export const a = 1;\n"))).toMatchObject({ kind: "text" });
    expect(detectContent(bytes(0x01, 0x00, 0x02))).toMatchObject({ kind: "binary" });
  });
});

describe("secret scan (T22, T31)", () => {
  it.each([
    [".env", null, ".env usually holds secrets"],
    ["config/.env.production", null, ".env.production usually holds secrets"],
    ["keys/deploy.pem", null, "deploy.pem usually holds secrets"],
    ["id_rsa", null, "id_rsa usually holds secrets"],
    [
      "notes.txt",
      fake("-----BEGIN ", "PRIVATE KEY-----\nabc"),
      "looks like it contains a private key",
    ],
    [
      "app.ts",
      `const t = "${fake("ghp_", "a".repeat(36))}"`,
      "looks like it contains a GitHub token",
    ],
    [
      "app.ts",
      `key = ${fake("AKIA", "ABCDEFGHIJKLMNOP")}`,
      "looks like it contains a AWS access key",
    ],
  ])("holds back %s", (path, content, reason) => {
    expect(scanForSecrets(path, content)).toEqual({ reason });
  });

  it("lets ordinary files and env templates through", () => {
    expect(scanForSecrets(".env.example", "API_URL=http://localhost")).toBeNull();
    expect(scanForSecrets("src/app.ts", "export const key = process.env.KEY;")).toBeNull();
  });
});

describe("branch and commit rules (T09)", () => {
  it("names task branches from the task", () => {
    expect(taskBranchName(12, "Password reset!")).toBe("task/NX-12-password-reset");
    expect(taskBranchName(3, "Créer la page d'accueil")).toBe("task/NX-3-creer-la-page-d-accueil");
    expect(taskBranchName(4, "!!!")).toBe("task/NX-4");
  });

  const repo = { defaultBranch: "main", protectedBranches: ["release"] };
  it("writes only to task branches, never main or a protected branch", () => {
    expect(canWriteBranch("task/NX-12-reset", repo)).toEqual({ ok: true });
    expect(canWriteBranch("main", repo)).toMatchObject({ ok: false });
    expect(canWriteBranch("release", repo)).toMatchObject({ ok: false });
    expect(canWriteBranch("feature/x", repo)).toMatchObject({ ok: false });
    expect(canWriteBranch("task/NX-1/../../main", repo)).toMatchObject({ ok: false });
  });

  it("builds commit messages that start with the task", () => {
    expect(commitMessage(12, "  validate   email ")).toBe("NX-12: validate email");
    expect(commitMessage(12, "NX-12: already prefixed")).toBe("NX-12: already prefixed");
    expect(commitMessage(12, "")).toBe("NX-12: Update files");
    expect(commitMessage(1, "x".repeat(100)).length).toBe(72);
    expect(commitMessage(1, "Add form", "Uploaded 3 files")).toBe(
      "NX-1: Add form\n\nUploaded 3 files",
    );
  });
});

describe("edit lock", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("is granted when free, expired, or already yours", () => {
    expect(decideLock({ lockedBy: null, lockedUntil: null }, "me", now)).toEqual({
      ok: true,
      lockedUntil: "2026-11-05T10:10:00.000Z",
    });
    expect(
      decideLock({ lockedBy: "agent", lockedUntil: "2026-11-05T09:59:00Z" }, "me", now),
    ).toMatchObject({ ok: true });
    expect(
      decideLock({ lockedBy: "me", lockedUntil: "2026-11-05T10:05:00Z" }, "me", now),
    ).toMatchObject({ ok: true });
  });
  it("is refused while someone else holds it", () => {
    expect(
      decideLock({ lockedBy: "agent", lockedUntil: "2026-11-05T10:05:00Z" }, "me", now),
    ).toEqual({
      ok: false,
      heldBy: "agent",
      until: "2026-11-05T10:05:00Z",
    });
  });
});

describe("diff", () => {
  it("numbers lines on both sides and counts changes", () => {
    const result = diffText("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.hunks[0]!.lines).toEqual([
      { kind: "context", text: "a", oldLine: 1, newLine: 1 },
      { kind: "removed", text: "b", oldLine: 2, newLine: null },
      { kind: "added", text: "B", oldLine: null, newLine: 2 },
      { kind: "context", text: "c", oldLine: 3, newLine: 3 },
      { kind: "added", text: "d", oldLine: null, newLine: 4 },
    ]);
  });
  it("is empty when nothing changed", () => {
    expect(diffText("same\n", "same\n")).toEqual({ added: 0, removed: 0, hunks: [] });
  });
});
