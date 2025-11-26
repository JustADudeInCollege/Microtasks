import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
	return new Response('This endpoint only supports POST requests.', {
		status: 405
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { message } = await request.json();

	const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

	if (!apiKey) {
		return new Response(JSON.stringify({ error: 'API key not found.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'deepseek-chat',
				messages: [
					{ role: 'system', content: 'You are a helpful assistant.' },
					{ role: 'user', content: message }
				]
			})
		});

		if (!res.ok) {
			const error = await res.text();
			console.error('OpenRouter error:', error);
			return new Response(JSON.stringify({ error }), {
				status: res.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const data = await res.json();
		const reply = data.choices?.[0]?.message?.content;

		return new Response(JSON.stringify({ reply }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('Server error:', err);
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
