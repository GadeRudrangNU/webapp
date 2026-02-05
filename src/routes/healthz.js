const express = require("express");
const { prisma } = require("../db");

const router = express.Router();

function setNoCache(res) {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("X-Content-Type-Options", "nosniff");
}

function hasPayload(req) {
  const len = req.headers["content-length"];
  if (len && parseInt(len, 10) > 0) return true;
  if (req.headers["transfer-encoding"]) return true;
  return false;
}
// Explicitly reject HEAD
router.head("/", (req, res) => {
  setNoCache(res);
  return res.status(405).send();
});
// GET 
router.get("/", async (req, res) => {
  setNoCache(res);
  if (req.query && Object.keys(req.query).length > 0) {
    return res.status(400).send();
  }
  if (hasPayload(req)) {
    return res.status(400).send();
  }

  try {
    await prisma.healthCheck.create({ data: {} });
    return res.status(200).send();
  } catch (err) {
    return res.status(503).send();
  }
});

// All other methods → 405
router.all("/", (req, res) => {
  setNoCache(res);
  return res.status(405).send();
});

module.exports = router;
