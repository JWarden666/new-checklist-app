import { getStore } from '@netlify/blobs';

/**
 * Shared GoSpotCheck integration logic used by the API endpoint and the
 * scheduled sync function. The API key never leaves the server.
 */

const GSC_BASE_URL = 'https://api.gospotcheck.com/external/v2';
const PACIFIC_TZ = 'America/Los_Angeles';

export const CONFIG_STORE = 'gospotcheck-config';
export const COMPLETIONS_STORE = 'gospotcheck-completions';
export const LIVE_STORE = 'checklist-live';
const CONFIG_KEY = 'mappings';
const STATUS_KEY = 'last-sync';

/** Links one checklist item to a GoSpotCheck mission. */
export interface MissionMapping {
  section: string;
  name: string;
  /** GoSpotCheck mission (campaign) ID */
  missionId: number;
  /** Optional text the mission job name must contain (case-insensitive) */
  jobNameContains?: string;
}

export interface GscConfig {
  /** Optional GoSpotCheck place (store) ID to limit results to this store */
  placeId?: number | null;
  mappings: MissionMapping[];
}

/** Completion recorded for a checklist item on a given date */
export interface GscCompletion {
  completedAt: string;
  missionId: number;
  jobId?: number;
  jobName?: string;
}

/** Keyed by `${section}::${name}` */
export type CompletionMap = Record<string, GscCompletion>;

export interface SyncResult {
  ok: boolean;
  date: string;
  syncedAt: string;
  newlyCompleted: string[];
  totalCompleted: number;
  checkedMissions: number;
  error?: string;
  /** True when no API key is set and sample data was used. Nothing is checked off in this mode. */
  mock?: boolean;
  /** In mock mode: items that would be checked off with real data */
  wouldComplete?: string[];
}

interface MissionJob {
  jobId?: number;
  campaignId?: number;
  name?: string;
  jobStatus?: string;
  completedTime?: string;
  deletedTime?: string;
  placeId?: number;
  missionJobResponse?: { missionResponseId?: number; userId?: number };
}

export const taskKey = (section: string, name: string) => `${section}::${name}`;

export function getPacificDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isConfigured(): boolean {
  return Boolean(process.env.GOSPOTCHECK_API_KEY && process.env.GOSPOTCHECK_COMPANY_ID);
}

/** Demo mode: no API key yet, so sample mission jobs stand in for the real API. */
export function isMockMode(): boolean {
  return !process.env.GOSPOTCHECK_API_KEY;
}

/**
 * SAMPLE DATA (used only while GOSPOTCHECK_API_KEY is unset): one completed job
 * per linked mission, timestamped today, so mission links can be tested.
 */
function sampleMissionJobs(config: GscConfig): MissionJob[] {
  const now = new Date().toISOString();
  return config.mappings.map((m, i) => ({
    jobId: 900000 + i,
    campaignId: m.missionId,
    name: `[SAMPLE] ${m.jobNameContains || m.name}`,
    jobStatus: 'completed',
    completedTime: now,
    placeId: config.placeId ?? undefined,
  }));
}

export async function getConfig(): Promise<GscConfig> {
  const store = getStore({ name: CONFIG_STORE, consistency: 'strong' });
  const config = (await store.get(CONFIG_KEY, { type: 'json' })) as GscConfig | null;
  return {
    placeId: config?.placeId ?? null,
    mappings: Array.isArray(config?.mappings) ? config!.mappings : [],
  };
}

export async function saveConfig(config: GscConfig): Promise<GscConfig> {
  const clean: GscConfig = {
    placeId: config.placeId ? Number(config.placeId) || null : null,
    mappings: (config.mappings || [])
      .filter((m) => m && m.section && m.name && Number(m.missionId) > 0)
      .map((m) => ({
        section: String(m.section),
        name: String(m.name),
        missionId: Number(m.missionId),
        jobNameContains: m.jobNameContains?.trim() || undefined,
      })),
  };
  const store = getStore({ name: CONFIG_STORE, consistency: 'strong' });
  await store.setJSON(CONFIG_KEY, clean);
  return clean;
}

export async function getCompletions(date: string): Promise<CompletionMap> {
  const store = getStore({ name: COMPLETIONS_STORE, consistency: 'strong' });
  return ((await store.get(date, { type: 'json' })) as CompletionMap | null) || {};
}

export async function getLastSync(): Promise<SyncResult | null> {
  const store = getStore({ name: CONFIG_STORE, consistency: 'strong' });
  return (await store.get(STATUS_KEY, { type: 'json' })) as SyncResult | null;
}

/** Apply recorded GoSpotCheck completions onto a task list (mutates and returns it). */
export function applyCompletions<T extends { section: string; name: string; completed: boolean }>(
  tasks: T[],
  completions: CompletionMap,
): T[] {
  for (const task of tasks) {
    const c = completions[taskKey(task.section, task.name)];
    if (c) {
      task.completed = true;
      (task as any).gscCompletedAt = c.completedAt;
    }
  }
  return tasks;
}

async function gscFetch(path: string): Promise<any> {
  const res = await fetch(`${GSC_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GOSPOTCHECK_API_KEY}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message += ` - ${body.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(`GoSpotCheck request failed: ${message}`);
  }
  return res.json();
}

/** Fetch all mission jobs for the given mission IDs (handles pagination). */
async function fetchMissionJobs(companyId: string, missionIds: number[]): Promise<MissionJob[]> {
  const jobs: MissionJob[] = [];
  const perPage = 200;
  const maxPages = 25; // stays well within API rate limits

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      mission_ids: missionIds.join(','),
      current_page: String(page),
      per_page: String(perPage),
    });
    const data = await gscFetch(`/companies/${encodeURIComponent(companyId)}/mission_jobs/?${params}`);
    const batch: MissionJob[] = data?.missionJobs || [];
    jobs.push(...batch);

    const total = data?.paginationResponse?.rowCount;
    if (batch.length < perPage || (typeof total === 'number' && jobs.length >= total)) break;
  }
  return jobs;
}

function isCompletedOn(job: MissionJob, date: string): boolean {
  if (job.deletedTime || !job.completedTime) return false;
  const completed = new Date(job.completedTime);
  if (isNaN(completed.getTime())) return false;
  return getPacificDateKey(completed) === date;
}

/**
 * Pull completed missions from GoSpotCheck for today (Pacific time) and check
 * off the mapped checklist items.
 */
export async function runSync(): Promise<SyncResult> {
  const date = getPacificDateKey();
  const syncedAt = new Date().toISOString();
  const statusStore = getStore({ name: CONFIG_STORE, consistency: 'strong' });

  const finish = async (result: SyncResult) => {
    await statusStore.setJSON(STATUS_KEY, result);
    return result;
  };

  if (isMockMode()) {
    // Preview only: report what would be checked off, without touching the checklist.
    const config = await getConfig();
    const completions = await getCompletions(date);
    const jobs = sampleMissionJobs(config);
    const wouldComplete = config.mappings
      .filter((m) => !completions[taskKey(m.section, m.name)])
      .filter((m) => jobs.some((j) => j.campaignId === m.missionId &&
        (!m.jobNameContains || (j.name || '').toLowerCase().includes(m.jobNameContains.toLowerCase()))))
      .map((m) => m.name);
    return finish({
      ok: true, mock: true, date, syncedAt, newlyCompleted: [], wouldComplete,
      totalCompleted: Object.keys(completions).length,
      checkedMissions: new Set(config.mappings.map((m) => m.missionId)).size,
    });
  }

  if (!isConfigured()) {
    return finish({
      ok: false, date, syncedAt, newlyCompleted: [], totalCompleted: 0, checkedMissions: 0,
      error: 'GoSpotCheck API key or company ID is not configured.',
    });
  }

  const config = await getConfig();
  const missionIds = [...new Set(config.mappings.map((m) => m.missionId))];
  const completionsStore = getStore({ name: COMPLETIONS_STORE, consistency: 'strong' });
  const completions = await getCompletions(date);

  if (missionIds.length === 0) {
    return finish({
      ok: true, date, syncedAt, newlyCompleted: [], totalCompleted: Object.keys(completions).length,
      checkedMissions: 0,
    });
  }

  let jobs: MissionJob[];
  try {
    jobs = await fetchMissionJobs(process.env.GOSPOTCHECK_COMPANY_ID!, missionIds);
  } catch (err: any) {
    console.error('GoSpotCheck sync failed:', err);
    return finish({
      ok: false, date, syncedAt, newlyCompleted: [], totalCompleted: Object.keys(completions).length,
      checkedMissions: missionIds.length, error: err?.message || 'Unknown error',
    });
  }

  const todaysJobs = jobs.filter(
    (j) => isCompletedOn(j, date) && (!config.placeId || j.placeId === config.placeId),
  );

  const newlyCompleted: string[] = [];
  for (const mapping of config.mappings) {
    const key = taskKey(mapping.section, mapping.name);
    if (completions[key]) continue;

    const filter = mapping.jobNameContains?.toLowerCase();
    const match = todaysJobs.find(
      (j) =>
        j.campaignId === mapping.missionId &&
        (!filter || (j.name || '').toLowerCase().includes(filter)),
    );
    if (match) {
      completions[key] = {
        completedAt: match.completedTime!,
        missionId: mapping.missionId,
        jobId: match.jobId,
        jobName: match.name,
      };
      newlyCompleted.push(mapping.name);
    }
  }

  if (newlyCompleted.length > 0) {
    await completionsStore.setJSON(date, completions);
    await markTasksComplete(date, completions);
  }

  return finish({
    ok: true, date, syncedAt, newlyCompleted, totalCompleted: Object.keys(completions).length,
    checkedMissions: missionIds.length,
  });
}

/** Update today's live checklist so every connected device picks up the change. */
async function markTasksComplete(date: string, completions: CompletionMap): Promise<void> {
  const live = getStore({ name: LIVE_STORE, consistency: 'strong' });
  const record = (await live.get(date, { type: 'json' })) as any;
  // If nobody has opened the checklist yet today, the completions are applied
  // when the first device saves the day's list.
  if (!record || !Array.isArray(record.tasks)) return;

  applyCompletions(record.tasks, completions);
  await live.setJSON(date, {
    ...record,
    version: (record.version || 0) + 1,
    lastUpdated: new Date().toISOString(),
  });
}
