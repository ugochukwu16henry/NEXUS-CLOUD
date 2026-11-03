import { createHash, randomBytes } from "node:crypto";
import type { SandboxLimits } from "./sandbox";

/**
 * One interface for every place a sandbox can run (ADR 0019). The worker never knows which:
 * Docker on a laptop or in CI, a managed microVM service (E2B) in production, or the recorded
 * driver for local tests. Paths are relative to the sandbox's working folder.
 */

export type SandboxFile = { path: string; bytes: Uint8Array };

export type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type ShellHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): Promise<void>;
};

export type SandboxSession = {
  readonly id: string;
  writeFiles(files: readonly SandboxFile[]): Promise<void>;
  readFile(path: string): Promise<Uint8Array | null>;
  /** sha256 of every file, skipping the given folder names anywhere in the tree. */
  hashes(skipFolders: readonly string[]): Promise<Map<string, string>>;
  run(
    command: string,
    options: { timeoutMs: number; env?: Record<string, string> },
  ): Promise<CommandResult>;
  shell(options: {
    cols: number;
    rows: number;
    env?: Record<string, string>;
    onData: (chunk: string) => void;
    onExit: () => void;
  }): Promise<ShellHandle>;
  close(): Promise<void>;
};

export type SandboxOpenOptions = {
  limits: SandboxLimits;
  nodeMajor: number;
  /** Hosts the sandbox may reach (HTTP and HTTPS). Empty means no network at all. */
  allowlist: readonly string[];
  label: string;
};

export type SandboxDriverName = "docker" | "e2b" | "recorded";

export type SandboxDriver = {
  readonly name: SandboxDriverName;
  /** Whether the driver can filter egress by host; Docker can only switch it on or off. */
  readonly hostAllowlist: boolean;
  open(options: SandboxOpenOptions): Promise<SandboxSession>;
};

/** Hosts a build needs: the npm registry and GitHub (source, releases, raw files). */
export const SANDBOX_EGRESS = [
  "registry.npmjs.org",
  "github.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
] as const;

/** Output kept per command; anything longer keeps its tail. */
export const OUTPUT_LIMIT = 8000;

export function tail(text: string): string {
  return text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Single-quote a word for `sh`. */
export function shellQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/** `find` that prunes skipped folders and prints "<sha256>  ./<path>" per file. */
export function hashCommand(skipFolders: readonly string[]): string {
  const names = [".git", ...skipFolders.filter((name) => /^[^/\0]{1,100}$/.test(name))];
  const prune = names.map((name) => `-name ${shellQuote(name)}`).join(" -o ");
  return `find . -type d \\( ${prune} \\) -prune -o -type f -exec sha256sum {} +`;
}

export function parseHashes(output: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^([0-9a-f]{64}) [ *]\.\/(.+)$/.exec(line);
    if (match?.[1] && match[2]) found.set(match[2], match[1]);
  }
  return found;
}

/**
 * In-memory files and recorded command output, for local tests and the fixture E2E run.
 * Nothing executes: a command reports that it was recorded, and exits 0.
 */
export function createRecordedDriver(): SandboxDriver {
  return {
    name: "recorded",
    hostAllowlist: true,
    async open() {
      const files = new Map<string, Uint8Array>();
      return {
        id: `recorded-${randomBytes(4).toString("hex")}`,
        async writeFiles(list) {
          for (const file of list) files.set(file.path, file.bytes);
        },
        async readFile(path) {
          return files.get(path) ?? null;
        },
        async hashes(skipFolders) {
          const skip = new Set([".git", ...skipFolders]);
          const found = new Map<string, string>();
          for (const [path, bytes] of files) {
            if (path.split("/").some((part) => skip.has(part))) continue;
            found.set(path, sha256(bytes));
          }
          return found;
        },
        async run(command) {
          return { code: 0, stdout: `recorded: ${command}\n`, stderr: "", timedOut: false };
        },
        async shell(options) {
          let line = "";
          options.onData("recorded shell\r\n$ ");
          return {
            write(data) {
              line += data;
              // A terminal sends Enter as a carriage return.
              if (!/[\r\n]/.test(line)) return;
              const command = line.trim();
              line = "";
              const listing = [...files.keys()].sort().join("\r\n");
              const out = command === "ls" ? listing : `recorded: ${command}`;
              options.onData(`\r\n${out}\r\n$ `);
            },
            resize() {},
            async kill() {
              options.onExit();
            },
          };
        },
        async close() {
          files.clear();
        },
      };
    },
  };
}
