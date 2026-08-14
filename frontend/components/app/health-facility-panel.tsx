'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useDataChannel,
} from '@livekit/components-react';

/* ============================================================
   FACILITY TYPES
   ============================================================ */

interface Facility {
  name: string;
  type: string;
  operator?: string;
  is_public?: boolean;
  address?: string;
  distance_km: number;
  latitude: number;
  longitude: number;
  maps_url?: string;
  osm_type?: string;
  osm_id?: number;
}

/* ============================================================
   GENERIC TABLE TYPES
   ============================================================ */

interface DataRow {
  [key: string]: unknown;
}

interface HealthPayload {
  type?: string;
  status?: string;
  source?: string;
  fetched_at_utc?: string;
  search_location?: string;
  radius_m?: number;

  facilities?: Facility[];

  /*
   * Generic visual-data support.
   *
   * Example:
   *
   * {
   *   type: "data_display",
   *   display: "table",
   *   title: "Nutrient Analysis",
   *   columns: ["Nutrient", "Amount"],
   *   rows: [...]
   * }
   */

  display?: string;
  title?: string;
  description?: string;
  columns?: string[];
  rows?: DataRow[];

  data?: unknown;

  message?: string;
}

interface LocationPayload {
  status: 'granted' | 'unavailable';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  reason?: string | number;
}

/* ============================================================
   HELPERS
   ============================================================ */

function humanizeKey(
  key: string,
): string {
  return key
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase(),
    );
}

function formatValue(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  if (
    typeof value === 'string'
  ) {
    return value;
  }

  if (
    typeof value === 'number'
  ) {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
  }

  if (
    typeof value === 'boolean'
  ) {
    return value
      ? 'Yes'
      : 'No';
  }

  if (Array.isArray(value)) {
    return value
      .map(formatValue)
      .join(', ');
  }

  if (
    typeof value === 'object'
  ) {
    return Object.entries(
      value as Record<
        string,
        unknown
      >,
    )
      .map(
        ([key, item]) =>
          `${humanizeKey(
            key,
          )}: ${formatValue(
            item,
          )}`,
      )
      .join(', ');
  }

  return String(value);
}

/* ============================================================
   FACILITY TABLE
   ============================================================ */

function FacilityTable({
  facilities,
}: {
  facilities: Facility[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">

      <div className="max-h-[55vh] overflow-auto">

        <table className="w-full border-collapse text-left">

          <thead className="sticky top-0 z-10 bg-slate-100">

            <tr>

              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                Facility
              </th>

              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                Type
              </th>

              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                Distance
              </th>

              <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                Details
              </th>

            </tr>

          </thead>

          <tbody>

            {facilities.map(
              (
                facility,
                index,
              ) => (
                <tr
                  key={
                    `${facility.osm_type ?? 'facility'}-${facility.osm_id ?? index}-${facility.name}`
                  }
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >

                  {/* Facility */}

                  <td className="min-w-[180px] px-4 py-3 align-top">

                    <div className="font-semibold text-slate-900">
                      {facility.name}
                    </div>

                    {facility.is_public && (
                      <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Public
                      </span>
                    )}

                  </td>

                  {/* Type */}

                  <td className="px-4 py-3 align-top text-sm capitalize text-slate-600">
                    {facility.type ||
                      'Healthcare facility'}
                  </td>

                  {/* Distance */}

                  <td className="whitespace-nowrap px-4 py-3 align-top">

                    <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-800">
                      {facility.distance_km}{' '}
                      km
                    </span>

                  </td>

                  {/* Details */}

                  <td className="min-w-[220px] px-4 py-3 align-top">

                    {facility.operator && (
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold">
                          Operator:
                        </span>{' '}
                        {facility.operator}
                      </p>
                    )}

                    {facility.address && (
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {facility.address}
                      </p>
                    )}

                    {facility.maps_url && (
                      <a
                        href={
                          facility.maps_url
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Open in Maps →
                      </a>
                    )}

                  </td>

                </tr>
              ),
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

/* ============================================================
   FACILITY CARDS
   ============================================================ */

function FacilityCards({
  facilities,
}: {
  facilities: Facility[];
}) {
  return (
    <div className="max-h-[55vh] space-y-3 overflow-y-auto">

      {facilities.map(
        (
          facility,
          index,
        ) => (
          <div
            key={
              `${facility.osm_type ?? 'facility'}-${facility.osm_id ?? index}-${facility.name}`
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >

            {/* Name + distance */}

            <div className="flex items-start justify-between gap-3">

              <div>

                <h3 className="font-semibold text-slate-900">
                  {facility.name}
                </h3>

                <p className="mt-1 text-xs capitalize text-slate-500">
                  {facility.type ||
                    'Healthcare facility'}
                </p>

              </div>

              <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800">
                {facility.distance_km}{' '}
                km
              </span>

            </div>

            {/* Public */}

            {facility.is_public && (
              <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                Public / government tagged
              </span>
            )}

            {/* Operator */}

            {facility.operator && (
              <p className="mt-2 text-xs text-slate-500">
                Operator:{' '}
                {facility.operator}
              </p>
            )}

            {/* Address */}

            {facility.address && (
              <p className="mt-3 text-xs leading-5 text-slate-600">
                {facility.address}
              </p>
            )}

            {/* Maps */}

            {facility.maps_url && (
              <a
                href={
                  facility.maps_url
                }
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                Open in Maps →
              </a>
            )}

          </div>
        ),
      )}

    </div>
  );
}

/* ============================================================
   GENERIC DATA TABLE
   ============================================================ */

function GenericDataTable({
  payload,
}: {
  payload: HealthPayload;
}) {
  const rows =
    payload.rows ?? [];

  const columns = useMemo(() => {

    if (
      payload.columns &&
      payload.columns.length > 0
    ) {
      return payload.columns;
    }

    const keys =
      new Set<string>();

    rows.forEach(
      (row) => {
        Object.keys(row).forEach(
          (key) =>
            keys.add(key),
        );
      },
    );

    return Array.from(keys);

  }, [
    payload.columns,
    rows,
  ]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">

      <div className="max-h-[55vh] overflow-auto">

        <table className="w-full border-collapse text-left">

          <thead className="sticky top-0 z-10 bg-slate-100">

            <tr>

              {columns.map(
                (column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600"
                  >
                    {humanizeKey(
                      column,
                    )}
                  </th>
                ),
              )}

            </tr>

          </thead>

          <tbody>

            {rows.map(
              (
                row,
                rowIndex,
              ) => (
                <tr
                  key={`row-${rowIndex}`}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >

                  {columns.map(
                    (column) => (
                      <td
                        key={`${rowIndex}-${column}`}
                        className="max-w-[320px] px-4 py-3 align-top text-sm leading-5 text-slate-700"
                      >
                        {formatValue(
                          row[
                            column
                          ],
                        )}
                      </td>
                    ),
                  )}

                </tr>
              ),
            )}

          </tbody>

        </table>

      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-400">
        {rows.length}{' '}
        {rows.length === 1
          ? 'result'
          : 'results'}
      </div>

    </div>
  );
}

/* ============================================================
   MAIN PANEL
   ============================================================ */

export function HealthFacilityPanel() {

  const [
    payload,
    setPayload,
  ] =
    useState<HealthPayload | null>(
      null,
    );

  const [
    visible,
    setVisible,
  ] = useState(true);

  const {
    send: sendLocation,
  } =
    useDataChannel(
      'arogya-location',
    );

  /* ==========================================================
     RECEIVE HEALTH DATA
     ========================================================== */

  useDataChannel(
    'arogya-health',
    (message) => {

      try {

        const decoded =
          new TextDecoder().decode(
            message.payload,
          );

        const data =
          JSON.parse(
            decoded,
          ) as HealthPayload;

        /*
         * Existing facility lookup.
         */
        if (
          data.type ===
          'health_facilities'
        ) {
          setPayload(data);
          setVisible(true);
          return;
        }

        /*
         * Generic large-data display.
         *
         * Supports:
         *
         * data_display
         * nutrient_table
         * nutrient_analysis
         */

        if (
          data.type ===
            'data_display' ||
          data.type ===
            'nutrient_table' ||
          data.type ===
            'nutrient_analysis'
        ) {
          setPayload(data);
          setVisible(true);
        }

      } catch (error) {

        console.error(
          'Unable to read Arogya health data:',
          error,
        );

      }

    },
  );

  /* ==========================================================
     SEND DEVICE LOCATION
     ========================================================== */

  useEffect(() => {

    if (
      !navigator.geolocation
    ) {

      const locationPayload:
        LocationPayload = {
        status:
          'unavailable',
        reason:
          'geolocation_not_supported',
      };

      void sendLocation(
        new TextEncoder().encode(
          JSON.stringify(
            locationPayload,
          ),
        ),
        {
          reliable: true,
        },
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(

      (position) => {

        const locationPayload:
          LocationPayload = {
          status:
            'granted',

          latitude:
            position.coords
              .latitude,

          longitude:
            position.coords
              .longitude,

          accuracy:
            position.coords
              .accuracy,
        };

        void sendLocation(
          new TextEncoder().encode(
            JSON.stringify(
              locationPayload,
            ),
          ),
          {
            reliable: true,
          },
        );

      },

      (error) => {

        console.warn(
          'Device location unavailable:',
          error.message,
        );

        const locationPayload:
          LocationPayload = {
          status:
            'unavailable',
          reason:
            error.code,
        };

        void sendLocation(
          new TextEncoder().encode(
            JSON.stringify(
              locationPayload,
            ),
          ),
          {
            reliable: true,
          },
        );

      },

      {
        enableHighAccuracy:
          false,

        timeout:
          5000,

        maximumAge:
          300000,
      },
    );

  }, [sendLocation]);

  /* ==========================================================
     NOTHING TO DISPLAY
     ========================================================== */

  if (
    !payload ||
    !visible
  ) {
    return null;
  }

  /* ==========================================================
     CLOSE PANEL
     ========================================================== */

  const handleClose = () => {
    setVisible(false);
  };

  /* ==========================================================
     FACILITY DATA
     ========================================================== */

  const facilities =
    payload.facilities ?? [];

  /*
   * Automatically use a table when
   * there are many facilities.
   *
   * 1-3 facilities:
   * detailed cards are easier to read.
   *
   * 4+ facilities:
   * table is much more efficient.
   */

  const shouldUseFacilityTable =
    facilities.length >= 4;

  /* ==========================================================
     GENERIC DATA
     ========================================================== */

  const isGenericData =
    payload.type ===
      'data_display' ||
    payload.type ===
      'nutrient_table' ||
    payload.type ===
      'nutrient_analysis';

  return (
    <aside className="pointer-events-auto absolute right-4 top-20 z-[120] w-[min(680px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl">

      {/* ======================================================
          HEADER
         ====================================================== */}

      <div className="border-b border-slate-100 px-5 py-4">

        <div className="flex items-center justify-between gap-4">

          <div className="flex min-w-0 items-center gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl">
              {isGenericData
                ? '📊'
                : '🏥'}
            </div>

            <div className="min-w-0">

              <h2 className="truncate font-bold text-slate-900">

                {payload.title ||
                  (
                    payload.type ===
                    'health_facilities'
                      ? 'Nearby Healthcare'
                      : 'Arogya Results')}

              </h2>

              <p className="truncate text-xs text-slate-500">

                {payload.search_location ||
                  payload.description ||
                  'Detailed information'}

              </p>

            </div>

          </div>

          {/* Close */}

          <button
            type="button"
            onClick={
              handleClose
            }
            aria-label="Close results"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>

        </div>

      </div>

      {/* ======================================================
          CONTENT
         ====================================================== */}

      <div className="p-4">

        {/* ----------------------------------------------------
            NO RESULTS
           ---------------------------------------------------- */}

        {payload.status ===
        'no_results' ? (

          <div className="rounded-2xl bg-slate-50 px-5 py-5 text-sm leading-6 text-slate-600">

            {payload.message ||
              'No mapped healthcare facilities were found nearby.'}

          </div>

        ) : isGenericData ? (

          /* --------------------------------------------------
             GENERIC TABLE
             -------------------------------------------------- */

          payload.rows &&
          payload.rows.length > 0 ? (

            <GenericDataTable
              payload={payload}
            />

          ) : (

            <div className="rounded-2xl bg-slate-50 px-5 py-5 text-sm leading-6 text-slate-600">

              No detailed data
              was returned.

            </div>

          )

        ) : facilities.length ===
          0 ? (

          /* --------------------------------------------------
             EMPTY FACILITY RESULT
             -------------------------------------------------- */

          <div className="rounded-2xl bg-slate-50 px-5 py-5 text-sm leading-6 text-slate-600">

            {payload.message ||
              'No healthcare facilities were returned.'}

          </div>

        ) : shouldUseFacilityTable ? (

          /* --------------------------------------------------
             LARGE FACILITY RESULT
             -------------------------------------------------- */

          <FacilityTable
            facilities={
              facilities
            }
          />

        ) : (

          /* --------------------------------------------------
             SMALL FACILITY RESULT
             -------------------------------------------------- */

          <FacilityCards
            facilities={
              facilities
            }
          />

        )}

      </div>

      {/* ======================================================
          LARGE DATA VOICE UX HINT
         ====================================================== */}

      {(
        facilities.length >=
          4 ||
        isGenericData
      ) && (

        <div className="border-t border-slate-100 bg-teal-50 px-5 py-3">

          <p className="text-xs leading-5 text-teal-800">

            <span className="font-semibold">
              Detailed results
            </span>{' '}
            are displayed here so
            Arogya can summarize
            the important information
            instead of reading every
            result aloud.

          </p>

        </div>

      )}

      {/* ======================================================
          DATA SOURCE
         ====================================================== */}

      <div className="border-t border-slate-100 px-5 py-3 text-[10px] leading-4 text-slate-400">

        {payload.source && (
          <div>
            Source:{' '}
            {payload.source}
          </div>
        )}

        {payload.fetched_at_utc && (
          <div>
            Fetched:{' '}
            {new Date(
              payload.fetched_at_utc,
            ).toLocaleString()}
          </div>
        )}

        {payload.radius_m && (
          <div>
            Search radius:{' '}
            {(
              payload.radius_m /
              1000
            ).toFixed(1)}{' '}
            km
          </div>
        )}

      </div>

    </aside>
  );
}