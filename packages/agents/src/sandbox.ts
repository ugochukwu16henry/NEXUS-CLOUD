import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { normalizePath } from "@nexus/workspace";
import {
  hashCommand,
  parseHashes,
  tail,
  type CommandResult,
  type SandboxDriver,
  type SandboxSession,
} from "./driver";
import { writeTar } from "./tar";

/**
 * The Docker driver (ADR 0005, 0019): laptops and CI. One long-lived container per session,
 * non-root, no capabilities, read-only root, a tmpfs work folder capped at the disk limit, and no
 * network unless NEXUS_SANDBOX_DOCKER_NETWORK=bridge (Docker cannot filter by host; production
 * uses the managed driver, which can).
 */

export type SandboxLimits = {
  cpus: number;
  memoryMb: number;
  pids: number;
  diskMb: number;
  timeoutSeconds: number;
};

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  cpus: 1,
  memoryMb: 1024,
  pids: 256,
  diskMb: 2048,
  timeoutSeconds: 30 * 60,
};

export const WORKDIR = "/work";
const HOME = "/home/sandbox";

export function sandboxImage(nodeMajor: number): string {
  return `node:${nodeMajor}-bookworm-slim`;
}

export function dockerArgs(
  limits: SandboxLimits,
  command: string[],
  options: { image?: string; name?: string; network?: "none" | "bridge"; detach?: boolean } = {},
): string[] {
  return [
    "run",
    options.detach ? "-d" : "--rm",
    ...(options.detach ? ["--rm"] : []),
    "--init",
    "--name",
    options.name ?? `nexus-sbx-${randomBytes(4).toString("hex")}`,
    "--label",
    "nexus.sandbox=1",
    "--network",
    options.network ?? "none",
    "--user",
    "1000:1000",
    "--cpus",
    String(limits.cpus),
    "--memory",
    `${limits.memoryMb}m`,
    "--pids-limit",
    String(limits.pids),
    "--read-only",
    "--tmpfs",
    `${WORKDIR}:rw,exec,nosuid,size=${limits.diskMb}m,uid=1000,gid=1000,mode=755`,
    "--tmpfs",
    `${HOME}:rw,exec,nosuid,size=${limits.diskMb}m,uid=1000,gid=1000,mode=755`,
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=256m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    `HOME=${HOME}`,
    "-e",
    `PATH=${HOME}/bin:/usr/local/bin:/usr/bin:/bin`,
    "-e",
    "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    "-e",
    "CI=1",
    "-w",
    WORKDIR,
    options.image ?? sandboxImage(24),
    ...command,
  ];
}

function docker(
  args: string[],
  options: { input?: Uint8Array; timeoutMs?: number; binary?: boolean } = {},
): Promise<CommandResult & { bytes: Uint8Array }> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      if (options.binary) chunks.push(chunk);
      else stdout = tail(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = tail(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: error.message, timedOut, bytes: new Uint8Array() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, bytes: new Uint8Array(Buffer.concat(chunks)) });
    });
    child.stdin.end(options.input ? Buffer.from(options.input) : undefined);
  });
}

function relative(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.ok) throw new Error(normalized.reason);
  return normalized.path;
}

export function createDockerDriver(
  options: { network?: "none" | "bridge"; image?: (nodeMajor: number) => string } = {},
): SandboxDriver {
  const network = options.network ?? "none";
  return {
    name: "docker",
    hostAllowlist: false,
    async open(open): Promise<SandboxSession> {
      const name = `nexus-sbx-${randomBytes(6).toString("hex")}`;
      const image = (options.image ?? sandboxImage)(open.nodeMajor);
      const started = await docker(
        dockerArgs(open.limits, ["sleep", String(open.limits.timeoutSeconds)], {
          name,
          image,
          network: open.allowlist.length > 0 ? network : "none",
          detach: true,
        }),
        { timeoutMs: 5 * 60_000 },
      );
      if (started.code !== 0) {
        throw new Error(`the sandbox could not start: ${started.stderr.trim().slice(0, 160)}`);
      }
      // pnpm and yarn come from corepack, which needs a writable folder for its shims.
      await docker([
        "exec",
        name,
        "sh",
        "-c",
        `mkdir -p ${HOME}/bin && for tool in pnpm yarn; do printf '#!/bin/sh\\nexec corepack %s "$@"\\n' $tool > ${HOME}/bin/$tool; chmod 755 ${HOME}/bin/$tool; done`,
      ]);
      const envArgs = (env: Record<string, string> = {}) =>
        Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

      return {
        id: name,
        async writeFiles(files) {
          if (files.length === 0) return;
          const tar = writeTar(files.map((file) => ({ ...file, path: relative(file.path) })));
          const result = await docker(["exec", "-i", name, "tar", "-x", "-C", WORKDIR], {
            input: tar,
            timeoutMs: 5 * 60_000,
          });
          if (result.code !== 0) throw new Error(`write failed: ${result.stderr.slice(0, 160)}`);
        },
        async readFile(path) {
          const result = await docker(["exec", name, "cat", "--", `${WORKDIR}/${relative(path)}`], {
            binary: true,
            timeoutMs: 60_000,
          });
          return result.code === 0 ? result.bytes : null;
        },
        async hashes(skipFolders) {
          const result = await docker(
            ["exec", "-w", WORKDIR, name, "sh", "-c", hashCommand(skipFolders)],
            // The full listing, not the tail kept for command output.
            { timeoutMs: 5 * 60_000, binary: true },
          );
          if (result.code !== 0) throw new Error("could not list the sandbox files");
          return parseHashes(new TextDecoder().decode(result.bytes));
        },
        async run(command, runOptions) {
          const seconds = Math.max(1, Math.ceil(runOptions.timeoutMs / 1000));
          const result = await docker(
            [
              "exec",
              "-w",
              WORKDIR,
              ...envArgs(runOptions.env),
              name,
              "timeout",
              "-s",
              "KILL",
              String(seconds),
              "sh",
              "-c",
              command,
            ],
            { timeoutMs: runOptions.timeoutMs + 10_000 },
          );
          return {
            code: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: result.timedOut || result.code === 137,
          };
        },
        async shell(shellOptions) {
          // `script` gives the shell a pseudo-terminal, so prompts and line editing work.
          const child = spawn(
            "docker",
            [
              "exec",
              "-i",
              "-w",
              WORKDIR,
              ...envArgs({ TERM: "xterm-256color", ...shellOptions.env }),
              name,
              "script",
              "-qfc",
              "bash",
              "/dev/null",
            ],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => shellOptions.onData(chunk));
          child.stderr.on("data", (chunk: string) => shellOptions.onData(chunk));
          child.on("close", () => shellOptions.onExit());
          child.on("error", () => shellOptions.onExit());
          return {
            write(data) {
              child.stdin.write(data);
            },
            // Without a terminal on the host side, `script` keeps its own size.
            resize() {},
            async kill() {
              child.kill("SIGKILL");
            },
          };
        },
        async close() {
          await docker(["rm", "-f", name], { timeoutMs: 30_000 });
        },
      };
    },
  };
}

export type SandboxRun = CommandResult;

/** One command in a throwaway container (the limits tests). */
export async function runSandbox(
  command: string[],
  options: { limits?: SandboxLimits; image?: string } = {},
): Promise<SandboxRun> {
  const limits = options.limits ?? DEFAULT_SANDBOX_LIMITS;
  const name = `nexus-sbx-${randomBytes(4).toString("hex")}`;
  const result = await docker(
    dockerArgs(limits, command, { name, ...(options.image ? { image: options.image } : {}) }),
    { timeoutMs: limits.timeoutSeconds * 1000 },
  );
  if (result.timedOut) await docker(["rm", "-f", name], { timeoutMs: 30_000 });
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}
