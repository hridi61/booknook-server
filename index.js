import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log("Request:", req.method, req.url);
  next();
});

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("booknook");

const books = db.collection("books");
const borrows = db.collection("borrows");

// ---------- helpers ----------
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const cleanUrl = (value) => {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

// ---------- JWT Verification ----------
let JWKS;

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.AUTH_JWKS_URL) {
      return res.status(503).send({ message: "Authentication is not configured yet" });
    }

    if (!JWKS) {
      JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL));
    }

    const { payload } = await jwtVerify(token, JWKS);

    if (!payload.email) {
      return res.status(401).send({ message: "User email not found in token" });
    }

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

// ---------- Health Check ----------
app.get("/api/health", (req, res) => {
  res.status(200).send({ status: "ok", message: "BookNook Server is healthy" });
});

// ---------- 1. Get All Books (public) ----------
// Examples:
//   /books                          all books
//   /books?sort=newest&limit=6      latest 6 (Home page)
//   /books?category=Fiction         filter by category
//   /books?addedBy=a@b.com          my books
app.get("/books", async (req, res) => {
  try {
    const query = {};

    if (req.query.addedBy) query.addedBy = String(req.query.addedBy);
    if (req.query.category) query.category = String(req.query.category);

    let cursor = books.find(query);

    if (req.query.sort === "newest") {
      cursor = cursor.sort({ createdAt: -1, _id: -1 });
    } else {
      cursor = cursor.sort({ _id: -1 });
    }

    const limit = parseInt(req.query.limit, 10);
    if (Number.isInteger(limit) && limit > 0) {
      cursor = cursor.limit(Math.min(limit, 100));
    }

    res.status(200).send(await cursor.toArray());
  } catch (error) {
    res.status(500).send({ message: "Failed to get books", error: error.message });
  }
});

// ---------- 2. Get Single Book (private) ----------
app.get("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const book = await books.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    res.status(200).send(book);
  } catch (error) {
    res.status(500).send({ message: "Failed to get book", error: error.message });
  }
});

// ---------- 3. Add New Book ----------
app.post("/books", verifyToken, async (req, res) => {
  try {
    const { title, author, category, description, coverImage } = req.body;

    // totalCopies is the new name; copies is accepted for older client code
    const totalCopies = req.body.totalCopies ?? req.body.copies;

    if (
      !isNonEmptyString(title) ||
      !isNonEmptyString(author) ||
      !isNonEmptyString(category) ||
      !isNonEmptyString(description) ||
      !isNonEmptyString(coverImage) ||
      typeof totalCopies !== "number" ||
      !Number.isInteger(totalCopies) ||
      totalCopies < 1
    ) {
      return res.status(400).send({
        message: "Please provide valid book information",
      });
    }

    const imageUrl = cleanUrl(coverImage);
    if (!imageUrl) {
      return res.status(400).send({ message: "Please provide a valid cover image URL" });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      description: description.trim(),
      coverImage: imageUrl,
      totalCopies,
      copies: totalCopies,
      addedBy: req.user.email,
      addedByName: req.user.name || "",
      createdAt: new Date(),
    };

    const result = await books.insertOne(newBook);

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to add book", error: error.message });
  }
});

// ---------- 4. Update Book (owner only) ----------
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).send({ message: "Update information is required" });
    }

    const book = await books.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (book.addedBy !== req.user.email) {
      return res.status(403).send({ message: "You are not the owner of this book" });
    }

    // copies and totalCopies are NOT editable here.
    // copies only changes through borrow and return.
    const allowedFields = ["title", "author", "category", "description", "coverImage"];
    const filteredData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        filteredData[field] = req.body[field];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).send({ message: "No valid fields to update" });
    }

    for (const field of ["title", "author", "category", "description"]) {
      if (filteredData[field] !== undefined) {
        if (!isNonEmptyString(filteredData[field])) {
          return res.status(400).send({ message: `Invalid ${field}` });
        }
        filteredData[field] = filteredData[field].trim();
      }
    }

    if (filteredData.coverImage !== undefined) {
      const imageUrl = cleanUrl(filteredData.coverImage);
      if (!imageUrl) {
        return res.status(400).send({ message: "Invalid cover image URL" });
      }
      filteredData.coverImage = imageUrl;
    }

    await books.updateOne({ _id: new ObjectId(id) }, { $set: filteredData });

    res.status(200).send({ message: "Book updated successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to update book", error: error.message });
  }
});

// ---------- 5. Delete Book (owner only) ----------
app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const book = await books.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (book.addedBy !== req.user.email) {
      return res.status(403).send({ message: "You are not the owner of this book" });
    }

    await books.deleteOne({ _id: new ObjectId(id) });

    // Remove associated borrow records
    await borrows.deleteMany({ bookId: id });

    res.status(200).send({ message: "Book deleted successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book", error: error.message });
  }
});

// ---------- 6. Borrow Book ----------
app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body;
    const userEmail = req.user.email;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const book = await books.findOne({ _id: new ObjectId(bookId) });

    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }

    if (book.copies <= 0) {
      return res.status(400).send({ message: "No copies available" });
    }

    const existingBorrow = await borrows.findOne({
      bookId,
      borrowedBy: userEmail,
    });

    if (existingBorrow) {
      return res.status(409).send({ message: "You have already borrowed this book" });
    }

    const updateResult = await books.updateOne(
      { _id: new ObjectId(bookId), copies: { $gt: 0 } },
      { $inc: { copies: -1 } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({ message: "No copies available" });
    }

    const borrowedAt = new Date();
    const returnDate = new Date(borrowedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const borrowInfo = {
      bookId,
      bookTitle: book.title,
      bookImage: book.coverImage,
      borrowedBy: userEmail,
      borrowedByName: req.user.name || "",
      borrowedAt,
      returnDate,
    };

    const result = await borrows.insertOne(borrowInfo);

    res.status(201).send({
      message: "Book borrowed successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to borrow book", error: error.message });
  }
});

// ---------- 7. Get My Borrowed Books ----------
app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const result = await borrows
      .find({ borrowedBy: req.user.email })
      .sort({ borrowedAt: -1 })
      .toArray();

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get borrowed books", error: error.message });
  }
});

// ---------- 8. Return Book ----------
app.delete("/borrows/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid borrow ID" });
    }

    const borrow = await borrows.findOne({
      _id: new ObjectId(id),
      borrowedBy: req.user.email,
    });

    if (!borrow) {
      return res.status(404).send({ message: "Borrow record not found" });
    }

    const deleteResult = await borrows.deleteOne({
      _id: new ObjectId(id),
      borrowedBy: req.user.email,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({ message: "Borrow record not found" });
    }

    if (ObjectId.isValid(borrow.bookId)) {
      await books.updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { copies: 1 } }
      );
    }

    res.status(200).send({ message: "Book returned successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to return book", error: error.message });
  }
});

// ---------- Home Route ----------
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

const PORT = process.env.PORT || 5000;

// ---------- Connect MongoDB and Start Server ----------
try {
  await client.connect();
  console.log("MongoDB Connected Successfully!");

  const collections = await db.listCollections().toArray();
  const booksCollectionExists = collections.some((c) => c.name === "books");

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