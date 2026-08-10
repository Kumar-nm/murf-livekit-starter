'use client';
import { HealthFacilityPanel } from '@/components/app/health-facility-panel';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { useSessionContext } from '@livekit/components-react';

import type { AppConfig } from '@/app-config';

import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { WelcomeView } from '@/components/app/welcome-view';

import {
  LANGUAGES,
  translations,
  type Language,
} from './language';

const MotionWelcomeView = motion.create(WelcomeView);
const MotionSessionView = motion.create(AgentSessionView_01);

const VIEW_MOTION_PROPS = {
  variants: {
    visible: {
      opacity: 1,
    },
    hidden: {
      opacity: 0,
    },
  },

  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',

  transition: {
    duration: 0.35,
    ease: 'easeOut',
  },
};

interface ViewControllerProps {
  appConfig: AppConfig;
}

export function ViewController({
  appConfig,
}: ViewControllerProps) {
  const {
    isConnected,
    connectionState,
    start,
  } = useSessionContext();

  const { resolvedTheme } = useTheme();

  const [language, setLanguage] =
    useState<Language>('en');

  const [hasStarted, setHasStarted] =
    useState(false);

  const [hasEnded, setHasEnded] =
    useState(false);

  const [isConnecting, setIsConnecting] =
    useState(false);

  const [micError, setMicError] =
    useState(false);

  const t = translations[language];

  /*
   * When the connection is successfully established,
   * hide the connecting/ended states.
   */
  useEffect(() => {
    if (isConnected) {
      setIsConnecting(false);
      setMicError(false);
      setHasEnded(false);
      return;
    }

    /*
     * Show the ended screen only when the session is
     * completely disconnected.
     */
    if (
      hasStarted &&
      !isConnecting &&
      !micError &&
      connectionState === 'disconnected'
    ) {
      setHasEnded(true);
    }
  }, [
    isConnected,
    connectionState,
    hasStarted,
    isConnecting,
    micError,
  ]);


  const getUserId = () => {
    let userId = localStorage.getItem('arogya_user_id');

    if (!userId) {
      userId = crypto.randomUUID();

      localStorage.setItem(
        'arogya_user_id',
        userId
      );
    }

    // Send the same persistent ID to /api/token
    document.cookie =
      `arogya_user_id=${encodeURIComponent(userId)}; path=/; max-age=31536000; SameSite=Lax`;

    console.log('Arogya user ID:', userId);

    return userId;
  };

  /*
   * Start a new voice session.
   */
  const handleStart = async () => {
    /*
     * Only start when the previous LiveKit session
     * is completely disconnected.
     */
    if (connectionState !== 'disconnected') {
      console.log(
        'Session is not fully disconnected:',
        connectionState
      );
      return;
    }

    setHasStarted(true);
    setHasEnded(false);
    setMicError(false);
    setIsConnecting(true);

    try {
      /*
       * Check microphone permission before starting
       * the LiveKit session.
       */
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      /*
       * We only use this stream to verify permission.
       * LiveKit creates and manages its own microphone track.
       */
      stream.getTracks().forEach((track) => {
        track.stop();
      });

      /*
       * Start the LiveKit session.
       */
      stream.getTracks().forEach((track) => {
        track.stop();
      });

      // Create/retrieve persistent caller ID
      getUserId();

      await start();
      
    } catch (error) {
      console.error(
        'Unable to start voice session:',
        error
      );

      setIsConnecting(false);
      setMicError(true);
    }
  };

  /*
   * Return to the homepage.
   */
  const handleBackToHome = () => {
    setHasStarted(false);
    setHasEnded(false);
    setIsConnecting(false);
    setMicError(false);
  };

  /*
   * Homepage state.
   */
  const isReady =
    !isConnected &&
    !hasStarted &&
    !hasEnded &&
    !isConnecting &&
    !micError;

  /*
   * Connecting state.
   */
  const showConnecting =
    !isConnected &&
    isConnecting &&
    !micError;

  /*
   * Call-ended state.
   */
  const showEnded =
    !isConnected &&
    hasEnded &&
    !isConnecting &&
    !micError;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">

      {/* =================================================
          LANGUAGE SELECTOR
         ================================================= */}

      <div className="pointer-events-auto absolute right-4 top-4 z-[200] md:right-6 md:top-6">

        <label
          className="sr-only"
          htmlFor="language-selector"
        >
          Language
        </label>

        <select
          id="language-selector"
          value={language}
          onChange={(event) => {
            setLanguage(
              event.target.value as Language
            );
          }}
          className="cursor-pointer appearance-none rounded-full border border-white/70 bg-white/90 px-5 py-2.5 pr-9 text-sm font-semibold text-slate-800 shadow-lg outline-none backdrop-blur-xl transition hover:bg-white focus:ring-2 focus:ring-teal-500"
        >
          {LANGUAGES.map((item) => (
            <option
              key={item.code}
              value={item.code}
            >
              {item.nativeLabel}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          ▾
        </span>
      </div>

      <AnimatePresence
        initial={false}
        mode="wait"
      >

        {/* =================================================
            MICROPHONE ERROR
           ================================================= */}

        {micError && !isConnected && (
          <motion.div
            key="mic-error"
            {...VIEW_MOTION_PROPS}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-50 px-6"
          >
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-2xl">
                🎙️
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                {t.microphoneAccess}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t.microphoneDescription}
              </p>

              <button
                type="button"
                onClick={handleStart}
                className="mt-6 rounded-full bg-teal-700 px-8 py-3 font-semibold text-white shadow-lg transition hover:bg-teal-800"
              >
                {t.tryAgain}
              </button>

            </div>
          </motion.div>
        )}

        {/* =================================================
            CONNECTING
           ================================================= */}

        {showConnecting && (
          <motion.div
            key="connecting"
            {...VIEW_MOTION_PROPS}
            className="absolute inset-0 z-[90] flex items-center justify-center bg-slate-50 px-6"
          >
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-8 text-center shadow-xl backdrop-blur">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" />
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                {t.connecting}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t.connectingDescription}
              </p>

            </div>
          </motion.div>
        )}

        {/* =================================================
            CALL ENDED
           ================================================= */}

        {showEnded && (
          <motion.div
            key="ended"
            {...VIEW_MOTION_PROPS}
            className="absolute inset-0 z-[110] flex items-center justify-center bg-slate-50 px-6"
          >
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-2xl text-teal-800">
                ✓
              </div>

              <h2 className="mt-5 text-3xl font-bold text-slate-900">
                {t.callEnded}
              </h2>

              <p className="mt-2 text-slate-600">
                {t.conversationEnded}
              </p>

              <div className="mt-6 flex flex-col gap-3">

                <button
                  type="button"
                  onClick={handleStart}
                  className="w-full rounded-full bg-teal-700 px-8 py-3 font-semibold text-white shadow-lg transition hover:bg-teal-800"
                >
                  {t.startAgain}
                </button>

                <button
                  type="button"
                  onClick={handleBackToHome}
                  className="w-full rounded-full border border-slate-300 bg-white px-8 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t.backToHome}
                </button>

              </div>

            </div>
          </motion.div>
        )}

        {/* =================================================
            HOME / READY
           ================================================= */}

        {isReady && (
          <MotionWelcomeView
            key="welcome"
            {...VIEW_MOTION_PROPS}
            language={language}
            startButtonText={t.startTalking}
            onStartCall={handleStart}
          />
        )}

        {/* =================================================
            ACTIVE SESSION
           ================================================= */}

        {isConnected && (
          <>
            <HealthFacilityPanel />

            <MotionSessionView
              key="session"
              {...VIEW_MOTION_PROPS}
              language={language}
              supportsChatInput={
                appConfig.supportsChatInput
              }
              supportsVideoInput={
                appConfig.supportsVideoInput
              }
              supportsScreenShare={
                appConfig.supportsScreenShare
              }
              isPreConnectBufferEnabled={
                appConfig.isPreConnectBufferEnabled
              }
              audioVisualizerType={
                appConfig.audioVisualizerType
              }
              audioVisualizerColor={
                resolvedTheme === 'dark'
                  ? appConfig.audioVisualizerColorDark
                  : appConfig.audioVisualizerColor
              }
              audioVisualizerColorShift={
                appConfig.audioVisualizerColorShift
              }
              audioVisualizerBarCount={
                appConfig.audioVisualizerBarCount
              }
              audioVisualizerGridRowCount={
                appConfig.audioVisualizerGridRowCount
              }
              audioVisualizerGridColumnCount={
                appConfig.audioVisualizerGridColumnCount
              }
              audioVisualizerRadialBarCount={
                appConfig.audioVisualizerRadialBarCount
              }
              audioVisualizerRadialRadius={
                appConfig.audioVisualizerRadialRadius
              }
              audioVisualizerWaveLineWidth={
                appConfig.audioVisualizerWaveLineWidth
              }
              className="absolute inset-0"
            />
          </>
        )}

      </AnimatePresence>
    </div>
  );
}