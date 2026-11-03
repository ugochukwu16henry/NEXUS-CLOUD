import { describe, expect, it } from "vitest";
import { DEFAULT_SANDBOX_LIMITS, createDockerDriver, runSandbox } from "./sandbox";

// Real Docker: run with NEXUS_SANDBOX_TESTS=1 (pnpm --filter @nexus/agents test:sandbox).
const enabled = process.env.NEXUS_SANDBOX_TESTS === "1";
const enc = (text: string) => new TextEncoder().encode(text);

describe.skipIf(!enabled)("docker sandbox", () => {
  it("runs as non-root with no route to an arbitrary host", async () => {
    const who = await runSandbox(["id", "-u"], {
      limits: { ...DEFAULT_SANDBOX_LIMITS, timeoutSeconds: 120 },
    });
    expect(who.timedOut).toBe(false);
    expect(who.stdout.trim()).toBe("1000");

    const egress = await runSandbox(
      [
        "node",
        "-e",
        "fetch('http://1.1.1.1',{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(0),()=>process.exit(3))",
      ],
      { limits: { ...DEFAULT_SANDBOX_LIMITS, timeoutSeconds: 30 } },
    );
    expect(egress.code).toBe(3);
  }, 300_000);

  it("kills an infinite loop, a process storm, and a write past the disk cap", async () => {
    const loop = await runSandbox(["sh", "-c", "while true; do :; done"], {
      limits: { ...DEFAULT_SANDBOX_LIMITS, timeoutSeconds: 3 },
    });
    expect(loop.timedOut).toBe(true);

    const storm = await runSandbox(
      ["sh", "-c", "i=0; while [ $i -lt 80 ]; do i=$((i+1)); sleep 30 & done; wait"],
      { limits: { ...DEFAULT_SANDBOX_LIMITS, pids: 16, timeoutSeconds: 20 } },
    );
    expect(storm.code).not.toBe(0);

    const disk = await runSandbox(["dd", "if=/dev/zero", "of=/work/big", "bs=1M", "count=32"], {
      limits: { ...DEFAULT_SANDBOX_LIMITS, diskMb: 8, timeoutSeconds: 20 },
    });
    expect(disk.code).not.toBe(0);
  }, 120_000);

  it("holds the task's files, runs node on them, and reports what changed", async () => {
    const session = await createDockerDriver().open({
      limits: { ...DEFAULT_SANDBOX_LIMITS, timeoutSeconds: 120 },
      nodeMajor: 24,
      allowlist: [],
      label: "integration",
    });
    try {
      await session.writeFiles([
        { path: "src/index.mjs", bytes: enc("console.log('hi from the task');\n") },
        { path: "node_modules/x/index.js", bytes: enc("skip\n") },
      ]);
      const run = await session.run("node src/index.mjs", { timeoutMs: 30_000 });
      expect(run.stdout).toContain("hi from the task");
      await session.run("node -e \"require('fs').writeFileSync('out.txt','made')\"", {
        timeoutMs: 30_000,
      });
      const hashes = await session.hashes(["node_modules"]);
      expect([...hashes.keys()].sort()).toEqual(["out.txt", "src/index.mjs"]);
      expect(new TextDecoder().decode((await session.readFile("out.txt"))!)).toBe("made");
      expect(await session.readFile("missing.txt")).toBeNull();
      const slow = await session.run("sleep 10", { timeoutMs: 1000 });
      expect(slow.timedOut).toBe(true);
    } finally {
      await session.close();
    }
  }, 300_000);
});
