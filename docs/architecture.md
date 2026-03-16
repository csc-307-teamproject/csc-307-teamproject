# System Architecture

Last Updated: March 16, 2026

## Monorepo Structure

The project is organized as a monorepo using npm workspaces. The repository contains two main packages representing the frontend and backend components of the system.

## Architecture Overview

The system follows a client-server architecture.

* **Frontend:** React
* **Backend:** Express.js
* **Authentication:** JWT-based authentication
* **Data Storage:** MongoDB

The React frontend communicates with the Express backend through REST API endpoints. The backend handles authentication, workout management, and exercise data processing. User passwords are securely hashed using bcrypt, and authenticated users receive a signed JSON Web Token (JWT) that is used to authorize protected API requests. Application data is stored in MongoDB.

## Component Interaction

1. The user interacts with the React frontend.
2. The frontend sends API requests to the Express backend.
3. The backend processes requests and interacts with the MongoDB database.
4. Responses are returned to the frontend and rendered to the user.
