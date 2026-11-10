import { applyBootstrap, currentEmployee, db, getMasterCursors } from './db';
import { detectConnection, loadBootstrap, uploadEvent } from './api';
import type { ConnectionMode } from './types';

export interface SyncState {
  connection: ConnectionMode; running: boolean; pending: number;
  lastSync: string; lastError: string;
}
let running=false;
let timer: ReturnType<typeof setInterval> | undefined;
const handlers=new Set<(state:SyncState)=>void>();
let state:SyncState={connection:'offline',running:false,pending:0,lastSync:'',lastError:''};
function publish(patch:Partial<SyncState>) { state={...state,...patch};handlers.forEach(x=>x({...state})); }
export function observeSync(callback:(s:SyncState)=>void) {handlers.add(callback); callback({...state});return ()=>{handlers.delete(callback);};}
export function currentSync():SyncState {return {...state};}

export async function syncNow(employeeId:string):Promise<void> {
  if (running) return;
  const employeeDB = db;
  // Never upload when signed out or use a different employee's queue.
  if (!employeeId || currentEmployee() !== employeeId) return;
  running=true;publish({running:true});
  const sameSession=()=>db===employeeDB && currentEmployee()===employeeId;
  try {
    const connection=await detectConnection();
    if (!sameSession()) return;
    publish({connection,pending:await employeeDB.outbox.count()});
    if(connection==='offline') return;
    const events=await employeeDB.outbox.orderBy('createdAt').toArray();
    for(const event of events) {
      if (!sameSession()) return;
      if (event.payload.employeeId !== employeeId) {
        throw new Error('Outbox event belongs to a different employee');
      }
      if(event.nextAttemptAt>Date.now()) continue;
      try {
        await uploadEvent(event);
        if (!sameSession()) return;
        await employeeDB.outbox.delete(event.id); // explicit server ACK required
      } catch(e) {
        if (!sameSession()) return;
        const attempts=event.attempts+1;
        await employeeDB.outbox.update(event.id,{
          attempts, lastError:e instanceof Error?e.message:String(e),
          nextAttemptAt:Date.now()+Math.min(5*60_000,Math.pow(2,attempts)*3000)
        });
        throw e;
      }
    }
    if (!sameSession()) return;
    const pending=await employeeDB.outbox.count();
    if (pending===0) {
      const data=await loadBootstrap(employeeId,await getMasterCursors());
      if (!sameSession()) return;
      await applyBootstrap(data);
      publish({lastSync:new Date().toISOString(),lastError:''});
    }
    publish({pending});
  } catch(e) {
    if (sameSession()) publish({lastError:e instanceof Error?e.message:String(e)});
  } finally {
    running=false;
    if (sameSession()) publish({running:false,pending:await employeeDB.outbox.count()});
    else publish({connection:'offline',running:false,pending:0,lastSync:'',lastError:''});
  }
}

export function startAutoSync(employeeId:()=>string) {
  if(timer) return ()=>{};
  const run=()=>{if(document.visibilityState==='visible') void syncNow(employeeId());};
  window.addEventListener('online',run);
  window.addEventListener('focus',run);
  document.addEventListener('visibilitychange',run);
  timer=setInterval(run,30000);
  run();
  return ()=>{
    if(timer) clearInterval(timer);
    timer=undefined;
    window.removeEventListener('online',run);window.removeEventListener('focus',run);
    document.removeEventListener('visibilitychange',run);
  };
}
