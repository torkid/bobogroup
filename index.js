// index.js
// Import necessary libraries
const express = require('express');
const axios = require('axios'); // Used to communicate with ZenoPay API
const path = require('path');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000; // Vercel will set the port automatically
const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";

// BEI IMEBADILISHWA KUWA 1000 KULINGANA NA PAGE MPYA
const GROUP_PRICE = 1000; // The price for your WhatsApp group in TZS
const API_URL = "https://zenoapi.com/api/payments/mobile_money_tanzania";

// --- Middleware ---
// This allows our server to understand JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// --- HTML Template ---
// We'll serve a static HTML file for the frontend
const paymentPagePath = path.join(__dirname, 'public', 'index.html');

// --- Web Routes ---

// Route to serve the main payment page
app.get('/', (req, res) => {
    res.sendFile(paymentPagePath);
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

    // Payload for the ZenoPay API
    const payload = {
        "order_id": transaction_reference,
        "buyer_name": "Mteja Wa Penzi",
        "buyer_email": "malipo@penzishata.com",
        "buyer_phone": phone,
        "amount": GROUP_PRICE
    };

    // Headers for authentication
    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        // Send the request to ZenoPay
        const response = await axios.post(API_URL, payload, { headers });

        console.log("ZenoPay API Response:", response.data);

        // Check the response from ZenoPay
        if (response.data && response.data.status === 'success') {
            res.json({
                message_title: "Angalia Simu Yako!",
                message_body: "Tumekutumia ombi la malipo. Tafadhali weka namba yako ya siri kuthibitisha.",
                status: "Inasubiri uthibitisho",
                reference: transaction_reference
            });
        } else {
            res.status(400).json({
                message_title: "Ombi la Malipo Halikufanikiwa",
                message_body: response.data.message || "Hatukuweza kutuma ombi la malipo.",
                status: "Imeshindwa",
                reference: transaction_reference
            });
        }
    } catch (error) {
        console.error("An error occurred:", error.response ? error.response.data : error.message);
        res.status(500).json({
            message_title: "Hitilafu ya Mfumo",
            message_body: "Samahani, kumetokea tatizo la kimfumo. Tafadhali jaribu tena baadae.",
            status: "Error",
            reference: transaction_reference
        });
    }
});

// Route to check transaction status
app.get('/check-status', async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return res.status(400).json({ status: 'ERROR', message: 'Order ID is required' });
    }

    const statusUrl = `https://zenoapi.com/api/payments/order-status?order_id=${order_id}`;

    // Headers for authentication
    const headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    };

    try {
        const response = await axios.get(statusUrl, { headers });
        console.log("ZenoPay Status Response:", JSON.stringify(response.data));

        // Parse the response to find the status
        // Structure based on user request: data[0].payment_status
        let status = 'PENDING';

        if (response.data && response.data.data && response.data.data.length > 0) {
            const paymentStatus = response.data.data[0].payment_status;
            if (paymentStatus === 'COMPLETED') {
                status = 'COMPLETED';
            } else if (paymentStatus === 'FAILED') {
                status = 'FAILED';
            }
        }

        res.json({ status });

    } catch (error) {
        console.error("Error checking status:", error.response ? error.response.data : error.message);
        // Don't fail the polling on network error, just return pending or error so client keeps trying or handles it
        res.json({ status: 'PENDING' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


