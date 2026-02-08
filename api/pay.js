export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    // Handle OPTIONS for CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    const url = new URL(request.url);

    // Handle status check (GET request)
    if (request.method === 'GET' && url.searchParams.get('order_id')) {
        const orderId = url.searchParams.get('order_id');
        const apiKey = url.searchParams.get('api_key');

        try {
            const response = await fetch(`https://zenoapi.com/api/payments/order-status?order_id=${orderId}`, {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                },
            });

            const data = await response.json();

            return new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch (error) {
            console.error('Status Check Error:', error);
            return new Response(JSON.stringify({
                error: 'Status check failed',
                details: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    }

    // Handle payment creation (POST request)
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await request.json();
        console.log('=== PAYMENT REQUEST ===');
        console.log('Body received:', JSON.stringify(body));

        // Forward the request to ZenoPay with correct format
        // NOTE: webhook_url must be undefined if not provided, sending '' causes 400 error
        const response = await fetch('https://zenoapi.com/api/payments/mobile_money_tanzania', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': body.api_key,
            },
            body: JSON.stringify({
                order_id: body.order_id,
                buyer_name: body.buyer_name,
                buyer_phone: body.buyer_phone,
                buyer_email: body.buyer_email,
                amount: body.amount,
                webhook_url: body.webhook_url || undefined,
            }),
        });

        const data = await response.json();
        console.log('ZenoPay Response:', JSON.stringify(data));
        console.log('Response status:', response.status);

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error) {
        console.error('ZenoPay Error:', error);
        return new Response(JSON.stringify({
            error: 'Tatizo la mawasiliano na ZenoPay.',
            details: error.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}
