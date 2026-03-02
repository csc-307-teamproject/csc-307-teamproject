import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const creds = []; // in-memory users: { username, hashedPassword }

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

export function registerUser(req, res) {
  const { username, pwd } = req.body;

  if (!username || !pwd) {
    return res.status(400).send("Bad request: Invalid input data.");
  }  

  if (creds.find((c) => c.username === username)) {
    return res.status(409).send("Username already taken");
  }

  bcrypt
    .genSalt(10)
    .then((salt) => bcrypt.hash(pwd, salt))
    .then((hashedPassword) => {
      creds.push({ username, hashedPassword });
      return generateAccessToken(username);
    })
    .then((token) => res.status(201).send({ token }))
    .catch(() => res.status(500).send("Server error"));
}

export function loginUser(req, res) {
  const { username, pwd } = req.body;

  const retrievedUser = creds.find((c) => c.username === username);
  if (!retrievedUser) return res.status(401).send("Unauthorized");

  bcrypt
    .compare(pwd, retrievedUser.hashedPassword)
    .then((matched) => {
      if (!matched) return res.status(401).send("Unauthorized");
      return generateAccessToken(username).then((token) =>
        res.status(200).send({ token })
      );
    })
    .catch(() => res.status(401).send("Unauthorized"));
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
