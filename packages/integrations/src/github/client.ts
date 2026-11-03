import { createAppJwt } from "./app-jwt";

export type GitHubConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  /** https://api.github.com, or a local fake in tests. */
  apiUrl: string;
  /** https://github.com (OAuth code exchange and the install page). */
  webUrl: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Attempts per request, including the first (default 3). */
  maxAttempts?: number;
  timeoutMs?: number;
};

/** A failed GitHub call. The message never contains a token or a response body. */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** Read-only access for syncing (Sprint 3). Write access is requested per job from Sprint 4. */
export const SYNC_PERMISSIONS = {
  metadata: "read",
  contents: "read",
  pull_requests: "read",
  checks: "read",
} as const;

export type Installation = {
  id: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
  permissions: Record<string, string>;
  suspended: boolean;
};

export type RepoSummary = {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
};

export type BranchSummary = { name: string; headSha: string; protected: boolean };
export type CommitSummary = {
  sha: string;
  message: string;
  authorName: string | null;
  authoredAt: string | null;
  htmlUrl: string | null;
};
export type PullRequestSummary = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  headRef: string;
  headSha: string;
  baseRef: string;
  htmlUrl: string;
  updatedAt: string;
};
export type ChecksSummary = "none" | "pending" | "success" | "failure";

type Json = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const obj = (value: unknown): Json =>
  value && typeof value === "object" ? (value as Json) : ({} as Json);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly config: GitHubConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    this.sleep = config.sleep ?? defaultSleep;
  }

  // ------------------------------------------------------------ app-level (JWT)

  async getInstallation(installationId: number): Promise<Installation> {
    const data = await this.request("GET", `/app/installations/${installationId}`, {
      auth: `Bearer ${this.appJwt()}`,
    });
    const account = obj(data.account);
    return {
      id: Number(data.id),
      accountLogin: str(account.login),
      accountType: account.type === "Organization" ? "Organization" : "User",
      repositorySelection: data.repository_selection === "all" ? "all" : "selected",
      permissions: obj(data.permissions) as Record<string, string>,
      suspended: data.suspended_at != null,
    };
  }

  /**
   * Mints an installation token for one job, narrowed to the given repositories and permissions.
   * Tokens live at most an hour and are never stored (threat model T08).
   */
  async createInstallationToken(
    installationId: number,
    scope: { repositoryIds?: number[]; permissions?: Record<string, string> } = {},
  ): Promise<{ token: string; expiresAt: string }> {
    const data = await this.request("POST", `/app/installations/${installationId}/access_tokens`, {
      auth: `Bearer ${this.appJwt()}`,
      body: {
        ...(scope.repositoryIds ? { repository_ids: scope.repositoryIds } : {}),
        permissions: scope.permissions ?? SYNC_PERMISSIONS,
      },
    });
    return { token: str(data.token), expiresAt: str(data.expires_at) };
  }

  // ------------------------------------------------------------ user-level (install verification)

  /** Exchanges the OAuth code from the install redirect for a user token (used once, not stored). */
  async exchangeCode(code: string): Promise<string> {
    const data = await this.request("POST", "/login/oauth/access_token", {
      base: this.config.webUrl,
      body: {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      },
    });
    const token = str(data.access_token);
    if (!token) throw new GitHubError("GitHub rejected the authorization code", 401, false);
    return token;
  }

  /** Installations the signed-in GitHub user can access: proves the installation is theirs. */
  async userInstallationIds(userToken: string): Promise<number[]> {
    const data = await this.request("GET", "/user/installations?per_page=100", {
      auth: `Bearer ${userToken}`,
    });
    const list = Array.isArray(data.installations) ? data.installations : [];
    return list.map((item) => Number(obj(item).id));
  }

  // ------------------------------------------------------------ installation-level (token)

  async listInstallationRepos(token: string): Promise<RepoSummary[]> {
    const data = await this.request("GET", "/installation/repositories?per_page=100", {
      auth: `Bearer ${token}`,
    });
    const list = Array.isArray(data.repositories) ? data.repositories : [];
    return list.map((item) => toRepo(obj(item)));
  }

  async getRepo(token: string, fullName: string): Promise<RepoSummary> {
    return toRepo(await this.request("GET", `/repos/${fullName}`, { auth: `Bearer ${token}` }));
  }

  async listBranches(token: string, fullName: string): Promise<BranchSummary[]> {
    const list = await this.requestList(`/repos/${fullName}/branches?per_page=100`, token);
    return list.map((item) => ({
      name: str(item.name),
      headSha: str(obj(item.commit).sha),
      protected: item.protected === true,
    }));
  }

  async listCommits(
    token: string,
    fullName: string,
    branch: string,
    limit = 30,
  ): Promise<CommitSummary[]> {
    const list = await this.requestList(
      `/repos/${fullName}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
      token,
    );
    return list.map((item) => {
      const commit = obj(item.commit);
      const author = obj(commit.author);
      return {
        sha: str(item.sha),
        message: str(commit.message),
        authorName: str(author.name) || null,
        authoredAt: str(author.date) || null,
        htmlUrl: str(item.html_url) || null,
      };
    });
  }

  async listPullRequests(token: string, fullName: string): Promise<PullRequestSummary[]> {
    const list = await this.requestList(
      `/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
      token,
    );
    return list.map((item) => {
      const head = obj(item.head);
      return {
        number: Number(item.number),
        title: str(item.title),
        state: item.merged_at ? "merged" : item.state === "closed" ? "closed" : "open",
        headRef: str(head.ref),
        headSha: str(head.sha),
        baseRef: str(obj(item.base).ref),
        htmlUrl: str(item.html_url),
        updatedAt: str(item.updated_at),
      };
    });
  }

  async checksFor(token: string, fullName: string, sha: string): Promise<ChecksSummary> {
    const data = await this.request("GET", `/repos/${fullName}/commits/${sha}/check-runs`, {
      auth: `Bearer ${token}`,
    });
    const runs = Array.isArray(data.check_runs) ? data.check_runs.map(obj) : [];
    return summarizeChecks(runs.map((run) => ({ status: run.status, conclusion: run.conclusion })));
  }

  // ------------------------------------------------------------ transport

  private appJwt(): string {
    return createAppJwt(this.config.appId, this.config.privateKey);
  }

  private async requestList(path: string, token: string): Promise<Json[]> {
    const data = await this.request("GET", path, { auth: `Bearer ${token}` });
    return Array.isArray(data) ? data.map(obj) : [];
  }

  /**
   * One GitHub call with retries: 5xx, 429 and rate-limited 403s are retried with backoff
   * (honouring Retry-After and X-RateLimit-Reset, capped at 10 s); other errors fail at once.
   */
  private async request(
    method: string,
    path: string,
    options: { auth?: string; body?: unknown; base?: string } = {},
  ): Promise<Json & Json[]> {
    const attempts = this.config.maxAttempts ?? 3;
    const url = (options.base ?? this.config.apiUrl).replace(/\/$/, "") + path;
    const label = `GitHub ${method} ${path.split("?")[0]}`;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "nexus-cloud",
            ...(options.auth ? { Authorization: options.auth } : {}),
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
        });
      } catch {
        if (attempt < attempts) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new GitHubError(`${label} could not reach GitHub`, 0, true);
      }

      if (response.ok) {
        const text = await response.text();
        return (text ? JSON.parse(text) : {}) as Json & Json[];
      }

      const rateLimited =
        response.status === 429 ||
        (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
      const retryable = response.status >= 500 || rateLimited;
      if (retryable && attempt < attempts) {
        await this.sleep(retryDelay(response.headers, attempt));
        continue;
      }
      throw new GitHubError(
        rateLimited
          ? `${label} was rate limited by GitHub`
          : `${label} failed with status ${response.status}`,
        response.status,
        retryable,
      );
    }
  }
}

function toRepo(data: Json): RepoSummary {
  return {
    id: Number(data.id),
    fullName: str(data.full_name),
    defaultBranch: str(data.default_branch) || "main",
    private: data.private === true,
    htmlUrl: str(data.html_url),
  };
}

const backoff = (attempt: number) => Math.min(10_000, 500 * 2 ** (attempt - 1));

function retryDelay(headers: Headers, attempt: number): number {
  const retryAfter = Number(headers.get("retry-after"));
  if (retryAfter > 0) return Math.min(10_000, retryAfter * 1000);
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (reset > 0) return Math.min(10_000, Math.max(0, reset * 1000 - Date.now()));
  return backoff(attempt);
}

/** Many check runs, one state: anything failed wins, then anything unfinished, then success. */
export function summarizeChecks(runs: { status: unknown; conclusion: unknown }[]): ChecksSummary {
  if (runs.length === 0) return "none";
  const failed = new Set([
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
  ]);
  if (runs.some((run) => failed.has(String(run.conclusion)))) return "failure";
  if (runs.some((run) => run.status !== "completed")) return "pending";
  return "success";
}
