import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.ESCALATION_API_URL ||
  'http://127.0.0.1:8765';

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const response = await fetch(
      `${BACKEND_URL}/api/tickets/status`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return NextResponse.json(
      data,
      {
        status: response.status,
      }
    );
  } catch (error) {
    console.error(
      'Escalation status API error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Human-support backend is unavailable.',
      },
      {
        status: 503,
      }
    );
  }
}