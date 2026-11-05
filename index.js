
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

const db = client.db("booknook");

const books = db.collection("books");
const borrows = db.collection("borrows");

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

// Create books collection if it does not exist
const collections = await db.listCollections().toArray();

const booksCollectionExists = collections.some(
  (collection) => collection.name === "books"
);

if (!booksCollectionExists) {
  await db.createCollection("books");
  console.log("Books Collection Created Successfully!");
}

app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

const PORT = process.env.PORT || 5000;

try {
  await client.connect();

  console.log("MongoDB Connected Successfully!");

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
} catch (error) {
  console.log("MongoDB Connection Failed:", error.message);
  process.exit(1);
}
