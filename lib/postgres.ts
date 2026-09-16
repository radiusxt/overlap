import postgres from 'postgres'

export const sql = postgres(process.env.SUPABASE_DB_URL!)
