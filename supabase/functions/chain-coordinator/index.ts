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
 if(data.aud!=="chain-poller"||!Number.isInteger(data.exp)||data.exp<=Math.floor(Date.now()/1000))return null;
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
     if(!sessions.length)return json({error:"Faction not enrolled"},403);
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
       ||!/^\\d{1,128}$/.test(attackId)
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
   return json({error:"Unknown action"},400);
 }catch(e){return json({error:e instanceof Error?e.message:"Request failed"},502)}
});
