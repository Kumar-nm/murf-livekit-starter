'use client';

import { useEffect, useState } from 'react';
import { useDataChannel } from '@livekit/components-react';

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

interface HealthPayload {
  type?: string;
  status?: string;
  source?: string;
  fetched_at_utc?: string;
  search_location?: string;
  radius_m?: number;
  facilities?: Facility[];
  message?: string;
}

interface LocationPayload {
  status: 'granted' | 'unavailable';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  reason?: string | number;
}

export function HealthFacilityPanel() {
  const [payload, setPayload] =
    useState<HealthPayload | null>(null);

  const { send: sendLocation } =
    useDataChannel('arogya-location');

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

        if (
          data.type === 'health_facilities'
        ) {
          setPayload(data);
        }
      } catch (error) {
        console.error(
          'Unable to read Arogya health data:',
          error,
        );
      }
    },
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      const locationPayload: LocationPayload = {
        status: 'unavailable',
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
        const locationPayload: LocationPayload = {
          status: 'granted',
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy:
            position.coords.accuracy,
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

        const locationPayload: LocationPayload = {
          status: 'unavailable',
          reason: error.code,
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
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      },
    );
  }, [sendLocation]);

  if (!payload) {
    return null;
  }

  const facilities =
    payload.facilities ?? [];

  return (
    <aside className="pointer-events-auto absolute right-4 top-20 z-[120] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl">

      {/* Header */}
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-xl">
            🏥
          </div>

          <div>
            <h2 className="font-bold text-slate-900">
              Nearby Healthcare
            </h2>

            <p className="text-xs text-slate-500">
              {payload.search_location ||
                'Current location'}
            </p>
          </div>

        </div>
      </div>

      {/* No results */}
      {payload.status === 'no_results' ? (
        <div className="px-5 py-5 text-sm leading-6 text-slate-600">
          {payload.message ||
            'No mapped healthcare facilities were found nearby.'}
        </div>
      ) : facilities.length === 0 ? (
        <div className="px-5 py-5 text-sm leading-6 text-slate-600">
          No healthcare facilities were returned.
        </div>
      ) : (
        /* Results */
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">

          {facilities.map(
            (facility, index) => (
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
                      {facility.type}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800">
                    {facility.distance_km} km
                  </span>

                </div>

                {/* Public facility */}
                {facility.is_public && (
                  <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    Public / government tagged
                  </span>
                )}

                {/* Operator */}
                {facility.operator && (
                  <p className="mt-2 text-xs text-slate-500">
                    Operator: {facility.operator}
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
                    href={facility.maps_url}
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
      )}

      {/* Data source */}
      <div className="border-t border-slate-100 px-5 py-3 text-[10px] leading-4 text-slate-400">

        <div>
          Source:{' '}
          {payload.source ||
            'OpenStreetMap Overpass'}
        </div>

        {payload.fetched_at_utc && (
          <div>
            Fetched:{' '}
            {new Date(
              payload.fetched_at_utc,
            ).toLocaleString()}
          </div>
        )}

      </div>

    </aside>
  );
}