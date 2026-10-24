import { git, runCommand } from './git.js';

export type PullRequestState = 'open' | 'draft' | 'merged' | 'closed';
export type ReviewState = 'approved' | 'changes-requested' | 'review-required' | null;
export type ChecksState = 'passing' | 'failing' | 'pending' | null;

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  branch: string;
  state: PullRequestState;
  review: ReviewState;
  checks: ChecksState;
  updatedAt: string;
  body: string;
  labels: string[];
}

export type PullRequestSource = (
  repo: string,
  options: { body: boolean; labels: boolean },
) => Promise<PullRequestInfo[] | null>;

const CHECK_FAILED = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
]);
const CHECK_RUNNING = new Set([
  'PENDING',
  'IN_PROGRESS',
  'QUEUED',
  'WAITING',
  'REQUESTED',
  'EXPECTED',
]);

export function parseGithubRepo(remoteUrl: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function githubRepoOf(root: string): Promise<string | null> {
  const result = await git(['-C', root, 'remote', 'get-url', 'origin']);
  return result.ok ? parseGithubRepo(result.stdout) : null;
}

export function checksOf(rollup: unknown): ChecksState {
  if (!Array.isArray(rollup) || rollup.length === 0) return null;
  let running = false;
  for (const item of rollup as Array<Record<string, unknown>>) {
    const value = String(item.conclusion || item.state || item.status || '').toUpperCase();
    if (CHECK_FAILED.has(value)) return 'failing';
    if (CHECK_RUNNING.has(value)) running = true;
  }
  return running ? 'pending' : 'passing';
}

function reviewOf(decision: unknown): ReviewState {
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changes-requested';
  if (decision === 'REVIEW_REQUIRED') return 'review-required';
  return null;
}

function stateOf(state: unknown, isDraft: unknown): PullRequestState {
  if (state === 'MERGED') return 'merged';
  if (state === 'CLOSED') return 'closed';
  return isDraft === true ? 'draft' : 'open';
}

export function parsePullRequests(json: string): PullRequestInfo[] {
  const raw = JSON.parse(json) as Array<Record<string, unknown>>;
  return raw.map((pr) => ({
    number: Number(pr.number),
    title: String(pr.title ?? ''),
    url: String(pr.url ?? ''),
    branch: String(pr.headRefName ?? ''),
    state: stateOf(pr.state, pr.isDraft),
    review: reviewOf(pr.reviewDecision),
    checks: checksOf(pr.statusCheckRollup),
    updatedAt: String(pr.updatedAt ?? ''),
    body: typeof pr.body === 'string' ? pr.body : '',
    labels: Array.isArray(pr.labels)
      ? (pr.labels as Array<Record<string, unknown>>).map((label) => String(label.name ?? ''))
      : [],
  }));
}

export const ghPullRequests: PullRequestSource = async (repo, options) => {
  const fields = [
    'number',
    'title',
    'url',
    'headRefName',
    'state',
    'isDraft',
    'reviewDecision',
    'statusCheckRollup',
    'updatedAt',
  ];
  if (options.body) fields.push('body');
  if (options.labels) fields.push('labels');
  const result = await runCommand(
    'gh',
    ['pr', 'list', '--repo', repo, '--state', 'all', '--limit', '100', '--json', fields.join(',')],
    undefined,
    30_000,
  );
  if (!result.ok) return null;
  try {
    return parsePullRequests(result.stdout);
  } catch {
    return null;
  }
};

export function pullRequestFor(
  branch: string | null,
  pullRequests: readonly PullRequestInfo[],
): PullRequestInfo | null {
  if (!branch) return null;
  const matching = pullRequests.filter((pr) => pr.branch === branch);
  const open = matching.find((pr) => pr.state === 'open' || pr.state === 'draft');
  if (open) return open;
  return [...matching].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}
