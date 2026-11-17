import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const cryptoHex = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const makeToken = (bytes = 24) => { const data = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') }
const stableStudentToken = async (classroomId: string, generation: number, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`can-notes:student-link:${classroomId}:${generation}`)))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') || ''
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await caller.auth.getUser()
  if (authError || !user) return json({ error: 'Sign in required.' }, 401)
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'
  try {
    const body = await request.json()
    const classroomActions = new Set(['update_classroom', 'delete_classroom', 'list_teachers', 'update_teacher_permissions', 'remove_teacher', 'issue_teacher_code', 'invite_teacher', 'get_student_link', 'rotate_student_link', 'revoke_student_link'])
    if (classroomActions.has(body.action) && !isAdmin) {
      if (!body.classroom_id) return json({ error: 'Choose a classroom.' }, 400)
      const { data: membership } = await admin.from('classroom_members').select('can_manage_content').eq('classroom_id', body.classroom_id).eq('user_id', user.id).maybeSingle()
      if (!membership) return json({ error: 'Join this classroom before managing it.' }, 403)
    }
    if (body.action === 'create_classroom' && !isAdmin) return json({ error: 'Use the teacher classroom creation option.' }, 403)
    if (body.action === 'create_classroom') {
      const { name, academic_year, branch, section = '', description = '' } = body
      if (!name?.trim() || !['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(academic_year) || !branch?.trim()) return json({ error: 'Add a classroom name, year and branch.' }, 400)
      const { data, error } = await admin.from('classrooms').insert({ name: name.trim(), academic_year, branch: branch.trim(), section: section.trim(), description: description.trim(), created_by: user.id }).select().single()
      if (error) return json({ error: error.message }, 400)
      return json({ classroom: data })
    }
    if (body.action === 'update_classroom') {
      const { classroom_id, name, academic_year, branch, section = '', description = '' } = body
      if (!classroom_id || !name?.trim() || !['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(academic_year) || !branch?.trim()) return json({ error: 'Add a classroom name, year and branch.' }, 400)
      const { error } = await admin.from('classrooms').update({ name: name.trim(), academic_year, branch: branch.trim(), section: section.trim(), description: description.trim() }).eq('id', classroom_id)
      if (error) return json({ error: error.message }, 400)
      return json({ message: 'Classroom updated.' })
    }
    if (body.action === 'delete_classroom') {
      const classroom_id = body.classroom_id
      if (!classroom_id) return json({ error: 'Choose a classroom.' }, 400)
      const { data: materials } = await admin.from('materials').select('storage_path').eq('classroom_id', classroom_id)
      const paths = (materials || []).map(item => item.storage_path)
      if (paths.length) {
        const { error: storageError } = await admin.storage.from('class-materials').remove(paths)
        if (storageError) return json({ error: `Files could not be removed: ${storageError.message}` }, 400)
      }
      const { error } = await admin.from('classrooms').delete().eq('id', classroom_id)
      if (error) return json({ error: error.message }, 400)
      return json({ message: 'Classroom and its uploaded materials were deleted.' })
    }
    if (body.action === 'list_teachers') {
      const { data, error } = await admin.from('classroom_members').select('user_id, can_upload, can_manage_content, profiles(username, display_name)').eq('classroom_id', body.classroom_id).order('created_at')
      if (error) return json({ error: error.message }, 400)
      return json({ teachers: data || [] })
    }
    if (body.action === 'update_teacher_permissions') {
      const { error } = await admin.from('classroom_members').update({ can_upload: true, can_manage_content: true }).eq('classroom_id', body.classroom_id).eq('user_id', body.user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ message: 'Teacher permissions updated.' })
    }
    if (body.action === 'remove_teacher') {
      if (!isAdmin && body.user_id === user.id) return json({ error: 'You cannot remove yourself from this classroom.' }, 400)
      const { error } = await admin.from('classroom_members').delete().eq('classroom_id', body.classroom_id).eq('user_id', body.user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ message: 'Teacher removed from this classroom.' })
    }
    if (body.action === 'issue_teacher_code') {
      const code = makeToken(9).toUpperCase()
      const { error } = await admin.from('teacher_invites').insert({ classroom_id: body.classroom_id, code_hash: await cryptoHex(code), can_upload: true, can_manage_content: true, created_by: user.id })
      if (error) return json({ error: error.message }, 400)
      return json({ code })
    }
    if (body.action === 'invite_teacher') {
      const { email, username, display_name, classroom_id, can_upload = true, can_manage_content = true } = body
      if (!email?.trim() || !username?.trim() || !display_name?.trim() || !classroom_id) return json({ error: 'Add teacher name, username, email and classroom.' }, 400)
      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) return json({ error: 'Username must be 3–40 letters, numbers, dots, underscores or hyphens.' }, 400)
      const { data: exists } = await admin.from('profiles').select('id').eq('username', username.trim().toLowerCase()).maybeSingle()
      if (exists) return json({ error: 'That username is already in use.' }, 409)
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), { data: { username: username.trim().toLowerCase(), display_name: display_name.trim() }, redirectTo: `${Deno.env.get('APP_URL') || request.headers.get('origin')}/?flow=invite` })
      if (error) return json({ error: error.message }, 400)
      const { error: membershipError } = await admin.from('classroom_members').insert({ classroom_id, user_id: data.user.id, can_upload: true, can_manage_content: true })
      if (membershipError) return json({ error: `Teacher was invited, but classroom membership failed: ${membershipError.message}` }, 400)
      return json({ message: `Invitation sent to ${email.trim()}.`, username: username.trim().toLowerCase() })
    }
    if (body.action === 'get_student_link' || body.action === 'rotate_student_link') {
      const classroomId = body.classroom_id
      const { data: current, error: readError } = await admin.from('student_links').select('token_hash, link_generation, revoked_at').eq('classroom_id', classroomId).maybeSingle()
      if (readError) return json({ error: readError.message }, 400)

      const secret = Deno.env.get('STUDENT_LINK_SECRET') || service
      let generation = Math.max(1, Number(current?.link_generation) || 1)
      let token = await stableStudentToken(classroomId, generation, secret)
      let tokenHash = await cryptoHex(token)
      const forceRotate = body.action === 'rotate_student_link'
      const legacyOrRevoked = Boolean(current && (current.revoked_at || current.token_hash !== tokenHash))
      const shouldIssue = !current || forceRotate || legacyOrRevoked

      if (shouldIssue) {
        if (current && (forceRotate || legacyOrRevoked)) generation += 1
        token = await stableStudentToken(classroomId, generation, secret)
        tokenHash = await cryptoHex(token)
        const row = { classroom_id: classroomId, token_hash: tokenHash, link_generation: generation, created_by: user.id, created_at: new Date().toISOString(), revoked_at: null }
        const { error } = await admin.from('student_links').upsert(row, { onConflict: 'classroom_id' })
        if (error) return json({ error: error.message }, 400)
      }
      const baseUrl = Deno.env.get('APP_URL') || request.headers.get('origin')
      return json({ link: `${baseUrl}/class#${token}`, replacedPrevious: legacyOrRevoked || forceRotate })
    }
    if (body.action === 'revoke_student_link') {
      const { data, error } = await admin.from('student_links').update({ revoked_at: new Date().toISOString() }).eq('classroom_id', body.classroom_id).is('revoked_at', null).select('classroom_id').maybeSingle()
      if (error) return json({ error: error.message }, 400)
      return json({ message: data ? 'Student link revoked. Existing copies no longer work.' : 'There is no active student link to revoke.' })
    }
    return json({ error: 'Unknown admin action.' }, 400)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed.' }, 400) }
})
