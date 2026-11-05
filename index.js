
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
