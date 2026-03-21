# FindStoop

Property management web app.

## Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: TailwindCSS
- **Routing**: React Router v6
- **Backend**: Supabase
- **Payments**: Stripe
- **Hosting**: Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Copy env files and fill in values
cp apps/web/.env.example apps/web/.env

# Start dev server
npm run dev
```

## Project Structure

```
apps/web/          React + Vite web app
packages/shared/   Shared types, hooks, and utilities
supabase/          Database migrations and config
```
