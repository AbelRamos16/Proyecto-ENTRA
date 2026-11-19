import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Instrumentales sintéticas originales: no contienen canciones ni voces de terceros.
export async function renderDemo(track,index,directory,ffmpeg='ffmpeg') {
  await mkdir(directory,{recursive:true});
  const rate=22050,seconds=16,frames=rate*seconds;
  const wav=Buffer.alloc(44+frames*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
  const beat=60/track.bpm,tau=Math.PI*2,minor=track.key.includes('menor');
  const progression=minor?[0,5,3,7]:[0,7,9,5];
  const scale=minor?[0,3,5,7,10,12]:[0,2,4,7,9,12];
  const phrase=[0,2,4,1,3,5,2,4];
  const hz=midi=>440*2**((midi-69)/12);
  let state=(index+1)*17431;
  const noise=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2147483648-1;};
  for(let sample=0;sample<frames;sample++){
    const t=sample/rate,bar=Math.floor(t/(beat*4))%4,phase=t%beat;
    const root=track.midi+progression[bar];
    const third=(minor?bar<2:bar===2)?3:4;
    const fade=Math.min(1,t/.15,(seconds-t)/.65);
    let pad=0;
    for(const note of [root,root+third,root+7]){
      const f=hz(note);
      pad+=(Math.sin(tau*f*t)+.2*Math.sin(tau*f*2*t))*.032;
    }
    const bassPhase=t%(beat*(index%2?1:.5));
    const bf=hz(root-24);
    const bass=(Math.sin(tau*bf*t)+.23*Math.sin(tau*bf*2*t))*.17*Math.exp(-bassPhase*3);
    const step=Math.floor(t/(beat*.5)),local=t%(beat*.5);
    const mf=hz(track.midi+12+scale[phrase[(step+index)%phrase.length]]);
    const lead=(Math.sin(tau*mf*t)+.12*Math.sin(tau*mf*3*t))*.09*Math.exp(-local*12);
    const kick=.26*Math.sin(tau*(48*phase+5*(1-Math.exp(-phase*34))))*Math.exp(-phase*22);
    const position=Math.floor(t/beat)%4;
    const snare=(position===1||position===3)?noise()*.105*Math.exp(-phase*35):0;
    const hat=noise()*.033*Math.exp(-(t%(beat*.5))*100);
    const value=Math.tanh((pad+bass+lead+kick+snare+hat)*1.25)*.78*fade;
    wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+sample*2);
  }
  const stem='entra_demo_'+String(index+1).padStart(2,'0');
  const input=join(directory,stem+'.wav'),output=join(directory,stem+'.mp3');
  await writeFile(input,wav);
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-codec:a','libmp3lame','-b:a','64k','-map_metadata','-1',output],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw new Error('No se pudo generar el MP3. Instala FFmpeg o indica --ffmpeg-path.');
  return {name:stem+'.mp3',bytes:new Uint8Array(await readFile(output))};
}
