import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fog Vision Rover — 3D Digital Twin Component
 * 
 * @param {string} riskLevel - "LOW" | "MEDIUM" | "HIGH"
 * @param {number} fogVisibility - Current visibility in meters (e.g. 15)
 * @param {boolean} isEStopped - Emergency stop override active
 */
export default function RoverDigitalTwin3D({
  riskLevel = 'LOW',
  fogVisibility = 18,
  isEStopped = false,
}) {
  const mountRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight;

    // 1. SCENE & CAMERA SETUP
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); // Slate-950 industrial dark
    scene.fog = new THREE.FogExp2(0x0f172a, Math.max(0.005, 0.08 - fogVisibility * 0.0015));

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(-4, 3, -5); // Positioned to view rear hazard assembly by default

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMount.appendChild(renderer.domElement);

    // 2. ORBIT CONTROLS (Interactive Rotation/Zoom)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 12;

    // 3. LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(6, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Status PointLight (Top Chassis Accent)
    const statusLight = new THREE.PointLight(0x10b981, 2, 8);
    statusLight.position.set(0, 1.8, 0);
    scene.add(statusLight);

    // 4. MINE GROUND GRID & ENVIRONMENT
    const gridHelper = new THREE.GridHelper(20, 20, 0x0284c7, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    const floorGeo = new THREE.PlaneGeometry(25, 25);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 5. ROVER ASSEMBLY GROUP
    const roverGroup = new THREE.Group();
    scene.add(roverGroup);

    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.7 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.8 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transmission: 0.6, opacity: 1, transparent: true, roughness: 0.1 });
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

    const lidarHeadMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.2 });
    const lidarHead = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24), lidarHeadMat);
    lidarHead.position.set(0, 1.82, 0.3);
    roverGroup.add(lidarHead);

    // D. Front Bull-Bar & Ultra-Bright High-Intensity Fog Lights Assembly (Opposite side of rear hazard lights)
    const frontFogGroup = new THREE.Group();
    roverGroup.add(frontFogGroup);

    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.15), darkSteelMat);
    bullBar.position.set(0, 0.45, 1.25);
    frontFogGroup.add(bullBar);

    // Fog Lamp Optical Materials
    const fogLensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const fogBezelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });

    // 1. Left Heavy-Duty Projector Fog Lamp Pod
    const leftFogHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 24), darkSteelMat);
    leftFogHousing.rotation.x = Math.PI / 2;
    leftFogHousing.position.set(-0.48, 0.46, 1.33);
    frontFogGroup.add(leftFogHousing);

    const leftFogBezel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 12, 24), fogBezelMat);
    leftFogBezel.position.set(-0.48, 0.46, 1.37);
    frontFogGroup.add(leftFogBezel);

    const leftFogLens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), fogLensMat);
    leftFogLens.rotation.x = Math.PI / 2;
    leftFogLens.position.set(-0.48, 0.46, 1.375);
    frontFogGroup.add(leftFogLens);

    // 2. Right Heavy-Duty Projector Fog Lamp Pod
    const rightFogHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 24), darkSteelMat);
    rightFogHousing.rotation.x = Math.PI / 2;
    rightFogHousing.position.set(0.48, 0.46, 1.33);
    frontFogGroup.add(rightFogHousing);

    const rightFogBezel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 12, 24), fogBezelMat);
    rightFogBezel.position.set(0.48, 0.46, 1.37);
    frontFogGroup.add(rightFogBezel);

    const rightFogLens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), fogLensMat);
    rightFogLens.rotation.x = Math.PI / 2;
    rightFogLens.position.set(0.48, 0.46, 1.375);
    frontFogGroup.add(rightFogLens);

    // 3. Central Auxiliary High-Output LED Fog Light Bar
    const lightBarHousing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.10, 0.06), darkSteelMat);
    lightBarHousing.position.set(0, 0.52, 1.32);
    frontFogGroup.add(lightBarHousing);

    const lightBarLens = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.07, 0.02), fogLensMat);
    lightBarLens.position.set(0, 0.52, 1.355);
    frontFogGroup.add(lightBarLens);

    // 4. Very Bright Forward Projection Lights (Pierces deep into the fog)
    const frontFogSpot = new THREE.SpotLight(0xffffff, 16.0, 35.0);
    frontFogSpot.position.set(0, 0.55, 1.38);
    frontFogSpot.angle = Math.PI / 3.5;
    frontFogSpot.penumbra = 0.5;
    frontFogSpot.decay = 1.2;
    frontFogSpot.castShadow = true;

    const fogSpotTarget = new THREE.Object3D();
    fogSpotTarget.position.set(0, 0.1, 16.0);
    scene.add(fogSpotTarget);
    frontFogSpot.target = fogSpotTarget;
    scene.add(frontFogSpot);

    // High-intensity near-field & lateral fog illumination
    const leftFogLight = new THREE.PointLight(0xffffff, 5.5, 12.0);
    leftFogLight.position.set(-0.48, 0.48, 1.42);
    scene.add(leftFogLight);

    const rightFogLight = new THREE.PointLight(0xffffff, 5.5, 12.0);
    rightFogLight.position.set(0.48, 0.48, 1.42);
    scene.add(rightFogLight);

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

    // Backward Projection Light Beam (Casts light toward trailing truck)
    const rearHazardLight = new THREE.PointLight(0xf59e0b, 4, 10);
    rearHazardLight.position.set(0, 0.65, -1.6);
    scene.add(rearHazardLight);

    // F. Roof Strobe Light
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const strobe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16), strobeMat);
    strobe.position.set(0, 1.0, -0.6);
    roverGroup.add(strobe);

    // 6. ANIMATION LOOP
    let animationFrameId;
    let clock = new THREE.Clock();

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
      rearHazardLight.intensity = flashPulse * 5;

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
    };

    animate();

    // 7. RESPONSIVE RESIZE
    const handleResize = () => {
      if (!currentMount) return;
      const w = currentMount.clientWidth;
      const h = currentMount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [riskLevel, fogVisibility, isEStopped]);

  return (
    <div
      className="relative w-full h-full min-h-[380px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Telemetry & Rear Hazard Indicator */}
      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 pointer-events-none">
        <span className="text-sky-400 font-bold">3D DIGITAL TWIN:</span> ROVER_01
      </div>

      <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono flex items-center space-x-2 pointer-events-none">
        <span className="w-2 h-2 rounded-full animate-ping bg-amber-400" />
        <span className="text-slate-400">Rear Hazard Beacon:</span>
        <span className="text-amber-400 font-bold">PULSING</span>
      </div>

      {isHovered && (
        <div className="absolute bottom-3 right-3 bg-slate-800/90 text-slate-300 text-[10px] px-2.5 py-1 rounded border border-slate-700 pointer-events-none">
          Drag to rotate | Scroll to zoom
        </div>
      )}
    </div>
  );
}
