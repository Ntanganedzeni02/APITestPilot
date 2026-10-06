import {
  Activity,
  BookOpen,
  CircleAlert,
  FileBarChart2,
  FileCheck2,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  MessagesSquare,
  Network,
  Play,
  ScanSearch,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import type { NavigationIcon } from '../../lib/navigation';

const icons: Record<NavigationIcon, LucideIcon> = {
  overview: LayoutDashboard,
  map: Network,
  requirements: FileCheck2,
  risks: CircleAlert,
  tests: FlaskConical,
  runs: Play,
  investigations: ScanSearch,
  findings: Activity,
  releases: GitBranch,
  reports: FileBarChart2,
  ask: MessagesSquare,
  memory: BookOpen,
  settings: Settings2,
};

export function RouteIcon({
  name,
  className = 'size-4',
}: {
  name: NavigationIcon;
  className?: string;
}) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" strokeWidth={1.7} />;
}
