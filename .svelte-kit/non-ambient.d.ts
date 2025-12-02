
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/ai-chat" | "/api" | "/api/auth" | "/api/auth/session" | "/api/chats" | "/api/chat" | "/api/cron" | "/api/cron/send-reminders" | "/api/pase-task-nlp" | "/api/v1" | "/api/v1/chat" | "/calendar" | "/dashboard" | "/forgotpass" | "/home" | "/kanban" | "/login" | "/settings" | "/signup" | "/support" | "/tasks" | "/workspace" | "/workspace/[boardId]";
		RouteParams(): {
			"/workspace/[boardId]": { boardId: string }
		};
		LayoutParams(): {
			"/": { boardId?: string };
			"/ai-chat": Record<string, never>;
			"/api": Record<string, never>;
			"/api/auth": Record<string, never>;
			"/api/auth/session": Record<string, never>;
			"/api/chats": Record<string, never>;
			"/api/chat": Record<string, never>;
			"/api/cron": Record<string, never>;
			"/api/cron/send-reminders": Record<string, never>;
			"/api/pase-task-nlp": Record<string, never>;
			"/api/v1": Record<string, never>;
			"/api/v1/chat": Record<string, never>;
			"/calendar": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/forgotpass": Record<string, never>;
			"/home": Record<string, never>;
			"/kanban": Record<string, never>;
			"/login": Record<string, never>;
			"/settings": Record<string, never>;
			"/signup": Record<string, never>;
			"/support": Record<string, never>;
			"/tasks": Record<string, never>;
			"/workspace": { boardId?: string };
			"/workspace/[boardId]": { boardId: string }
		};
		Pathname(): "/" | "/ai-chat" | "/ai-chat/" | "/api" | "/api/" | "/api/auth" | "/api/auth/" | "/api/auth/session" | "/api/auth/session/" | "/api/chats" | "/api/chats/" | "/api/chat" | "/api/chat/" | "/api/cron" | "/api/cron/" | "/api/cron/send-reminders" | "/api/cron/send-reminders/" | "/api/pase-task-nlp" | "/api/pase-task-nlp/" | "/api/v1" | "/api/v1/" | "/api/v1/chat" | "/api/v1/chat/" | "/calendar" | "/calendar/" | "/dashboard" | "/dashboard/" | "/forgotpass" | "/forgotpass/" | "/home" | "/home/" | "/kanban" | "/kanban/" | "/login" | "/login/" | "/settings" | "/settings/" | "/signup" | "/signup/" | "/support" | "/support/" | "/tasks" | "/tasks/" | "/workspace" | "/workspace/" | `/workspace/${string}` & {} | `/workspace/${string}/` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/Ai.png" | "/background.png" | "/Bell.png" | "/Calendar.png" | "/Checkcircle.png" | "/Darkmode.png" | "/Dots.png" | "/Edit.png" | "/Events.png" | "/Expand.png" | "/favicon.png" | "/firebase-messaging-sw.js" | "/Hamburger.png" | "/Home.png" | "/iconnggoogle.webp" | "/Laptop.png" | "/logonamin.png" | "/logonamindarkmode.png" | "/Moon.png" | "/Plus.png" | "/Profile.png" | "/Question.png" | "/Search.png" | "/Sun.png" | "/Timer.png" | "/View.png" | string & {};
	}
}