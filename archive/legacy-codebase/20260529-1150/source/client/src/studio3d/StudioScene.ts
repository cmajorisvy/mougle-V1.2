import * as THREE from "three";
import { SEAT_POSITIONS } from "./types";

export class StudioScene {
  public scene: THREE.Scene;
  public ambientLight!: THREE.AmbientLight;
  public keyLight!: THREE.SpotLight;
  public fillLight!: THREE.SpotLight;
  public rimLight!: THREE.SpotLight;
  public backLight!: THREE.DirectionalLight;
  public warmRimLeft!: THREE.PointLight;
  public warmRimRight!: THREE.PointLight;
  private environmentGroup = new THREE.Group();
  private animatedElements: THREE.Mesh[] = [];
  private ledWallMeshes: THREE.Mesh[] = [];

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060610, 0.028);
    this.buildEnvironmentMap();
    this.buildStudioLighting();
    this.buildFloor();
    this.buildTable();
    this.buildLEDVideoWall();
    this.buildStudioProps();
    this.buildDeskMicrophones();
    this.buildMonitorScreens();
    this.buildCameraRigs();
    this.buildFloorMarkings();
    this.buildCeilingRig();
    this.scene.add(this.environmentGroup);
  }

  private buildEnvironmentMap(): void {
    const size = 128;
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const ny = y / size;
        const nx = x / size;
        const r = 0.015 + ny * 0.03 + Math.sin(nx * Math.PI * 4) * 0.005;
        const g = 0.015 + ny * 0.025 + Math.sin(nx * Math.PI * 3) * 0.003;
        const b = 0.03 + ny * 0.06 + Math.sin(nx * Math.PI * 2) * 0.01;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 1;
      }
    }
    const envTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.needsUpdate = true;
    this.scene.environment = envTex;
    this.scene.background = new THREE.Color(0x050510);

    this.ambientLight = new THREE.AmbientLight(0x161630, 0.35);
    this.scene.add(this.ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x2233aa, 0x110808, 0.3);
    this.scene.add(hemiLight);
  }

  private buildStudioLighting(): void {
    this.keyLight = new THREE.SpotLight(0xffeedd, 5.0, 25, Math.PI / 6, 0.5, 1.0);
    this.keyLight.position.set(2.5, 6, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.radius = 3;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.target.position.set(0, 1.2, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight = new THREE.SpotLight(0x6688cc, 2.0, 20, Math.PI / 4, 0.6, 1.2);
    this.fillLight.position.set(-4, 4, 4);
    this.fillLight.castShadow = true;
    this.fillLight.shadow.mapSize.set(1024, 1024);
    this.fillLight.shadow.bias = -0.001;
    this.fillLight.shadow.radius = 6;
    this.fillLight.target.position.set(0, 1.2, 0);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    this.rimLight = new THREE.SpotLight(0xff8855, 2.5, 18, Math.PI / 5, 0.4, 0.8);
    this.rimLight.position.set(3, 4.5, -3);
    this.rimLight.castShadow = false;
    this.rimLight.target.position.set(0, 1.2, 0);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    this.backLight = new THREE.DirectionalLight(0x5533bb, 0.8);
    this.backLight.position.set(0, 5, -6);
    this.scene.add(this.backLight);

    this.warmRimLeft = new THREE.PointLight(0xffaa66, 0.6, 8, 2);
    this.warmRimLeft.position.set(-3.5, 2.5, -1);
    this.scene.add(this.warmRimLeft);

    this.warmRimRight = new THREE.PointLight(0xffaa66, 0.6, 8, 2);
    this.warmRimRight.position.set(3.5, 2.5, -1);
    this.scene.add(this.warmRimRight);

    const hairLight = new THREE.SpotLight(0xeeeeff, 1.5, 12, Math.PI / 8, 0.7, 1.5);
    hairLight.position.set(0, 7, -2);
    hairLight.target.position.set(0, 1.4, 0);
    this.scene.add(hairLight);
    this.scene.add(hairLight.target);

    const accentLeft = new THREE.PointLight(0x0088ff, 0.4, 10);
    accentLeft.position.set(-6, 1.5, -3);
    this.scene.add(accentLeft);

    const accentRight = new THREE.PointLight(0xff0088, 0.3, 10);
    accentRight.position.set(6, 1.5, -3);
    this.scene.add(accentRight);

    const practicalFront = new THREE.PointLight(0xffeedd, 0.2, 6);
    practicalFront.position.set(0, 3, 6);
    this.scene.add(practicalFront);
  }

  private buildFloor(): void {
    const floorGeo = new THREE.CircleGeometry(14, 80);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0a18,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.environmentGroup.add(floor);

    const gridHelper = new THREE.GridHelper(24, 48, 0x151530, 0x0e0e20);
    gridHelper.position.y = 0.005;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.15;
    this.environmentGroup.add(gridHelper);
  }

  private buildTable(): void {
    const tableGroup = new THREE.Group();

    const topGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.05, 64);
    const topMat = new THREE.MeshPhysicalMaterial({
      color: 0x111122,
      metalness: 0.5,
      roughness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.9,
      envMapIntensity: 1.2,
    });
    const tableTop = new THREE.Mesh(topGeo, topMat);
    tableTop.position.y = 0.85;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(tableTop);

    const edgeGeo = new THREE.TorusGeometry(1.7, 0.015, 8, 64);
    const edgeMat = new THREE.MeshPhysicalMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: 0.8,
      metalness: 0.95,
      roughness: 0.1,
      clearcoat: 1.0,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.875;
    tableGroup.add(edge);

    const innerEdge = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.005, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.15 })
    );
    innerEdge.rotation.x = Math.PI / 2;
    innerEdge.position.y = 0.878;
    tableGroup.add(innerEdge);

    const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.82, 24);
    const pedestalMat = new THREE.MeshPhysicalMaterial({
      color: 0x111122,
      metalness: 0.8,
      roughness: 0.2,
      clearcoat: 0.5,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = 0.42;
    pedestal.castShadow = true;
    tableGroup.add(pedestal);

    const baseGeo = new THREE.CylinderGeometry(0.7, 0.75, 0.04, 32);
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0x151528,
      metalness: 0.7,
      roughness: 0.25,
      clearcoat: 0.3,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.02;
    base.receiveShadow = true;
    tableGroup.add(base);

    const baseEdge = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.008, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0x3366cc, transparent: true, opacity: 0.3 })
    );
    baseEdge.rotation.x = Math.PI / 2;
    baseEdge.position.y = 0.04;
    tableGroup.add(baseEdge);

    this.environmentGroup.add(tableGroup);
  }

  private buildLEDVideoWall(): void {
    const wallGroup = new THREE.Group();

    const segments = 5;
    const totalWidth = 16;
    const height = 6;
    const segW = totalWidth / segments;

    for (let i = 0; i < segments; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;

      const hue1 = (i / segments) * 60 + 200;
      const hue2 = hue1 + 40;
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, `hsla(${hue1}, 60%, 8%, 1)`);
      grad.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 50%, 12%, 1)`);
      grad.addColorStop(1, `hsla(${hue2}, 60%, 6%, 1)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      for (let p = 0; p < 30; p++) {
        const px = Math.random() * 256;
        const py = Math.random() * 256;
        const pr = 1 + Math.random() * 3;
        ctx.fillStyle = `hsla(${hue1 + Math.random() * 60}, 70%, 40%, ${0.3 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let line = 0; line < 5; line++) {
        ctx.strokeStyle = `hsla(${hue1 + 20}, 60%, 25%, 0.15)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 30 + line * 50);
        ctx.lineTo(256, 30 + line * 50 + (Math.random() - 0.5) * 20);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      const panelGeo = new THREE.PlaneGeometry(segW, height);
      const panelMat = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: 0xffffff,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        side: THREE.FrontSide,
      });
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(
        -totalWidth / 2 + segW / 2 + i * segW,
        height / 2 + 0.5,
        -6
      );
      panel.userData.panelIndex = i;
      panel.userData.baseHue = hue1;
      wallGroup.add(panel);
      this.ledWallMeshes.push(panel);
    }

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(totalWidth + 0.3, 0.08, 0.15),
      new THREE.MeshPhysicalMaterial({ color: 0x111122, metalness: 0.9, roughness: 0.15, clearcoat: 0.8 })
    );
    frameTop.position.set(0, height + 0.55, -5.95);
    wallGroup.add(frameTop);

    const frameBottom = new THREE.Mesh(
      new THREE.BoxGeometry(totalWidth + 0.3, 0.08, 0.15),
      new THREE.MeshPhysicalMaterial({ color: 0x111122, metalness: 0.9, roughness: 0.15, clearcoat: 0.8 })
    );
    frameBottom.position.set(0, 0.48, -5.95);
    wallGroup.add(frameBottom);

    [-1, 1].forEach(side => {
      const frameVert = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, height + 0.2, 0.15),
        new THREE.MeshPhysicalMaterial({ color: 0x111122, metalness: 0.9, roughness: 0.15, clearcoat: 0.8 })
      );
      frameVert.position.set(side * (totalWidth / 2 + 0.15), height / 2 + 0.5, -5.95);
      wallGroup.add(frameVert);
    });

    this.environmentGroup.add(wallGroup);
  }

  private buildStudioProps(): void {
    for (let i = 0; i < 4; i++) {
      const lightHousing = new THREE.Group();

      const barnDoor = new THREE.Group();
      const housingGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 14);
      const housingMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2,
        clearcoat: 0.5,
      });
      const housing = new THREE.Mesh(housingGeo, housingMat);
      barnDoor.add(housing);

      const lensGeo = new THREE.CircleGeometry(0.16, 20);
      const isKeyLight = i === 1;
      const lensMat = new THREE.MeshBasicMaterial({
        color: isKeyLight ? 0xffeedd : i === 0 ? 0x4488ff : 0xff4488,
        transparent: true,
        opacity: 0.35,
      });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.y = -0.18;
      lens.rotation.x = Math.PI / 2;
      barnDoor.add(lens);

      const doorGeo = new THREE.BoxGeometry(0.2, 0.12, 0.01);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      [-1, 1].forEach(side => {
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(side * 0.15, -0.1, 0);
        door.rotation.z = side * 0.3;
        barnDoor.add(door);
      });

      lightHousing.add(barnDoor);

      const yokeGeo = new THREE.TorusGeometry(0.2, 0.015, 6, 16, Math.PI);
      const yoke = new THREE.Mesh(yokeGeo, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 }));
      yoke.position.y = 0.18;
      yoke.rotation.z = Math.PI;
      lightHousing.add(yoke);

      const x = -4.5 + i * 3;
      lightHousing.position.set(x, 5.8, 2.5);
      lightHousing.rotation.x = Math.PI / 5;
      this.environmentGroup.add(lightHousing);

      const armGeo = new THREE.CylinderGeometry(0.018, 0.018, 2, 8);
      const armMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7 });
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(x, 6.8, 2.2);
      arm.rotation.z = Math.PI / 15;
      this.environmentGroup.add(arm);
    }

    const logoGroup = new THREE.Group();
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.04, 12, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x7744ff,
        emissive: 0x5522dd,
        emissiveIntensity: 1.2,
        metalness: 0.95,
        roughness: 0.1,
        clearcoat: 1.0,
      })
    );
    logoGroup.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.02, 8, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x4488ff,
        emissive: 0x2255cc,
        emissiveIntensity: 0.8,
        metalness: 0.9,
        roughness: 0.15,
      })
    );
    logoGroup.add(innerRing);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x88aaff })
    );
    logoGroup.add(dot);

    logoGroup.position.set(0, 6.8, -5.8);
    logoGroup.rotation.x = Math.PI / 2;
    this.environmentGroup.add(logoGroup);
  }

  private buildDeskMicrophones(): void {
    const micPositions = [
      { x: -1.2, z: 0.3, angle: 0.15 },
      { x: 0, z: -1.2, angle: Math.PI },
      { x: 1.2, z: 0.3, angle: -0.15 },
    ];

    micPositions.forEach(({ x, z, angle }) => {
      const micGroup = new THREE.Group();

      const baseMat = new THREE.MeshPhysicalMaterial({
        color: 0x222222,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1.0,
      });

      const baseGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.015, 16);
      const base = new THREE.Mesh(baseGeo, baseMat);
      micGroup.add(base);

      const stemGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.3, 8);
      const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x333333, metalness: 0.85, roughness: 0.15 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.15;
      stem.rotation.z = -0.15;
      micGroup.add(stem);

      const jointGeo = new THREE.SphereGeometry(0.012, 8, 6);
      const joint = new THREE.Mesh(jointGeo, baseMat);
      joint.position.set(-0.04, 0.28, 0);
      micGroup.add(joint);

      const arm2Geo = new THREE.CylinderGeometry(0.005, 0.005, 0.2, 8);
      const arm2 = new THREE.Mesh(arm2Geo, stemMat);
      arm2.position.set(-0.08, 0.36, 0);
      arm2.rotation.z = 0.4;
      micGroup.add(arm2);

      const capsuleGeo = new THREE.CylinderGeometry(0.018, 0.015, 0.06, 12);
      const capsuleMat = new THREE.MeshPhysicalMaterial({
        color: 0x2a2a2a,
        metalness: 0.7,
        roughness: 0.3,
        clearcoat: 0.8,
      });
      const capsule = new THREE.Mesh(capsuleGeo, capsuleMat);
      capsule.position.set(-0.14, 0.42, 0);
      capsule.rotation.z = 0.8;
      micGroup.add(capsule);

      const grillGeo = new THREE.SphereGeometry(0.019, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const grillMat = new THREE.MeshStandardMaterial({
        color: 0x444444,
        metalness: 0.95,
        roughness: 0.6,
        wireframe: true,
      });
      const grill = new THREE.Mesh(grillGeo, grillMat);
      grill.position.set(-0.16, 0.44, 0);
      grill.rotation.z = 0.8;
      micGroup.add(grill);

      micGroup.position.set(x, 0.88, z);
      micGroup.rotation.y = angle;
      this.environmentGroup.add(micGroup);
    });
  }

  private buildMonitorScreens(): void {
    [-1, 1].forEach(side => {
      const monitorGroup = new THREE.Group();

      const screenGeo = new THREE.BoxGeometry(0.7, 0.45, 0.02);
      const screenCanvas = document.createElement("canvas");
      screenCanvas.width = 256;
      screenCanvas.height = 160;
      const sCtx = screenCanvas.getContext("2d")!;

      const bgGrad = sCtx.createLinearGradient(0, 0, 256, 160);
      bgGrad.addColorStop(0, "#0a0a1e");
      bgGrad.addColorStop(1, "#0e1028");
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, 256, 160);

      sCtx.strokeStyle = "rgba(68, 136, 255, 0.3)";
      sCtx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        sCtx.beginPath();
        sCtx.moveTo(0, 20 + i * 18);
        sCtx.lineTo(256, 20 + i * 18);
        sCtx.stroke();
      }

      sCtx.fillStyle = "rgba(68, 136, 255, 0.15)";
      for (let i = 0; i < 4; i++) {
        const bw = 20 + Math.random() * 30;
        const bh = 40 + Math.random() * 60;
        sCtx.fillRect(20 + i * 58, 130 - bh, bw, bh);
      }

      sCtx.fillStyle = "rgba(255, 255, 255, 0.6)";
      sCtx.font = "bold 14px monospace";
      sCtx.fillText("MOUGLE LIVE", 60, 18);

      sCtx.fillStyle = "rgba(255, 50, 50, 0.8)";
      sCtx.beginPath();
      sCtx.arc(16, 14, 4, 0, Math.PI * 2);
      sCtx.fill();

      const screenTex = new THREE.CanvasTexture(screenCanvas);
      screenTex.needsUpdate = true;

      const screenMat = new THREE.MeshStandardMaterial({
        map: screenTex,
        emissiveMap: screenTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
        roughness: 0.3,
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      monitorGroup.add(screen);

      const bezelMat = new THREE.MeshPhysicalMaterial({
        color: 0x111111,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 0.8,
      });
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.49, 0.025), bezelMat);
      bezel.position.z = -0.005;
      monitorGroup.add(bezel);

      const standGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.35, 8);
      const stand = new THREE.Mesh(standGeo, bezelMat);
      stand.position.set(0, -0.4, -0.01);
      monitorGroup.add(stand);

      const standBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.09, 0.01, 12),
        bezelMat
      );
      standBase.position.set(0, -0.57, -0.01);
      monitorGroup.add(standBase);

      monitorGroup.position.set(side * 4, 2.0, -3.5);
      monitorGroup.rotation.y = side * -0.25;
      this.environmentGroup.add(monitorGroup);
    });
  }

  private buildCameraRigs(): void {
    [-1, 1].forEach(side => {
      const rigGroup = new THREE.Group();
      const metalMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 0.6,
      });

      const bodyGeo = new THREE.BoxGeometry(0.25, 0.18, 0.35);
      const body = new THREE.Mesh(bodyGeo, metalMat);
      rigGroup.add(body);

      const lensGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.15, 12);
      const lensMat = new THREE.MeshPhysicalMaterial({
        color: 0x111111,
        metalness: 0.8,
        roughness: 0.1,
        clearcoat: 1.0,
      });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 0, 0.25);
      lens.rotation.x = Math.PI / 2;
      rigGroup.add(lens);

      const lensGlass = new THREE.Mesh(
        new THREE.CircleGeometry(0.04, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0x111133,
          metalness: 0.2,
          roughness: 0.0,
          clearcoat: 1.0,
          transmission: 0.3,
          opacity: 0.7,
          transparent: true,
        })
      );
      lensGlass.position.set(0, 0, 0.33);
      rigGroup.add(lensGlass);

      const tallyGeo = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.015, 0.01),
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 })
      );
      tallyGeo.position.set(0, 0.1, 0.17);
      rigGroup.add(tallyGeo);

      const tripodGeo = new THREE.CylinderGeometry(0.015, 0.02, 1.2, 8);
      const tripod = new THREE.Mesh(tripodGeo, metalMat);
      tripod.position.y = -0.7;
      rigGroup.add(tripod);

      for (let leg = 0; leg < 3; leg++) {
        const legAngle = (leg / 3) * Math.PI * 2;
        const legGeo = new THREE.CylinderGeometry(0.01, 0.012, 0.5, 6);
        const legMesh = new THREE.Mesh(legGeo, metalMat);
        legMesh.position.set(
          Math.sin(legAngle) * 0.15,
          -1.45,
          Math.cos(legAngle) * 0.15
        );
        legMesh.rotation.z = Math.sin(legAngle) * 0.15;
        legMesh.rotation.x = Math.cos(legAngle) * 0.15;
        rigGroup.add(legMesh);
      }

      rigGroup.position.set(side * 5.5, 1.8, 3);
      rigGroup.rotation.y = side * -0.3;
      this.environmentGroup.add(rigGroup);
    });
  }

  private buildFloorMarkings(): void {
    const markingMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 2.85, 64),
      markingMat
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.008;
    this.environmentGroup.add(innerRing);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 4.55, 80),
      markingMat
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.008;
    this.environmentGroup.add(outerRing);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tickGeo = new THREE.PlaneGeometry(0.02, 0.3);
      const tick = new THREE.Mesh(tickGeo, markingMat);
      tick.rotation.x = -Math.PI / 2;
      tick.position.set(
        Math.sin(angle) * 3.7,
        0.008,
        Math.cos(angle) * 3.7
      );
      tick.rotation.z = -angle;
      this.environmentGroup.add(tick);
    }

    const seatMarkMat = new THREE.MeshBasicMaterial({
      color: 0x2266cc,
      transparent: true,
      opacity: 0.06,
    });
    SEAT_POSITIONS.forEach(pos => {
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 24),
        seatMarkMat
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(pos.x, 0.006, pos.z);
      this.environmentGroup.add(mark);
    });
  }

  private buildCeilingRig(): void {
    const rigMat = new THREE.MeshPhysicalMaterial({
      color: 0x151520,
      metalness: 0.8,
      roughness: 0.3,
    });

    const mainBar = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.06, 0.06),
      rigMat
    );
    mainBar.position.set(0, 7.5, 1);
    this.environmentGroup.add(mainBar);

    const crossBar1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 6),
      rigMat
    );
    crossBar1.position.set(-3, 7.5, 1);
    this.environmentGroup.add(crossBar1);

    const crossBar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 6),
      rigMat
    );
    crossBar2.position.set(3, 7.5, 1);
    this.environmentGroup.add(crossBar2);

    for (let i = 0; i < 6; i++) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.4 + Math.random() * 0.3, 4),
        new THREE.MeshBasicMaterial({ color: 0x222233 })
      );
      cable.position.set(-5 + i * 2, 7.2, 1 + (Math.random() - 0.5) * 2);
      this.environmentGroup.add(cable);
    }
  }

  update(elapsed: number): void {
    this.ledWallMeshes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.25 + Math.sin(elapsed * 0.5 + i * 1.2) * 0.08;
    });

    if (this.keyLight) {
      this.keyLight.intensity = 5.0 + Math.sin(elapsed * 0.25) * 0.1;
    }
    if (this.warmRimLeft) {
      this.warmRimLeft.intensity = 0.6 + Math.sin(elapsed * 0.35) * 0.05;
    }
    if (this.warmRimRight) {
      this.warmRimRight.intensity = 0.6 + Math.sin(elapsed * 0.35 + 1) * 0.05;
    }
  }

  dispose(): void {
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
