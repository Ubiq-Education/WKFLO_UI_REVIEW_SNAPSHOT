import { useState, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tags } from 'lucide-react';
import useAuth from '@/hooks/use-auth';
import { DataContext } from '@shared/models/chat-models';
import type { Tool } from '@shared/schema';

interface TopicAggregation {
  topicName: string;
  count: number;
}

type DateRange = 'Last30Days' | 'Last90Days' | 'Last3Months' | 'Last6Months' | 'Last12Months';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'Last30Days', label: 'Last 30 Days' },
  { value: 'Last90Days', label: 'Last 90 Days' },
  { value: 'Last3Months', label: 'Last 3 Months' },
  { value: 'Last6Months', label: 'Last 6 Months' },
  { value: 'Last12Months', label: 'Last 12 Months' },
];

interface AgentClassificationsProps {
  agentId: number;
  classificationTool: Tool;
}

export default function AgentClassifications({ agentId }: AgentClassificationsProps) {
  const token = useAuth();
  const context = useContext(DataContext);
  const [dateRange, setDateRange] = useState<DateRange>('Last30Days');

  // Default queryFn uses queryKey[0] as URL and unwraps .data automatically.
  // Date range is embedded in the URL so cache keys change when it changes.
  const { data, isLoading, isError } = useQuery<TopicAggregation[]>({
    queryKey: [
      `/md/api/v1/tenant/agent/${agentId}/topic-classification-summary?dateRange=${dateRange}`,
      token,
      context.selectedTenantGuid,
    ],
    enabled: !!token && !!context.selectedTenantGuid,
  });

  const topics = data ?? [];
  const total = topics.reduce((sum, t) => sum + t.count, 0);
  const maxCount = topics[0]?.count ?? 0; // already sorted descending by backend

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" />
              Classification Analytics
            </CardTitle>

            {/* Segmented date range selector */}
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              {DATE_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDateRange(opt.value)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    dateRange === opt.value
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Failed to load classification data. Make sure the backend endpoint is available.
            </div>
          )}

          {!isLoading && !isError && topics.length === 0 && (
            <div className="text-center py-10 border rounded-md border-dashed">
              <Tags className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No classifications in this period.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try selecting a wider date range or wait for users to interact with the agent.
              </p>
            </div>
          )}

          {!isLoading && !isError && topics.length > 0 && (
            <div className="space-y-5">
              {topics.map(topic => {
                const pct = total > 0 ? Math.round((topic.count / total) * 100) : 0;
                const barWidth = maxCount > 0 ? (topic.count / maxCount) * 100 : 0;
                return (
                  <div key={topic.topicName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{topic.topicName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {topic.count.toLocaleString()}&nbsp;
                        <span className="text-xs">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <p className="text-xs text-muted-foreground pt-1 border-t">
                Total classified messages: {total.toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
