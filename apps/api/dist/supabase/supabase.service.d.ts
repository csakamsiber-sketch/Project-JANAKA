import { SupabaseClient } from '@supabase/supabase-js';
export declare class SupabaseService {
    private readonly client;
    constructor();
    getClient(): SupabaseClient;
    getJwksUrl(): string;
}
