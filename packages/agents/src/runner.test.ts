import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseCoderAction, runCoder, coderInstructions } from "./coder";
import { createRecordedDriver, hashCommand, parseHashes, sha256 } from "./driver";
import { decideCommand } from "./policy";
import { DEFAULT_SANDBOX_LIMITS } from "./sandbox";
import { buildSnapshot, diffSnapshot } from "./snapshot";
import { readTar, writeTar } from "./tar";

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("tar", () => {
  it("round-trips files, long paths included, and strips the top folder of a gzipped archive", () => {
    const long = `deep/${"a".repeat(120)}/file.ts`;
    const files = [
      { path: "repo-abc/README.md", bytes: enc("# hi\n") },
      { path: `repo-abc/${long}`, bytes: enc("x".repeat(700)) },
      { path: "repo-abc/empty.txt", bytes: new Uint8Array() },
    ];
    const archive = gzipSync(writeTar(files));
    const read = readTar(new Uint8Array(archive), { strip: 1 });
    expect(read.map((file) => file.path)).toEqual(["README.md", long, "empty.txt"]);
    expect(dec(read[0]!.bytes)).toBe("# hi\n");
    expect(read[1]!.bytes.length).toBe(700);
  });
});

describe("snapshot and sync", () => {
  const repoFiles = [
    { path: "README.md", bytes: enc("readme\n") },
    { path: "src/index.ts", bytes: enc("export const a = 1;\n") },
    { path: "node_modules/x/index.js", bytes: enc("skip\n") },
    { path: "big.bin", bytes: new Uint8Array(50) },
  ];

  it("starts from the repository plus the change set, without skipped or oversized files", () => {
    const snapshot = buildSnapshot({
      repoFiles,
      overlay: [
        { path: "src/new.ts", change: "add", bytes: enc("new\n") },
        { path: "README.md", change: "delete" },
      ],
      skipFolders: ["node_modules"],
      maxFileBytes: 40,
    });
    expect(snapshot.files.map((file) => file.path).sort()).toEqual(["src/index.ts", "src/new.ts"]);
    expect(snapshot.skipped).toBe(2);
    expect(snapshot.repo.has("README.md")).toBe(true);
  });

  it("reports writes against the repository, deletions and reverts", () => {
    const snapshot = buildSnapshot({
      repoFiles,
      overlay: [{ path: "src/new.ts", change: "add", bytes: enc("new\n") }],
      skipFolders: ["node_modules"],
      maxFileBytes: 1000,
    });
    const current = new Map(snapshot.baseline);
    current.set("src/index.ts", sha256(enc("export const a = 2;\n"))); // modified
    current.set("src/other.ts", sha256(enc("other\n"))); // added
    current.delete("README.md"); // deleted from the repository
    current.delete("src/new.ts"); // an earlier add, removed again
    current.set("node_modules/y/index.js", sha256(enc("ignored\n")));
    expect(diffSnapshot(snapshot, current, ["node_modules"])).toEqual([
      { kind: "delete", path: "README.md" },
      { kind: "write", path: "src/index.ts", change: "modify" },
      { kind: "revert", path: "src/new.ts" },
      { kind: "write", path: "src/other.ts", change: "add" },
    ]);

    // Back to the repository's version: the change set row goes.
    const edited = { ...snapshot, baseline: new Map(current) };
    const restored = new Map(current);
    restored.set("src/index.ts", sha256(enc("export const a = 1;\n")));
    expect(diffSnapshot(edited, restored, ["node_modules"])).toEqual([
      { kind: "revert", path: "src/index.ts" },
    ]);
  });

  it("parses the sandbox hash listing and quotes skipped folder names", () => {
    const hash = "a".repeat(64);
    expect(parseHashes(`${hash}  ./src/a b.ts\nnoise\n`)).toEqual(new Map([["src/a b.ts", hash]]));
    expect(hashCommand(["node_modules", "it's"])).toContain(`-name 'it'\\''s'`);
  });
});

describe("command policy and file names", () => {
  it("does not mistake a script file for a network host", () => {
    expect(decideCommand("node scripts/check.mjs", { mode: "safe_list" }).effect).toBe("approve");
    expect(decideCommand("curl https://evil.example.com", { mode: "safe_list" }).effect).toBe(
      "deny",
    );
  });
});

describe("coding agent", () => {
  it("parses only well-formed actions", () => {
    expect(parseCoderAction({ tool: "read_file", path: "a.ts" })).toEqual({
      tool: "read_file",
      path: "a.ts",
    });
    expect(parseCoderAction({ tool: "write_file", path: "a.ts" })).toBeNull();
    expect(parseCoderAction({ tool: "rm", path: "/" })).toBeNull();
    expect(parseCoderAction("finish")).toBeNull();
  });

  async function session() {
    const sandbox = await createRecordedDriver().open({
      limits: DEFAULT_SANDBOX_LIMITS,
      nodeMajor: 24,
      allowlist: [],
      label: "test",
    });
    await sandbox.writeFiles([{ path: "src/index.ts", bytes: enc("export const a = 1;\n") }]);
    return sandbox;
  }

  function scripted(steps: unknown[]) {
    let call = 0;
    return async () => {
      const parsed = steps[Math.min(call, steps.length - 1)];
      call += 1;
      return { parsed, text: JSON.stringify(parsed), costUsdMicros: 1000 };
    };
  }

  const base = {
    maxIterations: 10,
    budgetUsdMicros: 100_000,
    spentUsdMicros: 0,
    commandTimeoutMs: 1000,
    env: {},
    skipFolders: ["node_modules"],
    decide: (command: string) => decideCommand(command, { mode: "safe_list" }),
  };

  it("reads, writes inside the sandbox, runs a safe command and finishes", async () => {
    const sandbox = await session();
    const events: string[] = [];
    const result = await runCoder({
      ...base,
      session: sandbox,
      messages: coderInstructions({ purpose: "bump a", plan: "1. bump", testCommand: "pnpm test" }),
      complete: scripted([
        { tool: "read_file", path: "src/index.ts" },
        { tool: "write_file", path: "src/index.ts", content: "export const a = 2;\n" },
        { tool: "write_file", path: "../escape.ts", content: "x" },
        { tool: "run_command", command: "pnpm test" },
        { tool: "run_command", command: "printenv" },
        { tool: "finish", summary: "Bumped a." },
      ]),
      onEvent: async (event) => void events.push(`${event.kind}: ${event.summary}`),
    });
    expect(result.status).toBe("done");
    expect(result.summary).toBe("Bumped a.");
    expect(result.spentUsdMicros).toBe(6000);
    expect(dec((await sandbox.readFile("src/index.ts"))!)).toBe("export const a = 2;\n");
    expect(events.some((event) => event.startsWith("finding: Write refused"))).toBe(true);
    expect(events).toContain("command: pnpm test — exit 0");
    expect(events.some((event) => event.includes("Command refused: printenv"))).toBe(true);
    // File contents reach the model labelled as untrusted data.
    expect(JSON.stringify(result.messages)).toContain('untrusted-content source=\\"repository\\"');
  });

  it("pauses for a command that needs the owner, keeping the conversation", async () => {
    const result = await runCoder({
      ...base,
      session: await session(),
      messages: [],
      complete: scripted([{ tool: "run_command", command: "node scripts/check.mjs" }]),
      onEvent: async () => undefined,
    });
    expect(result.status).toBe("approval");
    expect(result.pendingCommand).toBe("node scripts/check.mjs");
    expect(result.messages).toHaveLength(1);
  });

  it("stops at the step limit and at the budget", async () => {
    const forever = scripted([{ tool: "list_files" }]);
    const capped = await runCoder({
      ...base,
      maxIterations: 3,
      session: await session(),
      messages: [],
      complete: forever,
      onEvent: async () => undefined,
    });
    expect(capped).toMatchObject({ status: "capped", iterations: 3 });
    const broke = await runCoder({
      ...base,
      budgetUsdMicros: 2500,
      session: await session(),
      messages: [],
      complete: forever,
      onEvent: async () => undefined,
    });
    expect(broke).toMatchObject({ status: "budget", iterations: 3 });
  });
});
