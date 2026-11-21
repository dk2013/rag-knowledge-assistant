# RouteWise Product FAQ

RouteWise is Brightline Logistics' fleet routing and dispatch platform (fictional product for this demo). It plans delivery routes, tracks vehicles in real time and sends live ETAs to customers.

## Pricing and Plans

### Plans
- **Starter**: 49 USD per vehicle per month, up to 10 vehicles, route optimization and driver mobile app.
- **Growth**: 79 USD per vehicle per month, up to 100 vehicles, adds live customer ETA notifications, proof of delivery photos and the public API.
- **Enterprise**: custom pricing for more than 100 vehicles, adds SSO (SAML / OpenID Connect), a dedicated success manager and a 99.95% uptime SLA.

Annual billing gives a 15% discount on Starter and Growth. Non-profit organizations get an additional 20% off.

### Free Trial
Every plan starts with a 14-day free trial with up to 5 vehicles. No credit card is required to start the trial.

### Cancellation and Refunds
Monthly plans can be cancelled at any time and stay active until the end of the billing period. Annual plans can be refunded on a pro-rated basis within the first 30 days only.

## Features

### Route Optimization
RouteWise optimizes routes for up to 500 stops per route, taking into account delivery time windows, vehicle capacity, driver breaks and live traffic. Re-optimization runs automatically when a new order is added during the day.

### Live Tracking
Vehicle positions update every 10 seconds through the driver app. Dispatchers see all vehicles on a map and get an alert when a vehicle is more than 15 minutes behind schedule.

### Customer Notifications
Customers receive SMS or email notifications with a live ETA link. Notification templates can be customized with the company's logo and colours on the Growth and Enterprise plans.

## Integrations

RouteWise integrates natively with Shopify, WooCommerce, QuickBooks Online and Salesforce. Other systems can connect through the REST API and webhooks (Growth plan and above). The API rate limit is 600 requests per minute per account.

## Support and SLA

- Starter: email support, response within 1 business day.
- Growth: email and chat support, response within 4 business hours.
- Enterprise: 24/7 phone support with a 1-hour response time for critical incidents and a 99.95% monthly uptime SLA. If uptime falls below the SLA, customers receive a service credit of 10% of the monthly fee for each 0.1% below target, up to 50%.

## Data and Privacy

Customer data is hosted on AWS in Canada (ca-central-1) for Canadian customers and in the United States (us-east-1) for everyone else. Data is encrypted at rest with AES-256 and in transit with TLS 1.2 or higher. GPS location history is kept for 13 months and then deleted automatically.
