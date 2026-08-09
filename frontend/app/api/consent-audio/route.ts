import { NextResponse } from 'next/server';

const MURF_API_KEY =
  process.env.MURF_API_KEY;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!MURF_API_KEY) {
      return NextResponse.json(
        {
          error:
            'MURF_API_KEY is not configured.',
        },
        {
          status: 500,
        }
      );
    }

    const response = await fetch(
      'https://api.murf.ai/v1/speech/generate',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'api-key':
            MURF_API_KEY,
        },

        body: JSON.stringify({
          text:
            'Would you like to save this session?',

          /*
           * Use a male voice.
           *
           * We are keeping the voice configurable
           * through the environment variable.
           */
          voiceId:
            process.env.MURF_CONSENT_VOICE ||
            'Samar',

          locale: 'en-IN',

          format: 'MP3',

          modelVersion: 'GEN2',

          sampleRate: 44100,

          channelType: 'MONO',

          encodeAsBase64: true,

          style: 'Conversation',
        }),
      }
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        'Murf API error:',
        errorText
      );

      return NextResponse.json(
        {
          error:
            'Murf audio generation failed.',
        },
        {
          status: response.status,
        }
      );
    }

    const data =
      await response.json();

    if (!data.encodedAudio) {
      console.error(
        'Murf response did not contain encodedAudio:',
        data
      );

      return NextResponse.json(
        {
          error:
            'Murf did not return audio.',
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      audio:
        data.encodedAudio,

      mimeType:
        'audio/mpeg',
    });

  } catch (error) {
    console.error(
      'Consent audio error:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Unable to generate consent audio.',
      },
      {
        status: 500,
      }
    );
  }
}