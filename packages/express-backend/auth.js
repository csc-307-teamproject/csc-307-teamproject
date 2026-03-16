import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getDataStore } from "./dataStore.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_REMINDER_TIME = "18:00";

function generateAccessToken(email) {
  return new Promise((resolve, reject) => {
    jwt.sign(
      { email },
      process.env.TOKEN_SECRET,
      { expiresIn: "1d" },
      (error, token) => {
        if (error) reject(error);
        else resolve(token);
      }
    );
  });
}

export async function registerUser(req, res) {
  const email = String(req.body?.email ?? req.body?.username ?? "")
    .trim()
    .toLowerCase();
  const pwd = String(req.body?.pwd ?? "");

  if (!email || !pwd) {
    return res.status(400).send("Bad request: Invalid input data.");
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).send("Please enter a valid email address");
  }

  try {
    const store = await getDataStore();
    const existingUser = await store.getUserByEmail(email);

    if (existingUser) {
      return res.status(409).send("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(pwd, 10);
    await store.createUser({
      email,
      username: email,
      passwordHash: hashedPassword,
      displayName: email.split("@")[0],
      preferredUnit: "lb",
      bodyWeight: null,
      bodyWeightUnit: "lb",
      remindersEnabled: false,
      reminderTime: DEFAULT_REMINDER_TIME,
    });

    const token = await generateAccessToken(email);
    return res.status(201).send({ token });
  } catch (error) {
    if (error?.code === 11000 || error?.code === "E_DUPLICATE_EMAIL") {
      return res.status(409).send("Email already registered");
    }
    return res.status(500).send("Server error");
  }
}

export async function loginUser(req, res) {
  const email = String(req.body?.email ?? req.body?.username ?? "")
    .trim()
    .toLowerCase();
  const pwd = String(req.body?.pwd ?? "");

  if (!EMAIL_PATTERN.test(email) || !pwd) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const store = await getDataStore();
    const retrievedUser = await store.getUserByEmail(email);
    if (!retrievedUser) return res.status(401).send("Unauthorized");

    const matched = await bcrypt.compare(pwd, retrievedUser.passwordHash);
    if (!matched) return res.status(401).send("Unauthorized");

    const token = await generateAccessToken(retrievedUser.email || email);
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
    if (error) return res.status(401).end();

    const email = String(decoded?.email ?? decoded?.username ?? "")
      .trim()
      .toLowerCase();

    if (email && EMAIL_PATTERN.test(email)) {
      req.user = { email };
      next();
    } else {
      res.status(401).end();
    }
  });
}
