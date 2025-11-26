// app.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const port = 5000;

// Middleware to parse JSON
app.use(bodyParser.json());

// AI Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const response = await axios.post('https://openrouter.ai/v1/chat/completions', {
      model: "deepseek/deepseek-r1-zero:free", // Model name may need adjustment
      messages: [
        { role: "user", content: userMessage }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data?.choices?.[0]?.message?.content?.trim();

    // Send the AI reply back to the frontend
    return res.json({ reply: reply || "Sorry, I didn’t quite get that." });
  } catch (error) {
    console.error('Error communicating with DeepSeek:', error);
    return res.status(500).json({ error: 'Oops! Something went wrong. Please try again later.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
