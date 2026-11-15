import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { login, password } = await request.json()
    if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || !password) return json({ error: 'Enter your username/email and password.' }, 400)
    const url = Deno.env.get('SUPABASE_URL')!, anonKey = Deno.env.get('SUPABASE_ANON_KEY')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const addressHash = await hash(ip)
    const { count } = await admin.from('teacher_login_attempts').select('id', { count: 'exact', head: true }).eq('address_hash', addressHash).gt('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
    if ((count || 0) >= 12) return json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, 429)
    let email = login.trim()
    if (!email.includes('@')) {
      const { data: profile } = await admin.from('profiles').select('id').eq('username', email.toLowerCase()).maybeSingle()
      if (profile) { const { data } = await admin.auth.admin.getUserById(profile.id); email = data.user?.email || 'unknown@invalid.local' }
      else email = 'unknown@invalid.local'
    }
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const result = await response.json()
    if (!response.ok || !result.access_token || !result.refresh_token) {
      await admin.from('teacher_login_attempts').insert({ address_hash: addressHash })
      return json({ error: 'Sign in failed. Check your username/email and password.' }, 401)
    }
    return json({ access_token: result.access_token, refresh_token: result.refresh_token })
  } catch { return json({ error: 'Sign in could not be completed. Try again.' }, 400) }
})
