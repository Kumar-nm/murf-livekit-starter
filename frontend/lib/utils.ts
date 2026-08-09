import { cache } from 'react';
import { TokenSource } from 'livekit-client';

import {
  APP_CONFIG_DEFAULTS,
} from '@/app-config';

import type {
  AppConfig,
} from '@/app-config';

export const CONFIG_ENDPOINT =
  process.env.NEXT_PUBLIC_APP_CONFIG_ENDPOINT;

export const SANDBOX_ID =
  process.env.SANDBOX_ID;

export interface SandboxConfig {
  [key: string]:
    | {
        type: 'string';
        value: string;
      }
    | {
        type: 'number';
        value: number;
      }
    | {
        type: 'boolean';
        value: boolean;
      }
    | null;
}


/**
 * Get the app configuration.
 */
export const getAppConfig = cache(
  async (
    headers: Headers
  ): Promise<AppConfig> => {
    if (CONFIG_ENDPOINT) {
      const sandboxId =
        SANDBOX_ID ??
        headers.get('x-sandbox-id') ??
        '';

      try {
        if (!sandboxId) {
          throw new Error(
            'Sandbox ID is required'
          );
        }

        const response =
          await fetch(
            CONFIG_ENDPOINT,
            {
              cache: 'no-store',
              headers: {
                'X-Sandbox-ID':
                  sandboxId,
              },
            }
          );

        if (response.ok) {
          const remoteConfig: SandboxConfig =
            await response.json();

          const config: AppConfig = {
            ...APP_CONFIG_DEFAULTS,
            sandboxId,
          };

          for (const [
            key,
            entry,
          ] of Object.entries(
            remoteConfig
          )) {
            if (entry === null) {
              continue;
            }

            if (
              (key in APP_CONFIG_DEFAULTS &&
                APP_CONFIG_DEFAULTS[
                  key as keyof AppConfig
                ] === undefined) ||
              (typeof config[
                key as keyof AppConfig
              ] === entry.type &&
                typeof config[
                  key as keyof AppConfig
                ] === typeof entry.value)
            ) {
              // @ts-expect-error
              config[
                key as keyof AppConfig
              ] =
                entry.value as AppConfig[
                  keyof AppConfig
                ];
            }
          }

          return config;
        }

        console.error(
          `ERROR: querying config endpoint failed with status ${response.status}: ${response.statusText}`
        );
      } catch (error) {
        console.error(
          'ERROR: getAppConfig() - lib/utils.ts',
          error
        );
      }
    }

    return APP_CONFIG_DEFAULTS;
  }
);


/**
 * Get styles for the app.
 */
export function getStyles(
  appConfig: AppConfig
) {
  const {
    accent,
    accentDark,
  } = appConfig;

  return [
    accent
      ? `:root { --primary: ${accent}; --primary-hover: color-mix(in srgb, ${accent} 80%, #000); }`
      : '',

    accentDark
      ? `.dark { --primary: ${accentDark}; --primary-hover: color-mix(in srgb, ${accentDark} 80%, #000); }`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}


/**
 * Get the persistent Arogya user ID.
 *
 * This ID stays in the browser's localStorage.
 *
 * Therefore:
 *
 * Call 1 → user ID A
 * Call 2 → user ID A
 * Call 3 → user ID A
 *
 * A new ID is only generated when the
 * browser has never used Arogya before.
 */
function getPersistentUserId(): string {
  let userId =
    localStorage.getItem(
      'arogya_user_id'
    );

  if (!userId) {
    userId = crypto.randomUUID();

    localStorage.setItem(
      'arogya_user_id',
      userId
    );

    console.log(
      'Created new Arogya user ID:',
      userId
    );
  } else {
    console.log(
      'Using existing Arogya user ID:',
      userId
    );
  }

  return userId;
}


/**
 * Create a LiveKit token source
 * using the persistent Arogya user ID.
 */
export function getPersistentTokenSource(
  appConfig: AppConfig
) {
  return TokenSource.custom(
    async () => {
      const userId =
        getPersistentUserId();

      const roomConfig =
        appConfig.agentName
          ? {
              agents: [
                {
                  agent_name:
                    appConfig.agentName,
                },
              ],
            }
          : undefined;

      console.log(
        'Requesting LiveKit token for user:',
        userId
      );

      try {
        const response =
          await fetch(
            '/api/token',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                user_id: userId,
                room_config:
                  roomConfig,
              }),
            }
          );

        if (!response.ok) {
          const errorText =
            await response.text();

          console.error(
            'Token API error:',
            errorText
          );

          throw new Error(
            errorText ||
              'Unable to obtain LiveKit token'
          );
        }

        return await response.json();
      } catch (error) {
        console.error(
          'Error fetching LiveKit connection details:',
          error
        );

        throw new Error(
          'Error fetching connection details!'
        );
      }
    }
  );
}


/**
 * Kept for compatibility with the
 * existing application code.
 *
 * The application will be switched to
 * getPersistentTokenSource in the next step.
 */
export function getSandboxTokenSource(
  appConfig: AppConfig
) {
  return getPersistentTokenSource(
    appConfig
  );
}