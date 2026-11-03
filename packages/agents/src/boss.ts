import PgBoss from "pg-boss";

/** Durable queue (pg-boss). One active job per idempotency key; failures retry, then dead-letter. */

export const AGENT_QUEUE = "agent-run";
export const AGENT_DEAD_LETTER = "agent-run-dead";

export type AgentJob = { runId: string };

export async function startBoss(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  await boss.start();
  await boss.createQueue(AGENT_DEAD_LETTER, { name: AGENT_DEAD_LETTER });
  await boss.createQueue(AGENT_QUEUE, {
    name: AGENT_QUEUE,
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 40 * 60,
    deadLetter: AGENT_DEAD_LETTER,
  });
  return boss;
}

export async function enqueueAgentRun(
  boss: PgBoss,
  job: AgentJob,
  idempotencyKey: string,
): Promise<{ id: string | null; duplicate: boolean }> {
  const id = await boss.send(AGENT_QUEUE, job, { singletonKey: idempotencyKey });
  return { id, duplicate: id === null };
}
