// STAGING ONLY. Not deployed. Torn key is verified server-side and never persisted.
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COORDINATOR_SIGNING_SECRET
const enc = new TextEncoder();
const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"content-type,authorization,apikey","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json"}});
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function unb64(s:string){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}
async function sign(payload:string,secret:string){
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
}
async function check(token:string,secret:string){
 const parts=token.split(".");if(parts.length!==2)return null;
 const [body,signature]=parts;
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 if(!await crypto.subtle.verify("HMAC",key,unb64(signature),enc.encode(body)))return null;
 const data=JSON.parse(new TextDecoder().decode(unb64(body)));
 if(data.aud!=="chain-poller"||!Number.isSafeInteger(data.sub)||data.sub<=0||!Number.isSafeInteger(data.faction)||data.faction<=0||data.session!=="faction:"+data.faction||!Number.isInteger(data.exp)||data.exp<=Math.floor(Date.now()/1000)||!Number.isInteger(data.iat)||data.iat>Math.floor(Date.now()/1000)+30)return null;
 return data;
}
async function torn(path:string,key:string){
 const response=await fetch("https://api.torn.com/v2"+path,{headers:{Authorization:"ApiKey "+key},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Torn verification unavailable");
 const body=await response.json();
 if(body.error)throw new Error("Torn key verification failed");
 return body;
}
async function dbRpc(fn:string,args:unknown,url:string,serviceKey:string){
 const response=await fetch(url+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"content-type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Coordinator lease service unavailable");
 return response.json();
}
async function dbRows(table:string,session:string,url:string,key:string,select:string){
 const response=await fetch(url+"/rest/v1/"+table+"?session_id=eq."+encodeURIComponent(session)+"&select="+encodeURIComponent(select),{headers:{apikey:key,Authorization:"Bearer "+key},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("Authorization state unavailable");
 return await response.json();
}
const positive=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const safeName=(v:unknown)=>typeof v==="string"&&v.length>=1&&v.length<=40;
const actions=new Set(["join","leave","energy","capability","pass_lead","remove","skip","session_control","signal_hit","take_lead","claim_stale_lead","set_active"]);
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const secret=Deno.env.get("COORDINATOR_SIGNING_SECRET")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(secret.length<32||!url||!serviceKey)return json({error:"Not configured"},503);
 try{
   const body=await req.json();
   if(body.action==="verify"){
     const key=String(body.torn_api_key||"");
     if(!/^[a-zA-Z0-9]{12,128}$/.test(key))return json({error:"Invalid API key format"},400);
     const [identity,membership]=await Promise.all([torn("/user/basic",key),torn("/user/faction",key)]);
     const player=identity.profile||identity;
     const faction=membership.faction||membership;
     const playerId=Number(player.id||player.player_id),factionId=Number(faction.id||faction.faction_id||membership.faction_id);
     if(!Number.isSafeInteger(playerId)||playerId<=0||!Number.isSafeInteger(factionId)||factionId<=0)return json({error:"Identity or faction unavailable for this key"},403);
     // Only licensed factions have a session; do not create sessions during verification.
     const session="faction:"+factionId;
     const lookup=await fetch(url+"/rest/v1/chain_sessions?session_id=eq."+encodeURIComponent(session)+"&select=session_id,active",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey},signal:AbortSignal.timeout(8000)});
     if(!lookup.ok)throw new Error("Session lookup unavailable");
     const sessions=await lookup.json();
     if(!sessions.length)return json({error:"Faction not enrolled"},403);\n     const allowed=await fetch(url+"/rest/v1/chain_allowed_factions?faction_id=eq."+factionId+"&enabled=eq.true&select=faction_id,expires_at",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey},signal:AbortSignal.timeout(8000)});\n     if(!allowed.ok)throw new Error("Faction authorization unavailable");\n     const allowedRows=await allowed.json();\n     if(!allowedRows.some((row:{expires_at:string|null})=>row.expires_at===null||Date.parse(row.expires_at)>Date.now()))return json({error:"Faction license inactive"},403);
     const now=Math.floor(Date.now()/1000);
     const claims={aud:"chain-poller",sub:playerId,faction:factionId,session,iat:now,exp:now+300};
     const payload=b64(enc.encode(JSON.stringify(claims)));
     return json({token:payload+"."+await sign(payload,secret),expires_at:claims.exp,player_id:playerId,session_id:session});
   }
   if(body.action==="claim"){
     const claims=await check(String(body.token||""),secret);
     if(!claims)return json({error:"Invalid or expired coordinator credential"},401);
     const token=String(body.lease_token||"");
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return json({error:"Invalid lease token"},400);
     // Private function can only be called using the server-held service role key.
     const result=await dbRpc("chain_claim_poll_lease",{p_session:claims.session,p_holder:claims.sub,p_token:token,p_ttl_seconds:15},url,serviceKey);
     return json({lease:result});
   }
   if(body.action==="record_attack"){
     const claims=await check(String(body.token||""),secret);
     if(!claims)return json({error:"Invalid or expired coordinator credential"},401);
     const leaseToken=String(body.lease_token||"");
     const epoch=Number(body.lease_epoch);
     const playerId=Number(body.player_id);
     const attackId=String(body.attack_id||"");
     const ended=body.ended_at==null?null:Number(body.ended_at);
     const name=String(body.player_name||"Player");
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leaseToken)
       ||!Number.isSafeInteger(epoch)||epoch<1
       ||!Number.isSafeInteger(playerId)||playerId<=0
       ||!/^[0-9]{1,128}$/.test(attackId)
       ||name.length<1||name.length>40
       ||(ended!==null&&(!Number.isSafeInteger(ended)||ended<=0)))
       return json({error:"Invalid attack or lease parameters"},400);
     // DB must atomically check lease holder, token, epoch and expiry.
     // Never use the legacy unfenced RPC from this endpoint.
     const result=await dbRpc("chain_record_attack_fenced",{
       p_session:claims.session,p_holder:claims.sub,p_token:leaseToken,p_epoch:epoch,
       p_player_id:playerId,p_player_name:name,p_attack_id:attackId,p_ended_at:ended
     },url,serviceKey);
     return json({recorded:result===true});
   }
   if(body.action==="apply_snapshot"){
     const claims=await check(String(body.token||""),secret);
     if(!claims||!positive(claims.sub))return json({error:"Invalid or expired credential"},401);
     const leaseToken=String(body.lease_token||"");
     const epoch=Number(body.lease_epoch);
     const fields=["torn_timestamp","current","max","end","cooldown"] as const;
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leaseToken)
       ||!Number.isSafeInteger(epoch)||epoch<1
       ||fields.some(k=>!Number.isSafeInteger(body[k])||body[k]<0)
       ||body.torn_timestamp<=0||body.current>1000000||body.max>1000000)
       return json({error:"Invalid snapshot or lease"},400);
     const applied=await dbRpc("chain_apply_snapshot_fenced",{
       p_session:claims.session,p_holder:claims.sub,p_token:leaseToken,p_epoch:epoch,
       p_torn_timestamp:body.torn_timestamp,p_current:body.current,p_max:body.max,
       p_end:body.end,p_cooldown:body.cooldown
     },url,serviceKey);
     return json({applied:applied===true});
   }
   if(actions.has(body.action)){
     const claims=await check(String(body.token||""),secret);
     if(!claims||!positive(claims.sub)||claims.session!=="faction:"+claims.faction)return json({error:"Invalid or expired identity credential"},401);
     const ownId=Number(claims.sub);
     const sessionRows=await dbRows("chain_sessions",claims.session,url,serviceKey,"leader_id,active");
     if(sessionRows.length!==1)return json({error:"Session unavailable"},403);
     const leader=Number(sessionRows[0].leader_id)===ownId;
     const action=String(body.action);
     const target=Number(body.target_id);
     const leaderAction=["pass_lead","remove","skip","session_control"].includes(action);
     if(leaderAction&&!leader)return json({error:"Only the current leader may perform this action"},403);
     if(["pass_lead","remove","skip"].includes(action)&&!positive(target))return json({error:"Invalid target"},400);
     let fn="",args:Record<string,unknown>={p_session:claims.session};
     switch(action){
       case "join":
         if(!safeName(body.player_name))return json({error:"Invalid name"},400);
         fn="chain_join_v2";args={...args,p_player_id:ownId,p_player_name:body.player_name,p_can_lead:body.can_lead===true};break;
       case "set_active":
         if(Number(Deno.env.get("CHAIN_OWNER_TORN_ID"))!==ownId||typeof body.active!=="boolean")return json({error:"Owner authorization required"},403);
         fn="chain_set_active";args={...args,p_player_id:ownId,p_active:body.active};break;
       case "take_lead":fn="chain_take_lead";args={...args,p_player_id:ownId};break;
       case "claim_stale_lead":fn="chain_claim_stale_lead";args={...args,p_player_id:ownId};break;
       case "leave":fn="chain_leave";args={...args,p_player_id:ownId};break;
       case "energy":
         if(!Number.isInteger(body.current)||!Number.isInteger(body.max)||body.current<0||body.max<0||body.current>1000||body.max>1000)return json({error:"Invalid energy"},400);
         fn="chain_energy";args={...args,p_player_id:ownId,p_current:body.current,p_max:body.max};break;
       case "capability":fn="chain_capability";args={...args,p_player_id:ownId,p_can_lead:body.can_lead===true};break;
       case "pass_lead":fn="chain_pass_lead";args={...args,p_current_leader:ownId,p_new_leader:target};break;
       case "remove":case "skip":
         fn=action==="remove"?"chain_remove":"chain_skip";args={...args,p_leader_id:ownId,p_player_id:target};break;
       case "session_control":
         if(!["tempo","manual_hit","toggle_pause","heartbeat"].includes(body.control)||typeof body.value!=="string"&&body.value!=null)return json({error:"Unsupported control"},400);
         fn="chain_session_control";args={...args,p_leader_id:ownId,p_action:body.control,p_value:body.value??null};break;
       case "signal_hit":
         if(typeof body.signal_id!=="string"||body.signal_id.length<1||body.signal_id.length>128)return json({error:"Invalid signal"},400);
         if(body.ended_at!=null&&(!positive(body.ended_at)||!Number.isSafeInteger(Number(body.ended_at))))return json({error:"Invalid end time"},400);
         fn="chain_signal_hit_v2";args={...args,p_player_id:ownId,p_signal_id:body.signal_id,p_ended_at:body.ended_at??null};break;
     }
     // Caller cannot choose the RPC or impersonate a different player ID.
     const result=await dbRpc(fn,args,url,serviceKey);
     return json({result});
   }
   return json({error:"Unknown action"},400);
 }catch(e){return json({error:e instanceof Error?e.message:"Request failed"},502)}
});
