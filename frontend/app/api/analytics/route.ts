import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.ESCALATION_API_URL ||
  'http://127.0.0.1:8765';

export async function GET(
  request: Request
) {
  try {

    const url =
      new URL(request.url);

    const query =
      url.searchParams.toString();

    const response =
      await fetch(
        `${BACKEND_URL}/api/analytics${
          query
            ? `?${query}`
            : ''
        }`,
        {
          cache:
            'no-store',
        }
      );

    const data =
      await response.json();

    return NextResponse.json(
      data,
      {
        status:
          response.status,
      }
    );

  } catch (error) {

    console.error(
      'Analytics API error:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Analytics backend is unavailable.',
      },
      {
        status: 503,
      }
    );
  }
}