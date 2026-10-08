# DESIGN SYSTEM: Elite Hospital Doctor Check-in & Roster System

## 1. Visual World & Direction
- **Identity**: Clinical precision, calm authoritative healthcare environment.
- **Atmosphere**: Professional medical institutional confidence, high legibility, clean surfaces, subtle depth.
- **Language**: English primary interface with seamless Arabic typography (Tajawal) for physician names and localized shift descriptors.

## 2. Color Palette & Tokens
| Token | Hex | Role | Contrast vs White |
|---|---|---|:---:|
| `--color-brand-primary` | `#063b30` | Deep forest green; primary CTAs, active headers, key status indicators | 11.5:1 (AAA) |
| `--color-brand-dark` | `#042d24` | Midnight forest green; hover states, pressed states | 14.8:1 (AAA) |
| `--color-brand-accent` | `#084c3e` | Secondary actions, badges, subtle accent strokes | 9.8:1 (AAA) |
| `--color-brand-light` | `#e6f2ee` | Medical mint tint; card backgrounds, tag fills | 1.15:1 (Background) |
| `--color-brand-border` | `#cbdad5` | Sage border tint; cards, table dividers, input borders | 1.4:1 (Border) |
| `--color-brand-surface` | `#fbfdfc` | Off-white medical surface; input background, container fill | 1.02:1 (Surface) |

## 3. Typography
- **Primary Interface**: Inter (`--font-sans`) — crisp, modern humanist sans-serif with high x-height for clinical tabular scanning.
- **Arabic Script**: Tajawal (`.arabic-font`) — high readability, modern geometry, perfectly balanced with Inter.
- **Data & Timestamps**: JetBrains Mono (`--font-mono`) — fixed-width tabular numerals for timestamps, employee IDs, and shift codes.
- **Type Scale**:
  - Display/Title: 20px–24px, font-black / font-extrabold.
  - Section Headings: 14px–16px, font-bold, uppercase tracking-wide.
  - Body / Field Labels: 12px–14px, font-semibold, text-slate-700 (≥ 5:1 contrast).
  - Microcopy / Metadata: 11px–12px, font-medium, text-slate-600 (≥ 4.5:1 contrast).

## 4. Accessibility & Ergonomics
- **Contrast**: All body text, form field labels, and buttons satisfy WCAG 2.1 AA minimum (4.5:1).
- **Target Sizes**: Interactive buttons and icons observe WCAG 2.2 AA target size (≥ 24x24px, optimal 44x44px hit-box).
- **Modal Semantics**: All overlay dialogs carry `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapping, and keyboard `Escape` dismiss.
- **Motion**: `prefers-reduced-motion` suppresses intensive animations for vestibular comfort.
