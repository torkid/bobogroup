const https = require('https');

const API_KEY = "sv5YWe1oG-UtuxHtlTaC5ilIai9CWQufO3uwtoZtqpwwmZUWncric2JICY9diemFiue1XRNaiPnDgQtjxTqEFg";
// The ID provided by the user
const orderId = "fe7dda5f-9dc6-4c7f-a96d-8131dfbdd615";

console.log(`Checking status for specific Order ID: ${orderId}`);

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
