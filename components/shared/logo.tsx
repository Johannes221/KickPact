"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "mark" | "full" | "tagline";
  className?: string;
  href?: string | null; // null = nicht klickbar
}

/**
 * KickPact Logo
 *
 * - `mark`: nur das K-Icon (square)
 * - `full`: K-Mark + KICKPACT Wordmark (horizontal-ish, default für Header)
 * - `tagline`: full + "Mehr als ein Spiel" Tagline darunter
 */
export function Logo({ variant = "full", className, href = "/" }: LogoProps) {
  const content =
    variant === "mark" ? (
      <MarkSvg className="h-10 w-10 text-accent" />
    ) : (
      <div className="flex items-center gap-2.5">
        <MarkSvg className="h-9 w-9 text-accent shrink-0" />
        <div className="flex flex-col leading-none">
          <span className="font-display font-black text-brand-night-navy text-xl tracking-tight">
            <span>KICK</span>
            <span className="text-accent">PACT</span>
          </span>
          {variant === "tagline" && (
            <span className="mt-0.5 text-[0.55rem] uppercase tracking-[0.2em] text-accent font-semibold">
              Mehr als ein Spiel
            </span>
          )}
        </div>
      </div>
    );

  if (href === null) return <div className={cn("inline-flex", className)}>{content}</div>;

  return (
    <Link href={href} className={cn("inline-flex", className)}>
      {content}
    </Link>
  );
}

function MarkSvg({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1254 1254"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="KickPact"
      className={className}
    >
      <g transform="translate(0,1254) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M4016 9313 c-8 -26 -86 -414 -435 -2158 -171 -852 -385 -1920 -476 -2373 -90 -453 -164 -834 -163 -847 1 -13 7 -21 13 -17 12 8 292 242 396 331 42 36 132 114 200 172 139 118 648 553 955 815 317 271 694 584 703 584 4 0 51 -57 103 -127 52 -71 278 -375 503 -678 224 -302 471 -634 549 -737 l141 -188 898 0 c861 0 898 1 885 18 -17 23 -29 39 -993 1327 -987 1319 -1015 1357 -1015 1372 0 6 57 63 128 126 154 139 811 724 1092 972 513 453 1430 1271 1535 1368 l60 56 -869 1 -869 0 -91 -82 c-50 -46 -221 -203 -381 -349 -159 -146 -344 -315 -410 -375 -192 -176 -821 -750 -1050 -958 -115 -105 -267 -244 -336 -308 -70 -65 -131 -118 -136 -118 -5 0 -1 35 9 78 183 788 468 2063 468 2093 0 18 -25 19 -704 19 -662 0 -705 -1 -710 -17z" />
        <path d="M9220 5735 c-147 -33 -286 -101 -399 -195 -300 -252 -390 -679 -215 -1028 136 -270 395 -413 728 -399 272 11 487 124 649 342 344 460 146 1113 -383 1265 -98 28 -287 36 -380 15z" />
      </g>
    </svg>
  );
}
