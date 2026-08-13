'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  DoughnutController,
  BarController,
  LineController,
} from 'chart.js';

import type {
  ChartConfiguration,
} from 'chart.js';


Chart.register(
  DoughnutController,
  BarController,
  LineController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);


// ============================================================
// TYPES
// ============================================================

type TicketStatus =
  | 'OPEN'
  | 'IN PROGRESS'
  | 'RESOLVED';


type Urgency =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'EMERGENCY';


type AnalyticsOutcome =
  | 'success'
  | 'failed';


interface EscalationTicket {
  ticket_id: string;
  user_id: string;
  created_at: string;
  reason: string;
  summary: string;
  agent_checked: string;
  urgency: Urgency;
  language: string;
  follow_up_method: string;
  status: TicketStatus;
}


interface AnalyticsCall {
  call_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds:
    | number
    | null;
  channel: string;
  language: string | null;
  purpose: string | null;
  outcome: AnalyticsOutcome;
  success_type: string | null;
  failure_type: string | null;
  latency_ms: number | null;
}


interface AnalyticsMetrics {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
  average_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  average_duration_seconds: number;
}


interface AnalyticsByDay {
  date: string;
  total: number;
  successful: number;
  failed: number;
}


interface AnalyticsData {
  metrics: AnalyticsMetrics;

  failure_breakdown:
    Record<string, number>;

  success_breakdown:
    Record<string, number>;

  by_day:
    AnalyticsByDay[];

  calls:
    AnalyticsCall[];

  filters: {
    languages: string[];
    channels: string[];
  };
}


interface Filters {
  start_date: string;
  end_date: string;
  channel: string;
  language: string;
  outcome: string;
}


// ============================================================
// CONSTANTS
// ============================================================

const ANALYTICS_API =
  'http://127.0.0.1:8765/api/analytics';

const TICKETS_API =
  '/api/escalations';

const TICKET_STATUS_API =
  '/api/escalations/status';


// ============================================================
// HELPERS
// ============================================================

function formatDate(
  value: string
) {

  try {

    return new Date(
      value
    ).toLocaleString();

  } catch {

    return value;

  }
}


function formatDuration(
  seconds:
    | number
    | null
) {

  if (
    seconds === null ||
    seconds === undefined
  ) {

    return '—';

  }


  const rounded =
    Math.round(seconds);


  if (rounded < 60) {

    return `${rounded}s`;

  }


  const minutes =
    Math.floor(
      rounded / 60
    );

  const remaining =
    rounded % 60;


  return `${minutes}m ${remaining}s`;
}


function formatLatency(
  milliseconds:
    | number
    | null
) {

  if (
    milliseconds === null ||
    milliseconds === undefined
  ) {

    return '—';

  }


  if (milliseconds < 1000) {

    return `${Math.round(milliseconds)} ms`;

  }


  return `${(
    milliseconds / 1000
  ).toFixed(2)} s`;
}


function humanize(
  value:
    | string
    | null
) {

  if (!value) {

    return '—';

  }


  return value
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );
}


function urgencyClass(
  urgency: Urgency
) {

  switch (urgency) {

    case 'EMERGENCY':

      return (
        'bg-red-100 text-red-800 ' +
        'dark:bg-red-950 ' +
        'dark:text-red-300'
      );


    case 'HIGH':

      return (
        'bg-orange-100 text-orange-800 ' +
        'dark:bg-orange-950 ' +
        'dark:text-orange-300'
      );


    case 'MEDIUM':

      return (
        'bg-yellow-100 text-yellow-800 ' +
        'dark:bg-yellow-950 ' +
        'dark:text-yellow-300'
      );


    default:

      return (
        'bg-green-100 text-green-800 ' +
        'dark:bg-green-950 ' +
        'dark:text-green-300'
      );
  }
}


function statusClass(
  status: TicketStatus
) {

  switch (status) {

    case 'RESOLVED':

      return (
        'bg-green-100 text-green-800 ' +
        'dark:bg-green-950 ' +
        'dark:text-green-300'
      );


    case 'IN PROGRESS':

      return (
        'bg-blue-100 text-blue-800 ' +
        'dark:bg-blue-950 ' +
        'dark:text-blue-300'
      );


    default:

      return (
        'bg-zinc-100 text-zinc-800 ' +
        'dark:bg-zinc-800 ' +
        'dark:text-zinc-200'
      );
  }
}


function outcomeClass(
  outcome: AnalyticsOutcome
) {

  if (outcome === 'success') {

    return (
      'bg-green-100 text-green-800 ' +
      'dark:bg-green-950 ' +
      'dark:text-green-300'
    );
  }


  return (
    'bg-red-100 text-red-800 ' +
    'dark:bg-red-950 ' +
    'dark:text-red-300'
  );
}


// ============================================================
// MAIN PAGE
// ============================================================

export default function DashboardPage() {

  // ==========================================================
  // DASHBOARD NAVIGATION
  // ==========================================================

  const [activeView, setActiveView] =
    useState<'voice' | 'support'>('voice');

  // ==========================================================
  // DAY 8 ANALYTICS STATE
  // ==========================================================

  const [
    analytics,
    setAnalytics,
  ] = useState<AnalyticsData | null>(
    null
  );


  const [
    analyticsLoading,
    setAnalyticsLoading,
  ] = useState(true);

  // ==========================================================
  // THEME STATE
  // ==========================================================

  const [isDarkMode, setIsDarkMode] =
    useState(false);

  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(
        document.documentElement.classList.contains('dark')
      );
    };

    updateTheme();

    const observer = new MutationObserver(
      updateTheme
    );

    observer.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: ['class'],
      }
    );

    return () => {
      observer.disconnect();
    };
  }, []);

  const chartTheme = useMemo(
    () => ({
      text: isDarkMode
        ? '#e5e7eb'
        : '#374151',

      mutedText: isDarkMode
        ? '#9ca3af'
        : '#6b7280',

      grid: isDarkMode
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.08)',

      tooltipBackground: isDarkMode
        ? '#1f2937'
        : '#ffffff',

      tooltipText: isDarkMode
        ? '#f9fafb'
        : '#111827',

      tooltipBorder: isDarkMode
        ? '#374151'
        : '#e5e7eb',

      success: isDarkMode
        ? '#4ade80'
        : '#16a34a',

      failed: isDarkMode
        ? '#f87171'
        : '#dc2626',

      failure: isDarkMode
        ? '#fb7185'
        : '#e11d48',
    }),
    [isDarkMode]
  );


  const [
    analyticsError,
    setAnalyticsError,
  ] = useState<string | null>(
    null
  );


  const [
    filters,
    setFilters,
  ] = useState<Filters>({
    start_date: '',
    end_date: '',
    channel: '',
    language: '',
    outcome: '',
  });


  // ==========================================================
  // DAY 7 ESCALATION STATE
  // ==========================================================

  const [
    tickets,
    setTickets,
  ] = useState<
    EscalationTicket[]
  >([]);


  const [
    loadingTickets,
    setLoadingTickets,
  ] = useState(true);


  const [
    ticketError,
    setTicketError,
  ] = useState<string | null>(
    null
  );


  const [
    updatingTicket,
    setUpdatingTicket,
  ] = useState<string | null>(
    null
  );


  // ==========================================================
  // CHART REFERENCES
  // ==========================================================

  const outcomeChartRef =
    useRef<HTMLCanvasElement | null>(
      null
    );


  const trendChartRef =
    useRef<HTMLCanvasElement | null>(
      null
    );


  const failureChartRef =
    useRef<HTMLCanvasElement | null>(
      null
    );


  const outcomeChartInstance =
    useRef<Chart | null>(
      null
    );


  const trendChartInstance =
    useRef<Chart | null>(
      null
    );


  const failureChartInstance =
    useRef<Chart | null>(
      null
    );


  // ==========================================================
  // LOAD ANALYTICS
  // ==========================================================

  const loadAnalytics =
    useCallback(
      async () => {

        try {

          const params =
            new URLSearchParams();


          if (
            filters.start_date
          ) {

            params.set(
              'start_date',
              filters.start_date
            );

          }


          if (
            filters.end_date
          ) {

            params.set(
              'end_date',
              filters.end_date
            );

          }


          if (
            filters.channel
          ) {

            params.set(
              'channel',
              filters.channel
            );

          }


          if (
            filters.language
          ) {

            params.set(
              'language',
              filters.language
            );

          }


          if (
            filters.outcome
          ) {

            params.set(
              'outcome',
              filters.outcome
            );

          }


          const query =
            params.toString();


          const response =
            await fetch(
              query
                ? `${ANALYTICS_API}?${query}`
                : ANALYTICS_API,
              {
                cache:
                  'no-store',
              }
            );


          if (!response.ok) {

            throw new Error(
              'Unable to load analytics.'
            );

          }


          const data =
            await response.json();


          if (
            data.error
          ) {

            throw new Error(
              data.error
            );

          }


          setAnalytics(
            data
          );


          setAnalyticsError(
            null
          );

        } catch (error) {

          console.error(
            'Analytics error:',
            error
          );


          setAnalyticsError(
            'Unable to connect to the analytics backend.'
          );

        } finally {

          setAnalyticsLoading(
            false
          );

        }

      },
      [
        filters,
      ]
    );


  // ==========================================================
  // LOAD ESCALATIONS
  // ==========================================================

  const loadTickets =
    useCallback(
      async () => {

        try {

          const response =
            await fetch(
              TICKETS_API,
              {
                cache:
                  'no-store',
              }
            );


          if (!response.ok) {

            throw new Error(
              'Unable to load tickets.'
            );

          }


          const data =
            await response.json();


          if (
            !Array.isArray(data)
          ) {

            throw new Error(
              'Invalid ticket data.'
            );

          }


          setTickets(
            data
          );


          setTicketError(
            null
          );

        } catch (error) {

          console.error(
            'Ticket error:',
            error
          );


          setTicketError(
            'Unable to connect to the human-support backend.'
          );

        } finally {

          setLoadingTickets(
            false
          );

        }

      },
      []
    );


  // ==========================================================
  // INITIAL + LIVE REFRESH
  // ==========================================================

  useEffect(() => {

    loadAnalytics();

    const interval =
      window.setInterval(
        loadAnalytics,
        3000
      );


    return () => {

      window.clearInterval(
        interval
      );

    };

  }, [
    loadAnalytics,
  ]);


  useEffect(() => {

    loadTickets();

    const interval =
      window.setInterval(
        loadTickets,
        5000
      );


    return () => {

      window.clearInterval(
        interval
      );

    };

  }, [
    loadTickets,
  ]);


  // ==========================================================
  // CHARTS
  // ==========================================================

  useEffect(() => {

    if (!analytics) {
      return;
    }

    const commonPlugins = {
      legend: {
        labels: {
          color: chartTheme.text,
          usePointStyle: true,
          padding: 18,
        },
      },

      tooltip: {
        backgroundColor:
          chartTheme.tooltipBackground,

        titleColor:
          chartTheme.tooltipText,

        bodyColor:
          chartTheme.tooltipText,

        borderColor:
          chartTheme.tooltipBorder,

        borderWidth: 1,

        padding: 10,
      },
    };

    const commonScales = {
      x: {
        ticks: {
          color: chartTheme.mutedText,
        },

        grid: {
          color: chartTheme.grid,
        },
      },

      y: {
        beginAtZero: true,

        ticks: {
          color: chartTheme.mutedText,
          precision: 0,
        },

        grid: {
          color: chartTheme.grid,
        },
      },
    };

    // --------------------------------------------------------
    // OUTCOME CHART
    // --------------------------------------------------------

    if (outcomeChartRef.current) {

      outcomeChartInstance
        .current
        ?.destroy();

      const config: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',

        data: {
          labels: [
            'Successful',
            'Failed',
          ],

          datasets: [
            {
              data: [
                analytics.metrics
                  .successful_calls,

                analytics.metrics
                  .failed_calls,
              ],

              backgroundColor: [
                chartTheme.success,
                chartTheme.failed,
              ],

              borderColor: isDarkMode
                ? '#18181b'
                : '#ffffff',

              borderWidth: 2,

              hoverOffset: 5,
            },
          ],
        },

        options: {
          responsive: true,

          maintainAspectRatio:
            false,

          cutout: '62%',

          plugins: {
            ...commonPlugins,

            legend: {
              position: 'bottom',

              labels: {
                color:
                  chartTheme.text,

                usePointStyle: true,

                padding: 18,
              },
            },
          },
        },
      };

      outcomeChartInstance.current =
        new Chart(
          outcomeChartRef.current,
          config
        );
    }


    // --------------------------------------------------------
    // TREND CHART
    // --------------------------------------------------------

    if (trendChartRef.current) {

      trendChartInstance
        .current
        ?.destroy();

      const labels =
        analytics.by_day.map(
          item => item.date
        );

      const successful =
        analytics.by_day.map(
          item =>
            item.successful
        );

      const failed =
        analytics.by_day.map(
          item =>
            item.failed
        );

      const config: ChartConfiguration = {
        type: 'line',

        data: {
          labels,

          datasets: [
            {
              label:
                'Successful',

              data:
                successful,

              borderColor:
                chartTheme.success,

              backgroundColor:
                chartTheme.success,

              pointBackgroundColor:
                chartTheme.success,

              pointBorderColor:
                chartTheme.success,

              pointRadius: 4,

              pointHoverRadius: 6,

              borderWidth: 2,

              tension:
                0.3,
            },

            {
              label:
                'Failed',

              data:
                failed,

              borderColor:
                chartTheme.failed,

              backgroundColor:
                chartTheme.failed,

              pointBackgroundColor:
                chartTheme.failed,

              pointBorderColor:
                chartTheme.failed,

              pointRadius: 4,

              pointHoverRadius: 6,

              borderWidth: 2,

              tension:
                0.3,
            },
          ],
        },

        options: {
          responsive: true,

          maintainAspectRatio:
            false,

          interaction: {
            mode: 'index',

            intersect: false,
          },

          plugins: {
            ...commonPlugins,

            legend: {
              position: 'bottom',

              labels: {
                color:
                  chartTheme.text,

                usePointStyle: true,

                padding: 18,
              },
            },
          },

          scales: commonScales,
        },
      };

      trendChartInstance.current =
        new Chart(
          trendChartRef.current,
          config
        );
    }


    // --------------------------------------------------------
    // FAILURE CHART
    // --------------------------------------------------------

    if (failureChartRef.current) {

      failureChartInstance
        .current
        ?.destroy();

      const entries =
        Object.entries(
          analytics.failure_breakdown
        );

      const labels =
        entries.map(
          ([key]) =>
            humanize(key)
        );

      const values =
        entries.map(
          ([, value]) =>
            value
        );

      const config: ChartConfiguration = {
        type: 'bar',

        data: {
          labels,

          datasets: [
            {
              label:
                'Failed Calls',

              data:
                values,

              backgroundColor:
                chartTheme.failure,

              borderColor:
                chartTheme.failure,

              borderWidth: 1,

              borderRadius: 8,

              maxBarThickness: 48,
            },
          ],
        },

        options: {
          responsive: true,

          maintainAspectRatio:
            false,

          plugins: {
            ...commonPlugins,

            legend: {
              display: false,
            },
          },

          scales: {
            ...commonScales,

            x: {
              ...commonScales.x,

              ticks: {
                ...commonScales.x.ticks,

                maxRotation: 0,

                minRotation: 0,
              },
            },
          },
        },
      };

      failureChartInstance.current =
        new Chart(
          failureChartRef.current,
          config
        );
    }


    return () => {

      outcomeChartInstance
        .current
        ?.destroy();

      trendChartInstance
        .current
        ?.destroy();

      failureChartInstance
        .current
        ?.destroy();

    };

  }, [
    analytics,
    chartTheme,
    isDarkMode,
  ]);


  // ==========================================================
  // FILTER HELPERS
  // ==========================================================

  const clearFilters =
    () => {

      setFilters({
        start_date: '',
        end_date: '',
        channel: '',
        language: '',
        outcome: '',
      });

    };


  const updateFilter =
    (
      key: keyof Filters,
      value: string
    ) => {

      setFilters(
        previous => ({
          ...previous,
          [key]: value,
        })
      );

    };


  // ==========================================================
  // ESCALATION HELPERS
  // ==========================================================

  const updateStatus =
    async (
      ticketId: string,
      status: TicketStatus
    ) => {

      setUpdatingTicket(
        ticketId
      );


      try {

        const response =
          await fetch(
            TICKET_STATUS_API,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  ticket_id:
                    ticketId,

                  status,
                }),
            }
          );


        if (!response.ok) {

          throw new Error(
            'Unable to update ticket.'
          );

        }


        await loadTickets();

      } catch (error) {

        console.error(
          error
        );


        setTicketError(
          'Unable to update the ticket status.'
        );

      } finally {

        setUpdatingTicket(
          null
        );

      }

    };


  // ==========================================================
  // ESCALATION METRICS
  // ==========================================================

  const ticketMetrics =
    useMemo(
      () => {

        const total =
          tickets.length;


        const open =
          tickets.filter(
            ticket =>
              ticket.status ===
              'OPEN'
          ).length;


        const high =
          tickets.filter(
            ticket =>
              ticket.urgency ===
                'HIGH' ||
              ticket.urgency ===
                'EMERGENCY'
          ).length;


        const resolved =
          tickets.filter(
            ticket =>
              ticket.status ===
              'RESOLVED'
          ).length;


        const emergency =
          tickets.filter(
            ticket =>
              ticket.urgency ===
              'EMERGENCY'
          ).length;


        return {
          total,
          open,
          high,
          resolved,
          emergency,
        };

      },
      [
        tickets,
      ]
    );


  const sortedTickets =
    useMemo(
      () =>
        [...tickets].sort(
          (a, b) =>
            new Date(
              b.created_at
            ).getTime() -
            new Date(
              a.created_at
            ).getTime()
        ),
      [
        tickets,
      ]
    );


  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <main className="min-h-screen bg-background">

      <div className="flex min-h-screen">

        {/* ================================================== */}
        {/* SIDEBAR */}
        {/* ================================================== */}

        <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">

          {/* BRAND */}

          <div className="border-b border-border px-5 py-6">

            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="flex w-full items-center gap-3 rounded-xl text-left transition hover:opacity-80"
              aria-label="Go to Arogya Health Access home"
            >

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">

                <span className="text-lg font-bold">
                  A
                </span>

              </div>


              <div>

                <p className="font-semibold">
                  Arogya
                </p>

                <p className="text-xs text-muted-foreground">
                  Health Access
                </p>

              </div>

            </button>

          </div>


          {/* NAVIGATION */}

          <nav className="flex-1 px-3 py-5">

            <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">

              Workspace

            </p>


            {/* VOICE AGENT */}

            <button
              type="button"
              onClick={() =>
                setActiveView('voice')
              }
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                activeView === 'voice'
                  ? 'bg-muted font-semibold'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >

              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">

                🎙️

              </span>

              <span>

                <span className="block">
                  Voice Agent
                </span>

                <span className="block text-xs font-normal text-muted-foreground">
                  Call analytics
                </span>

              </span>

            </button>


            {/* HUMAN SUPPORT */}

            <button
              type="button"
              onClick={() =>
                setActiveView('support')
              }
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                activeView === 'support'
                  ? 'bg-muted font-semibold'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >

              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">

                🧑‍⚕️

              </span>

              <span>

                <span className="block">
                  Human Support
                </span>

                <span className="block text-xs font-normal text-muted-foreground">
                  Escalations
                </span>

              </span>

            </button>


            {/* FUTURE MODULES */}

            <div className="mt-8">

              <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">

                Coming Later

              </p>

              <div className="space-y-1">

                <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground opacity-50">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">

                    🔔

                  </span>

                  <span>
                    Reminders
                  </span>

                </div>


                <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground opacity-50">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">

                    🏥

                  </span>

                  <span>
                    Facilities
                  </span>

                </div>


                <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground opacity-50">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">

                    ⚙️
                  </span>

                  <span>
                    Settings
                  </span>

                </div>

              </div>

            </div>

          </nav>


          {/* SIDEBAR FOOTER */}

          <div className="border-t border-border px-5 py-4">

            <p className="text-xs text-muted-foreground">
              Arogya Health Access
            </p>

            <p className="mt-1 text-[10px] text-muted-foreground">
              Voice-first healthcare assistance
            </p>

          </div>

        </aside>


        {/* ================================================== */}
        {/* MOBILE NAVIGATION */}
        {/* ================================================== */}

        <div className="fixed left-0 right-0 top-0 z-20 flex border-b border-border bg-card p-3 md:hidden">

          <button
            type="button"
            onClick={() =>
              setActiveView('voice')
            }
            className={`flex-1 rounded-lg px-3 py-2 text-sm ${
              activeView === 'voice'
                ? 'bg-muted font-semibold'
                : 'text-muted-foreground'
            }`}
          >

            🎙️ Voice Agent

          </button>


          <button
            type="button"
            onClick={() =>
              setActiveView('support')
            }
            className={`flex-1 rounded-lg px-3 py-2 text-sm ${
              activeView === 'support'
                ? 'bg-muted font-semibold'
                : 'text-muted-foreground'
            }`}
          >

            🧑‍⚕️ Human Support

          </button>

        </div>


        {/* ================================================== */}
        {/* MAIN CONTENT */}
        {/* ================================================== */}

        <div className="min-w-0 flex-1">

          <div className="mx-auto max-w-7xl px-5 py-10 pt-20 md:px-8 md:pt-10">

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
            >
              Arogya Health Access
            </button>


            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">

              Voice Agent Dashboard

            </h1>


            <p className="mt-2 max-w-3xl text-muted-foreground">

              Monitor call performance,
              outcomes, latency and
              human-support escalations
              using real Arogya call data.

            </p>

          </div>


          <div className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">

            Analytics refresh: 3s

          </div>

        </div>


        {/* ================================================== */}
        {/* VOICE AGENT VIEW */}
        {/* ================================================== */}

        {activeView === 'voice' && (

          <section className="mb-16">

          <div className="mb-6">

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">

              Day 8

            </p>


            <h2 className="mt-1 text-2xl font-semibold">

              Call Analytics

            </h2>


            <p className="mt-2 text-sm text-muted-foreground">

              Real browser and SIP call
              performance.

            </p>

          </div>


          {/* ANALYTICS ERROR */}

          {analyticsError && (

            <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">

              {analyticsError}

              <div className="mt-1 text-xs opacity-80">

                Make sure the dashboard
                backend is running on
                port 8765.

              </div>

            </div>

          )}


          {/* METRIC CARDS */}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <StatCard
              label="Total Calls"
              value={
                analytics?.metrics
                  .total_calls ?? 0
              }
            />


            <StatCard
              label="Successful Calls"
              value={
                analytics?.metrics
                  .successful_calls ?? 0
              }
            />


            <StatCard
              label="Failed Calls"
              value={
                analytics?.metrics
                  .failed_calls ?? 0
              }
            />


            <StatCard
              label="Success Rate"
              value={`${analytics?.metrics.success_rate ?? 0}%`}
            />


            <StatCard
              label="Avg Latency"
              value={formatLatency(
                analytics?.metrics
                  .average_latency_ms ??
                  null
              )}
            />

          </div>


          {/* SECONDARY METRICS */}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <MetricInfo
              label="Min Latency"
              value={formatLatency(
                analytics?.metrics
                  .min_latency_ms ??
                  null
              )}
            />


            <MetricInfo
              label="Max Latency"
              value={formatLatency(
                analytics?.metrics
                  .max_latency_ms ??
                  null
              )}
            />


            <MetricInfo
              label="Avg Duration"
              value={formatDuration(
                analytics?.metrics
                  .average_duration_seconds ??
                  null
              )}
            />


            <MetricInfo
              label="Tracked Channels"
              value={
                analytics?.filters
                  .channels
                  ?.length
                  ?.toString() ?? '0'
              }
            />

          </div>


          {/* FILTERS */}

          <div className="mt-6 rounded-2xl border border-border bg-card p-5">

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h3 className="font-semibold">

                  Filters

                </h3>


                <p className="text-xs text-muted-foreground">

                  Filter real call records.

                </p>

              </div>


              <button
                type="button"
                onClick={
                  clearFilters
                }
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >

                Clear Filters

              </button>

            </div>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">

              <FilterField
                label="Start Date"
                type="date"
                value={
                  filters.start_date
                }
                onChange={
                  value =>
                    updateFilter(
                      'start_date',
                      value
                    )
                }
              />


              <FilterField
                label="End Date"
                type="date"
                value={
                  filters.end_date
                }
                onChange={
                  value =>
                    updateFilter(
                      'end_date',
                      value
                    )
                }
              />


              <SelectField
                label="Channel"
                value={
                  filters.channel
                }
                options={
                  analytics
                    ?.filters
                    .channels ??
                  []
                }
                onChange={
                  value =>
                    updateFilter(
                      'channel',
                      value
                    )
                }
              />


              <SelectField
                label="Language"
                value={
                  filters.language
                }
                options={
                  analytics
                    ?.filters
                    .languages ??
                  []
                }
                onChange={
                  value =>
                    updateFilter(
                      'language',
                      value
                    )
                }
              />


              <SelectField
                label="Outcome"
                value={
                  filters.outcome
                }
                options={[
                  'success',
                  'failed',
                ]}
                onChange={
                  value =>
                    updateFilter(
                      'outcome',
                      value
                    )
                }
              />

            </div>

          </div>


          {/* CHARTS */}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">

            <ChartCard
              title="Call Outcomes"
              subtitle="Successful vs failed calls"
            >

              <div className="h-[320px]">

                <canvas
                  ref={
                    outcomeChartRef
                  }
                />

              </div>

            </ChartCard>


            <ChartCard
              title="Calls Over Time"
              subtitle="Daily successful and failed calls"
            >

              <div className="h-[320px]">

                <canvas
                  ref={
                    trendChartRef
                  }
                />

              </div>

            </ChartCard>


            <ChartCard
              title="Failure Types"
              subtitle="Why calls did not reach the success condition"
            >

              <div className="h-[320px]">

                <canvas
                  ref={
                    failureChartRef
                  }
                />

              </div>

            </ChartCard>


            <ChartCard
              title="Successful Outcomes"
              subtitle="What Arogya successfully completed"
            >

              <div className="space-y-3">

                {Object.entries(
                  analytics
                    ?.success_breakdown ??
                  {}
                ).length === 0 ? (

                  <EmptyState
                    text="No successful outcomes recorded yet."
                  />

                ) : (

                  Object.entries(
                    analytics
                      ?.success_breakdown ??
                    {}
                  ).map(
                    ([key, value]) => (

                      <BreakdownRow
                        key={key}
                        label={
                          humanize(
                            key
                          )
                        }
                        value={value}
                      />

                    )
                  )

                )}

              </div>

            </ChartCard>

          </div>


          {/* FAILURE BREAKDOWN */}

          <div className="mt-6 rounded-2xl border border-border bg-card p-5">

            <h3 className="font-semibold">

              Failure Breakdown

            </h3>


            <p className="mt-1 text-sm text-muted-foreground">

              Categorized reasons for
              unsuccessful calls.

            </p>


            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

              {Object.entries(
                analytics
                  ?.failure_breakdown ??
                {}
              ).length === 0 ? (

                <EmptyState
                  text="No failed calls recorded yet."
                />

              ) : (

                Object.entries(
                  analytics
                    ?.failure_breakdown ??
                  {}
                ).map(
                  ([key, value]) => (

                    <div
                      key={key}
                      className="rounded-xl bg-muted/50 p-4"
                    >

                      <p className="text-sm text-muted-foreground">

                        {humanize(
                          key
                        )}

                      </p>


                      <p className="mt-1 text-2xl font-semibold">

                        {value}

                      </p>

                    </div>

                  )
                )

              )}

            </div>

          </div>


          {/* CALL HISTORY */}

          <div className="mt-6 rounded-2xl border border-border bg-card">

            <div className="border-b border-border p-5">

              <h3 className="font-semibold">

                Recent Calls

              </h3>


              <p className="mt-1 text-sm text-muted-foreground">

                Safe call metadata only.
                Conversation transcripts
                are not displayed.

              </p>

            </div>


            {analyticsLoading ? (

              <div className="p-8 text-center text-sm text-muted-foreground">

                Loading call analytics...

              </div>

            ) : (
              analytics?.calls
                ?.length ?? 0
            ) === 0 ? (

              <div className="p-8 text-center text-sm text-muted-foreground">

                No completed analytics
                calls yet.

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full text-left text-sm">

                  <thead>

                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">

                      <th className="px-5 py-4">
                        Time
                      </th>

                      <th className="px-5 py-4">
                        Channel
                      </th>

                      <th className="px-5 py-4">
                        Language
                      </th>

                      <th className="px-5 py-4">
                        Purpose
                      </th>

                      <th className="px-5 py-4">
                        Duration
                      </th>

                      <th className="px-5 py-4">
                        Latency
                      </th>

                      <th className="px-5 py-4">
                        Outcome
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {analytics?.calls?.map(
                      call => (

                        <tr
                          key={
                            call.call_id
                          }
                          className="border-b border-border last:border-0"
                        >

                          <td className="whitespace-nowrap px-5 py-4">

                            {formatDate(
                              call.started_at
                            )}

                          </td>


                          <td className="px-5 py-4">

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">

                              {call.channel
                                .toUpperCase()}

                            </span>

                          </td>


                          <td className="px-5 py-4">

                            {call.language ||
                              '—'}

                          </td>


                          <td className="px-5 py-4">

                            {humanize(
                              call.purpose
                            )}

                          </td>


                          <td className="px-5 py-4">

                            {formatDuration(
                              call.duration_seconds
                            )}

                          </td>


                          <td className="px-5 py-4">

                            {formatLatency(
                              call.latency_ms
                            )}

                          </td>


                          <td className="px-5 py-4">

                            <div className="flex flex-col gap-1">

                              <span
                                className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${outcomeClass(call.outcome)}`}
                              >

                                {call.outcome
                                  .toUpperCase()}

                              </span>


                              <span className="text-xs text-muted-foreground">

                                {humanize(
                                  call.outcome ===
                                    'success'
                                    ? call.success_type
                                    : call.failure_type
                                )}

                              </span>

                            </div>

                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </div>

          </section>

        )}


        {/* ================================================== */}
        {/* HUMAN SUPPORT VIEW */}
        {/* ================================================== */}

        {activeView === 'support' && (

          <section>

          <div className="mb-6">

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">

              Day 7

            </p>


            <h2 className="mt-1 text-2xl font-semibold">

              Human Support

            </h2>


            <p className="mt-2 text-sm text-muted-foreground">

              Review and manage escalation
              requests created by Arogya.

            </p>

          </div>


          {/* TICKET ERROR */}

          {ticketError && (

            <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">

              {ticketError}

            </div>

          )}


          {/* TICKET METRICS */}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <StatCard
              label="Total Escalations"
              value={
                ticketMetrics.total
              }
            />


            <StatCard
              label="Open"
              value={
                ticketMetrics.open
              }
            />


            <StatCard
              label="High Priority"
              value={
                ticketMetrics.high
              }
            />


            <StatCard
              label="Emergency"
              value={
                ticketMetrics.emergency
              }
            />


            <StatCard
              label="Resolved"
              value={
                ticketMetrics.resolved
              }
            />

          </div>


          {/* TICKETS */}

          <div className="mt-6">

            {loadingTickets ? (

              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">

                Loading human-support
                requests...

              </div>

            ) : sortedTickets.length === 0 ? (

              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">

                No human-support
                escalations yet.

              </div>

            ) : (

              <div className="grid gap-5">

                {sortedTickets.map(
                  ticket => (

                    <article
                      key={
                        ticket.ticket_id
                      }
                      className="rounded-2xl border border-border bg-card p-5"
                    >

                      {/* TICKET HEADER */}

                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                        <div>

                          <div className="flex flex-wrap items-center gap-2">

                            <span className="font-mono text-lg font-semibold">

                              {ticket.ticket_id}

                            </span>


                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyClass(ticket.urgency)}`}
                            >

                              {ticket.urgency}

                            </span>


                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}
                            >

                              {ticket.status}

                            </span>

                          </div>


                          <p className="mt-2 text-sm font-medium">

                            {ticket.reason}

                          </p>

                        </div>


                        <div className="text-sm text-muted-foreground">

                          {formatDate(
                            ticket.created_at
                          )}

                        </div>

                      </div>


                      {/* SUMMARY */}

                      <div className="mt-5 grid gap-5 md:grid-cols-2">

                        <InfoBlock
                          title="What happened"
                          value={
                            ticket.summary
                          }
                        />


                        <InfoBlock
                          title="What the agent checked"
                          value={
                            ticket.agent_checked ||
                            'Not specified'
                          }
                        />

                      </div>


                      {/* METADATA */}

                      <div className="mt-5 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-4">

                        <MetaItem
                          label="Language"
                          value={
                            ticket.language ||
                            'Not specified'
                          }
                        />


                        <MetaItem
                          label="Follow-up"
                          value={
                            ticket.follow_up_method ||
                            'Not specified'
                          }
                        />


                        <MetaItem
                          label="Reference"
                          value={ticket.ticket_id}
                        />


                        <MetaItem
                          label="Urgency"
                          value={
                            ticket.urgency
                          }
                        />

                      </div>


                      {/* STATUS ACTIONS */}

                      <div className="mt-5 flex flex-wrap gap-2">

                        <StatusButton
                          label="Open"
                          active={
                            ticket.status ===
                            'OPEN'
                          }
                          disabled={
                            updatingTicket ===
                            ticket.ticket_id
                          }
                          onClick={() =>
                            updateStatus(
                              ticket.ticket_id,
                              'OPEN'
                            )
                          }
                        />


                        <StatusButton
                          label="In Progress"
                          active={
                            ticket.status ===
                            'IN PROGRESS'
                          }
                          disabled={
                            updatingTicket ===
                            ticket.ticket_id
                          }
                          onClick={() =>
                            updateStatus(
                              ticket.ticket_id,
                              'IN PROGRESS'
                            )
                          }
                        />


                        <StatusButton
                          label="Resolved"
                          active={
                            ticket.status ===
                            'RESOLVED'
                          }
                          disabled={
                            updatingTicket ===
                            ticket.ticket_id
                          }
                          onClick={() =>
                            updateStatus(
                              ticket.ticket_id,
                              'RESOLVED'
                            )
                          }
                        />

                      </div>

                    </article>

                  )
                )}

              </div>

            )}

          </div>

          </section>

        )}

        </div>

      </div>
      </div>

    </main>

  );
}


// ============================================================
// REUSABLE UI COMPONENTS
// ============================================================


function StatCard({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | string;
}) {

  return (

    <div className="rounded-2xl border border-border bg-card p-5">

      <p className="text-sm text-muted-foreground">

        {label}

      </p>


      <p className="mt-2 text-3xl font-semibold">

        {value}

      </p>

    </div>

  );
}


function MetricInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="rounded-2xl border border-border bg-card p-4">

      <p className="text-xs uppercase tracking-wide text-muted-foreground">

        {label}

      </p>


      <p className="mt-2 text-xl font-semibold">

        {value}

      </p>

    </div>

  );
}


function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {

  return (

    <div className="rounded-2xl border border-border bg-card p-5">

      <h3 className="font-semibold">

        {title}

      </h3>


      <p className="mt-1 text-sm text-muted-foreground">

        {subtitle}

      </p>


      <div className="mt-5">

        {children}

      </div>

    </div>

  );
}


function FilterField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange:
    (value: string) => void;
}) {

  return (

    <label className="block">

      <span className="mb-2 block text-xs font-medium text-muted-foreground">

        {label}

      </span>


      <input
        type={type}
        value={value}
        onChange={event =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

    </label>

  );
}


function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange:
    (value: string) => void;
}) {

  return (

    <label className="block">

      <span className="mb-2 block text-xs font-medium text-muted-foreground">

        {label}

      </span>


      <select
        value={value}
        onChange={event =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      >

        <option value="">

          All

        </option>


        {options.map(
          option => (

            <option
              key={option}
              value={option}
            >

              {humanize(
                option
              )}

            </option>

          )
        )}

      </select>

    </label>

  );
}


function BreakdownRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {

  return (

    <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">

      <span className="text-sm">

        {label}

      </span>


      <span className="font-semibold">

        {value}

      </span>

    </div>

  );
}


function EmptyState({
  text,
}: {
  text: string;
}) {

  return (

    <div className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">

      {text}

    </div>

  );
}


function InfoBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {

  return (

    <div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">

        {title}

      </p>


      <p className="leading-6">

        {value}

      </p>

    </div>

  );
}


function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div>

      <p className="text-xs text-muted-foreground">

        {label}

      </p>


      <p className="mt-1 break-words text-sm font-medium">

        {value}

      </p>

    </div>

  );
}


function StatusButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {

  return (

    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border hover:bg-muted'
      } ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : ''
      }`}
    >

      {label}

    </button>

  );
}