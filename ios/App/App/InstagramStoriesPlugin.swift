import Foundation
import Capacitor
import UIKit

/**
 * Direktes Teilen in Instagram Stories (Meta "Sharing to Stories" für iOS):
 * Motiv als `com.instagram.sharedSticker.backgroundImage` ins Pasteboard,
 * dann `instagram-stories://share?source_application=<Meta-App-ID>` öffnen —
 * Instagram liest das Bild aus dem Pasteboard und öffnet den Story-Editor.
 * Umgeht die kaputte Instagram-Share-Extension des generischen Share-Sheets.
 *
 * JS-Gegenstück: lib/platform/instagram.ts. `canOpenURL` braucht den
 * `instagram-stories`-Eintrag unter LSApplicationQueriesSchemes (Info.plist).
 *
 * WICHTIG: Lokale Plugins stehen nicht in der von `cap sync` generierten
 * packageClassList — Registrierung passiert deshalb explizit in
 * MainViewController.capacitorDidLoad() via registerPluginInstance. Dafür
 * implementiert die Klasse CAPBridgedPlugin direkt (kein CAP_PLUGIN-Makro/.m).
 */
@objc(InstagramStoriesPlugin)
public class InstagramStoriesPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "InstagramStoriesPlugin"
  public let jsName = "InstagramStories"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "canShare", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "shareToStory", returnType: CAPPluginReturnPromise)
  ]

  private static let shareURLBase = "instagram-stories://share"

  /// Share-URL mit percent-encodeter App-ID — ein versehentliches Leerzeichen
  /// im Env-Wert darf nicht in einer nil-URL / falschem Query enden.
  private static func shareURL(appId: String) -> URL? {
    var comps = URLComponents(string: shareURLBase)
    comps?.queryItems = [URLQueryItem(name: "source_application", value: appId)]
    return comps?.url
  }

  @objc func canShare(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let url = URL(string: Self.shareURLBase) else {
        call.resolve(["available": false]); return
      }
      call.resolve(["available": UIApplication.shared.canOpenURL(url)])
    }
  }

  @objc func shareToStory(_ call: CAPPluginCall) {
    guard let imageBase64 = call.getString("imageBase64"),
          let imageData = Data(base64Encoded: imageBase64), !imageData.isEmpty else {
      call.reject("imageBase64 required"); return
    }
    guard let appId = call.getString("appId"), !appId.isEmpty else {
      call.reject("appId required"); return
    }
    guard let url = Self.shareURL(appId: appId) else {
      call.reject("invalid share url"); return
    }
    DispatchQueue.main.async {
      guard UIApplication.shared.canOpenURL(url) else {
        call.reject("instagram not installed"); return
      }
      // Meta-Mechanik: Instagram liest das Motiv unmittelbar nach dem open()
      // aus dem Pasteboard (überschreibt dabei zwangsläufig dessen Inhalt);
      // der 5-Minuten-Ablauf verhindert nur, dass es dauerhaft liegen bleibt.
      let items: [[String: Any]] = [
        ["com.instagram.sharedSticker.backgroundImage": imageData]
      ]
      let options: [UIPasteboard.OptionsKey: Any] = [
        .expirationDate: Date().addingTimeInterval(60 * 5)
      ]
      UIPasteboard.general.setItems(items, options: options)
      UIApplication.shared.open(url, options: [:]) { success in
        if success { call.resolve() } else { call.reject("open failed") }
      }
    }
  }
}
