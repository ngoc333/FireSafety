import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveApiTarget } from './api-target';
import type { BootstrapData, OutboxEvent, Profile } from './types';

export const target = resolveApiTarget(window.location.hostname, import.meta.env.VITE_DEPLOY_TARGET);
const lanUrl = (import.meta.env.VITE_LAN_API_BASE as string | undefined)?.replace(/\/$/,'') ?? '';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null =
  target === 'internet' && supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, {auth:{persistSession:true,autoRefreshToken:true}})
    : null;

let lanSession = '';
function timeoutSignal(): AbortSignal { return AbortSignal.timeout(6000); }

async function lanRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!lanUrl) throw new Error('Chưa cấu hình VITE_LAN_API_BASE.');
  const res = await fetch(lanUrl+path, {
    ...init, signal:init?.signal ?? timeoutSignal(),
    credentials:'include',
    headers: {'Content-Type':'application/json',...(lanSession ? {'Authorization':'Bearer '+lanSession}:{}),...init?.headers}
  });
  if (!res.ok) throw new Error('LAN API HTTP '+res.status);
  return res.json() as Promise<T>;
}

async function cloudRequest<T>(action: string, body: object): Promise<T> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) throw new Error('Phiên đăng nhập Internet đã hết hạn.');
  const {data,error} = await supabase.functions.invoke('firesafety', {body:{action,...body}});
  if (error) throw new Error(error.message);
  return data as T;
}

export async function signIn(employeeId:string, password:string):Promise<Profile> {
  if (target==='lan') {
    const result = await lanRequest<{profile:Profile;accessToken?:string}>('/login',{
      method:'POST',body:JSON.stringify({employeeId})
    });
    lanSession=result.accessToken ?? '';
    return result.profile;
  }
  if (!supabase) throw new Error('Chưa cấu hình Supabase.');
  if (!password) throw new Error('Internet yêu cầu mật khẩu để bảo vệ tài khoản.');
  // Employee ID maps to an organization-provisioned email address; configure through the official IdP
  // before enabling production use. Avoid guessing an email domain from employee ID.
  if (!employeeId.includes('@')) throw new Error('Đăng nhập Internet cần email công ty và mật khẩu.');
  const {error} = await supabase.auth.signInWithPassword({email:employeeId,password});
  if (error) throw new Error(error.message);
  return cloudRequest<Profile>('me',{});
}

export async function signOut():Promise<void> {
  lanSession='';
  if (supabase) await supabase.auth.signOut();
}

export async function loadBootstrap(employeeId:string):Promise<BootstrapData> {
  if (target==='lan') return lanRequest<BootstrapData>('/bootstrap?employeeId='+encodeURIComponent(employeeId));
  return cloudRequest<BootstrapData>('bootstrap',{});
}

export async function uploadEvent(event:OutboxEvent):Promise<void> {
  const result = target==='lan'
    ? await lanRequest<{success:boolean}>('/events',{method:'POST',body:JSON.stringify(event)})
    : await cloudRequest<{success:boolean}>('event',{event});
  if (result.success !== true) throw new Error('Máy chủ chưa xác nhận đã lưu dữ liệu.');
}

async function probe(url:string):Promise<boolean> {
  if (!url) return false;
  try {
    const response=await fetch(url,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(3000)});
    return response.ok;
  } catch { return false; }
}

export async function detectConnection():Promise<'lan'|'internet'|'offline'> {
  // Probe actual endpoints, not navigator.onLine (which also reports LAN-only Wi-Fi as online).
  if (target==='lan') return await probe(lanUrl+'/health') ? 'lan' : 'offline';
  if (supabaseUrl && await probe(supabaseUrl+'/auth/v1/health')) return 'internet';
  return 'offline';
}
