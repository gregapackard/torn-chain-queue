from pathlib import Path
p=Path('greasyfork/chain-manager.user.js')
lines=p.read_text().splitlines()
out=[]
for line in lines:
    line=line.replace('// @version      0.9.34','// @version      0.9.35')
    line=line.replace('const VERSION="0.9.34";','const VERSION="0.9.35";')
    line=line.replace('let S="pending",factionId=0,activeLoop=false,rtSocket=null,rtHeartbeat=null,rtRef=0;','let S="pending",factionId=0,activeLoop=false,rtSocket=null,rtHeartbeat=null,rtRef=0,rtJoined=false,lastFailoverCheck=0;')
    if line.startswith('function rtStop(){'):
        line='function rtStop(){clearTimeout(window.__cqRtReconnect);clearInterval(rtHeartbeat);rtHeartbeat=null;rtJoined=false;if(rtSocket){try{rtSocket.onclose=null;rtSocket.close()}catch{}}rtSocket=null}'
    elif line.startswith('function rtSend('):
        line='function rtSend(topic,event,payload){if(rtSocket&&rtSocket.readyState===1)try{let ref=String(++rtRef),m={topic,event,payload,ref};if(event==="phx_join")m.join_ref=ref;rtSocket.send(JSON.stringify(m))}catch{}}'
    elif line.startswith('function rtApplySession('):
        line='function rtApplySession(d){let r=d?.record||d?.new||{};if(String(r.session_id||"")!==S)return;let wasLeader=leader();session={...session,...r};if(!wasLeader&&leader())lastChainSnapshotPoll=0;lastSharedLoad=Date.now();localClock();render();if(session.active===false)stopActiveLoop()}'
    elif line.startswith('function startRealtime(){'):
        line='function startRealtime(){if(rtSocket||!activeLoop||!session.active||S==="pending")return;try{let ws=U.replace(/^https:/,"wss:")+"/realtime/v1/websocket?apikey="+encodeURIComponent(K)+"&vsn=1.0.0",topic="realtime:chain-manager:"+S;rtJoined=false;rtSocket=new WebSocket(ws);rtSocket.onopen=()=>{rtSend(topic,"phx_join",{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:"*",schema:"public",table:"chain_queue",filter:"session_id=eq."+S},{event:"UPDATE",schema:"public",table:"chain_sessions",filter:"session_id=eq."+S}]},access_token:K});clearInterval(rtHeartbeat);rtHeartbeat=setInterval(()=>rtSend("phoenix","heartbeat",{}),25000)};rtSocket.onmessage=e=>{try{let m=JSON.parse(e.data);if(m?.event==="phx_reply"){if(m?.payload?.status==="ok")rtJoined=true;else{rtJoined=false;try{rtSocket.close()}catch{}}return}if(m?.event==="phx_error"){rtJoined=false;try{rtSocket.close()}catch{};return}if(m?.event!=="postgres_changes")return;let d=m?.payload?.data||m?.payload||{};if(d.table==="chain_queue")rtApplyQueue(d);else if(d.table==="chain_sessions")rtApplySession(d)}catch{}};rtSocket.onerror=()=>{rtJoined=false};rtSocket.onclose=()=>{rtJoined=false;clearInterval(rtHeartbeat);rtHeartbeat=null;rtSocket=null;if(activeLoop&&session.active){clearTimeout(window.__cqRtReconnect);window.__cqRtReconnect=setTimeout(startRealtime,5000)}}}catch{rtJoined=false;rtSocket=null}}'
    elif line.startswith('async function startActiveLoop(){'):
        line=line.replace('try{await syncChainSnapshot()}catch(e){','if(leader())try{await syncChainSnapshot()}catch(e){',1)
    elif line.startswith('async function control('):
        line='async function control(action,value=null){if(!leader())return false;let r=await rpc("chain_session_control",{p_session:S,p_leader_id:me.id,p_action:action,p_value:value==null?null:String(value)});if(!rtJoined)await load();return r}'
    if 'if(Date.now()-lastSharedLoad>=60000)try{await load()}' in line:
        line=line.replace('if(Date.now()-lastSharedLoad>=60000)try{await load()}','if(Date.now()-lastSharedLoad>=(rtJoined?300000:30000))try{await load()}')
    if line.startswith('function myPos(){'):
        out.append('async function maybeFailover(){if(leader()||!me||Date.now()-lastFailoverCheck<15000)return;let mine=q.find(x=>+x.player_id===me.id);if(!mine?.can_lead)return;lastFailoverCheck=Date.now();let t=Date.parse(session.leader_heartbeat_at||session.updated_at||0);if(session.leader_id&&Number.isFinite(t)&&Date.now()-t<45000)return;try{let won=await rpc("chain_claim_stale_lead",{p_session:S,p_player_id:me.id});if(won){await load();if(leader()){lastChainSnapshotPoll=0;await syncChainSnapshot();msg("Leader failover — you are Chain Lead")}}}catch(e){await reportError("Leader failover",e,"chain_claim_stale_lead")}}')
    out.append(line)
    if 'try{await pollMine()}catch(e)' in line:
        out.append('   try{await maybeFailover()}catch(e){await reportError("Leader failover loop",e,"chain_claim_stale_lead")}')
text='\n'.join(out)+'\n'
for token in ['0.9.35','chain_claim_stale_lead','join_ref','rtJoined?300000:30000']:
    assert token in text, token
p.write_text(text)
