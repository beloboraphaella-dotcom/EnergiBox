/** A placeholder in the shape of the content that is loading, so a screen
 * shows its layout at once instead of a blank page or a lone spinner. */
export default function Skeleton({ className = "" }) {
  return <div className={"skeleton " + className} aria-hidden="true" />;
}

/** The loading state of a page: a live-region label for screen readers,
 * and the placeholders passed as children for everyone else. */
export function SkeletonPage({ label, children }) {
  return (
    <div role="status" aria-label={label} className="max-w-7xl mx-auto py-lg space-y-lg">
      {children}
    </div>
  );
}
