'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';

import type { AppConfig } from '@/app-config';

import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { ViewController } from '@/components/app/view-controller';

import { Toaster } from '@/components/ui/sonner';

import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';

import { getPersistentTokenSource } from '@/lib/utils';

const IN_DEVELOPMENT =
  process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({
    enabled: IN_DEVELOPMENT,
  });

  useAgentErrors();

  return null;
}

interface AppProps {
  appConfig: AppConfig;
}

export function App({
  appConfig,
}: AppProps) {

  /*
   * IMPORTANT:
   *
   * The token source now creates/reuses
   * the persistent Arogya user ID.
   */
  const tokenSource = useMemo(
    () =>
      getPersistentTokenSource(
        appConfig
      ),
    [appConfig]
  );

  const session = useSession(
    tokenSource,
    appConfig.agentName
      ? {
          agentName:
            appConfig.agentName,
        }
      : undefined
  );

  return (
    <AgentSessionProvider
      session={session}
    >

      <AppSetup />

      <main className="relative h-svh w-full overflow-hidden">

        {/* Human Support Dashboard Link */}
        <Link
          href="/dashboard"
          className="absolute bottom-7 right-5 z-50 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/60"
        >
          AGENT Dashboard
        </Link>

        <ViewController
          appConfig={appConfig}
        />

      </main>

      <StartAudioButton
        label="Start Audio"
      />

      <Toaster
        icons={{
          warning: (
            <WarningIcon weight="bold" />
          ),
        }}
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg':
              'var(--popover)',
            '--normal-text':
              'var(--popover-foreground)',
            '--normal-border':
              'var(--border)',
          } as React.CSSProperties
        }
      />

    </AgentSessionProvider>
  );
}