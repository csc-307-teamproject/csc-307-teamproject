# Contributing

## Repo Structure

- 'packages/react-frontend' - React (Vite) frontend
- 'packages/express-backend' - Express backend

## Running the apps

- Backend:
  ```bash
   npm run -w express-backend dev
  ```
- Frontend:
  ```bash
   npm start
  ```

## Formatting

- Prettier is installed at the repo root, configured via .prettierrc
  - run from repo root:
    ```bash
    npm run format
    ```

## Linting

- Frontend:
  ```bash
  npm run -w react-frontend lint
  ```
- Backend:
  ```bash
  npm run -w express-backend lint
  ```
