import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConfig() {
  const url =
    (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    "";

  const key =
    (typeof process !== "undefined" && (process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_ANON_KEY)) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
    "";

  return { url, key, isConfigured: Boolean(url && key) };
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) {
    return null;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "x-application-name": "elite-hospital-system",
        },
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error("[Supabase] Failed to initialize client:", err);
    return null;
  }
}

export function resetSupabaseClient(): void {
  supabaseInstance = null;
}

/**
 * Fetch all rows from a Supabase table automatically handling PostgREST 1000-record pagination limit
 */
export async function fetchAllRowsFromSupabase<T = any>(
  tableName: string,
  applyQuery?: (query: any) => any
): Promise<T[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const PAGE_SIZE = 1000;
  let page = 0;
  const allRows: T[] = [];

  while (true) {
    let query = supabase
      .from(tableName)
      .select("*")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (applyQuery) {
      query = applyQuery(query);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[Supabase] Error fetching all from ${tableName} (page ${page}):`, error.message);
      break;
    }
    if (!data || data.length === 0) {
      break;
    }
    allRows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) {
      break;
    }
    page++;
  }

  return allRows;
}

export interface SupabaseDoctor {
  id: string;
  name: string;
  arabic_name: string;
  department: string;
  mobile_number?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseCheckIn {
  id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_arabic_name: string;
  department: string;
  shifts: string[];
  mobile_number?: string;
  checkin_timestamp: string;
  checkin_date: string;
  created_at?: string;
}

export interface SupabaseWeeklyCheckIn {
  id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_arabic_name: string;
  department: string;
  shifts: string[];
  mobile_number?: string;
  checkin_timestamp: string;
  checkin_date?: string;
  created_at?: string;
}

export interface SupabaseMonthlyCheckIn {
  id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_arabic_name: string;
  department: string;
  shifts: string[];
  mobile_number?: string;
  checkin_timestamp: string;
  checkin_date?: string;
  created_at?: string;
}
