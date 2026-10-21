// 3D 世界：渲染器、天空岛环境、相机/轨道控制、鼠标/触摸拾取、WebXR（Quest）手柄
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/OrbitControls.js';
import { THEMES } from './palette.js';
import { setAmbient } from './voxel.js';

// ---------- 环境 ----------
class Environment {
  constructor() {
    this.group = new THREE.Group();
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; varying vec3 vW;
        void main(){ float h = vW.y; vec3 c = h > 0.05 ? mix(uMid, uTop, smoothstep(0.05, 0.75, h)) : mix(uBot, uMid, smoothstep(-0.5, 0.05, h));
        gl_FragColor = vec4(c,1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // 漂浮小岛
    this.island = new THREE.Group();
    this.grassMat = new THREE.MeshLambertMaterial({ color: '#BDEFC4' });
    this.soilMat = new THREE.MeshLambertMaterial({ color: '#FFD7B0' });
    this.cliffMat = new THREE.MeshLambertMaterial({ color: '#F5B39B' });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.9, 56), this.grassMat);
    top.position.y = -0.45;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 12, 56), this.grassMat);
    lip.rotation.x = Math.PI / 2; lip.position.y = -0.45;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(10.1, 8.6, 1.8, 56), this.soilMat);
    soil.position.y = -1.8;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(8.6, 7, 56), this.cliffMat);
    cone.rotation.x = Math.PI; cone.position.y = -6.2;
    this.island.add(top, lip, soil, cone);
    // 小花和小方块装饰
    const deco = new THREE.Group();
    const flowerCols = ['#FF8FAB', '#FFD93D', '#B39DDB', '#7FB7FF', '#FFFFFF'];
    const boxG = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const stemG = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
    const stemM = new THREE.MeshLambertMaterial({ color: '#5DBB6A' });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = 7.6 + Math.random() * 1.8;
      const f = new THREE.Group();
      const head = new THREE.Mesh(boxG, new THREE.MeshLambertMaterial({ color: flowerCols[i % flowerCols.length] }));
      head.position.y = 0.55; head.rotation.y = Math.random() * 3;
      const stem = new THREE.Mesh(stemG, stemM); stem.position.y = 0.25;
      f.add(stem, head);
      f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      f.scale.setScalar(0.8 + Math.random() * 0.6);
      f.userData.sway = Math.random() * 6;
      deco.add(f);
    }
    this.flowers = deco;
    this.island.add(deco);
    this.group.add(this.island);

    // 云朵
    this.clouds = new THREE.Group();
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.35 });
    const puffG = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const p = new THREE.Mesh(puffG, this.cloudMat);
        p.position.set((j - n / 2) * 1.5, Math.random() * 0.6, Math.random() * 0.8);
        p.scale.setScalar(1.1 + Math.random() * 0.9);
        c.add(p);
      }
      const a = Math.random() * Math.PI * 2, r = 32 + Math.random() * 40;
      c.position.set(Math.cos(a) * r, -8 + Math.random() * 30, Math.sin(a) * r);
      c.scale.setScalar(1.2 + Math.random() * 1.6);
      c.userData = { a, r, sp: 0.004 + Math.random() * 0.008 };
      this.clouds.add(c);
    }
    this.group.add(this.clouds);

    // 漂浮的光点
    const N = 160;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 40 - 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkMat = new THREE.PointsMaterial({ size: 0.5, map: dotTexture(), transparent: true, depthWrite: false, color: '#FFFFFF', opacity: 0.85 });
    this.sparks = new THREE.Points(pg, this.sparkMat);
    this.group.add(this.sparks);

    // 夜晚星星
    const SN = 500, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.08; v.normalize().multiplyScalar(800);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 5, map: dotTexture(), transparent: true, depthWrite: false, color: '#FFF6C9', sizeAttenuation: true }));
    this.stars.visible = false;
    this.group.add(this.stars);
  }

  setTheme(key) {
    const th = THEMES[key] || THEMES.peach;
    this.skyMat.uniforms.uTop.value.set(th.skyTop);
    this.skyMat.uniforms.uMid.value.set(th.skyMid);
    this.skyMat.uniforms.uBot.value.set(th.skyBottom);
    this.grassMat.color.set(th.grass);
    this.soilMat.color.set(th.soil);
    this.cliffMat.color.set(th.cliff);
    this.cloudMat.color.set(th.cloud);
    this.cloudMat.emissive.set(th.cloud);
    this.stars.visible = !!th.stars;
    setAmbient(th.ambSky, th.ambGround);
  }

  update(dt, t) {
    for (const c of this.clouds.children) {
      c.userData.a += c.userData.sp * dt;
      c.position.x = Math.cos(c.userData.a) * c.userData.r;
      c.position.z = Math.sin(c.userData.a) * c.userData.r;
    }
    const p = this.sparks.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.6;
      if (y > 30) y = -10;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    this.sparkMat.opacity = 0.6 + Math.sin(t * 2) * 0.2;
    for (const f of this.flowers.children) f.rotation.z = Math.sin(t * 1.6 + f.userData.sway) * 0.08;
  }
}

let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  _dot.colorSpace = THREE.SRGBColorSpace;
  return _dot;
}

// ---------- 世界 ----------
export class World {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.5);
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.03, 3000);
    this.camera.position.set(9, 7, 13);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight('#FFFFFF', '#FFD6E4', 2.2);
    this.sun = new THREE.DirectionalLight('#FFFFFF', 1.6);
    this.sun.position.set(5, 10, 7);
    this.scene.add(this.hemi, this.sun);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.8;

    this.env = new Environment();
    this.scene.add(this.env.group);
    this.stage = new THREE.Group();
    this.scene.add(this.stage);

    this.mode = null;
    this.time = 0;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.camTween = null;
    this.groundY = 0;
    this.vrPanel = null;
    this.viewShift = 0;

    window.addEventListener('resize', () => this.resize());
    this.bindPointer();
    this.setupXR();
    r.setAnimationLoop(() => this.tick());
  }

  get isXR() { return this.renderer.xr.isPresenting; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.applyViewShift();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // 首页把模型挪到画面右侧（宽屏）
  setViewShift(frac, fy = 0) { this.viewShift = frac; this.viewShiftY = fy; this.applyViewShift(); }
  applyViewShift() {
    const w = window.innerWidth, h = window.innerHeight;
    if ((this.viewShift || this.viewShiftY) && !this.isXR) this.camera.setViewOffset(w, h, -w * this.viewShift, h * (this.viewShiftY || 0), w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    if (this.mode && this.mode.exit) this.mode.exit();
    this.mode = mode;
    this.stage.clear();
    this.stage.position.set(0, 0, 0);
    this.stage.rotation.set(0, 0, 0);
    this.stage.scale.setScalar(1);
    if (mode && mode.enterWorld) mode.enterWorld(this);
    this.applyLayout();
  }

  setGround(y) { this.groundY = y; this.applyLayout(); }

  // 桌面：舞台在原点；VR：舞台缩小放在面前桌面高度
  applyLayout() {
    const env = this.env.group;
    if (this.isXR) {
      const L = (this.mode && this.mode.vrLayout && this.mode.vrLayout()) || { scale: 0.06, position: [0, 1.1, -0.8] };
      this.stage.scale.setScalar(L.scale);
      this.stage.position.fromArray(L.position);
      env.scale.setScalar(0.22);
      env.position.set(0, 0, 0);
      this.env.island.visible = true;
    } else {
      this.stage.scale.setScalar(1);
      this.stage.position.set(0, 0, 0);
      env.scale.setScalar(1);
      env.position.set(0, this.groundY, 0);
    }
  }

  // 根据半径自动取景
  frame(radius, target = new THREE.Vector3(), dir = new THREE.Vector3(0.62, 0.52, 1), instant = false) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect));
    const dist = (radius / Math.sin(hf / 2)) * 1.08;
    const to = target.clone().add(dir.clone().normalize().multiplyScalar(dist));
    this.controls.minDistance = radius * 1.1;
    this.controls.maxDistance = dist * 2.6;
    if (instant) {
      this.camera.position.copy(to);
      this.controls.target.copy(target);
      this.camTween = null;
    } else {
      this.camTween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: to, t1: target.clone(), k: 0 };
    }
  }

  // ---------- 指针 ----------
  setRayFromEvent(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x, y }, this.camera);
    return this.raycaster.ray;
  }

  bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    let down = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (this.isXR) return;
      down = { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, moved: false, used: false, id: e.pointerId };
      if (e.pointerType !== 'mouse') {
        clearTimeout(this.lpTimer);
        this.lpTimer = setTimeout(() => {
          if (down && !down.moved && this.mode && this.mode.onTap) {
            down.used = true;
            this.mode.onTap(this.setRayFromEvent(down.ev || e), { button: 2, long: true, type: down.type });
            if (navigator.vibrate) navigator.vibrate(18);
          }
        }, 430);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.isXR) return;
      if (down && e.pointerId === down.id) {
        down.ev = e;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down.moved = true; clearTimeout(this.lpTimer); }
      }
      if (e.pointerType === 'mouse' && this.mode && this.mode.onHover) this.mode.onHover(this.setRayFromEvent(e));
    });
    el.addEventListener('pointerup', (e) => {
      clearTimeout(this.lpTimer);
      if (this.isXR || !down) return;
      const d = down; down = null;
      if (d.moved || d.used || e.pointerId !== d.id) return;
      if (this.mode && this.mode.onTap) this.mode.onTap(this.setRayFromEvent(e), { button: d.button, long: false, type: d.type });
    });
    el.addEventListener('pointercancel', () => { clearTimeout(this.lpTimer); down = null; });
    el.addEventListener('pointerleave', () => { if (this.mode && this.mode.onHover) this.mode.onHover(null); });
  }

  // ---------- WebXR ----------
  setupXR() {
    const r = this.renderer;
    this.controllers = [];
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const tipGeo = new THREE.SphereGeometry(0.012, 12, 8);
    for (let i = 0; i < 2; i++) {
      const c = r.xr.getController(i);
      const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: i ? '#FF8FAB' : '#7FB7FF', transparent: true, opacity: 0.9 }));
      line.scale.z = 3;
      const tip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
      tip.position.z = -3;
      c.add(line, tip);
      c.userData = { index: i, line, tip, gamepad: null, prevBtn: {}, handedness: '' };
      c.addEventListener('connected', (e) => {
        c.userData.gamepad = e.data.gamepad || null;
        c.userData.handedness = e.data.handedness || '';
        c.userData.hand = !!e.data.hand;
        line.visible = true;
      });
      c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
      c.addEventListener('selectstart', () => this.onXRAction(c, 'select'));
      c.addEventListener('squeezestart', () => this.onXRAction(c, 'squeeze'));
      this.scene.add(c);
      const grip = r.xr.getControllerGrip(i);
      const body = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.07, 6, 12), new THREE.MeshLambertMaterial({ color: i ? '#FFC4D6' : '#C9E4FF' }));
      shell.rotation.x = Math.PI / 2 - 0.5;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 24), new THREE.MeshLambertMaterial({ color: '#FFFFFF' }));
      ring.position.set(0, 0.012, -0.045); ring.rotation.x = -0.5;
      body.add(shell, ring);
      grip.add(body);
      this.scene.add(grip);
      this.controllers.push(c);
    }
    r.xr.addEventListener('sessionstart', () => {
      this.savedCam = { p: this.camera.position.clone(), t: this.controls.target.clone() };
      this.controls.enabled = false;
      this.camera.clearViewOffset();
      this.applyLayout();
      if (this.mode && this.mode.onXRChange) this.mode.onXRChange(true);
      if (this.onXRChange) this.onXRChange(true);
    });
    r.xr.addEventListener('sessionend', () => {
      this.controls.enabled = true;
      // three 在会话结束后会恢复相机，这里再保险一次
      setTimeout(() => {
        if (this.savedCam) { this.camera.position.copy(this.savedCam.p); this.controls.target.copy(this.savedCam.t); }
        this.camera.quaternion.identity();
        this.camera.updateMatrixWorld();
        this.applyViewShift();
        this.applyLayout();
        if (this.mode && this.mode.onXRChange) this.mode.onXRChange(false);
        if (this.onXRChange) this.onXRChange(false);
      }, 30);
    });
  }

  async enterVR() {
    if (!navigator.xr) throw new Error('当前浏览器不支持 WebXR');
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await this.renderer.xr.setSession(session);
  }
  exitVR() { const s = this.renderer.xr.getSession(); if (s) s.end(); }

  controllerRay(c) {
    const m = c.matrixWorld;
    const o = new THREE.Vector3().setFromMatrixPosition(m);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
    return new THREE.Ray(o, d);
  }

  onXRAction(c, type) {
    const ray = this.controllerRay(c);
    if (this.vrPanel && this.vrPanel.visible) {
      const hit = this.vrPanel.hit(ray);
      if (hit) { if (type === 'select') this.vrPanel.press(hit); return; }
    }
    if (this.mode && this.mode.onXRAction) this.mode.onXRAction(ray, type, c.userData);
  }

  updateXR(dt) {
    let anyHover = false;
    for (const c of this.controllers) {
      const ud = c.userData;
      const ray = this.controllerRay(c);
      let dist = 3;
      if (this.vrPanel && this.vrPanel.visible) {
        const hit = this.vrPanel.hit(ray);
        if (hit) { dist = hit.distance; this.vrPanel.setHover(hit.id); anyHover = true; }
      }
      if (dist === 3 && this.mode && this.mode.onXRHover) {
        const d2 = this.mode.onXRHover(ray, ud.index);
        if (d2) dist = d2;
      }
      ud.line.scale.z = dist;
      ud.tip.position.z = -dist;
      const gp = ud.gamepad;
      if (gp) {
        const b = gp.buttons || [];
        const press = (i, name) => {
          const now = !!(b[i] && b[i].pressed);
          if (now && !ud.prevBtn[i] && this.mode && this.mode.onXRButton) this.mode.onXRButton(name, ud);
          ud.prevBtn[i] = now;
        };
        press(4, 'a'); press(5, 'b');
        const ax = gp.axes || [];
        const sx = ax.length >= 4 ? ax[2] : ax[0] || 0;
        const sy = ax.length >= 4 ? ax[3] : ax[1] || 0;
        if ((Math.abs(sx) > 0.15 || Math.abs(sy) > 0.15) && this.mode && this.mode.onXRStick) this.mode.onXRStick(sx, sy, dt, ud);
      }
    }
    if (!anyHover && this.vrPanel) this.vrPanel.setHover(null);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.isXR) this.updateXR(dt);
    else {
      if (this.camTween) {
        const tw = this.camTween;
        tw.k = Math.min(1, tw.k + dt / 0.7);
        const e = 1 - Math.pow(1 - tw.k, 3);
        this.camera.position.lerpVectors(tw.p0, tw.p1, e);
        this.controls.target.lerpVectors(tw.t0, tw.t1, e);
        if (tw.k >= 1) this.camTween = null;
      }
      this.controls.update();
    }
    this.env.update(dt, this.time);
    if (this.mode && this.mode.update) this.mode.update(dt, this.time);
    if (this.vrPanel) this.vrPanel.update(dt, this.time);
    this.renderer.render(this.scene, this.camera);
  }
}
