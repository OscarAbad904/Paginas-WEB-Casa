import { Canvas } from '@react-three/fiber';
import { SolarSystem } from '../render/bodies.jsx';
import Sidebar from './Sidebar.jsx';
import HUD from './HUD.jsx';
import Timeline from './Timeline.jsx';

export default function App() {
  return (
    <div className="app-root flex h-screen">
      <Sidebar />
      <main className="flex-1 relative bg-gray-950">
        <Canvas camera={{ position: [0, 0, 1.5e8], fov: 60 }}>
          <SolarSystem />
        </Canvas>
        <HUD />
        <Timeline />
      </main>
    </div>
  );
}