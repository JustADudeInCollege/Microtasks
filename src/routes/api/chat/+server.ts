import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getChatCompletion, type ChatMessageForAPI } from '$lib/server/aiService';

const CONTEXT_WINDOW_SIZE = 10; // Number of messages to include in context

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    
    // Support both old format (single message) and new format (messages array with context)
    let messagesToSend: ChatMessageForAPI[];
    
    if (body.messages && Array.isArray(body.messages)) {
      // New format with conversation history
      const { messages, systemPrompt } = body;
      
      // Build the messages array with system prompt first
      messagesToSend = [];
      
      if (systemPrompt) {
        messagesToSend.push({ role: 'system', content: systemPrompt });
      }
      
      // Add conversation history (limited to context window)
      const recentMessages = messages.slice(-CONTEXT_WINDOW_SIZE);
      messagesToSend.push(...recentMessages);
      
    } else if (body.message && typeof body.message === 'string') {
      // Legacy format - single message string
      messagesToSend = [{ role: 'user', content: body.message }];
    } else {
      return json({ reply: 'Invalid message format provided.', error: true });
    }

    // Use getChatCompletion with the full message history
    const reply = await getChatCompletion(messagesToSend, true);

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
