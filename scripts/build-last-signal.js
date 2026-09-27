/* Original audio and edit assembly for LAST SIGNAL. Requires local ffmpeg. */
const fs = require('fs');
const { execFileSync } = require('child_process');

const root = process.cwd();
const ff = process.env.FFMPEG || '/tmp/last-signal-tools/ffmpeg';
const sr = 48000, dur = 30, n = sr * dur;
const l = new Float32Array(n), r = new Float32Array(n);
const bpm = 96, beat = 60 / bpm;
function add(t, seconds, fn, gain, pan=0) {
  const a = Math.max(0, Math.floor(t*sr)), b = Math.min(n, Math.floor((t+seconds)*sr));
  const gl = gain * Math.sqrt((1-pan)/2), gr = gain * Math.sqrt((1+pan)/2);
  for(let i=a;i<b;i++) { const x=(i-a)/sr; const v=fn(x,seconds); l[i]+=v*gl; r[i]+=v*gr; }
}
const env=(x,a,d)=>Math.min(1,x/a)*Math.exp(-x/d);
const sine=f=>x=>Math.sin(2*Math.PI*f*x);
// warm low-pass-ish bass, kick, metallic hats, and original minor motif
for(let b=0;b<48;b++) {
  const t=b*beat, build=t>9.5?1:0.42;
  add(t, .40, x=>Math.sin(2*Math.PI*(55-36*x)*x)*env(x,.008,.14), .72*build);
  if(b%2===1) add(t, .12, x=>(Math.random()*2-1)*env(x,.002,.028), .10*build, .12);
  const bass=[43.65,43.65,51.91,38.89][b%4];
  add(t+.02,.55,x=>(Math.sin(2*Math.PI*bass*x)+.25*Math.sin(2*Math.PI*bass*2*x))*env(x,.025,.30),.24*build,-.2);
}
for(let k=0;k<192;k++) { const t=k*beat/4; if(t>9.5) add(t,.045,x=>(Math.random()*2-1)*env(x,.001,.013),.055, k%2?.55:-.55); }
// hazy pad chord changes; each is composed only for this film
const chords=[[146.83,174.61,220],[130.81,155.56,196],[116.54,146.83,174.61],[138.59,164.81,207.65]];
for(let c=0;c<12;c++) for(const f of chords[c%4]) add(c*2.5,2.7,x=>Math.sin(2*Math.PI*f*x+.18*Math.sin(2*Math.PI*.17*x))*Math.min(1,x/.6)*Math.exp(-x/2.2),.038,c%2?.2:-.2);
const motif=[220,261.63,293.66,261.63,196,220,174.61,196];
for(let m=0;m<32;m++) { const t=10+m*beat/2; if(t<29) { const f=motif[m%motif.length]*(m>23?1:0.5); add(t,.38,x=>(Math.sin(2*Math.PI*f*x)+.28*Math.sin(2*Math.PI*f*2*x))*env(x,.018,.20),m>23?.16:.10,m%2?.28:-.28); }}
// signal pulse at terminal and long last resolved accent / natural decay
add(12.45,.65,x=>Math.sin(2*Math.PI*(520+180*x)*x)*env(x,.006,.18),.16);
for(const f of [196,246.94,293.66]) add(28.65,1.35,x=>Math.sin(2*Math.PI*f*x)*Math.min(1,x/.04)*Math.exp(-x/.67),.14);
// gentle rain/machinery bed, deterministic noise-ish filtered by envelope
let last=0; for(let i=0;i<n;i++) { const white=Math.sin(i*12.9898)*43758.5453%1-.5; last=.985*last+.015*white; const v=last*.035; l[i]+=v; r[i]+=v; }
// limiter and PCM WAV
const data=Buffer.alloc(44+n*8); data.write('RIFF'); data.writeUInt32LE(36+n*8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(3,20); data.writeUInt16LE(2,22); data.writeUInt32LE(sr,24); data.writeUInt32LE(sr*8,28); data.writeUInt16LE(8,32); data.writeUInt16LE(32,34); data.write('data',36); data.writeUInt32LE(n*8,40);
for(let i=0;i<n;i++){ data.writeFloatLE(Math.tanh(l[i]*.82),44+i*8); data.writeFloatLE(Math.tanh(r[i]*.82),44+i*8+4); }
fs.mkdirSync('artifacts',{recursive:true}); fs.writeFileSync('artifacts/last-signal-original.wav',data);
// Each five-second chapter has a real camera move. Scale source first to avoid edges during zoom.
const cuts=[
  ['assets/scene1.jpg','zoom+0.00045','iw/2-(iw/zoom/2)','ih/2-(ih/zoom/2)'],
  ['assets/scene1.jpg','zoom+0.00025','min(iw-iw/zoom,iw/5+on*2)','ih/2-(ih/zoom/2)'],
  ['assets/scene2.jpg','zoom+0.00062','iw/2-(iw/zoom/2)','ih/2-(ih/zoom/2)'],
  ['assets/scene4.jpg','zoom+0.00028','min(iw-iw/zoom,on*3)','ih/2-(ih/zoom/2)'],
  ['assets/scene3.jpg','zoom+0.00035','iw/2-(iw/zoom/2)','ih/2-(ih/zoom/2)'],
  ['assets/scene3.jpg','zoom+0.00016','iw/2-(iw/zoom/2)','ih/2-(ih/zoom/2)']
];
for(let i=0;i<cuts.length;i++) {
  const [src,z,x,y]=cuts[i];
  const vf=`scale=1700:1275,zoompan=z='if(lte(on,1),1.0,${z})':x='${x}':y='${y}':d=120:s=1280x960:fps=24,eq=contrast=1.05:saturation=0.90,noise=alls=3:allf=t+u`;
  execFileSync(ff,['-y','-loop','1','-i',src,'-vf',vf,'-frames:v','120','-an',`artifacts/chapter${i+1}.mp4`],{stdio:'inherit'});
}
fs.writeFileSync('artifacts/chapters.txt',cuts.map((_,i)=>`file 'chapter${i+1}.mp4'`).join('\n')+'\n');
execFileSync(ff,['-y','-f','concat','-safe','0','-i','artifacts/chapters.txt','-i','artifacts/last-signal-original.wav','-filter_complex','[0:v]fps=24,format=yuv420p[v];[1:a]aresample=48000,alimiter=limit=0.92[a]','-map','[v]','-map','[a]','-t','30','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-c:a','aac','-b:a','160k','-ac','2','artifacts/video.mp4'],{stdio:'inherit'});
