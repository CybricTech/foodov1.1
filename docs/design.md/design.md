---
name: Aura Culinary
colors:
  surface: '#fff8f8'
  surface-dim: '#e1d8d9'
  surface-bright: '#fff8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fbf1f2'
  surface-container: '#f5eced'
  surface-container-high: '#efe6e7'
  surface-container-highest: '#e9e0e1'
  on-surface: '#1e1b1c'
  on-surface-variant: '#4b4450'
  inverse-surface: '#342f30'
  inverse-on-surface: '#f8efef'
  outline: '#7c7482'
  outline-variant: '#cdc3d2'
  surface-tint: '#7449a5'
  primary: '#220043'
  on-primary: '#ffffff'
  primary-container: '#3c096c'
  on-primary-container: '#a97cdc'
  inverse-primary: '#dbb8ff'
  secondary: '#785a00'
  on-secondary: '#ffffff'
  secondary-container: '#fcc426'
  on-secondary-container: '#6d5200'
  tertiary: '#300700'
  on-tertiary: '#ffffff'
  tertiary-container: '#531200'
  on-tertiary-container: '#ff5720'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#efdbff'
  primary-fixed-dim: '#dbb8ff'
  on-primary-fixed: '#2b0053'
  on-primary-fixed-variant: '#5b308c'
  secondary-fixed: '#ffdf9a'
  secondary-fixed-dim: '#f6be1f'
  on-secondary-fixed: '#251a00'
  on-secondary-fixed-variant: '#5a4300'
  tertiary-fixed: '#ffdbd1'
  tertiary-fixed-dim: '#ffb59f'
  on-tertiary-fixed: '#3b0a00'
  on-tertiary-fixed-variant: '#862200'
  background: '#fff8f8'
  on-background: '#1e1b1c'
  surface-variant: '#e9e0e1'
typography:
  h1:
    fontFamily: Epilogue
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Epilogue
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

The design system for the product centers on a "Midnight Gourmet" aesthetic. It targets a sophisticated audience that views cooking and dining as an elevated, sensory experience rather than a chore. The brand personality is enigmatic yet welcoming, blending the precision of a high-end kitchen with the warmth of a social dining club.

The visual style utilizes a **Minimalist-Premium** approach. It leverages expansive white space (or deep tonal space) to allow high-quality food photography to take center stage. Elements are structured with a rigorous geometric logic, but softened by organic curves found in the typography and component corners, creating a balance between architectural precision and culinary fluidity.

## Colors

The palette is anchored by the deep purple spectrum, moving from the near-black depth of `#10002B` to the ethereal lightness of `#E0AAFF`. **Royal Purple (#3C096C)** serves as the primary brand anchor, providing a regal, high-contrast foundation for navigation and key actions.

To ensure the "food-focused" aspect remains appetizing, the system introduces two high-energy accents: **Saffron Gold (#FFC629)** and **Sunset Orange (#FF4900)**. These colors are used sparingly for CTAs and status indicators to stimulate appetite and draw immediate visual interest. The background is a warm, off-white **"Parchment" (#FCFAF8)** to prevent the interface from feeling cold or clinical.

## Typography

The typography strategy pairs the distinctive, geometric personality of **Epilogue** with the modern, approachable clarity of **Plus Jakarta Sans**. 

Headlines use Epilogue with tight letter-spacing to create a bold, editorial feel reminiscent of high-end culinary magazines. Body text relies on Plus Jakarta Sans for its exceptional readability and friendly open counters, ensuring that long recipes or descriptions are easy to digest. Small labels and metadata utilize an uppercase treatment with increased tracking to maintain a premium, organized appearance.

## Layout & Spacing

The system employs a **Fixed-Fluid Hybrid Grid**. Content is housed within a 12-column grid with a maximum width of 1280px for desktop screens, while margins and gutters adapt fluidly on smaller devices. 

A 8px baseline rhythm governs all vertical spacing, ensuring a consistent cadence between text elements and images. Generous "breathing room" (the `lg` and `xl` units) is prioritized between major sections to emphasize the premium nature of the brand, preventing the UI from feeling cluttered.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layering** rather than traditional heavy shadows. Surfaces sit on distinct planes defined by subtle color shifts within the purple and neutral scales.

When depth is required for interactive overlays or modals, the system uses **Ambient Shadows**: extremely soft, diffused shadows with a subtle purple tint (`rgba(16, 0, 43, 0.08)`). This ensures the elevation feels like a natural part of the brand environment. Elements that require focus may also use a **Glassmorphism** effect—a subtle backdrop blur (12px) with a semi-transparent white border to simulate polished kitchen surfaces.

## Shapes

The shape language is **Refined-Organic**. A default corner radius of `0.5rem` (8px) is applied to standard components like input fields and buttons. Larger containers, such as product cards and content sections, utilize a more pronounced `1rem` (16px) radius to soften the visual impact and mirror the organic forms found in food. 

Circular shapes are reserved exclusively for avatars and floating action buttons to signify high interactivity.

## Components

### Buttons
- **Primary:** Solid `#3C096C` with white text. High-emphasis actions use a subtle gradient transition to `#5A189A` on hover.
- **Secondary:** Outlined with a 1.5px border of `#3C096C`.
- **Accent:** Solid `#FFC629` with `#231F20` text for critical conversion points like "Order Now."

### Cards
Cards utilize the `rounded-lg` (16px) radius with a subtle 1px border in a light purple tint (`#E0AAFF`). Food imagery within cards should always use a "top-down" or "macro" perspective to highlight texture.

### Inputs & Forms
Form fields are designed with minimal borders and a `#FCFAF8` background. The active state is indicated by a 2px bottom-border in `#7B2CBF` and a subtle rise in elevation.

### Specialized Components
- **Ingredient Chips:** Small, rounded-pill tags used for dietary filters, using light tints of the purple scale (e.g., `#C77DFF` background with `#240046` text).
- **Recipe Step Indicators:** Large, low-opacity Epilogue numerals positioned in the background to guide users through culinary processes without cluttering the foreground.