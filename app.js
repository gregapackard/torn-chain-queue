import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const C=window.CHAIN_CONFIG||{}, $=s=>document.querySelector(s);
let sb=null, me=null, queue=[], lastAttackId=null, timerSeconds=null, pollHandle=null, channel=null;
const keyStore="chainQueue.tornApiKey";
const apiBase="https://api.torn.com/v2";
function say(s){$("#msg").textContent=s||""}
function fmt(sec){if(sec==null)return"--:--";sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")}
function render(){
 $("#timer").textContent=fmt(timerSeconds); $("#queueCount").textContent=queue.length;
 const next=queue[0]; $("#nextName").textContent=next?next.player_name:"Nobody queued";
 const hit=!!next&&timerSeconds!=null&&timerSeconds<=C.triggerSeconds;
 document.querySelector(".hero").classList.toggle("hitnow",hit);
 $("#callout").textContent=!next?"Waiting for players":hit?(me&&next.player_id===me.id?"🔥 YOU — HIT NOW":"🔥 "+next.player_name+" — HIT NOW"):"Next hit at "+fmt(C.triggerSeconds);
 $("#join").disabled=!me||queue.some(x=>x.player_id===me.id)||!sb; $("#leave").disabled=!me||!queue.some(x=>x.player_id===me.id)||!sb;
 $("#queue").innerHTML=queue.length?queue.map((x,i)=>`<li class="${i===0?"nextrow":""}"><span class="pos">${i+1}</span><span class="name">${esc(x.player_name)}</span><span class="you">${me&&x.player_id===me.id?"YOU":i===0?"NEXT":""}</span></li>`).join(""):'<li class="empty">No active queue yet.</li>';
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function torn(path){const key=localStorage.getItem(keyStore);if(!key)throw Error("Enter your Torn API key.");const r=await fetch(apiBase+path,{headers:{Authorization:key}});const j=await r.json();if(!r.ok||j.error){const code=Number(j.error?.code);const raw=j.error?.error||j.error?.message||"Torn API error";if(code===2)throw Error("Torn rejected this API key. Check that it was copied completely.");if(code===16)throw Error("This Torn API key does not have enough access for this request.");throw Error(raw);}return j}
async function identify(){const j=await torn("/user/basic"); const u=j.profile||j; me={id:Number(u.id||u.player_id),name:u.name}; if(!me.id||!me.name)throw Error("Could not read Torn identity.");$("#me").textContent=`Connected as ${me.name} [${me.id}]`;render()}
async function loadQueue(){if(!sb)return;const {data,error}=await sb.from("chain_queue").select("*").eq("session_id",C.sessionId).order("position").order("joined_at");if(error)throw error;queue=data||[];render()}
async function normalize(){if(!sb)return;await loadQueue();for(let i=0;i<queue.length;i++){if(queue[i].position!==i+1)await sb.from("chain_queue").update({position:i+1}).eq("session_id",C.sessionId).eq("player_id",queue[i].player_id)}await loadQueue()}
async function join(){if(!me)return;await loadQueue();const max=queue.reduce((m,x)=>Math.max(m,x.position||0),0);const {error}=await sb.from("chain_queue").upsert({session_id:C.sessionId,player_id:me.id,player_name:me.name,position:max+1},{onConflict:"session_id,player_id"});if(error)throw error;await normalize();say("Joined at the bottom.")}
async function leave(){if(!me)return;const {error}=await sb.from("chain_queue").delete().eq("session_id",C.sessionId).eq("player_id",me.id);if(error)throw error;await normalize();say("Left the queue.")}
async function moveHitToBottom(playerId,name){await loadQueue();const row=queue.find(x=>x.player_id===playerId);if(!row)return;const max=queue.reduce((m,x)=>Math.max(m,x.position||0),0);const {error}=await sb.from("chain_queue").update({position:max+1,last_hit_at:new Date().toISOString()}).eq("session_id",C.sessionId).eq("player_id",playerId);if(error)throw error;await normalize();$("#lastHit").textContent=name||row.player_name;say((name||row.player_name)+" hit → moved to bottom.")}
function attackRows(j){const v=j.attacks||j;return Array.isArray(v)?v:Object.values(v||{}).filter(x=>x&&typeof x==="object")}
function qualifies(a){const result=String(a.result||"").toLowerCase();return !["lost","stalemate","escape","assist"].some(x=>result.includes(x)) && Number(a.attacker?.id||a.attacker_id||0)>0}
async function pollTorn(){
 try{
  const chain=await torn("/faction/chain");const ch=chain.chain||chain;timerSeconds=Number(ch.timeout??ch.time_left??ch.cooldown??0);$("#chainCount").textContent=ch.current??ch.chain??"--";render();
  const attacks=await torn("/faction/attacks?limit=20&sort=DESC");const rows=attackRows(attacks).filter(qualifies).sort((a,b)=>Number(b.ended||b.timestamp||0)-Number(a.ended||a.timestamp||0));
  if(rows.length){const newest=rows[0], id=String(newest.id||newest.attack_id||newest.code||newest.ended);if(lastAttackId===null){lastAttackId=id}else if(id!==lastAttackId){const unseen=[];for(const a of rows){const aid=String(a.id||a.attack_id||a.code||a.ended);if(aid===lastAttackId)break;unseen.push(a)}lastAttackId=id;unseen.reverse();for(const a of unseen){const pid=Number(a.attacker?.id||a.attacker_id);const n=a.attacker?.name||a.attacker_name;await moveHitToBottom(pid,n)}}}
  $("#conn").textContent="LIVE";
 }catch(e){$("#conn").textContent="API ERROR";say(e.message)}
}
function setupRealtime(){if(!sb)return;channel=sb.channel("chain-"+C.sessionId).on("postgres_changes",{event:"*",schema:"public",table:"chain_queue",filter:"session_id=eq."+C.sessionId},()=>loadQueue()).subscribe()}
async function boot(){
 $("#apiKey").value=localStorage.getItem(keyStore)||"";
 if(C.supabaseUrl&&C.supabaseAnonKey){sb=createClient(C.supabaseUrl,C.supabaseAnonKey);$("#conn").textContent="READY";setupRealtime();await loadQueue()}else{say("Queue backend not configured yet. Torn connection can still be tested.")}
 $("#saveKey").onclick=async()=>{try{localStorage.setItem(keyStore,$("#apiKey").value.trim());await identify();await pollTorn();clearInterval(pollHandle);pollHandle=setInterval(pollTorn,C.pollMs)}catch(e){say(e.message)}};
 $("#join").onclick=()=>join().catch(e=>say(e.message));$("#leave").onclick=()=>leave().catch(e=>say(e.message));
 if(localStorage.getItem(keyStore)){try{await identify();await pollTorn();pollHandle=setInterval(pollTorn,C.pollMs)}catch(e){say(e.message)}}
 render();
}
boot();
