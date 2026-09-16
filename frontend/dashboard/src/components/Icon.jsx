/** Material Symbols Outlined, loaded as a webfont in index.html.
 *
 * The mockups write `<span class="material-symbols-outlined">name</span>`
 * and set the optical axes through inline `font-variation-settings`. This
 * wraps that so `fill` reads as a prop instead of a style string repeated
 * on every icon. */
export default function Icon({ name, fill = false, weight, className = "", style, ...rest }) {
  const variation = [
    fill ? "'FILL' 1" : "'FILL' 0",
    weight ? `'wght' ${weight}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: variation, ...style }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  );
}
