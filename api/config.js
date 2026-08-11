export default function handler(request, response) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: key
  });
}
