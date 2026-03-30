export type SubjectProgram = {
    id: string;
    application_number: string;
    language: string;
    source_side: "ru_dump" | "kz_dump";
    subject_name: string;
    grade_level: string;
    description: string | null;
    source_url: string | null;
    global_discipline_name?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type StandardEntry = {
    id: string;
    program_id: string;
    code: string;
    text: string;
    context_paths: string[];
    is_recommended_partial: boolean;
    needs_fix: boolean;
    last_edited_by?: string | null;
    last_edited_at?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type ReviewPair = {
    id: string;
    ru_entry_id: string;
    kz_entry_id: string;
    application_number: string;
    goal_code: string;
    subject_name: string | null;
    grade_level: string | null;
    status: "pending" | "in_review" | "done";
    assigned_to: string | null;
    lock_expires_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at?: string;
    updated_at?: string;
};

export type ReviewAction = {
    id: string;
    pair_id: string;
    user_id: string;
    action_type: string;
    old_ru_text?: string | null;
    new_ru_text?: string | null;
    old_kz_text?: string | null;
    new_kz_text?: string | null;
    note?: string | null;
    created_at?: string;
};

export type UserProgress = {
    user_id: string;
    current_pair_id: string | null;
    selected_appendices: string[];
    filters: Record<string, unknown>;
    updated_at?: string;
};

export type ReviewItem = {
    pair: ReviewPair;
    ru: StandardEntry;
    kz: StandardEntry;
};

export type AppendixOption = {
    application_number: string;
    pair_count: number;
    has_ru?: boolean;
    has_kz?: boolean;
};