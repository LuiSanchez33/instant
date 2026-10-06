import * as THREE from "three";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const playerBar = document.getElementById("playerBar");
const botBar = document.getElementById("botBar");
const playerHpEl = document.getElementById("playerHp");
const botHpEl = document.getElementById("botHp");
const flashEl = document.getElementById("flash");
const crosshair = document.getElementById("crosshair");
const roundChip = document.getElementById("roundChip");

const ARENA = 36;
const HALF = ARENA / 2;
const PLAYER_RADIUS = 0.55;
const BOT_RADIUS = 0.6;
const MOVE_SPEED = 9;
const TURN_SPEED = 2.4;
const PLAYER_COOLDOWN = 0.2;
const BOT_COOLDOWN = 1.05;
const SHOT_SPEED = 38;
const SHOT_DAMAGE = 11;
const MAX_HP = 100;

const keys = new Set();
const bullets = [];
const colliders = [];

let playing = false;
let ended = false;
let last = performance.now();
let hitTimer = 0;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.Fog(0x05070b, 42, 78);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.08,
  120
);

const player = {
  pos: new THREE.Vector3(5.5, 1.55, 11),
  yaw: 0.32,
  hp: MAX_HP,
  cooldown: 0,
  spawnGuard: 0,
};

const bot = {
  group: new THREE.Group(),
  pos: new THREE.Vector3(-5.5, 0, -11),
  yaw: 0,
  hp: MAX_HP,
  cooldown: 1.6,
  strafe: 1,
  strafeTimer: 0,
};

function addLight() {
  const hemi = new THREE.HemisphereLight(0x7ad7ff, 0x1a1020, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xd8f6ff, 1.15);
  key.position.set(8, 18, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  scene.add(key);

  const rim = new THREE.PointLight(0xff3d7a, 18, 28, 1.6);
  rim.position.set(-10, 4, -10);
  scene.add(rim);

  const cyan = new THREE.PointLight(0x3cf0ff, 16, 26, 1.6);
  cyan.position.set(10, 3.4, 10);
  scene.add(cyan);
}

function makeMat(color, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0.35,
  });
}

function addBox(w, h, d, x, y, z, mat, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) {
    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  return mesh;
}

function buildArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA, ARENA),
    new THREE.MeshStandardMaterial({
      color: 0x10151c,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(ARENA, 18, 0x1c3a48, 0x142028);
  grid.position.y = 0.02;
  scene.add(grid);

  const wallMat = makeMat(0x151b24, 0x0a2030, 0.15);
  const trim = makeMat(0x0c1016, 0x3cf0ff, 0.55);
  const wallH = 6;
  addBox(ARENA, wallH, 1.1, 0, wallH / 2, -HALF, wallMat);
  addBox(ARENA, wallH, 1.1, 0, wallH / 2, HALF, wallMat);
  addBox(1.1, wallH, ARENA, -HALF, wallH / 2, 0, wallMat);
  addBox(1.1, wallH, ARENA, HALF, wallH / 2, 0, wallMat);

  addBox(ARENA, 0.12, 0.18, 0, 0.08, -HALF + 0.45, trim, false);
  addBox(ARENA, 0.12, 0.18, 0, 0.08, HALF - 0.45, trim, false);

  const pillar = makeMat(0x1a222c, 0xff3d7a, 0.25);
  const spots = [
    [-9, -7],
    [9, -7],
    [-9, 7],
    [9, 7],
  ];
  for (const [x, z] of spots) {
    addBox(2.2, 3.4, 2.2, x, 1.7, z, pillar);
    addBox(2.4, 0.16, 2.4, x, 3.48, z, trim, false);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(6.4, 6.7, 48),
    new THREE.MeshBasicMaterial({
      color: 0x3cf0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  scene.add(ring);
}

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBot() {
  const armor = makeMat(0x1a0c12, 0xff2a4a, 0.35);
  const plate = makeMat(0x2c1218, 0xff3d7a, 0.55);
  const dark = makeMat(0x0b0d12, 0x3cf0ff, 0.08);
  const trim = makeMat(0x3a1820, 0xff5a7a, 0.8);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xff1038,
    emissive: 0xff2248,
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metalness: 0.7,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffcc66,
    emissive: 0xff3d1a,
    emissiveIntensity: 1.8,
    roughness: 0.25,
    metalness: 0.4,
  });

  const hips = part(new THREE.BoxGeometry(0.52, 0.22, 0.32), plate, 0, 0.92, 0);
  const chest = part(new THREE.BoxGeometry(0.62, 0.48, 0.38), armor, 0, 1.32, 0.02);
  const abs = part(new THREE.BoxGeometry(0.46, 0.22, 0.3), plate, 0, 1.04, 0.01);
  const collar = part(new THREE.BoxGeometry(0.5, 0.12, 0.34), trim, 0, 1.58, 0.02);
  const core = part(new THREE.SphereGeometry(0.09, 12, 10), coreMat, 0, 1.34, 0.2);
  const chestV = part(new THREE.BoxGeometry(0.08, 0.28, 0.04), visorMat, 0, 1.36, 0.22);

  const lShoulder = part(new THREE.BoxGeometry(0.28, 0.18, 0.34), plate, -0.42, 1.52, 0);
  const rShoulder = part(new THREE.BoxGeometry(0.28, 0.18, 0.34), plate, 0.42, 1.52, 0);
  const lSpike = part(new THREE.ConeGeometry(0.08, 0.28, 6), trim, -0.5, 1.68, 0, 0, 0, 0.35);
  const rSpike = part(new THREE.ConeGeometry(0.08, 0.28, 6), trim, 0.5, 1.68, 0, 0, 0, -0.35);

  const helmet = part(new THREE.BoxGeometry(0.38, 0.32, 0.4), armor, 0, 1.82, 0.02);
  const helmRidge = part(new THREE.BoxGeometry(0.08, 0.16, 0.44), trim, 0, 1.98, 0.02);
  const hornL = part(new THREE.ConeGeometry(0.055, 0.28, 7), dark, -0.16, 2.08, -0.02, 0.4, 0, 0.55);
  const hornR = part(new THREE.ConeGeometry(0.055, 0.28, 7), dark, 0.16, 2.08, -0.02, 0.4, 0, -0.55);
  const visor = part(new THREE.BoxGeometry(0.34, 0.09, 0.08), visorMat, 0, 1.8, 0.2);
  const jaw = part(new THREE.BoxGeometry(0.28, 0.1, 0.22), dark, 0, 1.66, 0.08);
  const mouth = part(new THREE.BoxGeometry(0.16, 0.03, 0.04), visorMat, 0, 1.64, 0.2);

  const pack = part(new THREE.BoxGeometry(0.36, 0.4, 0.18), dark, 0, 1.34, -0.24);
  const tank = part(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 10), trim, 0.14, 1.38, -0.32);
  const antenna = part(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), dark, -0.12, 1.68, -0.28);
  const antennaTip = part(new THREE.SphereGeometry(0.04, 8, 8), visorMat, -0.12, 1.9, -0.28);

  bot.leftLeg = new THREE.Group();
  bot.leftLeg.position.set(-0.16, 0.82, 0);
  bot.leftLeg.add(
    part(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, 0, -0.22, 0),
    part(new THREE.BoxGeometry(0.16, 0.38, 0.18), dark, 0, -0.58, 0.02),
    part(new THREE.BoxGeometry(0.2, 0.1, 0.3), plate, 0, -0.78, 0.06)
  );

  bot.rightLeg = new THREE.Group();
  bot.rightLeg.position.set(0.16, 0.82, 0);
  bot.rightLeg.add(
    part(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, 0, -0.22, 0),
    part(new THREE.BoxGeometry(0.16, 0.38, 0.18), dark, 0, -0.58, 0.02),
    part(new THREE.BoxGeometry(0.2, 0.1, 0.3), plate, 0, -0.78, 0.06)
  );

  bot.leftArm = new THREE.Group();
  bot.leftArm.position.set(-0.48, 1.42, 0);
  bot.leftArm.add(
    part(new THREE.BoxGeometry(0.16, 0.38, 0.16), armor, 0, -0.22, 0.02),
    part(new THREE.BoxGeometry(0.14, 0.32, 0.14), dark, 0, -0.52, 0.04),
    part(new THREE.BoxGeometry(0.16, 0.12, 0.16), plate, 0, -0.7, 0.04)
  );

  bot.rightArm = new THREE.Group();
  bot.rightArm.position.set(0.48, 1.4, 0.04);
  const rifle = new THREE.Group();
  rifle.position.set(0.02, -0.55, 0.28);
  rifle.add(
    part(new THREE.BoxGeometry(0.1, 0.12, 0.42), dark, 0, 0, 0),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.38), trim, 0, 0.02, 0.32),
    part(new THREE.BoxGeometry(0.12, 0.16, 0.08), plate, 0, -0.08, -0.08),
    part(new THREE.BoxGeometry(0.05, 0.05, 0.1), visorMat, 0, 0.02, 0.54)
  );
  bot.muzzle = new THREE.PointLight(0xff3d7a, 0, 4, 2);
  bot.muzzle.position.set(0.02, -0.53, 0.86);
  bot.rightArm.add(
    part(new THREE.BoxGeometry(0.16, 0.36, 0.16), armor, 0, -0.2, 0),
    part(new THREE.BoxGeometry(0.14, 0.28, 0.14), dark, 0, -0.48, 0.08),
    rifle,
    bot.muzzle
  );
  bot.rightArm.rotation.x = 1.15;

  const glow = new THREE.PointLight(0xff3d7a, 5.2, 9, 2);
  glow.position.set(0, 1.55, 0.2);

  bot.group.add(
    hips,
    chest,
    abs,
    collar,
    core,
    chestV,
    lShoulder,
    rShoulder,
    lSpike,
    rSpike,
    helmet,
    helmRidge,
    hornL,
    hornR,
    visor,
    jaw,
    mouth,
    pack,
    tank,
    antenna,
    antennaTip,
    bot.leftLeg,
    bot.rightLeg,
    bot.leftArm,
    bot.rightArm,
    glow
  );
  bot.walk = 0;
  bot.group.position.copy(bot.pos);
  scene.add(bot.group);
}

function buildWeapon() {
  const gun = new THREE.Group();
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.14, 0.42),
    makeMat(0x15191f, 0x3cf0ff, 0.2)
  );
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.55),
    makeMat(0x1c242c, 0x3cf0ff, 0.6)
  );
  barrel.position.set(0.02, 0.04, -0.38);
  stock.position.set(0.05, -0.02, 0);
  gun.add(stock, barrel);
  gun.position.set(0.28, -0.22, -0.45);
  camera.add(gun);
  scene.add(camera);
}

function hitsCollider(x, z, radius) {
  if (Math.abs(x) > HALF - 0.7 - radius) return true;
  if (Math.abs(z) > HALF - 0.7 - radius) return true;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function tryMove(entity, dx, dz, radius) {
  const nx = entity.pos.x + dx;
  const nz = entity.pos.z + dz;
  if (!hitsCollider(nx, entity.pos.z, radius)) entity.pos.x = nx;
  if (!hitsCollider(entity.pos.x, nz, radius)) entity.pos.z = nz;
}

function spawnBullet(origin, dir, fromPlayer) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshBasicMaterial({ color: fromPlayer ? 0x3cf0ff : 0xff3d7a })
  );
  mesh.position.copy(origin);
  scene.add(mesh);
  const vel = dir.clone().normalize().multiplyScalar(SHOT_SPEED);
  bullets.push({ mesh, vel, fromPlayer, life: 1.4 });
}

function firePlayer() {
  if (player.cooldown > 0 || !playing) return;
  player.cooldown = PLAYER_COOLDOWN;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const origin = camera.position.clone().add(dir.clone().multiplyScalar(0.7));
  origin.y -= 0.08;
  spawnBullet(origin, dir, true);

  const aim = dir.clone().normalize();
  const target = new THREE.Vector3(bot.pos.x, 1.35, bot.pos.z);
  const toBot = target.clone().sub(origin);
  const t = toBot.dot(aim);
  if (t > 0.4 && t < 40) {
    const closest = origin.clone().addScaledVector(aim, t);
    if (closest.distanceTo(target) < 0.95 && losFrom(origin.x, origin.z, bot.pos.x, bot.pos.z)) {
      damageBot(SHOT_DAMAGE);
    }
  }
}

function losFrom(x0, z0, x1, z1) {
  const steps = 18;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(x0, x1, t);
    const z = THREE.MathUtils.lerp(z0, z1, t);
    if (hitsCollider(x, z, 0.12)) return false;
  }
  return true;
}

function fireBot() {
  if (bot.cooldown > 0 || !playing) return;
  bot.cooldown = BOT_COOLDOWN;
  const origin = bot.pos.clone();
  origin.y = 1.35;
  const target = player.pos.clone();
  target.y = 1.4;
  const dir = target.sub(origin);
  dir.x += (Math.random() - 0.5) * 0.42;
  dir.y += (Math.random() - 0.5) * 0.14;
  dir.z += (Math.random() - 0.5) * 0.42;
  spawnBullet(origin, dir, false);
}

function losClear() {
  return losFrom(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z);
}

function updateBot(dt) {
  if (!playing) return;
  const toPlayer = new THREE.Vector2(
    player.pos.x - bot.pos.x,
    player.pos.z - bot.pos.z
  );
  const dist = toPlayer.length();
  bot.yaw = Math.atan2(toPlayer.x, toPlayer.y);

  bot.strafeTimer -= dt;
  if (bot.strafeTimer <= 0) {
    bot.strafe *= -1;
    bot.strafeTimer = 0.7 + Math.random() * 0.9;
  }

  const forward = toPlayer.clone().normalize();
  const side = new THREE.Vector2(-forward.y, forward.x).multiplyScalar(bot.strafe);
  let mx = 0;
  let mz = 0;
  if (dist > 9) {
    mx = forward.x * 5.4;
    mz = forward.y * 5.4;
  } else if (dist < 5.5) {
    mx = -forward.x * 4.2;
    mz = -forward.y * 4.2;
  }
  mx += side.x * 4.6;
  mz += side.y * 4.6;
  tryMove(bot, mx * dt, mz * dt, BOT_RADIUS);
  bot.group.position.set(bot.pos.x, 0, bot.pos.z);
  bot.group.rotation.y = bot.yaw;

  if (dist < 22 && losClear()) fireBot();
}

function updatePlayer(dt) {
  if (!playing) return;
  if (keys.has("ArrowLeft")) player.yaw += TURN_SPEED * dt;
  if (keys.has("ArrowRight")) player.yaw -= TURN_SPEED * dt;

  const forward = (keys.has("ArrowUp") ? 1 : 0) + (keys.has("ArrowDown") ? -1 : 0);
  if (forward) {
    const dx = -Math.sin(player.yaw) * forward * MOVE_SPEED * dt;
    const dz = -Math.cos(player.yaw) * forward * MOVE_SPEED * dt;
    tryMove(player, dx, dz, PLAYER_RADIUS);
  }

  camera.position.copy(player.pos);
  camera.rotation.set(0, player.yaw, 0);

  if (keys.has(" ") || keys.has("Space")) firePlayer();
}

function damagePlayer(amount) {
  if (player.spawnGuard > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 90);
  updateHud();
  if (player.hp <= 0) endGame(false);
}

function damageBot(amount) {
  bot.hp = Math.max(0, bot.hp - amount);
  hitTimer = 0.12;
  updateHud();
  if (bot.hp <= 0) endGame(true);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    const p = b.mesh.position;
    if (b.life <= 0 || hitsCollider(p.x, p.z, 0.08) || Math.abs(p.y) > 8) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }
    if (b.fromPlayer) {
      continue;
    } else {
      const dx = p.x - player.pos.x;
      const dz = p.z - player.pos.z;
      const dy = p.y - player.pos.y;
      if (dx * dx + dz * dz < 0.5 * 0.5 && Math.abs(dy) < 0.7) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        damagePlayer(SHOT_DAMAGE);
      }
    }
  }
}

function updateHud() {
  playerBar.style.transform = `scaleX(${player.hp / MAX_HP})`;
  botBar.style.transform = `scaleX(${bot.hp / MAX_HP})`;
  playerHpEl.textContent = String(Math.ceil(player.hp));
  botHpEl.textContent = String(Math.ceil(bot.hp));
}

function endGame(won) {
  playing = false;
  ended = true;
  roundChip.textContent = won ? "VICTORY" : "DEFEATED";
  overlay.classList.remove("hidden");
  overlay.querySelector(".kicker").textContent = won ? "MATCH COMPLETE" : "MATCH OVER";
  overlay.querySelector("h1").textContent = won ? "YOU WIN" : "RIVAL WINS";
  overlay.querySelector(".lead").textContent = won
    ? "The rival is down. The arena is yours."
    : "The computer rival outgunned you. Drop back in and try a wider strafe.";
  startBtn.textContent = "FIGHT AGAIN";
}

function resetMatch() {
  player.pos.set(5.5, 1.55, 11);
  player.yaw = 0.32;
  player.hp = MAX_HP;
  player.cooldown = 0;
  player.spawnGuard = 1.25;
  bot.pos.set(-5.5, 0, -11);
  bot.hp = MAX_HP;
  bot.cooldown = 1.6;
  bot.strafe = 1;
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
  ended = false;
  playing = true;
  roundChip.textContent = "1v1 · LIVE";
  overlay.classList.add("hidden");
  updateHud();
  camera.position.copy(player.pos);
  camera.rotation.set(0, player.yaw, 0);
}

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.spawnGuard = Math.max(0, player.spawnGuard - dt);
  bot.cooldown = Math.max(0, bot.cooldown - dt);
  hitTimer = Math.max(0, hitTimer - dt);
  crosshair.classList.toggle("hit", hitTimer > 0);
  updatePlayer(dt);
  updateBot(dt);
  updateBullets(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
    keys.add(e.key);
  }
  if (e.code === "Space") keys.add(" ");
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
  if (e.code === "Space") keys.delete(" ");
});

window.addEventListener("resize", onResize);
startBtn.addEventListener("click", () => resetMatch());

addLight();
buildArena();
buildBot();
buildWeapon();
camera.position.copy(player.pos);
camera.rotation.set(0, player.yaw, 0);
updateHud();
requestAnimationFrame(tick);
