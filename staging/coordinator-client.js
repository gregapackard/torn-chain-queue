// Staging-only coordinator client. Not imported by the production userscript.
// Uses the SAME Torn API key the user already entered; never persists the key or credential.
// Supply a staging function URL explicitly. Never default to the production project.
export function createCoordinatorClient({endpoint,tornApiKey,onState=()=>{}}){
 if(!/^https:\/\//.test(endpoint)||!endpoint.includes("/functions/v1/chain-coordinator"))throw Error("Explicit HTTPS staging coordinator endpoint required");
 let credential=null,expiresAt=0,leaseToken=crypto.randomUUID(),timer=null,stopped=true,inFlight=false;
 async function call(body){
  const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||"Coordinator request failed");
  return data;
 }
 async function tick(){
  if(stopped||inFlight)return;inFlight=true;
  try{
   if(!credential||Date.now()/1000>expiresAt-60){
    const verified=await call({action:"verify",torn_api_key:tornApiKey()});
    credential=verified.token;expiresAt=verified.expires_at;
   }
   const result=await call({action:"claim",token:credential,lease_token:leaseToken});
   const lease=Array.isArray(result.lease)?result.lease[0]:result.lease;
   onState({owner:!!lease?.acquired,epoch:lease?.lease_epoch,expiresAt:lease?.lease_expires_at});
  }catch(e){onState({owner:false,error:e instanceof Error?e.message:String(e)})}
  finally{inFlight=false}
 }
 return {
  start(){if(!stopped)return;stopped=false;void tick();timer=setInterval(()=>void tick(),5000)},
  stop(){stopped=true;clearInterval(timer);timer=null;credential=null;onState({owner:false})},
  // Fencing and authoritative writes must be implemented server-side before enabling polling.
  get isStagingOnly(){return true}
 }
}
