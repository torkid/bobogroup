const https = require('https');
const crypto = require('crypto');

const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
const GROUP_PRICE = 100;

function generateOrderId() {
    return crypto.randomUUID();
}

const orderId = generateOrderId();
const phone = "255712345678"; // valid format

const payload = JSON.stringify({
    order_id: orderId,
    buyer_name: "Test User",
    buyer_email: "test@example.com",
    buyer_phone: phone,
    amount: GROUP_PRICE
});

const options = {
    hostname: 'zenoapi.com',
    path: '/api/payments/mobile_money_tanzania',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Content-Length': payload.length
    }
};

console.log(`Sending Payment Request:`);
console.log(`Order ID: ${orderId}`);

const req = https.request(options, (res) => {
    console.log(`\nCreation Status Code: ${res.statusCode}`);
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Creation Body:', data);

        // IMMEDIATE STATUS CHECK
        console.log(`\n--- Immediate Status Check ---`);
        const statusOptions = {
            hostname: 'zenoapi.com',
            path: `/api/payments/order-status?order_id=${orderId}`,
            method: 'GET',
            headers: { 'x-api-key': API_KEY }
        };

        const statusReq = https.request(statusOptions, (statusRes) => {
            let statusData = '';
            statusRes.on('data', c => statusData += c);
            statusRes.on('end', () => {
                console.log(`Status Check Code: ${statusRes.statusCode}`);
                console.log(`Status Body: ${statusData}`);
            });
        });
        statusReq.end();
    });
});

req.on('error', (error) => console.error(error));
req.write(payload);
req.end();
