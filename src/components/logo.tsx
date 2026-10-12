import { LOGO_MARK } from "./logo-mark";

/** The Ntoma woven-cloth mark. Takes its colour from the surrounding text colour. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return <svg viewBox="0 0 256 256" aria-hidden className={className} dangerouslySetInnerHTML={{ __html: LOGO_MARK }} />;
}
