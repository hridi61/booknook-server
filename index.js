
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

const db = client.db("booknook");

const books = db.collection("books");
const borrows = db.collection("borrows");

// JWT Verification Middleware
let JWKS;

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized access",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.AUTH_JWKS_URL) {
      return res.status(503).send({
        message: "Authentication is not configured yet",
      });
    }

    if (!JWKS) {
      JWKS = createRemoteJWKSet(
        new URL(process.env.AUTH_JWKS_URL)
      );
    }

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    next();
  } catch (error) {
    res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

// Get all books
app.get("/books", async (req, res) => {
  try {
    const query = {};

    // Filter books by user
    if (req.query.addedBy) {
      query.addedBy = req.query.addedBy;
    }

    const result = await books
      .find(query)
      .sort({ _id: -1 })
      .limit(20)
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get books",
      error: error.message,
    });
  }
});

// Get a single book by ID
app.get("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await books.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get book",
      error: error.message,
    });
  }
});

// Add a new book
app.post("/books", verifyToken, async (req, res) => {
  try {
    const newBook = req.body;

    if (!newBook || Object.keys(newBook).length === 0) {
      return res.status(400).send({
        message: "Book information is required",
      });
    }

    const result = await books.insertOne(newBook);

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to add book",
      error: error.message,
    });
  }
});

// Home route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

const PORT = process.env.PORT || 5000;

try {
  await client.connect();

  console.log("MongoDB Connected Successfully!");

  // Create books collection if it does not exist
  const collections = await db.listCollections().toArray();

  const booksCollectionExists = collections.some(
    (collection) => collection.name === "books"
  );

  if (!booksCollectionExists) {
    await db.createCollection("books");
    console.log("Books Collection Created Successfully!");
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.log("MongoDB Connection Failed:", error.message);
  process.exit(1);
}
