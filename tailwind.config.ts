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
  			}
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
