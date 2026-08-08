'use client';

import { Button } from '@/components/ui/button';
import {
  translations,
  type Language,
} from '@/components/app/language';

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
  language?: Language;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  language = 'en',
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  const t = translations[language];

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">

      {/* Room background */}
      <div className="absolute inset-0">
        <img
          src="/assets/scene/room-background.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Slight readability overlay */}
        <div className="absolute inset-0 bg-white/10" />
      </div>

      {/* Main homepage content */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 py-10">

        {/* Brand */}
        <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-white/50 bg-white/40 px-4 py-2 shadow-sm backdrop-blur-md">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white">
            +
          </span>

          <span className="text-sm font-semibold tracking-wide text-slate-800">
            {t.brand}
          </span>
        </div>

        {/* Robot */}
        <div className="relative flex w-full max-w-2xl flex-1 items-center justify-center">

          <img
            src="/assets/scene/robot.png"
            alt="Arogya Health Access assistant"
            className="absolute bottom-[-2%] left-1/2 h-[72%] w-auto -translate-x-1/2 object-contain drop-shadow-2xl"
          />

          {/* Text overlay */}
          <div className="relative z-10 mb-[20%] flex w-full max-w-2xl flex-col items-center text-center">

            <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-white drop-shadow-[0_2px_0_#0f766e] [text-shadow:0_2px_5px_rgba(0,0,0,0.85)] md:text-base">
              {t.healthcareVoiceAssistant}
            </p>

            <h1 className="text-4xl font-bold tracking-tight text-slate-900 drop-shadow-md md:text-6xl">
              {t.welcome}

              <span className="block text-teal-300 drop-shadow-[0_3px_0_#0f766e] [text-shadow:0_3px_6px_rgba(0,0,0,0.8)]">
                {t.brand}
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-white drop-shadow-[0_2px_0_rgba(15,118,110,0.9)] [text-shadow:0_2px_5px_rgba(0,0,0,0.75)] md:text-base">
              {t.description}
            </p>

            {/* Transparent start button */}
            <Button
              size="lg"
              onClick={onStartCall}
              className="mt-50 h-12 rounded-full border border-white/70 bg-white/35 px-8 text-sm font-bold tracking-wide text-slate-800 shadow-lg backdrop-blur-md transition-all hover:bg-white/55 hover:shadow-xl"
            >
              {startButtonText}
            </Button>

            <p className="mt-3 text-xs font-semibold text-white drop-shadow-[0_2px_0_rgba(15,118,110,0.8)] [text-shadow:0_2px_4px_rgba(0,0,0,0.7)]">
              {t.privateConversation}
            </p>
          </div>
        </div>

        {/* Small transparent feature labels */}
        <div className="absolute bottom-7 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-center gap-8">

          <div className="text-center">
            <div className="text-lg">🎙️</div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
              {t.voiceFirst}
            </p>
          </div>

          <div className="text-center">
            <div className="text-lg">🩺</div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
              {t.healthGuidance}
            </p>
          </div>

          <div className="text-center">
            <div className="text-lg">🌐</div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
              {t.accessible}
            </p>
          </div>

        </div>

        {/* Powered by */}
        <div className="absolute bottom-3 right-5">
          <p className="text-[10px] font-medium text-slate-600/80">
            {t.poweredBy}
          </p>
        </div>

      </div>
    </div>
  );
};