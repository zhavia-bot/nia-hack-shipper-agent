import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  BotIcon,
  CheckmarkBadge01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  DashboardCircleIcon,
  DollarCircleIcon,
  Download01Icon,
  FlashIcon,
  FlaskConical,
  GitBranchIcon,
  Loading02Icon,
  LockIcon,
  PauseIcon,
  PlayIcon,
  PlusSignIcon,
  Refresh01Icon,
  Rocket01Icon,
  Settings01Icon,
  Shield01Icon,
  ShoppingBag02Icon,
  SparklesIcon,
  StarIcon,
  TestTube01Icon,
  ViewIcon,
  Delete02Icon,
  Cancel01Icon,
  ZapIcon,
  WorkflowSquare01Icon,
  RobotIcon,
  Activity03Icon,
  ChartLineData01Icon,
} from "@hugeicons/core-free-icons";
import type { CSSProperties, MouseEventHandler } from "react";

interface IconProps {
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<SVGSVGElement>;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

function make(icon: typeof ArrowRight01Icon) {
  function Icon(props: IconProps) {
    return <HugeiconsIcon icon={icon} {...props} />;
  }
  Icon.displayName = "HugeiconsIconWrapper";
  return Icon;
}

export const ArrowRight = make(ArrowRight01Icon);
export const Bot = make(BotIcon);
export const Robot = make(RobotIcon);
export const BadgeCheck = make(CheckmarkBadge01Icon);
export const CheckCircle = make(CheckmarkCircle02Icon);
export const Clock = make(Clock01Icon);
export const Dashboard = make(DashboardCircleIcon);
export const CircleDollarSign = make(DollarCircleIcon);
export const Download = make(Download01Icon);
export const Flash = make(FlashIcon);
export const FlaskConicalIcon = make(FlaskConical);
export const TestTube = make(TestTube01Icon);
export const GitBranch = make(GitBranchIcon);
export const Loader = make(Loading02Icon);
export const Lock = make(LockIcon);
export const Pause = make(PauseIcon);
export const Play = make(PlayIcon);
export const Plus = make(PlusSignIcon);
export const RefreshCw = make(Refresh01Icon);
export const Rocket = make(Rocket01Icon);
export const Settings = make(Settings01Icon);
export const ShieldCheck = make(Shield01Icon);
export const ShoppingBag = make(ShoppingBag02Icon);
export const Sparkles = make(SparklesIcon);
export const Star = make(StarIcon);
export const View = make(ViewIcon);
export const Trash = make(Delete02Icon);
export const X = make(Cancel01Icon);
export const Zap = make(ZapIcon);
export const Workflow = make(WorkflowSquare01Icon);
export const Activity = make(Activity03Icon);
export const ChartLine = make(ChartLineData01Icon);
