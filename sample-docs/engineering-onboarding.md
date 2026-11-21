# Engineering Onboarding Guide

Welcome to the Brightline engineering team (fictional company for this demo). This guide covers your first two weeks, our tech stack and how we ship code.

## First Week

- **Day 1**: laptop setup with IT, Okta and MFA enrollment, meet your onboarding buddy.
- **Day 2**: clone the monorepo, run the local environment with Docker Compose, read the architecture overview.
- **Day 3–4**: pick a "good first issue" from the backlog and pair with your buddy on it.
- **Day 5**: ship your first pull request to production.

By the end of week two every engineer should have shipped at least three pull requests and joined one on-call shadow shift.

## Tech Stack

- Frontend: React and TypeScript with Next.js; component library built on Tailwind CSS.
- Backend: Node.js services in TypeScript (NestJS) and a few Python services for route optimization.
- Data: PostgreSQL 16 as the main database, Redis for caching and queues, Kafka for event streaming.
- Infrastructure: AWS (EKS, RDS, S3), Terraform for infrastructure as code, GitHub Actions for CI/CD.
- Observability: Datadog for metrics and logs, Sentry for error tracking.

## Development Workflow

We use trunk-based development. Branches should live no longer than 2 days. Every pull request needs one approving review and green CI before merging. Pull requests over 400 changed lines should be split.

Deployments to production happen automatically after merge, behind feature flags managed in LaunchDarkly. There is no deploy freeze, except during the last week of December.

### Code Review Guidelines
- Review requests should be answered within 4 working hours.
- Use "nit:" for optional suggestions.
- Security-sensitive changes (authentication, payments, permissions) need a second review from the security champions group.

### AI Coding Tools
Engineers may use the approved AI coding assistants (Claude Code and Cursor with the company workspace). Never paste Restricted data or secrets into prompts. AI-generated code is reviewed and tested exactly like human-written code.

## On-Call

Each engineer joins the on-call rotation after 3 months. A rotation lasts one week, from Monday 10:00 to the next Monday 10:00 Eastern Time. On-call engineers receive a stipend of 400 USD per week and must acknowledge pages within 10 minutes.

## Who to Ask

- Your onboarding buddy for anything day-to-day.
- #eng-help Slack channel for technical questions.
- Platform team for infrastructure, CI/CD and access to AWS.
