// ============================================================
// Viewer Export — Generates a standalone HTML viewer file
// Contains: Three.js (CDN), scene data, interaction runtime,
//           camera buttons, orbit-only controls, info panel.
// ============================================================

import type { SceneDocument, SceneNode } from "../document/types";
import type { ThreeBackend } from "../engine/threeBackend";

// ── Collected per-node data for the viewer ──

interface ViewerNodeData {
  id: string;
  name: string;
  type: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  visible: boolean;
  // Mesh
  geometryType?: string;
  material?: Record<string, any>;
  text3d?: { content: string; size: number; depth: number; bevel: boolean };
  // Light
  light?: {
    kind: string;
    color: string;
    intensity: number;
    castShadow: boolean;
    angle?: number;
    penumbra?: number;
    distance?: number;
    decay?: number;
  };
  // Camera marker
  camera?: { label: string; fov: number };
  // Interactions
  interactions?: SceneNode["interactions"];
}

export interface ViewerExportOptions {
  autospin?: number;      // 0=off, >0 speed, <0 reverse (rad/s)
  minDistance?: number;  // orbit min zoom
  maxDistance?: number;  // orbit max zoom
}

interface ViewerPackData {
  projectName: string;
  sceneSettings: SceneDocument["sceneSettings"];
  nodes: ViewerNodeData[];
  cameras: { label: string; position: [number, number, number]; rotation: [number, number, number] }[];
  viewerOptions?: ViewerExportOptions;
}

/**
 * Collect scene data from the editor and generate a standalone HTML viewer.
 */
export function exportViewerHTML(
  doc: SceneDocument,
  backend: ThreeBackend,
  options?: ViewerExportOptions
): string {
  // Collect nodes
  const nodes: ViewerNodeData[] = [];
  const cameras: ViewerPackData["cameras"] = [];

  for (const nodeId of doc.rootIds) {
    const node = doc.nodes[nodeId];
    if (!node) continue;

    const vn: ViewerNodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      transform: {
        position: [...node.transform.position],
        rotation: [...node.transform.rotation],
        scale: [...node.transform.scale],
      },
      visible: node.visible,
    };

    // Mesh data
    if (node.type === "mesh" && node.mesh) {
      vn.geometryType = node.mesh.geometryType;
      // Capture current material from backend
      if (node.runtimeObjectUuid) {
        const matProps = backend.getMaterialProps(node.runtimeObjectUuid);
        if (matProps) vn.material = matProps;
      }
      // Text3D
      if (node.mesh.geometryType === "text3d") {
        vn.text3d = {
          content: node.mesh.text3dContent ?? "Hello",
          size: node.mesh.text3dSize ?? 0.5,
          depth: node.mesh.text3dDepth ?? 0.2,
          bevel: node.mesh.text3dBevel ?? true,
        };
      }
    }

    // Light data
    if (node.type === "light" && node.light) {
      vn.light = { ...node.light };
    }

    // Camera marker
    if (node.type === "camera") {
      vn.camera = {
        label: node.cameraData?.label ?? node.name,
        fov: node.cameraData?.fov ?? 45,
      };
      cameras.push({
        label: node.cameraData?.label ?? node.name,
        position: [...node.transform.position],
        rotation: [...node.transform.rotation],
      });
    }

    // Interactions
    if (node.interactions && (node.interactions.states.length > 0 || node.interactions.events.length > 0)) {
      vn.interactions = node.interactions;
    }

    nodes.push(vn);
  }

  const pack: ViewerPackData = {
    projectName: doc.projectName,
    sceneSettings: doc.sceneSettings,
    nodes,
    cameras,
    viewerOptions: options ?? {},
  };

  return generateHTML(pack);
}

function generateHTML(pack: ViewerPackData): string {
  const dataJSON = JSON.stringify(pack);
  const bgColor = pack.sceneSettings.backgroundColor ?? "#1c1c1c";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${pack.projectName} — MultiView Viewer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:${bgColor};font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif}
#viewer{width:100%;height:100%;position:relative}
canvas{display:block;width:100%;height:100%}
.mv-ui{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10}
.mv-btn{padding:8px 16px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(30,30,30,.85);color:#fff;font-size:13px;cursor:pointer;transition:background .2s,border-color .2s;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mv-btn:hover{background:rgba(60,60,60,.9);border-color:rgba(255,255,255,.35)}
.mv-btn.active{background:rgba(77,166,255,.25);border-color:rgba(77,166,255,.6)}
.mv-info{position:absolute;top:16px;right:16px;background:rgba(30,30,30,.85);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:16px;color:#ccc;font-size:12px;min-width:180px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:10}
.mv-info h3{color:#fff;font-size:14px;margin-bottom:8px;font-weight:600}
.mv-info-row{display:flex;justify-content:space-between;margin-bottom:4px}
.mv-info-row span:last-child{color:#fff}
.mv-title{position:absolute;top:16px;left:16px;color:#fff;font-size:16px;font-weight:600;z-index:10;opacity:.8}
.mv-cam-btns{position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10}
</style>
</head>
<body>
<div id="viewer">
  <canvas id="c"></canvas>
  <div class="mv-title">${pack.projectName}</div>
  <div class="mv-cam-btns" id="camBtns"></div>
  <div class="mv-ui" id="controls"></div>
  <div class="mv-info" id="infoPanel"><h3>Scene Info</h3><div id="infoContent"></div></div>
</div>

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';

// ── Scene Data ──
const PACK = ${dataJSON};

// ── Easing ──
const easings={linear:t=>t,easeIn:t=>t*t*t,easeOut:t=>1-(1-t)**3,easeInOut:t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2,spring:t=>{const c=(2*Math.PI)/3;return t===0?0:t===1?1:2**(-10*t)*Math.sin((t*10-.75)*c)+1},bounce:t=>{const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375}};

// ── Setup ──
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=PACK.sceneSettings?.postProcessing?.toneMappingExposure??1;
const scene=new THREE.Scene();
const ss=PACK.sceneSettings;
if(ss?.backgroundType==='color')scene.background=new THREE.Color(ss.backgroundColor);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.1,2000);
camera.position.set(3,2.5,4);
const orbit=new OrbitControls(camera,canvas);
orbit.enableDamping=true;
orbit.dampingFactor=.08;
orbit.enablePan=false;
const vo=PACK.viewerOptions||{};
if(vo.minDistance!=null)orbit.minDistance=vo.minDistance;
if(vo.maxDistance!=null)orbit.maxDistance=vo.maxDistance;

// Ambient
const ambient=new THREE.AmbientLight(ss?.ambientLightColor??'#ffffff',ss?.ambientLightIntensity??.4);
scene.add(ambient);
const keyLight=new THREE.DirectionalLight(0xffffff,1.2);
keyLight.position.set(5,8,4);keyLight.castShadow=true;
keyLight.shadow.mapSize.set(2048,2048);scene.add(keyLight);

// Ground plane (subtle)
const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.15}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

// ── Build Scene ──
const objectById=new Map();
let totalTriangles=0;
let totalVertices=0;
let loadedFont=null;

function degToRad(d){return d*Math.PI/180}

function createGeometry(type){
  switch(type){
    case'box':return new THREE.BoxGeometry(1,1,1);
    case'sphere':return new THREE.SphereGeometry(.5,32,32);
    case'plane':return new THREE.PlaneGeometry(2,2);
    case'cylinder':return new THREE.CylinderGeometry(.5,.5,1,32);
    case'cone':return new THREE.ConeGeometry(.5,1,32);
    case'torus':return new THREE.TorusGeometry(.4,.15,24,48);
    case'capsule':return new THREE.CapsuleGeometry(.3,.6,16,32);
    case'circle':return new THREE.CircleGeometry(.5,32);
    case'ring':return new THREE.RingGeometry(.3,.5,32);
    case'dodecahedron':return new THREE.DodecahedronGeometry(.5);
    case'icosahedron':return new THREE.IcosahedronGeometry(.5);
    default:return new THREE.BoxGeometry(1,1,1);
  }
}

function applyMaterial(mat,props){
  if(!props)return;
  if(props.color)mat.color.set(props.color);
  if(props.metalness!==undefined)mat.metalness=props.metalness;
  if(props.roughness!==undefined)mat.roughness=props.roughness;
  if(props.emissive)mat.emissive.set(props.emissive);
  if(props.emissiveIntensity!==undefined)mat.emissiveIntensity=props.emissiveIntensity;
  if(props.opacity!==undefined){mat.opacity=props.opacity;mat.transparent=props.opacity<1}
  if(props.wireframe!==undefined)mat.wireframe=props.wireframe;
  if(props.flatShading!==undefined){mat.flatShading=props.flatShading;mat.needsUpdate=true}
  if(props.doubleSided)mat.side=THREE.DoubleSide;
}

async function buildScene(){
  const fontLoader=new FontLoader();
  for(const n of PACK.nodes){
    if(n.type==='mesh'&&n.geometryType){
      let geometry;
      if(n.geometryType==='text3d'&&n.text3d){
        if(!loadedFont){
          loadedFont=await fontLoader.loadAsync('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_regular.typeface.json');
        }
        geometry=new TextGeometry(n.text3d.content,{font:loadedFont,size:n.text3d.size,depth:n.text3d.depth,curveSegments:12,bevelEnabled:n.text3d.bevel,bevelThickness:.02,bevelSize:.01,bevelSegments:5});
        geometry.computeBoundingBox();
        const bb=geometry.boundingBox;
        geometry.translate(-(bb.max.x-bb.min.x)/2,-(bb.max.y-bb.min.y)/2,-(bb.max.z-bb.min.z)/2);
      } else {
        geometry=createGeometry(n.geometryType);
      }
      const mat=new THREE.MeshStandardMaterial({color:0xcccccc,roughness:.5});
      applyMaterial(mat,n.material);
      const mesh=new THREE.Mesh(geometry,mat);
      mesh.name=n.name;
      mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.position.fromArray(n.transform.position);
      mesh.rotation.set(degToRad(n.transform.rotation[0]),degToRad(n.transform.rotation[1]),degToRad(n.transform.rotation[2]));
      mesh.scale.fromArray(n.transform.scale);
      mesh.visible=n.visible;
      scene.add(mesh);
      objectById.set(n.id,mesh);
      if(geometry.index)totalTriangles+=geometry.index.count/3;
      else if(geometry.attributes.position)totalTriangles+=geometry.attributes.position.count/3;
      if(geometry.attributes.position)totalVertices+=geometry.attributes.position.count;
    }
    if(n.type==='light'&&n.light){
      let light;
      switch(n.light.kind){
        case'directional':light=new THREE.DirectionalLight(n.light.color,n.light.intensity);light.castShadow=n.light.castShadow;break;
        case'point':light=new THREE.PointLight(n.light.color,n.light.intensity,n.light.distance??0,n.light.decay??2);light.castShadow=n.light.castShadow;break;
        case'spot':light=new THREE.SpotLight(n.light.color,n.light.intensity,n.light.distance??0,n.light.angle??Math.PI/6,n.light.penumbra??0,n.light.decay??2);light.castShadow=n.light.castShadow;break;
        case'ambient':light=new THREE.AmbientLight(n.light.color,n.light.intensity);break;
        default:continue;
      }
      if(light){
        light.position.fromArray(n.transform.position);
        scene.add(light);
        objectById.set(n.id,light);
      }
    }
  }
}

// ── Interaction Runtime (minimal) ──
const transitions=[];
const pendingDelays=new Map();
const activeStates=new Map();

function captureOverrides(obj){
  const o={position:[obj.position.x,obj.position.y,obj.position.z],rotation:[THREE.MathUtils.radToDeg(obj.rotation.x),THREE.MathUtils.radToDeg(obj.rotation.y),THREE.MathUtils.radToDeg(obj.rotation.z)],scale:[obj.scale.x,obj.scale.y,obj.scale.z],visible:obj.visible};
  if(obj.isMesh){const m=obj.material;o.materialColor='#'+m.color.getHexString();o.opacity=m.opacity;if(m.emissive)o.emissive='#'+m.emissive.getHexString();o.emissiveIntensity=m.emissiveIntensity}
  return o;
}

function interpolateOverrides(obj,from,to,t){
  if(to.position){const f=from.position??[obj.position.x,obj.position.y,obj.position.z];obj.position.set(f[0]+(to.position[0]-f[0])*t,f[1]+(to.position[1]-f[1])*t,f[2]+(to.position[2]-f[2])*t)}
  if(to.rotation){const f=from.rotation??[THREE.MathUtils.radToDeg(obj.rotation.x),THREE.MathUtils.radToDeg(obj.rotation.y),THREE.MathUtils.radToDeg(obj.rotation.z)];obj.rotation.set(degToRad(f[0]+(to.rotation[0]-f[0])*t),degToRad(f[1]+(to.rotation[1]-f[1])*t),degToRad(f[2]+(to.rotation[2]-f[2])*t))}
  if(to.scale){const f=from.scale??[obj.scale.x,obj.scale.y,obj.scale.z];obj.scale.set(f[0]+(to.scale[0]-f[0])*t,f[1]+(to.scale[1]-f[1])*t,f[2]+(to.scale[2]-f[2])*t)}
  if(to.visible!==undefined&&t>=.5)obj.visible=to.visible;
  if(obj.isMesh){const m=obj.material;
    if(to.materialColor&&m.color){const fc=new THREE.Color(from.materialColor??('#'+m.color.getHexString()));const tc=new THREE.Color(to.materialColor);m.color.copy(fc).lerp(tc,t)}
    if(to.opacity!==undefined){const fo=from.opacity??m.opacity;m.opacity=fo+(to.opacity-fo)*t;m.transparent=m.opacity<1}
    if(to.emissive&&m.emissive){const fe=new THREE.Color(from.emissive??('#'+m.emissive.getHexString()));const te=new THREE.Color(to.emissive);m.emissive.copy(fe).lerp(te,t)}
    if(to.emissiveIntensity!==undefined){const fi=from.emissiveIntensity??m.emissiveIntensity;m.emissiveIntensity=fi+(to.emissiveIntensity-fi)*t}
  }
}

function transitionToState(nodeId,state,duration=300,easing='easeInOut',delay=0){
  const obj=objectById.get(nodeId);if(!obj)return;
  const pd=pendingDelays.get(nodeId);if(pd!==undefined)clearTimeout(pd);
  const start=()=>{
    pendingDelays.delete(nodeId);
    const from=captureOverrides(obj);
    const idx=transitions.findIndex(t=>t.nodeId===nodeId);if(idx>=0)transitions.splice(idx,1);
    transitions.push({nodeId,from,to:state.overrides,duration:Math.max(duration,1),easing,elapsed:0,onComplete:()=>activeStates.set(nodeId,state.id)});
  };
  if(delay>0){pendingDelays.set(nodeId,setTimeout(start,delay))}else start();
}

function fireEvent(nodeId,trigger){
  const n=PACK.nodes.find(nd=>nd.id===nodeId);
  if(!n?.interactions)return;
  for(const evt of n.interactions.events){
    if(evt.trigger===trigger){
      const action=n.interactions.actions.find(a=>a.id===evt.actionId);
      if(!action)continue;
      if(action.type==='transitionToState'){
        const tgtNode=action.targetNodeId?PACK.nodes.find(nd=>nd.id===action.targetNodeId):n;
        if(!tgtNode?.interactions)continue;
        const state=tgtNode.interactions.states.find(s=>s.id===action.targetStateId);
        if(state)transitionToState(tgtNode.id,state,action.duration??300,action.easing??'easeInOut',action.delay??0);
      }
      if(action.type==='toggleState'){
        const tgtNode=action.targetNodeId?PACK.nodes.find(nd=>nd.id===action.targetNodeId):n;
        if(!tgtNode?.interactions)continue;
        const cur=activeStates.get(tgtNode.id);
        const next=cur===action.stateA?action.stateB:action.stateA;
        const state=tgtNode.interactions.states.find(s=>s.id===next);
        if(state)transitionToState(tgtNode.id,state,action.duration??300,action.easing??'easeInOut',action.delay??0);
      }
      if(action.type==='openLink'&&action.url)window.open(action.url,'_blank');
    }
  }
}

// Fire "start" events
function fireStartEvents(){
  for(const n of PACK.nodes){
    if(n.interactions)fireEvent(n.id,'start');
  }
}

// ── Raycaster for hover/click ──
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
let hoveredId=null;

function pickNode(cx,cy){
  const rect=canvas.getBoundingClientRect();
  pointer.x=((cx-rect.left)/rect.width)*2-1;
  pointer.y=-((cy-rect.top)/rect.height)*2-1;
  raycaster.setFromCamera(pointer,camera);
  const meshes=[];
  for(const[id,obj]of objectById){if(obj.isMesh)meshes.push(obj)}
  const hits=raycaster.intersectObjects(meshes,true);
  if(hits.length===0)return null;
  let target=hits[0].object;
  for(const[id,obj]of objectById){if(obj===target)return id}
  return null;
}

canvas.addEventListener('click',e=>{
  const id=pickNode(e.clientX,e.clientY);
  if(id)fireEvent(id,'click');
});
canvas.addEventListener('dblclick',e=>{
  const id=pickNode(e.clientX,e.clientY);
  if(id)fireEvent(id,'doubleClick');
});
canvas.addEventListener('mousemove',e=>{
  const id=pickNode(e.clientX,e.clientY);
  if(id!==hoveredId){
    if(hoveredId)fireEvent(hoveredId,'mouseLeave');
    if(id)fireEvent(id,'mouseEnter');
    hoveredId=id;
  }
});

// ── Camera fly ──
let camTrans=null;
function flyTo(pos,rot,dur=1.2){
  const toPos=new THREE.Vector3(...pos);
  const dir=new THREE.Vector3(0,0,-1);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(degToRad(rot[0]),degToRad(rot[1]),degToRad(rot[2])));
  dir.applyQuaternion(q);
  const toTarget=toPos.clone().add(dir.multiplyScalar(2));
  camTrans={fromPos:camera.position.clone(),toPos,fromTarget:orbit.target.clone(),toTarget,duration:dur,elapsed:0};
}

// ── Camera Buttons ──
const camContainer=document.getElementById('camBtns');
PACK.cameras.forEach((c,i)=>{
  const btn=document.createElement('button');
  btn.className='mv-btn';btn.textContent=c.label;
  btn.addEventListener('click',()=>flyTo(c.position,c.rotation));
  camContainer.appendChild(btn);
});

// ── Bottom controls ──
const ctrlContainer=document.getElementById('controls');
let wireframeOn=false;
const wireBtn=document.createElement('button');wireBtn.className='mv-btn';wireBtn.textContent='Wireframe';
wireBtn.addEventListener('click',()=>{wireframeOn=!wireframeOn;wireBtn.classList.toggle('active',wireframeOn);scene.traverse(o=>{if(o.isMesh&&o.material)o.material.wireframe=wireframeOn})});
ctrlContainer.appendChild(wireBtn);

const resetBtn=document.createElement('button');resetBtn.className='mv-btn';resetBtn.textContent='Reset Camera';
resetBtn.addEventListener('click',()=>{camera.position.set(3,2.5,4);orbit.target.set(0,0,0);camTrans=null});
ctrlContainer.appendChild(resetBtn);

// ── Info Panel ──
await buildScene();
const infoContent=document.getElementById('infoContent');
infoContent.innerHTML=\`
  <div class="mv-info-row"><span>Meshes</span><span>\${PACK.nodes.filter(n=>n.type==='mesh').length}</span></div>
  <div class="mv-info-row"><span>Lights</span><span>\${PACK.nodes.filter(n=>n.type==='light').length}</span></div>
  <div class="mv-info-row"><span>Cameras</span><span>\${PACK.cameras.length}</span></div>
  <div class="mv-info-row"><span>Triangles</span><span>\${Math.round(totalTriangles).toLocaleString()}</span></div>
  <div class="mv-info-row"><span>Vertices</span><span>\${Math.round(totalVertices).toLocaleString()}</span></div>
\`;

// ── Render Loop ──
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.1);

  // Camera transition
  if(camTrans){
    camTrans.elapsed+=dt;
    const p=Math.min(camTrans.elapsed/camTrans.duration,1);
    const e=p<.5?4*p*p*p:1-(-2*p+2)**3/2;
    camera.position.lerpVectors(camTrans.fromPos,camTrans.toPos,e);
    orbit.target.lerpVectors(camTrans.fromTarget,camTrans.toTarget,e);
    if(p>=1)camTrans=null;
  }

  // Autospin (turntable)
  if(vo.autospin){
    const v=camera.position.clone().sub(orbit.target);
    v.applyAxisAngle(new THREE.Vector3(0,1,0),vo.autospin*dt);
    camera.position.copy(orbit.target).add(v);
  }

  // Transitions
  for(let i=transitions.length-1;i>=0;i--){
    const tr=transitions[i];
    tr.elapsed+=dt*1000;
    const prog=Math.min(tr.elapsed/tr.duration,1);
    const et=(easings[tr.easing]||easings.easeInOut)(prog);
    const obj=objectById.get(tr.nodeId);
    if(obj)interpolateOverrides(obj,tr.from,tr.to,et);
    if(prog>=1){tr.onComplete?.();transitions.splice(i,1)}
  }

  orbit.update();
  renderer.render(scene,camera);
}

function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
resize();
fireStartEvents();
animate();
<\/script>
</body>
</html>`;
}
