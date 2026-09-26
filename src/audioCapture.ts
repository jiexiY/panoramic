// A bounded clip is decoded locally and normalized to mono PCM WAV before upload.
export async function prepareAudio(blob: Blob): Promise<{data: string; duration: number; url: string}> {
  if (blob.size > 8_000_000 || !blob.size) throw new Error("Choose an audio clip under 8 MB.");
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < .2 || decoded.duration > 30) throw new Error("Use a recording between 0.2 and 30 seconds.");
    const renderer = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = renderer.createBufferSource(); source.buffer = decoded; source.connect(renderer.destination); source.start();
    const pcm = (await renderer.startRendering()).getChannelData(0);
    const bytes = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(bytes);
    const label = (at:number,text:string) => [...text].forEach((c,i) => view.setUint8(at+i,c.charCodeAt(0)));
    label(0,"RIFF"); view.setUint32(4,bytes.byteLength-8,true); label(8,"WAVE"); label(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); label(36,"data"); view.setUint32(40,pcm.length*2,true);
    pcm.forEach((sample,i) => view.setInt16(44+i*2,Math.max(-1,Math.min(1,sample)) * (sample < 0 ? 32768 : 32767),true));
    const wav = new Blob([bytes],{type:"audio/wav"});
    const data = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read recording."));reader.readAsDataURL(wav);});
    return {data,duration:pcm.length/16000,url:URL.createObjectURL(wav)};
  } finally { await context.close(); }
}
