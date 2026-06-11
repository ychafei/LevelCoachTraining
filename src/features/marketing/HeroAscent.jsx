import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';

// "The Ascent" — the brand promise (find the right coach for your NEXT LEVEL,
// progress you can measure) as the hero's 3D moment. A training journey
// climbs through ten faint level terraces (the platform's real 1–10
// assessment scale): an amber athlete-dot travels a rising path — including
// one honest mid-journey dip — milestone session nodes ignite as it passes,
// and each level-up fires a ring pulse. Deterministic geometry, lazy-mounted
// by the Landing page only on idle, lg+ viewports, capable hardware.

const NAVY = '#3b5a96';
const SKY = '#9db8e8';
const AMBER = '#f5a623';
const LOOP_SECONDS = 13;

// The journey: session milestones rising left→right with a believable dip
// (setbacks are part of training) before the strong climb.
const CONTROL_POINTS = [
  [-2.7, -1.35, 0.25],
  [-1.95, -1.0, -0.2],
  [-1.2, -0.5, 0.25],
  [-0.5, -0.72, -0.3], // the dip
  [0.2, -0.12, 0.2],
  [0.95, 0.38, -0.25],
  [1.7, 0.85, 0.18],
  [2.45, 1.5, -0.05],
];

const TERRACES = 10; // levels 1–10, matching the assessment scale

function makeSpriteTexture(draw) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const makeDotTexture = () => makeSpriteTexture((ctx) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
});

const makeRingTexture = () => makeSpriteTexture((ctx) => {
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.stroke();
});

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function Ascent() {
  const group = useRef();
  const traveler = useRef();
  const glow = useRef();
  const trailRef = useRef();
  const milestoneRefs = useRef([]);
  const ringRefs = useRef([]);
  const lastT = useRef(0);

  const dotTexture = useMemo(makeDotTexture, []);
  const ringTexture = useMemo(makeRingTexture, []);

  const { curve, pathGeometry, milestoneTs } = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(CONTROL_POINTS.map((p) => new THREE.Vector3(...p)));
    const points = c.getPoints(240);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    // Vertex gradient: faint navy at the start → bright blue near the top.
    const colors = new Float32Array(points.length * 3);
    const from = new THREE.Color(NAVY);
    const to = new THREE.Color(SKY);
    points.forEach((_, i) => {
      const mixed = from.clone().lerp(to, i / (points.length - 1));
      colors.set([mixed.r, mixed.g, mixed.b], i * 3);
    });
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Arc-length position (u in [0,1]) of each milestone, so comparisons
    // against the traveler's getPointAt(u) parameter are apples-to-apples.
    // Control point i sits at uniform parameter t = i/(n-1); convert via the
    // cumulative segment lengths of the same uniform sampling.
    const lengths = c.getLengths(240);
    const total = lengths[lengths.length - 1];
    const ts = CONTROL_POINTS.map((_, i) => {
      const sampleIndex = Math.round((i / (CONTROL_POINTS.length - 1)) * 240);
      return lengths[sampleIndex] / total;
    });
    return { curve: c, pathGeometry: geometry, milestoneTs: ts };
  }, []);

  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    return geometry;
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    // Gentle pointer tilt.
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, state.pointer.x * 0.12, 0.04);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, state.pointer.y * -0.08, 0.04);

    const t = easeInOut((state.clock.elapsedTime % LOOP_SECONDS) / LOOP_SECONDS);
    const position = curve.getPointAt(t);
    if (traveler.current) traveler.current.position.copy(position);
    if (glow.current) {
      glow.current.position.copy(position);
      const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.06;
      glow.current.scale.setScalar(pulse);
    }

    // Trail: a short bright segment behind the traveler.
    if (trailRef.current) {
      const attr = trailRef.current.geometry.getAttribute('position');
      for (let i = 0; i < 24; i += 1) {
        const tt = Math.max(0, t - 0.075 + (0.075 * i) / 23);
        const p = curve.getPointAt(tt);
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
    }

    // Milestones ignite as the traveler passes; level-up ring on crossing.
    milestoneTs.forEach((mt, i) => {
      const mesh = milestoneRefs.current[i];
      if (!mesh) return;
      const passed = t >= mt;
      mesh.material.color.set(passed ? AMBER : NAVY);
      mesh.material.opacity = passed ? 1 : 0.8;
      if (passed && lastT.current < mt) {
        // Fire the least-recently-used ring at this node.
        const ring = ringRefs.current[i % ringRefs.current.length];
        if (ring) {
          ring.position.copy(curve.getPointAt(mt));
          ring.scale.setScalar(0.12);
          ring.material.opacity = 0.9;
        }
      }
    });
    lastT.current = t;

    // Expand + fade active rings.
    ringRefs.current.forEach((ring) => {
      if (!ring || ring.material.opacity <= 0.01) return;
      ring.scale.addScalar(delta * 1.6);
      ring.material.opacity = Math.max(0, ring.material.opacity - delta * 1.4);
    });
  });

  return (
    <group ref={group} rotation={[0.05, 0, 0]}>
      {/* Level terraces 1–10: the assessment scale as faint horizon lines. */}
      {Array.from({ length: TERRACES }, (_, i) => {
        const y = -1.55 + (i * 3.3) / (TERRACES - 1);
        return (
          <line key={y}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={new Float32Array([-3.1, y, -0.7, 3.1, y, -0.7])}
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.05 + i * 0.012} depthWrite={false} />
          </line>
        );
      })}

      {/* The progress path */}
      <line geometry={pathGeometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} />
      </line>

      {/* Trail behind the athlete-dot */}
      <line ref={trailRef} geometry={trailGeometry}>
        <lineBasicMaterial color={AMBER} transparent opacity={0.8} depthWrite={false} />
      </line>

      {/* Session milestones */}
      {CONTROL_POINTS.map((p, i) => (
        <mesh key={p.join()} position={p} ref={(el) => { milestoneRefs.current[i] = el; }}>
          <sphereGeometry args={[i === CONTROL_POINTS.length - 1 ? 0.075 : 0.05, 16, 16]} />
          <meshBasicMaterial color={NAVY} transparent />
        </mesh>
      ))}

      {/* Level-up ring pulses (pooled sprites) */}
      {[0, 1, 2].map((i) => (
        <sprite key={i} ref={(el) => { ringRefs.current[i] = el; }} scale={0.12}>
          <spriteMaterial map={ringTexture} color={AMBER} transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}

      {/* The athlete-dot + glow */}
      <mesh ref={traveler}>
        <sphereGeometry args={[0.07, 20, 20]} />
        <meshBasicMaterial color={AMBER} />
      </mesh>
      <sprite ref={glow} scale={0.5}>
        <spriteMaterial map={dotTexture} color={AMBER} transparent opacity={0.55} depthWrite={false} />
      </sprite>
    </group>
  );
}

export default function HeroAscent() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.1, 5.6], fov: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <Ascent />
    </Canvas>
  );
}
