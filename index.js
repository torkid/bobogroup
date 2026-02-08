// index.js
// Import necessary libraries
const express = require('express');
const axios = require('axios'); // Used to communicate with ZenoPay API
const path = require('path');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;
const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
const GROUP_PRICE = 100; // TZS - Testing price
const API_URL = "https://zenoapi.com/api/payments/mobile_money_tanzania";

// In-memory store for completed payments (for production, use a database)
const completedPayments = new Map();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

// Route to serve the main payment page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle the payment submission
app.post('/pay', async (req, res) => {
    const { phone } = req.body;

    // Basic validation for the phone number
    if (!phone || !(phone.startsWith('07') || phone.startsWith('06')) || phone.length !== 10) {
        return res.status(400).json({
            message_title: "Namba si sahihi",
            message_body: "Tafadhali rudi mwanzo uweke namba sahihi ya simu, mfano: 07xxxxxxxx.",
            status: "Error",
            reference: "N/A"
        });
    }

    const transaction_reference = `WPGRP-${Date.now()}`;

    // Payload for the ZenoPay API - INCLUDES WEBHOOK URL
    const payload = {
        "order_id": transaction_reference,
        "buyer_name": "Mteja Wa VIP",
        "buyer_email": "malipo@bobogroup.com",
        "buyer_phone": phone,
        "amount": GROUP_PRICE,
        // Webhook URL - Uses VERCEL_URL env var or falls back to your domain
        "webhook_url": process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}/webhook`
            : "https://bobogroup.vercel.app/webhook"
    };

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        console.log("=== INITIATING PAYMENT ===");
        console.log("Phone:", phone);
        console.log("Order ID:", transaction_reference);
        console.log("Payload:", JSON.stringify(payload));

        const response = await axios.post(API_URL, payload, { headers });
        console.log("ZenoPay Response:", JSON.stringify(response.data));

        if (response.data && response.data.status === 'success') {
            // Store the order as pending
            completedPayments.set(transaction_reference, { status: 'PENDING', phone });
            console.log("✅ Payment request sent successfully");

            res.json({
                message_title: "Angalia Simu Yako!",
                message_body: "Tumekutumia ombi la malipo. Tafadhali weka namba yako ya siri kuthibitisha.",
                status: "Inasubiri uthibitisho",
                reference: transaction_reference
            });
        } else {
            console.log("❌ Payment request failed:", response.data.message);
            res.status(400).json({
                message_title: "Ombi la Malipo Halikufanikiwa",
                message_body: response.data.message || "Hatukuweza kutuma ombi la malipo.",
                status: "Imeshindwa",
                reference: transaction_reference
            });
        }
    } catch (error) {
        console.error("❌ Payment Error:", error.response ? error.response.data : error.message);
        res.status(500).json({
            message_title: "Hitilafu ya Mfumo",
            message_body: "Samahani, kumetokea tatizo la kimfumo. Tafadhali jaribu tena baadae.",
            status: "Error",
            reference: transaction_reference
        });
    }
});

// WEBHOOK ENDPOINT - ZenoPay calls this when payment is complete
app.post('/webhook', (req, res) => {
    console.log("=== WEBHOOK RECEIVED ===");
    console.log("Headers:", JSON.stringify(req.headers));
    console.log("Body:", JSON.stringify(req.body));

    const { order_id, payment_status, reference, metadata } = req.body;

    if (order_id && payment_status === 'COMPLETED') {
        console.log("✅ Payment COMPLETED via webhook for order:", order_id);
        // Mark payment as complete in our store
        completedPayments.set(order_id, { status: 'COMPLETED', reference });
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true });
});

// Route to check transaction status
app.get('/check-status', async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return res.status(400).json({ status: 'ERROR', message: 'Order ID is required' });
    }

    console.log("=== CHECK STATUS ===");
    console.log("Order ID:", order_id);

    // First check our local store (webhook may have updated it)
    const localStatus = completedPayments.get(order_id);
    if (localStatus && localStatus.status === 'COMPLETED') {
        console.log("✅ Found COMPLETED in local store");
        return res.json({ status: 'COMPLETED' });
    }

    // If not in local store, check with ZenoPay API
    const statusUrl = `https://zenoapi.com/api/payments/order-status?order_id=${order_id}`;
    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        const response = await axios.get(statusUrl, { headers });
        console.log("ZenoPay Response:", JSON.stringify(response.data, null, 2));

        let status = 'PENDING';

        if (response.data && response.data.data && response.data.data.length > 0) {
            const paymentData = response.data.data[0];
            const paymentStatus = paymentData.payment_status;

            console.log("Payment Status from API:", paymentStatus);

            if (paymentStatus === 'COMPLETED') {
                status = 'COMPLETED';
                // Update local store
                completedPayments.set(order_id, { status: 'COMPLETED' });
                console.log("✅ PAYMENT COMPLETED");
            } else if (paymentStatus === 'FAILED') {
                status = 'FAILED';
                completedPayments.set(order_id, { status: 'FAILED' });
                console.log("❌ PAYMENT FAILED");
            } else {
                console.log("⏳ Still pending...");
            }
        } else {
            console.log("⚠️ No data in response, checking if result indicates order exists");
            // Some APIs return differently - handle edge cases
            if (response.data && response.data.result === 'SUCCESS') {
                // Order exists but might not have payment data yet
                console.log("Order found but no payment data yet");
            }
        }

        console.log("Returning status:", status);
        res.json({ status });

    } catch (error) {
        console.error("Error checking status:", error.response ? error.response.data : error.message);

        // Check local store as fallback
        const fallback = completedPayments.get(order_id);
        if (fallback && fallback.status === 'COMPLETED') {
            return res.json({ status: 'COMPLETED' });
        }

        res.json({ status: 'PENDING' });
    }
});

// Debug endpoint to see all stored payments (remove in production)
app.get('/debug-payments', (req, res) => {
    const payments = {};
    completedPayments.forEach((value, key) => {
        payments[key] = value;
    });
    res.json(payments);
});

// Start the server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📡 Webhook URL: https://your-domain.vercel.app/webhook`);
});
