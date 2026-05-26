import * as THREE from "three";
import gsap from "gsap";
import { AgentProfile, AvatarState, SEAT_POSITIONS, SEAT_ROTATIONS } from "./types";
import { fbm } from "./PerlinNoise";

export class Avatar {
  public group: THREE.Group;
  public state: AvatarState;
  public profile: AgentProfile;

  private head!: THREE.Group;
  private body!: THREE.Group;
  private jawMesh!: THREE.Mesh;
  private leftEyeLid!: THREE.Mesh;
  private rightEyeLid!: THREE.Mesh;
  private leftIris!: THREE.Mesh;
  private rightIris!: THREE.Mesh;
  private leftPupil!: THREE.Mesh;
  private rightPupil!: THREE.Mesh;
  private leftCornea!: THREE.Mesh;
  private rightCornea!: THREE.Mesh;
  private leftSpecular!: THREE.Mesh;
  private rightSpecular!: THREE.Mesh;
  private nameSprite!: THREE.Sprite;
  private speakingIndicator!: THREE.Mesh;
  private chairGroup!: THREE.Group;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private shoulders!: THREE.Mesh;
  private noiseOffset: number;

  constructor(profile: AgentProfile) {
    this.profile = profile;
    this.group = new THREE.Group();
    this.noiseOffset = Math.random() * 1000;
    this.state = {
      isSpeaking: false,
      audioLevel: 0,
      mouthOpenness: 0,
      mouthVelocity: 0,
      blinkTimer: 2 + Math.random() * 4,
      blinkState: 0,
      blinkDuration: 0,
      nextBlinkLeft: Math.random() > 0.5,
      breathPhase: Math.random() * Math.PI * 2,
      headNodPhase: Math.random() * Math.PI * 2,
      gesturePhase: Math.random() * Math.PI * 2,
      idleSwayPhase: Math.random() * Math.PI * 2,
      saccadeTimer: 3 + Math.random() * 4,
      saccadeTarget: { x: 0, y: 0 },
      saccadeCurrent: { x: 0, y: 0 },
      saccadeTimer2: 0,
      listenTargetId: null,
      listenNodPhase: 0,
      listenNodActive: false,
      listenNodTimer: 0,
      postureShiftTimer: 8 + Math.random() * 12,
      postureOffset: { x: 0, z: 0 },
      lipSyncDelay: 80 + Math.random() * 40,
      delayedAudioLevel: 0,
    } as AvatarState;

    this.buildAvatar();
    this.positionAtSeat();
  }

  private positionAtSeat(): void {
    const pos = SEAT_POSITIONS[this.profile.seatIndex];
    const rot = SEAT_ROTATIONS[this.profile.seatIndex];
    this.group.position.copy(pos);
    this.group.rotation.y = rot;
  }

  private buildAvatar(): void {
    this.buildChair();
    this.buildBody();
    this.buildHead();
    this.buildNameplate();
    this.buildSpeakingIndicator();
  }

  private buildChair(): void {
    this.chairGroup = new THREE.Group();
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a2e,
      metalness: 0.85,
      roughness: 0.15,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    });
    const cushionMat = new THREE.MeshPhysicalMaterial({
      color: 0x111122,
      metalness: 0.05,
      roughness: 0.85,
      sheen: 0.3,
      sheenColor: new THREE.Color(0x222244),
    });

    const seatGeo = new THREE.BoxGeometry(0.55, 0.08, 0.5);
    seatGeo.translate(0, 0, 0);
    const backrestGeo = new THREE.BoxGeometry(0.55, 0.7, 0.08);

    const seatCushion = new THREE.Mesh(seatGeo, cushionMat);
    seatCushion.position.y = 0.5;
    seatCushion.receiveShadow = true;
    this.chairGroup.add(seatCushion);

    const backrest = new THREE.Mesh(backrestGeo, cushionMat);
    backrest.position.set(0, 0.85, -0.24);
    this.chairGroup.add(backrest);

    const backFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.73, 0.03),
      frameMat
    );
    backFrame.position.set(0, 0.85, -0.27);
    this.chairGroup.add(backFrame);

    const legGeo = new THREE.CylinderGeometry(0.025, 0.018, 0.5, 8);
    [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(x, 0.25, z);
      leg.castShadow = true;
      this.chairGroup.add(leg);
    });

    const armrestGeo = new THREE.BoxGeometry(0.06, 0.04, 0.4);
    [-1, 1].forEach(side => {
      const armrest = new THREE.Mesh(armrestGeo, frameMat);
      armrest.position.set(side * 0.3, 0.72, -0.02);
      this.chairGroup.add(armrest);
      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6),
        frameMat
      );
      support.position.set(side * 0.3, 0.62, 0.1);
      this.chairGroup.add(support);
    });

    this.group.add(this.chairGroup);
  }

  private buildBody(): void {
    this.body = new THREE.Group();
    const skinTone = this.getSkinTone();
    const clothColor = this.profile.color;
    const isFemale = this.profile.gender === "female";

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: skinTone,
      roughness: 0.55,
      clearcoat: 0.2,
      clearcoatRoughness: 0.6,
      sheen: 0.4,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xff8866).lerp(new THREE.Color(skinTone), 0.5),
    });

    const clothMat = new THREE.MeshPhysicalMaterial({
      color: clothColor,
      metalness: 0.05,
      roughness: 0.65,
      clearcoat: 0.15,
      sheen: 0.2,
      sheenColor: new THREE.Color(clothColor).offsetHSL(0, 0, 0.2),
    });

    const darkClothMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(clothColor).offsetHSL(0, -0.1, -0.15),
      metalness: 0.05,
      roughness: 0.7,
    });

    const chestW = isFemale ? 0.22 : 0.26;
    const waistW = isFemale ? 0.17 : 0.22;
    const chestD = isFemale ? 0.14 : 0.16;

    const upperTorsoGeo = new THREE.CylinderGeometry(chestW, chestW * 0.95, 0.3, 16);
    const upperTorso = new THREE.Mesh(upperTorsoGeo, clothMat);
    upperTorso.position.y = 1.0;
    upperTorso.castShadow = true;
    upperTorso.scale.z = chestD / chestW;
    this.body.add(upperTorso);

    const midTorsoGeo = new THREE.CylinderGeometry(chestW * 0.95, waistW, 0.2, 16);
    const midTorso = new THREE.Mesh(midTorsoGeo, clothMat);
    midTorso.position.y = 0.78;
    midTorso.castShadow = true;
    midTorso.scale.z = chestD / chestW;
    this.body.add(midTorso);

    const lowerTorsoGeo = new THREE.CylinderGeometry(waistW, waistW * 1.05, 0.15, 16);
    const lowerTorso = new THREE.Mesh(lowerTorsoGeo, darkClothMat);
    lowerTorso.position.y = 0.62;
    lowerTorso.castShadow = true;
    lowerTorso.scale.z = chestD / waistW;
    this.body.add(lowerTorso);

    const shoulderGeo = new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const shoulderMat = new THREE.MeshPhysicalMaterial({
      color: clothColor,
      metalness: 0.05,
      roughness: 0.65,
      clearcoat: 0.15,
    });
    this.shoulders = new THREE.Mesh(shoulderGeo, shoulderMat);
    this.shoulders.position.y = 1.15;
    this.shoulders.rotation.x = Math.PI;
    this.shoulders.scale.z = 0.7;
    this.body.add(this.shoulders);

    const collarGeo = new THREE.TorusGeometry(0.12, 0.02, 6, 16, Math.PI * 1.4);
    const collarMat = new THREE.MeshPhysicalMaterial({
      color: 0xeeeeee,
      roughness: 0.5,
      clearcoat: 0.3,
    });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 1.17, 0.06);
    collar.rotation.x = Math.PI * 0.55;
    collar.rotation.z = Math.PI * 0.1;
    this.body.add(collar);

    if (!isFemale) {
      const lapelGeo = new THREE.PlaneGeometry(0.08, 0.2);
      const lapelMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(clothColor).offsetHSL(0, 0, -0.05),
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      [-1, 1].forEach(side => {
        const lapel = new THREE.Mesh(lapelGeo, lapelMat);
        lapel.position.set(side * 0.07, 1.05, 0.14);
        lapel.rotation.y = side * 0.25;
        lapel.rotation.z = side * 0.1;
        this.body.add(lapel);
      });
    }

    const neckGeo = new THREE.CylinderGeometry(0.065, 0.085, 0.1, 12);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 1.22;
    neck.castShadow = true;
    this.body.add(neck);

    const buildArm = (side: number): THREE.Group => {
      const armGroup = new THREE.Group();

      const shoulderJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        clothMat
      );
      shoulderJoint.position.y = 0;
      armGroup.add(shoulderJoint);

      const upperArmGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.28, 10);
      const upperArm = new THREE.Mesh(upperArmGeo, clothMat);
      upperArm.position.y = -0.15;
      upperArm.castShadow = true;
      armGroup.add(upperArm);

      const elbowJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 6),
        clothMat
      );
      elbowJoint.position.y = -0.3;
      armGroup.add(elbowJoint);

      const forearmGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.25, 10);
      const forearmMat = new THREE.MeshPhysicalMaterial({
        color: clothColor,
        roughness: 0.7,
      });
      const forearm = new THREE.Mesh(forearmGeo, forearmMat);
      forearm.position.y = -0.42;
      forearm.rotation.x = -0.6;
      forearm.castShadow = true;
      armGroup.add(forearm);

      const wristGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.06, 8);
      const wrist = new THREE.Mesh(wristGeo, skinMat);
      wrist.position.set(0, -0.52, 0.1);
      armGroup.add(wrist);

      const handGeo = new THREE.BoxGeometry(0.05, 0.07, 0.025);
      handGeo.translate(0, -0.035, 0);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(0, -0.55, 0.14);
      hand.rotation.x = -0.3;
      armGroup.add(hand);

      const thumbGeo = new THREE.CylinderGeometry(0.008, 0.007, 0.03, 6);
      const thumb = new THREE.Mesh(thumbGeo, skinMat);
      thumb.position.set(side * 0.025, -0.57, 0.15);
      thumb.rotation.z = side * 0.5;
      armGroup.add(thumb);

      for (let f = 0; f < 4; f++) {
        const fingerGeo = new THREE.CylinderGeometry(0.005, 0.004, 0.035, 5);
        const finger = new THREE.Mesh(fingerGeo, skinMat);
        finger.position.set((f - 1.5) * 0.012, -0.60, 0.14);
        finger.rotation.x = -0.4;
        armGroup.add(finger);
      }

      armGroup.position.set(side * 0.3, 1.12, 0);
      armGroup.rotation.z = side * 0.12;
      return armGroup;
    };

    this.leftArm = buildArm(-1);
    this.rightArm = buildArm(1);
    this.body.add(this.leftArm);
    this.body.add(this.rightArm);

    this.group.add(this.body);
  }

  private buildHead(): void {
    this.head = new THREE.Group();
    const skinTone = this.getSkinTone();
    const skinColor = new THREE.Color(skinTone);
    const isFemale = this.profile.gender === "female";

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.5,
      clearcoat: 0.3,
      clearcoatRoughness: 0.5,
      sheen: 0.5,
      sheenRoughness: 0.4,
      sheenColor: new THREE.Color(0xff6644).lerp(skinColor, 0.5),
    });

    const craniumGeo = new THREE.SphereGeometry(0.155, 32, 24);
    craniumGeo.scale(1, 1.08, 1.02);
    if (isFemale) craniumGeo.scale(0.94, 1.0, 0.96);
    const cranium = new THREE.Mesh(craniumGeo, skinMat);
    cranium.castShadow = true;
    this.head.add(cranium);

    const jawGeoShape = new THREE.SphereGeometry(0.12, 16, 12);
    jawGeoShape.scale(isFemale ? 0.9 : 1.0, 0.6, 0.85);
    const jawShape = new THREE.Mesh(jawGeoShape, skinMat);
    jawShape.position.set(0, -0.09, 0.03);
    jawShape.castShadow = true;
    this.head.add(jawShape);

    const chinGeo = new THREE.SphereGeometry(isFemale ? 0.035 : 0.04, 12, 8);
    chinGeo.scale(1, 0.7, 1);
    const chin = new THREE.Mesh(chinGeo, skinMat);
    chin.position.set(0, -0.135, 0.09);
    this.head.add(chin);

    if (!isFemale) {
      const browGeo = new THREE.BoxGeometry(0.2, 0.025, 0.06);
      browGeo.translate(0, 0, 0);
      const browMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(skinColor).offsetHSL(0, 0, -0.03),
        roughness: 0.55,
        clearcoat: 0.2,
        sheen: 0.4,
        sheenColor: new THREE.Color(0xff8866),
      });
      const browRidge = new THREE.Mesh(browGeo, browMat);
      browRidge.position.set(0, 0.05, 0.135);
      this.head.add(browRidge);
    }

    [-1, 1].forEach(side => {
      const cheekGeo = new THREE.SphereGeometry(0.055, 10, 8);
      cheekGeo.scale(0.7, 0.6, 0.5);
      const cheekMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(skinColor).lerp(new THREE.Color(0xee9988), isFemale ? 0.1 : 0.04),
        roughness: 0.5,
        clearcoat: 0.25,
        sheen: 0.5,
        sheenColor: new THREE.Color(0xffaa88),
      });
      const cheek = new THREE.Mesh(cheekGeo, cheekMat);
      cheek.position.set(side * 0.09, -0.02, 0.1);
      this.head.add(cheek);
    });

    [-1, 1].forEach(side => {
      const socketGeo = new THREE.SphereGeometry(0.032, 12, 10);
      const socketMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(skinColor).offsetHSL(0, 0, -0.06),
        roughness: 0.6,
        clearcoat: 0.15,
      });
      const socket = new THREE.Mesh(socketGeo, socketMat);
      socket.position.set(side * 0.058, 0.02, 0.12);
      socket.scale.z = 0.6;
      this.head.add(socket);
    });

    [-1, 1].forEach(side => {
      const earGeo = new THREE.SphereGeometry(0.03, 8, 6);
      earGeo.scale(0.5, 1, 0.6);
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.position.set(side * 0.155, 0.0, 0);
      this.head.add(ear);
      const earLobeGeo = new THREE.SphereGeometry(0.012, 6, 4);
      const earLobe = new THREE.Mesh(earLobeGeo, skinMat);
      earLobe.position.set(side * 0.155, -0.025, 0.005);
      this.head.add(earLobe);
    });

    const hairColor = this.getHairColor();
    this.buildHair(hairColor, isFemale);

    this.buildRealisticEyes(skinColor, isFemale);

    const noseBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.06, 0.035),
      skinMat
    );
    noseBridge.position.set(0, 0.01, 0.145);
    this.head.add(noseBridge);

    const noseTipGeo = new THREE.SphereGeometry(isFemale ? 0.018 : 0.022, 10, 8);
    noseTipGeo.scale(1.2, 0.8, 1);
    const noseTipMat = new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.45,
      clearcoat: 0.35,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xff8866),
    });
    const noseTip = new THREE.Mesh(noseTipGeo, noseTipMat);
    noseTip.position.set(0, -0.02, 0.165);
    this.head.add(noseTip);

    [-1, 1].forEach(side => {
      const nostrilGeo = new THREE.SphereGeometry(0.008, 6, 4);
      const nostrilMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(skinColor).offsetHSL(0, 0.05, -0.08),
        roughness: 0.7,
      });
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * 0.012, -0.032, 0.158);
      this.head.add(nostril);
    });

    const lipColor = isFemale ? 0xcc5555 : 0xbb7766;
    const upperLipGeo = new THREE.TorusGeometry(0.03, 0.009, 8, 16, Math.PI);
    const upperLipMat = new THREE.MeshPhysicalMaterial({
      color: lipColor,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xff8888),
    });
    const upperLip = new THREE.Mesh(upperLipGeo, upperLipMat);
    upperLip.position.set(0, -0.055, 0.135);
    upperLip.rotation.z = Math.PI;
    this.head.add(upperLip);

    const jawAnimGeo = new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.4);
    const jawAnimMat = new THREE.MeshPhysicalMaterial({
      color: lipColor,
      roughness: 0.3,
      clearcoat: 0.6,
    });
    this.jawMesh = new THREE.Mesh(jawAnimGeo, jawAnimMat);
    this.jawMesh.position.set(0, -0.065, 0.125);
    this.head.add(this.jawMesh);

    const philtrumGeo = new THREE.PlaneGeometry(0.008, 0.02);
    const philtrumMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(skinColor).offsetHSL(0, 0, -0.02),
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const philtrum = new THREE.Mesh(philtrumGeo, philtrumMat);
    philtrum.position.set(0, -0.04, 0.155);
    this.head.add(philtrum);

    if (this.profile.role === "host") {
      const earPieceGeo = new THREE.TorusGeometry(0.035, 0.005, 6, 16, Math.PI * 1.3);
      const earPieceMat = new THREE.MeshPhysicalMaterial({
        color: 0x222222,
        metalness: 0.95,
        roughness: 0.1,
        clearcoat: 1.0,
      });
      const earPiece = new THREE.Mesh(earPieceGeo, earPieceMat);
      earPiece.position.set(-0.15, 0.0, 0.02);
      earPiece.rotation.y = Math.PI / 2;
      this.head.add(earPiece);
    }

    this.head.position.y = 1.35;
    this.group.add(this.head);
  }

  private buildHair(hairColor: number, isFemale: boolean): void {
    const hairMat = new THREE.MeshPhysicalMaterial({
      color: hairColor,
      roughness: 0.75,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
      sheen: 0.6,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(hairColor).offsetHSL(0, -0.1, 0.2),
    });

    if (isFemale) {
      const topGeo = new THREE.SphereGeometry(0.168, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const top = new THREE.Mesh(topGeo, hairMat);
      top.position.y = 0.02;
      this.head.add(top);

      const backGeo = new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.45);
      const back = new THREE.Mesh(backGeo, hairMat);
      back.position.set(0, 0.0, -0.02);
      back.scale.z = 1.15;
      this.head.add(back);

      [-1, 1].forEach(side => {
        const strand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.02, 0.2, 8),
          hairMat
        );
        strand.position.set(side * 0.14, -0.06, 0.01);
        strand.rotation.z = side * 0.08;
        this.head.add(strand);

        const lower = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.015, 0.12, 8),
          hairMat
        );
        lower.position.set(side * 0.135, -0.15, -0.01);
        lower.rotation.z = side * 0.05;
        this.head.add(lower);
      });

      const backFlow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.05, 0.18, 10),
        hairMat
      );
      backFlow.position.set(0, -0.08, -0.12);
      this.head.add(backFlow);
    } else {
      const topGeo = new THREE.SphereGeometry(0.162, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const top = new THREE.Mesh(topGeo, hairMat);
      top.position.y = 0.02;
      this.head.add(top);

      const sideGeo = new THREE.SphereGeometry(0.158, 14, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.3);
      const sides = new THREE.Mesh(sideGeo, hairMat);
      sides.position.set(0, 0.0, -0.01);
      sides.scale.x = 1.02;
      this.head.add(sides);

      const frontGeo = new THREE.BoxGeometry(0.24, 0.02, 0.06);
      const front = new THREE.Mesh(frontGeo, hairMat);
      front.position.set(0, 0.12, 0.1);
      front.rotation.x = -0.15;
      this.head.add(front);
    }

    const browMat = new THREE.MeshPhysicalMaterial({
      color: hairColor,
      roughness: 0.8,
    });
    [-1, 1].forEach(side => {
      const browGeo = new THREE.BoxGeometry(0.04, 0.006, 0.01);
      const brow = new THREE.Mesh(browGeo, browMat);
      brow.position.set(side * 0.055, 0.048, 0.145);
      brow.rotation.z = side * -0.12;
      this.head.add(brow);
    });
  }

  private buildRealisticEyes(skinColor: THREE.Color, isFemale: boolean): void {
    const eyeColor = this.getEyeColor();

    [-1, 1].forEach((side) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.058, 0.02, 0.135);

      const scleraGeo = new THREE.SphereGeometry(0.024, 20, 14);
      const scleraMat = new THREE.MeshPhysicalMaterial({
        color: 0xf8f4f0,
        roughness: 0.25,
        clearcoat: 0.9,
        clearcoatRoughness: 0.08,
        sheen: 0.2,
        sheenColor: new THREE.Color(0xffe0d0),
      });
      const sclera = new THREE.Mesh(scleraGeo, scleraMat);
      eyeGroup.add(sclera);

      const irisGeo = new THREE.CircleGeometry(0.013, 32);
      const irisMat = new THREE.MeshPhysicalMaterial({
        color: eyeColor,
        roughness: 0.15,
        metalness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
      });
      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.position.z = 0.023;
      eyeGroup.add(iris);
      if (side === -1) this.leftIris = iris;
      else this.rightIris = iris;

      const irisDetailGeo = new THREE.RingGeometry(0.006, 0.013, 24);
      const irisDetailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(eyeColor).offsetHSL(0, 0.1, -0.1),
        roughness: 0.2,
        transparent: true,
        opacity: 0.5,
      });
      const irisDetail = new THREE.Mesh(irisDetailGeo, irisDetailMat);
      irisDetail.position.z = 0.0232;
      eyeGroup.add(irisDetail);

      const pupilGeo = new THREE.CircleGeometry(0.005, 20);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x030303 });
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.0235;
      eyeGroup.add(pupil);
      if (side === -1) this.leftPupil = pupil;
      else this.rightPupil = pupil;

      const limbusGeo = new THREE.RingGeometry(0.012, 0.0135, 32);
      const limbusMat = new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.4,
      });
      const limbus = new THREE.Mesh(limbusGeo, limbusMat);
      limbus.position.z = 0.0236;
      eyeGroup.add(limbus);

      const corneaGeo = new THREE.SphereGeometry(0.016, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
      const corneaMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.1,
        roughness: 0.0,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        ior: 1.376,
        transmission: 0.65,
      });
      const cornea = new THREE.Mesh(corneaGeo, corneaMat);
      cornea.position.z = 0.014;
      cornea.rotation.x = -Math.PI / 2;
      eyeGroup.add(cornea);
      if (side === -1) this.leftCornea = cornea;
      else this.rightCornea = cornea;

      const specGeo = new THREE.CircleGeometry(0.003, 8);
      const specMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
      });
      const spec = new THREE.Mesh(specGeo, specMat);
      spec.position.set(0.004, 0.005, 0.025);
      eyeGroup.add(spec);
      if (side === -1) this.leftSpecular = spec;
      else this.rightSpecular = spec;

      const specSmall = new THREE.Mesh(
        new THREE.CircleGeometry(0.0015, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
      );
      specSmall.position.set(-0.003, -0.003, 0.025);
      eyeGroup.add(specSmall);

      this.head.add(eyeGroup);
    });

    const lidMat = new THREE.MeshPhysicalMaterial({
      color: skinColor,
      side: THREE.DoubleSide,
      roughness: 0.5,
      clearcoat: 0.2,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xff8866),
    });

    const lidGeo = new THREE.PlaneGeometry(0.058, 0.016);

    this.leftEyeLid = new THREE.Mesh(lidGeo, lidMat);
    this.leftEyeLid.position.set(-0.058, 0.035, 0.16);
    this.leftEyeLid.visible = false;
    this.head.add(this.leftEyeLid);

    this.rightEyeLid = new THREE.Mesh(lidGeo, lidMat);
    this.rightEyeLid.position.set(0.058, 0.035, 0.16);
    this.rightEyeLid.visible = false;
    this.head.add(this.rightEyeLid);

    if (isFemale) {
      const lashMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      [-1, 1].forEach(side => {
        const lashGeo = new THREE.PlaneGeometry(0.05, 0.004);
        const lash = new THREE.Mesh(lashGeo, lashMat);
        lash.position.set(side * 0.058, 0.038, 0.16);
        this.head.add(lash);
      });
    }
  }

  private buildNameplate(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(8, 8, 24, 0.9)";
    ctx.beginPath();
    ctx.roundRect(8, 4, 496, 88, 12);
    ctx.fill();

    const grd = ctx.createLinearGradient(8, 0, 504, 0);
    grd.addColorStop(0, `rgba(${this.hexToRgb(this.profile.accentColor)}, 0.6)`);
    grd.addColorStop(0.5, `rgba(${this.hexToRgb(this.profile.accentColor)}, 0.2)`);
    grd.addColorStop(1, `rgba(${this.hexToRgb(this.profile.accentColor)}, 0.6)`);
    ctx.strokeStyle = grd;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(9, 5, 494, 86, 11);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.profile.name, 256, 42);

    ctx.fillStyle = `#${this.profile.accentColor.getHexString()}`;
    ctx.font = "600 18px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText(this.profile.role.toUpperCase(), 256, 72);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.scale.set(0.9, 0.17, 1);
    this.nameSprite.position.set(0, 0.18, 0);
    this.group.add(this.nameSprite);
  }

  private hexToRgb(color: THREE.Color): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `${r}, ${g}, ${b}`;
  }

  private buildSpeakingIndicator(): void {
    const ringGeo = new THREE.RingGeometry(0.2, 0.215, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.profile.accentColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.speakingIndicator = new THREE.Mesh(ringGeo, ringMat);
    this.speakingIndicator.position.set(0, 1.35, 0.2);
    this.group.add(this.speakingIndicator);

    const glowGeo = new THREE.RingGeometry(0.215, 0.24, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.profile.accentColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 1.35, 0.19);
    glow.userData.isGlow = true;
    this.group.add(glow);
  }

  setSpeaking(speaking: boolean, audioLevel: number = 0): void {
    this.state.isSpeaking = speaking;
    this.state.audioLevel = audioLevel;

    const mat = this.speakingIndicator.material as THREE.MeshBasicMaterial;
    gsap.to(mat, {
      opacity: speaking ? 0.7 : 0,
      duration: 0.3,
    });

    this.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData.isGlow) {
        gsap.to(child.material as THREE.MeshBasicMaterial, {
          opacity: speaking ? 0.25 : 0,
          duration: 0.3,
        });
      }
    });
  }

  setListenTarget(targetId: string | null, targetSeatIndex: number = -1): void {
    this.state.listenTargetId = targetId;
    this._listenSeatIndex = targetSeatIndex;
  }

  private _listenSeatIndex: number = -1;

  update(dt: number, elapsed: number): void {
    this.updatePerlinMicroMotion(elapsed);
    this.updateBreathing(elapsed);
    this.updateAsymmetricBlinking(dt);
    this.updateEyeSaccades(dt, elapsed);
    this.updateMouthWithOvershoot(dt, elapsed);
    this.updateHeadMovement(elapsed);
    this.updateListeningBehavior(dt, elapsed);
    this.updatePostureMicroAdjust(dt, elapsed);
    this.updateSpecularHighlights(elapsed);
    this.updateSpeakingRing(elapsed);
  }

  private updatePerlinMicroMotion(elapsed: number): void {
    const t = elapsed * 0.3;
    const n = this.noiseOffset;

    const headNoiseX = fbm(t + n, 0, 0) * 0.006;
    const headNoiseY = fbm(0, t + n, 0) * 0.004;
    const headNoiseZ = fbm(0, 0, t + n) * 0.003;
    this.head.position.x = headNoiseX;
    this.head.position.z = headNoiseZ;

    const shoulderNoiseX = fbm(t * 0.5 + n + 100, 0, 0) * 0.003;
    const shoulderNoiseZ = fbm(0, 0, t * 0.5 + n + 100) * 0.002;
    this.shoulders.position.x = shoulderNoiseX;
    this.shoulders.position.z = 0 + shoulderNoiseZ;
  }

  private updateBreathing(elapsed: number): void {
    const breathCycle = elapsed * 1.2 + this.state.breathPhase;
    const inhale = Math.pow(Math.sin(breathCycle), 2) * 0.004;
    const exhale = Math.sin(breathCycle * 2) * 0.001;
    const breath = inhale + exhale;

    this.body.position.y = breath;
    this.head.position.y = 1.35 + breath;

    this.shoulders.scale.x = 1 + Math.sin(breathCycle) * 0.008;
    this.shoulders.scale.z = 0.7 + Math.sin(breathCycle) * 0.004;
  }

  private updateAsymmetricBlinking(dt: number): void {
    this.state.blinkTimer -= dt;
    if (this.state.blinkTimer <= 0) {
      const isDouble = Math.random() < 0.15;
      const isAsymmetric = Math.random() < 0.25;
      this.state.blinkDuration = 80 + Math.random() * 60;

      this.leftEyeLid.visible = true;
      if (!isAsymmetric) {
        this.rightEyeLid.visible = true;
      }

      setTimeout(() => {
        this.leftEyeLid.visible = false;
        this.rightEyeLid.visible = false;

        if (isDouble) {
          setTimeout(() => {
            this.leftEyeLid.visible = true;
            this.rightEyeLid.visible = true;
            setTimeout(() => {
              this.leftEyeLid.visible = false;
              this.rightEyeLid.visible = false;
            }, 60 + Math.random() * 30);
          }, 120 + Math.random() * 60);
        }
      }, this.state.blinkDuration);

      if (this.state.isSpeaking) {
        this.state.blinkTimer = 1.5 + Math.random() * 2.5;
      } else {
        this.state.blinkTimer = 3 + Math.random() * 4;
      }
    }
  }

  private updateEyeSaccades(dt: number, elapsed: number): void {
    this.state.saccadeTimer -= dt;
    if (this.state.saccadeTimer <= 0) {
      this.state.saccadeTarget = {
        x: (Math.random() - 0.5) * 0.006,
        y: (Math.random() - 0.5) * 0.004,
      };
      this.state.saccadeTimer = 3 + Math.random() * 4;
    }

    const saccadeSpeed = 0.08;
    this.state.saccadeCurrent.x += (this.state.saccadeTarget.x - this.state.saccadeCurrent.x) * saccadeSpeed;
    this.state.saccadeCurrent.y += (this.state.saccadeTarget.y - this.state.saccadeCurrent.y) * saccadeSpeed;

    const microTremor = {
      x: Math.sin(elapsed * 30 + this.noiseOffset) * 0.0003,
      y: Math.cos(elapsed * 25 + this.noiseOffset) * 0.0002,
    };

    const offsetX = this.state.saccadeCurrent.x + microTremor.x;
    const offsetY = this.state.saccadeCurrent.y + microTremor.y;

    if (this.leftIris) {
      this.leftIris.position.x = offsetX;
      this.leftIris.position.y = offsetY;
    }
    if (this.rightIris) {
      this.rightIris.position.x = offsetX;
      this.rightIris.position.y = offsetY;
    }
    if (this.leftPupil) {
      this.leftPupil.position.x = offsetX;
      this.leftPupil.position.y = offsetY;
    }
    if (this.rightPupil) {
      this.rightPupil.position.x = offsetX;
      this.rightPupil.position.y = offsetY;
    }
  }

  private updateMouthWithOvershoot(dt: number, elapsed: number): void {
    if (this.state.isSpeaking) {
      const speed = 8 + this.state.audioLevel * 4;
      const targetOpenness =
        (Math.sin(elapsed * speed) * 0.5 + 0.5) * 0.4 +
        (Math.sin(elapsed * speed * 1.7) * 0.5 + 0.5) * 0.3 +
        this.state.audioLevel * 0.3;

      const overshoot = 1.15;
      const damping = 0.12;
      const diff = targetOpenness * overshoot - this.state.mouthOpenness;
      this.state.mouthVelocity += diff * 0.3;
      this.state.mouthVelocity *= (1 - damping);
      this.state.mouthOpenness += this.state.mouthVelocity;
      this.state.mouthOpenness = THREE.MathUtils.clamp(this.state.mouthOpenness, 0, 1);
    } else {
      this.state.mouthVelocity *= 0.85;
      this.state.mouthOpenness = THREE.MathUtils.lerp(this.state.mouthOpenness, 0, 0.08);
    }

    this.jawMesh.position.y = -0.065 - this.state.mouthOpenness * 0.025;
    this.jawMesh.scale.y = 1 + this.state.mouthOpenness * 0.6;
    this.jawMesh.scale.x = 1 + this.state.mouthOpenness * 0.15;
  }

  private updateHeadMovement(elapsed: number): void {
    if (this.state.isSpeaking) {
      const t = elapsed + this.state.headNodPhase;
      const nodX = Math.sin(t * 2.5) * 0.04 + fbm(t, 0.5, 0) * 0.02;
      const nodY = Math.sin(t * 1.8) * 0.03 + fbm(0, t, 0.5) * 0.02;
      const nodZ = Math.sin(t * 1.2) * 0.02;
      this.head.rotation.x = nodX;
      this.head.rotation.y = nodY;
      this.head.rotation.z = nodZ;
    } else if (!this.state.listenTargetId) {
      const lookX = Math.sin(elapsed * 0.5 + this.state.headNodPhase) * 0.02;
      const lookY = Math.sin(elapsed * 0.3) * 0.04;
      this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, lookX, 0.02);
      this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, lookY, 0.02);
      this.head.rotation.z = THREE.MathUtils.lerp(this.head.rotation.z, 0, 0.02);
    }
  }

  private updateListeningBehavior(dt: number, elapsed: number): void {
    if (!this.state.listenTargetId || this.state.isSpeaking) return;

    const speakerSeatIdx = this.getSpeakerSeatIndex(this.state.listenTargetId);
    if (speakerSeatIdx < 0) return;

    const mySeat = SEAT_POSITIONS[this.profile.seatIndex];
    const theirSeat = SEAT_POSITIONS[speakerSeatIdx];
    const dir = new THREE.Vector3().subVectors(theirSeat, mySeat);
    const targetAngleY = Math.atan2(dir.x, dir.z) - SEAT_ROTATIONS[this.profile.seatIndex];
    const clampedAngle = THREE.MathUtils.clamp(targetAngleY, -0.4, 0.4);

    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, clampedAngle, 0.03);
    this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, -0.02, 0.02);

    this.state.listenNodTimer -= dt;
    if (this.state.listenNodTimer <= 0 && !this.state.listenNodActive) {
      this.state.listenNodActive = true;
      this.state.listenNodPhase = elapsed;
      this.state.listenNodTimer = 2 + Math.random() * 5;
    }

    if (this.state.listenNodActive) {
      const nodElapsed = elapsed - this.state.listenNodPhase;
      if (nodElapsed < 1.2) {
        const nod = Math.sin(nodElapsed * Math.PI * 2.5) * 0.03;
        this.head.rotation.x += nod;
      } else {
        this.state.listenNodActive = false;
      }
    }

    this.state.saccadeTarget = {
      x: clampedAngle * 0.3 + (Math.random() - 0.5) * 0.002,
      y: (Math.random() - 0.5) * 0.002,
    };
  }

  private updatePostureMicroAdjust(dt: number, elapsed: number): void {
    if (this.state.isSpeaking) return;

    this.state.postureShiftTimer -= dt;
    if (this.state.postureShiftTimer <= 0) {
      this.state.postureOffset = {
        x: (Math.random() - 0.5) * 0.008,
        z: (Math.random() - 0.5) * 0.006,
      };
      this.state.postureShiftTimer = 8 + Math.random() * 12;
    }

    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, this.state.postureOffset.x, 0.005);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, this.state.postureOffset.z, 0.005);

    const armSway = fbm(elapsed * 0.2 + this.noiseOffset + 200, 0, 0) * 0.015;
    this.leftArm.rotation.z = -0.12 + armSway;
    this.rightArm.rotation.z = 0.12 - armSway;
  }

  private updateSpecularHighlights(elapsed: number): void {
    const sx = Math.sin(elapsed * 0.4) * 0.003 + 0.004;
    const sy = Math.cos(elapsed * 0.3) * 0.002 + 0.005;
    if (this.leftSpecular) {
      this.leftSpecular.position.x = sx;
      this.leftSpecular.position.y = sy;
    }
    if (this.rightSpecular) {
      this.rightSpecular.position.x = sx;
      this.rightSpecular.position.y = sy;
    }
  }

  private updateSpeakingRing(elapsed: number): void {
    if (this.state.isSpeaking) {
      const scale = 1 + Math.sin(elapsed * 6) * 0.08 + this.state.audioLevel * 0.15;
      this.speakingIndicator.scale.set(scale, scale, 1);
    }
  }

  private getSpeakerSeatIndex(speakerId: string): number {
    return this._listenSeatIndex;
  }

  private getSkinTone(): number {
    switch (this.profile.role) {
      case "host": return 0xd4a574;
      case "analyst": return 0xe8c4a0;
      case "expert": return 0xc89070;
      default: return 0xd4a574;
    }
  }

  private getHairColor(): number {
    switch (this.profile.role) {
      case "host": return 0x2a1a0a;
      case "analyst": return 0x3a2010;
      case "expert": return 0x1a1a1a;
      default: return 0x2a1a0a;
    }
  }

  private getEyeColor(): number {
    switch (this.profile.role) {
      case "host": return 0x4488aa;
      case "analyst": return 0x448844;
      case "expert": return 0x664422;
      default: return 0x4488aa;
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        child.material.dispose();
        child.material.map?.dispose();
      }
    });
  }
}

export function createAgentFromParticipant(participant: any, seatIndex: number): AgentProfile {
  const ROLES: Array<"host" | "analyst" | "expert"> = ["host", "analyst", "expert"];
  const GENDERS: Array<"male" | "female" | "neutral"> = ["male", "female", "neutral"];
  const VOICES = ["onyx", "nova", "echo"];
  const COLORS = [
    { main: new THREE.Color(0x2244aa), accent: new THREE.Color(0x4488ff) },
    { main: new THREE.Color(0x6622aa), accent: new THREE.Color(0xaa66ff) },
    { main: new THREE.Color(0x226644), accent: new THREE.Color(0x44cc88) },
  ];

  const idx = Math.min(seatIndex, 2);
  const name = participant.user?.displayName || `Agent ${seatIndex + 1}`;

  return {
    id: participant.userId,
    name,
    role: ROLES[idx],
    gender: GENDERS[idx],
    voiceId: participant.ttsVoice || VOICES[idx],
    seatIndex: idx,
    color: COLORS[idx].main,
    accentColor: COLORS[idx].accent,
  };
}

export function createDefaultAgents(): AgentProfile[] {
  return [
    {
      id: "agent-host",
      name: "Marcus Chen",
      role: "host",
      gender: "male",
      voiceId: "onyx",
      seatIndex: 0,
      color: new THREE.Color(0x2244aa),
      accentColor: new THREE.Color(0x4488ff),
    },
    {
      id: "agent-analyst",
      name: "Dr. Sarah Mitchell",
      role: "analyst",
      gender: "female",
      voiceId: "nova",
      seatIndex: 1,
      color: new THREE.Color(0x6622aa),
      accentColor: new THREE.Color(0xaa66ff),
    },
    {
      id: "agent-expert",
      name: "Prof. Alex Rivera",
      role: "expert",
      gender: "neutral",
      voiceId: "echo",
      seatIndex: 2,
      color: new THREE.Color(0x226644),
      accentColor: new THREE.Color(0x44cc88),
    },
  ];
}
