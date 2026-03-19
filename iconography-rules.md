### Iconography Rules
- **Style:** Always use flat, minimalist SVG icons. No gradients, shadows, or 3D effects.
- **Implementation:** Use inline SVGs or a library like `lucide-react` (if React) or `heroicons`. Do NOT use `<img>` tags for icons.
- **Coloring:** Icons must be colorable via CSS. Use `currentColor` for the SVG `fill` or `stroke`. 
- **Brand Integration:** Apply brand colors using Tailwind classes (e.g., `text-brand-primary`) or CSS variables (e.g., `var(--brand-color)`).
- **Size:** Default to 24x24px (w-6 h-6 in Tailwind) unless specified otherwise.