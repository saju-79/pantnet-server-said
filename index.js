const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();

// ================= CORS =================
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://plantnet-31532.web.app",
    "https://your-frontend.vercel.app",
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ================= MongoDB =================
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let plantsCollection;
let usersCollection;

async function connectDB() {
  if (!plantsCollection) {
    await client.connect();
    const db = client.db("plantNetDB");
    plantsCollection = db.collection("plants");
    usersCollection = db.collection("users");
    console.log("MongoDB Connected");
  }
}
connectDB();

// ================= JWT =================
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "365d",
  });
  res.send({ token });
});

// ================= Middleware =================
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = req.headers.authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized" });
    req.decoded = decoded;
    next();
  });
};

// ================= Routes =================

// Test Route
app.get("/", (req, res) => {
  res.send("PlantNet Server Running");
});

// Get All Plants
app.get("/plant", async (req, res) => {
  await connectDB();
  const result = await plantsCollection.find().toArray();
  res.send(result);
});

// Add Plant
app.post("/add-plant", verifyToken, async (req, res) => {
  await connectDB();
  const plantData = req.body;
  const result = await plantsCollection.insertOne(plantData);
  res.send(result);
});

// Get Single Plant
app.get("/plant/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await plantsCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Save User
app.post("/users", async (req, res) => {
  await connectDB();
  const user = req.body;
  const existing = await usersCollection.findOne({ email: user.email });
  if (existing) return res.send({ message: "User already exists" });

  const result = await usersCollection.insertOne(user);
  res.send(result);
});

// Get User Role
app.get("/users/role/:email", verifyToken, async (req, res) => {
  await connectDB();
  const email = req.params.email;

  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const user = await usersCollection.findOne({ email });
  res.send({ role: user?.role || "user" });
});

// ================= EXPORT FOR VERCEL =================
module.exports = app;