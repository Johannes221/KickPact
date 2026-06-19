import Foundation
import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin {

  @objc func getProducts(_ call: CAPPluginCall) {
    guard #available(iOS 15.0, *) else {
      call.reject("In-App-Käufe erfordern iOS 15 oder neuer."); return
    }
    guard let ids = call.getArray("productIds", String.self) else {
      call.reject("productIds required"); return
    }
    Task {
      do {
        let products = try await Product.products(for: ids)
        let mapped = products.map { p -> [String: Any] in
          ["productId": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice]
        }
        call.resolve(["products": mapped])
      } catch { call.reject("getProducts failed: \(error)") }
    }
  }

  @objc func purchase(_ call: CAPPluginCall) {
    guard #available(iOS 15.0, *) else {
      call.reject("In-App-Käufe erfordern iOS 15 oder neuer."); return
    }
    guard let productId = call.getString("productId") else {
      call.reject("productId required"); return
    }
    Task {
      do {
        let products = try await Product.products(for: [productId])
        guard let product = products.first else { call.reject("product not found"); return }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
          switch verification {
          case .verified(let transaction):
            let jws = verification.jwsRepresentation
            await transaction.finish()
            call.resolve([
              "originalTransactionId": String(transaction.originalID),
              "jwsRepresentation": jws
            ])
          case .unverified:
            call.reject("transaction unverified")
          }
        case .userCancelled: call.reject("cancelled")
        case .pending: call.reject("pending")
        @unknown default: call.reject("unknown purchase result")
        }
      } catch { call.reject("purchase failed: \(error)") }
    }
  }

  @objc func restore(_ call: CAPPluginCall) {
    guard #available(iOS 15.0, *) else {
      call.reject("In-App-Käufe erfordern iOS 15 oder neuer."); return
    }
    Task {
      var restored: [[String: Any]] = []
      for await result in Transaction.currentEntitlements {
        if case .verified(let transaction) = result {
          restored.append([
            "originalTransactionId": String(transaction.originalID),
            "jwsRepresentation": result.jwsRepresentation
          ])
        }
      }
      call.resolve(["restored": restored])
    }
  }
}
