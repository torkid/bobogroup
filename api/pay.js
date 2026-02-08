// import { crypto } from "crypto"; // Not needed with custom generator

export const config = {
    runtime: 'edge',
};

const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
const GROUP_PRICE = 100; // TZS

// Generate Order ID (Standard UUID v4)
function generateOrderId() {
    return crypto.randomUUID();
}

export default async function handler(request) {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS for CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: corsHeaders,
        });
    }

    const url = new URL(request.url);

    // --- GET: Check Status ---
    if (request.method === 'GET') {
        const orderId = url.searchParams.get('order_id');

        if (!orderId) {
            return new Response(JSON.stringify({ error: 'Order ID required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        try {
            // Direct call to ZenoPay (Stateless)
            const response = await fetch(`https://zenoapi.com/api/payments/order-status?order_id=${orderId}`, {
                method: 'GET',
                headers: {
                    'x-api-key': API_KEY,
                },
            });

            const data = await response.json();

            // Normalize status for frontend
            let status = 'PENDING';
            // Robust check for payment status in various locations
            const rawStatus = data.payment_status ||
                (data.data && data.data.payment_status) ||
                (data.data && Array.isArray(data.data) && data.data[0] && data.data[0].payment_status);

            if (data.status === 'error') {
                if (data.message === 'Order not found' || (data.message && data.message.includes('not found'))) {
                    // ZenoPay takes a few seconds to propagate the order. Treat as PENDING.
                    status = 'PENDING';
                } else {
                    status = 'FAILED';
                }
            }

            if (rawStatus) {
                const s = rawStatus.toUpperCase();
                if (s === 'COMPLETED' || s === 'SUCCESS') status = 'COMPLETED';
                if (s === 'FAILED') status = 'FAILED';
            }

            return new Response(JSON.stringify({ ...data, status }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({
                error: 'Status check failed',
                details: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                },
            });
        }
    }

    // --- POST: Initiate Payment ---
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            let phone = body.phone;

            if (!phone) {
                return new Response(JSON.stringify({ message: "Phone number required" }), { status: 400, headers: corsHeaders });
            }

            // Format phone (Remove 0, add 255)
            if (phone.startsWith('0')) {
                phone = '255' + phone.substring(1);
            } else if (!phone.startsWith('255')) {
                phone = '255' + phone;
            }

            // Using custom Order ID generation to match reference implementation
            const orderId = generateOrderId();

            const payload = {
                order_id: orderId,
                buyer_name: "Mteja",
                buyer_email: "mteja@jandolaujanja.co.tz",
                buyer_phone: phone,
                amount: GROUP_PRICE
            };

            const response = await fetch('https://zenoapi.com/api/payments/mobile_money_tanzania', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            // Return standardized response to frontend
            return new Response(JSON.stringify({
                reference: orderId, // Usage in frontend
                status: 'Inasubiri',
                message_title: "Angalia Simu Yako!",
                message_body: "Weka PIN kwenye simu yako kuthibitisha malipo.",
                original_data: data
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                },
            });

        } catch (error) {
            return new Response(JSON.stringify({
                error: 'Payment initiation failed',
                details: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                },
            });
        }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}
