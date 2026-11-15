import { BktChannelConfigSection } from './BktChannelConfigSection';
import { BktJobsTable } from './BktJobsTable';
import { BktStatsHeader } from './BktStatsHeader';
import { useBktChannelsManager } from './useBktChannelsManager';

export function BktChannelsTab() {
  const manager = useBktChannelsManager();

  return (
    <div className="space-y-6">
      <BktStatsHeader manager={manager} />
      <BktChannelConfigSection manager={manager} />
      <BktJobsTable manager={manager} />
    </div>
  );
}
