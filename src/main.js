import { createClient } from '@supabase/supabase-js'
import './style.css'

const env = import.meta.env
const configured = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)
const supabase = configured ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null
const app = document.querySelector('#app')
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const icons = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h7"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
}
let state = { session: null, profile: null, classrooms: [], classroom: null, subjects: [], folders: [], materials: [], activeSubject: null, folder: null, studentMode: false, studentToken: null, query: '', authFlow: null }
let deferredInstallPrompt = null
const studentInstallTokenKey = 'can-notes:student-install-token'
const themePreferenceKey = 'can-notes:theme'
let activeTheme = (() => { try { return localStorage.getItem(themePreferenceKey) === 'dark' ? 'dark' : 'light' } catch { return 'light' } })()
document.documentElement.dataset.theme = activeTheme

function themeToggle() { return `<button class="theme-toggle" type="button" data-action="theme-toggle" aria-label="Switch to ${activeTheme === 'dark' ? 'light' : 'dark'} theme" aria-pressed="${activeTheme === 'dark'}">${activeTheme === 'dark' ? '☀ Light' : '☾ Dark'}</button>` }
function toggleTheme() {
  activeTheme = activeTheme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = activeTheme
  try { localStorage.setItem(themePreferenceKey, activeTheme) } catch { /* Theme still applies for this page view. */ }
  document.querySelectorAll('[data-action="theme-toggle"]').forEach(button => {
    button.innerHTML = activeTheme === 'dark' ? '☀ Light' : '☾ Dark'
    button.setAttribute('aria-label', `Switch to ${activeTheme === 'dark' ? 'light' : 'dark'} theme`)
    button.setAttribute('aria-pressed', String(activeTheme === 'dark'))
  })
}
document.addEventListener('click', event => { if (event.target.closest('[data-action="theme-toggle"]')) toggleTheme() })

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event })
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; toast('Can Notes was added to your device.') })

function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }
function initials(name = 'Teacher') { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TP' }
function toast(message, error = false) {
  const node = document.createElement('div'); node.className = `toast ${error ? 'toast-error' : ''}`; node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 3800)
}
function badge(text, tone = '') { return `<span class="badge ${tone}">${esc(text)}</span>` }
function initialsBlock(name) { return `<span class="avatar">${esc(initials(name))}</span>` }
function setupScreen() {
  app.innerHTML = `<main class="setup-wrap"><section class="setup-card"><div class="brand-lockup"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></div><span class="eyebrow">YOUR COLLEGE LEARNING SPACE</span><h1>Every classroom,<br>in its own place.</h1><p class="muted">A calmer home for notes, question banks, assignments and everything your class needs.</p><div class="setup-alert"><div class="lock-icon">${icons.lock}</div><div><strong>Connect your Supabase project</strong><p>The app is ready for its database. Add your project URL and browser-safe key to <code>.env.local</code>, then run the database setup in <code>supabase/migrations</code>.</p></div></div><ol class="setup-steps"><li><span>1</span><div><b>Create a Supabase project</b><small>Choose a region close to your college.</small></div></li><li><span>2</span><div><b>Add your project keys</b><small>Use the Project URL and anon/publishable key only.</small></div></li><li><span>3</span><div><b>Set up the database</b><small>Run the included SQL migration in Supabase SQL Editor.</small></div></li></ol><div class="setup-foot">Your service-role key never belongs in this website.</div></section><div class="setup-side"><div class="mini-window"><div class="window-top"><i></i><i></i><i></i><span>MY CLASSROOMS</span></div><div class="window-title">Good morning, Ananya <span>✦</span></div><div class="window-sub">YOUR TEACHING SPACE</div><div class="mini-card"><span class="mini-icon lilac">01</span><div><b>1st Year · ECE</b><small>6 subjects · 24 materials</small></div>${icons.arrow}</div><div class="mini-card"><span class="mini-icon peach">02</span><div><b>1st Year · CSE 1</b><small>5 subjects · 18 materials</small></div>${icons.arrow}</div><div class="mini-card"><span class="mini-icon mint">03</span><div><b>2nd Year · CSE 2</b><small>7 subjects · 31 materials</small></div>${icons.arrow}</div><div class="mini-add">＋ &nbsp; Join a classroom</div></div><div class="side-caption">One login. Every classroom you teach.</div></div></main>`
}
function loginScreen() {
  app.innerHTML = `<main class="auth-wrap auth-redesign"><section class="auth-aside"><a class="brand-lockup" href="/"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></a><div class="auth-aside-copy"><span class="eyebrow">A BETTER CAMPUS CLASSROOM</span><h2>Good notes.<br>Shared clearly.</h2><p>One calm space for the classes you teach and the materials your students need.</p></div><div class="auth-aside-card"><div class="aside-card-icon">${icons.book}</div><div><span>YOUR COLLEGE LEARNING SPACE</span><b>Every class has a place.</b><small>Notes · folders · study resources</small></div><span class="aside-card-spark">✦</span></div><span class="auth-aside-foot">CAN NOTES <i>·</i> LEARN TOGETHER</span></section><section class="auth-main-panel"><div class="auth-theme-toggle">${themeToggle()}</div><div class="auth-form-wrap"><div class="auth-mobile-brand"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></div><section class="auth-card"><span class="eyebrow">WELCOME BACK</span><h1>Sign in to your space.</h1><p class="muted">Your classrooms are waiting right where you left them.</p><form id="login-form"><label>Username or email<input name="login" type="text" autocomplete="username" placeholder="your.username or you@college.edu" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label><div class="form-row"><label class="check-label"><input type="checkbox"> Remember me</label><button class="text-button" id="forgot" type="button">Forgot password?</button></div><button class="button button-primary full" type="submit">Sign in ${icons.arrow}</button></form><div class="auth-note">Ask a classroom teacher or college admin for an invite or join code if you do not have an account.</div></section><div class="auth-bottom">${icons.lock} Your sign-in is protected by Supabase Auth.</div></div></section></main>`
  document.querySelector('#login-form').addEventListener('submit', login)
  document.querySelector('#forgot').addEventListener('click', resetPassword)
}
async function login(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Signing in…'
  const { data: result, error } = await supabase.functions.invoke('teacher-login', { body: { login: data.get('login'), password: data.get('password') } })
  if (!error && result?.access_token && result?.refresh_token) { const { error: sessionError } = await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token }); if (sessionError) toast(sessionError.message, true); return }
  toast(result?.error || error?.message || 'Sign in failed. Check your username/email and password.', true); button.disabled = false; button.innerHTML = `Sign in ${icons.arrow}`
}
function setPasswordScreen() {
  app.innerHTML = `<main class="auth-wrap"><div class="auth-theme-toggle">${themeToggle()}</div><div class="auth-brand"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span></div><section class="auth-card"><span class="eyebrow">SECURE YOUR ACCOUNT</span><h1>Choose your password.</h1><p class="muted">Create a private password for your Can Notes teacher account.</p><form id="password-form"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required></label><label>Confirm password<input name="confirm" type="password" minlength="8" autocomplete="new-password" placeholder="Type it again" required></label><button class="button button-primary full" type="submit">Save password ${icons.arrow}</button></form></section></main>`
  document.querySelector('#password-form').addEventListener('submit', async event => { event.preventDefault(); const fields = new FormData(event.currentTarget); if (fields.get('password') !== fields.get('confirm')) return toast('Those passwords do not match.', true); const { error } = await supabase.auth.updateUser({ password: fields.get('password') }); if (error) return toast(error.message, true); state.authFlow = null; history.replaceState({}, '', '/'); toast('Your password is set. Welcome to Can Notes.'); await loadApp() })
}
async function resetPassword() {
  const login = document.querySelector('[name="login"]').value.trim(); if (!login) return toast('Enter your email address first.', true); if (!login.includes('@')) return toast('For password recovery, enter the email address on your teacher account.', true)
  const { error } = await supabase.auth.resetPasswordForEmail(login, { redirectTo: `${location.origin}/?flow=recovery` }); error ? toast(error.message, true) : toast('If this email has an account, a password reset link is on its way.')
}
async function start() {
  const designPreview = new URLSearchParams(location.search).get('preview')
  if (import.meta.env.DEV && ['dashboard', 'classroom'].includes(designPreview)) {
    state.profile = { display_name: 'Ananya Rao', username: 'ananya', role: 'Teacher' }
    const sampleRooms = [
      { id: 'preview-ece', name: '1st Year ECE', academic_year: '1st Year', branch: 'ECE', section: '', subject_count: 6, can_upload: true },
      { id: 'preview-cse1', name: '1st Year CSE 1', academic_year: '1st Year', branch: 'CSE', section: '1', subject_count: 5, can_upload: true },
      { id: 'preview-cse2', name: '1st Year CSE 2', academic_year: '1st Year', branch: 'CSE', section: '2', subject_count: 5, can_upload: true },
      { id: 'preview-2cse', name: '2nd Year CSE 1', academic_year: '2nd Year', branch: 'CSE', section: '1', subject_count: 7, can_upload: true },
    ]
    state.classrooms = sampleRooms
    if (designPreview === 'classroom') {
      state.classroom = { ...sampleRooms[1], description: 'Lecture notes, lab work and helpful references for our class.', can_manage_content: true }
      state.subjects = [{ id: 'preview-math', name: 'Discrete Mathematics' }, { id: 'preview-programming', name: 'Programming Fundamentals' }, { id: 'preview-physics', name: 'Applied Physics' }]
      state.activeSubject = 'preview-math'
      state.folders = [{ id: 'preview-week1', name: 'Week 1 · Logic and Sets', subject_id: 'preview-math', parent_id: null }]
      state.materials = [
        { id: 'preview-notes', title: 'Propositional Logic Notes', file_name: 'propositional-logic.pdf', file_size: 1843200, mime_type: 'application/pdf', created_at: new Date().toISOString() },
        { id: 'preview-exercises', title: 'Set Theory Exercises', file_name: 'set-theory-exercises.pdf', file_size: 932864, mime_type: 'application/pdf', created_at: new Date(Date.now() - 86400000).toISOString() },
      ].map(file => ({ ...file, subject_id: 'preview-math', folder_id: null }))
      return renderClassroom()
    }
    return dashboard()
  }
  if (!configured) return setupScreen()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Can Notes app install support is unavailable.', error))
  if (new URLSearchParams(location.search).get('launch') === 'student') {
    const savedStudentToken = localStorage.getItem(studentInstallTokenKey)
    if (savedStudentToken) { state.studentMode = true; state.studentToken = savedStudentToken; await renderStudent(); return }
  }
  if (location.pathname === '/class' && location.hash) {
    state.studentMode = true; state.studentToken = location.hash.slice(1); await renderStudent(); return
  }
  state.authFlow = new URLSearchParams(location.search).get('flow')
  const { data: { session } } = await supabase.auth.getSession(); state.session = session
  supabase.auth.onAuthStateChange((_event, session) => { state.session = session; queueMicrotask(() => session ? (state.authFlow ? setPasswordScreen() : loadApp()) : loginScreen()) })
  if (!session) return loginScreen()
  if (state.authFlow) return setPasswordScreen()
  await loadApp()
}
async function loadApp() {
  const user = state.session.user
  const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, role').eq('id', user.id).single(),
    supabase.from('classroom_members').select('classroom_id, can_upload, can_manage_content, classrooms(id, name, academic_year, branch, section, description)').eq('user_id', user.id).order('created_at', { ascending: true }),
  ])
  if (profileError) { app.innerHTML = `<div class="center-state"><h2>Your account is invited, but not set up yet.</h2><p class="muted">Ask your college administrator to finish your profile setup.</p><button class="button button-secondary" id="signout">Sign out</button></div>`; document.querySelector('#signout').onclick = () => supabase.auth.signOut(); return }
  if (membershipError) return toast(membershipError.message, true)
  state.profile = profile; state.classrooms = (memberships || []).map(row => ({ ...row.classrooms, can_upload: true, can_manage_content: true }))
  if (profile.role === 'admin') { const { data: allRooms, error: roomError } = await supabase.from('classrooms').select('*').order('academic_year').order('branch').order('section'); if (roomError) return toast(roomError.message, true); state.classrooms = (allRooms || []).map(room => ({ ...room, can_upload: true, can_manage_content: true })) }
  if (state.classroom && !state.classrooms.some(room => room.id === state.classroom.id) && profile.role !== 'admin') state.classroom = null
  if (profile.role === 'admin' && state.classroom) { const { data: room } = await supabase.from('classrooms').select('*').eq('id', state.classroom.id).single(); if (room) state.classroom = { ...room, can_upload: true, can_manage_content: true } }
  state.classroom ? await loadClassroom() : dashboard()
}
function dashboard() {
  const name = state.profile.display_name || state.profile.username || 'Teacher'
  const yearGroups = years.map(year => ({ year, rooms: state.classrooms.filter(room => room.academic_year === year) })).filter(group => group.rooms.length)
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'dashboard'
  app.innerHTML = `<div class="app-shell redesigned-shell"><aside class="sidebar redesigned-sidebar"><a href="#" class="brand-lockup" data-action="home"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></a><div class="side-workspace"><span class="side-label">WORKSPACE</span><button class="nav-item active" data-action="home">${icons.grid}<span>My classrooms</span><b>${state.classrooms.length}</b></button><button class="nav-item" data-action="join">${icons.plus}<span>Join a classroom</span></button><button class="nav-item" data-action="create-class">${icons.book}<span>Create classroom</span></button></div><div class="sidebar-tip"><span class="tip-icon">${icons.lock}</span><div><b>Your teaching space</b><small>Only classrooms you belong to appear here.</small></div></div><div class="side-bottom"><button class="profile-row" data-action="signout">${initialsBlock(name)}<span><b>${esc(name)}</b><small>${esc(state.profile.role || 'Teacher')}</small></span><span class="more">⋯</span></button></div></aside><main class="main-content redesigned-main"><header class="topbar redesigned-topbar"><div class="topbar-context"><span class="breadcrumbs">Workspace</span><span class="context-divider">/</span><b>My classrooms</b></div><div class="topbar-right"><span class="secure-status"><i class="status-dot"></i> Connected securely</span>${themeToggle()}<span class="top-avatar">${esc(initials(name))}</span></div></header><section class="page-content redesigned-content">${isDesignPreview ? '<div class="design-preview-note">Design preview · sample classroom names and counts</div>' : ''}<section class="dashboard-hero"><div class="hero-copy"><span class="eyebrow">YOUR TEACHING SPACE</span><h1>Good ${greeting()}, ${esc(name.split(' ')[0])}.</h1><p>One home for every classroom you teach.</p><div class="hero-actions"><button class="button button-primary" data-action="create-class">${icons.plus} Create classroom</button><button class="button button-secondary" data-action="join">Join with a teacher code ${icons.arrow}</button></div></div><div class="hero-illustration" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-book">${icons.book}</div><span class="hero-spark spark-one">✦</span><span class="hero-spark spark-two">✦</span><span class="hero-caption">LEARN TOGETHER</span></div></section><div class="stats-row redesigned-stats"><article class="stat-card"><span class="stat-icon stat-lilac">${icons.book}</span><div><small>CLASSROOMS</small><strong>${state.classrooms.length}</strong></div><span class="stat-note">across all years</span></article><article class="stat-card"><span class="stat-icon stat-peach">${icons.folder}</span><div><small>SUBJECTS</small><strong>${state.classrooms.reduce((n, room) => n + (room.subject_count || 0), 0)}</strong></div><span class="stat-note">in your classrooms</span></article><article class="stat-card"><span class="stat-icon stat-mint">${icons.lock}</span><div><small>ACCOUNT</small><strong class="role-word">${esc(state.profile.role || 'Teacher')}</strong></div><span class="stat-note">secure workspace</span></article></div><div class="classrooms-title-row"><div><span class="eyebrow">YOUR CLASS LIST</span><h2>All classrooms</h2></div><span class="total-classrooms">${state.classrooms.length} total</span></div>${yearGroups.length ? yearGroups.map((group, index) => `<section class="year-section redesigned-year"><div class="section-heading"><div><span class="year-index">0${index + 1}</span><h2>${esc(group.year)}</h2></div><span class="section-count">${group.rooms.length} ${group.rooms.length === 1 ? 'classroom' : 'classrooms'}</span></div><div class="classroom-grid">${group.rooms.map((room, i) => classroomCard(room, i)).join('')}</div></section>`).join('') : emptyDashboard()}<div class="join-banner redesigned-join"><span class="join-art"><span>＋</span></span><div><b>Teaching another class?</b><p>Enter a colleague’s teacher code to add it to your dashboard.</p></div><button class="button button-dark" data-action="join">Join classroom ${icons.arrow}</button></div></section></main></div>`
  bindGlobal()
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening' }
function classroomCard(room, index) {
  const tones = ['lilac', 'peach', 'mint', 'blue']; const tone = tones[index % tones.length]
  return `<button class="classroom-card" data-room="${esc(room.id)}"><div class="room-card-top"><span class="room-icon ${tone}">${icons.book}</span><span class="card-arrow">${icons.arrow}</span></div><span class="room-year">${esc(room.academic_year)} <i>·</i> ${esc(room.branch)}${room.section ? ` ${esc(room.section)}` : ''}</span><h3>${esc(room.name)}</h3><p>${esc(room.description || 'Open your classroom and keep learning materials organised.')}</p><div class="room-card-bottom"><span>${room.subject_count ?? '—'} subjects</span><span class="permission-pill">${room.can_upload ? 'Teacher access' : 'View access'}</span></div></button>`
}
function emptyDashboard() { return `<div class="empty-state"><div class="empty-illustration">${icons.book}</div><h2>Your classrooms will show up here.</h2><p>Create a classroom or enter a teacher join code to get started.</p><button class="button button-primary" data-action="join">${icons.plus} Join your first classroom</button></div>` }
async function loadClassroom() {
  const room = state.classroom
  const [{ data: subjects, error: subjectsError }, { data: folders, error: foldersError }, { data: materials, error: materialsError }] = await Promise.all([
    supabase.from('subjects').select('id, name, description').eq('classroom_id', room.id).order('name'),
    supabase.from('folders').select('id, name, subject_id, parent_id').eq('classroom_id', room.id).order('name'),
    supabase.from('materials').select('id, title, description, file_name, storage_path, file_size, mime_type, subject_id, folder_id, created_at').eq('classroom_id', room.id).order('created_at', { ascending: false }),
  ])
  const err = subjectsError || foldersError || materialsError; if (err) { toast(err.message, true); return dashboard() }
  state.subjects = subjects || []; state.folders = folders || []; state.materials = materials || []
  if (!state.activeSubject || !state.subjects.some(s => s.id === state.activeSubject)) state.activeSubject = state.subjects[0]?.id || null
  renderClassroom()
}
function renderClassroom() {
  const room = state.classroom; const subject = state.subjects.find(item => item.id === state.activeSubject); const name = state.profile.display_name || state.profile.username || 'Teacher'
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'classroom'
  if (!room) return dashboard()
  const folders = state.folders.filter(folder => folder.subject_id === state.activeSubject && (folder.parent_id || null) === (state.folder || null))
  const materials = state.materials.filter(file => file.subject_id === state.activeSubject && (file.folder_id || null) === (state.folder || null) && (!state.query || file.title.toLowerCase().includes(state.query.toLowerCase())))
  const breadcrumbs = folderBreadcrumbs(state.folder)
  const subjectMissing = !subject
  const noSubjectState = `<div class="no-subject-state"><span class="no-subject-icon">${icons.book}</span><h3>No subjects in this classroom yet</h3><p>${state.classroom.can_manage_content ? 'Create a subject first. Folders and uploaded materials are organized inside a subject.' : 'Ask your classroom admin to add a subject. Folders and materials are organized inside a subject.'}</p>${state.classroom.can_manage_content ? `<button class="button button-primary" data-action="add-subject">${icons.plus} Add first subject</button>` : ''}</div>`
  app.innerHTML = `<div class="app-shell redesigned-shell"><aside class="sidebar redesigned-sidebar"><a href="#" class="brand-lockup" data-action="home"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></a><button class="back-link" data-action="home">← &nbsp; All classrooms</button><div class="side-label">THIS CLASSROOM</div><div class="room-sidebar-title">${icons.book}<span>${esc(room.name)}<small>${esc(room.academic_year)} · ${esc(room.branch)}${room.section ? ` ${esc(room.section)}` : ''}</small></span></div><div class="side-label subject-label">SUBJECTS ${state.classroom.can_manage_content ? '<button data-action="add-subject" title="Add subject">+</button>' : ''}</div><div class="subject-list">${state.subjects.map((s, i) => `<button class="subject-item ${s.id === state.activeSubject ? 'active' : ''}" data-subject="${esc(s.id)}"><i class="subject-dot dot-${i % 5}"></i>${esc(s.name)}</button>`).join('') || '<p class="side-empty">No subjects yet.</p>'}</div><div class="side-bottom"><div class="secure-note">${icons.lock}<span>Your uploads stay private<br>to this classroom.</span></div><button class="profile-row" data-action="signout">${initialsBlock(name)}<span><b>${esc(name)}</b><small>${esc(state.profile.role || 'Teacher')}</small></span><span class="more">•••</span></button></div></aside><main class="main-content"><header class="topbar redesigned-topbar"><div class="breadcrumbs"><button data-action="home">My classrooms</button><span>/</span><span>${esc(room.name)}</span></div><div class="topbar-right">${themeToggle()}<label class="search-box">${icons.search}<input id="search-input" placeholder="Search materials" value="${esc(state.query)}"></label><span class="top-avatar">${esc(initials(name))}</span></div></header><section class="page-content classroom-content redesigned-content">${isDesignPreview ? '<div class="design-preview-note">Design preview · sample subject and materials</div>' : ''}<div class="classroom-heading"><div><span class="eyebrow">${esc(room.academic_year)} &nbsp;·&nbsp; ${esc(room.branch)}${room.section ? ` ${esc(room.section)}` : ''}</span><h1>${esc(room.name)}</h1><p class="muted">${esc(room.description || 'Your class materials, organised by subject.')}</p></div>${room.can_upload || room.can_manage_content ? `<div class="action-group">${room.can_manage_content ? `<button class="button button-secondary" data-action="new-folder" ${subjectMissing ? 'disabled title="Add a subject first"' : ''}>${icons.folder} New folder</button>` : ''}${room.can_upload ? `<button class="button button-primary" data-action="upload" ${subjectMissing ? 'disabled title="Add a subject first"' : ''}>${icons.upload} Upload material</button>` : ''}<button class="button button-secondary" data-action="admin-room">Manage classroom</button>` : ''}</div></div><div class="materials-panel"><div class="panel-top"><div><span class="eyebrow">SUBJECT</span><h2>${esc(subject?.name || 'Select a subject')}</h2></div><div class="material-count">${folders.length + materials.length} items</div></div>${subjectMissing ? noSubjectState : `<div class="crumb-trail"><button data-folder="root">All ${esc(subject.name)}</button>${breadcrumbs.map(f => `<span>›</span><button data-folder="${esc(f.id)}">${esc(f.name)}</button>`).join('')}</div><div class="file-list">${folders.map(folderRow).join('')}${materials.map(materialRow).join('')}${!folders.length && !materials.length ? `<div class="folder-empty"><span>${icons.folder}</span><b>This folder is empty.</b><small>${room.can_upload ? 'Add a folder or upload a file to get started.' : 'Materials added to this subject will show up here.'}</small></div>` : ''}</div>`}</div><div class="student-share-note"><span class="share-lock">${icons.lock}</span><div><b>Students open this classroom with its share link.</b><p>They can browse and download class materials without signing in. Classroom teachers can rotate that link. Anyone who receives it can view and download materials.</p></div></div></section><input id="file-input" type="file" hidden></main></div>`
  bindGlobal(); document.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => { state.activeSubject = button.dataset.subject; state.folder = null; state.query = ''; renderClassroom() })); document.querySelectorAll('[data-folder]').forEach(button => button.addEventListener('click', () => { state.folder = button.dataset.folder === 'root' ? null : button.dataset.folder; renderClassroom() }));
  document.querySelector('#search-input').addEventListener('input', event => { const cursor = event.target.selectionStart; state.query = event.target.value; renderClassroom(); const input = document.querySelector('#search-input'); input.focus(); input.setSelectionRange(cursor, cursor) })
  document.querySelector('#file-input').addEventListener('change', uploadFile)
  document.querySelectorAll('[data-download]').forEach(button => button.addEventListener('click', () => downloadMaterial(button.dataset.download)))
  document.querySelectorAll('[data-rename]').forEach(button => button.addEventListener('click', () => renameMaterial(button.dataset.rename)))
  document.querySelectorAll('[data-remove-material]').forEach(button => button.addEventListener('click', () => removeMaterial(button.dataset.removeMaterial)))
  document.querySelectorAll('[data-remove-folder]').forEach(button => button.addEventListener('click', () => removeFolder(button.dataset.removeFolder)))
}
function folderBreadcrumbs(id) { const chain = []; let folder = state.folders.find(item => item.id === id); while (folder) { chain.unshift(folder); folder = state.folders.find(item => item.id === folder.parent_id) } return chain }
function folderRow(folder) { return `<div class="file-row folder-row-wrap"><button class="folder-open" data-open-folder="${esc(folder.id)}"><span class="file-icon folder-file">${icons.folder}</span><span class="file-name"><b>${esc(folder.name)}</b><small>Folder</small></span><span class="file-row-arrow">${icons.arrow}</span></button>${state.classroom.can_manage_content ? `<button class="item-delete" data-remove-folder="${esc(folder.id)}">Delete</button>` : ''}</div>` }
function materialRow(file) { return `<div class="file-row"><span class="file-icon ${fileIcon(file.mime_type)}">${fileIconSvg(file.mime_type)}</span><span class="file-name"><b>${esc(file.title)}</b><small>${esc(file.file_name)} · ${formatSize(file.file_size)}</small></span><span class="file-date">${new Date(file.created_at).toLocaleDateString()}</span>${state.classroom.can_manage_content ? `<button class="item-delete" data-rename="${esc(file.id)}">Rename</button><button class="item-delete" data-remove-material="${esc(file.id)}">Delete</button>` : ''}<button class="download-button" data-download="${esc(file.id)}">Download ${icons.arrow}</button></div>` }
function fileIcon(mime) { return mime?.includes('pdf') ? 'pdf-icon' : mime?.startsWith('image/') ? 'image-icon' : 'doc-icon' }
function fileIconSvg(mime) { return mime?.includes('pdf') ? '<span>PDF</span>' : mime?.startsWith('image/') ? '<span>IMG</span>' : '<span>DOC</span>' }
function studentCanPreview(file) { const type = (file.mime_type || '').toLowerCase(); return type === 'application/pdf' || /^image\/(png|jpeg|gif|webp|avif)$/.test(type) || /^audio\/(mpeg|mp3|ogg|wav|webm|aac|mp4)$/.test(type) || /^video\/(mp4|webm|ogg|quicktime)$/.test(type) || type === 'text/plain' }
function formatSize(size = 0) { if (!size) return 'File'; const units = ['B', 'KB', 'MB', 'GB']; let n = size, i = 0; while (n > 1024 && i < 3) { n /= 1024; i++ } return `${n.toFixed(i ? 1 : 0)} ${units[i]}` }
async function uploadFile(event) {
  const file = event.target.files[0]; if (!file || !state.classroom) return
  if (!state.activeSubject) return toast('Add or select a subject before uploading materials.', true)
  const path = `${state.classroom.id}/${crypto.randomUUID()}/${file.name.replaceAll('/', '_')}`; toast('Uploading your material…')
  const { error: storageError } = await supabase.storage.from('class-materials').upload(path, file, { upsert: false })
  if (storageError) { toast(storageError.message, true); return }
  const { error } = await supabase.from('materials').insert({ classroom_id: state.classroom.id, subject_id: state.activeSubject, folder_id: state.folder, uploaded_by: state.session.user.id, title: file.name.replace(/\.[^.]+$/, ''), file_name: file.name, storage_path: path, file_size: file.size, mime_type: file.type || 'application/octet-stream' })
  if (error) { await supabase.storage.from('class-materials').remove([path]); toast(error.message, true); return }
  toast('Material uploaded.'); await loadClassroom()
}
async function downloadMaterial(id) {
  const material = state.materials.find(file => file.id === id); if (!material) return
  const { data, error } = await supabase.storage.from('class-materials').createSignedUrl(material.storage_path, 90, { download: material.file_name })
  if (error) return toast(error.message, true)
  window.open(data.signedUrl, '_blank', 'noopener')
}
async function renameMaterial(id) { const material = state.materials.find(file => file.id === id); const title = prompt('Material title', material?.title || ''); if (!title?.trim()) return; const { error } = await supabase.from('materials').update({ title: title.trim() }).eq('id', id); if (error) return toast(error.message, true); await loadClassroom() }
async function removeMaterial(id) { const material = state.materials.find(file => file.id === id); if (!material || !confirm(`Delete ${material.file_name}?`)) return; const { error: storageError } = await supabase.storage.from('class-materials').remove([material.storage_path]); if (storageError) return toast(storageError.message, true); const { error } = await supabase.from('materials').delete().eq('id', id); if (error) return toast(error.message, true); toast('Material deleted.'); await loadClassroom() }
async function removeFolder(id) { const folder = state.folders.find(item => item.id === id); if (!folder || !confirm(`Delete ${folder.name} and everything inside it?`)) return; const ids = new Set([id]); let changed = true; while (changed) { changed = false; for (const item of state.folders) if (ids.has(item.parent_id) && !ids.has(item.id)) { ids.add(item.id); changed = true } } const paths = state.materials.filter(file => ids.has(file.folder_id)).map(file => file.storage_path); if (paths.length) { const { error } = await supabase.storage.from('class-materials').remove(paths); if (error) return toast(error.message, true) } const { error } = await supabase.from('folders').delete().eq('id', id); if (error) return toast(error.message, true); state.folder = ids.has(state.folder) ? null : state.folder; toast('Folder and its contents deleted.'); await loadClassroom() }
async function makeFolder() {
  if (!state.activeSubject || !state.subjects.some(subject => subject.id === state.activeSubject)) return toast('Add or select a subject before creating a folder.', true)
  const dialog = showDialog('Create a folder', `Inside ${state.subjects.find(subject => subject.id === state.activeSubject)?.name || 'this subject'}`, `<form id="folder-form"><label for="folder-name">Folder name</label><input id="folder-name" maxlength="100" placeholder="For example, Lecture notes" required><div class="dialog-error" role="alert"></div><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Create folder</button></div></form>`)
  const form = dialog.querySelector('#folder-form'), input = dialog.querySelector('#folder-name'), submit = form.querySelector('[type="submit"]')
  form.addEventListener('submit', async event => { event.preventDefault(); const name = input.value.trim(); if (!name) return input.focus(); submit.disabled = true; submit.textContent = 'Creating…'; form.querySelector('.dialog-error').textContent = ''; const { error } = await supabase.from('folders').insert({ classroom_id: state.classroom.id, subject_id: state.activeSubject, parent_id: state.folder, name }); if (error) { submit.disabled = false; submit.textContent = 'Create folder'; form.querySelector('.dialog-error').textContent = error.message; return } dialog.remove(); toast('Folder created.'); await loadClassroom() })
}
function bindGlobal() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) return
  document.querySelectorAll('[data-action="home"]').forEach(node => node.addEventListener('click', event => { event.preventDefault(); state.classroom = null; state.folder = null; state.query = ''; dashboard() }))
  document.querySelectorAll('[data-action="signout"]').forEach(node => node.addEventListener('click', () => supabase.auth.signOut()))
  document.querySelectorAll('[data-room]').forEach(node => node.addEventListener('click', async () => { state.classroom = state.classrooms.find(room => room.id === node.dataset.room); state.folder = null; state.activeSubject = null; await loadClassroom() }))
  document.querySelectorAll('[data-open-folder]').forEach(node => node.addEventListener('click', () => { state.folder = node.dataset.openFolder; renderClassroom() }))
  document.querySelectorAll('[data-action="join"]').forEach(node => node.addEventListener('click', joinClassroom))
  document.querySelectorAll('[data-action="upload"]').forEach(node => node.addEventListener('click', () => document.querySelector('#file-input').click()))
  document.querySelectorAll('[data-action="new-folder"]').forEach(node => node.addEventListener('click', makeFolder))
  document.querySelectorAll('[data-action="add-subject"]').forEach(node => node.addEventListener('click', addSubject))
  document.querySelectorAll('[data-action="create-class"]').forEach(node => node.addEventListener('click', createClassroom))
  document.querySelectorAll('[data-action="admin-room"]').forEach(node => node.addEventListener('click', manageClassroomAccess))
}
async function joinClassroom() {
  const dialog = showDialog('Join a classroom', 'Enter the teacher join code shared by a colleague or college admin.', `<form id="join-classroom-form" class="dialog-form"><label>Teacher join code<input name="code" autocomplete="off" maxlength="40" placeholder="Paste your classroom code" required></label><div class="dialog-error" role="alert"></div><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Join classroom</button></div></form>`)
  const form = dialog.querySelector('#join-classroom-form')
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const code = new FormData(form).get('code').trim()
    const submit = form.querySelector('[type="submit"]')
    const errorBox = form.querySelector('.dialog-error')
    submit.disabled = true; submit.textContent = 'Joining…'; errorBox.textContent = ''
    const { data, error } = await supabase.rpc('accept_teacher_invite', { invite_code: code })
    if (error) { submit.disabled = false; submit.textContent = 'Join classroom'; errorBox.textContent = error.message; return }
    dialog.remove(); toast(data?.message || 'Classroom joined.'); await loadApp()
  })
}
async function adminRequest(body) {
  const { data, error } = await supabase.functions.invoke('classroom-admin', { body })
  if (error) {
    // Supabase wraps non-2xx function responses. Read the function's JSON body
    // so the UI can show the actionable reason (for example duplicate username).
    let message = error.message || 'The request failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (typeof payload?.error === 'string' && payload.error) message = payload.error
      }
    } catch { /* Keep Supabase's fallback message if the response has no JSON body. */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
async function teacherJoinCode(action = 'get') {
  const { data, error } = await supabase.functions.invoke('teacher-join-code', { body: { action, classroom_id: state.classroom.id } })
  if (error) {
    let message = error.message || 'The request failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (typeof payload?.error === 'string' && payload.error) message = payload.error
      }
    } catch { /* Keep Supabase's fallback message if the response has no JSON body. */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
function showDialog(title, description, content) {
  document.querySelector('#app-dialog')?.remove()
  const dialog = document.createElement('div'); dialog.id = 'app-dialog'; dialog.className = 'modal-backdrop'
  dialog.innerHTML = `<section class="subject-dialog action-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><span class="eyebrow">${esc(state.classroom?.name || 'Can Notes')}</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${content}</section>`
  document.body.append(dialog)
  dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.remove() })
  dialog.querySelector('input:not([type="checkbox"]),select,button')?.focus()
  return dialog
}
function showActionResult(title, description, value, label) {
  const classroomName = state.classroom?.name || 'Can Notes classroom'
  const subject = label === 'Join code' ? `Join ${classroomName} on Can Notes` : `Class materials for ${classroomName}`
  const shareText = label === 'Join code'
    ? `Join ${classroomName} on Can Notes. Sign in as a teacher, then enter this classroom code: ${value}. Only share it with trusted teachers: anyone with the code can join with full teacher access. It stays the same until a classroom teacher rotates it.`
    : `Open ${classroomName} class materials in Can Notes: ${value}\n\nAnyone with this link can view and download the classroom materials.`
  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText)}`
  const dialog = showDialog(title, description, `<label for="result-value">${esc(label)}</label><textarea id="result-value" class="result-value" readonly>${esc(value)}</textarea><div class="share-actions"><a class="button button-secondary" href="${whatsAppUrl}" target="_blank" rel="noopener noreferrer">Share with WhatsApp</a><a class="button button-secondary" href="${gmailUrl}" target="_blank" rel="noopener noreferrer">Share with Gmail</a><button class="button button-primary" type="button" data-copy-value>Copy</button></div><div class="subject-dialog-actions share-close"><button class="button button-secondary" type="button" data-close-dialog>Close</button></div>`)
  dialog.querySelector('[data-copy-value]').addEventListener('click', async event => { try { await navigator.clipboard.writeText(value); event.currentTarget.textContent = 'Copied' } catch { dialog.querySelector('#result-value').select() } })
}
function openTeacherInviteDialog() {
  const dialog = showDialog('Invite a teacher', 'They’ll receive an email to set a password and join this classroom. Every classroom teacher gets full access here.', `<form id="teacher-invite-form" class="dialog-form"><label>Teacher full name<input name="display_name" maxlength="100" required></label><label>Username<input name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]{3,40}" required></label><label>Email for invitation and recovery<input name="email" type="email" required></label><div class="dialog-error" role="alert"></div><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Send invitation</button></div></form>`)
  const form = dialog.querySelector('#teacher-invite-form')
  form.addEventListener('submit', async event => { event.preventDefault(); const values = new FormData(form), submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Sending…'; try { const result = await adminRequest({ action: 'invite_teacher', display_name: values.get('display_name').trim(), username: values.get('username').trim(), email: values.get('email').trim(), classroom_id: state.classroom.id, can_upload: values.has('can_upload'), can_manage_content: values.has('can_manage_content') }); dialog.remove(); toast(result.message) } catch (error) { submit.disabled = false; submit.textContent = 'Send invitation'; form.querySelector('.dialog-error').textContent = error.message } })
}
function openEditClassroomDialog() {
  const room = state.classroom, yearOptions = years.map(year => `<option ${room.academic_year === year ? 'selected' : ''}>${esc(year)}</option>`).join('')
  const dialog = showDialog('Edit classroom', 'Update the name, year, branch, section or description.', `<form id="edit-classroom-form" class="dialog-form"><label>Classroom name<input name="name" value="${esc(room.name)}" required></label><label>Academic year<select name="academic_year">${yearOptions}</select></label><label>Branch<input name="branch" value="${esc(room.branch)}" required></label><label>Section<input name="section" value="${esc(room.section || '')}"></label><label>Description<textarea name="description" rows="3">${esc(room.description || '')}</textarea></label><div class="dialog-error" role="alert"></div><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Save changes</button></div></form>`)
  const form = dialog.querySelector('#edit-classroom-form')
  form.addEventListener('submit', async event => { event.preventDefault(); const values = new FormData(form), submit = form.querySelector('[type="submit"]'); submit.disabled = true; try { const result = await adminRequest({ action: 'update_classroom', classroom_id: room.id, name: values.get('name').trim(), academic_year: values.get('academic_year'), branch: values.get('branch').trim(), section: values.get('section').trim(), description: values.get('description').trim() }); dialog.remove(); toast(result.message); await loadApp() } catch (error) { submit.disabled = false; form.querySelector('.dialog-error').textContent = error.message } })
}
async function openTeacherManager() {
  const dialog = showDialog('Classroom teachers', 'Every teacher has full access in this classroom. Remove someone here if needed.', '<div class="dialog-loading">Loading teachers…</div>')
  try {
    const { teachers } = await adminRequest({ action: 'list_teachers', classroom_id: state.classroom.id })
    if (!teachers.length) { dialog.querySelector('.dialog-loading').textContent = 'No teachers have joined this classroom yet.'; return }
    const list = dialog.querySelector('.dialog-loading'); list.className = 'teacher-list'; list.innerHTML = teachers.map((teacher, index) => `<button class="teacher-list-row" data-teacher-index="${index}"><span><b>${esc(teacher.profiles?.display_name || teacher.profiles?.username || 'Teacher')}</b><small>@${esc(teacher.profiles?.username || 'no username')} · Upload ${teacher.can_upload ? 'on' : 'off'} · Manage ${teacher.can_manage_content ? 'on' : 'off'}</small></span><span>›</span></button>`).join('')
    list.querySelectorAll('[data-teacher-index]').forEach(button => button.addEventListener('click', () => openTeacherPermissionsDialog(teachers[Number(button.dataset.teacherIndex)])))
  } catch (error) { dialog.querySelector('.dialog-loading').textContent = error.message }
}
function openTeacherPermissionsDialog(teacher) {
  const name = teacher.profiles?.display_name || teacher.profiles?.username || 'Teacher'
  const dialog = showDialog(`Manage ${name}`, 'All teachers have full access to classrooms they join.', `<div class="subject-dialog-actions"><button class="button button-danger" type="button" data-remove-teacher>Remove from classroom</button><button class="button button-secondary" type="button" data-close-dialog>Close</button></div>`)
  dialog.querySelector('[data-remove-teacher]').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; try { const result = await adminRequest({ action: 'remove_teacher', classroom_id: state.classroom.id, user_id: teacher.user_id }); dialog.remove(); toast(result.message); await loadClassroom() } catch (error) { button.disabled = false; toast(error.message, true) } })
}
async function createClassroom() {
  const yearOptions = years.map((year, index) => `<option value="${esc(year)}" ${index === 0 ? 'selected' : ''}>${esc(year)}</option>`).join('')
  const dialog = showDialog('Create a classroom', 'Choose the year, branch and section. You will have full teacher access.', `<form id="create-classroom-form" class="dialog-form"><label>Classroom name<input name="name" maxlength="120" placeholder="For example, First Year CSE 1" required></label><label>Academic year<select name="academic_year">${yearOptions}</select></label><label>Branch<input name="branch" maxlength="80" placeholder="CSE or ECE" required></label><label>Section<input name="section" maxlength="40" placeholder="1, 2, A, B (optional)"></label><div class="dialog-error" role="alert"></div><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">Create classroom</button></div></form>`)
  const form = dialog.querySelector('#create-classroom-form')
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const values = new FormData(form), submit = form.querySelector('[type="submit"]'), errorBox = form.querySelector('.dialog-error')
    const name = values.get('name').trim(), academic_year = values.get('academic_year'), branch = values.get('branch').trim(), section = values.get('section').trim()
    submit.disabled = true; submit.textContent = 'Creating…'; errorBox.textContent = ''
    const { error } = await supabase.rpc('create_classroom_for_teacher', { p_name: name, p_academic_year: academic_year, p_branch: branch, p_section: section })
    if (error) { submit.disabled = false; submit.textContent = 'Create classroom'; errorBox.textContent = error.message; return }
    dialog.remove(); toast('Classroom created. You have full teacher access.'); await loadApp()
  })
}
async function manageClassroomAccessLegacy() {
  const choice = prompt('Choose an action:\n1 — Invite a teacher by email and set permissions\n2 — Create a teacher join code\n3 — Create or rotate the student link\n4 — Edit classroom details\n5 — Delete classroom and its files\n6 — Manage teachers and permissions')
  if (!choice) return
  try {
    if (choice === '1') { const display_name = prompt('Teacher full name'); if (!display_name?.trim()) return; const username = prompt('Teacher username (3–40 characters)'); if (!username?.trim()) return; const email = prompt('Teacher email for invitation and password recovery'); if (!email?.trim()) return; const can_upload = confirm('Allow this teacher to upload materials?'); const can_manage_content = confirm('Allow this teacher to create and manage subjects, folders and materials?'); const result = await adminRequest({ action: 'invite_teacher', display_name, username, email, classroom_id: state.classroom.id, can_upload, can_manage_content }); toast(result.message); return }
    if (choice === '2') { const result = await teacherJoinCode(); await navigator.clipboard?.writeText(result.code).catch(() => {}); alert(`Teacher classroom join code (same code until rotated):\n\n${result.code}\n\nShare only with trusted teachers; anyone with it can join with full teacher access. It was copied when clipboard access was available.`); return }
    if (choice === '3') { const result = await adminRequest({ action: 'rotate_student_link', classroom_id: state.classroom.id }); await navigator.clipboard?.writeText(result.link).catch(() => {}); alert(`New student classroom link (the previous link is now revoked):\n\n${result.link}\n\nAnyone with this link can browse and download this classroom’s materials. It was copied when clipboard access was available.`); return }
    if (choice === '4') { const name = prompt('Classroom name', state.classroom.name); if (!name?.trim()) return; const academic_year = prompt('Academic year: 1st Year, 2nd Year, 3rd Year or 4th Year', state.classroom.academic_year); if (!years.includes(academic_year)) return toast('Choose one of the four academic years.', true); const branch = prompt('Branch', state.classroom.branch); if (!branch?.trim()) return; const section = prompt('Section (leave blank for none)', state.classroom.section || ''); if (section === null) return; const result = await adminRequest({ action: 'update_classroom', classroom_id: state.classroom.id, name, academic_year, branch, section }); toast(result.message); await loadApp(); return }
    if (choice === '5') { if (!confirm(`Permanently delete ${state.classroom.name}, its subjects and uploaded files? This cannot be undone.`)) return; const result = await adminRequest({ action: 'delete_classroom', classroom_id: state.classroom.id }); toast(result.message); state.classroom = null; await loadApp(); return }
    if (choice === '6') { const { teachers } = await adminRequest({ action: 'list_teachers', classroom_id: state.classroom.id }); if (!teachers.length) return toast('No teachers have joined this classroom yet.'); const list = teachers.map((item, i) => `${i + 1}. ${item.profiles?.display_name || item.profiles?.username || item.user_id} (@${item.profiles?.username || 'no username'}) — upload: ${item.can_upload ? 'yes' : 'no'}, manage: ${item.can_manage_content ? 'yes' : 'no'}`).join('\n'); const pick = Number(prompt(`Choose a teacher number:\n\n${list}\n\nEnter 1–${teachers.length}`)) - 1; const selected = teachers[pick]; if (!selected) return; const operation = prompt('Enter 1 to update permissions or 2 to remove from this classroom.'); if (operation === '1') { const can_upload = confirm('Allow this teacher to upload materials?'); const can_manage_content = confirm('Allow this teacher to manage subjects, folders and materials?'); const result = await adminRequest({ action: 'update_teacher_permissions', classroom_id: state.classroom.id, user_id: selected.user_id, can_upload, can_manage_content }); toast(result.message); return } if (operation === '2' && confirm(`Remove ${selected.profiles?.display_name || selected.profiles?.username} from this classroom?`)) { const result = await adminRequest({ action: 'remove_teacher', classroom_id: state.classroom.id, user_id: selected.user_id }); toast(result.message); await loadClassroom(); return } }
  } catch (error) { toast(error.message, true) }
}
function manageClassroomAccess() {
  const choices = [
    ['invite', 'Invite a teacher', 'Invite a colleague to this classroom'],
    ['code', 'Get teacher join code', 'Reusable by teachers; full access until rotated'],
    ['rotate-teacher-code', 'Rotate teacher join code', 'Replace the old code if it was shared too widely'],
    ['student-link', 'Get classroom student link', 'Copy the same link for this classroom'],
    ['rotate-student-link', 'Rotate student link', 'Invalidate the old link and create a new one'],
    ['revoke-student-link', 'Revoke student link', 'Stop access through the current student link'],
    ['edit', 'Edit classroom details', 'Change the name, year, branch or section'],
    ['teachers', 'Manage teachers', 'Review or remove classroom members'],
    ['delete', 'Delete classroom', 'Remove this classroom and uploaded files'],
  ]
  const dialog = showDialog('Manage classroom access', 'Choose what you want to do.', `<div class="admin-action-list">${choices.map(([id, title, detail]) => `<button class="admin-action-row" data-admin-choice="${id}"><span><b>${esc(title)}</b><small>${esc(detail)}</small></span><span>›</span></button>`).join('')}</div>`)
  dialog.querySelectorAll('[data-admin-choice]').forEach(button => button.addEventListener('click', async () => {
    const choice = button.dataset.adminChoice; dialog.remove()
    if (choice === 'invite') return openTeacherInviteDialog()
    if (choice === 'edit') return openEditClassroomDialog()
    if (choice === 'teachers') return openTeacherManager()
    if (choice === 'code') { try { const result = await teacherJoinCode(); return showActionResult('Teacher join code', result.reused ? 'This is the same reusable code for this classroom. It stays active until you rotate it.' : 'Share this reusable code with teachers joining this classroom. It stays active until you rotate it.', result.code, 'Join code') } catch (error) { return toast(error.message, true) } }
    if (choice === 'rotate-teacher-code') return openTeacherCodeRotation()
    if (choice === 'student-link') return getStudentLink()
    if (choice === 'rotate-student-link') return openStudentLinkConfirmation('rotate')
    if (choice === 'revoke-student-link') return openStudentLinkConfirmation('revoke')
    if (choice === 'delete') return openDeleteClassroomConfirmation()
  }))
}
function openTeacherCodeRotation() {
  const dialog = showDialog('Rotate teacher join code?', 'The current code will stop working. Teachers already in this classroom will keep their access.', `<div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Keep current code</button><button class="button button-primary" type="button" data-confirm-teacher-code>Rotate code</button></div>`)
  dialog.querySelector('[data-confirm-teacher-code]').addEventListener('click', async event => {
    event.currentTarget.disabled = true; event.currentTarget.textContent = 'Rotating…'
    try {
      const result = await teacherJoinCode('rotate')
      dialog.remove()
      showActionResult('New teacher join code', 'The previous code no longer works. This new code will stay active until you rotate it again.', result.code, 'Join code')
    } catch (error) {
      dialog.remove(); toast(error.message, true)
    }
  })
}
async function getStudentLink() {
  try {
    const result = await adminRequest({ action: 'get_student_link', classroom_id: state.classroom.id })
    showActionResult('Classroom student link', result.replacedPrevious ? 'This classroom had an older, one-time link. Share this permanent classroom link going forward.' : 'This same link remains active until you rotate or revoke it. Forwarded links grant access.', result.link, 'Student link')
  } catch (error) { toast(error.message, true) }
}
function openStudentLinkConfirmation(action) {
  const isRotate = action === 'rotate'
  const title = isRotate ? 'Rotate student link?' : 'Revoke student link?'
  const description = isRotate
    ? 'The link currently shared with students will stop working. You will get a new link for this classroom.'
    : 'Students will lose access through the current link. You can create a new classroom link later.'
  const buttonText = isRotate ? 'Rotate link' : 'Revoke link'
  const dialog = showDialog(title, description, `<div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button ${isRotate ? 'button-primary' : 'button-danger'}" type="button" data-confirm-link>${buttonText}</button></div>`)
  dialog.querySelector('[data-confirm-link]').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = isRotate ? 'Rotating…' : 'Revoking…'
    try {
      const result = await adminRequest({ action: isRotate ? 'rotate_student_link' : 'revoke_student_link', classroom_id: state.classroom.id })
      dialog.remove()
      if (isRotate) showActionResult('New student link ready', 'Share this link with the classroom. The old link is now revoked.', result.link, 'Student link')
      else toast(result.message)
    } catch (error) { button.disabled = false; button.textContent = buttonText; toast(error.message, true) }
  })
}
function openDeleteClassroomConfirmation() {
  const room = state.classroom
  const dialog = showDialog('Delete this classroom?', `This permanently deletes ${room.name}, its subjects, folders and uploaded files.`, '<div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-danger" type="button" data-confirm-delete>Delete classroom</button></div>')
  dialog.querySelector('[data-confirm-delete]').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; button.textContent = 'Deleting…'; try { const result = await adminRequest({ action: 'delete_classroom', classroom_id: room.id }); dialog.remove(); toast(result.message); state.classroom = null; await loadApp() } catch (error) { button.disabled = false; button.textContent = 'Delete classroom'; toast(error.message, true) } })
}
async function addSubject() {
  if (!state.classroom?.can_manage_content) return toast('Ask your classroom admin to add a subject.', true)
  if (document.querySelector('#subject-modal')) return
  const modal = document.createElement('div')
  modal.id = 'subject-modal'; modal.className = 'modal-backdrop'
  modal.innerHTML = `<form class="subject-dialog" id="subject-form"><span class="eyebrow">${esc(state.classroom.name)}</span><h2>Add a subject</h2><p>Folders and materials in this classroom are organized by subject.</p><label for="subject-name">Subject name</label><input id="subject-name" name="subject" maxlength="80" placeholder="For example, Data Structures" required><div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-subject>Cancel</button><button class="button button-primary" type="submit">Create subject</button></div></form>`
  document.body.append(modal)
  const input = modal.querySelector('#subject-name')
  input.focus()
  modal.querySelector('[data-close-subject]').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove() })
  modal.querySelector('#subject-form').addEventListener('submit', async event => {
    event.preventDefault()
    const name = input.value.trim()
    if (!name) return input.focus()
    const submit = modal.querySelector('button[type="submit"]')
    submit.disabled = true; submit.textContent = 'Creating…'
    const { error } = await supabase.from('subjects').insert({ classroom_id: state.classroom.id, name })
    if (error) { submit.disabled = false; submit.textContent = 'Create subject'; return toast(error.message, true) }
    modal.remove(); toast('Subject added.'); await loadClassroom()
  })
}
function studentScreen(message, allowInstall = false) {
  app.innerHTML = `<main class="student-wrap"><header class="student-top"><a href="/" class="brand-lockup"><span class="brand-mark"><img src="/icons/can-notes-mark.svg" alt=""></span><span>CAN NOTES</span></a><div class="student-top-actions">${allowInstall ? '<button class="button button-secondary student-install" id="install-student-app" type="button">Install app</button>' : ''}${themeToggle()}<span class="student-access">${icons.lock} Classroom link access</span></div></header><section id="student-content" class="student-content">${message}</section><footer class="student-footer">Shared by your college · <span>Anyone with this link can view this classroom’s materials.</span></footer></main>`
  const installButton = document.querySelector('#install-student-app')
  if (installButton) {
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) installButton.hidden = true
    installButton.addEventListener('click', installStudentApp)
  }
}
async function installStudentApp() {
  if (!state.studentToken) return toast('Open the classroom link before installing Can Notes.', true)
  try { localStorage.setItem(studentInstallTokenKey, state.studentToken) } catch { return toast('This browser could not save the classroom link for the installed app.', true) }
  if (deferredInstallPrompt) {
    const installPrompt = deferredInstallPrompt
    deferredInstallPrompt = null
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice?.outcome === 'accepted') toast('Can Notes is being added to your device.')
    return
  }
  const instructions = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? '<ol><li>Tap the Share button in your browser.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>'
    : '<p>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. The installed Can Notes app will open this classroom.</p>'
  showDialog('Install Can Notes', 'Keep this classroom handy on your device.', `${instructions}<div class="subject-dialog-actions"><button class="button button-primary" type="button" data-close-dialog>Got it</button></div>`)
}
async function renderStudent() {
  studentScreen('<div class="loading-card"><span class="spinner"></span><p>Opening your classroom…</p></div>')
  const { data, error } = await supabase.functions.invoke('student-access', { body: { token: state.studentToken, action: 'list' } })
  if (error || !data?.classroom) { studentScreen('<div class="not-found"><span>↗</span><h1>This classroom link was revoked or replaced.</h1><p>Ask your college or teacher for the current classroom link.</p></div>'); return }
  renderStudentContent(data)
}
function renderStudentContent(data, subjectId = null, folderId = null, chain = []) {
  const subject = data.subjects.find(s => s.id === subjectId) || data.subjects[0]; if (!subject) return studentScreen('<div class="not-found"><h1>No subjects yet.</h1><p>Materials will appear here when they’re added.</p></div>', true)
  subjectId ||= subject.id
  const folders = data.folders.filter(folder => folder.subject_id === subjectId && (folder.parent_id || null) === (folderId || null))
  const files = data.materials.filter(file => file.subject_id === subjectId && (file.folder_id || null) === (folderId || null))
  const room = data.classroom
  studentScreen(`<div class="student-heading"><div><span class="eyebrow">${esc(room.academic_year)} &nbsp;·&nbsp; ${esc(room.branch)}${room.section ? ` ${esc(room.section)}` : ''}</span><h1>${esc(room.name)}</h1><p>${esc(room.description || 'Class materials, all in one place.')}</p></div><div class="student-readonly">${icons.lock} View and preview materials</div></div><div class="student-card"><aside class="student-subjects"><span class="eyebrow">SUBJECTS</span>${data.subjects.map(item => `<button class="student-subject ${item.id === subjectId ? 'active' : ''}" data-student-subject="${esc(item.id)}">${esc(item.name)}<span>›</span></button>`).join('')}</aside><div class="student-files"><div class="student-file-head"><div><span class="eyebrow">CLASS MATERIALS</span><h2>${esc(subject.name)}</h2></div><span>${folders.length + files.length} items</span></div><div class="crumb-trail"><button data-student-root>All ${esc(subject.name)}</button>${chain.map(folder => `<span>›</span><button data-student-crumb="${esc(folder.id)}">${esc(folder.name)}</button>`).join('')}</div><div class="file-list">${folders.map(folder => `<button class="file-row folder-row" data-student-folder="${esc(folder.id)}"><span class="file-icon folder-file">${icons.folder}</span><span class="file-name"><b>${esc(folder.name)}</b><small>Folder</small></span><span class="file-row-arrow">${icons.arrow}</span></button>`).join('')}${files.map(file => `<div class="file-row"><span class="file-icon ${fileIcon(file.mime_type)}">${fileIconSvg(file.mime_type)}</span><span class="file-name"><b>${esc(file.title)}</b><small>${esc(file.file_name)} · ${formatSize(file.file_size)}</small></span><span class="student-file-actions">${studentCanPreview(file) ? `<button class="student-preview-button" data-student-preview="${esc(file.id)}">Preview</button>` : ''}<button class="download-button" data-student-download="${esc(file.id)}">Download ${icons.arrow}</button></span></div>`).join('')}${!folders.length && !files.length ? '<div class="folder-empty"><span>—</span><b>No materials in this folder yet.</b></div>' : ''}</div></div></div>`, true)
  document.querySelectorAll('[data-student-subject]').forEach(button => button.onclick = () => renderStudentContent(data, button.dataset.studentSubject))
  document.querySelectorAll('[data-student-folder]').forEach(button => button.onclick = () => { const folder = data.folders.find(item => item.id === button.dataset.studentFolder); renderStudentContent(data, subjectId, folder.id, [...chain, folder]) })
  document.querySelector('[data-student-root]')?.addEventListener('click', () => renderStudentContent(data, subjectId))
  document.querySelectorAll('[data-student-crumb]').forEach(button => button.onclick = () => { const index = chain.findIndex(f => f.id === button.dataset.studentCrumb); renderStudentContent(data, subjectId, chain[index]?.id, chain.slice(0, index + 1)) })
  document.querySelectorAll('[data-student-preview]').forEach(button => button.onclick = () => previewStudentMaterial(data.materials.find(file => file.id === button.dataset.studentPreview)))
  document.querySelectorAll('[data-student-download]').forEach(button => button.onclick = async () => { const result = await supabase.functions.invoke('student-access', { body: { token: state.studentToken, action: 'download', material_id: button.dataset.studentDownload } }); if (result.error || !result.data?.url) return toast('This material could not be opened.', true); window.open(result.data.url, '_blank', 'noopener') })
}
async function previewStudentMaterial(material) {
  if (!material || !studentCanPreview(material)) return toast('This file type needs to be downloaded to open.', true)
  const { data, error } = await supabase.functions.invoke('student-access', { body: { token: state.studentToken, action: 'download', material_id: material.id } })
  if (error || !data?.url) return toast('This material could not be previewed.', true)
  const previewUrl = new URL(data.url)
  previewUrl.searchParams.delete('download')
  const type = (material.mime_type || '').toLowerCase()
  const content = type.startsWith('image/')
    ? `<div class="preview-content"><img src="${esc(previewUrl.toString())}" alt="${esc(material.title)}"></div>`
    : type.startsWith('audio/')
      ? `<div class="preview-content"><audio src="${esc(previewUrl.toString())}" controls></audio></div>`
      : type.startsWith('video/')
        ? `<div class="preview-content"><video src="${esc(previewUrl.toString())}" controls playsinline></video></div>`
        : `<div class="preview-content"><iframe src="${esc(previewUrl.toString())}" title="${esc(material.title)}" loading="lazy"></iframe></div>`
  const dialog = showDialog(material.title, material.file_name, `${content}<div class="subject-dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Close preview</button></div>`)
  dialog.querySelector('.subject-dialog')?.classList.add('preview-dialog')
}

start().catch(error => { console.error(error); app.innerHTML = `<div class="center-state"><h2>Something interrupted the connection.</h2><p class="muted">${esc(error.message)}</p><button class="button button-secondary" onclick="location.reload()">Try again</button></div>` })
