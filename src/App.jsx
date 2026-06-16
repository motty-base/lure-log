import { useState, useRef, useEffect } from "react";

function formatDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const C = {
  bg:"#0a1628", surface:"#0f2040", card:"#132a50", border:"#1e3f6e",
  accent:"#00c9a7", text:"#e8f4f0", muted:"#7aa8c0", danger:"#e05555", gold:"#f0c040",
};

const INIT_TYPES = ["スプーン","クランク","ミノー","不明"];
const INIT_MAKERS = ["ロデオクラフト","ベルベットアーツ","不明"];
const EMPTY_DETAIL = { type:"", maker:"", lureName:"", color:"", weight:"", spot:"", memo:"" };

async function apiLoad() {
  try {
    const res = await fetch('/api/data')
    if (!res.ok) throw new Error('load failed')
    return await res.json()
  } catch(e) {
    console.error('load error', e)
    return null
  }
}

async function apiSave(data) {
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch(e) {
    console.error('save error', e)
  }
}

function getCandidates(records, key, filters={}) {
  const seen = new Set();
  return records
    .filter(r=>r.detail)
    .filter(r=>Object.entries(filters).every(([k,v])=>r.detail[k]===v))
    .map(r=>r.detail[key])
    .filter(v=>v&&!seen.has(v)&&seen.add(v));
}

function lureKey(d) { return `${d.type}|${d.maker}|${d.lureName}|${d.weight}|${d.color}`; }

function CandidateInput({ label, candidates, value, onChange, placeholder, type="text", step }) {
  return (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>{label}</div>
      {candidates.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
          {candidates.map(c=>(
            <button key={c} onClick={()=>onChange(c)}
              style={{background:value===c?C.accent:C.card,border:`1px solid ${value===c?C.accent:C.border}`,borderRadius:20,padding:"7px 14px",fontSize:13,color:value===c?"#071020":C.text,cursor:"pointer",fontWeight:value===c?700:400}}>
              {c}{step?"g":""}
            </button>
          ))}
        </div>
      )}
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={candidates.length>0?`または新しい${label}を入力`:placeholder}
        type={type} step={step}
        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
    </div>
  );
}

function SelectOrInput({ label, options, value, onChange, placeholder }) {
  const [freeText, setFreeText] = useState("");
  const [showFree, setShowFree] = useState(false);
  function handleFree() { if(freeText.trim()){onChange(freeText.trim());setShowFree(false);setFreeText("");} }
  return (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {options.map(o=>(
          <button key={o} onClick={()=>{onChange(o);setShowFree(false);}}
            style={{background:value===o?C.accent:C.card,border:`1px solid ${value===o?C.accent:C.border}`,borderRadius:20,padding:"7px 14px",fontSize:13,color:value===o?"#071020":C.text,cursor:"pointer",fontWeight:value===o?700:400}}>
            {o}
          </button>
        ))}
        <button onClick={()=>setShowFree(s=>!s)}
          style={{background:showFree?`${C.gold}33`:C.card,border:`1px solid ${showFree?C.gold:C.border}`,borderRadius:20,padding:"7px 14px",fontSize:13,color:showFree?C.gold:C.muted,cursor:"pointer"}}>
          ✏️ 自由入力
        </button>
      </div>
      {showFree&&(
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input value={freeText} onChange={e=>setFreeText(e.target.value)} placeholder={placeholder||"入力してください"}
            onKeyDown={e=>e.key==="Enter"&&handleFree()}
            style={{flex:1,background:C.card,border:`1px solid ${C.gold}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none"}}/>
          <button onClick={handleFree} style={{background:C.gold,border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:700,color:"#071020",cursor:"pointer"}}>決定</button>
        </div>
      )}
      {value&&<div style={{marginTop:6,fontSize:13,color:C.accent}}>✓ {value}</div>}
    </div>
  );
}

export default function LureLogger() {
  const [tab, setTab] = useState("record");
  const [records, setRecords] = useState([]);
  const [lureTypes, setLureTypes] = useState(INIT_TYPES);
  const [makers, setMakers] = useState(INIT_MAKERS);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(EMPTY_DETAIL);
  const [filterType, setFilterType] = useState("");
  const [filterMaker, setFilterMaker] = useState("");
  const [filterSpot, setFilterSpot] = useState("");
  const [loaded, setLoaded] = useState(false);

  // ルアー編集用
  const [lureEditTarget, setLureEditTarget] = useState(null); // 編集中のlureKey
  const [lureEdit, setLureEdit] = useState({});

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const videoPreviewRef = useRef(null);

  useEffect(() => {
    apiLoad().then(data => {
      if (data) {
        if (data.records)   setRecords(data.records.map(r=>({...r, videoUrl:null})));
        if (data.lureTypes && data.lureTypes.length > 0) setLureTypes(data.lureTypes);
        if (data.makers    && data.makers.length > 0)    setMakers(data.makers);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    apiSave({
      records:   records.map(r => ({...r, videoUrl: null})),
      lureTypes,
      makers,
    });
  }, [records, lureTypes, makers, loaded]);

  function setDetailField(key, value) {
    setDetail(d => {
      const next = {...d,[key]:value};
      if (key==="type"||key==="maker") { next.lureName=""; next.color=""; next.weight=""; }
      if (key==="lureName") { next.color=""; next.weight=""; }
      return next;
    });
  }

  function addType(t) { if(!lureTypes.includes(t)) setLureTypes(p=>[...p,t]); setDetailField("type",t); }
  function addMaker(m) { if(!makers.includes(m)) setMakers(p=>[...p,m]); setDetailField("maker",m); }

  const lureNameCandidates = detail.type&&detail.maker ? getCandidates(records,"lureName",{type:detail.type,maker:detail.maker}) : [];
  const colorCandidates = detail.lureName ? getCandidates(records,"color",{type:detail.type,maker:detail.maker,lureName:detail.lureName}) : [];
  const weightCandidates = detail.type==="スプーン"&&detail.lureName ? getCandidates(records,"weight",{type:"スプーン",maker:detail.maker,lureName:detail.lureName}) : [];
  const spotCandidates = getCandidates(records,"spot");
  const allSpots = [...new Set(records.filter(r=>r.detail?.spot).map(r=>r.detail.spot))];
  const isSpoon = detail.type==="スプーン";

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:true});
      if(videoPreviewRef.current){videoPreviewRef.current.srcObject=stream;videoPreviewRef.current.play();}
      chunksRef.current=[];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.onstop=()=>{
        setVideoUrl(URL.createObjectURL(new Blob(chunksRef.current,{type:"video/mp4"})));
        stream.getTracks().forEach(t=>t.stop());
        if(videoPreviewRef.current)videoPreviewRef.current.srcObject=null;
      };
      mr.start(); mediaRecorderRef.current=mr;
      setIsRecording(true); setRecordingSec(0); setVideoUrl(null);
      timerRef.current=setInterval(()=>setRecordingSec(s=>s+1),1000);
    } catch { setError("カメラ・マイクへのアクセスを許可してください"); }
  }

  function stopRecording() { mediaRecorderRef.current?.stop(); setIsRecording(false); clearInterval(timerRef.current); }

  function saveRecord() {
    if(!videoUrl) return;
    setRecords(prev=>[{id:Date.now(),videoUrl,datetime:formatDate(new Date()),detail:null},...prev]);
    setSaved(true);
    setTimeout(()=>{ setVideoUrl(null); setSaved(false); setRecordingSec(0); }, 900);
  }

  function openDetail(rec) { setDetailTarget(rec.id); setDetail(rec.detail||EMPTY_DETAIL); }

  function saveDetail() {
    if(detail.type&&!lureTypes.includes(detail.type)) setLureTypes(p=>[...p,detail.type]);
    if(detail.maker&&!makers.includes(detail.maker)) setMakers(p=>[...p,detail.maker]);
    setRecords(prev=>prev.map(r=>r.id===detailTarget?{...r,detail}:r));
    setDetailTarget(null);
  }

  function deleteRecord(id) { if(confirm("削除しますか？")) setRecords(r=>r.filter(x=>x.id!==id)); }

  // ── ルアー編集関数 ──
  function openLureEdit(l) {
    setLureEditTarget(lureKey(l));
    setLureEdit({
      type: l.type,
      maker: l.maker,
      lureName: l.lureName,
      weight: l.weight,
      color: l.color,
    });
  }

  function saveLureEdit() {
    // 編集前のキーと一致する全記録のdetailを一括更新
    setRecords(prev => prev.map(r => {
      if (!r.detail) return r;
      if (lureKey(r.detail) !== lureEditTarget) return r;
      return {
        ...r,
        detail: {
          ...r.detail,
          type:     lureEdit.type,
          maker:    lureEdit.maker,
          lureName: lureEdit.lureName,
          weight:   lureEdit.weight,
          color:    lureEdit.color,
        }
      };
    }));
    setLureEditTarget(null);
  }

  const unregistered = records.filter(r=>!r.detail?.type).length;

  const lureStats = (() => {
    const map = {};
    records.filter(r=>r.detail?.type).forEach(r=>{
      const d=r.detail; const k=lureKey(d);
      if(!map[k]) map[k]={...d,counts:{},total:0};
      const spot=d.spot||"釣り場不明";
      map[k].counts[spot]=(map[k].counts[spot]||0)+1;
      map[k].total+=1;
    });
    return Object.values(map)
      .filter(l=>(!filterType||l.type===filterType)&&(!filterMaker||l.maker===filterMaker)&&(!filterSpot||l.counts[filterSpot]))
      .sort((a,b)=>b.total-a.total);
  })();

  // ── ルアー編集画面 ──
  if (lureEditTarget) {
    const isEditSpoon = lureEdit.type === "スプーン";
    return (
      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Helvetica Neue',Arial,sans-serif",maxWidth:480,margin:"0 auto"}}>
        <header style={{background:`linear-gradient(180deg,#071020,${C.surface})`,borderBottom:`1px solid ${C.border}`,padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setLureEditTarget(null)} style={{background:"transparent",border:"none",color:C.accent,fontSize:22,cursor:"pointer"}}>←</button>
          <div style={{fontSize:18,fontWeight:700,color:C.accent}}>ルアー情報を編集</div>
        </header>
        <main style={{padding:"16px",paddingBottom:40}}>
          <div style={{background:`${C.gold}11`,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:12,color:C.gold}}>
            ⚠️ この編集は同じルアーの全記録に反映されます
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>ルアータイプ</div>
            <input value={lureEdit.type} onChange={e=>setLureEdit(p=>({...p,type:e.target.value}))}
              style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>メーカー</div>
            <input value={lureEdit.maker} onChange={e=>setLureEdit(p=>({...p,maker:e.target.value}))}
              style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>ルアー名</div>
            <input value={lureEdit.lureName} onChange={e=>setLureEdit(p=>({...p,lureName:e.target.value}))}
              style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>

          {isEditSpoon&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:8}}>重さ (g)</div>
              <input value={lureEdit.weight} onChange={e=>setLureEdit(p=>({...p,weight:e.target.value}))}
                type="number" step="0.1"
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
            </div>
          )}

          <div style={{marginBottom:32}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>カラー</div>
            <input value={lureEdit.color} onChange={e=>setLureEdit(p=>({...p,color:e.target.value}))}
              style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>

          <button onClick={saveLureEdit} style={{width:"100%",background:C.accent,border:"none",borderRadius:12,padding:16,fontSize:16,fontWeight:700,color:"#071020",cursor:"pointer"}}>
            保存する
          </button>
        </main>
      </div>
    );
  }

  // ── 詳細登録画面 ──
  if (detailTarget) {
    const rec = records.find(r=>r.id===detailTarget);
    return (
      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Helvetica Neue',Arial,sans-serif",maxWidth:480,margin:"0 auto"}}>
        <header style={{background:`linear-gradient(180deg,#071020,${C.surface})`,borderBottom:`1px solid ${C.border}`,padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setDetailTarget(null)} style={{background:"transparent",border:"none",color:C.accent,fontSize:22,cursor:"pointer"}}>←</button>
          <div style={{fontSize:18,fontWeight:700,color:C.accent}}>ルアー情報を登録</div>
        </header>
        <main style={{padding:"16px",paddingBottom:40}}>
          {rec?.videoUrl
            ? <video src={rec.videoUrl} controls playsInline style={{width:"100%",maxHeight:200,borderRadius:12,background:"#000",display:"block",marginBottom:12}}/>
            : <div style={{background:C.card,borderRadius:12,padding:"12px 16px",marginBottom:12,fontSize:12,color:C.muted,textAlign:"center"}}>📹 動画はセッション終了後に消えます</div>
          }
          <div style={{fontSize:12,color:C.muted,marginBottom:20}}>🕐 {rec?.datetime}</div>

          <SelectOrInput label="ルアータイプ" options={lureTypes} value={detail.type} onChange={addType} placeholder="例：ペレット"/>
          {detail.type&&<SelectOrInput label="メーカー" options={makers} value={detail.maker} onChange={addMaker} placeholder="例：スミス"/>}
          {detail.type&&detail.maker&&(
            <CandidateInput label="ルアー名" candidates={lureNameCandidates} value={detail.lureName}
              onChange={v=>setDetailField("lureName",v)} placeholder="例：ミュー、リッジ35F"/>
          )}
          {isSpoon&&detail.lureName&&(
            <CandidateInput label="重さ (g)" candidates={weightCandidates} value={detail.weight}
              onChange={v=>setDetailField("weight",v)} placeholder="例：3.0" type="number" step="0.1"/>
          )}
          {detail.lureName&&(isSpoon?detail.weight:true)&&(
            <CandidateInput label="カラー" candidates={colorCandidates} value={detail.color}
              onChange={v=>setDetailField("color",v)} placeholder="例：ゴールドオレンジ"/>
          )}
          <CandidateInput label="釣り場" candidates={spotCandidates} value={detail.spot}
            onChange={v=>setDetailField("spot",v)} placeholder="例：フィッシングエリア○○"/>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>メモ</div>
            <textarea value={detail.memo} onChange={e=>setDetailField("memo",e.target.value)}
              placeholder="天気・状況など自由に" rows={3}
              style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,outline:"none",resize:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <button onClick={saveDetail} style={{width:"100%",background:C.accent,border:"none",borderRadius:12,padding:16,fontSize:16,fontWeight:700,color:"#071020",cursor:"pointer"}}>
            登録する
          </button>
        </main>
      </div>
    );
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Helvetica Neue',Arial,sans-serif",maxWidth:480,margin:"0 auto"}}>
      <header style={{background:`linear-gradient(180deg,#071020,${C.surface})`,borderBottom:`1px solid ${C.border}`,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:26}}>🎣</span>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:C.accent}}>LURE LOG</div>
            <div style={{fontSize:11,color:C.muted}}>エリアトラウト 釣果記録</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {unregistered>0&&<div style={{background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:20,padding:"4px 10px",fontSize:12,color:C.gold}}>未登録 {unregistered}</div>}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 14px",fontSize:13,color:C.muted}}>{records.length}件</div>
        </div>
      </header>

      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
        {[["record","🎬 記録"],["list","📋 一覧"],["lures","🎣 ルアー"]].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"13px 0",background:"transparent",border:"none",borderBottom:tab===key?`2px solid ${C.accent}`:"2px solid transparent",marginBottom:-1,color:tab===key?C.accent:C.muted,fontSize:13,cursor:"pointer",fontWeight:tab===key?700:400}}>
            {label}
          </button>
        ))}
      </div>

      <main style={{padding:"20px 16px"}}>

        {tab==="record"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {error&&<div style={{background:`${C.danger}22`,border:`1px solid ${C.danger}55`,borderRadius:10,padding:"12px 14px",fontSize:14,color:C.danger}}>⚠️ {error}</div>}
            <div style={{background:C.card,borderRadius:16,overflow:"hidden",minHeight:260,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",border:`2px solid ${isRecording?C.danger:C.border}`}}>
              <video ref={videoPreviewRef} muted playsInline style={{width:"100%",maxHeight:300,objectFit:"cover",display:isRecording?"block":"none",background:"#000"}}/>
              {!isRecording&&!videoUrl&&(
                <div style={{textAlign:"center",padding:32}}>
                  <div style={{fontSize:52}}>🎬</div>
                  <div style={{fontSize:16,fontWeight:700,marginTop:12}}>ボタンで録画開始</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:8,lineHeight:1.7}}>ルアーを映しながら<br/>「ミュー3g！」とひと言話すだけ</div>
                </div>
              )}
              {isRecording&&(
                <div style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,0.6)",borderRadius:20,padding:"4px 12px",display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:C.danger}}/>
                  <span style={{fontSize:13,color:"#fff",fontWeight:600}}>{recordingSec}秒</span>
                </div>
              )}
            </div>

            {!videoUrl&&(
              <button onClick={isRecording?stopRecording:startRecording}
                style={{background:isRecording?C.danger:C.accent,border:"none",borderRadius:50,width:80,height:80,fontSize:28,cursor:"pointer",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {isRecording?"⏹":"⏺"}
              </button>
            )}

            {videoUrl&&(
              <>
                <video src={videoUrl} controls playsInline style={{width:"100%",maxHeight:300,borderRadius:12,background:"#000",display:"block"}}/>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setVideoUrl(null);setRecordingSec(0);}} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:12,padding:14,fontSize:14,color:C.muted,cursor:"pointer"}}>撮り直す</button>
                  <button onClick={saveRecord} disabled={saved} style={{flex:2,background:saved?C.border:C.accent,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,color:saved?C.muted:"#071020",cursor:saved?"not-allowed":"pointer"}}>
                    {saved?"✅ 記録しました！次を撮影できます":"記録する"}
                  </button>
                </div>
              </>
            )}
            <div style={{fontSize:12,color:C.muted,textAlign:"center",lineHeight:1.7}}>💡 魚をリリース → ルアーを持って録画 →<br/>「ミュー3g！」とひと言 → 停止</div>
          </div>
        )}

        {tab==="list"&&(
          <div>
            {records.length===0
              ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:48}}>🎣</div><div style={{marginTop:12}}>まだ記録がありません</div></div>
              : records.map(rec=>(
                <div key={rec.id} style={{background:C.card,border:`1px solid ${rec.detail?.type?C.border:C.gold+"55"}`,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                  {rec.videoUrl
                    ? <video src={rec.videoUrl} controls playsInline style={{width:"100%",maxHeight:180,objectFit:"cover",display:"block",background:"#000"}}/>
                    : <div style={{background:C.surface,padding:"8px 14px",fontSize:11,color:C.muted}}>📹 動画はセッション終了後に消えます</div>
                  }
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{fontSize:13,color:C.accent,fontWeight:600}}>🕐 {rec.datetime}</div>
                      <button onClick={()=>deleteRecord(rec.id)} style={{background:"transparent",border:"none",fontSize:18,cursor:"pointer",color:C.muted}}>🗑</button>
                    </div>
                    {rec.detail?.type?(
                      <div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                          {[rec.detail.type,rec.detail.maker,rec.detail.lureName,rec.detail.weight?rec.detail.weight+"g":"",rec.detail.color,rec.detail.spot].filter(Boolean).map((v,i)=>(
                            <span key={i} style={{background:C.surface,borderRadius:5,padding:"3px 8px",fontSize:12,color:C.muted}}>{v}</span>
                          ))}
                        </div>
                        <button onClick={()=>openDetail(rec)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12,color:C.muted,cursor:"pointer"}}>編集</button>
                      </div>
                    ):(
                      <button onClick={()=>openDetail(rec)} style={{width:"100%",background:`${C.gold}22`,border:`1px solid ${C.gold}55`,borderRadius:10,padding:"10px",fontSize:14,fontWeight:700,color:C.gold,cursor:"pointer"}}>
                        📝 ルアー情報を登録する
                      </button>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab==="lures"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              <select value={filterType} onChange={e=>setFilterType(e.target.value)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,outline:"none",cursor:"pointer"}}>
                <option value="">すべてのタイプ</option>
                {lureTypes.map(t=><option key={t}>{t}</option>)}
              </select>
              <select value={filterMaker} onChange={e=>setFilterMaker(e.target.value)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,outline:"none",cursor:"pointer"}}>
                <option value="">すべてのメーカー</option>
                {makers.map(m=><option key={m}>{m}</option>)}
              </select>
              <select value={filterSpot} onChange={e=>setFilterSpot(e.target.value)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,outline:"none",cursor:"pointer"}}>
                <option value="">すべての釣り場</option>
                {allSpots.map(s=><option key={s}>{s}</option>)}
              </select>
              {(filterType||filterMaker||filterSpot)&&(
                <button onClick={()=>{setFilterType("");setFilterMaker("");setFilterSpot("");}}
                  style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:C.muted,cursor:"pointer"}}>✕ リセット</button>
              )}
            </div>

            {lureStats.length===0
              ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
                  <div style={{fontSize:48}}>🎣</div>
                  <div style={{marginTop:12}}>データがありません</div>
                  <div style={{fontSize:13,marginTop:8}}>記録してルアー情報を登録すると<br/>ここに表示されます</div>
                </div>
              : lureStats.map((l,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:10,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{background:`${C.accent}22`,color:C.accent,borderRadius:5,padding:"3px 8px",fontSize:12,fontWeight:700}}>{l.type}</span>
                        <span style={{fontSize:13,color:C.muted}}>{l.maker}</span>
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{l.lureName||"名称不明"}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                        {l.weight&&<span style={{fontSize:12,color:C.muted}}>{l.weight}g</span>}
                        {l.color&&<span style={{fontSize:12,color:C.muted}}>🎨 {l.color}</span>}
                      </div>
                      <button onClick={()=>openLureEdit(l)}
                        style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 12px",fontSize:12,color:C.muted,cursor:"pointer"}}>
                        ✏️ 編集
                      </button>
                    </div>
                    <div style={{background:`${C.gold}22`,border:`1px solid ${C.gold}44`,borderRadius:20,padding:"6px 14px",fontSize:18,fontWeight:700,color:C.gold,flexShrink:0,textAlign:"center",marginLeft:8}}>
                      {filterSpot?(l.counts[filterSpot]||0):l.total}
                      <div style={{fontSize:10,fontWeight:400,color:C.muted}}>匹</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {Object.entries(l.counts)
                      .filter(([spot])=>!filterSpot||spot===filterSpot)
                      .sort((a,b)=>b[1]-a[1])
                      .map(([spot,cnt])=>(
                        <span key={spot} style={{background:C.surface,borderRadius:5,padding:"3px 10px",fontSize:12,color:C.muted}}>
                          📍{spot} <span style={{color:C.gold,fontWeight:700}}>{cnt}</span>
                        </span>
                      ))
                    }
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </main>
    </div>
  );
}