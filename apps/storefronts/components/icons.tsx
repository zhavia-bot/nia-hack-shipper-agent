import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkBadge01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Loading02Icon,
  LockIcon,
  Refresh01Icon,
  Shield01Icon,
  ShoppingBag02Icon,
  SparklesIcon,
  StarIcon,
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

function make(icon: typeof LockIcon) {
  function Icon(props: IconProps) {
    return <HugeiconsIcon icon={icon} {...props} />;
  }
  Icon.displayName = "HugeiconsIconWrapper";
  return Icon;
}

export const BadgeCheck = make(CheckmarkBadge01Icon);
export const CheckCircle = make(CheckmarkCircle02Icon);
export const Clock = make(Clock01Icon);
export const Loader = make(Loading02Icon);
export const Lock = make(LockIcon);
export const RefreshCw = make(Refresh01Icon);
export const ShieldCheck = make(Shield01Icon);
export const ShoppingBag = make(ShoppingBag02Icon);
export const Sparkles = make(SparklesIcon);
export const Star = make(StarIcon);
