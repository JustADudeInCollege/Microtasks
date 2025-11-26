import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5174,
		strictPort: true,
		hmr: {
			host: 'localhost',
			protocol: 'ws',
		  },
	},
	define: {
		'process.env.FIREBASE_ADMIN_SDK_JSON': JSON.stringify(process.env.FIREBASE_ADMIN_SDK_JSON)
	}
});