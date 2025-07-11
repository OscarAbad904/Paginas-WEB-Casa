import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import bodies from '../data/bodies.json';

// Escala para visualizar mejor las órbitas y tamaños
const DIST_SCALE = 100;
const RADIUS_SCALE = 5;

export function SolarSystem() {
  return (
    <>
      {/* Luz ambiental y punto de luz para el Sol */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={2} />
      {bodies.map((body, i) => (
        <Planet key={body.name} body={body} index={i} />
      ))}
    </>
  );
}

function Planet({ body, index }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current && index !== 0) {
      // Movimiento orbital simple para planetas (no para el Sol)
      const t = Date.now() * 0.0001 + index * 2;
      const dist = (body.radius + 100 + index * 80) * DIST_SCALE;
      ref.current.position.x = dist * Math.cos(t);
      ref.current.position.z = dist * Math.sin(t);
    }
  });
  return (
    <mesh
      ref={ref}
      position={index === 0 ? [0, 0, 0] : [(body.radius + 100 + index * 80) * DIST_SCALE, 0, 0]}
    >
      <sphereGeometry args={[body.radius * RADIUS_SCALE, 32, 32]} />
      <meshStandardMaterial color={body.color} />
    </mesh>
  );
}