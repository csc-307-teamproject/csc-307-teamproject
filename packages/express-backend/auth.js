import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getDataStore } from "./dataStore.js";

function generateAccessToken(username) {
  return new Promise((resolve, reject) => {
    jwt.sign(
      { username },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" },
      (error, token) => {
        if (error) reject(error);
        else resolve(token);
      }
    );
  });
}

function normalizeUsername(username) {
  return String(username ?? "").trim();
}

export async function registerUser(req, res) {
  const username = normalizeUsername(req.body?.username);
  const pwd = String(req.body?.pwd ?? "");

  if (!username || !pwd) {
    return res.status(400).send("Bad request: Invalid input data.");
  }

  try {
    const store = await getDataStore();
    const existingUser = await store.getUserByUsername(username);

    if (existingUser) {
      return res.status(409).send("Username already taken");
    }

    const hashedPassword = await bcrypt.hash(pwd, 10);
    await store.createUser({ username, passwordHash: hashedPassword });

    const token = await generateAccessToken(username);
    return res.status(201).send({ token });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).send("Username already taken");
    }
    return res.status(500).send("Server error");
  }
}

export async function loginUser(req, res) {
  const username = normalizeUsername(req.body?.username);
  const pwd = String(req.body?.pwd ?? "");

  try {
    const store = await getDataStore();
    const retrievedUser = await store.getUserByUsername(username);
    if (!retrievedUser) return res.status(401).send("Unauthorized");

    const matched = await bcrypt.compare(pwd, retrievedUser.passwordHash);
    if (!matched) return res.status(401).send("Unauthorized");

    const token = await generateAccessToken(username);
    return res.status(200).send({ token });
  } catch {
    return res.status(401).send("Unauthorized");
  }
}

export function authenticateUser(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).end();

  jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
    if (decoded?.username) {
      req.user = decoded; 
      next();
    } else {
      res.status(401).end();
    }
  });
}
