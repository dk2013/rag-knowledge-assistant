# Information Security Policy

This policy applies to all Brightline Logistics employees, contractors and systems (fictional company for this demo). Questions go to the IT Security team at security@brightline.example.

## Accounts and Passwords

All company accounts use single sign-on through Okta. Passwords must be at least 14 characters long and must not be reused from any other service. A password manager (1Password, provided by the company) is mandatory.

Multi-factor authentication (MFA) is required for every account. Allowed methods are hardware security keys (YubiKey) and the Okta Verify app. SMS codes are not allowed as an MFA method because of SIM-swap attacks.

Accounts are disabled automatically after 45 days without a login. Access of departing employees is revoked within 2 hours of their last working day.

## Devices

- Laptops must have full-disk encryption enabled (FileVault or BitLocker) and screen lock after 5 minutes of inactivity.
- Operating system security updates must be installed within 14 days of release.
- Personal devices may access email and chat only through the managed mobile apps; they may not store customer data.
- A lost or stolen device must be reported to IT Security within 24 hours so it can be wiped remotely.

## Data Classification

Brightline uses four data classes:
1. **Public**: marketing materials, published documentation.
2. **Internal**: internal wiki, policies, non-sensitive project information.
3. **Confidential**: customer data, contracts, financial reports, source code.
4. **Restricted**: payment data, authentication secrets, employee health information.

Confidential and Restricted data may only be stored in approved systems (Google Workspace, AWS, Salesforce). Restricted data must never be pasted into public AI tools; only the company's approved AI assistant may be used with Confidential data.

## Data Retention

Customer contracts are retained for 7 years after the contract ends. Support tickets are retained for 3 years. Application logs are kept for 90 days. Backups are encrypted and kept for 35 days.

## Incident Response

A security incident is any event that could compromise the confidentiality, integrity or availability of company data. Suspected incidents must be reported in the #security-incidents Slack channel or by phone to the on-call security engineer immediately.

Severity levels:
- **SEV-1**: confirmed breach of customer data or a full outage. Response within 15 minutes, executive team informed within 1 hour, affected customers notified within 72 hours.
- **SEV-2**: suspected breach or partial outage. Response within 1 hour.
- **SEV-3**: policy violation without data exposure. Response within 1 business day.

A written post-mortem is required for every SEV-1 and SEV-2 incident within 5 business days.

## Security Training

All employees complete security awareness training during onboarding and then once a year. Engineers additionally complete secure coding training covering the OWASP Top 10. Phishing simulations run every quarter.
