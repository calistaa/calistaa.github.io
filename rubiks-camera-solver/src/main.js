import Cube from 'cubejs';
import './style.css';

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
const FACE_NAMES = { U:'Up', R:'Right', F:'Front', D:'Down', L:'Left', B:'Back' };
const ORIENTATION = {
  U: 'Up face toward camera · Back edge at top',
  R: 'Right face toward camera · Up edge at top',
  F: 'Front face toward camera · Up edge at top',
  D: 'Down face toward camera · Front edge at top',
  L: 'Left face toward camera · Up edge at top',
  B: 'Back face toward camera · Up edge at top'
};
const DISPLAY = { U:'#f8fafc', R:'#ef4444', F:'#22c55e', D:'#facc15', L:'#f97316', B:'#3b82f6' };
const MOVE_TEXT = {
  U:'Turn the Up face clockwise', "U'":'Turn the Up face counter-clockwise', U2:'Turn the Up face 180°',
  R:'Turn the Right face clockwise', "R'":'Turn the Right face counter-clockwise', R2:'Turn the Right face 180°',
  F:'Turn the Front face clockwise', "F'":'Turn the Front face counter-clockwise', F2:'Turn the Front face 180°',
  D:'Turn the Down face clockwise', "D'":'Turn the Down face counter-clockwise', D2:'Turn the Down face 180°',
  L:'Turn the Left face clockwise', "L'":'Turn the Left face counter-clockwise', L2:'Turn the Left face 180°',
  B:'Turn the Back face clockwise', "B'":'Turn the Back face counter-clockwise', B2:'Turn the Back face 180°'
};

let stream = null;
let currentFaceIndex = 0;
let rawFaces = {};
let classifiedFaces = {};
let solutionMoves = [];
let moveIndex = 0;

const app = document.querySelector('#app');
app.innerHTML = `
<div class="app">
<header><div><h1>CubeCam<br>Solver</h1><p class="subtitle">Scan. Check. Solve.</p></div><span class="badge">3×3 cubes</span></header>
<section class="card" id="scannerCard">
  <div class="card-body"><div class="step-title"><h2 id="faceHeading">Scan the Up face</h2><span class="progress" id="progress">Face 1 of 6</span></div><p class="instructions" id="scanHelp">Line up all nine stickers inside the grid. Use bright, even lighting and avoid glare.</p></div>
  <div class="camera-wrap"><video id="video" autoplay playsinline muted></video><div class="orientation" id="orientation"></div><div class="guide">${'<span></span>'.repeat(9)}</div></div>
  <div class="card-body"><div class="controls"><button class="secondary" id="cameraBtn">Start camera</button><button class="primary" id="captureBtn" disabled>Capture face</button></div><div id="scanNotice"></div></div>
</section>
<section class="card"><div class="card-body"><div class="step-title"><h2>Captured faces</h2><span class="progress">Tap Reset to rescan</span></div><div class="faces" id="facesPreview"></div><button class="danger" id="resetBtn" style="width:100%;margin-top:14px">Reset scans</button></div></section>
<section class="card hidden" id="editorCard"><div class="card-body"><div class="step-title"><h2>Check detected colours</h2><span class="progress">Tap a sticker to change it</span></div><p class="instructions">Each colour must appear exactly nine times. The centre stickers are locked because they identify each face.</p><div class="editor" id="editor"></div><div id="validationNotice"></div><button class="primary" id="solveBtn" style="width:100%;margin-top:14px">Generate solution</button></div></section>
<section class="card hidden" id="solutionCard"><div class="card-body"><div class="step-title"><h2>Your solution</h2><span class="progress" id="moveCount"></span></div><p class="instructions">Clockwise means as you look directly at that face.</p><div class="solution" id="solution"></div><div class="move-detail"><div class="move-big" id="moveBig">—</div><div class="move-text" id="moveText"></div></div><div class="controls"><button class="secondary" id="prevBtn">Previous</button><button class="primary" id="nextBtn">Next</button></div></div></section>
<canvas id="canvas"></canvas><footer>Camera processing stays in your browser.</footer>
</div>`;

const video = document.querySelector('#video');
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently:true });
const $ = id => document.querySelector(id);

function setNotice(el, text, type='info') { el.innerHTML = text ? `<div class="notice ${type}">${text}</div>` : ''; }

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:1280 } }, audio:false });
    video.srcObject = stream;
    await video.play();
    $('#captureBtn').disabled = false;
    $('#cameraBtn').textContent = 'Restart camera';
    setNotice($('#scanNotice'), 'Camera ready. Keep the cube square to the camera.', 'success');
  } catch (error) {
    setNotice($('#scanNotice'), `Camera could not start: ${error.message}. Camera access requires permission and usually HTTPS.`, 'error');
  }
}

function averageSample(cx, cy, radius) {
  const data = ctx.getImageData(Math.round(cx-radius), Math.round(cy-radius), radius*2, radius*2).data;
  let r=0,g=0,b=0,n=0;
  for (let i=0;i<data.length;i+=4) {
    const max=Math.max(data[i],data[i+1],data[i+2]), min=Math.min(data[i],data[i+1],data[i+2]);
    if (max-min < 8 && max > 235) continue; // ignore a little glare
    r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++;
  }
  return n ? [r/n,g/n,b/n] : [0,0,0];
}

function captureFace() {
  if (!video.videoWidth) return;
  const side = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = side; canvas.height = side;
  const sx=(video.videoWidth-side)/2, sy=(video.videoHeight-side)/2;
  ctx.drawImage(video,sx,sy,side,side,0,0,side,side);
  const start=.23*side, spacing=.27*side, radius=Math.max(5,Math.round(.045*side));
  const samples=[];
  for(let row=0;row<3;row++) for(let col=0;col<3;col++) samples.push(averageSample(start+col*spacing,start+row*spacing,radius));
  rawFaces[FACE_ORDER[currentFaceIndex]]=samples;
  currentFaceIndex++;
  if (currentFaceIndex >= FACE_ORDER.length) finishScanning();
  updateUI();
}

function rgbToLab([r,g,b]) {
  r/=255; g/=255; b/=255;
  [r,g,b]=[r,g,b].map(v=>v>.04045?Math.pow((v+.055)/1.055,2.4):v/12.92);
  let x=(r*.4124+g*.3576+b*.1805)/.95047, y=(r*.2126+g*.7152+b*.0722), z=(r*.0193+g*.1192+b*.9505)/1.08883;
  [x,y,z]=[x,y,z].map(v=>v>.008856?Math.cbrt(v):(7.787*v)+(16/116));
  return [(116*y)-16, 500*(x-y), 200*(y-z)];
}
function dist(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }

function classifyAll() {
  const centres={}; FACE_ORDER.forEach(face=>centres[face]=rgbToLab(rawFaces[face][4]));
  FACE_ORDER.forEach(face=>{
    classifiedFaces[face]=rawFaces[face].map((rgb,i)=>{
      if(i===4) return face;
      const lab=rgbToLab(rgb);
      return FACE_ORDER.reduce((best,c)=>dist(lab,centres[c])<dist(lab,centres[best])?c:best,FACE_ORDER[0]);
    });
  });
}

function finishScanning(){ classifyAll(); $('#editorCard').classList.remove('hidden'); renderEditor(); validate(); $('#editorCard').scrollIntoView({behavior:'smooth'}); }

function updateUI(){
  const done=currentFaceIndex>=6;
  const face=FACE_ORDER[Math.min(currentFaceIndex,5)];
  $('#faceHeading').textContent=done?'All faces scanned':`Scan the ${FACE_NAMES[face]} face`;
  $('#progress').textContent=done?'6 faces captured':`Face ${currentFaceIndex+1} of 6`;
  $('#orientation').textContent=done?'Scanning complete':ORIENTATION[face];
  $('#captureBtn').disabled=done || !stream;
  $('#captureBtn').textContent=done?'All captured':'Capture face';
  renderPreviews();
}

function renderPreviews(){
  $('#facesPreview').innerHTML=FACE_ORDER.map(face=>{
    const vals=rawFaces[face];
    return `<div class="face-card"><div class="face-label"><b>${face} · ${FACE_NAMES[face]}</b><span>${vals?'✓':'—'}</span></div><div class="mini-grid">${(vals||Array(9).fill(null)).map(v=>`<span class="sticker" style="background:${v?`rgb(${v.join(',')})`:'#111827'}"></span>`).join('')}</div></div>`;
  }).join('');
}

function renderEditor(){
  $('#editor').innerHTML=FACE_ORDER.map(face=>`<div class="face-card"><div class="face-label"><b>${face} · ${FACE_NAMES[face]}</b></div><div class="edit-grid">${classifiedFaces[face].map((c,i)=>`<button class="sticker" data-face="${face}" data-index="${i}" ${i===4?'disabled':''} style="background:${DISPLAY[c]}" aria-label="${c}"></button>`).join('')}</div></div>`).join('');
  $('#editor').querySelectorAll('button:not(:disabled)').forEach(btn=>btn.addEventListener('click',()=>{
    const f=btn.dataset.face, i=Number(btn.dataset.index), pos=FACE_ORDER.indexOf(classifiedFaces[f][i]);
    classifiedFaces[f][i]=FACE_ORDER[(pos+1)%6]; renderEditor(); validate();
  }));
}

function validate(){
  const counts=Object.fromEntries(FACE_ORDER.map(f=>[f,0]));
  FACE_ORDER.forEach(f=>classifiedFaces[f]?.forEach(c=>counts[c]++));
  const bad=FACE_ORDER.filter(f=>counts[f]!==9);
  if(bad.length){ setNotice($('#validationNotice'),`Colour counts need correction: ${bad.map(f=>`${FACE_NAMES[f]} ${counts[f]}/9`).join(', ')}.`, 'error'); $('#solveBtn').disabled=true; return false; }
  setNotice($('#validationNotice'),'Colour counts look correct. The solver will perform a final physical-state check.', 'success'); $('#solveBtn').disabled=false; return true;
}

async function solveCube(){
  if(!validate()) return;
  $('#solveBtn').disabled=true; $('#solveBtn').textContent='Preparing solver…';
  await new Promise(r=>setTimeout(r,40));
  try {
    const facelets=FACE_ORDER.map(f=>classifiedFaces[f].join('')).join('');
    Cube.initSolver();
    const cube=Cube.fromString(facelets);
    const alg=cube.solve();
    solutionMoves=alg.trim()?alg.trim().split(/\s+/):[];
    moveIndex=0; renderSolution();
    $('#solutionCard').classList.remove('hidden'); $('#solutionCard').scrollIntoView({behavior:'smooth'});
  } catch(error) {
    setNotice($('#validationNotice'),'This colour arrangement is not a physically possible cube state. Recheck sticker colours and face orientation, especially the Up and Down faces.', 'error');
  } finally { $('#solveBtn').disabled=false; $('#solveBtn').textContent='Generate solution'; }
}

function renderSolution(){
  $('#moveCount').textContent=solutionMoves.length?`${solutionMoves.length} moves`:'Already solved';
  $('#solution').innerHTML=solutionMoves.map((m,i)=>`<button class="move ${i===moveIndex?'active':''}" data-i="${i}">${m}</button>`).join('');
  $('#solution').querySelectorAll('.move').forEach(b=>b.addEventListener('click',()=>{moveIndex=Number(b.dataset.i);renderSolution();}));
  const move=solutionMoves[moveIndex]; $('#moveBig').textContent=move||'✓'; $('#moveText').textContent=move?`${moveIndex+1} of ${solutionMoves.length}: ${MOVE_TEXT[move]}`:'Your cube is already solved.';
  $('#prevBtn').disabled=moveIndex<=0; $('#nextBtn').disabled=!solutionMoves.length||moveIndex>=solutionMoves.length-1;
}

function reset(){ rawFaces={}; classifiedFaces={}; currentFaceIndex=0; solutionMoves=[]; $('#editorCard').classList.add('hidden'); $('#solutionCard').classList.add('hidden'); setNotice($('#scanNotice'),''); updateUI(); }

$('#cameraBtn').addEventListener('click',startCamera);
$('#captureBtn').addEventListener('click',captureFace);
$('#resetBtn').addEventListener('click',reset);
$('#solveBtn').addEventListener('click',solveCube);
$('#prevBtn').addEventListener('click',()=>{if(moveIndex>0){moveIndex--;renderSolution();}});
$('#nextBtn').addEventListener('click',()=>{if(moveIndex<solutionMoves.length-1){moveIndex++;renderSolution();}});
updateUI();
