import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
  	extend: {
  		colors: {
  			accent: {
  				DEFAULT: '#01C457',
  				dark: '#00563A',
  				muted: '#D8F5E5'
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
