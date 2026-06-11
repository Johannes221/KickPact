/**
 * Horizontal scrollbarer Galerie-Streifen. Rendert nichts, wenn leer.
 * `teamName` fließt in die alt-Texte (SEO + Screenreader).
 */
export function GalleryStrip({
  images,
  teamName
}: {
  images: { id: string; url: string }[];
  teamName: string;
}) {
  if (images.length === 0) return null;
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
        Galerie
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.id}
            src={img.url}
            alt={`Mannschaftsfoto ${teamName} – Bild ${i + 1}`}
            className="h-24 w-36 flex-none rounded-xl object-cover"
          />
        ))}
      </div>
    </section>
  );
}
