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

// ============================================================
// Animations
// ============================================================

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

// ============================================================
// Fade
// ============================================================

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
        className,
      )}
    />
  );
}

// ============================================================
// Props
// ============================================================

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

// ============================================================
// Main Component
// ============================================================

export function AgentSessionView_01({
  preConnectMessage =
    'Your health assistant is ready to listen',

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
  // ==========================================================
  // LiveKit
  // ==========================================================

  const session = useSessionContext();

  const { messages } =
    useSessionMessages(session);

  // ==========================================================
  // UI State
  // ==========================================================

  const [chatOpen, setChatOpen] =
    useState(false);

  const [
    showSaveConsent,
    setShowSaveConsent,
  ] = useState(false);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    isDiscarding,
    setIsDiscarding,
  ] = useState(false);

  const [
    isListeningForConsent,
    setIsListeningForConsent,
  ] = useState(false);

  const [
    consentStatus,
    setConsentStatus,
  ] = useState<
    'playing' | 'listening' | 'saving' | 'discarding' | 'ready'
  >('ready');

  // ==========================================================
  // Refs
  // ==========================================================

  const scrollAreaRef =
    useRef<HTMLDivElement | null>(null);

  const consentAudioRef =
    useRef<HTMLAudioElement | null>(null);

  // Consent microphone
  const consentRecorderRef =
    useRef<MediaRecorder | null>(null);

  const consentChunksRef =
    useRef<Blob[]>([]);

  const consentRecordingTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const consentRecordingStreamRef =
    useRef<MediaStream | null>(null);

  const consentProcessingRef =
    useRef(false);

  const consentResolvedRef =
    useRef(false);

  const consentLoopCancelledRef =
    useRef(false);

  // Small audio graph
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const analyserRef =
    useRef<AnalyserNode | null>(null);

  const microphoneStreamRef =
    useRef<MediaStream | null>(null);

  const animationFrameRef =
    useRef<number | null>(null);

  // ==========================================================
  // Translations
  // ==========================================================

  const t =
    translations[language];

  // ==========================================================
  // Controls
  // ==========================================================

  const controls:
    AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  // ==========================================================
  // Keep transcript scrolled
  // ==========================================================

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

  // ==========================================================
  // Open transcript by default
  // ==========================================================

  useEffect(() => {
    setChatOpen(true);
  }, []);

  // ==========================================================
  // Stop consent microphone
  // ==========================================================

  const stopConsentRecording =
    () => {
      if (
        consentRecordingTimerRef.current
      ) {
        clearTimeout(
          consentRecordingTimerRef.current,
        );

        consentRecordingTimerRef.current =
          null;
      }

      const recorder =
        consentRecorderRef.current;

      if (recorder) {
        try {
          if (
            recorder.state !==
            'inactive'
          ) {
            recorder.stop();
          }
        } catch {
          // Already stopped.
        }

        consentRecorderRef.current =
          null;
      }

      consentChunksRef.current = [];

      if (
        consentRecordingStreamRef.current
      ) {
        consentRecordingStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        consentRecordingStreamRef.current =
          null;
      }

      setIsListeningForConsent(
        false,
      );
    };

  // ==========================================================
  // Stop small audio graph
  // ==========================================================

  const stopConsentVisualizer =
    () => {
      if (
        animationFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationFrameRef.current,
        );

        animationFrameRef.current =
          null;
      }

      if (
        microphoneStreamRef.current
      ) {
        microphoneStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        microphoneStreamRef.current =
          null;
      }

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          // Already closed.
        }

        audioContextRef.current =
          null;
      }

      analyserRef.current =
        null;
    };

  // ==========================================================
  // Start small audio graph
  // ==========================================================

  const startConsentVisualizer =
    async () => {
      try {
        if (
          microphoneStreamRef.current
        ) {
          return;
        }

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: true,
            },
          );

        microphoneStreamRef.current =
          stream;

        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (!AudioContextClass) {
          return;
        }

        const audioContext =
          new AudioContextClass();

        audioContextRef.current =
          audioContext;

        const analyser =
          audioContext.createAnalyser();

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant =
          0.75;

        analyserRef.current =
          analyser;

        const source =
          audioContext.createMediaStreamSource(
            stream,
          );

        source.connect(analyser);

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return;
        }

        const ctx =
          canvas.getContext('2d');

        if (!ctx) {
          return;
        }

        const bufferLength =
          analyser.frequencyBinCount;

        const dataArray =
          new Uint8Array(bufferLength);

        const draw =
          () => {
            const currentCanvas =
              canvasRef.current;

            const currentAnalyser =
              analyserRef.current;

            if (
              !currentCanvas ||
              !currentAnalyser
            ) {
              return;
            }

            const currentCtx =
              currentCanvas.getContext(
                '2d',
              );

            if (!currentCtx) {
              return;
            }

            currentAnalyser.getByteTimeDomainData(
              dataArray,
            );

            const width =
              currentCanvas.width;

            const height =
              currentCanvas.height;

            currentCtx.clearRect(
              0,
              0,
              width,
              height,
            );

            currentCtx.beginPath();

            const sliceWidth =
              width / bufferLength;

            let x = 0;

            for (
              let i = 0;
              i < bufferLength;
              i++
            ) {
              const value =
                dataArray[i] / 128.0;

              const y =
                (value * height) / 2;

              if (i === 0) {
                currentCtx.moveTo(
                  x,
                  y,
                );
              } else {
                currentCtx.lineTo(
                  x,
                  y,
                );
              }

              x += sliceWidth;
            }

            currentCtx.strokeStyle =
              '#0d9488';

            currentCtx.lineWidth = 2;

            currentCtx.stroke();

            animationFrameRef.current =
              requestAnimationFrame(
                draw,
              );
          };

        draw();
      } catch (error) {
        console.warn(
          'Consent microphone visualizer unavailable:',
          error,
        );
      }
    };

  // ==========================================================
  // Mute LiveKit microphone
  // ==========================================================

  const muteLiveKitMicrophone =
    async () => {
      try {
        if (
          session.room?.localParticipant
        ) {
          await session.room.localParticipant
            .setMicrophoneEnabled(false);
        }
      } catch (error) {
        console.warn(
          'Unable to mute LiveKit microphone during consent:',
          error,
        );
      }
    };

  // ==========================================================
  // Restore LiveKit microphone
  // ==========================================================

  const restoreLiveKitMicrophone =
    async () => {
      try {
        if (
          session.room?.localParticipant
        ) {
          await session.room.localParticipant
            .setMicrophoneEnabled(true);
        }
      } catch (error) {
        console.warn(
          'Unable to restore LiveKit microphone:',
          error,
        );
      }
    };

  // ==========================================================
  // Normalize transcript
  // ==========================================================

  const normalizeConsentTranscript =
    (
      transcript: string,
    ) => {
      return transcript
        .toLowerCase()
        .trim()
        .replace(
          /[.,!?;:'"]/g,
          '',
        )
        .replace(
          /\s+/g,
          ' ',
        );
    };

  // ==========================================================
  // Detect YES / NO
  // ==========================================================

  const getConsentAnswer =
    (
      transcript: string,
    ): 'yes' | 'no' | null => {
      const text =
        normalizeConsentTranscript(
          transcript,
        );

      const words =
        text.split(/\s+/);

      const yesWords = [
        'yes',
        'yeah',
        'yep',
        'sure',
        'okay',
        'ok',
        'haan',
        'ha',
      ];

      const noWords = [
        'no',
        'nope',
        'nah',
        'nahi',
        'nahin',
      ];

      if (
        words.some((word) =>
          yesWords.includes(word),
        )
      ) {
        return 'yes';
      }

      if (
        words.some((word) =>
          noWords.includes(word),
        )
      ) {
        return 'no';
      }

      if (
        text.includes(
          "don't save",
        ) ||
        text.includes(
          'do not save',
        ) ||
        text.includes(
          'dont save',
        )
      ) {
        return 'no';
      }

      if (
        text.includes(
          'yes save',
        ) ||
        text.includes(
          'yes please',
        )
      ) {
        return 'yes';
      }

      return null;
    };

  // ==========================================================
  // Send complete recording to Deepgram
  // ==========================================================

  const transcribeConsentChunk =
    async (
      blob: Blob,
    ): Promise<string> => {
      console.log(
        'Sending consent audio to Deepgram:',
        {
          size: blob.size,
          type: blob.type,
        },
      );

      const response =
        await fetch(
          '/api/consent-transcribe',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'audio/webm',
            },

            body: blob,
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(
          'Deepgram consent response:',
          data,
        );

        throw new Error(
          data?.error ||
            'Deepgram transcription failed.',
        );
      }

      return (
        data.transcript ||
        ''
      );
    };

  // ==========================================================
  // Process complete recording
  // ==========================================================

  const processConsentBlob =
    async (
      blob: Blob,
    ) => {
      if (
        consentResolvedRef.current ||
        !showSaveConsent ||
        isSaving ||
        isDiscarding ||
        consentProcessingRef.current
      ) {
        return;
      }

      if (
        blob.size < 1000
      ) {
        console.log(
          'Consent recording too small:',
          blob.size,
        );

        return;
      }

      consentProcessingRef.current =
        true;

      try {
        const transcript =
          await transcribeConsentChunk(
            blob,
          );

        if (
          !transcript ||
          consentResolvedRef.current ||
          !showSaveConsent
        ) {
          return;
        }

        console.log(
          'Consent Deepgram transcript:',
          transcript,
        );

        const answer =
          getConsentAnswer(
            transcript,
          );

        if (answer === 'yes') {
          console.log(
            'Voice consent: YES',
          );

          consentResolvedRef.current =
            true;

          await handleSaveSession();

          return;
        }

        if (answer === 'no') {
          console.log(
            'Voice consent: NO',
          );

          consentResolvedRef.current =
            true;

          await handleDiscardSession();

          return;
        }

        console.log(
          'Consent answer not understood:',
          transcript,
        );
      } catch (error) {
        console.error(
          'Consent transcription error:',
          error,
        );
      } finally {
        consentProcessingRef.current =
          false;
      }
    };

  // ==========================================================
  // Start one complete consent recording
  // ==========================================================

  const startConsentRecording =
    async () => {
      if (
        !showSaveConsent ||
        consentResolvedRef.current ||
        consentRecorderRef.current
      ) {
        return;
      }

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            },
          );

        consentRecordingStreamRef.current =
          stream;

        let mimeType =
          'audio/webm;codecs=opus';

        if (
          !MediaRecorder.isTypeSupported(
            mimeType,
          )
        ) {
          mimeType =
            'audio/webm';
        }

        if (
          !MediaRecorder.isTypeSupported(
            mimeType,
          )
        ) {
          mimeType = '';
        }

        const recorder =
          mimeType
            ? new MediaRecorder(
                stream,
                {
                  mimeType,
                },
              )
            : new MediaRecorder(
                stream,
              );

        consentRecorderRef.current =
          recorder;

        // Important:
        // Store every chunk from ONE complete
        // MediaRecorder session.
        consentChunksRef.current =
          [];

        recorder.ondataavailable =
          (event) => {
            if (
              event.data &&
              event.data.size > 0
            ) {
              consentChunksRef.current.push(
                event.data,
              );
            }
          };

        recorder.onerror =
          (event) => {
            console.error(
              'Consent recorder error:',
              event,
            );
          };

        recorder.onstop =
          async () => {
            const chunks =
              consentChunksRef.current;

            consentChunksRef.current =
              [];

            if (
              consentRecorderRef.current ===
              recorder
            ) {
              consentRecorderRef.current =
                null;
            }

            if (
              consentRecordingTimerRef.current
            ) {
              clearTimeout(
                consentRecordingTimerRef.current,
              );

              consentRecordingTimerRef.current =
                null;
            }

            if (
              consentResolvedRef.current ||
              !showSaveConsent
            ) {
              return;
            }

            if (
              chunks.length === 0
            ) {
              console.log(
                'No consent audio chunks recorded.',
              );

              await restartConsentRecording();

              return;
            }

            const blob =
              new Blob(
                chunks,
                {
                  type:
                    recorder.mimeType ||
                    'audio/webm',
                },
              );

            console.log(
              'Complete consent recording:',
              {
                chunks:
                  chunks.length,
                size:
                  blob.size,
                type:
                  blob.type,
              },
            );

            try {
              await processConsentBlob(
                blob,
              );
            } finally {
              if (
                !consentResolvedRef.current &&
                showSaveConsent
              ) {
                await restartConsentRecording();
              }
            }
          };

        recorder.start();

        setIsListeningForConsent(
          true,
        );

        setConsentStatus(
          'listening',
        );

        console.log(
          'Consent recording started.',
        );

        // Record a complete 2.5 second
        // standalone WebM segment.
        consentRecordingTimerRef.current =
          setTimeout(
            () => {
              if (
                recorder.state ===
                'recording'
              ) {
                recorder.stop();
              }
            },
            2500,
          );
      } catch (error) {
        console.error(
          'Unable to start consent microphone:',
          error,
        );

        setIsListeningForConsent(
          false,
        );

        setConsentStatus(
          'ready',
        );
      }
    };

  // ==========================================================
  // Restart recording after one segment
  // ==========================================================

  const restartConsentRecording =
  async () => {
    if (
      consentResolvedRef.current ||
      !showSaveConsent ||
      isSaving ||
      isDiscarding
    ) {
      return;
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1000,
        ),
    );

    if (
      consentResolvedRef.current ||
      !showSaveConsent
    ) {
      return;
    }

    await startConsentAudioLoop();
  };

  // ==========================================================
  // Play static consent MP3 repeatedly
  // ==========================================================

  const startConsentAudioLoop =
    async () => {
      const audio =
        consentAudioRef.current;

      if (!audio) {
        console.warn(
          'Consent audio element not found.',
        );

        return;
      }

      if (
        consentLoopCancelledRef.current ||
        consentResolvedRef.current ||
        !showSaveConsent
      ) {
        return;
      }

      try {
        // --------------------------------------------
        // PLAY QUESTION
        // --------------------------------------------

        setConsentStatus('playing');

        audio.currentTime = 0;

        await audio.play();

        await new Promise<void>(
          (resolve) => {
            const handleEnded = () => {
              audio.removeEventListener(
                'ended',
                handleEnded,
              );

              resolve();
            };

            audio.addEventListener(
              'ended',
              handleEnded,
              {
                once: true,
              },
            );
          },
        );

        if (
          consentLoopCancelledRef.current ||
          consentResolvedRef.current ||
          !showSaveConsent
        ) {
          return;
        }

        // --------------------------------------------
        // GAP AFTER QUESTION
        // --------------------------------------------

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              1000,
            ),
        );

        if (
          consentLoopCancelledRef.current ||
          consentResolvedRef.current ||
          !showSaveConsent
        ) {
          return;
        }

        // --------------------------------------------
        // NOW LISTEN
        // --------------------------------------------

        await startConsentRecording();
      } catch (error) {
        console.warn(
          'Consent audio playback failed:',
          error,
        );
      }
    };
    

  // ==========================================================
  // Consent initialization
  // ==========================================================

  useEffect(() => {
    if (!showSaveConsent) {
      return;
    }

    let cancelled = false;

    consentResolvedRef.current =
      false;

    consentLoopCancelledRef.current =
      false;

    const prepareConsent =
      async () => {
        // ----------------------------------------------------
        // 1. Mute LiveKit microphone.
        // ----------------------------------------------------

        await muteLiveKitMicrophone();

        if (cancelled) {
          return;
        }

        // ----------------------------------------------------
        // 2. Start small waveform.
        // ----------------------------------------------------

        await startConsentVisualizer();

        if (cancelled) {
          return;
        }

        // ----------------------------------------------------
        // 3. PLAY QUESTION FIRST.
        //
        // We deliberately DO NOT start the recorder yet.
        // This prevents the consent MP3 from being sent
        // to Deepgram.
        // ----------------------------------------------------

        await startConsentAudioLoop();
      };

    prepareConsent();

    return () => {
      cancelled = true;

      consentResolvedRef.current =
        true;

      consentLoopCancelledRef.current =
        true;

      const audio =
        consentAudioRef.current;

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      stopConsentRecording();
      stopConsentVisualizer();
    };

    // Intentionally only react to opening/closing consent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSaveConsent]);

  // ==========================================================
  // END CALL
  // ==========================================================

  const handleEndCall =
    () => {
      if (
        !session.isConnected ||
        showSaveConsent
      ) {
        return;
      }

      setShowSaveConsent(
        true,
      );
    };

  // ==========================================================
  // Find LiveKit agent participant
  // ==========================================================

  const getAgentIdentity =
    (): string | undefined => {
      const room =
        session.room;

      if (!room) {
        return undefined;
      }

      for (
        const participant of
          room.remoteParticipants.values()
      ) {
        if (
          participant.identity
        ) {
          return participant.identity;
        }
      }

      return undefined;
    };

  // ==========================================================
  // YES — SAVE SESSION
  // ==========================================================

  const handleSaveSession =
    async () => {
      if (
        isSaving ||
        isDiscarding
      ) {
        return;
      }

      consentResolvedRef.current =
        true;

      consentLoopCancelledRef.current =
        true;

      stopConsentRecording();

      setIsSaving(true);

      setConsentStatus(
        'saving',
      );

      const audio =
        consentAudioRef.current;

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      try {
        const agentIdentity =
          getAgentIdentity();

        if (!agentIdentity) {
          throw new Error(
            'Agent participant not found.',
          );
        }

        const endTime =
          new Date().toISOString();

        const response =
          await session.room.localParticipant.performRpc(
            {
              destinationIdentity:
                agentIdentity,

              method:
                'save_memory',

              payload:
                JSON.stringify({
                  end_time:
                    endTime,
                }),

              responseTimeout:
                10000,
            },
          );

        console.log(
          'Save response:',
          response,
        );

        if (
          response !== 'saved'
        ) {
          throw new Error(
            'Session was not saved.',
          );
        }

        stopConsentVisualizer();

        await session.end();
      } catch (error) {
        console.error(
          'Unable to save session:',
          error,
        );

        consentResolvedRef.current =
          false;

        consentLoopCancelledRef.current =
          false;

        setIsSaving(false);

        setConsentStatus(
          'ready',
        );

        await restoreLiveKitMicrophone();

        alert(
          'Unable to save this session. Please try again.',
        );
      }
    };

  // ==========================================================
  // NO — DISCARD SESSION
  // ==========================================================

  const handleDiscardSession =
    async () => {
      if (
        isSaving ||
        isDiscarding
      ) {
        return;
      }

      consentResolvedRef.current =
        true;

      consentLoopCancelledRef.current =
        true;

      stopConsentRecording();

      setIsDiscarding(true);

      setConsentStatus(
        'discarding',
      );

      const audio =
        consentAudioRef.current;

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      try {
        const agentIdentity =
          getAgentIdentity();

        if (!agentIdentity) {
          throw new Error(
            'Agent participant not found.',
          );
        }

        const response =
          await session.room.localParticipant.performRpc(
            {
              destinationIdentity:
                agentIdentity,

              method:
                'discard_memory',

              payload:
                JSON.stringify({}),

              responseTimeout:
                10000,
            },
          );

        console.log(
          'Discard response:',
          response,
        );

        if (
          response !== 'discarded'
        ) {
          throw new Error(
            'Session was not discarded.',
          );
        }

        stopConsentVisualizer();

        await session.end();
      } catch (error) {
        console.error(
          'Unable to discard session:',
          error,
        );

        consentResolvedRef.current =
          false;

        consentLoopCancelledRef.current =
          false;

        setIsDiscarding(false);

        setConsentStatus(
          'ready',
        );

        await restoreLiveKitMicrophone();

        alert(
          'Unable to finish the session. Please try again.',
        );
      }
    };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <section
      ref={ref}
      className={cn(
        'relative z-10 h-full w-full overflow-hidden bg-slate-100',
        className,
      )}
      {...props}
    >
      {/* =====================================================
          MAIN TWO-PANEL AREA
         ===================================================== */}

      <div className="absolute inset-x-0 top-0 bottom-[100px] z-10 flex flex-col md:bottom-[115px] md:flex-row">

        {/* ===================================================
            LEFT — ROBOT + CONVERSATION
           =================================================== */}

        <div className="relative min-h-0 flex-1 overflow-hidden border-b border-slate-200 bg-slate-50 md:border-b-0 md:border-r">

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

          <div className="relative z-20 px-5 pb-2 pt-5 md:px-8 md:pt-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-4 py-2 shadow-sm backdrop-blur-md">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal-600" />

              <span className="text-sm font-bold text-slate-800">
                {t.conversation}
              </span>
            </div>
          </div>

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

        {/* ===================================================
            RIGHT — AUDIO VISUALIZER
           =================================================== */}

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

      {/* =====================================================
          CONSENT OVERLAY
         ===================================================== */}

      <AnimatePresence>
        {showSaveConsent && (
          <motion.div
            key="save-consent"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-md md:px-6"
          >
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.96,
                y: 15,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              className="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 text-center shadow-2xl md:p-7"
            >
              {/* Header */}

              <div className="flex items-center justify-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-100 text-xl">
                  🔒
                </div>

                <div className="text-left">
                  <h2 className="text-lg font-bold text-slate-900">
                    Save this session?
                  </h2>

                  <p className="text-xs text-slate-500">
                    Your health conversation
                  </p>
                </div>
              </div>

              {/* Small Audio Graph */}

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Arogya
                  </span>

                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-teal-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" />

                    {consentStatus ===
                    'playing'
                      ? 'Speaking'
                      : consentStatus ===
                          'listening'
                        ? 'Listening'
                        : consentStatus ===
                            'saving'
                          ? 'Saving'
                          : consentStatus ===
                              'discarding'
                            ? 'Finishing'
                            : 'Ready'}
                  </span>
                </div>

                <canvas
                  ref={canvasRef}
                  width={420}
                  height={55}
                  aria-label="Live microphone audio waveform"
                  className="h-12 w-full"
                />
              </div>

              {/* Consent message */}

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Your conversation can be saved so
                Arogya can remember it during your
                next call.
              </p>

              {/* Static Consent Audio */}

              <audio
                ref={consentAudioRef}
                src="/audio/consent.mp3"
                preload="auto"
              />

              {/* Status */}

              <div className="mt-4">
                {consentStatus ===
                'playing' ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />

                    Playing consent message...
                  </div>
                ) : consentStatus ===
                  'listening' ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" />

                    Listening for Yes or No
                  </div>
                ) : consentStatus ===
                  'saving' ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" />

                    Saving session...
                  </div>
                ) : consentStatus ===
                  'discarding' ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />

                    Finishing session...
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                    Say Yes or No, or use a button
                  </div>
                )}
              </div>

              {/* Buttons */}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={
                    isSaving ||
                    isDiscarding
                  }
                  onClick={
                    handleDiscardSession
                  }
                  className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDiscarding
                    ? 'Discarding...'
                    : 'No'}
                </button>

                <button
                  type="button"
                  disabled={
                    isSaving ||
                    isDiscarding
                  }
                  onClick={
                    handleSaveSession
                  }
                  className="flex-1 rounded-full bg-teal-700 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? 'Saving...'
                    : 'Yes, save'}
                </button>
              </div>

              {/* Voice hint */}

              <p className="mt-3 text-[11px] text-slate-400">
                Say Yes or No at any time, even while the message is playing.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =====================================================
          BOTTOM CONTROLS
         ===================================================== */}

      {!showSaveConsent && (
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
                isConnected={
                  session.isConnected
                }
                onDisconnect={
                  handleEndCall
                }
                onIsChatOpenChange={
                  setChatOpen
                }
              />
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}