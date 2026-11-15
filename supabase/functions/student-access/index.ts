import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const cryptoHex = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await request.json()
    if (typeof body.token !== 'string' || body.token.length < 20) return json({ error: 'Invalid classroom link.' }, 404)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: link } = await db.from('student_links').select('classroom_id, revoked_at').eq('token_hash', await cryptoHex(body.token)).maybeSingle()
    if (!link || link.revoked_at) return json({ error: 'Classroom link is no longer available.' }, 404)
    if (body.action === 'download') {
      if (typeof body.material_id !== 'string') return json({ error: 'Material not found.' }, 404)
      const { data: material } = await db.from('materials').select('storage_path, file_name').eq('id', body.material_id).eq('classroom_id', link.classroom_id).maybeSingle()
      if (!material) return json({ error: 'Material not found.' }, 404)
      const { data, error } = await db.storage.from('class-materials').createSignedUrl(material.storage_path, 60, { download: material.file_name })
      if (error) return json({ error: 'Material could not be opened.' }, 500)
      return json({ url: data.signedUrl })
    }
    if (body.action !== 'list') return json({ error: 'Unknown action.' }, 400)
    const [{ data: classroom }, { data: subjects }, { data: folders }, { data: materials }] = await Promise.all([
      db.from('classrooms').select('id, name, academic_year, branch, section, description').eq('id', link.classroom_id).single(),
      db.from('subjects').select('id, name, description').eq('classroom_id', link.classroom_id).order('name'),
      db.from('folders').select('id, name, subject_id, parent_id').eq('classroom_id', link.classroom_id).order('name'),
      db.from('materials').select('id, title, description, file_name, file_size, mime_type, subject_id, folder_id, created_at').eq('classroom_id', link.classroom_id).order('created_at', { ascending: false }),
    ])
    if (!classroom) return json({ error: 'Classroom not found.' }, 404)
    return json({ classroom, subjects: subjects || [], folders: folders || [], materials: materials || [] })
  } catch { return json({ error: 'The classroom could not be opened.' }, 400) }
})
