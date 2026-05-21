const BUILD_VERSION = '20260521';
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

const WORLD = {
  scale: 3,
  width: 0,
  height: 0,
};

const camera = { x: 0, y: 0 };

// LoL-style camera: hold space to smoothly lock onto the player
const cameraControl = {
  lockOnPlayer: false,
  followSmoothing: 11,
};

const mouse = { x: 0, y: 0, onCanvas: false };

const EDGE_PAN = {
  margin: 48,
  speed: 480,
};

const SPAWN = { x: 0, y: 0, radius: 55 };
const checkpoints = [];
let currentCheckpointIndex = 0;
let raceCompletePending = false;

const CHECKPOINT = {
  radius: 48,
  minDistFromSpawn: 220,
  minDistBetween: 280,
};

const MINIMAP = {
  width: 196,
  height: 132,
  margin: 14,
  padding: 8,
};

let square = {
  x: 0,
  y: 0,
  size: 50,
  speed: 200,
  color: '#ffffff',
};

function updateWorldSize() {
  WORLD.width = canvas.width * WORLD.scale;
  WORLD.height = canvas.height * WORLD.scale;
}

function clampCameraPosition(x, y) {
  const maxX = Math.max(0, WORLD.width - canvas.width);
  const maxY = Math.max(0, WORLD.height - canvas.height);
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

function clampCamera() {
  const clamped = clampCameraPosition(camera.x, camera.y);
  camera.x = clamped.x;
  camera.y = clamped.y;
}

function getCameraTargetForFocus(focusX, focusY) {
  return clampCameraPosition(focusX - canvas.width / 2, focusY - canvas.height / 2);
}

function centerCameraOn(x, y) {
  const target = getCameraTargetForFocus(x, y);
  camera.x = target.x;
  camera.y = target.y;
}

function updateCameraFollow(deltaTime) {
  if (!cameraControl.lockOnPlayer) return;

  const center = getSquareCenter();
  const target = getCameraTargetForFocus(center.x, center.y);
  const blend = 1 - Math.exp(-cameraControl.followSmoothing * deltaTime);

  camera.x += (target.x - camera.x) * blend;
  camera.y += (target.y - camera.y) * blend;
}

function getRenderCameraOffset() {
  return {
    x: Math.round(camera.x),
    y: Math.round(camera.y),
  };
}

function getMinimapLayout() {
  const panelWidth = MINIMAP.width;
  const panelHeight = MINIMAP.height;
  const innerWidth = panelWidth - MINIMAP.padding * 2;
  const innerHeight = panelHeight - MINIMAP.padding * 2;
  const scale = Math.min(innerWidth / WORLD.width, innerHeight / WORLD.height);
  const drawnWidth = WORLD.width * scale;
  const drawnHeight = WORLD.height * scale;
  const x = MINIMAP.margin;
  const y = canvas.height - MINIMAP.margin - panelHeight;

  return {
    x,
    y,
    width: panelWidth,
    height: panelHeight,
    scale,
    offsetX: x + MINIMAP.padding + (innerWidth - drawnWidth) / 2,
    offsetY: y + MINIMAP.padding + (innerHeight - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  };
}

function worldToMinimap(worldX, worldY, layout) {
  return {
    x: layout.offsetX + worldX * layout.scale,
    y: layout.offsetY + worldY * layout.scale,
  };
}

function drawMinimap() {
  const layout = getMinimapLayout();

  ctx.save();

  ctx.fillStyle = 'rgba(20, 20, 20, 0.95)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(layout.x, layout.y, layout.width, layout.height, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#101010';
  ctx.fillRect(layout.offsetX, layout.offsetY, layout.drawnWidth, layout.drawnHeight);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.offsetX, layout.offsetY, layout.drawnWidth, layout.drawnHeight);

  const spawnPoint = worldToMinimap(SPAWN.x, SPAWN.y, layout);
  ctx.beginPath();
  ctx.arc(spawnPoint.x, spawnPoint.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(120, 255, 180, 1)';
  ctx.fill();

  checkpoints.forEach((checkpoint, index) => {
    const point = worldToMinimap(checkpoint.x, checkpoint.y, layout);
    const isComplete = index < currentCheckpointIndex;
    const isActive = index === currentCheckpointIndex;

    ctx.beginPath();
    ctx.arc(point.x, point.y, isActive ? 4 : 3, 0, Math.PI * 2);
    if (isComplete) {
      ctx.fillStyle = 'rgba(120, 255, 180, 0.9)';
    } else if (isActive) {
      ctx.fillStyle = 'rgba(255, 220, 120, 1)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    }
    ctx.fill();
  });

  const viewX = layout.offsetX + camera.x * layout.scale;
  const viewY = layout.offsetY + camera.y * layout.scale;
  const viewW = canvas.width * layout.scale;
  const viewH = canvas.height * layout.scale;
  ctx.fillStyle = 'rgba(180, 210, 255, 0.08)';
  ctx.fillRect(viewX, viewY, viewW, viewH);
  ctx.strokeStyle = 'rgba(180, 210, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(viewX, viewY, viewW, viewH);

  const playerCenter = getSquareCenter();
  const playerPoint = worldToMinimap(playerCenter.x, playerCenter.y, layout);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(playerPoint.x - 2.5, playerPoint.y - 2.5, 5, 5);

  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('MAP', layout.x + 10, layout.y + 6);

  ctx.restore();
}

function beginWorldDraw() {
  const renderCamera = getRenderCameraOffset();
  ctx.save();
  ctx.translate(-renderCamera.x, -renderCamera.y);
}

function endWorldDraw() {
  ctx.restore();
}

function isCircleTooClose(x, y, minDist, points) {
  for (const point of points) {
    const dx = x - point.x;
    const dy = y - point.y;
    if (dx * dx + dy * dy < minDist * minDist) return true;
  }
  return false;
}

function generateCheckpoints() {
  checkpoints.length = 0;
  currentCheckpointIndex = 0;
  const count = 2 + Math.floor(Math.random() * 4);
  const padding = 120;
  const avoidPoints = [{ x: SPAWN.x, y: SPAWN.y }];

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = padding + Math.random() * (WORLD.width - padding * 2);
      const y = padding + Math.random() * (WORLD.height - padding * 2);
      if (isCircleTooClose(x, y, CHECKPOINT.minDistFromSpawn, avoidPoints)) continue;
      if (isCircleTooClose(x, y, CHECKPOINT.minDistBetween, checkpoints)) continue;
      checkpoints.push({ x, y, radius: CHECKPOINT.radius, index: i + 1 });
      avoidPoints.push({ x, y });
      placed = true;
      break;
    }
    if (!placed) break;
  }
}

function initWorldLayout() {
  SPAWN.x = WORLD.width * 0.14;
  SPAWN.y = WORLD.height * 0.5;
  generateCheckpoints();
  resetPlayerToSpawn();
}

function resetPlayerToSpawn() {
  square.x = SPAWN.x - square.size / 2;
  square.y = SPAWN.y - square.size / 2;
  currentCheckpointIndex = 0;
  centerCameraOn(SPAWN.x, SPAWN.y);
  updateCheckpointDisplay();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  updateWorldSize();
  square.x = Math.max(0, Math.min(square.x, WORLD.width - square.size));
  square.y = Math.max(0, Math.min(square.y, WORLD.height - square.size));
  clampCamera();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
  mouse.onCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
  mouse.onCanvas = false;
});

const player = {
  maxLives: 3,
  lives: 3,
  stunDuration: 1,
  stunRemaining: 0,
  regenDelay: 4,
  regenInterval: 1.5,
  regenProgress: 0,
  lastHitTime: 0,
};

const HEALTH_BAR = {
  height: 5,
  gap: 7,
  tickWidth: 1,
};

// Timer variables
let isPaused = false;
let elapsedTime = 0; // Time in seconds
let lastUpdateTime = null; // Tracks the last time the animation was updated

// FPS tracking variables
let fps = 60;
let frameCount = 0;
let lastFpsUpdate = performance.now();
const fpsUpdateInterval = 500; // Update FPS display every 500ms

// Array to store timestamps of key presses
let keyPressTimestamps = [];

// Array to store active pulses
const pulses = [];

// Particle physics (per-frame, frictionless — tuned for slingshot launches)
const physicsDefaults = {
  attractionStrength: 0.3,
  gravitySoftening: 1,
  spawnSpeedScale: 1,
  shatterThreshold: 15,
  bounceStrength: 1.3,
  squareSpeed: 200,
  squareHitLimit: 5,
};

const physics = { ...physicsDefaults };
const MAX_DELTA_TIME = 1 / 30;

function randomInitialVelocity() {
  return (Math.random() - 0.5) * physics.spawnSpeedScale;
}

// Particle class
class Particle {
  constructor(x, y, dx, dy, radius, color, colorKey) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.radius = radius;
    this.color = color;
    this.colorKey = colorKey;
    this.wasColliding = false;
    this.shouldDestroy = false;
    this.squareCollisionTimestamps = [];
  }

  draw() {
    ctx.save();

    const glowColor = this.color;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.shadowBlur = 50;
    ctx.shadowColor = glowColor.replace('1)', '0.7)');
    ctx.fillStyle = glowColor.replace('1)', '0.7)');
    ctx.fill();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius / 2, 0, Math.PI * 2);
    ctx.shadowBlur = 30;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = glowColor;
    ctx.fill();
    ctx.closePath();

    ctx.restore();
  }

  update(allParticles) {
    allParticles.forEach((other) => {
      if (other === this) return;

      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const force = physics.attractionStrength / (distance * distance + physics.gravitySoftening);

      this.dx += force * dx;
      this.dy += force * dy;
    });

    this.x += this.dx;
    this.y += this.dy;

    const velocityMagnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);

    if (this.x - this.radius < 0 || this.x + this.radius > WORLD.width) {
      if (velocityMagnitude > physics.shatterThreshold) {
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return;
      }
      this.dx = -this.dx;
      this.x = Math.min(Math.max(this.x, this.radius), WORLD.width - this.radius);
    }
    if (this.y - this.radius < 0 || this.y + this.radius > WORLD.height) {
      if (velocityMagnitude > physics.shatterThreshold) {
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return;
      }
      this.dy = -this.dy;
      this.y = Math.min(Math.max(this.y, this.radius), WORLD.height - this.radius);
    }

    // Collision with square (check and handle bounce)
    const collisionHandled = this.checkCollisionWithSquare();
    
    // If particle was destroyed, don't continue processing
    if (this.shouldDestroy) {
      return;
    }
    
    // If collision was handled, correct position to prevent overlap
    if (collisionHandled) {
      const closestX = Math.max(square.x, Math.min(this.x, square.x + square.size));
      const closestY = Math.max(square.y, Math.min(this.y, square.y + square.size));
      const dx = this.x - closestX;
      const dy = this.y - closestY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.radius) {
        // Push particle out
        const normalX = dx / distance || 0;
        const normalY = dy / distance || 0;
        const pushDistance = this.radius - distance + 0.5;
        this.x += normalX * pushDistance;
        this.y += normalY * pushDistance;
      }
    }

  }

  checkCollisionWithSquare() {
    // Calculate the closest point on the square to the particle
    const closestX = Math.max(square.x, Math.min(this.x, square.x + square.size));
    const closestY = Math.max(square.y, Math.min(this.y, square.y + square.size));

    // Calculate the distance between the particle and the closest point
    const dx = this.x - closestX;
    const dy = this.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check for collision
    const isColliding = distance < this.radius;
    
    // Only apply bounce physics on first collision (when transitioning from not colliding to colliding)
    if (isColliding && !this.wasColliding) {
      // New collision detected (particle just touched the square)
      const currentTime = performance.now();
      
      // Record collision timestamp
      this.squareCollisionTimestamps.push(currentTime);
      
      // Remove timestamps older than 1 second (1000ms)
      const oneSecondAgo = currentTime - 1000;
      this.squareCollisionTimestamps = this.squareCollisionTimestamps.filter(
        timestamp => timestamp >= oneSecondAgo
      );
      
      // Check if particle has collided more than 5 times in the last second
      if (this.squareCollisionTimestamps.length > physics.squareHitLimit) {
        // Destroy the particle with explosion
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return true; // Collision handled - particle destroyed
      }
      
      collisionCount++;
      updateCollisionCounter();
      createPulseEffect(this.x, this.y);
      damagePlayer();

      // Calculate collision normal (direction from square to particle)
      let normalX, normalY;
      
      // Determine which edge/corner was hit
      const squareLeft = square.x;
      const squareRight = square.x + square.size;
      const squareTop = square.y;
      const squareBottom = square.y + square.size;
      
      // Check if particle hit a corner (using distance from corners)
      const distToTopLeft = Math.sqrt((this.x - squareLeft) ** 2 + (this.y - squareTop) ** 2);
      const distToTopRight = Math.sqrt((this.x - squareRight) ** 2 + (this.y - squareTop) ** 2);
      const distToBottomLeft = Math.sqrt((this.x - squareLeft) ** 2 + (this.y - squareBottom) ** 2);
      const distToBottomRight = Math.sqrt((this.x - squareRight) ** 2 + (this.y - squareBottom) ** 2);
      const minCornerDist = Math.min(distToTopLeft, distToTopRight, distToBottomLeft, distToBottomRight);
      
      // If very close to a corner, use corner normal
      if (minCornerDist < this.radius * 1.5) {
        // Corner collision - normal points from corner to particle center
        normalX = dx / distance;
        normalY = dy / distance;
      } else {
        // Edge collision - determine which edge based on closest point
        const distToLeft = Math.abs(this.x - squareLeft);
        const distToRight = Math.abs(this.x - squareRight);
        const distToTop = Math.abs(this.y - squareTop);
        const distToBottom = Math.abs(this.y - squareBottom);
        
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        if (minDist === distToLeft) {
          normalX = -1;
          normalY = 0;
        } else if (minDist === distToRight) {
          normalX = 1;
          normalY = 0;
        } else if (minDist === distToTop) {
          normalX = 0;
          normalY = -1;
        } else {
          normalX = 0;
          normalY = 1;
        }
      }
      
      // Normalize the normal vector
      const normalLength = Math.sqrt(normalX * normalX + normalY * normalY);
      if (normalLength > 0) {
        normalX /= normalLength;
        normalY /= normalLength;
      }
      
      // Calculate dot product of velocity and normal
      const dotProduct = this.dx * normalX + this.dy * normalY;
      
      // Only bounce if moving toward the square
      if (dotProduct < 0) {
        // Reflect velocity vector: v' = v - 2(v·n)n
        const bounceStrength = physics.bounceStrength;
        const reflectedVx = (this.dx - 2 * dotProduct * normalX) * bounceStrength;
        const reflectedVy = (this.dy - 2 * dotProduct * normalY) * bounceStrength;
        
        // Add randomness to the bounce angle (±15 degrees)
        const randomAngle = (Math.random() - 0.5) * Math.PI / 6; // ±15 degrees in radians
        const cosAngle = Math.cos(randomAngle);
        const sinAngle = Math.sin(randomAngle);
        
        // Rotate the reflected velocity vector
        this.dx = reflectedVx * cosAngle - reflectedVy * sinAngle;
        this.dy = reflectedVx * sinAngle + reflectedVy * cosAngle;
      }
      
      return true; // Collision handled
    }
    
    this.wasColliding = isColliding; // Update collision state for next frame
    return false; // No collision handling needed
  }
}

// Pulse class for the expanding circle effect
class Pulse {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.color = 'rgba(255, 255, 255,'; // White color with adjustable opacity
    this.radius = 0;
    this.maxRadius = 50; // Adjust as needed
    this.opacity = 1; // Start fully opaque
    this.finished = false;
    this.filled = false; // Whether to draw as filled circle instead of stroke
  }

  update(deltaTime) {
    // Prevent negative or invalid deltaTime
    if (deltaTime <= 0 || !isFinite(deltaTime)) {
      return;
    }

    // Increase the radius
    this.radius += 200 * deltaTime; // Speed of expansion

    // Fade out
    this.opacity -= 1 * deltaTime; // Fade over 1 second

    // Clamp opacity to valid range
    this.opacity = Math.max(0, this.opacity);

    if (this.radius >= this.maxRadius || this.opacity <= 0) {
      this.finished = true; // Mark pulse as finished
    }
  }

  draw() {
    // Only draw if radius and opacity are valid
    if (this.radius < 0 || this.opacity <= 0 || this.finished) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, this.radius), 0, Math.PI * 2);
    
    if (this.filled) {
      // Draw filled circle for explosion effect
      ctx.fillStyle = `${this.color}${this.opacity})`;
      ctx.fill();
    } else {
      // Draw stroked circle for regular pulse
      ctx.strokeStyle = `${this.color}${this.opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    ctx.closePath();
    ctx.restore();
  }
}

// Function to create a new pulse
function createPulseEffect(x, y) {
  pulses.push(new Pulse(x, y));
}

// Function to create an explosion effect
function createExplosionEffect(x, y, color) {
  // Extract RGB values from rgba color string (format: "rgba(r, g, b, 1)")
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const r = rgbMatch ? parseInt(rgbMatch[1]) : 255;
  const g = rgbMatch ? parseInt(rgbMatch[2]) : 255;
  const b = rgbMatch ? parseInt(rgbMatch[3]) : 255;
  
  // Create bright filled core explosion
  const core = new Pulse(x, y);
  core.color = `rgba(${r}, ${g}, ${b},`;
  core.maxRadius = 60;
  core.opacity = 1;
  core.filled = true;
  pulses.push(core);
  
  // Create multiple expanding colored pulses for explosion effect
  const numPulses = 15;
  for (let i = 0; i < numPulses; i++) {
    const pulse = new Pulse(x, y);
    // Use particle color for explosion
    pulse.color = `rgba(${r}, ${g}, ${b},`;
    pulse.maxRadius = 100 + Math.random() * 40; // Vary sizes between 100-140
    pulse.opacity = 0.9; // Start very bright
    // Add slight random offset for more dynamic explosion
    pulse.x = x + (Math.random() - 0.5) * 10;
    pulse.y = y + (Math.random() - 0.5) * 10;
    pulses.push(pulse);
  }
  
  // Create larger outer rings for impact
  for (let i = 0; i < 5; i++) {
    const ring = new Pulse(x, y);
    ring.color = `rgba(${r}, ${g}, ${b},`;
    ring.maxRadius = 120 + i * 20;
    ring.opacity = 0.6 - i * 0.1;
    pulses.push(ring);
  }
  
  // Create one bright white flash for contrast (subtle)
  const flash = new Pulse(x, y);
  flash.color = 'rgba(255, 255, 255,';
  flash.maxRadius = 80;
  flash.opacity = 0.5; // Reduced opacity so color is more prominent
  flash.filled = true;
  pulses.push(flash);
}

// Particle management
const particles = [];
const colors = {
  Red: 'rgba(220, 140, 140, 1)', // Soft muted red
  Blue: 'rgba(140, 150, 220, 1)', // Soft muted blue
  Lavender: 'rgba(180, 160, 220, 1)', // Soft lavender
  Rose: 'rgba(220, 160, 180, 1)', // Dusty rose
  Sage: 'rgba(160, 200, 160, 1)', // Pale sage green
};
const particleCounts = {
  Red: 10,
  Blue: 10,
  Lavender: 10,
  Rose: 10,
  Sage: 10,
};
const radius = 7; // Particle size

function createParticles() {
  particles.length = 0; // Clear current particles
  Object.keys(particleCounts).forEach((colorKey) => {
    for (let i = 0; i < particleCounts[colorKey]; i++) {
      const x = Math.random() * WORLD.width;
      const y = Math.random() * WORLD.height;
      const dx = randomInitialVelocity();
      const dy = randomInitialVelocity();
      particles.push(new Particle(x, y, dx, dy, radius, colors[colorKey], colorKey));
    }
  });
}

// Collision tracking
let collisionCount = 0;

// Get counter elements (must be defined before updateParticleCounters is called)
const redCounter = document.getElementById('redCounter');
const blueCounter = document.getElementById('blueCounter');
const lavenderCounter = document.getElementById('lavenderCounter');
const roseCounter = document.getElementById('roseCounter');
const sageCounter = document.getElementById('sageCounter');
const totalParticles = document.getElementById('totalParticles');
const timerDisplay = document.getElementById('timerDisplay');
const collisionCounter = document.getElementById('collisionCounter');
const fpsDisplay = document.getElementById('fpsDisplay');
const checkpointDisplay = document.getElementById('checkpointDisplay');
const buildVersion = document.getElementById('buildVersion');

if (buildVersion) {
  buildVersion.textContent = `v${BUILD_VERSION}`;
}

// Function to update collision counter display
function updateCollisionCounter() {
  collisionCounter.textContent = String(collisionCount);
}

// Function to update particle counters based on actual particles
function updateParticleCounters() {
  // Count actual particles by color
  const actualCounts = {
    Red: 0,
    Blue: 0,
    Lavender: 0,
    Rose: 0,
    Sage: 0
  };
  
  particles.forEach(particle => {
    if (particle.colorKey && actualCounts.hasOwnProperty(particle.colorKey)) {
      actualCounts[particle.colorKey]++;
    }
  });
  
  // Update particleCounts to match actual counts
  particleCounts.Red = actualCounts.Red;
  particleCounts.Blue = actualCounts.Blue;
  particleCounts.Lavender = actualCounts.Lavender;
  particleCounts.Rose = actualCounts.Rose;
  particleCounts.Sage = actualCounts.Sage;
  
  // Update UI displays
  redCounter.textContent = particleCounts.Red;
  blueCounter.textContent = particleCounts.Blue;
  lavenderCounter.textContent = particleCounts.Lavender;
  roseCounter.textContent = particleCounts.Rose;
  sageCounter.textContent = particleCounts.Sage;
  
  // Update sliders to match actual counts (only if sliders are defined)
  if (redSlider && blueSlider && lavenderSlider && roseSlider && sageSlider) {
    redSlider.value = particleCounts.Red;
    blueSlider.value = particleCounts.Blue;
    lavenderSlider.value = particleCounts.Lavender;
    roseSlider.value = particleCounts.Rose;
    sageSlider.value = particleCounts.Sage;
  }
  
  // Calculate and update total
  const total = particleCounts.Red + particleCounts.Blue + particleCounts.Lavender + particleCounts.Rose + particleCounts.Sage;
  totalParticles.textContent = String(total);
}

// Draw viewport backdrop and world interior
function drawWorldBackground() {
  ctx.fillStyle = '#030303';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  beginWorldDraw();
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, '#080808');
  gradient.addColorStop(1, '#151515');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  endWorldDraw();
}

function drawWorldBoundary() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, WORLD.width - 3, WORLD.height - 3);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, WORLD.width, WORLD.height);
}

function drawSpawnCircle() {
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 500);

  ctx.beginPath();
  ctx.arc(SPAWN.x, SPAWN.y, SPAWN.radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(120, 255, 180, ${0.08 * pulse})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(120, 255, 180, ${0.85 * pulse})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(120, 255, 180, 0.95)';
  ctx.fillText('SPAWN', SPAWN.x, SPAWN.y - SPAWN.radius - 10);
}

function drawCheckpoints() {
  checkpoints.forEach((checkpoint, index) => {
    const isComplete = index < currentCheckpointIndex;
    const isActive = index === currentCheckpointIndex;
    const pulse = isActive ? 0.6 + 0.4 * Math.sin(performance.now() / 220) : 1;
    const radius = checkpoint.radius * (isActive ? pulse : 1);

    ctx.beginPath();
    ctx.arc(checkpoint.x, checkpoint.y, radius, 0, Math.PI * 2);

    if (isComplete) {
      ctx.fillStyle = 'rgba(120, 255, 180, 0.12)';
      ctx.strokeStyle = 'rgba(120, 255, 180, 0.45)';
    } else if (isActive) {
      ctx.fillStyle = `rgba(255, 220, 120, ${0.14 * pulse})`;
      ctx.strokeStyle = `rgba(255, 220, 120, ${0.95 * pulse})`;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    }

    ctx.lineWidth = isActive ? 3 : 2;
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isComplete
      ? 'rgba(120, 255, 180, 0.8)'
      : isActive
        ? 'rgba(255, 220, 120, 1)'
        : 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(String(checkpoint.index), checkpoint.x, checkpoint.y);
  });
}

function updateCheckpointDisplay() {
  if (!checkpointDisplay) return;
  const total = checkpoints.length;
  const current = Math.min(currentCheckpointIndex, total);
  checkpointDisplay.textContent = total > 0 ? `${current}/${total}` : '0/0';
}

function getSquareCenter() {
  return {
    x: square.x + square.size / 2,
    y: square.y + square.size / 2,
  };
}

function updateCheckpoints() {
  if (raceCompletePending || currentCheckpointIndex >= checkpoints.length) return;

  const checkpoint = checkpoints[currentCheckpointIndex];
  const center = getSquareCenter();
  const dx = center.x - checkpoint.x;
  const dy = center.y - checkpoint.y;
  const reachDistance = checkpoint.radius + square.size * 0.45;

  if (dx * dx + dy * dy <= reachDistance * reachDistance) {
    createPulseEffect(checkpoint.x, checkpoint.y);
    currentCheckpointIndex++;
    updateCheckpointDisplay();

    if (currentCheckpointIndex >= checkpoints.length) {
      raceCompletePending = true;
      createPulseEffect(SPAWN.x, SPAWN.y);
      setTimeout(() => {
        generateCheckpoints();
        resetPlayerToSpawn();
        raceCompletePending = false;
      }, 900);
    }
  }
}

function updateEdgePanning(deltaTime) {
  if (!mouse.onCanvas || isPaused || cameraControl.lockOnPlayer) return;

  let panX = 0;
  let panY = 0;

  if (mouse.x < EDGE_PAN.margin) panX = -1;
  else if (mouse.x > canvas.width - EDGE_PAN.margin) panX = 1;

  if (mouse.y < EDGE_PAN.margin) panY = -1;
  else if (mouse.y > canvas.height - EDGE_PAN.margin) panY = 1;

  if (panX === 0 && panY === 0) return;

  const length = Math.hypot(panX, panY);
  camera.x += (panX / length) * EDGE_PAN.speed * deltaTime;
  camera.y += (panY / length) * EDGE_PAN.speed * deltaTime;
  clampCamera();
}

function drawEdgePanOverlay() {
  if (!mouse.onCanvas || isPaused || cameraControl.lockOnPlayer) return;

  const margin = EDGE_PAN.margin;
  const maxAlpha = 0.22;

  ctx.save();

  if (mouse.x < margin) {
    const t = 1 - mouse.x / margin;
    const grad = ctx.createLinearGradient(0, 0, margin, 0);
    grad.addColorStop(0, `rgba(180, 210, 255, ${maxAlpha * t})`);
    grad.addColorStop(1, 'rgba(180, 210, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, margin, canvas.height);
  }

  if (mouse.x > canvas.width - margin) {
    const t = 1 - (canvas.width - mouse.x) / margin;
    const grad = ctx.createLinearGradient(canvas.width - margin, 0, canvas.width, 0);
    grad.addColorStop(0, 'rgba(180, 210, 255, 0)');
    grad.addColorStop(1, `rgba(180, 210, 255, ${maxAlpha * t})`);
    ctx.fillStyle = grad;
    ctx.fillRect(canvas.width - margin, 0, margin, canvas.height);
  }

  if (mouse.y < margin) {
    const t = 1 - mouse.y / margin;
    const grad = ctx.createLinearGradient(0, 0, 0, margin);
    grad.addColorStop(0, `rgba(180, 210, 255, ${maxAlpha * t})`);
    grad.addColorStop(1, 'rgba(180, 210, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, margin);
  }

  if (mouse.y > canvas.height - margin) {
    const t = 1 - (canvas.height - mouse.y) / margin;
    const grad = ctx.createLinearGradient(0, canvas.height - margin, 0, canvas.height);
    grad.addColorStop(0, 'rgba(180, 210, 255, 0)');
    grad.addColorStop(1, `rgba(180, 210, 255, ${maxAlpha * t})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, canvas.height - margin, canvas.width, margin);
  }

  ctx.restore();
}

// Legacy name kept for compatibility with older calls
function drawGradientBackground() {
  drawWorldBackground();
}

// Update the timer display in the UI
function updateTimerDisplay() {
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = Math.floor(elapsedTime % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${minutes}:${seconds}`;
}

// Update FPS display in the UI
function updateFpsDisplay(currentTime) {
  frameCount++;
  const timeSinceLastUpdate = currentTime - lastFpsUpdate;
  
  if (timeSinceLastUpdate >= fpsUpdateInterval) {
    fps = Math.round((frameCount * 1000) / timeSinceLastUpdate);
    fpsDisplay.textContent = String(fps);
    frameCount = 0;
    lastFpsUpdate = currentTime;
  }
}

// Dropdown menu controls
const redSlider = document.getElementById('redSlider');
const blueSlider = document.getElementById('blueSlider');
const lavenderSlider = document.getElementById('lavenderSlider');
const roseSlider = document.getElementById('roseSlider');
const sageSlider = document.getElementById('sageSlider');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');

// Initialize particles (after sliders are defined)
initWorldLayout();
createParticles();
updateParticleCounters();
updateTimerDisplay();
updateCollisionCounter();
updateCheckpointDisplay();

// Function to add a single particle of a specific color
function addParticle(colorKey) {
  const x = Math.random() * WORLD.width;
  const y = Math.random() * WORLD.height;
  const dx = randomInitialVelocity();
  const dy = randomInitialVelocity();
  particles.push(new Particle(x, y, dx, dy, radius, colors[colorKey], colorKey));
}

// Update particle counts dynamically by adding/removing particles
function updateParticleCount(color, newCount) {
  const currentCount = particleCounts[color];
  const difference = newCount - currentCount;
  
  if (difference > 0) {
    // Add particles
    for (let i = 0; i < difference; i++) {
      addParticle(color);
    }
  } else if (difference < 0) {
    // Remove particles (remove from the end of the array for this color)
    let removed = 0;
    for (let i = particles.length - 1; i >= 0 && removed < Math.abs(difference); i--) {
      if (particles[i].colorKey === color) {
        particles.splice(i, 1);
        removed++;
      }
    }
  }
  
  // Update the particleCounts to match the new count
  particleCounts[color] = newCount;
}

// Event listeners for sliders
redSlider.addEventListener('input', () => {
  updateParticleCount('Red', parseInt(redSlider.value, 10));
  updateParticleCounters();
});
blueSlider.addEventListener('input', () => {
  updateParticleCount('Blue', parseInt(blueSlider.value, 10));
  updateParticleCounters();
});
lavenderSlider.addEventListener('input', () => {
  updateParticleCount('Lavender', parseInt(lavenderSlider.value, 10));
  updateParticleCounters();
});
roseSlider.addEventListener('input', () => {
  updateParticleCount('Rose', parseInt(roseSlider.value, 10));
  updateParticleCounters();
});
sageSlider.addEventListener('input', () => {
  updateParticleCount('Sage', parseInt(sageSlider.value, 10));
  updateParticleCounters();
});

const gravitySlider = document.getElementById('gravitySlider');
const softeningSlider = document.getElementById('softeningSlider');
const spawnSpeedSlider = document.getElementById('spawnSpeedSlider');
const shatterSlider = document.getElementById('shatterSlider');
const bounceSlider = document.getElementById('bounceSlider');
const squareSpeedSlider = document.getElementById('squareSpeedSlider');
const hitLimitSlider = document.getElementById('hitLimitSlider');
const gravityValue = document.getElementById('gravityValue');
const softeningValue = document.getElementById('softeningValue');
const spawnSpeedValue = document.getElementById('spawnSpeedValue');
const shatterValue = document.getElementById('shatterValue');
const bounceValue = document.getElementById('bounceValue');
const squareSpeedValue = document.getElementById('squareSpeedValue');
const hitLimitValue = document.getElementById('hitLimitValue');
const resetPhysicsButton = document.getElementById('resetPhysicsButton');

function updatePhysicsDisplays() {
  gravityValue.textContent = physics.attractionStrength.toFixed(2);
  softeningValue.textContent = physics.gravitySoftening.toFixed(1);
  spawnSpeedValue.textContent = physics.spawnSpeedScale.toFixed(1);
  shatterValue.textContent = String(physics.shatterThreshold);
  bounceValue.textContent = physics.bounceStrength.toFixed(2);
  squareSpeedValue.textContent = String(physics.squareSpeed);
  hitLimitValue.textContent = String(physics.squareHitLimit);
}

function syncPhysicsSliders() {
  gravitySlider.value = Math.round(physics.attractionStrength * 100);
  softeningSlider.value = Math.round(physics.gravitySoftening * 10);
  spawnSpeedSlider.value = Math.round(physics.spawnSpeedScale * 10);
  shatterSlider.value = physics.shatterThreshold;
  bounceSlider.value = Math.round(physics.bounceStrength * 100);
  squareSpeedSlider.value = physics.squareSpeed;
  hitLimitSlider.value = physics.squareHitLimit;
  updatePhysicsDisplays();
}

gravitySlider.addEventListener('input', () => {
  physics.attractionStrength = parseInt(gravitySlider.value, 10) / 100;
  updatePhysicsDisplays();
});

softeningSlider.addEventListener('input', () => {
  physics.gravitySoftening = parseInt(softeningSlider.value, 10) / 10;
  updatePhysicsDisplays();
});

spawnSpeedSlider.addEventListener('input', () => {
  physics.spawnSpeedScale = parseInt(spawnSpeedSlider.value, 10) / 10;
  updatePhysicsDisplays();
});

shatterSlider.addEventListener('input', () => {
  physics.shatterThreshold = parseInt(shatterSlider.value, 10);
  updatePhysicsDisplays();
});

bounceSlider.addEventListener('input', () => {
  physics.bounceStrength = parseInt(bounceSlider.value, 10) / 100;
  updatePhysicsDisplays();
});

squareSpeedSlider.addEventListener('input', () => {
  physics.squareSpeed = parseInt(squareSpeedSlider.value, 10);
  updatePhysicsDisplays();
});

hitLimitSlider.addEventListener('input', () => {
  physics.squareHitLimit = parseInt(hitLimitSlider.value, 10);
  updatePhysicsDisplays();
});

resetPhysicsButton.addEventListener('click', () => {
  Object.assign(physics, physicsDefaults);
  syncPhysicsSliders();
});

syncPhysicsSliders();

// Function to reset the timer
function resetTimer() {
  elapsedTime = 0; // Reset the timer to 0
  lastUpdateTime = null; // Clear the last update time
}

// Pause/Resume button
pauseButton.addEventListener('click', () => {
  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
  if (!isPaused) {
    lastUpdateTime = performance.now(); // Reset last update time
  }
});

// Reset button
resetButton.addEventListener('click', () => {
  redSlider.value = 10;
  blueSlider.value = 10;
  lavenderSlider.value = 10;
  roseSlider.value = 10;
  sageSlider.value = 10;
  particleCounts.Red = 10;
  particleCounts.Blue = 10;
  particleCounts.Lavender = 10;
  particleCounts.Rose = 10;
  particleCounts.Sage = 10;
  createParticles();
  updateParticleCounters();
  resetPlayerHealth();
  raceCompletePending = false;
  generateCheckpoints();
  resetPlayerToSpawn();

  collisionCount = 0;
  updateCollisionCounter();

  // Reset timer
  elapsedTime = 0; // Reset elapsed time to 0
  lastUpdateTime = null; // Clear last update time to ensure smooth resume

  // Resume simulation if paused
  isPaused = false;
  pauseButton.textContent = 'Pause';
});

// Key state tracking
const keysPressed = {};

// Event listeners for key presses
document.addEventListener('keydown', function(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    cameraControl.lockOnPlayer = true;
    return;
  }

  const key = event.key.toLowerCase();
  keysPressed[key] = true;

  if (['w', 'a', 's', 'd'].includes(key)) {
    keyPressTimestamps.push(performance.now());
  }
});

document.addEventListener('keyup', function(event) {
  if (event.code === 'Space') {
    cameraControl.lockOnPlayer = false;
    return;
  }

  keysPressed[event.key.toLowerCase()] = false;
});

window.addEventListener('blur', () => {
  cameraControl.lockOnPlayer = false;
});

// Function to calculate the speed multiplier
function calculateSpeedMultiplier() {
  const now = performance.now();
  const threeSecondsAgo = now - 3000; // 3000 milliseconds = 3 seconds

  // Remove timestamps older than 3 seconds
  keyPressTimestamps = keyPressTimestamps.filter(timestamp => timestamp >= threeSecondsAgo);

  const pressCount = keyPressTimestamps.length;

  let speedMultiplier;

  if (pressCount <= 20) {
    // Linear increase up to 2x speed
    speedMultiplier = 1 + (pressCount / 20); // From 1x to 2x
  } else {
    // Diminishing returns after 2x speed
    speedMultiplier = 2 + ((pressCount - 20) * 0.05);
  }

  return speedMultiplier;
}

function resetPlayerHealth() {
  player.lives = player.maxLives;
  player.stunRemaining = 0;
  player.regenProgress = 0;
  player.lastHitTime = 0;
}

function damagePlayer() {
  if (player.stunRemaining > 0) return;

  player.lives = Math.max(0, player.lives - 1);
  player.lastHitTime = performance.now();
  player.regenProgress = 0;

  if (player.lives === 0) {
    player.stunRemaining = player.stunDuration;
  }
}

function updatePlayerHealth(deltaTime) {
  if (player.stunRemaining > 0) {
    player.stunRemaining = Math.max(0, player.stunRemaining - deltaTime);
    return;
  }

  if (player.lives >= player.maxLives) return;

  const sinceHit = (performance.now() - player.lastHitTime) / 1000;
  if (sinceHit < player.regenDelay) {
    player.regenProgress = 0;
    return;
  }

  player.regenProgress += deltaTime;
  while (player.regenProgress >= player.regenInterval && player.lives < player.maxLives) {
    player.regenProgress -= player.regenInterval;
    player.lives++;
  }
}

function isPlayerStunned() {
  return player.stunRemaining > 0;
}

function drawPlayerHealthBar() {
  const barWidth = square.size;
  const barHeight = HEALTH_BAR.height;
  const barX = square.x;
  const barY = square.y - HEALTH_BAR.gap - barHeight;
  const fillRatio = player.lives / player.maxLives;
  const sinceHit = (performance.now() - player.lastHitTime) / 1000;
  const isRegenerating = player.lives < player.maxLives
    && player.stunRemaining <= 0
    && sinceHit >= player.regenDelay;

  ctx.save();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  if (fillRatio > 0) {
    ctx.fillStyle = isRegenerating ? 'rgba(220, 255, 230, 1)' : '#ffffff';
    ctx.fillRect(barX, barY, barWidth * fillRatio, barHeight);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barWidth - 1, barHeight - 1);

  ctx.beginPath();
  ctx.moveTo(barX + barWidth / 3, barY);
  ctx.lineTo(barX + barWidth / 3, barY + barHeight);
  ctx.moveTo(barX + (2 * barWidth) / 3, barY);
  ctx.lineTo(barX + (2 * barWidth) / 3, barY + barHeight);
  ctx.stroke();

  if (isRegenerating && player.lives < player.maxLives) {
    const regenFill = Math.min(1, player.regenProgress / player.regenInterval);
    const segmentStart = barX + barWidth * (player.lives / player.maxLives);
    const segmentWidth = barWidth / player.maxLives;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(segmentStart, barY, segmentWidth * regenFill, barHeight);
  }

  ctx.restore();
}

function drawStunIndicator() {
  const pulse = 0.45 + 0.55 * Math.sin(performance.now() / 80);
  const pad = 6;

  ctx.save();
  ctx.strokeStyle = `rgba(255, 210, 90, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(
    square.x - pad,
    square.y - pad,
    square.size + pad * 2,
    square.size + pad * 2
  );
  ctx.setLineDash([]);

  ctx.fillStyle = `rgba(255, 210, 90, ${0.12 + pulse * 0.1})`;
  ctx.fillRect(square.x, square.y, square.size, square.size);

  const labelY = square.y - HEALTH_BAR.gap - HEALTH_BAR.height - 10;
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(255, 210, 90, ${pulse})`;
  ctx.fillText('STUNNED', square.x + square.size / 2, labelY);
  ctx.restore();
}

// Converts a hex color code to an RGB array
function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [
    (bigint >> 16) & 255, // Red
    (bigint >> 8) & 255,  // Green
    bigint & 255          // Blue
  ];
}

// Interpolates between two RGB colors
function interpolateColor(color1, color2, factor) {
  const result = color1.slice();
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
  }
  return result;
}

function drawSquare() {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const stunned = isPlayerStunned();
  ctx.fillStyle = stunned ? 'rgba(210, 210, 210, 1)' : '#ffffff';
  ctx.fillRect(square.x, square.y, square.size, square.size);

  ctx.strokeStyle = stunned ? 'rgba(255, 210, 90, 0.9)' : '#ffffff';
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';
  ctx.strokeRect(square.x, square.y, square.size, square.size);

  ctx.restore();

  drawPlayerHealthBar();
  if (stunned) {
    drawStunIndicator();
  }
}

// Animation loop
function animate(currentTime) {
  if (!lastUpdateTime) lastUpdateTime = currentTime;
  const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
  const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
  lastUpdateTime = currentTime;

  drawGradientBackground();

  updateCameraFollow(deltaTime);

  if (!isPaused) {
    elapsedTime += deltaTime;
    updatePlayerHealth(deltaTime);
    updateEdgePanning(deltaTime);

    const speedMultiplier = calculateSpeedMultiplier();
    const canMove = !isPlayerStunned();
    const adjustedSpeed = physics.squareSpeed * speedMultiplier * deltaTime;

    if (canMove) {
      if (keysPressed['w']) square.y -= adjustedSpeed;
      if (keysPressed['s']) square.y += adjustedSpeed;
      if (keysPressed['a']) square.x -= adjustedSpeed;
      if (keysPressed['d']) square.x += adjustedSpeed;
    }

    square.x = Math.max(0, Math.min(square.x, WORLD.width - square.size));
    square.y = Math.max(0, Math.min(square.y, WORLD.height - square.size));

    updateCheckpoints();

    let particlesDestroyed = false;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.update(particles);

      if (particle.shouldDestroy) {
        particles.splice(i, 1);
        particlesDestroyed = true;
      }
    }

    if (particlesDestroyed) {
      updateParticleCounters();
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      pulse.update(deltaTime);
      if (pulse.finished) {
        pulses.splice(i, 1);
      }
    }
  }

  beginWorldDraw();
  drawWorldBoundary();
  drawSpawnCircle();
  drawCheckpoints();

  for (const particle of particles) {
    if (!particle.shouldDestroy) {
      particle.draw();
    }
  }

  for (const pulse of pulses) {
    if (!pulse.finished && pulse.radius >= 0 && pulse.opacity > 0) {
      pulse.draw();
    }
  }

  drawSquare();
  endWorldDraw();

  drawEdgePanOverlay();
  drawMinimap();

  updateTimerDisplay();
  updateFpsDisplay(currentTime);
  requestAnimationFrame(animate);
}

// Start the animation
animate(performance.now());
