
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
		RouteId(): "/" | "/api" | "/api/ai-task" | "/api/auth" | "/api/auth/session" | "/api/auth/timezone" | "/api/calendar-ai" | "/api/chats" | "/api/chat" | "/api/cron" | "/api/cron/send-reminders" | "/api/notifications" | "/api/pase-task-nlp" | "/api/tasks" | "/api/tasks/update-priority" | "/api/v1" | "/api/v1/chat" | "/api/workspace" | "/api/workspace/activity" | "/api/workspace/assignments" | "/api/workspace/invitations" | "/api/workspace/members" | "/api/workspace/share-link" | "/calendar" | "/dashboard" | "/forgotpass" | "/home" | "/join" | "/join/[token]" | "/kanban" | "/login" | "/settings" | "/signup" | "/workspace" | "/workspace/[boardId]";
		RouteParams(): {
			"/join/[token]": { token: string };
			"/workspace/[boardId]": { boardId: string }
		};
		LayoutParams(): {
			"/": { token?: string; boardId?: string };
			"/api": Record<string, never>;
			"/api/ai-task": Record<string, never>;
			"/api/auth": Record<string, never>;
			"/api/auth/session": Record<string, never>;
			"/api/auth/timezone": Record<string, never>;
			"/api/calendar-ai": Record<string, never>;
			"/api/chats": Record<string, never>;
			"/api/chat": Record<string, never>;
			"/api/cron": Record<string, never>;
			"/api/cron/send-reminders": Record<string, never>;
			"/api/notifications": Record<string, never>;
			"/api/pase-task-nlp": Record<string, never>;
			"/api/tasks": Record<string, never>;
			"/api/tasks/update-priority": Record<string, never>;
			"/api/v1": Record<string, never>;
			"/api/v1/chat": Record<string, never>;
			"/api/workspace": Record<string, never>;
			"/api/workspace/activity": Record<string, never>;
			"/api/workspace/assignments": Record<string, never>;
			"/api/workspace/invitations": Record<string, never>;
			"/api/workspace/members": Record<string, never>;
			"/api/workspace/share-link": Record<string, never>;
			"/calendar": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/forgotpass": Record<string, never>;
			"/home": Record<string, never>;
			"/join": { token?: string };
			"/join/[token]": { token: string };
			"/kanban": Record<string, never>;
			"/login": Record<string, never>;
			"/settings": Record<string, never>;
			"/signup": Record<string, never>;
			"/workspace": { boardId?: string };
			"/workspace/[boardId]": { boardId: string }
		};
		Pathname(): "/" | "/api" | "/api/" | "/api/ai-task" | "/api/ai-task/" | "/api/auth" | "/api/auth/" | "/api/auth/session" | "/api/auth/session/" | "/api/auth/timezone" | "/api/auth/timezone/" | "/api/calendar-ai" | "/api/calendar-ai/" | "/api/chats" | "/api/chats/" | "/api/chat" | "/api/chat/" | "/api/cron" | "/api/cron/" | "/api/cron/send-reminders" | "/api/cron/send-reminders/" | "/api/notifications" | "/api/notifications/" | "/api/pase-task-nlp" | "/api/pase-task-nlp/" | "/api/tasks" | "/api/tasks/" | "/api/tasks/update-priority" | "/api/tasks/update-priority/" | "/api/v1" | "/api/v1/" | "/api/v1/chat" | "/api/v1/chat/" | "/api/workspace" | "/api/workspace/" | "/api/workspace/activity" | "/api/workspace/activity/" | "/api/workspace/assignments" | "/api/workspace/assignments/" | "/api/workspace/invitations" | "/api/workspace/invitations/" | "/api/workspace/members" | "/api/workspace/members/" | "/api/workspace/share-link" | "/api/workspace/share-link/" | "/calendar" | "/calendar/" | "/dashboard" | "/dashboard/" | "/forgotpass" | "/forgotpass/" | "/home" | "/home/" | "/join" | "/join/" | `/join/${string}` & {} | `/join/${string}/` & {} | "/kanban" | "/kanban/" | "/login" | "/login/" | "/settings" | "/settings/" | "/signup" | "/signup/" | "/workspace" | "/workspace/" | `/workspace/${string}` & {} | `/workspace/${string}/` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/ai logo.png" | "/Ai.png" | "/background.png" | "/Bell.png" | "/Calendar.png" | "/Checkcircle.png" | "/Darkmode.png" | "/dashboard.png" | "/dashboarddark.png" | "/Dots.png" | "/Edit.png" | "/Events.png" | "/Expand.png" | "/favicon.png" | "/firebase-messaging-sw.js" | "/Hamburger.png" | "/Home.png" | "/iconnggoogle.webp" | "/invitebg.png" | "/invitebgdark.png" | "/Laptop.png" | "/logonamin.png" | "/logonamindarkmode.png" | "/mambou.mp3" | "/Moon.png" | "/pdf.worker.min.mjs" | "/Plus.png" | "/Profile.png" | "/Question.png" | "/Search.png" | "/Sun.png" | "/Timer.png" | "/View.png" | "/workspace.png" | "/workspacedark.png" | string & {};
	}
}