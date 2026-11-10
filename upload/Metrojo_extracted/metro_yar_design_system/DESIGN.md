---
name: Metro Yar Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#424751'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#727782'
  outline-variant: '#c2c6d3'
  surface-tint: '#1a5eac'
  primary: '#00417f'
  on-primary: '#ffffff'
  primary-container: '#0d58a6'
  on-primary-container: '#b6d0ff'
  inverse-primary: '#a8c8ff'
  secondary: '#bc000c'
  on-secondary: '#ffffff'
  secondary-container: '#e32220'
  on-secondary-container: '#fffbff'
  tertiary: '#004c28'
  on-tertiary: '#ffffff'
  tertiary-container: '#006638'
  on-tertiary-container: '#6ae79a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a8c8ff'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#004689'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4aa'
  on-secondary-fixed: '#410001'
  on-secondary-fixed-variant: '#930007'
  tertiary-fixed: '#7efbac'
  tertiary-fixed-dim: '#61de92'
  on-tertiary-fixed: '#00210e'
  on-tertiary-fixed-variant: '#00522c'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  headline-xl:
    fontFamily: Vazirmatn
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 44px
  headline-lg:
    fontFamily: Vazirmatn
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Vazirmatn
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 30px
  title-lg:
    fontFamily: Vazirmatn
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Vazirmatn
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Vazirmatn
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Vazirmatn
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Vazirmatn
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Vazirmatn
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Vazirmatn
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Vazirmatn
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for civic mobility, high-stress transit environments, and rapid glanceability in Iran's major metropolitan transit hubs (Tehran, Karaj, Mashhad, Isfahan). Transit riders access the app while walking through crowded corridors, stepping onto moving trains, or needing immediate multi-line transfer directions. 

The aesthetic is **Modern Civic Wayfinding**: hyper-legible, functional, and uncluttered. It merges contemporary Swiss-style transit information architecture with native Persian typographic harmony. The experience evokes reliability, speed, and calm navigation. 

Key principles:
- **Instant Glanceability:** High visual hierarchy allows commuters to decode lines, interchange nodes, arrivals, and facilities in under 2 seconds.
- **RTL-First Flow:** Flawless right-to-left optical balancing, mirroring information nodes, line progress paths, and icon indicators natively.
- **Wayfinding Identity:** Directly integrates the standardized chromatic identity of Iranian transit lines (Tehran Lines 1–7 and regional networks) into interactive wayfinding tokens.

## Colors

The core system uses a commanding transit navy (`#0D58A6`) as its primary color to ground navigation headers, active states, and structural UI elements. Secondary and tertiary colors represent core transit network lines: Line 1 Red (`#E52421`) and Line 4 Green (`#009E5A`). 

### Specialized Metro Transit Line Palette
In transit wayfinding, color carries semantic line-identification weight. The palette provides designated line tokens:
- **Line 1 (Red / تجریش - کهریزک):** `#E52421`
- **Line 2 (Dark Blue / صادقیه - فرهنگسرا):** `#15397A`
- **Line 3 (Cyan / قائم - آزادگان):** `#00A3E0`
- **Line 4 (Yellow / شهید کلاهدوز - ارم سبز):** `#F6B400`
- **Line 5 (Green / صادقیه - گلشهر کرج):** `#009640`
- **Line 6 (Pink / دولت‌آباد - شهید آرمان علی‌وردی):** `#D82572`
- **Line 7 (Violet / بسیج - میدان کتاب):** `#7D2382`

### Surfaces & Neutrals
- **Background Default:** `#F8FAFC` (Slate-50) creates crisp contrast without harsh pure white glare.
- **Surface Elevation 1 (Cards):** `#FFFFFF`
- **Border / Divider:** `#E2E8F0`
- **Text Primary:** `#0F172A`
- **Text Secondary:** `#475569`
- **Text Subtle / Muted:** `#94A3B8`

## Typography

Typography uses **Vazirmatn**, a typeface specifically engineered for digital interfaces and Persian/Arabic script legibility. It provides open counters, balanced ascenders/descenders, and Persian numerical figures essential for timetable departures, line numbering, and platform indices.

- **RTL Baseline Alignment:** Persian text requires balanced line-heights (1.5–1.6× font size) to avoid clipping diacritics and dots (`aerab` and points).
- **Numerals:** Ensure OpenType Persian numerals (`locl` / `fars`) are active by default across all train arrival timers, line codes, and station metrics.
- **Wayfinding Hierarchy:** Station names utilize `title-lg` or `headline-md` in bold weights (`fontWeight: 700`), ensuring rapid reading at arm's length.

## Layout & Spacing

The layout is built on a mobile-first, 4-column grid for mobile screens (<600px), transitioning to 8 columns for tablets. 

- **Outer Margins:** Fixed `1rem` (16px) margin ensures content remains clear of phone edge bezels and single-hand thumb reaches.
- **RTL Spatial Flow:** Spacing follows natural Persian reading rhythm. Leading icons sit at the visual right; trailing arrows and indicators point leftward (`chevron-left` signifies drill-down forward progression).
- **Transit Touch Targets:** Commuters use this app while in transit; all interactive cards, station rows, and line chips maintain a minimum tap target of `48px` height with at least `0.5rem` (8px) vertical separation.

## Elevation & Depth

Visual hierarchy employs low-contrast outlines coupled with ambient transit shadows. This prevents sensory overload while preserving distinct layers for overlays, sheet menus, and dynamic status bars.

- **Flat/Subsurface (Elevation 0):** Background screen `#F8FAFC`, no shadow.
- **Level 1 (Station & Line Cards):** Surface `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 1px 3px rgba(15, 23, 42, 0.05)`.
- **Level 2 (Active/Pressed Card & Modal Sheet):** Surface `#FFFFFF`, shadow `0 4px 14px rgba(15, 23, 42, 0.08)`.
- **Level 3 (Fixed Bottom Navigation Bar & Floating Action Buttons):** Surface `rgba(255, 255, 255, 0.94)` with `backdrop-filter: blur(12px)`, top border `1px solid #E2E8F0`, shadow `0 -4px 16px rgba(15, 23, 42, 0.04)`.

## Shapes

The design system adopts **Level 2 (Rounded)** curvature. 

- **Base Radius (0.5rem / 8px):** Applied to badges, station line badges, text input fields, and alert strips.
- **Large Radius (1rem / 16px):** Applied to primary cards (station cards, city selector drawers, route summary tiles).
- **Full Pill Radius (9999px):** Applied to filter chips (e.g., "خط ۱", "خط ۲"), interchange interchange markers, and floating action triggers.

## Components

### City Selector & Header
A persistent top bar with a streamlined dropdown to switch cities (تهران، کرج، مشهد، اصفهان). Tapping opens a bottom drawer with clean selectable tiles, highlighting the active metro network and total operating lines.

### Metro Line Filter Chips
Horizontally scrollable row (RTL scroll from right to left). Each chip features the line color indicator badge, line number in Persian digits, and terminal station tags (e.g. `[●] خط ۴ - ارم سبز / شهید کلاهدوز`). Selected state fills with the line's designated hex code with white text; unselected sits on `#FFFFFF` with a `1.5px` border matching the line's tone.

### Station List Items & Interchange Nodes
Station lists are rendered as connected topological nodes:
- Right side: Station circular node indicator. Transfer stations display a multi-color ring showing connecting lines.
- Center: Station title (`title-md`), amenities mini-icons (elevator, ATM, parking, bicycle racks, baby care).
- Left side: Next arrival countdown timer (e.g. `۴ دقیقه`) and directional transit arrow (`chevron-left`).

### Station Detail Modal / Sheet
Drill-down view when a user selects a station:
- **Facilities Grid:** 2-column or 3-column pill cards indicating station amenities (پله برقی، آسانسور، خودپرداز، تاکسی درون‌شهری، اتوبوس تندرو).
- **Important Landmarks (مراکز مهم):** Tagged list of hospitals, tourist spots, universities, and shopping centers adjacent to the exits.
- **Timetable & Schedules (زمان‌بندی حرکت):** Two directional tab panels (e.g., به سمت تجریش / به سمت کهریزک) showing first train, last train, and headway frequency.

### Ad Banner Slots (جایگاه بنر تبلیغاتی)
In compliance with the layout wireframe:
- Discrete container (`border-radius: 12px`, background `#F1F5F9`, muted `label-sm` identifier "آگهی").
- Placed non-intrusively below the line header or at the bottom of the station detail view without obstructing navigation buttons.

### Bottom Navigation Bar
RTL order fixed at bottom:
1. **خطوط و نقشه‌ها (Lines & Map):** Interactive metro map and list.
2. **مسیریاب (Trip Planner):** Departure to destination optimal path calculator.
3. **جستجو و امکانات (Search & Facilities):** Finding landmarks and stations.
4. **تنظیمات و دستیار صوتی (Settings & Voice):** Voice commands, notification alerts, and accessibility configs.