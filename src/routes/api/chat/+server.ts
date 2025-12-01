import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getOpenRouterCompletion } from '$lib/server/aiService';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return json({ reply: 'Invalid message provided.', error: true });
    }

    // Use throwOnError to catch rate limiting
    const reply = await getOpenRouterCompletion(message, true);

    if (reply === null) {
      return json({ 
        reply: "I couldn't generate a response. Please try again.", 
        error: true 
      });
    }

    return json({ reply, error: false });
  } catch (err: any) {
    console.error('Error processing chat request:', err);
    
    // Check for rate limit error
    if (err.message?.startsWith('RATE_LIMITED')) {
      const waitTime = err.message.split(':')[1] || 'a minute';
      return json({ 
        reply: `I'm currently rate limited. Please wait ${waitTime} and try again.`, 
        error: true 
      });
    }
    
    return json({ 
      reply: "Sorry, I encountered an error. Please try again in a moment.", 
      error: true 
    });
  }
};
