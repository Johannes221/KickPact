import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
  	extend: {
  		colors: {
  			// `accent` = Tint: AUSSCHLIESSLICH interaktiv (Links, aktiver Tab, Back,
  			// Buttons). Niemals für Status — dafür `success` / `brand.alert-red`.
  			accent: {
  				DEFAULT: '#01C457',
  				dark: '#00563A',
  				muted: '#D8F5E5'
  			},
  			// `success` = positiver Status (SIEG, positive Beträge, „bezahlt").
  			// Bewusst ein TIEFERES, wärmeres Grün als die Neon-Tint #01C457, damit
  			// „anklickbar" und „positiv" auch optisch unterscheidbar sind.
  			success: {
  				DEFAULT: '#1F9D57',
  				dark: '#0E7A40',
  				muted: '#DCF3E5'
  			},
  			brand: {
  				primary: '#01C457',
  				'dark-green': '#00563A',
  				'night-navy': '#1A1A2E',
  				'alert-red': '#FF3127',
  				'off-white': '#F5F8F5',
  				neutral: '#CDD2D1'
  			},
  			// iOS system semantics — used for the native-shell app surfaces.
  			// Brand accents (accent/#01C457, night-navy, alert-red) stay the lead
  			// colors; these only supply the neutral chrome iOS expects: grouped
  			// backgrounds, hairline separators, translucent fills.
  			ios: {
  				bg: '#F2F2F7', // systemGroupedBackground
  				card: '#FFFFFF', // secondarySystemGroupedBackground
  				// Text/Label-Hierarchie. `label` = primär (= brand.night-navy, hält
  				// den bestehenden Look), secondary/tertiary = gedimmt für Subtitle/
  				// Captions. Das sind die offiziellen Text-Tokens (primary/secondary/
  				// tertiary) — keine rohen Opacity-Werte mehr in den Screens.
  				label: '#1A1A2E', // primary label (brand-night-navy)
  				'label-secondary': 'rgba(60, 60, 67, 0.6)',
  				'label-tertiary': 'rgba(60, 60, 67, 0.3)',
  				'label-quaternary': 'rgba(60, 60, 67, 0.18)',
  				separator: 'rgba(60, 60, 67, 0.29)',
  				'separator-opaque': '#C6C6C8',
  				fill: 'rgba(120, 120, 128, 0.2)',
  				'fill-secondary': 'rgba(120, 120, 128, 0.16)',
  				'fill-tertiary': 'rgba(118, 118, 128, 0.12)',
  				blue: '#007AFF',
  				gray: '#8E8E93'
  			}
  		},
  		// iOS-Typo-Skala (SF Pro). Größe + Line-Height + Default-Weight + Tracking
  		// in EINEM Token — Screens schreiben `text-ios-title2` statt
  		// `text-2xl font-bold tracking-tight`. Große Titel bekommen leicht
  		// negatives Tracking wie SF Pro Display.
  		fontSize: {
  			'ios-large-title': ['34px', { lineHeight: '41px', fontWeight: '700', letterSpacing: '-0.5px' }],
  			'ios-title1': ['28px', { lineHeight: '34px', fontWeight: '700', letterSpacing: '-0.4px' }],
  			'ios-title2': ['22px', { lineHeight: '28px', fontWeight: '700', letterSpacing: '-0.3px' }],
  			'ios-title3': ['20px', { lineHeight: '25px', fontWeight: '600', letterSpacing: '-0.2px' }],
  			'ios-headline': ['17px', { lineHeight: '22px', fontWeight: '600' }],
  			'ios-body': ['17px', { lineHeight: '22px', fontWeight: '400' }],
  			'ios-callout': ['16px', { lineHeight: '21px', fontWeight: '400' }],
  			'ios-subhead': ['15px', { lineHeight: '20px', fontWeight: '400' }],
  			'ios-footnote': ['13px', { lineHeight: '18px', fontWeight: '400' }],
  			'ios-caption': ['12px', { lineHeight: '16px', fontWeight: '400' }],
  			'ios-caption2': ['11px', { lineHeight: '13px', fontWeight: '400' }]
  		},
  		boxShadow: {
  			'ios-card': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  			'ios-elevated': '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)'
  		},
  		fontFamily: {
  			display: [
  				'var(--font-display)',
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			],
  			sans: [
  				'var(--font-sans)',
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			]
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: []
};

export default config;
