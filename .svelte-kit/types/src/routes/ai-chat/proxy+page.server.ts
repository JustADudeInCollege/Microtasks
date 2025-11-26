// @ts-nocheck
import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }: Parameters<PageServerLoad>[0]) => {
    const userId = locals.userId; 
    console.log('[Server Load /ai-chat] Checking authentication...');

    if (!userId) {
        console.warn('[Server Load /ai-chat] User not authenticated. Redirecting to login.');
      
        redirect(302, '/login');
    }

    console.log(`[Server Load /ai-chat] User authenticated: ${userId}. Allowing access.`);

    return {};
};

