import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const hashCode = async (code: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const makeCode = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '').toUpperCase()

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') || ''
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await caller.auth.getUser()
  if (authError || !user) return json({ error: 'Sign in required.' }, 401)

  try {
    const body = await request.json()
    const classroomId = body.classroom_id
    const action = body.action === 'rotate' ? 'rotate' : 'get'
    if (typeof classroomId !== 'string' || !classroomId) return json({ error: 'Choose a classroom.' }, 400)

    const admin = createClient(url, service, { auth: { persistSession: false } })
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') {
      const { data: member, error } = await admin.from('classroom_members').select('classroom_id').eq('classroom_id', classroomId).eq('user_id', user.id).maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (!member) return json({ error: 'Join this classroom before sharing its teacher code.' }, 403)
    }

    if (action === 'get') {
      const { data: existing, error } = await admin.from('classroom_join_codes').select('code_value').eq('classroom_id', classroomId).maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (existing?.code_value) return json({ code: existing.code_value, reused: true })
    }

    const code = makeCode()
    const { error } = await admin.from('classroom_join_codes').upsert({ classroom_id: classroomId, code_hash: await hashCode(code), code_value: code, created_by: user.id, created_at: new Date().toISOString() }, { onConflict: 'classroom_id' })
    if (error) return json({ error: error.message }, 400)
    return json({ code, reused: false })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Request failed.' }, 400)
  }
})
