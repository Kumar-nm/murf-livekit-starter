'use client';

import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AnimatePresence,
  type MotionProps,
  motion,
} from 'motion/react';

import {
  useSessionContext,
  useSessionMessages,
} from '@livekit/components-react';

import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';

import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';

import { cn } from '@/lib/shadcn/utils';

import { TileLayout } from './tile-view';

import {
  translations,
  type Language,
} from '@/components/app/language';

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },

  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',

  transition: {
    duration: 0.3,
    delay: 0.15,
    ease: 'easeOut',
  },
};

const CHAT_MOTION_PROPS: MotionProps = {
  variants: {
    hidden: {
      opacity: 0,
    },

    visible: {
      opacity: 1,
    },
  },

  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',

  transition: {
    duration: 0.3,
    ease: 'easeOut',
  },
};

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({
  top = false,
  bottom = false,
  className,
}: FadeProps) {
  return (
    <div
      className={cn(
        'pointer-events-none h-4 from-background to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

export interface AgentSessionView_01Props {
  preConnectMessage?: string;

  supportsChatInput?: boolean;
  supportsVideoInput?: boolean;
  supportsScreenShare?: boolean;

  isPreConnectBufferEnabled?: boolean;

  audioVisualizerType?:
    | 'bar'
    | 'wave'
    | 'grid'
    | 'radial'
    | 'aura';

  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorShift?: number;

  audioVisualizerBarCount?: number;

  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;

  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;

  audioVisualizerWaveLineWidth?: number;

  language?: Language;

  className?: string;
}

export function AgentSessionView_01({
  preConnectMessage = 'Your health assistant is ready to listen',

  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,

  isPreConnectBufferEnabled = true,

  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerWaveLineWidth,

  language = 'en',

  ref,
  className,
  ...props
}: React.ComponentProps<'section'> &
  AgentSessionView_01Props) {
  const session = useSessionContext();

  const { messages } =
    useSessionMessages(session);

  const [chatOpen, setChatOpen] =
    useState(false);

  const scrollAreaRef =
    useRef<HTMLDivElement | null>(null);

  const t = translations[language];

  const controls: AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  /*
   * Keep transcript scrolled to the newest
   * local message.
   */
  useEffect(() => {
    const lastMessage =
      messages.at(-1);

    const lastMessageIsLocal =
      lastMessage?.from?.isLocal === true;

    if (
      scrollAreaRef.current &&
      lastMessageIsLocal
    ) {
      scrollAreaRef.current.scrollTop =
        scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  /*
   * The transcript is deliberately open by
   * default during the active call.
   *
   * The old chat toggle can still exist in
   * AgentControlBar, but it no longer controls
   * the main conversation display.
   */
  useEffect(() => {
    setChatOpen(true);
  }, []);

  return (
    <section
      ref={ref}
      className={cn(
        'relative z-10 h-full w-full overflow-hidden bg-slate-100',
        className
      )}
      {...props}
    >

      {/* =================================================
          MAIN TWO-PANEL AREA
         ================================================= */}

      <div className="absolute inset-x-0 top-0 bottom-[100px] z-10 flex flex-col md:bottom-[115px] md:flex-row">

        {/* =================================================
            LEFT — ROBOT + CONVERSATION
           ================================================= */}

        <div className="relative min-h-0 flex-1 overflow-hidden border-b border-slate-200 bg-slate-50 md:border-b-0 md:border-r">

          {/* Robot background */}

          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-white to-slate-100" />

            <img
              src="/assets/scene/robot.png"
              alt=""
              aria-hidden="true"
              className="absolute bottom-0 left-1/2 h-[42%] w-auto -translate-x-1/2 object-contain opacity-[0.10]"
            />

            <div className="absolute inset-0 bg-white/20" />
          </div>

          {/* Conversation heading */}

          <div className="relative z-20 px-5 pb-2 pt-5 md:px-8 md:pt-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-4 py-2 shadow-sm backdrop-blur-md">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal-600" />

              <span className="text-sm font-bold text-slate-800">
                {t.conversation}
              </span>
            </div>
          </div>

          {/* Transcript */}

          <div
            ref={scrollAreaRef}
            className="relative z-20 h-[calc(100%-75px)] overflow-y-auto px-3 pb-8 md:px-6"
          >
            <AnimatePresence>
              <motion.div
                {...CHAT_MOTION_PROPS}
                className="mx-auto h-full w-full max-w-2xl"
              >
                <AgentChatTranscript
                  agentState={undefined}
                  messages={messages}
                  className="h-full w-full text-slate-900 [&_*]:text-slate-900 [&_.is-user>div]:rounded-[20px] [&_.is-user>div]:bg-slate-200 [&_.is-user>div]:text-slate-900 [&>div>div]:px-3 [&>div>div]:py-2 md:[&>div>div]:px-5"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* =================================================
            RIGHT — AUDIO VISUALIZER
           ================================================= */}

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">

          <TileLayout
            chatOpen={chatOpen}
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
            language={language}
          />
        </div>
      </div>

      {/* =================================================
          BOTTOM CONTROLS
         ================================================= */}

      <motion.div
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="absolute inset-x-3 bottom-0 z-[80] md:inset-x-12"
      >

        {isPreConnectBufferEnabled &&
          messages.length === 0 && (
            <div className="pointer-events-none mx-auto mb-2 w-fit rounded-full bg-white/85 px-4 py-2 text-center text-xs font-semibold text-slate-700 shadow-md backdrop-blur-md">
              {preConnectMessage}
            </div>
          )}

        <div className="relative mx-auto max-w-2xl pb-3 md:pb-6">

          <div className="rounded-3xl border border-white/60 bg-white/95 p-2 shadow-2xl backdrop-blur-xl">

            <AgentControlBar
              variant="livekit"
              controls={controls}
              isChatOpen={chatOpen}
              isConnected={session.isConnected}
              onDisconnect={session.end}
              onIsChatOpenChange={setChatOpen}
            />

          </div>
        </div>
      </motion.div>
    </section>
  );
}