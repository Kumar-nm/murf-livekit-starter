'use client';

import React, { useMemo } from 'react';
import { Track } from 'livekit-client';

import {
  AnimatePresence,
  type MotionProps,
  motion,
} from 'motion/react';

import {
  type TrackReference,
  VideoTrack,
  useAgent,
  useLocalParticipant,
  useTracks,
} from '@livekit/components-react';

import { cn } from '@/lib/shadcn/utils';

import { AudioVisualizer } from './audio-visualizer';

import {
  translations,
  type Language,
} from '@/components/app/language';

const ANIMATION_TRANSITION: MotionProps['transition'] = {
  type: 'spring',
  stiffness: 675,
  damping: 75,
  mass: 1,
};

export function useLocalTrackRef(
  source: Track.Source
) {
  const { localParticipant } =
    useLocalParticipant();

  const publication =
    localParticipant.getTrackPublication(source);

  return useMemo<
    TrackReference | undefined
  >(
    () =>
      publication
        ? {
            source,
            participant:
              localParticipant,
            publication,
          }
        : undefined,
    [
      source,
      publication,
      localParticipant,
    ]
  );
}

interface TileLayoutProps {
  chatOpen: boolean;

  audioVisualizerType?:
    | 'bar'
    | 'wave'
    | 'grid'
    | 'radial'
    | 'aura';

  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorShift?: number;

  audioVisualizerWaveLineWidth?: number;

  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;

  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;

  audioVisualizerBarCount?: number;

  language?: Language;
}

export function TileLayout({
  chatOpen,
  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerWaveLineWidth,
  language = 'en',
}: TileLayoutProps) {
  const { state: agentState } =
    useAgent();

  const [screenShareTrack] =
    useTracks([
      Track.Source.ScreenShare,
    ]);

  const cameraTrack =
    useLocalTrackRef(
      Track.Source.Camera
    );

  const isCameraEnabled =
    cameraTrack &&
    !cameraTrack.publication.isMuted;

  const isScreenShareEnabled =
    screenShareTrack &&
    !screenShareTrack.publication.isMuted;

  const t = translations[language];

  const stateLabel =
    agentState === 'speaking'
      ? t.speaking
      : agentState === 'listening'
        ? t.listening
        : agentState === 'thinking'
          ? t.thinking
          : t.connected;

  const stateColor =
    agentState === 'speaking'
      ? 'bg-teal-500'
      : agentState === 'listening'
        ? 'bg-blue-500'
        : agentState === 'thinking'
          ? 'bg-amber-500'
          : 'bg-emerald-500';

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">

      {/* =================================================
          AUDIO VISUALIZER
          This is the entire right-side background.
         ================================================= */}

      <div className="absolute inset-0 flex items-center justify-center">

        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950" />

        <motion.div
          initial={{
            opacity: 0,
            scale: 0.92,
          }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          transition={ANIMATION_TRANSITION}
          className="relative z-10 flex h-full w-full items-center justify-center"
        >
          <AudioVisualizer
            audioVisualizerType={
              audioVisualizerType
            }
            audioVisualizerColor={
              audioVisualizerColor
            }
            audioVisualizerColorShift={
              audioVisualizerColorShift
            }
            audioVisualizerBarCount={
              audioVisualizerBarCount
            }
            audioVisualizerRadialBarCount={
              audioVisualizerRadialBarCount
            }
            audioVisualizerRadialRadius={
              audioVisualizerRadialRadius
            }
            audioVisualizerGridRowCount={
              audioVisualizerGridRowCount
            }
            audioVisualizerGridColumnCount={
              audioVisualizerGridColumnCount
            }
            audioVisualizerWaveLineWidth={
              audioVisualizerWaveLineWidth
            }
            isChatOpen={chatOpen}
            className="h-[70%] w-[85%]"
            style={{
              color:
                audioVisualizerColor,
            }}
          />
        </motion.div>
      </div>

      {/* =================================================
          STATE
         ================================================= */}

      <div className="absolute left-1/2 top-5 z-[60] -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-5 py-2.5 shadow-xl backdrop-blur-xl">

          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              stateColor,
              (agentState ===
                'speaking' ||
                agentState ===
                  'listening' ||
                agentState ===
                  'thinking') &&
                'animate-pulse'
            )}
          />

          <span className="whitespace-nowrap text-sm font-semibold text-white">
            {stateLabel}
          </span>
        </div>
      </div>

      {/* =================================================
          CAMERA / SCREEN SHARE
         ================================================= */}

      <AnimatePresence>
        {((cameraTrack &&
          isCameraEnabled) ||
          (screenShareTrack &&
            isScreenShareEnabled)) && (
          <motion.div
            key="camera-or-screen"
            initial={{
              opacity: 0,
              scale: 0.8,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.8,
            }}
            transition={
              ANIMATION_TRANSITION
            }
            className="pointer-events-auto absolute right-5 top-20 z-[70] size-[90px] overflow-hidden rounded-2xl border border-white/20 bg-black/50 shadow-xl backdrop-blur-md"
          >
            <VideoTrack
              trackRef={
                cameraTrack ||
                screenShareTrack
              }
              width={
                (
                  cameraTrack ||
                  screenShareTrack
                )?.publication
                  .dimensions
                  ?.width ?? 0
              }
              height={
                (
                  cameraTrack ||
                  screenShareTrack
                )?.publication
                  .dimensions
                  ?.height ?? 0
              }
              className="h-full w-full object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}