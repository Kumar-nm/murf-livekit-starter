import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const apiKey =
      process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
      console.error(
        'DEEPGRAM_API_KEY is missing.',
      );

      return NextResponse.json(
        {
          error:
            'DEEPGRAM_API_KEY is not configured.',
        },
        { status: 500 },
      );
    }

    const audio =
      await request.arrayBuffer();

    if (!audio.byteLength) {
      return NextResponse.json(
        {
          error:
            'No audio received.',
        },
        { status: 400 },
      );
    }

    const response =
      await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Token ${apiKey}`,

            'Content-Type':
              'audio/webm',
          },

          body: audio,
        },
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        'Deepgram consent error:',
        errorText,
      );

      return NextResponse.json(
        {
          error:
            'Deepgram transcription failed.',
          details: errorText,
        },
        {
          status: response.status,
        },
      );
    }

    const data =
      await response.json();

    const transcript =
      data?.results
        ?.channels?.[0]
        ?.alternatives?.[0]
        ?.transcript || '';

    console.log(
      'Deepgram consent transcript:',
      transcript,
    );

    return NextResponse.json({
      transcript,
    });
  } catch (error) {
    console.error(
      'Consent transcription route error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Unable to transcribe consent audio.',
      },
      { status: 500 },
    );
  }
}