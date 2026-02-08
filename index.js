// index.js - ZenoPay Payment Integration
const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;
const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
const GROUP_PRICE = 1000; // TZS - Testing price
const API_URL = "https://zenoapi.com/api/payments/mobile_money_tanzania";

// In-memory store for tracking payments
const paymentStore = new Map();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Generate Order ID (Standard UUID v4)
function generateOrderId() {
    return crypto.randomUUID();
}

// --- Routes ---

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initiate payment
app.post('/pay', async (req, res) => {
    const { phone, order_id } = req.body;

    // Validate phone
    if (!phone || !(phone.startsWith('07') || phone.startsWith('06') || phone.startsWith('255')) || phone.length < 10) {
        return res.status(400).json({
            message_title: "Namba si sahihi",
            message_body: "Tafadhali weka namba sahihi ya simu.",
            status: "Error",
            reference: "N/A"
        });
    }

    // Use provided order_id or generate new one
    const orderId = order_id || generateOrderId();

    // Format phone number to 255... (required by ZenoPay)
    let formattedPhone = phone;
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '255' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('255')) {
        formattedPhone = '255' + formattedPhone;
    }

    // Webhook URL validation
    const webhookUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/webhook`
        : "https://bobogroup.vercel.app/webhook";

    const payload = {
        order_id: orderId,
        buyer_name: "Mteja",
        buyer_email: "mteja@bobogroup.co.tz",
        buyer_phone: formattedPhone,
        amount: GROUP_PRICE,
        webhook_url: webhookUrl
    };

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        console.log("=== INITIATING PAYMENT ===");
        console.log("Order ID:", orderId);
        console.log("Phone:", formattedPhone);

        const response = await axios.post(API_URL, payload, { headers });
        console.log("ZenoPay Response:", JSON.stringify(response.data, null, 2));

        const data = response.data;

        // Store order with PENDING status immediately
        paymentStore.set(orderId, {
            status: 'PENDING',
            phone: formattedPhone,
            createdAt: Date.now()
        });

        // Return success to frontend
        res.json({
            status: 'success',
            order_id: orderId,
            message: 'Payment initiated'
        });

    } catch (error) {
        console.error("❌ Payment Error:", error.response?.data || error.message);
        // Fallback: still return success to let frontend poll, 
        // sometimes API fails but specific network succeeds? 
        // No, if API fails, we should tell frontend.
        res.status(500).json({
            status: 'error',
            message: "Imeshindwa kuanzisha malipo. Jaribu tena."
        });
    }
});

// Webhook from ZenoPay - called when payment completes
app.post('/webhook', (req, res) => {
    console.log("=== WEBHOOK RECEIVED ===");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const { order_id, payment_status } = req.body;

    if (order_id && payment_status) {
        const status = payment_status.toUpperCase();
        if (status === 'COMPLETED' || status === 'SUCCESS') {
            console.log("✅ WEBHOOK: Payment COMPLETED for:", order_id);
            paymentStore.set(order_id, { status: 'COMPLETED', completedAt: Date.now() });
        }
    }

    res.status(200).json({ received: true });
});

// Check payment status (Unified endpoint)
app.get('/pay', async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return res.status(400).json({ status: 'ERROR', message: 'Order ID required' });
    }

    console.log(`Checking status for: ${order_id}`);

    // 1. Check local store first
    const localData = paymentStore.get(order_id);
    if (localData) {
        if (localData.status === 'COMPLETED') {
            console.log("✅ Found COMPLETED in local store!");
            return res.json({ status: 'COMPLETED' });
        }
        if (localData.status === 'FAILED') {
            return res.json({ status: 'FAILED' });
        }
    }

    // 2. Check ZenoPay API if local is not final
    try {
        const statusUrl = `https://zenoapi.com/api/payments/order-status?order_id=${orderId}`; // Note: API expects order_idparam
        // Actually, let's correct the URL construction
        const checkUrl = `https://zenoapi.com/api/payments/order-status?order_id=${encodeURIComponent(order_id)}`;

        const response = await axios.get(checkUrl, {
            headers: { "x-api-key": API_KEY }
        });

        const zenoData = response.data;
        const rawStatus = zenoData.payment_status ||
            (zenoData.data && zenoData.data.payment_status) ||
            (zenoData.data && Array.isArray(zenoData.data) && zenoData.data[0] && zenoData.data[0].payment_status);

        const paymentStatus = rawStatus ? rawStatus.toUpperCase() : '';

        if (paymentStatus === 'COMPLETED' || paymentStatus === 'SUCCESS') {
            paymentStore.set(order_id, { status: 'COMPLETED', completedAt: Date.now() });
            return res.json({ status: 'COMPLETED' });
        }

        if (paymentStatus === 'FAILED') {
            paymentStore.set(order_id, { status: 'FAILED' });
            return res.json({ status: 'FAILED' });
        }

        // If 'Order not found' but we just created it, it's PENDING
        if (zenoData.status === 'error' && zenoData.message === 'Order not found') {
            return res.json({ status: 'PENDING' });
        }

        return res.json({ status: 'PENDING' });

    } catch (error) {
        console.error("Status check error:", error.message);
        // If local data exists (meaning we created it), return PENDING on error
        if (localData) return res.json({ status: 'PENDING' });

        return res.json({ status: 'PENDING' }); // Default to pending to keep polling
    }
});

// Debug endpoint
app.get('/debug', (req, res) => {
    const data = {};
    paymentStore.forEach((v, k) => { data[k] = v; });
    res.json({ orders: data, count: paymentStore.size });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
