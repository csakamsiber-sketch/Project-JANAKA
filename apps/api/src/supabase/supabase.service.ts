import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_PUBLISHABLE_KEY.');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getJwksUrl(): string {
    return process.env.SUPABASE_JWKS_URL ?? `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  }
}
