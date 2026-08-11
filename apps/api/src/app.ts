import express from "express";

export const app = express();

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});
