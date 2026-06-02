import UIKit
import Capacitor

/// WebView-Host mit Brand-Hintergrund.
///
/// Wichtig: In `CAPBridgeViewController` ist `view === webView` (siehe `loadView()`
/// in Capacitor: `view = webView`). Es gibt also keine View „hinter" dem WebView.
/// Damit beim App-Start (solange die Web-App lädt) und beim Overscroll/Bounce ein
/// Brand-Hintergrund statt einer leeren Fläche erscheint, fügen wir dem WebView eine
/// eigene Hintergrund-View (Navy + zentriertes grünes K) als unterste Subview hinzu
/// und machen den WebView selbst transparent. Der opake helle App-Inhalt deckt den
/// Hintergrund im Normalbetrieb ab — das Branding scheint nur in den Rand-/Lade-
/// Momenten durch.
class MainViewController: CAPBridgeViewController {

    // Brand „night-navy" — identisch zum Splash-Hintergrund (#1A1A2E).
    private let brandNavy = UIColor(red: 0x1A / 255.0,
                                    green: 0x1A / 255.0,
                                    blue: 0x2E / 255.0,
                                    alpha: 1.0)

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let webView = self.webView else { return }

        // Navy-Hintergrund-Panel mit zentriertem grünen K, als unterste Subview
        // des WebViews. Es scrollt nicht mit (Sibling der ScrollView) und füllt
        // die gesamte Fläche.
        let backgroundView = UIView()
        backgroundView.backgroundColor = brandNavy
        backgroundView.translatesAutoresizingMaskIntoConstraints = false

        let logo = UIImageView(image: UIImage(named: "BrandMark"))
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        backgroundView.addSubview(logo)

        webView.insertSubview(backgroundView, at: 0)

        NSLayoutConstraint.activate([
            backgroundView.topAnchor.constraint(equalTo: webView.topAnchor),
            backgroundView.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
            backgroundView.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            backgroundView.trailingAnchor.constraint(equalTo: webView.trailingAnchor),

            logo.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor),
            logo.widthAnchor.constraint(equalTo: backgroundView.widthAnchor, multiplier: 0.30)
        ])

        // WebView + ScrollView transparent: damit das Navy-Panel beim Overscroll
        // (und während des Ladens) durchscheint statt einer weißen/schwarzen Fläche.
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
    }
}
