---
name: LeakShield
description: A warm paper console for a five-view AI privacy gateway.
colors:
  paper: "#f3eee5"
  surface: "#fcf9f3"
  surface-2: "#eae2d6"
  void: "#fcf9f3"
  line: "#d9d0c2"
  line-2: "#e5ddd1"
  line-strong: "#b7ab98"
  fg: "#292722"
  muted: "#625c52"
  faint: "#70695e"
  accent: "#6b6051"
  accent-2: "#80715f"
  accent-soft: "rgba(107, 96, 81, 0.09)"
  ok: "#1f9d6f"
  mask: "#c98612"
  stop: "#dc3f4d"
  hold: "#7c4ff0"
  dark-paper: "#141719"
  dark-surface: "#1c2023"
  dark-surface-2: "#262c30"
  dark-void: "#141719"
  dark-line: "#353d42"
  dark-line-2: "#2d3439"
  dark-line-strong: "#58636b"
  dark-fg: "#f0f2f3"
  dark-muted: "#bac2c7"
  dark-faint: "#9da9b1"
  dark-accent: "#b7c8d3"
  dark-accent-2: "#cddbe4"
  dark-accent-soft: "rgba(183, 200, 211, 0.12)"
  dark-ok: "#4fd1a1"
  dark-mask: "#f2c062"
  dark-stop: "#ff6b78"
  dark-hold: "#b39dff"
typography:
  display:
    fontFamily: '"Inter Tight", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(36px, 4.1vw, 64px)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"Inter Tight", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "20px"
    fontWeight: 500
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14.5px"
    fontWeight: 400
  hero-body:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: 1.7
  conversation:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "15px"
    lineHeight: 1.7
  inspector:
    fontFamily: '"Instrument Serif", ui-serif, Georgia, serif'
    fontSize: "30px"
  compact-counter:
    fontSize: "11px"
  compact-action:
    fontSize: "12px"
  chip:
    fontSize: "12.5px"
  small-control:
    fontSize: "13px"
  table:
    fontSize: "13.5px"
  control:
    fontSize: "14px"
  message-field:
    fontSize: "15.5px"
  mono:
    fontFamily: '"Geist Mono", ui-monospace, monospace'
rounded:
  workspace-field: "20px"
  hero-action: "14px"
  token: "6px"
  button-small: "10px"
  navigation: "11px"
  button: "12px"
  card: "18px"
  conversation-field: "24px"
  pill: "99px"
spacing:
  compact: "8px"
  control-gap: "12px"
  inset: "16px"
  section: "24px"
  medium-gutter: "32px"
  desktop-gutter: "48px"
components:
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.void}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  hero-action:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.void}"
    padding: "14px 18px"
    rounded: "{rounded.hero-action}"
  workspace-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.workspace-field}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  navigation:
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "9px 10px"
---

# Design System: LeakShield

## Overview

**Creative North Star: "Warm Paper Console"**

LeakShield combines a warm paper entrance with a working privacy gateway console. The shipped light theme uses beige surfaces, brown neutral accents, tightly spaced display typography, and a supplied robotic hand and butterfly image. Chat, Incidents, Overview, Approvals, and Eval remain the five navigable views. The dark console palette is preserved.

The entrance is balanced and spacious: equal desktop hero columns, centered mobile copy, and a centered message workspace. Rounded controls and quiet shadows soften the supplied mechanical subject. The photographic subject is separated into independently moving layers. PRODUCT.md records the approved refinement and existing product behavior from the web README and implemented views.

**Key Characteristics:**
- Warm paper and brown neutrals in light mode; preserved dark console surfaces.
- Balanced hero columns and centered mobile content without decorative rules.
- Tight sans-serif display type, readable body text, and monospace technical values.
- Functional semantic color for gateway verdicts.
- Slow subject motion and staggered entrances, with pause and reduced-motion support.

## Colors

The light ambient palette is warm beige with a brown neutral accent; stronger colors communicate gateway state.

### Primary
- **Brown neutral accent:** Links, selected navigation icons, focus outlines, and gateway token treatments use accent and accent-soft.
- **Ink action:** Primary actions use foreground on void; these roles invert with the active theme.

### Secondary
- **Verdict signals:** ok is positive, mask marks redaction, stop marks blocking or risk, and hold marks approval. Dark variants preserve these meanings. Live orb tones are a separate state interpolation in the stylesheet; they do not set the page background.

### Neutral
- **Paper / surface / surface-2:** Page canvas, main containers, and recessed or hover fills.
- **Line / line-2 / line-strong:** Structural dividers, quieter container borders, and emphasized boundaries.
- **Foreground / muted / faint:** Main content, secondary copy, and compact supporting information.
- **Dark variants:** The data-theme="dark" selector remaps the corresponding CSS properties. The frozen evaluation report also uses an always-dark container.

### Named Rules
**The Neutral Atmosphere Rule.** Keep the light page and hero ambient field warm beige; semantic verdict color belongs to functional status indicators and gateway content.

## Typography

**Display Font:** Inter Tight with Inter and sans-serif fallbacks.
**Body Font:** Inter with sans-serif fallbacks.
**Label/Mono Font:** Geist Mono with monospace fallbacks for technical tokens and counters.

Instrument Serif remains in the inspector heading. It is an incumbent local pattern, not the hero display face. All four web families are loaded in index.html.

### Hierarchy
- **Display:** The hero uses the display role from the frontmatter, uppercase copy, and two deliberate lines. At mobile widths it changes to clamp(36px, 8.8vw, 60px).
- **Title:** The workspace greeting uses the title role. The brand uses the same family at 17–18px and weight 600.
- **Body:** The base body role supports console content. Hero descriptions use the hero-body role and a maximum width of 40ch; mobile description text is 13px.
- **Conversation:** Replies use the conversation role; the message field uses 15.5px with a relaxed line height.
- **Technical:** Token pills use the mono family at 0.86em of surrounding text. Compact counters use 11px.
- **Intentional compact scale:** 11px supports counters and mobile starter actions; 12px supports hero actions and inspection links; 12.5px supports chips; 13px supports small controls and greeting support; 13.5px supports tables and secondary copy; 14px supports controls and hero descriptions; 15px supports messages; 15.5px supports message entry. The greeting is 20px and the desktop hero is fluid from 36px to 64px. These observed roles are intentional, not a single universal scale.

## Layout

At the desktop lg breakpoint (1024px), a sticky full-height sidebar occupies 264px beside the main column. Below it, navigation moves into a left drawer and the header occupies 72px. Main horizontal gutters step from 16px to 32px at sm (640px), then 48px at lg.

The empty chat panel has a maximum width of 1152px. Its hero uses equal minmax(0, 1fr) columns with a 32px gap; the scene is 500px high, increasing to 520px from 1280px. Below 768px, these stack with centered copy first and a 320px image scene. There are no decorative circuit lines or hero separators. The opening workspace is centered with margin: 0 auto and capped at 860px; conversations are capped at 760px and monitoring views at 1180px. Starter actions are centered on desktop and become undivided grid rows on mobile.

Spacing is compact inside controls and generous between major regions. Preserve the existing five-view navigation, inspection drawers, and message workflow when extending visual surfaces.

## Elevation & Depth

Depth comes from tonal separation, one-pixel borders, translucent sticky chrome, and diffuse shadows. Cards and drawers retain the incumbent shadow vocabulary; the opening workspace field uses its own soft resting shadow and accent focus ring. The hero is grounded by the supplied image and open space. Orb halo and floor shadow are disabled by the final overrides, while its internal shading remains.

### Shadow Vocabulary
- **Ambient:** The source --shadow property supports cards, selected navigation, and compact controls.
- **Raised:** The source --shadow-lg property supports conversation composition and transient feedback.

Exact light and dark shadow values live in the sidecar. Pointer-following card lighting is a subtle radial accent overlay, rather than an offset edge.

## Shapes

The entrance uses a rounded hero action (14px) and composer (20px), integrated with the incumbent rounded console controls. Small buttons remain 10px, navigation and icon controls 11px, standard buttons 12px, cards 18px, conversation fields 24px, and tags pill-shaped (99px). Token inserts use 6px corners. Keep these component roles distinct rather than forcing a universal radius.

## Components

### Buttons
The working console uses quiet, compact controls. Primary and ghost variants share their frontmatter geometry; ghost controls add a line border. Hover mixes the primary foreground toward paper or strengthens the ghost border. Active controls scale to 0.97; disabled controls use 0.45 opacity. Small buttons use 7px 13px padding and the small radius. The hero action uses rounded corners, moves upward 2px with a soft shadow on hover, scales to 0.98 on press, and disables at 0.5 opacity. Its arrow shifts 4px smoothly; starter and inspection arrows shift 3px.

### Chips
Chips are outlined, muted, and pill-shaped. Verdict tags add a six-pixel current-color dot and a 12% tinted background; their meaning is carried by text as well as color.

### Cards / Containers
Cards use the surface role, a one-pixel quiet border, the card radius, and ambient depth. Padding belongs to the consuming component rather than a global card padding rule. The always-dark evaluation panel is a retained exception to theme-following surfaces.

### Inputs / Fields
The opening field uses the workspace-field role, a line border, soft resting shadow, and accent border with a two-pixel soft focus ring. Its shadow and border transition over 300ms. Conversation composition uses the conversation-field radius, raised shadow, translucent surface, and a rotating border visible on focus or while busy. Textareas remain multiline. Send uses a circular foreground button; it enlarges on hover and dims when unavailable. Global focus-visible outlines are two pixels with four-pixel offset.

### Navigation
Navigation items retain text and SVG icons with a sliding surface pill behind the active page. Hover uses a separate surface-2 layer. Active items use foreground text and theme accent icons. Mobile navigation is the same view set inside a drawer. Icon transforms and spring transitions support interaction without changing the layout.

### Robotic hand and butterfly
The supplied /art/robotic-hand-reference.png is clipped inside an SVG into the hand and two wing layers. The arm offers gently over ten seconds, reaching a two-degree rotation and eight-pixel rise. The butterfly follows a ten-second return path, peaking at 120px upward and 72px sideways in SVG coordinates. Wings flutter every 1.4 seconds. A pause/play button stops all scene animations; the component also pauses while outside the viewport or when the document is hidden. Reduced motion disables animation and hides the motion control. Dark mode inverts the image and switches blending from multiply to screen.

The hero title lines enter over 850ms with a 90ms stagger. Description entry lasts 750ms after 140ms; the action fades over 750ms after 220ms so its hover transform stays independent. The centered workspace enters over 800ms after 200ms, the illustration over 1100ms, and starter items over 600ms with 40ms stagger beginning at 220ms. State changes use the existing soft and spring easings. Reduced motion removes these entrances as well as continuous scene movement.

### Named Rules
**The Motion Consent Rule.** Keep the scene pause control and the global reduced-motion override when reusing the moving subject.

## Do's and Don'ts

### Do:
- **Do** use warm paper, surface, and line roles for the light ambient canvas.
- **Do** preserve semantic labels alongside colored gateway verdicts.
- **Do** use balanced desktop hero columns and centered mobile copy and opening workspace.
- **Do** preserve pause, offscreen suspension, and reduced-motion behavior for the hero subject.

### Don't:
- **Don't** reintroduce purple or yellow ambient illumination to the hero or page background.
- **Don't** add decorative circuit lines, hero dividers, or asymmetric entrance layouts.
- **Don't** replace the supplied robotic hand and butterfly with an unrelated subject.
- **Don't** use the hero display size for operational tables or message content.

Not canonized: the existing uppercase tracking-heavy labels used as eyebrows on some console surfaces are carried by the build, but are not a reusable house-style rule. This focused documentation pass does not repair source defects or unrelated pre-existing drift.
