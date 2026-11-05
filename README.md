# BookNook Server

BookNook is a book management and borrowing application. This repository contains the backend API built with Express.js and MongoDB.

## Technologies
- Node.js
- Express.js
- MongoDB
- JSON Web Token verification with JOSE
- dotenv
- CORS

## Installation

Clone the repository:

```bash
git clone https://github.com/hridi61/booknook-server.git
cd booknook-server
```

Install dependencies:

```bash
npm install
```

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=
AUTH_JWKS_URL=
```

Start the development server:

```bash
npm run dev
```

Server runs at `http://localhost:5000`.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /books | Get all books |
| GET | /books/:id | Get a single book |
| POST | /books | Add a book |
| PATCH | /books/:id | Update a book |
| DELETE | /books/:id | Delete a book |
| POST | /borrows | Borrow a book |
| GET | /borrows | Get current user's borrowed books |
| DELETE | /borrows/:id | Return a borrowed book |

Protected endpoints require a valid Bearer token.

## Features
- MongoDB database integration
- Book listing and category filtering
- Add, update and delete books
- Owner-based authorization
- JWT authentication middleware
- Borrow and return books
- Available copy management
- Prevention of duplicate borrowing

## Author

Tanaka Anta Alam Hridi
