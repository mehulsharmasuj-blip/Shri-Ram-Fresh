# Shri Ram Fresh — Final Production-Ready Starter

This package contains a real server-backed application, not a browser-only demo.

Included:
- Customer registration/login
- Owner login
- SQLite database
- Shared products and prices
- Shared daily offer
- Customer basket
- Pickup-time selection
- Online/UPI or cash-at-pickup payment method
- Order numbers
- Customer order status
- Owner order queue
- Owner can mark Preparing / Ready / Completed
- Owner can mark payment Paid
- Owner can add products
- Installable PWA
- Light-blue customer UI
- Product benefits
- Automatic totals and round-off

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and change JWT_SECRET, OWNER_EMAIL and OWNER_PASSWORD.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Important before public launch
- Put the app behind HTTPS.
- Set a strong JWT_SECRET and strong owner password.
- Configure backups for the SQLite database or move to a managed production database.
- Add a real payment gateway/UPI verification before treating online orders as prepaid.
- Configure SMS/WhatsApp/push notifications if desired.
- Review privacy, refund, tax and business requirements for the shop.

The current online/UPI option records the customer's choice but does NOT claim payment is verified. The owner must mark payment Paid. This avoids falsely treating an unpaid order as prepaid.


## Payment mode
This version is configured for **Pay at Store only**.
Customers do not pay inside the app. They place the order, receive an order number,
and pay at the shop when they collect it. The owner can use **Mark Paid** after
receiving payment at the counter.

## Public deployment
This package is ready to deploy to a Node.js hosting service. Before going public,
set a strong `JWT_SECRET`, a strong owner password, and use HTTPS. For a real
multi-device production deployment, use persistent storage/backups appropriate
for your hosting provider.
