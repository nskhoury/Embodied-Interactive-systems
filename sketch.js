let bodyPose;
let handPose;
let video;
let poses = [];
let hands = [];
let connections;
let particles = [];
let particleColor = [180, 220, 255];
const SHOULDER_RADIUS = 100;
const COLOR_LERP = 0.02;
let lastBodyTime = 0;
let lastFingerTime = 0;
let idleMode = false;
let startTime = 0;
let phase = 0;
let exploded = false;
let prevBodyPoints = [];
let wasPinching = [];
let paletteIndex = 0;

const PALETTE = [
  [255, 133, 82],   // Orange/Blue
  [147, 229, 171],  // Green/Black
  [255, 46, 204],   // Pink/green
  [224, 255, 79],   // Green/blue
  [255, 239, 159],  // Yellow/Brown
  [235, 69, 17],    // Red/Blue
  [250, 188, 42],   // Yellow/blue
  [251, 54, 64],    // Red/green
  [220, 106, 207],  // Purple/green
  [94, 43, 255],    // Indigo
  [6, 214, 160],    // ELmerald color
  [4, 231, 98],     // Green/Orange
  [255, 252, 249],   //White
  [188, 108, 37],  //copper
];
let currentColor = [255, 252, 249];
// // let currentColor = [94, 43, 255];

// const PALETTE = [
//   [121, 113, 84],       // green
//   [222, 202, 184],      // white
//   [188, 35, 40],        // red
//   [124, 51, 58],        // maroon
//   // [35, 31, 32],      // black 
//   [255, 252, 249],     //White 02
//  // [220, 106, 207],  // Purple/green
//   [147, 229, 171],  // Green/Black
// ];

// let currentColor = [121, 113, 84];


function preload() {
  bodyPose = ml5.bodyPose("MoveNet", { flipped: true, modelType: "MULTIPOSE_LIGHTNING" });
  handPose  = ml5.handPose({ flipped: true });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  bodyPose.detectStart(video, gotPoses);
  handPose.detectStart(video, gotHands);
  connections = bodyPose.getSkeleton();
  resetParticles();
  lastFingerTime = millis();
  lastBodyTime = millis();
  startTime = millis();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resetParticles();
}

function gotPoses(results) { poses = results; }
function gotHands(results) { hands = results; }

function kpVal(hand, index, axis) {
  try {
    let kp = hand.keypoints[index];
    if (!kp) return null;
    let v = kp[axis];
    return (typeof v === 'number' && !isNaN(v)) ? v : null;
  } catch(e) { return null; }
}

function kpX(hand, index) {
  let v = kpVal(hand, index, 'x');
  return v !== null ? map(v, 0, 640, 0, width) : null;
}

function kpY(hand, index) {
  let v = kpVal(hand, index, 'y');
  return v !== null ? map(v, 0, 480, 0, height) : null;
}

function handIsValid(hand) {
  if (!hand || !hand.keypoints || hand.keypoints.length < 21) return false;
  for (let i = 0; i < 21; i++) {
    if (kpVal(hand, i, 'x') === null) return false;
    if (kpVal(hand, i, 'y') === null) return false;
  }
  return true;
}

function resetParticles() {
  particles = [];
  let cols = floor(width / 18) + 1;
  let rows = floor(height / 18) + 1;
  let spacingX = width / (cols - 1);
  let spacingY = height / (rows - 1);

  // grid A — always created
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let p = makeParticle(
        i * spacingX + spacingX / 2,
        j * spacingY + spacingY / 2
      );
      p.gridGroup = 'A';
      particles.push(p);
    }
  }

  // grid B — only created for phase 2
  if (phase === 2) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        let px = i * spacingX + spacingX / 2;
        let py = j * spacingY + spacingY / 2;
        let p = makeParticle(
          px < width / 2 ? px + width : px - width,
          py
        );
        p.homeX = px < width / 2 ? px + width : px - width;
        p.homeY = py;
        p.gridGroup = 'B';
        particles.push(p);
      }
    }
  }
}

function sampleShoulderColor() {
  if (poses.length === 0) return;
  let shoulders = [];
  for (let p of poses) {
    for (let idx of [5, 6]) {
      let kp = p.keypoints[idx];
      if (kp && kp.confidence >= 0.1) shoulders.push(kp);
    }
  }
  if (shoulders.length === 0) return;
  loadPixels();
  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  let step = 4;
  for (let s of shoulders) {
    let cx = round(map(s.x, 0, 640, width, 0));
    let cy = round(map(s.y, 0, 480, 0, height));
    for (let dx = -SHOULDER_RADIUS; dx <= SHOULDER_RADIUS; dx += step) {
      for (let dy = -SHOULDER_RADIUS; dy <= SHOULDER_RADIUS; dy += step) {
        if (dx * dx + dy * dy > SHOULDER_RADIUS * SHOULDER_RADIUS) continue;
        let px = cx + dx;
        let py = cy + dy;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        let i = (py * width + px) * 4;
        totalR += pixels[i];
        totalG += pixels[i + 1];
        totalB += pixels[i + 2];
        count++;
      }
    }
  }
  if (count > 0) {
    let brightness = (totalR + totalG + totalB) / (count * 3);
    if (brightness > 30) {
      particleColor[0] = lerp(particleColor[0], totalR / count, COLOR_LERP);
      particleColor[1] = lerp(particleColor[1], totalG / count, COLOR_LERP);
      particleColor[2] = lerp(particleColor[2], totalB / count, COLOR_LERP);
    }
  }
}

function keyPressed() {
  if (key === 'f' || key === 'F') {
    let fs = fullscreen();
    fullscreen(!fs);
  }

  let phase0Duration = 60000;
  let phase1Duration = 60000;
  let phase2Duration = 60000;
  let phase3Duration = 60000;
  let phaseDurations = [phase0Duration, phase1Duration, phase2Duration, phase3Duration];

  if (keyCode === RIGHT_ARROW) {
    let nextPhase = (phase + 1) % 4;
    // set startTime so elapsed puts us at the start of nextPhase
    let offset = 0;
    for (let i = 0; i < nextPhase; i++) offset += phaseDurations[i];
    startTime = millis() - offset;
    exploded = false;
    particleColor = [180, 220, 255];
    resetParticles();
  }
  if (keyCode === LEFT_ARROW) {
    let prevPhase = (phase + 3) % 4;
    let offset = 0;
    for (let i = 0; i < prevPhase; i++) offset += phaseDurations[i];
    startTime = millis() - offset;
    exploded = false;
    particleColor = [180, 220, 255];
    resetParticles();
  }
}

function draw() {
  push();
  translate(width, 0);
  scale(-1, 1);
  //tint(141, 219, 224); // Pearl aqua
  //tint(125, 223, 100); // RadioActive Grass
  //tint(164, 153, 190); // Lilac Ash
  //tint(22, 125, 243);  // Azure Blue
  //tint(39, 137, 144);  // Dark Cyan
  //tint(193, 204, 153); // Dry sage
  //tint(147, 229, 171); // Celadon
  image(video, 0, 0, width, height, 0, 0, video.width, video.height, COVER);
  pop();
  sampleShoulderColor();
  let bodyPoints = [];
  for (let pose of poses) {
    for (let kp of pose.keypoints) {
      if (kp.confidence >= 0.1) {
        bodyPoints.push({
          x: map(kp.x, 0, 640, 0, width),
          y: map(kp.y, 0, 480, 0, height)
        });
      }
    }
  }
  if (bodyPoints.length > 0) lastBodyTime = millis();
  let bodySpeed = 0;
  if (prevBodyPoints.length > 0 && bodyPoints.length > 0) {
    for (let i = 0; i < min(bodyPoints.length, prevBodyPoints.length); i++) {
      bodySpeed += dist(bodyPoints[i].x, bodyPoints[i].y, prevBodyPoints[i].x, prevBodyPoints[i].y);
    }
    bodySpeed /= bodyPoints.length;
  }
  prevBodyPoints = bodyPoints.slice();
  let activeFingers = [];
  let scoopHands   = [];
  let closedHands  = [];
  let grabHands    = [];
  let dropHands    = [];
  let pinchBrushes = [];
  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];
    if (!handIsValid(hand)) continue;
    if (checkOneFinger(hand)) {
      activeFingers.push({ x: kpX(hand, 8), y: kpY(hand, 8) });
    }
    if (checkOpenHand(hand)) {
      scoopHands.push({ x: kpX(hand, 9), y: kpY(hand, 9) });
    }
    if (checkFist(hand)) {
      closedHands.push({ x: kpX(hand, 9), y: kpY(hand, 9) });
    }
    if (!wasPinching[i]) wasPinching[i] = false;
    let isPinching = checkPinch(hand);
    if (isPinching && !wasPinching[i] && phase === 3) {
      currentColor = PALETTE[paletteIndex % PALETTE.length];
      paletteIndex++;
    }
    if (isPinching) {
      wasPinching[i] = true;
      grabHands.push({ x: kpX(hand, 8), y: kpY(hand, 8) });
    }
    if (!isPinching && wasPinching[i]) {
      wasPinching[i] = false;
      dropHands.push({ x: kpX(hand, 8), y: kpY(hand, 8) });
    }
    if (!isPinching) wasPinching[i] = false;
    if (phase === 3) {
      let tx = kpX(hand, 4);
      let ty = kpY(hand, 4);
      let fx = kpX(hand, 8);
      let fy = kpY(hand, 8);
      if (tx !== null && ty !== null && fx !== null && fy !== null) {
        let pinchDist = dist(tx, ty, fx, fy);
        let centerX = (tx + fx) / 2;
        let centerY = (ty + fy) / 2;
        pinchBrushes.push({ cx: centerX, cy: centerY, pinchDist: pinchDist });
      }
    }
  }
  let oneFinger = activeFingers.length > 0;
  if (oneFinger) {
    lastFingerTime = millis();
    idleMode = false;
  }
  if (millis() - lastBodyTime > 15000) {
    idleMode = false;
    lastFingerTime = millis();
  } else if (millis() - lastFingerTime > 25000 && phase === 0) {
    idleMode = true;
  }


//   this is for 1 minute per phase for the final
  
  let phase0Duration = 60000;
  let phase1Duration = 60000;
  let phase2Duration = 60000;
  let phase3Duration = 60000;
  let totalCycle = phase0Duration + phase1Duration + phase2Duration + phase3Duration;

  let elapsed = (millis() - startTime) % totalCycle;
  let newPhase;
  if (elapsed < phase0Duration) {
    newPhase = 0;
  } else if (elapsed < phase0Duration + phase1Duration) {
    newPhase = 1;
  } else if (elapsed < phase0Duration + phase1Duration + phase2Duration) {
    newPhase = 2;
  } else {
    newPhase = 3;
  }

  if (newPhase !== phase) {
    phase = newPhase;
    exploded = false;
    idleMode = false;
    particleColor = [180, 220, 255];
    resetParticles();
  }
  
//   // Didnt work
//   if (phase === 2 && !phase2GridReady) {
//     let allOff = true;
//     for (let p of particles) {
//       if (p.x > -20 && p.x < width + 20) { allOff = false; break; }
//     }
//     if (allOff) {
//       phase2GridReady = true;
//       resetParticles();
//     }
//   }


  if (phase === 1 && !exploded) {
    exploded = true;
    for (let p of particles) {
      let dx = p.x - width / 2;
      let dy = p.y - height / 2;
      let d = sqrt(dx * dx + dy * dy) + 1;
      let force = random(6, 16);
      p.vx = (dx / d) * force;
      p.vy = (dy / d) * force;
      p.landed = false;
      p.scooped = false;
    }
  }

  // Spawn drawing particles at fingertip during phase 1
  if (phase === 1 && activeFingers.length > 0 && frameCount % 3 === 0) {
    for (let f of activeFingers) {
      let p = makeParticle(f.x, f.y);
      p.landed = true;
      p.vx = 0;
      p.vy = 0;
      particles.push(p);
    }
  }

  // phase 3 — apply pinch sizing to nearby particles
  if (phase === 3) {
    for (let brush of pinchBrushes) {
      let brushR  = width * 0.14;
      let newSize = map(brush.pinchDist, 10, 300, width * 0.001, width * 0.025);
      newSize = constrain(newSize, width * 0.001, width * 0.025);
      for (let p of particles) {
        let d = dist(p.x, p.y, brush.cx, brush.cy);
        if (d < brushR) {
          p.size = lerp(p.size, newSize, 0.1);
        } else {
          p.size = lerp(p.size, p.originalSize, 0.05);
        }
      }
    }
  }

  let repelR = width * 0.125;
  let grabR   = width * 0.1;

  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    if (p.active === false) {
      particles.splice(i, 1);
      continue;
    }
    if (phase === 1) {
      for (let g of grabHands) {
        if (g.x === null || g.y === null) continue;
        let d = dist(p.x, p.y, g.x, g.y);
        if (d < grabR) p.grabbed = true;
      }
      if (p.grabbed && dropHands.length > 0) {
        p.grabbed = false;
        p.landed = true;
        p.vx = 0;
        p.vy = 0;
      }
      if (p.grabbed && grabHands.length > 0) {
        let nearest = grabHands[0];
        let nearestD = Infinity;
        for (let g of grabHands) {
          if (g.x === null || g.y === null) continue;
          let d = dist(p.x, p.y, g.x, g.y);
          if (d < nearestD) { nearestD = d; nearest = g; }
        }
        if (nearest.x !== null && nearest.y !== null) {
          p.vx += (nearest.x - p.x) * 0.15;
          p.vy += (nearest.y - p.y) * 0.15;
          p.vx *= 0.8;
          p.vy *= 0.8;
        }
      } else if (!p.landed) {
        p.vy += 0.3;
        p.vx *= 0.99;
        if (p.y > height + 20 || p.x < -20 || p.x > width + 20) {
          p.active = false;
        }
      }
    } else if (phase === 2) {
      let speed = 1.5;
      p.vx = p.gridGroup === 'B'
        ? (p.homeX > width || p.homeX < 0
            ? (p.homeX > width ? -speed : speed)
            : (p.homeX < width / 2 ? speed : -speed))
        : (p.homeX < width / 2 ? speed : -speed);
      p.vy *= 0.95;
      if (bodySpeed > 5) {
        for (let kp of bodyPoints) {
          let dx = p.x - kp.x;
          let dy = p.y - kp.y;
          let d = sqrt(dx * dx + dy * dy);
          let shockR = width * 0.2;
          if (d < shockR && d > 0) {
            let force = map(bodySpeed, 5, 30, 0, 3) * map(d, 0, shockR, 2, 0);
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
      }
      if (p.x > width + 9) {
        p.x -= width + 18;
        p.y = p.homeY;
        p.vy = 0;
      }
      if (p.x < -9) {
        p.x += width + 18;
        p.y = p.homeY;
        p.vy = 0;
      }
    } else if (phase === 3) {
      p.landed = false;
      p.scooped = false;
      p.vx += (p.homeX - p.x) * 0.03;
      p.vy += (p.homeY - p.y) * 0.03;
    } else if (idleMode) {
      p.landed = false;
      p.scooped = false;
      let angle = (i / particles.length) * TWO_PI + frameCount * 0.008;
      let radius = map(sin(i * 0.8 + frameCount * 0.005), -1, 1, width * 0.1, width * 0.2);
      let targetX = width / 2 + cos(angle) * radius;
      let targetY = height / 2 + sin(angle) * radius;
      let n = noise(p.x * 0.005, p.y * 0.005, frameCount * 0.003);
      let wanderAngle = n * TWO_PI * 2;
      p.vx += cos(wanderAngle) * 0.6;
      p.vy += sin(wanderAngle) * 0.6;
      p.vx += (targetX - p.x) * 0.01;
      p.vy += (targetY - p.y) * 0.01;
    } else {
      p.landed = false;
      p.scooped = false;
      if (p.isFeeder) {
        p.vx += (width / 2 - p.x) * 0.001;
        p.vy += (height / 2 - p.y) * 0.001;
        if (p.x > -10 && p.x < width + 10 && p.y > -10 && p.y < height + 10) {
          p.isFeeder = false;
          p.homeX = round(p.x / 18) * 18;
          p.homeY = round(p.y / 18) * 18;
        }
      }
      for (let f of activeFingers) {
        if (f.x === null || f.y === null) continue;
        let dx = f.x - p.x;
        let dy = f.y - p.y;
        let d = sqrt(dx * dx + dy * dy);
        if (d > 0) {
          p.vx += (dx / d) * 0.8;
          p.vy += (dy / d) * 0.8;
        }
      }
      if (!oneFinger) {
        p.vx += (p.homeX - p.x) * 0.03;
        p.vy += (p.homeY - p.y) * 0.03;
      }
    }
    if (phase === 0) {
      for (let kp of bodyPoints) {
        let dx = p.x - kp.x;
        let dy = p.y - kp.y;
        let dSq = dx * dx + dy * dy;
        if (dSq < repelR * repelR && dSq > 0) {
          let d = sqrt(dSq);
          let force = (repelR - d) / repelR;
          p.vx += (dx / d) * force * 3;
          p.vy += (dy / d) * force * 3;
        }
      }
    }
    if (!p.landed && !p.scooped && !p.grabbed) {
      let speedSq = p.vx * p.vx + p.vy * p.vy;
      if (speedSq > 25) {
        let speed = sqrt(speedSq);
        p.vx = (p.vx / speed) * 5;
        p.vy = (p.vy / speed) * 5;
      }
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
    noStroke();
    drawingContext.globalCompositeOperation = 'difference';
    fill(currentColor[0], currentColor[1], currentColor[2], 255);
    circle(p.x, p.y, p.size);
    drawingContext.globalCompositeOperation = 'source-over';
  }
}

function makeParticle(x, y) {
  // let s = random(width * 0.005, width * 0.009);
  let s = random(constrain(width * 0.005, 4, 7), constrain(width * 0.009, 6, 9));
  return {
    x: x, y: y,
    homeX: x, homeY: y,
    vx: 0, vy: 0,
    size: s,
    originalSize: s,
    landed: false, scooped: false, grabbed: false, active: true,
    isFeeder: false,
    gridGroup: ''
  };
}

function checkOneFinger(hand) {
  let k = hand.keypoints;
  return k[8].y < k[6].y && k[12].y > k[10].y && k[16].y > k[14].y && k[20].y > k[18].y;
}

function checkOpenHand(hand) {
  let k = hand.keypoints;
  return k[8].y < k[6].y && k[12].y < k[10].y && k[16].y < k[14].y && k[20].y < k[18].y;
}

function checkFist(hand) {
  let k = hand.keypoints;
  return k[8].y > k[6].y && k[12].y > k[10].y && k[16].y > k[14].y && k[20].y > k[18].y;
}

function checkPinch(hand) {
  let k = hand.keypoints;
  let dx = k[4].x - k[8].x;
  let dy = k[4].y - k[8].y;
  return sqrt(dx * dx + dy * dy) < 40;
}