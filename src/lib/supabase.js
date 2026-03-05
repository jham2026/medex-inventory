import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Njk4MTUsImV4cCI6MjA4ODI0NTgxNX0.hBnpV_fZsP1-x3mL01qFoCt4gZ0VOD-_Zwouc4u6PnY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const ADMIN_EMAIL = 'medexinventory@medexpsi.com';

export const COUNT_STATUS = {
  not_started: { label: 'Not Started', color: '#95A5A6', bg: '#f0f0f0' },
  in_progress:  { label: 'In Progress', color: '#1B6B8A', bg: '#e8f4fa' },
  submitted:    { label: 'Submitted',   color: '#F5A623', bg: '#fff8ec' },
  approved:     { label: 'Approved',    color: '#27AE60', bg: '#eafaf1' },
};
