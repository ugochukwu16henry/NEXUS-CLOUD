import { normalizePath } from "@nexus/workspace";
import { hashCommand, parseHashes, tail, type SandboxDriver, type SandboxSession } from "./driver";

/**
 * The managed driver (ADR 0019): each session is an E2B microVM, created on demand and killed
 * when the session ends or its lifetime runs out. Egress is denied except the allowlisted hosts
 * (E2B filters by host name for HTTP and HTTPS only; every other port and protocol is denied).
 */

const WORKDIR = "/home/user/work";
const WRITE_BATCH = 100;

function relative(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.ok) throw new Error(normalized.reason);
  return normalized.path;
}

function errorFields(error: unknown): { exitCode?: number; stdout?: string; stderr?: string } {
  return error && typeof error === "object" ? (error as Record<string, never>) : {};
}

export function createE2bDriver(options: { apiKey: string; template?: string }): SandboxDriver {
  return {
    name: "e2b",
    hostAllowlist: true,
    async open(open): Promise<SandboxSession> {
      const { Sandbox, TimeoutError } = await import("e2b");
      const sandboxOptions = {
        apiKey: options.apiKey,
        timeoutMs: open.limits.timeoutSeconds * 1000,
        metadata: { label: open.label.slice(0, 64) },
        envs: { CI: "1", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
        ...(open.allowlist.length > 0
          ? {
              network: {
                allowOut: [...open.allowlist],
                denyOut: ({ allTraffic }: { allTraffic: string }) => [allTraffic],
              },
            }
          : { allowInternetAccess: false }),
      };
      const sandbox = options.template
        ? await Sandbox.create(options.template, sandboxOptions)
        : await Sandbox.create(sandboxOptions);
      await sandbox.files.makeDir(WORKDIR);

      return {
        id: sandbox.sandboxId,
        async writeFiles(files) {
          for (let start = 0; start < files.length; start += WRITE_BATCH) {
            await sandbox.files.write(
              files.slice(start, start + WRITE_BATCH).map((file) => ({
                path: `${WORKDIR}/${relative(file.path)}`,
                data: file.bytes.slice().buffer,
              })),
            );
          }
        },
        async readFile(path) {
          try {
            return await sandbox.files.read(`${WORKDIR}/${relative(path)}`, { format: "bytes" });
          } catch {
            return null;
          }
        },
        async hashes(skipFolders) {
          const result = await sandbox.commands.run(hashCommand(skipFolders), {
            cwd: WORKDIR,
            timeoutMs: 5 * 60_000,
          });
          return parseHashes(result.stdout);
        },
        async run(command, runOptions) {
          try {
            const result = await sandbox.commands.run(command, {
              cwd: WORKDIR,
              timeoutMs: runOptions.timeoutMs,
              ...(runOptions.env ? { envs: runOptions.env } : {}),
            });
            return {
              code: result.exitCode,
              stdout: tail(result.stdout),
              stderr: tail(result.stderr),
              timedOut: false,
            };
          } catch (error) {
            if (error instanceof TimeoutError) {
              return { code: null, stdout: "", stderr: "timed out", timedOut: true };
            }
            const fields = errorFields(error);
            if (typeof fields.exitCode === "number") {
              return {
                code: fields.exitCode,
                stdout: tail(fields.stdout ?? ""),
                stderr: tail(fields.stderr ?? ""),
                timedOut: false,
              };
            }
            throw error;
          }
        },
        async shell(shellOptions) {
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          const handle = await sandbox.pty.create({
            cols: shellOptions.cols,
            rows: shellOptions.rows,
            cwd: WORKDIR,
            timeoutMs: 0,
            envs: { TERM: "xterm-256color", ...shellOptions.env },
            onData: (data) => shellOptions.onData(decoder.decode(data, { stream: true })),
          });
          void handle.wait().then(shellOptions.onExit, shellOptions.onExit);
          return {
            write(data) {
              void sandbox.pty.sendInput(handle.pid, encoder.encode(data)).catch(() => undefined);
            },
            resize(cols, rows) {
              void sandbox.pty.resize(handle.pid, { cols, rows }).catch(() => undefined);
            },
            async kill() {
              await sandbox.pty.kill(handle.pid).catch(() => undefined);
            },
          };
        },
        async close() {
          await sandbox.kill().catch(() => undefined);
        },
      };
    },
  };
}
