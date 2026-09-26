export function validateAudio(body: Record<string, unknown>) {
  if (body.nonSensitiveConfirmed !== true || typeof body.audio !== "string" || !/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) throw new Error("Confirm permission and supply a non-sensitive WAV clip.");
  const data = body.audio.split(",")[1], bytes = Uint8Array.from(atob(data), c=>c.charCodeAt(0));
  if (bytes.length < 6444 || bytes.length > 960044) throw new Error("Use a clip between 0.2 and 30 seconds.");
  const view = new DataView(bytes.buffer), text = (start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if (text(0,4)!=="RIFF" || text(8,12)!=="WAVE" || text(12,16)!=="fmt " || text(36,40)!=="data" || view.getUint32(4,true)!==bytes.length-8 || view.getUint32(16,true)!==16 || view.getUint16(20,true)!==1 || view.getUint16(22,true)!==1 || view.getUint32(24,true)!==16000 || view.getUint32(28,true)!==32000 || view.getUint16(32,true)!==2 || view.getUint16(34,true)!==16 || view.getUint32(40,true)!==bytes.length-44 || (bytes.length-44)%2) throw new Error("Invalid normalized audio format.");
  return {data,mimeType:"audio/wav",duration:(bytes.length-44)/32000};
}
