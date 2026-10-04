import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, AudioWaveform, Bath, Bed, Bell, BrainCircuit, Camera,
  Check, ChevronLeft, ChevronRight, CircleHelp, Code, Contrast, Cpu, Download, ExternalLink, Eye, Frown, Gauge,
  GlassWater, Hand, HandHeart, Heart, House, Info, LayoutDashboard, LayoutGrid, Lightbulb, Lock, LogIn,
  MessageCircle, Mic, Moon, MousePointer2, Music, Palette, Pencil, Phone, Pill, Play, Plus, RefreshCcw, RotateCcw, ScanFace,
  Settings, ShieldCheck, SlidersHorizontal, Smile, Snowflake, Sparkles, Square, Stethoscope, Sun, SwitchCamera,
  Thermometer, Trash2, Tv, Type, Undo2, Upload, UserPlus, UserRound, Utensils, Volume2, VolumeX, Wind, WifiOff, X, Zap,
  type IconNode,
} from 'lucide';

const ICONS: Record<string, IconNode> = {
  activity: Activity, 'arrow-down': ArrowDown, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight,
  'audio-lines': AudioLines, waveform: AudioWaveform, bath: Bath, bed: Bed, bell: Bell, brain: BrainCircuit,
  camera: Camera, check: Check, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, help: CircleHelp,
  code: Code, contrast: Contrast, cpu: Cpu, download: Download, external: ExternalLink, eye: Eye, frown: Frown,
  gauge: Gauge, 'glass-water': GlassWater, hand: Hand, 'hand-heart': HandHeart, heart: Heart, house: House,
  info: Info, dashboard: LayoutDashboard, 'layout-grid': LayoutGrid, lightbulb: Lightbulb, lock: Lock,
  'log-in': LogIn, 'message-circle': MessageCircle, mic: Mic, moon: Moon, pointer: MousePointer2, music: Music,
  palette: Palette, pencil: Pencil, phone: Phone, pill: Pill, play: Play, plus: Plus, 'refresh-ccw': RefreshCcw,
  'rotate-ccw': RotateCcw, 'scan-face': ScanFace, settings: Settings, 'shield-check': ShieldCheck,
  sliders: SlidersHorizontal, smile: Smile, snowflake: Snowflake, sparkles: Sparkles, square: Square,
  stethoscope: Stethoscope, sun: Sun, 'switch-camera': SwitchCamera, thermometer: Thermometer, trash: Trash2,
  tv: Tv, type: Type, undo: Undo2, upload: Upload, 'user-plus': UserPlus, user: UserRound, utensils: Utensils,
  volume: Volume2, 'volume-x': VolumeX, wind: Wind, 'wifi-off': WifiOff, x: X, zap: Zap,
};

const attr = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

/** Devuelve el SVG del ícono como texto, listo para plantillas. */
export function icon(name: string, size = 22, stroke = 2): string {
  const node = ICONS[name] ?? MessageCircle;
  const children = node.map(([tag, a]) => `<${tag} ${attr(a as Record<string, string>)}/>`).join('');
  return `<svg class="ic" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}
