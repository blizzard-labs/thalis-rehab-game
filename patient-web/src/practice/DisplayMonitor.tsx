import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PracticeRecord } from "./session";

export type DisplayState = {session:string; state:string; paired:boolean; connected:boolean; url:string|null; record:PracticeRecord|null};
export function DisplayMonitor({ initial, onClose }: {initial:DisplayState; onClose:()=>void}) {
  const [display,setDisplay] = useState(initial);
  const [error,setError] = useState("");
  const [qr,setQr] = useState("");
  useEffect(()=>{
    let current = true;
    if(display.url) void QRCode.toDataURL(display.url,{width:180}).then(image=>{if(current)setQr(image);}).catch(()=>{});
    return ()=>{current=false;};
  },[display.url]);
  useEffect(()=>{
    let current=true, timer=0;
    async function poll(){
      try{
        const res=await fetch("/api/staff/display",{cache:"no-store",signal:AbortSignal.timeout(4000)});
        if(!res.ok) throw new Error("Could not read display status.");
        const d=await res.json();
        if(!current) return;
        if(d?.session===initial.session) {setDisplay(d);setError("");}
        else {setError("This display session is no longer active.");return;}
      }catch(err){if(current)setError(err instanceof Error?err.message:"Connection interrupted.");}
      if(current) timer=window.setTimeout(poll,750);
    }
    void poll();
    return ()=>{current=false;clearTimeout(timer);};
  },[initial.session]);
  async function control(command:string){
    try{
      const res=await fetch("/api/staff/display/control",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({command,session:display.session})});
      if(!res.ok) throw new Error(await res.text());
      setDisplay(await res.json());setError("");
    }catch(err){setError(err instanceof Error?err.message:"Could not send control.");}
  }
  return <section className="practice-panel"><h1>Patient display</h1>
    <p role="status">{!display.paired ? "Waiting for the patient to pair…" : display.state==="complete" ? "Session complete"
      : display.connected ? "Display connected" : "Waiting for the display to reconnect…"}</p>
    {display.url && <div className="display-invite">{qr && <img src={qr} alt="Patient pairing QR code"/>}
      <p><a href={display.url} target="_blank" rel="noreferrer">Open patient display</a><br/>
        {display.url.startsWith("http://localhost") ? "Use a second window on this computer." : "Scan on the patient device using the clinic network."}</p>
    </div>}
    {display.record && <p>{Math.floor(display.record.elapsed)} s · {display.record.actions} actions · {display.record.rewards} rewards</p>}
    {error && <p role="alert">{error}</p>}
    <div className="button-row">
      {display.state==="waiting" && <button className="primary" disabled={!display.connected} onClick={()=>control("start")}>Start patient game</button>}
      {display.state==="playing" && <button onClick={()=>control("pause")}>Pause patient game</button>}
      {display.state==="paused" && <button onClick={()=>control("resume")}>Resume patient game</button>}
      {display.state!=="complete" && <button onClick={()=>control("end")}>{display.state==="ending"?"Finish with last saved record":"End display session"}</button>}
      {(display.state==="complete" || error) && <button onClick={onClose}>Return to roster</button>}
    </div>
  </section>;
}
