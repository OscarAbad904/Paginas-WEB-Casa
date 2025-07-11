import * as Tabs from '@radix-ui/react-tabs';
import bodies from '../data/bodies.json';

export default function Sidebar() {
  return (
    <aside className="sidebar bg-neutral-900 w-72 p-4 text-white">
      <div className="font-bold mb-2">Panel lateral</div>
      <Tabs.Root defaultValue="bodies">
        <Tabs.List>
          <Tabs.Trigger value="bodies">Cuerpos</Tabs.Trigger>
          <Tabs.Trigger value="rocket">Cohete</Tabs.Trigger>
          <Tabs.Trigger value="maneuvers">Maniobras</Tabs.Trigger>
          <Tabs.Trigger value="time">Tiempo</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="bodies">
          <ul>
            {bodies.map((body) => (
              <li key={body.name} className="mb-2">
                <span style={{ color: body.color }}>{body.name}</span>
              </li>
            ))}
          </ul>
        </Tabs.Content>
        <Tabs.Content value="rocket">Configuración de etapas</Tabs.Content>
        <Tabs.Content value="maneuvers">Maniobras</Tabs.Content>
        <Tabs.Content value="time">Control temporal</Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}