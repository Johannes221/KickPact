import UIKit
import WebKit
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

    // Steuert die Status-Bar: solange der Navy-Ladescreen sichtbar ist, helle
    // Icons; sobald das helle App-UI gerendert hat, dunkle Icons.
    private var webContentLoaded = false

    // Lokale Capacitor-Plugins hier registrieren: `cap sync` schreibt nur die
    // npm-Plugins in die packageClassList (capacitor.config.json) — ohne diese
    // explizite Registrierung bekommt das WebView keinen PluginHeader und
    // Capacitor.isPluginAvailable("InstagramStories") wäre in JS immer false.
    //
    // JEDES lokale Plugin MUSS hier stehen. IAPPlugin fehlte hier (2026-07-16) —
    // die Klasse war einkompiliert (per `nm` am Archive verifiziert) und
    // CAP_PLUGIN(IAPPlugin, ...) korrekt, aber ohne registerPluginInstance kennt
    // die Bridge sie nicht und rejectet jeden Aufruf mit „not implemented".
    // Der In-App-Kauf war dadurch in JEDEM Build tot.
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(IAPPlugin())
        bridge?.registerPluginInstance(InstagramStoriesPlugin())
    }

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

        // Ladefortschritt beobachten, um beim Erscheinen des hellen App-UIs die
        // Status-Bar von hell (auf Navy) auf dunkel (auf Off-White) umzuschalten.
        webView.addObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress), options: .new, context: nil)
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?,
                               change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        guard keyPath == #keyPath(WKWebView.estimatedProgress),
              let progress = webView?.estimatedProgress, progress >= 1.0,
              !webContentLoaded else {
            return
        }
        webContentLoaded = true
        setNeedsStatusBarAppearanceUpdate()
    }

    // Das App-UI ist durchgehend hell (Off-White), darum dunkle Status-Bar-Icons,
    // unabhängig vom System-Dark-Mode. Während des Navy-Ladescreens (bevor das UI
    // gerendert hat) helle Icons, damit sie auf dem dunklen Grund lesbar bleiben.
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return webContentLoaded ? .darkContent : .lightContent
    }

    deinit {
        webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress))
    }
}
