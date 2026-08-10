import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Star, Heart, House, MagnifyingGlass, Gear, User, Envelope, Phone,
  Camera, Image as ImageIcon, VideoCamera, MusicNotes, Play, Pause, SpeakerHigh,
  Bell, Calendar, Clock, MapPin, NavigationArrow,
  DownloadSimple, UploadSimple, ShareNetwork, LinkSimple, ArrowSquareOut,
  Check, X, Plus, Minus, ArrowRight,
  ArrowLeft, ArrowUp, ArrowDown, CaretRight, CaretDown,
  Eye, EyeSlash, Lock, LockOpen, Shield,
  Lightning, Sun, Moon, Cloud, Globe,
  Gift, ShoppingCart, CreditCard, Trophy, Target,
  BookmarkSimple, Flag, Tag, Folder, FileText,
  Sparkle, Fire, ThumbsUp, ChatCircle, Users,
  Rocket, Crown, Medal, ChartLineUp, ShieldCheck,
  Wallet, Timer, Confetti, PaperPlaneTilt, Lightbulb,
  type Icon,
} from "@phosphor-icons/react";
import type { IconWeight } from "@/lib/screenshot-editor/types";

export const ICON_CATALOG: { name: string; Icon: Icon }[] = [
  { name: "star", Icon: Star }, { name: "heart", Icon: Heart }, { name: "house", Icon: House },
  { name: "magnifying-glass", Icon: MagnifyingGlass }, { name: "gear", Icon: Gear },
  { name: "user", Icon: User }, { name: "envelope", Icon: Envelope }, { name: "phone", Icon: Phone },
  { name: "camera", Icon: Camera }, { name: "image", Icon: ImageIcon },
  { name: "video-camera", Icon: VideoCamera }, { name: "music-notes", Icon: MusicNotes },
  { name: "play", Icon: Play }, { name: "pause", Icon: Pause }, { name: "speaker-high", Icon: SpeakerHigh },
  { name: "bell", Icon: Bell }, { name: "calendar", Icon: Calendar }, { name: "clock", Icon: Clock },
  { name: "map-pin", Icon: MapPin }, { name: "navigation-arrow", Icon: NavigationArrow },
  { name: "download-simple", Icon: DownloadSimple }, { name: "upload-simple", Icon: UploadSimple },
  { name: "share-network", Icon: ShareNetwork }, { name: "link-simple", Icon: LinkSimple },
  { name: "arrow-square-out", Icon: ArrowSquareOut },
  { name: "check", Icon: Check }, { name: "x", Icon: X }, { name: "plus", Icon: Plus },
  { name: "minus", Icon: Minus }, { name: "arrow-right", Icon: ArrowRight },
  { name: "arrow-left", Icon: ArrowLeft }, { name: "arrow-up", Icon: ArrowUp },
  { name: "arrow-down", Icon: ArrowDown }, { name: "caret-right", Icon: CaretRight },
  { name: "caret-down", Icon: CaretDown },
  { name: "eye", Icon: Eye }, { name: "eye-slash", Icon: EyeSlash }, { name: "lock", Icon: Lock },
  { name: "lock-open", Icon: LockOpen }, { name: "shield", Icon: Shield },
  { name: "lightning", Icon: Lightning }, { name: "sun", Icon: Sun }, { name: "moon", Icon: Moon },
  { name: "cloud", Icon: Cloud }, { name: "globe", Icon: Globe },
  { name: "gift", Icon: Gift }, { name: "shopping-cart", Icon: ShoppingCart },
  { name: "credit-card", Icon: CreditCard }, { name: "trophy", Icon: Trophy },
  { name: "target", Icon: Target },
  { name: "bookmark-simple", Icon: BookmarkSimple }, { name: "flag", Icon: Flag },
  { name: "tag", Icon: Tag }, { name: "folder", Icon: Folder }, { name: "file-text", Icon: FileText },
  { name: "sparkle", Icon: Sparkle }, { name: "fire", Icon: Fire }, { name: "thumbs-up", Icon: ThumbsUp },
  { name: "chat-circle", Icon: ChatCircle }, { name: "users", Icon: Users },
  { name: "rocket", Icon: Rocket }, { name: "crown", Icon: Crown }, { name: "medal", Icon: Medal },
  { name: "chart-line-up", Icon: ChartLineUp }, { name: "shield-check", Icon: ShieldCheck },
  { name: "wallet", Icon: Wallet }, { name: "timer", Icon: Timer }, { name: "confetti", Icon: Confetti },
  { name: "paper-plane-tilt", Icon: PaperPlaneTilt }, { name: "lightbulb", Icon: Lightbulb },
];

/** Rasterize a catalog icon to a self-contained SVG data URI (fill color baked in). */
export function iconSvgDataUri(name: string, color: string, weight: IconWeight): string | null {
  const entry = ICON_CATALOG.find((i) => i.name === name);
  if (!entry) return null;
  const svg = renderToStaticMarkup(createElement(entry.Icon, { size: 512, color, weight }));
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
