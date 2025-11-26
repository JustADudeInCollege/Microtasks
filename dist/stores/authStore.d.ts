import { type Writable } from 'svelte/store';
export interface UserState {
    uid: string | null;
    email: string | null;
    displayName: string | null;
}
export declare const user: Writable<UserState | null>;
export declare const authLoading: Writable<boolean>;
