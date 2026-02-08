// index.js - ZenoPay Payment Integration
const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;
const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
const GROUP_PRICE = 100; // TZS - Testing price
const API_URL = "https://zenoapi.com/api/payments/mobile_money_tanzania";

// In-memory store for tracking payments
const paymentStore = new Map();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Generate UUID v4 (ZenoPay requires UUID format)
function generateUUID() {
    return crypto.randomUUID();
}

// --- Routes ---

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initiate payment
app.post('/pay', async (req, res) => {
    const { phone } = req.body;

    // Validate phone
    if (!phone || !(phone.startsWith('07') || phone.startsWith('06')) || phone.length !== 10) {
        return res.status(400).json({
            message_title: "Namba si sahihi",
            message_body: "Tafadhali weka namba sahihi ya simu, mfano: 07xxxxxxxx.",
            status: "Error",
            reference: "N/A"
        });
    }

    // Generate UUID for order_id (ZenoPay requires this format)
    const orderId = generateUUID();

    // Get webhook URL
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://bobogroup.vercel.app";

    const payload = {
        order_id: orderId,
        buyer_name: "VIP Member",
        buyer_email: "member@vip.com",
        buyer_phone: phone,
        amount: GROUP_PRICE,
        webhook_url: `${baseUrl}/webhook`
    };

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        console.log("=== INITIATING PAYMENT ===");
        console.log("Order ID (UUID):", orderId);
        console.log("Phone:", phone);
        console.log("Amount:", GROUP_PRICE);

        const response = await axios.post(API_URL, payload, { headers });
        console.log("ZenoPay Response:", JSON.stringify(response.data, null, 2));

        if (response.data && response.data.status === 'success') {
            // Store order with PENDING status
            paymentStore.set(orderId, {
                status: 'PENDING',
                phone,
                createdAt: Date.now()
            });

            console.log("✅ Payment request created successfully");
            console.log("Stored order:", orderId);

            res.json({
                message_title: "Angalia Simu Yako!",
                message_body: "Weka PIN kwenye simu yako kuthibitisha malipo.",
                status: "Inasubiri",
                reference: orderId
            });
        } else {
            console.log("❌ Payment request failed:", response.data);
            res.status(400).json({
                message_title: "Ombi Halikufanikiwa",
                message_body: response.data.message || "Jaribu tena.",
                status: "Imeshindwa",
                reference: orderId
            });
        }
    } catch (error) {
        console.error("❌ Payment Error:", error.response?.data || error.message);
        res.status(500).json({
            message_title: "Tatizo la Mfumo",
            message_body: "Jaribu tena baadae.",
            status: "Error",
            reference: orderId
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

// Check payment status
app.get('/check-status', async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return res.status(400).json({ status: 'ERROR', message: 'Order ID required' });
    }

    console.log("=== CHECK STATUS ===");
    console.log("Order ID:", order_id);

    // 1. First check local store (webhook updates this instantly)
    const localData = paymentStore.get(order_id);
    if (localData) {
        console.log("Local store data:", localData);
        if (localData.status === 'COMPLETED') {
            console.log("✅ Found COMPLETED in local store!");
            return res.json({ status: 'COMPLETED' });
        }
        if (localData.status === 'FAILED') {
            return res.json({ status: 'FAILED' });
        }
    }

    // 2. Check ZenoPay API
    const statusUrl = `https://zenoapi.com/api/payments/order-status?order_id=${encodeURIComponent(order_id)}`;

    try {
        const response = await axios.get(statusUrl, {
            headers: { "x-api-key": API_KEY }
        });

        console.log("ZenoPay Status Response:", JSON.stringify(response.data, null, 2));

        // Parse response
        // Reference implementation checks both top-level and nested data
        const zenoData = response.data;
        const rawStatus = zenoData.payment_status ||
            (zenoData.data && zenoData.data[0] && zenoData.data[0].payment_status);

        console.log("Payment status from API:", rawStatus);

        const paymentStatus = rawStatus ? rawStatus.toUpperCase() : '';

        if (paymentStatus === 'COMPLETED' || paymentStatus === 'SUCCESS') {
            paymentStore.set(order_id, { status: 'COMPLETED' });
            console.log("✅ PAYMENT COMPLETED!");
            return res.json({ status: 'COMPLETED' });
        }

        if (paymentStatus === 'FAILED') {
            paymentStore.set(order_id, { status: 'FAILED' });
            return res.json({ status: 'FAILED' });
        }

        // Still pending
        console.log("⏳ Payment still pending...");
        return res.json({ status: 'PENDING' });

    } catch (error) {
        const errorData = error.response?.data;
        console.log("Status check error:", errorData || error.message);

        // If order not found, it might not be registered yet - keep polling
        if (errorData?.message?.includes('No order found')) {
            console.log("Order not found yet in ZenoPay - still processing");
            return res.json({ status: 'PENDING' });
        }

        // Check local store as fallback
        if (localData?.status === 'COMPLETED') {
            return res.json({ status: 'COMPLETED' });
        }

        return res.json({ status: 'PENDING' });
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
