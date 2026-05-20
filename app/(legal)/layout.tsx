// Layout für Legal-Routes (Impressum/Datenschutz/AGB). AppHeader ist global
// im Root-Layout — hier nur der zentrierte Text-Container. Pages selbst
// definieren ihre Headings.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12">
      {children}
    </main>
  );
}
