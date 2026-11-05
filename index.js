
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

// Get all books with filters
app.get("/books", async (req, res) => {
  try {
    const query = {};

    if (req.query.addedBy) {
      query.addedBy = req.query.addedBy;
    }

    // Filter by category
    if (req.query.category) {
      query.category = req.query.category;
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

    if (
      typeof newBook.title !== "string" ||
      !newBook.title.trim() ||
      typeof newBook.category !== "string" ||
      typeof newBook.copies !== "number" ||
      newBook.copies < 0
    ) {
      return res.status(400).send({
        message: "Invalid book information",
      });
    }

    newBook.addedBy = req.user.email;

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

// Update a book (Owner only)
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).send({
        message: "Update information is required",
      });
    }

    if (
      req.body.copies !== undefined &&
      (typeof req.body.copies !== "number" || req.body.copies < 0)
    ) {
      return res.status(400).send({
        message: "Invalid copies value",
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

    if (book.addedBy !== req.user.email) {
      return res.status(403).send({
        message: "You are not the owner of this book",
      });
    }

    const updatedData = { ...req.body };

    delete updatedData._id;
    delete updatedData.addedBy;

    await books.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.status(200).send({
      message: "Book updated successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to update book",
      error: error.message,
    });
  }
});

// Delete a book (Owner only)
app.delete("/books/:id", verifyToken, async (req, res) => {
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

    if (book.addedBy !== req.user.email) {
      return res.status(403).send({
        message: "You are not the owner of this book",
      });
    }

    await books.deleteOne({
      _id: new ObjectId(id),
    });

    res.status(200).send({
      message: "Book deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete book",
      error: error.message,
    });
  }
});

// Borrow a book
app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body;
    const userEmail = req.user.email;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await books.findOne({
      _id: new ObjectId(bookId),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    if (book.copies <= 0) {
      return res.status(400).send({
        message: "No copies available",
      });
    }

    const existingBorrow = await borrows.findOne({
      bookId: bookId,
      borrowedBy: userEmail,
    });

    if (existingBorrow) {
      return res.status(400).send({
        message: "You have already borrowed this book",
      });
    }

    const updateResult = await books.updateOne(
      {
        _id: new ObjectId(bookId),
        copies: { $gt: 0 },
      },
      {
        $inc: { copies: -1 },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({
        message: "No copies available",
      });
    }

    const borrowInfo = {
      bookId: bookId,
      bookTitle: book.title,
      borrowedBy: userEmail,
      borrowedAt: new Date(),
    };

    const result = await borrows.insertOne(borrowInfo);

    res.status(201).send({
      message: "Book borrowed successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to borrow book",
      error: error.message,
    });
  }
});

// Get borrowed books of logged-in user
app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const result = await borrows
      .find({ borrowedBy: userEmail })
      .sort({ borrowedAt: -1 })
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get borrowed books",
      error: error.message,
    });
  }
});

// Return a borrowed book
app.delete("/borrows/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrow ID",
      });
    }

    const borrow = await borrows.findOne({
      _id: new ObjectId(id),
      borrowedBy: req.user.email,
    });

    if (!borrow) {
      return res.status(404).send({
        message: "Borrow record not found",
      });
    }

    const deleteResult = await borrows.deleteOne({
      _id: new ObjectId(id),
      borrowedBy: req.user.email,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({
        message: "Borrow record not found",
      });
    }

    if (ObjectId.isValid(borrow.bookId)) {
      await books.updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { copies: 1 } }
      );
    }

    res.status(200).send({
      message: "Book returned successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to return book",
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
