'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type TicketStatus =
  | 'OPEN'
  | 'IN PROGRESS'
  | 'RESOLVED';

type Urgency =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'EMERGENCY';

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


function urgencyClass(
  urgency: Urgency
) {
  switch (urgency) {
    case 'EMERGENCY':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';

    case 'HIGH':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';

    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300';

    default:
      return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';
  }
}


function statusClass(
  status: TicketStatus
) {
  switch (status) {
    case 'RESOLVED':
      return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';

    case 'IN PROGRESS':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

    default:
      return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
  }
}


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


export default function DashboardPage() {

  const [tickets, setTickets] =
    useState<EscalationTicket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [updating, setUpdating] =
    useState<string | null>(null);


  const loadTickets =
    useCallback(
      async () => {

        try {

          const response =
            await fetch(
              '/api/escalations',
              {
                cache: 'no-store',
              }
            );


          if (!response.ok) {
            throw new Error(
              'Unable to load tickets.'
            );
          }


          const data =
            await response.json();


          if (!Array.isArray(data)) {
            throw new Error(
              'Invalid ticket data.'
            );
          }


          setTickets(data);

          setError(null);

        } catch (err) {

          console.error(err);

          setError(
            'Unable to connect to the human-support backend.'
          );

        } finally {

          setLoading(false);
        }

      },
      []
    );


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

  }, [loadTickets]);


  const updateStatus =
    async (
      ticketId: string,
      status: TicketStatus
    ) => {

      setUpdating(ticketId);

      try {

        const response =
          await fetch(
            '/api/escalations/status',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
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

      } catch (err) {

        console.error(err);

        setError(
          'Unable to update the ticket status.'
        );

      } finally {

        setUpdating(null);
      }
    };


  const total =
    tickets.length;


  const open =
    tickets.filter(
      ticket =>
        ticket.status === 'OPEN'
    ).length;


  const high =
    tickets.filter(
      ticket =>
        ticket.urgency === 'HIGH' ||
        ticket.urgency === 'EMERGENCY'
    ).length;


  const resolved =
    tickets.filter(
      ticket =>
        ticket.status === 'RESOLVED'
    ).length;


  const emergency =
    tickets.filter(
      ticket =>
        ticket.urgency === 'EMERGENCY'
    ).length;


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
      [tickets]
    );


  return (

    <main className="min-h-screen bg-background">

      <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>

            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Arogya Health Access
            </p>

            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Human Support
            </h1>

            <p className="mt-2 max-w-2xl text-muted-foreground">
              Review and manage escalation requests
              created by the Arogya voice agent.
            </p>

          </div>


          <div className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">

            Auto-refreshing every 5 seconds

          </div>

        </div>


        {/* ERROR */}

        {error && (

          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">

            {error}

          </div>

        )}


        {/* STATS */}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <StatCard
            label="Total"
            value={total}
          />

          <StatCard
            label="Open"
            value={open}
          />

          <StatCard
            label="High / Emergency"
            value={high}
          />

          <StatCard
            label="Emergency"
            value={emergency}
          />

          <StatCard
            label="Resolved"
            value={resolved}
          />

        </div>


        {/* TICKETS */}

        <section>

          <div className="mb-4 flex items-center justify-between">

            <h2 className="text-xl font-semibold">
              Escalation Requests
            </h2>

            <button
              type="button"
              onClick={loadTickets}
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-muted"
            >
              Refresh
            </button>

          </div>


          {loading ? (

            <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">

              Loading support requests...

            </div>

          ) : sortedTickets.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">

              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">

                ✓

              </div>

              <h3 className="text-lg font-medium">
                No escalation requests
              </h3>

              <p className="mt-2 text-sm text-muted-foreground">
                Tickets created by the voice agent
                will appear here.
              </p>

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
                        label="User"
                        value={
                          ticket.user_id
                        }
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
                          updating ===
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
                          updating ===
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
                          updating ===
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

        </section>

      </div>

    </main>

  );
}


function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
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