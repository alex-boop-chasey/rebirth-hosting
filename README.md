# Rebirth Hosting Reseller Platform

Modern web hosting reseller platform built with **Astro 7**, **Tailwind CSS v4**, and **Supabase**.

## Getting Started

```bash
npm install
npm run dev
```

The development server will start at `http://localhost:4321`.

## Tech Stack

- **Framework**: Astro 7 ( Islands architecture )
- **Styling**: Tailwind CSS v4 + dark theme
- **Auth & Database**: Supabase (configured via `.env`)
- **Deployment**: Cloudflare Pages (ready)

## Project Structure

```
/
├── src/
│   ├── pages/           # All routes live here
│   └── styles/
│       └── global.css   # Tailwind v4 import
├── public/              # Static assets
├── .env                 # Supabase + Turnstile keys
├── astro.config.mjs
└── package.json
```

## Next Steps

1. Configure your Supabase credentials in `.env`
2. Build the auth flow (`/signin`, `/onboarding`, `/dashboard`)
3. Add hosting plans and reseller features

This is a clean foundation — ready for production-grade development.

Built as a fresh install with latest Astro + Tailwind v4.
