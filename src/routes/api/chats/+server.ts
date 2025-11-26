import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const { message } = await request.json();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://your-site.com",
        "X-Title": "Microtask Dashboard"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1:free",
        messages: [{ role: "user", content: message }]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("OpenRouter error:", res.status, errorText);
      return json({ reply: "OpenRouter API error." }, { status: 500 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "No reply.";
    return json({ reply });

  } catch (err) {
    console.error('OpenRouter request failed:', err);
    return json({ reply: 'Server error occurred.' }, { status: 500 });
  }
};
