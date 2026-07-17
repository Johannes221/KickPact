# KickPact runtime image — based on Microsoft Playwright (Ubuntu Jammy)
# because the Fußball.de crawler uses headless Chromium. The Playwright base
# image bundles Chromium + all system libs, so we don't need to apt-install
# anything manually.

FROM mcr.microsoft.com/playwright:v1.48.2-jammy AS deps
WORKDIR /app

# Install Node deps with the same --legacy-peer-deps override that Coolify uses
# (drizzle-kit/orm vs better-auth peer-dep mismatch — fix later by upgrading both).
# patches/ muss vor `npm ci` da sein, sonst läuft der postinstall-Hook
# (patch-package) ins Leere und exitet still mit 0 — das Image hätte dann
# ungepatchte Dependencies, ohne dass der Build fehlschlägt.
COPY package.json package-lock.json* ./
COPY patches ./patches
RUN npm ci --legacy-peer-deps

# ---------- Builder ----------
FROM mcr.microsoft.com/playwright:v1.48.2-jammy AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars need to be in scope here for Next.js prerender pages
# (Coolify passes ENV vars during build automatically).
ENV NEXT_TELEMETRY_DISABLED=1
# next build überschritt das Node-Default-Heap-Limit (~2 GB) → OOM (exit 134).
# Heap anheben, damit der Build mit dem gewachsenen Codebase durchläuft.
ENV NODE_OPTIONS="--max-old-space-size=4096"
# DATABASE_URL/RESEND_API_KEY/MAIL_FROM werden vom Build nur auf PRÄSENZ geprüft
# (Module-Load-Throws in lib/db/client.ts + lib/mail/client.ts) — postgres()
# verbindet lazy, new Resend() validiert nicht. Mit den Platzhaltern hier dürfen
# die echten Secrets in Coolify auf "Build Variable = aus" stehen und landen
# damit nicht mehr im Klartext im Deployment-Log. `:-` greift nur, wenn die Var
# leer/ungesetzt ist: ein echter Wert (z.B. lokal, CI) gewinnt weiterhin.
RUN DATABASE_URL="${DATABASE_URL:-postgres://build:build@127.0.0.1:5432/build}" \
    RESEND_API_KEY="${RESEND_API_KEY:-re_build_placeholder}" \
    MAIL_FROM="${MAIL_FROM:-build@example.invalid}" \
    npm run build

# ---------- Runner ----------
FROM mcr.microsoft.com/playwright:v1.48.2-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# UTC explizit pinnen: die App rechnet Monats-/Saison-Grenzen teils lokalzeit-
# basiert. Ohne festes TZ hängt die Korrektheit am Default des Base-Images.
ENV TZ=UTC

# Copy built app + production node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/scripts ./scripts
# Help-Center liest Markdown via fs.readdir aus docs/help-center/articles/.
# Ohne diese Zeile crashed /hilfe mit ENOENT zur Runtime.
COPY --from=builder /app/docs/help-center ./docs/help-center

EXPOSE 3000
CMD ["npm", "start"]
