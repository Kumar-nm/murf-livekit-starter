import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.ESCALATION_API_URL ||
  'http://127.0.0.1:8765';

export async function GET() {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/tickets`,
      {
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            'Unable to retrieve escalation tickets.',
        },
        {
          status: response.status,
        }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      'Escalation API error:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Human-support backend is unavailable.',
      },
      {
        status: 503,
      }
    );
  }
}