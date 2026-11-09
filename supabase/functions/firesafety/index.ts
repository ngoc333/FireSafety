// Supabase Edge Function: deploy with JWT verification enabled.
// This function intentionally uses the user's JWT and RLS, NOT service_role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...headers,'Content-Type':'application/json'}
});
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const auth=request.headers.get('Authorization')??'';
  if(!auth.startsWith('Bearer '))return json({error:'Unauthorized'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const client=createClient(url,key,{
    global:{headers:{Authorization:auth}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:{user},error:authError}=await client.auth.getUser(auth.slice(7));
  if(authError||!user)return json({error:'Unauthorized'},401);
  let body:{action:string;event?:{id:string;type:string;payload:Record<string,unknown>}};
  try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
  const profile=await client.from('fs_profiles').select('employee_id,full_name,dept_name,factory_code')
    .eq('owner_uid',user.id).single();
  if(profile.error||!profile.data)return json({error:'Employee account not provisioned'},403);
  if(body.action==='me')return json({employeeId:profile.data.employee_id,fullName:profile.data.full_name,
    deptName:profile.data.dept_name,factoryCode:profile.data.factory_code});
  if(body.action==='bootstrap'){
    const names=['fs_locations','fs_items','fs_countermeasures','fs_schedules','fs_repairs'] as const;
    const tables=await Promise.all(names.map(table=>client.from(table).select('data').eq('owner_uid',user.id).limit(10000)));
    if(tables.some(x=>x.error))return json({error:'Unable to fetch bootstrap'},500);
    const [locations,items,countermeasures,schedules,repairs]=tables.map(x=>x.data!.map(y=>y.data));
    return json({locations,items,countermeasures,schedules,repairs,
      profile:{employeeId:profile.data.employee_id,fullName:profile.data.full_name,
        deptName:profile.data.dept_name,factoryCode:profile.data.factory_code}});
  }
  if(body.action==='event'){
    const event=body.event;
    if(!event||!['inspection','repair'].includes(event.type)||!event.id)return json({error:'Invalid event'},400);
    if(event.payload.employeeId!==profile.data.employee_id)return json({error:'Employee mismatch'},403);
    const {error}=await client.rpc('fs_submit_event',{
      p_id:event.id,p_kind:event.type,p_payload:event.payload
    });
    if(error)return json({error:error.message},400);
    return json({success:true});
  }
  return json({error:'Unknown action'},400);
});
