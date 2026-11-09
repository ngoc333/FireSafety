import { applyBootstrap, db } from './db';
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
  running=true;publish({running:true});
  try {
    const connection=await detectConnection();
    publish({connection,pending:await db.outbox.count()});
    if(connection==='offline'||!employeeId) return;
    const events=await db.outbox.orderBy('createdAt').toArray();
    for(const event of events) {
      if(event.nextAttemptAt>Date.now()) continue;
      try {
        await uploadEvent(event);
        await db.outbox.delete(event.id); // acknowledgment required before deletion
      } catch(e) {
        const attempts=event.attempts+1;
        await db.outbox.update(event.id,{
          attempts, lastError:e instanceof Error?e.message:String(e),
          nextAttemptAt:Date.now()+Math.min(5*60_000,Math.pow(2,attempts)*3000)
        });
        throw e; // do not overwrite offline writes with a stale bootstrap
      }
    }
    const pending=await db.outbox.count();
    if (pending===0) {
      const data=await loadBootstrap(employeeId);
      await applyBootstrap(data);
      publish({lastSync:new Date().toISOString(),lastError:''});
    }
    publish({pending});
  } catch(e) {
    publish({lastError:e instanceof Error?e.message:String(e)});
  } finally {running=false;publish({running:false,pending:await db.outbox.count()});}
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
