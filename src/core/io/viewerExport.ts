// ============================================================
// Viewer Export - Generates a standalone HTML viewer file
// Contains: Three.js (CDN), scene data, interaction runtime,
//           camera buttons, orbit-only controls, info panel.
// ============================================================

import type { SceneDocument, SceneNode, MeshGeometryData } from "../document/types";
import type { ThreeBackend } from "../engine/threeBackend";
import {
  mergeViewerExportOptions,
  type ViewerExportOptions,
} from "./viewerExportOptions";

export type { ViewerExportOptions } from "./viewerExportOptions";

// -- Collected per-node data for the viewer --

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
  customGeometry?: MeshGeometryData;
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

interface ViewerPackData {
  projectName: string;
  sceneSettings: SceneDocument["sceneSettings"];
  nodes: ViewerNodeData[];
  cameras: {
    label: string;
    position: [number, number, number];
    rotation: [number, number, number];
  }[];
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

    if (node.type === "mesh" && node.mesh) {
      vn.geometryType = node.mesh.geometryType;
      if (node.mesh.customGeometry) {
        vn.customGeometry = node.mesh.customGeometry;
      }
      if (node.runtimeObjectUuid) {
        const matProps = backend.getMaterialProps(node.runtimeObjectUuid);
        if (matProps) vn.material = matProps;
      }
      if (node.mesh.geometryType === "text3d") {
        vn.text3d = {
          content: node.mesh.text3dContent ?? "Hello",
          size: node.mesh.text3dSize ?? 0.5,
          depth: node.mesh.text3dDepth ?? 0.2,
          bevel: node.mesh.text3dBevel ?? true,
        };
      }
    }

    if (node.type === "light" && node.light) {
      vn.light = { ...node.light };
    }

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

    if (
      node.interactions &&
      (node.interactions.states.length > 0 || node.interactions.events.length > 0)
    ) {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeInlineCSS(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function normalizeAspectRatio(value: string): string {
  const trimmed = value.trim();
  const colon = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/;
  const slash = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;

  const colonMatch = trimmed.match(colon);
  if (colonMatch) return `${colonMatch[1]} / ${colonMatch[2]}`;

  const slashMatch = trimmed.match(slash);
  if (slashMatch) return `${slashMatch[1]} / ${slashMatch[2]}`;

  return "16 / 9";
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace("#", "");
  if (!/^([0-9a-fA-F]{6})$/.test(clean)) {
    return `rgba(77,166,255,${alpha})`;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function generateHTML(pack: ViewerPackData): string {
  const vo = mergeViewerExportOptions(pack.viewerOptions);
  const displayTitle = vo.title?.trim() ? vo.title.trim() : pack.projectName;
  const safeTitle = escapeHtml(displayTitle);
  const safeDescription = escapeHtml(vo.description?.trim() ?? "");
  const metaDescription =
    safeDescription.length > 0
      ? safeDescription
      : `${safeTitle} interactive 3D viewer`;

  const bgColor = pack.sceneSettings.backgroundColor ?? "#1c1c1c";
  const aspectRatio = normalizeAspectRatio(vo.aspectRatio ?? "16 / 9");
  const loadingTitle = escapeHtml(vo.loadingTitle ?? "Loading Viewer");
  const loadingSubtitle = escapeHtml(vo.loadingSubtitle ?? "Preparing scene...");
  const loadingBackground = vo.loadingBackground ?? "#101317";
  const loadingTextColor = vo.loadingTextColor ?? "#ffffff";
  const loadingAccentColor = vo.loadingAccentColor ?? "#4da6ff";
  const accentSoft = hexToRgba(loadingAccentColor, 0.24);
  const bodyThemeClass = vo.theme === "light" ? "mv-theme-light" : "mv-theme-dark";
  const bodyResponsiveClass = vo.responsiveEmbed ? "mv-embed-responsive" : "";
  const bodyClass = `${bodyThemeClass} ${bodyResponsiveClass}`.trim();
  const customCss = sanitizeInlineCSS(vo.customCss?.trim() ?? "");
  const previewImage = vo.previewImageDataUrl ?? "";

  const safePack: ViewerPackData = {
    ...pack,
    viewerOptions: {
      ...vo,
      // custom CSS is injected as dedicated style tag, not read from runtime pack
      customCss: undefined,
      // preview poster is injected into markup and not needed in runtime data
      previewImageDataUrl: undefined,
    },
  };

  const dataJSON = JSON.stringify(safePack).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="${metaDescription}" />
<title>${safeTitle} - MultiView Viewer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --mv-bg:${bgColor};
  --mv-panel-bg:rgba(30,30,30,.85);
  --mv-panel-border:rgba(255,255,255,.18);
  --mv-text:#f7f7f7;
  --mv-text-muted:#cfcfcf;
  --mv-accent:${loadingAccentColor};
  --mv-accent-soft:${accentSoft};
  --mv-aspect-ratio:${aspectRatio};
  --mv-loading-bg:${loadingBackground};
  --mv-loading-text:${loadingTextColor};
  --mv-loading-accent:${loadingAccentColor};
}
html,body{width:100%;height:100%;overflow:hidden;background:var(--mv-bg);color:var(--mv-text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif}
body.mv-theme-light{
  --mv-panel-bg:rgba(255,255,255,.88);
  --mv-panel-border:rgba(0,0,0,.15);
  --mv-text:#1a1a1a;
  --mv-text-muted:#4d4d4d;
  --mv-accent:#267cff;
  --mv-accent-soft:rgba(38,124,255,.18);
}
body.mv-embed-responsive{
  display:grid;
  place-items:center;
  padding:14px;
  background:radial-gradient(120% 120% at 50% 30%, rgba(255,255,255,.05) 0%, transparent 60%),var(--mv-bg);
}
#viewer{width:100%;height:100%;position:relative;background:var(--mv-bg)}
body.mv-embed-responsive #viewer{
  width:min(100%,calc(100vh * var(--mv-aspect-ratio)));
  height:auto;
  max-height:100vh;
  aspect-ratio:var(--mv-aspect-ratio);
  border-radius:14px;
  overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.35);
}
canvas{display:block;width:100%;height:100%}
.mv-ui{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10}
.mv-btn{padding:8px 16px;border:1px solid var(--mv-panel-border);border-radius:8px;background:var(--mv-panel-bg);color:var(--mv-text);font-size:13px;cursor:pointer;transition:background .2s,border-color .2s,transform .2s;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mv-btn:hover{border-color:var(--mv-accent);transform:translateY(-1px)}
.mv-btn.active{background:var(--mv-accent-soft);border-color:var(--mv-accent)}
.mv-info{position:absolute;top:16px;right:16px;background:var(--mv-panel-bg);border:1px solid var(--mv-panel-border);border-radius:12px;padding:16px;color:var(--mv-text-muted);font-size:12px;min-width:180px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:10}
.mv-info h3{color:var(--mv-text);font-size:14px;margin-bottom:8px;font-weight:600}
.mv-info-row{display:flex;justify-content:space-between;margin-bottom:4px}
.mv-info-row span:last-child{color:var(--mv-text)}
.mv-title{position:absolute;top:16px;left:16px;color:var(--mv-text);font-size:16px;font-weight:600;z-index:10;opacity:.9}
.mv-description{position:absolute;top:42px;left:16px;max-width:min(40vw,420px);font-size:12px;line-height:1.45;color:var(--mv-text-muted);z-index:10;background:var(--mv-panel-bg);border:1px solid var(--mv-panel-border);border-radius:10px;padding:8px 10px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mv-cam-btns{position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10}
.mv-loading{position:absolute;inset:0;z-index:25;display:flex;align-items:center;justify-content:center;background:var(--mv-loading-bg);transition:opacity .35s ease,visibility .35s ease}
.mv-loading.is-hidden{opacity:0;visibility:hidden;pointer-events:none}
.mv-loading-preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(2px);transform:scale(1.02)}
.mv-loading-backdrop{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.54))}
.mv-loading-content{position:relative;z-index:1;min-width:min(90vw,360px);text-align:center;padding:22px;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.2);color:var(--mv-loading-text);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.mv-loading-spinner{width:30px;height:30px;border:2px solid rgba(255,255,255,.24);border-top-color:var(--mv-loading-accent);border-radius:50%;margin:0 auto 10px;animation:mv-spin .8s linear infinite}
.mv-loading-title{font-size:15px;font-weight:600;margin-bottom:4px}
.mv-loading-subtitle{font-size:12px;opacity:.9}
.mv-loading-progress{margin-top:12px;height:4px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden}
.mv-loading-progress span{display:block;height:100%;width:0;background:var(--mv-loading-accent);transition:width .2s ease}
@keyframes mv-spin{to{transform:rotate(360deg)}}
</style>
${customCss ? `<style id="mv-custom-css">\n${customCss}\n</style>` : ""}
</head>
<body class="${bodyClass}">
<div id="viewer">
  <canvas id="c"></canvas>
  <div class="mv-title">${safeTitle}</div>
  ${safeDescription ? `<div class="mv-description">${safeDescription}</div>` : ""}
  <div class="mv-cam-btns" id="camBtns"></div>
  <div class="mv-ui" id="controls"></div>
  <div class="mv-info" id="infoPanel"><h3>Scene Info</h3><div id="infoContent"></div></div>
  <div class="mv-loading${vo.loadingEnabled === false ? " is-hidden" : ""}" id="mvLoading">
    ${previewImage ? `<img class="mv-loading-preview" src="${previewImage}" alt="Preview" />` : ""}
    <div class="mv-loading-backdrop"></div>
    <div class="mv-loading-content">
      <div class="mv-loading-spinner"></div>
      <div class="mv-loading-title">${loadingTitle}</div>
      <div class="mv-loading-subtitle" id="mvLoadingSubtitle">${loadingSubtitle}</div>
      <div class="mv-loading-progress"><span id="mvLoadingProgress"></span></div>
    </div>
  </div>
</div>

<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';

// -- Scene Data --
const PACK = ${dataJSON};

// -- Easing --
const easings={linear:t=>t,easeIn:t=>t*t*t,easeOut:t=>1-(1-t)**3,easeInOut:t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2,spring:t=>{const c=(2*Math.PI)/3;return t===0?0:t===1?1:2**(-10*t)*Math.sin((t*10-.75)*c)+1},bounce:t=>{const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375}};

const vo=PACK.viewerOptions||{};
const viewerEl=document.getElementById('viewer');
const infoPanel=document.getElementById('infoPanel');
if(vo.showInfoPanel===false&&infoPanel)infoPanel.style.display='none';

const loadingEl=document.getElementById('mvLoading');
const loadingProgressEl=document.getElementById('mvLoadingProgress');
const loadingSubtitleEl=document.getElementById('mvLoadingSubtitle');

function setLoadingProgress(progress,label){
  if(!loadingProgressEl)return;
  const clamped=Math.max(0,Math.min(progress,1));
  loadingProgressEl.style.width=(clamped*100).toFixed(1)+'%';
  if(label&&loadingSubtitleEl)loadingSubtitleEl.textContent=label;
}

function hideLoading(){
  if(!loadingEl)return;
  loadingEl.classList.add('is-hidden');
  setTimeout(()=>loadingEl.remove(),360);
}

if(vo.loadingEnabled===false&&loadingEl){
  loadingEl.remove();
}

function getViewportSize(){
  const rect=(viewerEl||document.body).getBoundingClientRect();
  return {
    w:Math.max(1,Math.floor(rect.width||window.innerWidth||1)),
    h:Math.max(1,Math.floor(rect.height||window.innerHeight||1)),
  };
}

const initialSize=getViewportSize();

// -- Setup --
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=PACK.sceneSettings?.postProcessing?.toneMappingExposure??1;
renderer.setSize(initialSize.w,initialSize.h,false);

const scene=new THREE.Scene();
const ss=PACK.sceneSettings;
if(ss?.backgroundType==='color')scene.background=new THREE.Color(ss.backgroundColor);

const camera=new THREE.PerspectiveCamera(45,initialSize.w/initialSize.h,.1,2000);
camera.position.set(3,2.5,4);
const orbit=new OrbitControls(camera,canvas);
orbit.enableDamping=true;
orbit.dampingFactor=.08;
orbit.enablePan=false;
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

// -- Build Scene --
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

function createCustomGeometry(data){
  if(!data||!Array.isArray(data.position))return null;
  if(data.position.length<9||data.position.length%9!==0)return null;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
  if(Array.isArray(data.normal)&&data.normal.length===data.position.length){
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));
  }else{
    geo.computeVertexNormals();
  }
  const vertexCount=data.position.length/3;
  if(Array.isArray(data.uv)&&data.uv.length===vertexCount*2){
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
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
  const total=Math.max(PACK.nodes.length,1);
  let processed=0;

  for(const n of PACK.nodes){
    if(n.type==='mesh'&&n.geometryType){
      let geometry;
      if(n.customGeometry){
        geometry=createCustomGeometry(n.customGeometry);
      } else if(n.geometryType==='text3d'&&n.text3d){
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
      if(!geometry)continue;
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
      let light=null;
      switch(n.light.kind){
        case'directional':light=new THREE.DirectionalLight(n.light.color,n.light.intensity);light.castShadow=n.light.castShadow;break;
        case'point':light=new THREE.PointLight(n.light.color,n.light.intensity,n.light.distance??0,n.light.decay??2);light.castShadow=n.light.castShadow;break;
        case'spot':light=new THREE.SpotLight(n.light.color,n.light.intensity,n.light.distance??0,n.light.angle??Math.PI/6,n.light.penumbra??0,n.light.decay??2);light.castShadow=n.light.castShadow;break;
        case'ambient':light=new THREE.AmbientLight(n.light.color,n.light.intensity);break;
      }
      if(light){
        light.position.fromArray(n.transform.position);
        scene.add(light);
        objectById.set(n.id,light);
      }
    }

    processed++;
    setLoadingProgress(processed/total,'Loading '+(n.name||'object'));
  }
}

// -- Interaction Runtime (minimal) --
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

function fireStartEvents(){
  for(const n of PACK.nodes){
    if(n.interactions)fireEvent(n.id,'start');
  }
}

// -- Raycaster for hover/click --
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
let hoveredId=null;

function pickNode(cx,cy){
  const rect=canvas.getBoundingClientRect();
  pointer.x=((cx-rect.left)/rect.width)*2-1;
  pointer.y=-((cy-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const meshes=[];
  for(const[,obj]of objectById){if(obj.isMesh)meshes.push(obj)}
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

// -- Camera fly --
let camTrans=null;
function flyTo(pos,rot,dur=1.2){
  const toPos=new THREE.Vector3(...pos);
  const dir=new THREE.Vector3(0,0,-1);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(degToRad(rot[0]),degToRad(rot[1]),degToRad(rot[2])));
  dir.applyQuaternion(q);
  const toTarget=toPos.clone().add(dir.multiplyScalar(2));
  camTrans={fromPos:camera.position.clone(),toPos,fromTarget:orbit.target.clone(),toTarget,duration:dur,elapsed:0};
}

// -- Camera Buttons --
const camContainer=document.getElementById('camBtns');
PACK.cameras.forEach((c)=>{
  const btn=document.createElement('button');
  btn.className='mv-btn';btn.textContent=c.label;
  btn.addEventListener('click',()=>flyTo(c.position,c.rotation));
  camContainer.appendChild(btn);
});

// -- Bottom controls --
const ctrlContainer=document.getElementById('controls');
let wireframeOn=false;
const wireBtn=document.createElement('button');wireBtn.className='mv-btn';wireBtn.textContent='Wireframe';
wireBtn.addEventListener('click',()=>{wireframeOn=!wireframeOn;wireBtn.classList.toggle('active',wireframeOn);scene.traverse(o=>{if(o.isMesh&&o.material)o.material.wireframe=wireframeOn})});
ctrlContainer.appendChild(wireBtn);

const resetBtn=document.createElement('button');resetBtn.className='mv-btn';resetBtn.textContent='Reset Camera';
resetBtn.addEventListener('click',()=>{camera.position.set(3,2.5,4);orbit.target.set(0,0,0);camTrans=null});
ctrlContainer.appendChild(resetBtn);

// -- Info Panel --
await buildScene();
const infoContent=document.getElementById('infoContent');
infoContent.innerHTML=\`
  <div class="mv-info-row"><span>Meshes</span><span>\${PACK.nodes.filter(n=>n.type==='mesh').length}</span></div>
  <div class="mv-info-row"><span>Lights</span><span>\${PACK.nodes.filter(n=>n.type==='light').length}</span></div>
  <div class="mv-info-row"><span>Cameras</span><span>\${PACK.cameras.length}</span></div>
  <div class="mv-info-row"><span>Triangles</span><span>\${Math.round(totalTriangles).toLocaleString()}</span></div>
  <div class="mv-info-row"><span>Vertices</span><span>\${Math.round(totalVertices).toLocaleString()}</span></div>
\`;

setLoadingProgress(1,'Ready');
if(vo.loadingEnabled!==false)setTimeout(hideLoading,180);

// -- Render Loop --
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.1);

  if(camTrans){
    camTrans.elapsed+=dt;
    const p=Math.min(camTrans.elapsed/camTrans.duration,1);
    const e=p<.5?4*p*p*p:1-(-2*p+2)**3/2;
    camera.position.lerpVectors(camTrans.fromPos,camTrans.toPos,e);
    orbit.target.lerpVectors(camTrans.fromTarget,camTrans.toTarget,e);
    if(p>=1)camTrans=null;
  }

  if(vo.autospin){
    const v=camera.position.clone().sub(orbit.target);
    v.applyAxisAngle(new THREE.Vector3(0,1,0),vo.autospin*dt);
    camera.position.copy(orbit.target).add(v);
  }

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
  const size=getViewportSize();
  renderer.setSize(size.w,size.h,false);
  camera.aspect=size.w/size.h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize',resize);
if(window.ResizeObserver&&viewerEl){
  const ro=new ResizeObserver(()=>resize());
  ro.observe(viewerEl);
}

resize();
fireStartEvents();
animate();
<\/script>
</body>
</html>`;
}
