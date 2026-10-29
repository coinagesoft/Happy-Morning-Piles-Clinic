'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Doctor = { id: string; name: string; email: string; active: boolean; locationId?: string | null; location?: string };
type Location = { id: string; name: string; address?: string; active: boolean };
type ClinicAppointment = { id: string; fullName: string; date: string; time: string; assignedDoctorId?: string | null; assignedDoctorName?: string; status?: string };
type ScheduleEntry = { id?: string; doctor_id?: string; location_id?: string; location_name?: string; weekday: number; start_time: string; end_time: string; slot_duration: number; active?: boolean };

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminTeamTab({ adminFetch, userRole }: { adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; userRole: string }) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [assignmentDoctor, setAssignmentDoctor] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorPassword, setDoctorPassword] = useState('');
  const [doctorLocation, setDoctorLocation] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin';

  const load = useCallback(async () => {
    const [teamRes, scheduleRes, appointmentsRes] = await Promise.all([
      adminFetch('/api/admin/doctors', { cache: 'no-store' }),
      adminFetch(`/api/admin/schedule${selectedDoctor ? `?doctorId=${encodeURIComponent(selectedDoctor)}` : ''}`, { cache: 'no-store' }),
      adminFetch('/api/admin/appointments?_t=${Date.now()}&fresh=true', { cache: 'no-store' }),
    ]);
    const team = await teamRes.json();
    const scheduleData = await scheduleRes.json();
    const appointmentData = await appointmentsRes.json();
    if (appointmentsRes.ok) setAppointments(Array.isArray(appointmentData.appointments) ? appointmentData.appointments : []);
    if (teamRes.ok) {
      setDoctors(Array.isArray(team.doctors) ? team.doctors : []);
      setLocations(Array.isArray(team.locations) ? team.locations : []);
      if (!selectedDoctor && team.doctors?.length) setSelectedDoctor(team.doctors.find((d: Doctor) => d.active)?.id || team.doctors[0].id);
    }
    if (scheduleRes.ok) setSchedule(Array.isArray(scheduleData.schedule) ? scheduleData.schedule.map((s: Record<string, unknown>) => ({ id: String(s.id), doctor_id: String(s.doctor_id), location_id: String(s.location_id), location_name: String(s.location_name || ''), weekday: Number(s.weekday), start_time: String(s.start_time), end_time: String(s.end_time), slot_duration: Number(s.slot_duration), active: Boolean(s.active) })) : []);
  }, [adminFetch, selectedDoctor]);

  useEffect(() => { void load().catch(() => setMessage('Unable to load team data.')); }, [load]);

  async function addDoctor(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const res = await adminFetch('/api/admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: doctorName, email: doctorEmail, password: doctorPassword, locationId: doctorLocation || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add doctor.');
      setDoctorName(''); setDoctorEmail(''); setDoctorPassword(''); setDoctorLocation(''); setSelectedDoctor(data.doctor.id); setMessage('Doctor account created. The doctor can now sign in with the email and password.'); await load();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function addLocation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const res = await adminFetch('/api/admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'location', name: locationName, address: locationAddress }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not add location.');
      setLocationName(''); setLocationAddress(''); setScheduleLocation(data.location.id); setDoctorLocation(data.location.id); setMessage('Clinic location added.'); await load();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function addScheduleEntry() {
    if (!selectedDoctor || !scheduleLocation) { setMessage('Choose a doctor and location first.'); return; }
    const entry: ScheduleEntry = { weekday: day, start_time: start, end_time: end, slot_duration: slotDuration, location_id: scheduleLocation, location_name: locations.find(l => l.id === scheduleLocation)?.name || '' };
    setSchedule(prev => [...prev, entry]); setMessage('Schedule row added locally. Click Save Schedule to persist it.');
  }

  async function saveSchedule() {
    if (!selectedDoctor) return setMessage('Select a doctor first.');
    setBusy(true); setMessage('');
    try {
      const entries = schedule.map(s => ({ locationId: s.location_id, weekday: Number(s.weekday), startTime: s.start_time, endTime: s.end_time, slotDuration: Number(s.slot_duration), active: s.active !== false }));
      const res = await adminFetch('/api/admin/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId: selectedDoctor, entries }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not save schedule.');
      setMessage('Doctor schedule saved.'); await load();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function assignAppointment(appointmentId: string) {
    const doctorId = userRole === 'doctor' ? undefined : assignmentDoctor[appointmentId];
    if (userRole !== 'doctor' && !doctorId) { setMessage('Choose a doctor before assigning this patient.'); return; }
    setBusy(true); setMessage('');
    try {
      const res = await adminFetch('/api/admin/appointments/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId, doctorId }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not assign patient.');
      setMessage(`Patient assigned to ${data.assignedDoctorName}.`); await load();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function deactivateDoctor(id: string) {
    if (!confirm('Deactivate this doctor login? Existing appointments will be retained.')) return;
    const res = await adminFetch(`/api/admin/doctors/${id}`, { method: 'DELETE' }); const data = await res.json();
    if (!res.ok) setMessage(data.error || 'Could not deactivate doctor.'); else { setMessage('Doctor deactivated.'); await load(); }
  }

  const field: React.CSSProperties = { width: '100%', minHeight: 42, padding: '9px 11px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', color: '#0F172A' };
  const card: React.CSSProperties = { border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, background: '#fff', minWidth: 0 };
  const button: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: 0, background: '#176B4D', color: '#fff', fontWeight: 700, cursor: 'pointer' };

  return <section style={{ display: 'grid', gap: 18, paddingBottom: 30 }}>
    <header><h2 style={{ margin: 0, fontSize: 24, color: '#0F172A' }}>Doctors &amp; Schedules</h2><p style={{ margin: '6px 0 0', color: '#64748B' }}>Manage doctor logins, clinic locations, and weekly availability. No public doctor profile is created.</p></header>
    {message && <div role="status" style={{ padding: 12, borderRadius: 8, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>{message}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
      {isSuperAdmin && <form onSubmit={addDoctor} style={card}>
        <h3 style={{ marginTop: 0 }}>Add doctor login</h3>
        <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>Doctor name<input required minLength={2} value={doctorName} onChange={e => setDoctorName(e.target.value)} style={field} placeholder="Dr. First Last" /></label>
        <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>Email<input required type="email" value={doctorEmail} onChange={e => setDoctorEmail(e.target.value)} style={field} placeholder="doctor@clinic.com" /></label>
        <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>Temporary password<input required minLength={10} type="password" value={doctorPassword} onChange={e => setDoctorPassword(e.target.value)} style={field} placeholder="At least 10 characters" /></label>
        <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>Primary location<select value={doctorLocation} onChange={e => setDoctorLocation(e.target.value)} style={field}><option value="">No primary location</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button disabled={busy} style={button}>{busy ? 'Please wait…' : 'Create Doctor Login'}</button>
      </form>}
      {isSuperAdmin && <form onSubmit={addLocation} style={card}>
        <h3 style={{ marginTop: 0 }}>Add clinic location</h3>
        <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>Location name<input required value={locationName} onChange={e => setLocationName(e.target.value)} style={field} placeholder="Pune Branch" /></label>
        <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>Address (optional)<textarea value={locationAddress} onChange={e => setLocationAddress(e.target.value)} style={{ ...field, minHeight: 80 }} placeholder="Clinic address" /></label>
        <button disabled={busy} style={button}>Add Location</button>
      </form>}
    </div>
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Doctor accounts</h3>
      {doctors.length === 0 ? <p style={{ color: '#64748B' }}>No database-managed doctors yet. Add the first doctor above.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}><thead><tr>{['Doctor', 'Email', 'Location', 'Status', ...(isSuperAdmin ? ['Action'] : [])].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 12 }}>{h}</th>)}</tr></thead><tbody>{doctors.map(d => <tr key={d.id}><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{d.name}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{d.email}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{d.location || 'Not assigned'}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{d.active ? 'Active' : 'Inactive'}</td>{isSuperAdmin && <td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{d.active && <button type="button" onClick={() => void deactivateDoctor(d.id)} style={{ ...button, background: '#B91C1C', padding: '6px 10px' }}>Deactivate</button>}</td>}</tr>)}</tbody></table></div>}
    </div>
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Patient / appointment assignment</h3>
      <p style={{ marginTop: -4, color: '#64748B', fontSize: 13 }}>Reception can assign or reassign appointments. A doctor can assign an unassigned patient to themselves.</p>
      {appointments.length === 0 ? <p style={{ color: '#64748B' }}>No appointments found.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}><thead><tr>{['Patient', 'Date & time', 'Assigned doctor', 'Assign'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 12 }}>{h}</th>)}</tr></thead><tbody>{appointments.filter(a => a.status !== 'cancelled').map(a => <tr key={a.id}><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{a.fullName}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{a.date} {a.time}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>{a.assignedDoctorName || (a.assignedDoctorId ? doctors.find(d => d.id === a.assignedDoctorId)?.name : '') || 'Unassigned'}</td><td style={{ padding: 10, borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 6 }}>
        {userRole === 'doctor' ? <button type="button" style={button} disabled={busy || Boolean(a.assignedDoctorId)} onClick={() => void assignAppointment(a.id)}>{a.assignedDoctorId ? 'Assigned' : 'Assign to me'}</button> : <><select aria-label={`Doctor for ${a.fullName}`} style={{ ...field, minWidth: 140 }} value={assignmentDoctor[a.id] || a.assignedDoctorId || ''} onChange={e => setAssignmentDoctor(prev => ({ ...prev, [a.id]: e.target.value }))}><option value="">Select doctor</option>{doctors.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button type="button" style={button} disabled={busy} onClick={() => void assignAppointment(a.id)}>Assign</button></>}
      </td></tr>)}</tbody></table></div>}
    </div>
    {isSuperAdmin && <div style={card}>
      <h3 style={{ marginTop: 0 }}>Weekly doctor schedule</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 5 }}>Doctor<select style={field} value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}><option value="">Select doctor</option>{doctors.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 5 }}>Location<select style={field} value={scheduleLocation} onChange={e => setScheduleLocation(e.target.value)}><option value="">Select location</option>{locations.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 5 }}>Weekday<select style={field} value={day} onChange={e => setDay(Number(e.target.value))}>{weekdays.map((w,i) => <option key={w} value={i}>{w}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 5 }}>Start time<input type="time" style={field} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 5 }}>End time<input type="time" style={field} value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label style={{ display: 'grid', gap: 5 }}>Slot minutes<input type="number" min={5} max={240} style={field} value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))} /></label>
      </div>
      <button type="button" style={{ ...button, marginRight: 8 }} onClick={() => void addScheduleEntry()}>Add Schedule Row</button>
      <button type="button" disabled={busy || !selectedDoctor} style={{ ...button, background: '#1D4ED8' }} onClick={() => void saveSchedule()}>{busy ? 'Saving…' : 'Save Schedule'}</button>
      <div style={{ overflowX: 'auto', marginTop: 16 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}><thead><tr>{['Day', 'Location', 'Hours', 'Slot', 'Remove'].map(h => <th key={h} style={{ textAlign: 'left', padding: 9, borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 12 }}>{h}</th>)}</tr></thead><tbody>{schedule.map((s,i) => <tr key={s.id || `${s.weekday}-${s.start_time}-${i}`}><td style={{ padding: 9, borderBottom: '1px solid #F1F5F9' }}>{weekdays[s.weekday]}</td><td style={{ padding: 9, borderBottom: '1px solid #F1F5F9' }}>{s.location_name || locations.find(l => l.id === s.location_id)?.name || 'Location'}</td><td style={{ padding: 9, borderBottom: '1px solid #F1F5F9' }}>{s.start_time}–{s.end_time}</td><td style={{ padding: 9, borderBottom: '1px solid #F1F5F9' }}>{s.slot_duration} min</td><td style={{ padding: 9, borderBottom: '1px solid #F1F5F9' }}><button type="button" onClick={() => setSchedule(prev => prev.filter((_,j) => j !== i))} style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Remove</button></td></tr>)}</tbody></table></div>
      <p style={{ fontSize: 12, color: '#64748B', marginBottom: 0 }}>Saving replaces the selected doctor's complete weekly schedule with the rows shown above. Configure every required weekday before saving.</p>
    </div>}
  </section>;
}
