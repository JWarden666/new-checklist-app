import type { Config } from '@netlify/functions';
import { getPacificDateKey, isConfigured, runSync } from '../lib/gospotcheck.mts';

// Pulls completed GoSpotCheck missions every 10 minutes so walks get
// checked off automatically, even when nobody has the app open.
export default async () => {
  if (!isConfigured()) {
    // Demo mode (no API key) never runs on a schedule, so sample data can't change the checklist.
    console.log('GoSpotCheck API key or company ID not set; skipping scheduled sync.');
    return;
  }
  const result = await runSync();
  console.log(
    `GoSpotCheck sync for ${getPacificDateKey()}: ok=${result.ok}, newly completed=${result.newlyCompleted.length}` +
      (result.error ? `, error=${result.error}` : ''),
  );
};

export const config: Config = {
  schedule: '*/10 * * * *',
};
