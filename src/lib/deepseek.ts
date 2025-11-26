export async function askDeepSeek(prompt: string): Promise<string> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "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",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://yourdomain.com",
        "X-Title": "Microtask"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-maverick:free",
        messages: [{ role: "user", content: prompt }]
      })
    });
  
    const data: {
      choices?: { message?: { content: string } }[];
    } = await res.json();
  
    return data.choices?.[0]?.message?.content ?? "No response.";
  }
  