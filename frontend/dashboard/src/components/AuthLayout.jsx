import Icon from "./Icon";
import { useLanguage } from "../context/LanguageContext";

/** The frame shared by sign-in, sign-up and onboarding: the deep hero
 * backdrop, the brand mark, and one centred glass card. `wide` is for
 * onboarding, whose steps carry more than two fields. */
export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-margin-mobile py-xl font-body-md text-body-md">
      <div className="app-backdrop app-backdrop-hero" aria-hidden="true" />

      <div className="flex items-center gap-3 mb-lg text-white">
        <span className="icon-orb w-12 h-12 bg-gradient-to-br from-secondary-fixed to-secondary-fixed-dim text-on-secondary-fixed border-white/60">
          <Icon name="bolt" fill style={{ fontSize: "26px" }} />
        </span>
        <div>
          <p className="font-headline-md text-[26px] leading-8 font-bold">EnergiBox</p>
          <p className="font-label-sm text-label-sm text-white/70">{t("shell.tagline")}</p>
        </div>
      </div>

      <div className={`glass-hero rounded-3xl w-full ${wide ? "max-w-lg" : "max-w-md"} p-lg text-white`}>
        {title && (
          <h1 className="font-headline-md text-headline-md font-semibold text-center">{title}</h1>
        )}
        {subtitle && (
          <p className="text-center text-white/75 mt-2 font-body-md text-body-md">{subtitle}</p>
        )}
        <div className={title || subtitle ? "mt-lg" : ""}>{children}</div>
      </div>

      {footer && <div className="mt-md text-white/80 font-body-md text-body-md">{footer}</div>}
    </div>
  );
}

/** A labelled field with a leading icon, for the hero card. */
export function HeroField({ icon, trailing, className = "glass-input-hero pl-11 pr-11", ...inputProps }) {
  return (
    <div className="relative">
      <Icon
        name={icon}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none"
        style={{ fontSize: "20px" }}
      />
      <input className={className} {...inputProps} />
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}

/** The error line under a hero form. */
export function HeroError({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-error/25 border border-error-container/40 px-3 py-2 text-white text-[14px] leading-5"
    >
      <Icon name="error" style={{ fontSize: "18px" }} className="mt-px text-error-container" />
      <span>{children}</span>
    </p>
  );
}
