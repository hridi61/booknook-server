# BookNook (Server)

REST API for BookNook, a small online library. It stores books and borrow records in MongoDB and verifies the login token created by the client app.

Client repository: [booknook-client](https://github.com/hridi61/booknook-client)

## Live API

https://booknook-server-n74t.onrender.com

> The server runs on a free Render plan and sleeps when idle. The first request can take up to a minute.

## Tech stack

- Node.js and Express
- MongoDB (official driver)
- `jose` for JWT verification against the client's JWKS
- `cors` and `dotenv`

## Run it locally

```bash
git clone https://github.com/hridi61/booknook-server.git
cd booknook-server
npm install
```

Create a `.env` file:

```env
MONGODB_URI=<your MongoDB connection string>
AUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
PORT=5000
```

Start the server:

```bash
npm start
```

For local testing the client app must also be running, because the server fetches the public keys from `AUTH_JWKS_URL`.

## Environment variables

| Name | What it is for |
|---|---|
| `MONGODB_URI` | MongoDB connection string (database name: `booknook`). |
| `AUTH_JWKS_URL` | Public keys URL of the client app, for example `https://booknook-client-lake.vercel.app/api/auth/jwks`. |
| `PORT` | Port to listen on (Render sets this by itself). |

## Authentication

Private routes need this header:

```
Authorization: Bearer <JWT>
```

The token is created by the client app (Better Auth). The server checks its signature with the keys from `AUTH_JWKS_URL` and uses the `email` and `name` inside the token as the user.

## API endpoints

| Method | Endpoint | Login | Description |
|---|---|---|---|
| GET | `/` | No | Server status text |
| GET | `/api/health` | No | Health check |
| GET | `/books` | No | List books |
| GET | `/books/:id` | Yes | Single book |
| POST | `/books` | Yes | Add a book |
| PATCH | `/books/:id` | Owner | Update a book |
| DELETE | `/books/:id` | Owner | Delete a book and its borrow records |
| POST | `/borrows` | Yes | Borrow a book |
| GET | `/borrows` | Yes | Books borrowed by the logged-in user |
| DELETE | `/borrows/:id` | Yes | Return a book |

### Query options for `GET /books`

| Query | Example | Result |
|---|---|---|
| `sort=newest` | `/books?sort=newest` | Newest books first |
| `limit` | `/books?sort=newest&limit=6` | At most this many books (maximum 100) |
| `category` | `/books?category=Fiction` | Books in one category |
| `addedBy` | `/books?addedBy=a@b.com` | Books added by one user |

### Add a book (`POST /books`)

```json
{
  "title": "The Alchemist",
  "author": "Paulo Coelho",
  "category": "Fiction",
  "description": "A shepherd boy follows his dream.",
  "coverImage": "https://example.com/cover.jpg",
  "totalCopies": 5
}
```

The server also stores `copies` (starts equal to `totalCopies`), `addedBy`, `addedByName` and `createdAt`.

### Borrow a book (`POST /borrows`)

```json
{ "bookId": "<book _id>" }
```

The server lowers `copies` by one and saves the borrow record with `bookTitle`, `bookImage`, `borrowedBy`, `borrowedAt` and `returnDate` (7 days later).

## Rules the server enforces

- Only the owner can update or delete a book.
- `copies` and `totalCopies` cannot be edited. `copies` changes only when a book is borrowed or returned.
- A book with no copies left cannot be borrowed.
- A user cannot borrow the same book twice.
- Returning a book removes the borrow record and raises `copies` by one.

## Deployment

Deployed on Render. Build command `npm install`, start command `npm run start`. Pushing to `main` deploys automatically.

## Author

Tanaka Anta Alam Hridi - [GitHub](https://github.com/hridi61)