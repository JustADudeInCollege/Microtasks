export interface TaskForFrontend {
    id: string;
    title: string;
    description: string; // <--- MUST BE string, not string | undefined
    isCompleted: boolean;
    status: 'pending' | 'complete' | 'incomplete' | 'late';
    priority: string | number | null;
    createdAtISO: string | null;
    dueDateISO: string | null;
    dueTime: string | null;
    boardId: string;
    color?: string;
}
