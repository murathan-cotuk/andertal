import { NextResponse } from 'next/server';

/**
 * GraphQL Proxy Route
 * Forwards GraphQL requests to Payload CMS
 * Workaround for Payload CMS v3.68.3 route registration bug
 */

const PAYLOAD_URL = process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL || 'http://localhost:3001/api/graphql';

export async function POST(request) {
  try {
    // Get request body
    const body = await request.json();

    console.log('[GraphQL Proxy] Forwarding request to:', PAYLOAD_URL);
    console.log('[GraphQL Proxy] Query:', body.query?.substring(0, 100));

    // Forward to Payload CMS
    const response = await fetch(PAYLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward auth headers if present
        ...(request.headers.get('authorization') && {
          'authorization': request.headers.get('authorization')
        }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Return response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[GraphQL Proxy] Error:', error);
    return NextResponse.json(
      { errors: [{ message: 'GraphQL proxy error', details: error.message }] },
      { status: 500 }
    );
  }
}

// Support GET for introspection queries
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json(
      { errors: [{ message: 'Query parameter required' }] },
      { status: 400 }
    );
  }

  return POST(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ query }),
  }));
}

