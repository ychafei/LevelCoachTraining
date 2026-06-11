import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';

// The hero's 3D moment (React Three Fiber): an abstract globe of ~700 points
// with amber "active" nodes and arcing connections — the marketplace as a
// living network. Rules it lives by (design directive): dynamically imported
// after first paint, never part of LCP, deterministic geometry (no
// Math.random — stable across prerenders), capped DPR, and the parent only
// mounts it on capable, motion-tolerant devices over a static poster.

const RADIUS = 2;
const POINTS = 700;
const NAVY_DOT = '#9db8e8';
const AMBER = '#f5a623';
const ARC_BLUE = '#3b82f6';

// Deterministic pseudo-random (Lehmer) — identical scene every load.
function lehmer(seedStart) {
  let seed = seedStart;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

// Round-sprite texture so points render as soft dots, not squares.
function makeDotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function spherePoint(u, v) {
  const phi = Math.acos(2 * v - 1);
  const theta = 2 * Math.PI * u;
  return new THREE.Vector3(
    RADIUS * Math.sin(phi) * Math.cos(theta),
    RADIUS * Math.cos(phi),
    RADIUS * Math.sin(phi) * Math.sin(theta),
  );
}

function Globe() {
  const group = useRef();
  const dotTexture = useMemo(makeDotTexture, []);

  const { base, amber } = useMemo(() => {
    const basePts = [];
    const amberPts = [];
    // Fibonacci sphere: evenly distributed, fully deterministic.
    for (let i = 0; i < POINTS; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / POINTS);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = RADIUS * Math.sin(phi) * Math.cos(theta);
      const y = RADIUS * Math.cos(phi);
      const z = RADIUS * Math.sin(phi) * Math.sin(theta);
      if (i % 43 === 0) amberPts.push(x, y, z);
      else basePts.push(x, y, z);
    }
    return { base: new Float32Array(basePts), amber: new Float32Array(amberPts) };
  }, []);

  const arcs = useMemo(() => {
    const rand = lehmer(20260611);
    const geometries = [];
    for (let i = 0; i < 9; i += 1) {
      const a = spherePoint(rand(), rand());
      const b = spherePoint(rand(), rand());
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS * 1.35);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      geometries.push(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)));
    }
    return geometries;
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.07;
    // Gentle pointer tilt — parallax well under the 8px-equivalent restraint.
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, state.pointer.y * 0.18, 0.04);
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, state.pointer.x * -0.06, 0.04);
  });

  return (
    <group ref={group} rotation={[0.35, 0, -0.12]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={base} count={base.length / 3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={dotTexture}
          color={NAVY_DOT}
          size={0.045}
          transparent
          opacity={0.85}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={amber} count={amber.length / 3} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          map={dotTexture}
          color={AMBER}
          size={0.12}
          transparent
          opacity={0.95}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      {arcs.map((geometry, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <line key={index} geometry={geometry}>
          <lineBasicMaterial color={index % 3 === 0 ? AMBER : ARC_BLUE} transparent opacity={index % 3 === 0 ? 0.55 : 0.3} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

export default function HeroOrb() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.4], fov: 42 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <Globe />
    </Canvas>
  );
}
