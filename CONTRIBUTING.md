# Contributing to DynamicFit

## Repo Structure

```
csc-307-teamproject/
├── packages/
│   ├── express-backend/   # Node.js + Express REST API (port 8000)
│   └── react-frontend/    # React 19 + Vite SPA (port 5173)
├── package.json           # npm workspaces root
└── package-lock.json
```

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

Clone the repo and install all dependencies from the root:

```bash
git clone <repo-url>
cd csc-307-teamproject
npm install
```

Create a `.env` file in `packages/express-backend/`:

```
TOKEN_SECRET=any-local-secret-here
MONGODB_URI=your-mongodb-atlas-connection-string  # optional; falls back to local file storage
```

## Running Locally

Start both servers (two terminals):

```bash
# Terminal 1 — backend
npm run dev -w express-backend    # http://localhost:8000

# Terminal 2 — frontend
npm run dev -w react-frontend     # http://localhost:5173
```

## Branching

- `main` — stable, deployable branch; do not push directly
- Create a feature branch for your work:
  ```bash
  git checkout -b feature/your-feature-name
  ```
- Open a pull request into `main` when your feature is ready

## Workflow

1. Pull the latest `main` before starting:
   ```bash
   git pull origin main
   ```
2. Make your changes on a feature branch
3. Lint and build locally before pushing (see below)
4. Open a PR — CI must pass before merging

## Linting

Run from the repo root:

```bash
# Backend
npm run lint -w express-backend

# Frontend
npm run lint -w react-frontend
```

## Formatting

Prettier is configured at the repo root (`.prettierrc`). Auto-format all files:

```bash
npm run format
```

Run this before committing if the lint check complains about formatting.

## Building

```bash
npm run build -w react-frontend
```

The compiled output goes to `packages/react-frontend/dist/`.

## Testing (Cypress E2E)

Requires both dev servers to be running (see above), then:

```bash
# Open interactive test runner
npm run cypress:open -w react-frontend

# Run headlessly (CI mode)
npm run cypress:run -w react-frontend
```

Tests live in `packages/react-frontend/cypress/e2e/`.

## CI/CD

Every push and PR to `main` runs the **CI Testing** GitHub Actions workflow, which:

1. Installs dependencies (`npm ci`)
2. Lints backend and frontend
3. Builds the frontend
4. Runs the backend test script

The build must be green before a PR can be merged. Azure deployments trigger automatically on a successful push to `main`.

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `TOKEN_SECRET` | `packages/express-backend/.env` | JWT signing secret |
| `MONGODB_URI` | `packages/express-backend/.env` | MongoDB Atlas connection string (optional) |
| `VITE_API_URL` | Azure Static Web Apps config | Backend URL for production builds |

Never commit `.env` files — they are gitignored.
