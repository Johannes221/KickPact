import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "KickPact — Performance-Sponsoring für Amateurfußball";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0F0F1E",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}
      >
        {/* Background accent glow — top-right */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,69,0,0.22) 0%, rgba(255,69,0,0) 70%)"
          }}
        />
        {/* Background accent glow — bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(1,196,87,0.15) 0%, rgba(1,196,87,0) 70%)"
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(to right, #FF4500, #FF6A30, #01C457)"
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 88px",
            height: "100%"
          }}
        >
          {/* Badge row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 32
            }}
          >
            <div
              style={{
                background: "rgba(1,196,87,0.15)",
                border: "1px solid rgba(1,196,87,0.35)",
                borderRadius: 20,
                padding: "6px 16px",
                color: "#01C457",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase"
              }}
            >
              Performance-Sponsoring
            </div>
            <div
              style={{
                background: "rgba(255,69,0,0.15)",
                border: "1px solid rgba(255,69,0,0.35)",
                borderRadius: 20,
                padding: "6px 16px",
                color: "#FF6A30",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase"
              }}
            >
              Amateurfußball
            </div>
          </div>

          {/* Logo + brand name row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              marginBottom: 20
            }}
          >
            <div style={{ fontSize: 72, lineHeight: 1 }}>⚽</div>
            <div
              style={{
                fontSize: 96,
                fontWeight: 900,
                color: "#F8F7F4",
                letterSpacing: "-0.03em",
                lineHeight: 1
              }}
            >
              Kick
              <span style={{ color: "#FF4500" }}>Pact</span>
            </div>
          </div>

          {/* Accent divider */}
          <div
            style={{
              width: 80,
              height: 5,
              background: "#FF4500",
              borderRadius: 3,
              marginBottom: 28
            }}
          />

          {/* Subtitle */}
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "rgba(248,247,244,0.75)",
              letterSpacing: "-0.01em",
              marginBottom: 16
            }}
          >
            Performance-Sponsoring für Amateurfußball
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#01C457",
                flexShrink: 0
              }}
            />
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#01C457",
                letterSpacing: "0.01em"
              }}
            >
              Weniger als 1 € pro Spieler im Monat.
            </div>
          </div>
        </div>

        {/* Right side — stat badges */}
        <div
          style={{
            position: "absolute",
            right: 88,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "flex-end"
          }}
        >
          {[
            { emoji: "⚽", label: "Pro Tor", value: "5 €" },
            { emoji: "🏆", label: "Pro Sieg", value: "50 €" },
            { emoji: "⬆️", label: "Pro Aufstieg", value: "200 €" }
          ].map(({ emoji, label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(248,247,244,0.06)",
                border: "1px solid rgba(248,247,244,0.12)",
                borderRadius: 12,
                padding: "10px 18px"
              }}
            >
              <span style={{ fontSize: 20 }}>{emoji}</span>
              <span style={{ fontSize: 14, color: "rgba(248,247,244,0.65)", fontWeight: 500 }}>
                {label}
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#FF4500",
                  marginLeft: 4
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "rgba(255,255,255,0.06)"
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
