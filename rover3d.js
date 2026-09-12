import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fog Vision Rover — 3D Digital Twin (Vanilla ES Module)
 * Ported from RoverDigitalTwin3D.jsx for native, high-performance execution.
 */
let twinInstance = null;

export function initRoverDigitalTwin(options = {}) {
  const mount = document.getElementById('roverDigitalTwinMount');
  if (!mount) {
    return null;
  }
  if (twinInstance) {
    return twinInstance;
  }

  // State parameters
  let riskLevel = options.riskLevel || 'LOW';
  let fogVisibility = options.fogVisibility || 18;
  let isEStopped = options.isEStopped || false;

  const width = mount.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const height = mount.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);

  // 1. SCENE & CAMERA SETUP
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
  camera.position.set(-3.6, 2.0, -4.4); // Perfectly framed enlarged hero view of the rear hazard assembly
  camera.lookAt(0, 0.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.innerHTML = '';
  mount.appendChild(renderer.domElement);

  // 2. ORBIT CONTROLS (Interactive Rotation/Zoom)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.04;
  controls.minDistance = 2.2;
  controls.maxDistance = 14;
  controls.target.set(0, 0.6, 0);
  controls.update();

  // 3. LIGHTING (Neutral, physically-accurate illumination with zero artificial blue spill)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(7, 13, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 30;
  dirLight.shadow.camera.left = -6;
  dirLight.shadow.camera.right = 6;
  dirLight.shadow.camera.top = 6;
  dirLight.shadow.camera.bottom = -6;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  // Soft neutral fill light (white/soft daylight, eliminates artificial blue floor reflection)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  fillLight.position.set(-6, 6, -5);
  scene.add(fillLight);

  // Status PointLight (Top Chassis Accent - localized range so it does not penetrate chassis to floor)
  const statusLight = new THREE.PointLight(0x10b981, 1.8, 2.5);
  statusLight.position.set(0, 1.8, 0);
  scene.add(statusLight);

  // 4. MINE GROUND GRID & ENVIRONMENT (Subtle neutral slate grid expanding seamlessly to the horizon)
  const gridHelper = new THREE.GridHelper(80, 80, 0x475569, 0x1e293b);
  gridHelper.position.y = -0.005;
  scene.add(gridHelper);

  const floorGeo = new THREE.PlaneGeometry(600, 600);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.8 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 5. THEME & FOG MANAGEMENT (Safely executed after all lights and materials exist)
  const applySceneTheme = (theme) => {
    if (theme === 'light') {
      scene.background = new THREE.Color(0xF8FAFC);
      const density = Math.max(0.003, Math.min(0.02, 0.035 - fogVisibility * 0.00035));
      scene.fog = new THREE.FogExp2(0xF8FAFC, density);
      floorMat.color.setHex(0xE2E8F0);
      gridHelper.material.color.setHex(0xCBD5E1);
      fillLight.color.setHex(0xFFFFFF);
      dirLight.intensity = 1.3;
      ambientLight.intensity = 0.9;
    } else {
      scene.background = new THREE.Color(0x020617);
      const density = Math.max(0.003, Math.min(0.02, 0.035 - fogVisibility * 0.00035));
      scene.fog = new THREE.FogExp2(0x020617, density);
      floorMat.color.setHex(0x070B14);
      gridHelper.material.color.setHex(0x334155);
      fillLight.color.setHex(0xFFFFFF);
      dirLight.intensity = 1.4;
      ambientLight.intensity = 0.85;
    }
  };

  const initialTheme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'dark';
  applySceneTheme(initialTheme);

  if (typeof window !== 'undefined') {
    window.addEventListener('fogbot_theme_change', (e) => {
      if (e && e.detail && e.detail.theme) {
        applySceneTheme(e.detail.theme);
      }
    });
  }

  const updateFog = (vis) => {
    fogVisibility = vis;
    const curTheme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'dark';
    applySceneTheme(curTheme);
  };
  updateFog(fogVisibility);

  // 6. ROVER ASSEMBLY GROUP
  const roverGroup = new THREE.Group();
  scene.add(roverGroup);

  // Materials
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.7 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.8 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  const orangeAccentMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });

  // A. Main Chassis Body
  const bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 2.4);
  const bodyMesh = new THREE.Mesh(bodyGeo, chassisMat);
  bodyMesh.position.y = 0.6;
  bodyMesh.castShadow = true;
  roverGroup.add(bodyMesh);

  // Side Safety Accent Chevrons
  const chevronGeo = new THREE.BoxGeometry(1.62, 0.15, 1.2);
  const chevronMesh = new THREE.Mesh(chevronGeo, orangeAccentMat);
  chevronMesh.position.y = 0.65;
  roverGroup.add(chevronMesh);

  // B. High-Clearance 4WD Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 24);
  wheelGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-0.95, 0.35, 0.8],  // Front-Left
    [0.95, 0.35, 0.8],   // Front-Right
    [-0.95, 0.35, -0.8], // Rear-Left
    [0.95, 0.35, -0.8],  // Rear-Right
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    roverGroup.add(wheel);
  });

  // C. Elevated Sensor Mast & LiDAR (STL-19P)
  const mastPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 16), darkSteelMat);
  mastPillar.position.set(0, 1.3, 0.3);
  roverGroup.add(mastPillar);

  const cameraPod = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.22), darkSteelMat);
  cameraPod.position.set(0, 1.25, 0.42);
  roverGroup.add(cameraPod);

  const lidarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.15, 24), darkSteelMat);
  lidarBase.position.set(0, 1.7, 0.3);
  roverGroup.add(lidarBase);

  const lidarHeadMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
  const lidarHead = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24), lidarHeadMat);
  lidarHead.position.set(0, 1.82, 0.3);
  roverGroup.add(lidarHead);

  // D. Front Bull-Bar
  const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.15), darkSteelMat);
  bullBar.position.set(0, 0.45, 1.25);
  roverGroup.add(bullBar);

  // E. LARGE REAR HAZARD LIGHT ASSEMBLY (For Trailing Dumper Truck Driver)
  const rearHazardGroup = new THREE.Group();
  rearHazardGroup.position.set(0, 0.65, -1.25);
  roverGroup.add(rearHazardGroup);

  // Heavy Steel Protective Rear Housing Frame
  const rearFrameMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.12), darkSteelMat);
  rearHazardGroup.add(rearFrameMesh);

  // Central Ultra-Bright Amber Hazard Light Strip
  const rearAmberMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const rearAmberMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.05), rearAmberMat);
  rearAmberMesh.position.set(0, 0, -0.06);
  rearHazardGroup.add(rearAmberMesh);

  // Outer High-Intensity Red Hazard/Brake Pods (Left & Right)
  const rearRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const leftRedMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.05), rearRedMat);
  leftRedMesh.position.set(-0.5, 0, -0.06);
  rearHazardGroup.add(leftRedMesh);

  const rightRedMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.05), rearRedMat);
  rightRedMesh.position.set(0.5, 0, -0.06);
  rearHazardGroup.add(rightRedMesh);

  // Backward Projection Light Beam (Casts amber/red warning toward trailing truck)
  const rearHazardLight = new THREE.PointLight(0xf59e0b, 2.5, 4.5);
  rearHazardLight.position.set(0, 0.72, -1.35);
  scene.add(rearHazardLight);

  // F. Roof Strobe Light
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const strobe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16), strobeMat);
  strobe.position.set(0, 1.0, -0.6);
  roverGroup.add(strobe);

  // 6. ANIMATION LOOP
  let animationFrameId;
  const clock = new THREE.Clock();

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Continuous LiDAR rotation
    lidarHead.rotation.y += 0.05;

    // Rear Hazard Flashing Rate (Speeds up during HIGH risk or E-Stop)
    const flashRate = isEStopped || riskLevel === 'HIGH' ? 14 : riskLevel === 'MEDIUM' ? 8 : 4;
    const flashPulse = 0.3 + Math.sin(elapsedTime * flashRate) * 0.7;

    rearAmberMat.opacity = flashPulse;
    rearAmberMat.transparent = true;

    rearRedMat.opacity = 0.4 + Math.cos(elapsedTime * flashRate) * 0.6;
    rearRedMat.transparent = true;

    strobeMat.opacity = flashPulse;
    strobeMat.transparent = true;

    // Projecting Light Intensity
    rearHazardLight.intensity = flashPulse * 2.5;

    // Dynamic Status & Risk Colors
    let activeColor = 0x10b981; // Green
    if (isEStopped || riskLevel === 'HIGH') {
      activeColor = 0xef4444; // Red
      rearHazardLight.color.setHex(0xef4444);
    } else if (riskLevel === 'MEDIUM') {
      activeColor = 0xf59e0b; // Amber
      rearHazardLight.color.setHex(0xf59e0b);
    } else {
      rearHazardLight.color.setHex(0xf59e0b);
    }

    statusLight.color.setHex(activeColor);

    controls.update();
    renderer.render(scene, camera);

    if (!firstFrameRendered) {
      firstFrameRendered = true;
      if (typeof window !== 'undefined') {
        window.__fogbot3dReady = true;
        window.dispatchEvent(new CustomEvent('fogbot:3d-ready'));
      }
    }
  };

  let firstFrameRendered = false;
  animate();

  // 7. RESPONSIVE RESIZE (Window + ResizeObserver)
  const handleResize = () => {
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  window.addEventListener('resize', handleResize);
  const resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(mount);

  // Optional: Sync fog density with live visibility ticker if present
  const visibilityValEl = document.getElementById('visibilityValue');
  if (visibilityValEl) {
    const observer = new MutationObserver(() => {
      const vis = parseInt(visibilityValEl.textContent, 10);
      if (!isNaN(vis)) {
        updateFog(vis);
      }
    });
    observer.observe(visibilityValEl, { childList: true, characterData: true, subtree: true });
  }

  twinInstance = {
    setRiskLevel: (level) => { riskLevel = level; },
    setFogVisibility: (vis) => { fogVisibility = vis; updateFog(vis); },
    setEStopped: (stopped) => { isEStopped = stopped; },
    destroy: () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      twinInstance = null;
    }
  };

  return twinInstance;
}

// Auto-initialize when DOM is ready
function autoInit() {
  if (document.getElementById('roverDigitalTwinMount')) {
    initRoverDigitalTwin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}
window.addEventListener('load', autoInit);
