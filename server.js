import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment");
}

app.get("/ai/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(API_KEY),
  });
});

app.post("/ai", async (req, res) => {
  const { prompt } = req.body;
  if (!API_KEY) {
    return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });
  }
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res
        .status(response.status)
        .json({ error: data.error?.message || "OpenAI request failed" });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || "(No reply received)",
    });
  } catch (err) {
    console.error("AI route error:", err);
    res.status(500).json({ error: err.message || "AI failed" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
