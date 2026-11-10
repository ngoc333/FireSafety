import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, Flame, History, LogOut, MapPin, Search, ShieldCheck, Smartphone, Wifi, WifiOff, Wrench, X } from 'lucide-react';
import { activateEmployee, db, identityDB, saveCompletion, saveInspection } from './db';
import { detectConnection, signIn, signOut, target } from './api';
import { observeSync, startAutoSync, syncNow, type SyncState } from './sync';
import { equipmentView, locationKey, scheduleView, type ChecklistItem, type CountermeasureItem, type InspectionAnswer, type LocationView, type Profile, type Repair, type Schedule } from './types';

type Tab = 'home'|'schedule'|'repairs'|'history';
const today=()=>new Date().toISOString().slice(0,10).replace(/-/g,'');
const isoDate=(raw:string)=>raw.length===8?raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6):raw;
const displayDate=(raw:string)=>raw?isoDate(raw).split('-').reverse().join('/'):'—';
const emptySync:SyncState={connection:'offline',running:false,pending:0,lastSync:'',lastError:''};

export default function App() {
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loginId,setLoginId]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [tab,setTab]=useState<Tab>('home');
  const [sync,setSync]=useState<SyncState>(emptySync);
  const [locations,setLocations]=useState<LocationView[]>([]);
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [repairs,setRepairs]=useState<Repair[]>([]);
  const [history,setHistory]=useState<{id:string;equipId:string;checkDate:string;bad:number;total:number}[]>([]);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<LocationView|null>(null);
  const [answers,setAnswers]=useState<InspectionAnswer[]>([]);
  const [items,setItems]=useState<ChecklistItem[]>([]);
  const [counters,setCounters]=useState<CountermeasureItem[]>([]);
  const [selectedSchedule,setSelectedSchedule]=useState('');
  const [measureIndex,setMeasureIndex]=useState<number|null>(null);
  const [repair,setRepair]=useState<Repair|null>(null);
  const [comment,setComment]=useState('');
  const [flash,setFlash]=useState('');
  const [cameraOpen,setCameraOpen]=useState(false);
  const [scanText,setScanText]=useState('');
  const video=useRef<HTMLVideoElement|null>(null);
  const cameraStream=useRef<MediaStream|null>(null);
  const profileId=profile?.employeeId ?? '';

  const reload=useCallback(async()=>{
    const currentDB = db;
    const [locationRows,equipmentRows,sch,rep,ins,completed]=await Promise.all([
      currentDB.location.toArray(),currentDB.equipment.toArray(),currentDB.schedule.toArray(),currentDB.repairs.toArray(),
      currentDB.inspections.orderBy('createdAt').reverse().limit(100).toArray(),
      currentDB.completions.toArray()
    ]);
    if (currentDB !== db) return;
    const locByCode=new Map(locationRows.filter(x=>x.use_yn==='Y').map(x=>[x.loc_cd,x]));
    const loc=equipmentRows.filter(x=>x.use_yn==='Y').map(x=>{
      const location=locByCode.get(x.loc_cd);
      return location?equipmentView(x,location):null;
    }).filter((x):x is LocationView=>x!==null);
    setLocations(loc);setSchedules(sch.filter(x=>x.use_yn==='Y'));
    const completedIds=new Set(completed.map(x=>x.repairId));
    setRepairs(rep.filter(x=>!completedIds.has(x.id)&&x.actionStatus!=='COMPLETED'));
    setHistory(ins.map(x=>({id:x.id,equipId:x.equipId,checkDate:x.checkDate,bad:x.items.filter(y=>y.checkResult==='NO OK').length,total:x.items.length})));
  },[]);

  useEffect(()=>{
    let mounted=true;
    void identityDB.settings.get('currentEmployee').then(async x=>{
      if(!mounted||!x?.value)return;
      const cached=await identityDB.profiles.get(x.value);
      if(mounted&&cached){
        activateEmployee(cached.employeeId);
        setProfile(cached);setLoginId(cached.employeeId);
        void reload();
      }
    });
    return ()=>{mounted=false;};
  },[reload]);
  useEffect(()=>{
    void reload();
    return observeSync(s=>{setSync(s);if(!s.running&&!s.lastError&&s.lastSync)void reload();});
  },[reload]);
  useEffect(()=>startAutoSync(()=>profileId),[profileId]);
  useEffect(()=>{
    if(flash){const t=setTimeout(()=>setFlash(''),3500);return ()=>clearTimeout(t);}
  },[flash]);

  async function login(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try {
      const id=loginId.trim();
      if(!id)throw new Error('Vui lòng nhập số thẻ.');
      let user:Profile;
      try{user=await signIn(id,password);}
      catch(e){
        // Previously verified employee can resume offline on the SAME DEVICE.
        // This is convenience only, not a replacement for server-side authorization.
        const cached=await identityDB.profiles.get(id);
        if(!cached||await detectConnection()!=='offline')throw e;
        user=cached;
      }
      activateEmployee(user.employeeId);
      await identityDB.profiles.put(user);
      await identityDB.settings.put({key:'currentEmployee',value:user.employeeId});
      setProfile(user);setPassword('');
      void syncNow(user.employeeId);await reload();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function logout(){
    await signOut();await identityDB.settings.delete('currentEmployee');
    activateEmployee(null);
    setProfile(null);setSelected(null);setTab('home');setError('');
    setLocations([]);setSchedules([]);setRepairs([]);setHistory([]);
  }
  async function openLocation(loc:LocationView){
    setError('');
    const checklist=await db.checklist_item.where('equip_type').equals(loc.itemGroupCd).filter(x=>x.use_yn==='Y').toArray();
    const options=await db.countermeasure_item.where('equip_type').equals(loc.itemGroupCd).filter(x=>x.use_yn==='Y').toArray();
    if(!checklist.length){setFlash('Chưa có checklist offline. Mở ứng dụng khi có mạng để tải dữ liệu.');return;}
    const matching=schedules.filter(x=>locationKey(scheduleView(x))===locationKey(loc));
    const d=today();
    const within=matching.filter(s=>Math.abs((new Date(isoDate(s.schedule_date)).getTime()-new Date(isoDate(d)).getTime())/86400000)<=7);
    const picked=within.find(x=>x.schedule_date===d)??within.filter(x=>x.checked!=='Y'&&x.schedule_date<d).sort((a,b)=>b.schedule_date.localeCompare(a.schedule_date))[0]??within.filter(x=>x.checked!=='Y').sort((a,b)=>a.schedule_date.localeCompare(b.schedule_date))[0];
    setSelectedSchedule(picked?.schedule_date??'');
    setSelected(loc);setItems(checklist);setCounters(options);
     setAnswers(checklist.map(x=>({itemId:x.item_id,checkResult:'OK',counterId:'',dueDate:''})));
    setTab('home');
  }
  function changeAnswer(index:number,patch:Partial<InspectionAnswer>){
    setAnswers(prev=>prev.map((x,i)=>i===index?{...x,...patch}:x));
  }
  async function submitInspection(){
    if(!profile||!selected)return;
    if(!selectedSchedule){setFlash('Không tìm thấy lịch kiểm tra hợp lệ trong khoảng ±7 ngày.');return;}
    if(answers.some(a=>a.checkResult==='NO OK'&&(!a.counterId||!a.dueDate||a.dueDate<new Date().toISOString().slice(0,10)))){
      setFlash('Mục NO OK cần biện pháp và hạn hoàn thành hợp lệ.');return;
    }
    setBusy(true);
    try {
      const id=crypto.randomUUID();
      await saveInspection({id,employeeId:profile.employeeId,plantCd:selected.plantCd,
        equipId:selected.subWsLoc,scheduleDate:selectedSchedule,checkDate:today(),
        createdAt:new Date().toISOString(),
         items:answers.map(x=>({...x,dueDate:x.dueDate.replace(/-/g,'')}))});
      setSelected(null);setFlash('Đã lưu an toàn trên máy. Tự đồng bộ khi kết nối.');await reload();
      void syncNow(profile.employeeId);
    }catch(e){setFlash(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function finishRepair(){
    if(!repair||!profile)return;
    if(!comment.trim()){setFlash('Vui lòng nhập cách khắc phục.');return;}
    setBusy(true);
    try {
      await saveCompletion({
        id:crypto.randomUUID(),employeeId:profile.employeeId,repairId:repair.id,
        plantCd:repair.plantCd,equipId:repair.subWsLoc,scheduleDate:repair.scheduleDate,
         areaLoc:repair.areaLoc,wsLoc:repair.wsLoc,itemGroupCd:repair.itemGroupCd,
         itemId:repair.itemCd,checkDate:repair.checkDate,completionComment:comment.trim(),completedAt:new Date().toISOString()
      });
      setRepair(null);setComment('');setFlash('Đã lưu khắc phục, chờ tự đồng bộ.');
      await reload();void syncNow(profile.employeeId);
    }catch(e){setFlash(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  const filteredLocations=useMemo(()=>locations.filter(x=>
    [x.subWsId,x.subWsName,x.factoryName,x.buildingName,x.locationName].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ).slice(0,40),[locations,query]);
   const completedCount=schedules.filter(x=>x.checked==='Y').length;
  const notOk=answers.filter(x=>x.checkResult==='NO OK').length;

  async function startQr(){
    setError('');
    const Detector=(window as unknown as {BarcodeDetector?:new(o:{formats:string[]})=>{detect:(v:HTMLVideoElement)=>Promise<{rawValue:string}[]>}}).BarcodeDetector;
    if(!Detector){setFlash('Trình duyệt chưa hỗ trợ quét QR. Vui lòng nhập mã thiết bị.');return;}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
      cameraStream.current=stream;setCameraOpen(true);
      const detector=new Detector({formats:['qr_code']});
      // Wait for the modal video element to render before scanning.
      const poll=async()=>{
        if(!cameraStream.current)return;
        const el=video.current;
        if(el&&el.readyState>=2){
          try{
            const found=await detector.detect(el);
            if(found[0]?.rawValue){stopQr();await selectByCode(found[0].rawValue);return;}
          }catch{ /* camera frame may not yet be ready */ }
        }
        if(cameraStream.current)requestAnimationFrame(()=>{void poll();});
      };
      setTimeout(()=>{void poll();},200);
    }catch{setFlash('Không mở được camera. Hãy cấp quyền hoặc nhập mã thủ công.');}
  }
  useEffect(()=>{if(cameraOpen&&video.current&&cameraStream.current){video.current.srcObject=cameraStream.current;void video.current.play();}},[cameraOpen]);
  function stopQr(){cameraStream.current?.getTracks().forEach(x=>x.stop());cameraStream.current=null;setCameraOpen(false);}
  useEffect(()=>()=>{cameraStream.current?.getTracks().forEach(x=>x.stop());},[]);
  async function selectByCode(text:string){
    const value=text.trim();
    const found=locations.find(x=>x.subWsId.toLowerCase()===value.toLowerCase());
    if(!found){setFlash('Không tìm thấy QR trong dữ liệu đã tải.');return;}
    setScanText('');await openLocation(found);
  }

  if(!profile)return <div className="signin-wrap">
    <div className="signin-brand"><div className="brand-icon"><Flame size={35}/></div><h1>FireSafety</h1><p>Kiểm tra an toàn phòng cháy chữa cháy</p></div>
    <form className="signin-panel" onSubmit={login}>
      <label>{target==='lan'?'Số thẻ nhân viên':'Email công ty'}</label>
      <input autoFocus value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder={target==='lan'?'Nhập số thẻ':'name@company.com'} autoComplete="username" />
      {target==='internet'&&<><label>Mật khẩu</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></>}
      {error&&<p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy?'Đang xác thực...':'Đăng nhập'} <ChevronRight size={18}/></button>
      <p className="helper">{sync.connection==='offline'?'Ngoại tuyến: chỉ tài khoản đã đăng nhập trước trên thiết bị này mới có thể tiếp tục.':'Dữ liệu kiểm tra lưu trên thiết bị và tự động đồng bộ.'}</p>
    </form>
  </div>;

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-title"><div className="small-brand"><Flame size={20}/></div><div><strong>FireSafety</strong><small>Xin chào, {profile.fullName||profile.employeeId}</small></div></div>
      <button className="logout" onClick={()=>void logout()} aria-label="Đăng xuất"><LogOut size={19}/></button>
    </header>
    <div className={'connect-bar '+sync.connection}>
      {sync.connection==='offline'?<WifiOff size={15}/>:<Wifi size={15}/>}
      <span>{sync.connection==='lan'?'Mạng nội bộ':sync.connection==='internet'?'Internet / Supabase':'Đang ngoại tuyến'}</span>
      <span className="right">{sync.running?'Đang đồng bộ…':sync.pending?sync.pending+' chờ gửi':'Đã lưu an toàn'}</span>
    </div>
    {flash&&<div className="toast" role="status">{flash}<button onClick={()=>setFlash('')} aria-label="Đóng"><X size={15}/></button></div>}
    {selected ? <main className="content inspection-screen">
      <button className="text-back" onClick={()=>setSelected(null)}><ArrowLeft size={18}/> Trở về</button>
      <div className="inspection-heading"><div><h2>{selected.subWsName||selected.subWsId}</h2><p><MapPin size={14}/>{selected.buildingName} · {selected.locationName}</p></div><span className="code">{selected.subWsId}</span></div>
      <div className="schedule-note"><CalendarDays size={16}/> Lịch: <b>{displayDate(selectedSchedule)}</b><span>{items.length} mục</span></div>
      <div className="section-heading"><h3>Danh sách kiểm tra</h3><small>{notOk} mục NO OK</small></div>
      <div className="checklist">
         {items.map((item,i)=><div className="checkline" key={item.item_id}>
           <div className="checklabel"><b>{i+1}.</b><span>{item.item_name_vn||item.item_name_en||item.item_id}</span></div>
          <div className="checkactions">
            <button className={answers[i]?.checkResult==='OK'?'result-button ok active':'result-button ok'} onClick={()=>changeAnswer(i,{checkResult:'OK',counterId:'',dueDate:''})}>OK</button>
            <button className={answers[i]?.checkResult==='NO OK'?'result-button no active':'result-button no'} onClick={()=>{changeAnswer(i,{checkResult:'NO OK'});setMeasureIndex(i);}}>NO</button>
          </div>
          {answers[i]?.checkResult==='NO OK'&&<button className="measure-inline" onClick={()=>setMeasureIndex(i)}>{answers[i]?.counterId?'Đã chọn biện pháp':'Chọn biện pháp'} <ChevronRight size={15}/></button>}
        </div>)}
      </div>
      <div className="sticky-submit"><button className="btn primary" disabled={busy} onClick={()=>void submitInspection()}><Check size={19}/> Lưu kết quả <span>({items.length} mục)</span></button></div>
    </main> : <main className="content">
      {tab==='home'&&<>
        <div className="page-heading"><div><small>TỔNG QUAN</small><h2>Kiểm tra an toàn</h2></div><ShieldCheck size={28} className="heading-icon"/></div>
        <div className="stats"><div><strong>{locations.length}</strong><small>Thiết bị</small></div><div><strong>{completedCount}</strong><small>Lịch đã kiểm</small></div><div><strong>{repairs.length}</strong><small>Cần khắc phục</small></div></div>
        <button className="scan-cta" onClick={()=>void startQr()}><span className="scan-symbol"><Smartphone size={26}/></span><span><b>Quét QR để kiểm tra</b><small>Đưa camera vào mã QR thiết bị</small></span><ChevronRight size={23}/></button>
        <div className="search-field"><Search size={19}/><input value={scanText} onChange={e=>setScanText(e.target.value)} placeholder="Hoặc nhập mã QR thiết bị" onKeyDown={e=>{if(e.key==='Enter')void selectByCode(scanText);}}/><button onClick={()=>void selectByCode(scanText)}>Mở</button></div>
        <div className="section-heading"><h3>Thiết bị</h3><span>{locations.length} vị trí</span></div>
        <div className="search-field compact"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm theo tên hoặc vị trí..."/></div>
        <div className="list">{filteredLocations.length?filteredLocations.map(loc=><button className="list-card" key={locationKey(loc)} onClick={()=>void openLocation(loc)}>
          <span className="item-icon"><MapPin size={19}/></span><span className="card-main"><b>{loc.subWsName||loc.subWsId}</b><small>{loc.buildingName} · {loc.locationName}</small></span><ChevronRight size={18}/></button>):<p className="empty">Chưa có thiết bị. Mở ứng dụng khi có mạng để nhận dữ liệu ban đầu.</p>}</div>
      </>}
      {tab==='schedule'&&<>
        <div className="page-heading"><div><small>KẾ HOẠCH</small><h2>Lịch kiểm tra</h2></div><CalendarDays className="heading-icon" size={27}/></div>
         <div className="list">{[...schedules].sort((a,b)=>a.schedule_date.localeCompare(b.schedule_date)).slice(0,80).map((s,i)=>{
           const view=scheduleView(s);
           const loc=locations.find(x=>locationKey(x)===locationKey(view));
           return <button key={i} className="list-card" disabled={!loc} onClick={()=>loc&&void openLocation(loc)}>
             <span className={'item-icon '+(s.checked==='Y'?'done':'')}><CalendarDays size={18}/></span><span className="card-main"><b>{loc?.subWsName||s.equip_id}</b><small>{displayDate(s.schedule_date)} · {loc?.locationName||s.loc_cd}</small></span><span className={'status '+(s.checked==='Y'?'success':'pending')}>{s.checked==='Y'?'Đã kiểm':'Chưa kiểm'}</span></button>;
        })}{!schedules.length&&<p className="empty">Chưa có lịch kiểm tra trên thiết bị.</p>}</div>
      </>}
      {tab==='repairs'&&<>
        <div className="page-heading"><div><small>THEO DÕI</small><h2>Khắc phục sự cố</h2></div><Wrench className="heading-icon" size={27}/></div>
        <div className="list">{repairs.map(r=><button className="list-card" key={r.id} onClick={()=>{setRepair(r);setComment('');}}>
          <span className="item-icon warning"><AlertTriangle size={19}/></span><span className="card-main"><b>{r.itemName||r.itemCd}</b><small>{r.equipmentName||r.subWsLoc} · Hạn {displayDate(r.completeDate)}</small></span><ChevronRight size={18}/></button>)}{!repairs.length&&<p className="empty">Không có sự cố đang chờ xử lý.</p>}</div>
      </>}
      {tab==='history'&&<>
        <div className="page-heading"><div><small>HOẠT ĐỘNG</small><h2>Lịch sử kiểm tra</h2></div><History className="heading-icon" size={27}/></div>
        <div className="list">{history.map(x=><div className="list-card static" key={x.id}>
          <span className="item-icon done"><ClipboardCheck size={18}/></span><span className="card-main"><b>{x.equipId}</b><small>{displayDate(x.checkDate)} · {x.total} mục kiểm tra</small></span><span className={'status '+(x.bad?'danger':'success')}>{x.bad?x.bad+' NO OK':'OK'}</span></div>)}{!history.length&&<p className="empty">Chưa có lịch sử kiểm tra trên thiết bị.</p>}</div>
        <p className="helper">Lịch sử trên máy được giữ khi ngoại tuyến. Dữ liệu từ máy chủ được cập nhật khi đồng bộ.</p>
      </>}
    </main>}
    {!selected&&<nav className="bottom-nav" aria-label="Điều hướng">
      {([{id:'home',label:'Kiểm tra',Icon:ClipboardCheck},{id:'schedule',label:'Lịch',Icon:CalendarDays},{id:'repairs',label:'Khắc phục',Icon:Wrench},{id:'history',label:'Lịch sử',Icon:History}] as const).map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>{setTab(t.id);void reload();}}><t.Icon size={21}/><span>{t.label}</span></button>)}
    </nav>}
    {measureIndex!==null&&selected&&<div className="modal-backdrop" onClick={()=>setMeasureIndex(null)}><section className="bottom-sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"/><div className="sheet-title"><h3>Biện pháp xử lý</h3><button onClick={()=>setMeasureIndex(null)} aria-label="Đóng"><X size={19}/></button></div>
       <p>{items[measureIndex]?.item_name_vn||items[measureIndex]?.item_id}</p>
       <label>Biện pháp khắc phục</label><select value={answers[measureIndex]?.counterId??''} onChange={e=>changeAnswer(measureIndex,{counterId:e.target.value})}><option value="">Chọn biện pháp</option>
         {counters.filter(x=>x.item_id===items[measureIndex]?.item_id).map(c=><option key={c.counter_id} value={c.counter_id}>{c.counter_name_vn||c.counter_name_en}</option>)}</select>
      <label>Ngày hoàn thành dự kiến</label><input type="date" min={new Date().toISOString().slice(0,10)} value={answers[measureIndex]?.dueDate??''} onChange={e=>changeAnswer(measureIndex,{dueDate:e.target.value})}/>
      <button className="btn primary" onClick={()=>{if(!answers[measureIndex].counterId||!answers[measureIndex].dueDate){setFlash('Vui lòng chọn biện pháp và ngày hoàn thành.');return;}setMeasureIndex(null);}}>Xác nhận</button>
    </section></div>}
    {repair&&<div className="modal-backdrop" onClick={()=>setRepair(null)}><section className="bottom-sheet" onClick={e=>e.stopPropagation()}>
      <div className="sheet-handle"/><div className="sheet-title"><h3>Hoàn tất khắc phục</h3><button onClick={()=>setRepair(null)} aria-label="Đóng"><X size={19}/></button></div>
      <p><b>{repair.itemName||repair.itemCd}</b> · {repair.equipmentName||repair.subWsLoc}</p>
      <p>Biện pháp: {repair.countermeasureName||'—'}</p>
      <label>Nội dung đã xử lý</label><textarea rows={3} placeholder="Mô tả cách khắc phục..." value={comment} onChange={e=>setComment(e.target.value)}/>
      <button className="btn primary" disabled={busy} onClick={()=>void finishRepair()}><Check size={18}/> Xác nhận hoàn tất</button>
    </section></div>}
    {cameraOpen&&<div className="camera-overlay"><video ref={video} playsInline muted autoPlay/><div className="camera-target"/><button onClick={stopQr}>Đóng camera</button></div>}
    <div className="sync-meta"><Clock3 size={12}/> {sync.lastSync?'Cập nhật '+new Date(sync.lastSync).toLocaleTimeString('vi-VN'):'Sẵn sàng làm việc offline'}</div>
  </div>;
}
