// src/app.d.ts

declare global {
  namespace App {
    // Interface for event.locals
    interface Locals {
      userId: string | null; // Keep this if you use it separately, but often uid from user object is enough
      user: { // Changed this to be non-optional if user is logged in, and null if not.
        uid: string;          // <<< ADDED: Crucial for Firebase operations
        name?: string | null;   // Kept optional, as per your original
        email?: string | null;  // <<< ADDED: Common to have, make optional
        picture?: string | null;// <<< ADDED: For profile picture URL
        // Add any other properties you reliably set on locals.user
      } | null; // <<< MODIFIED: User object itself can be null if not authenticated
    }

    // Defines the shape of data returned from `load` functions or passed to pages.
    interface PageData {
      // Data for the workspace listing page (/workspace)
      // user?: { name?: string }; // You can remove this if locals.user is always set correctly for header
      boards?: BoardForFrontend[];
      templates?: Template[];
      error?: string | null; // General page-level error

      // Data for a specific workspace page (/workspace/[boardId])
      board?: BoardDataForFrontend;
      tasks?: TaskForFrontend[];
      filterFromDate?: string | null;
      filterToDate?: string | null;

      // Form action results
      boardForm?: BoardFormResult;
      deleteBoardForm?: DeleteBoardFormResult;
      templateForm?: TemplateFormResult;

      // Specifically for settings page load function
      username?: string; // For initial display name in header/page
      // photoURL?: string | null; // Optionally pass initial photoURL too
    }

    interface Error { // SvelteKit default error type, you can extend if needed
        message: string;
        code?: string;
    }
    // interface Platform {} 

    // --- SvelteKit Environment Variables ---
    interface SvelteKitEnv { // Renamed for clarity, though SvelteKit uses `EnvStaticPrivate` etc.
      // Note: SvelteKit's convention is more like `interface Env { ... }`
      // and then using `import { env } from '$env/dynamic/private';`
      // or for static: `import { VAR_NAME } from '$env/static/private';`
      // The structure below is for direct access if you've set it up differently,
      // but the standard is `$env/static/private` for server-only static vars.

      // If you are using $env/static/private correctly, you don't need to define SvelteKit.EnvStaticPrivate here.
      // SvelteKit automatically types them based on your .env file if you import them like:
      // import { OPENROUTER_API_KEY } from '$env/static/private';
      // However, if you are augmenting the SvelteKit namespace directly for these, this is how:
    }
    // The previous SvelteKit.EnvStaticPrivate was a good attempt.
    // If you directly import like `import { FIREBASE_ADMIN_SDK_JSON } from '$env/static/private';`
    // then SvelteKit should type it automatically. You usually don't need to redeclare EnvStaticPrivate.
    // I'll keep your structure for `EnvStaticPrivate` in case you have a specific setup reason.
    interface SvelteKit {
      EnvStaticPrivate: {
        OPENROUTER_API_KEY: string;
        FIREBASE_ADMIN_SDK_JSON: string; // Corrected from FIREBASE_ADMIN_SDK_CONFIG
        CRON_SECRET: string;
        RESEND_API_KEY: string;
        APP_URL: string;
      };
    }


    // --- Shared custom types exported from the App namespace ---
    export type IconKey = "study" | "work" | "self-improvement" | "other";

    export interface Template {
      title: string;
      iconKey: IconKey;
      goal: string;
      steps: string[];
    }

    export interface UserForFrontend {
    id: string;
    name?: string;
    email?: string;
    // ... other properties for your user object
    }

    export interface BoardForFrontend {
      id: string;
      title: string;
      createdAtISO?: string | null;
    }

    export interface TaskForFrontend {
      id: string;
      title: string;
      description: string;
      isCompleted: boolean;
      status: 'pending' | 'complete' | 'incomplete' | 'late';
      priority: string | number | null;
      createdAtISO: string | null;
      dueDateISO: string | null;
      dueTime: string | null;
    }

    export interface BoardDataForFrontend {
      id: string;
      title: string;
    }

    export interface PriorityCounts {
  high: number;
  standard: number;
  low: number;
  unprioritized: number;
  [key: string]: number; // Allows for other string keys if priorities are dynamic
}


    // --- Form Action Return Types ---
    export interface BoardFormResult {
      success?: boolean;
      message?: string;
      error?: string;
      title?: string;
      newBoard?: BoardForFrontend;
    }

    
export interface DashboardStats {
  priorityCounts: PriorityCounts;
  tasksDoneOnTime: number;
  tasksDoneLate: number;
  tasksDoneThisMonth: number;
  tasksDoneThisWeek: number;
  tasksDoneAllTime: number;
  // Add any other properties that your actual dashboardStats object contains
}

    export interface DeleteBoardFormResult {
      success?: boolean;
      message?: string;
      error?: string;
      deletedBoardId?: string;
    }

    export interface TemplateFormResult {
        success?: boolean;
        message?: string;
        error?: string;
        workspaceName?: string;
        newBoardId?: string;
    }
  }
}

export {};