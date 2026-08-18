import Foundation
import Capacitor
import AuthenticationServices

/**
 * WebAuthPlugin — bridge to `ASWebAuthenticationSession`, Apple's
 * dedicated OAuth primitive.
 *
 * Why not just open SFSafariViewController (@capacitor/browser)? Because
 * `SFSafariViewController` silently blocks 302 redirects to custom URL
 * schemes — when the OAuth server responds with
 * `Location: cumora://auth#token=...`, Safari drops it and the app
 * never sees the callback. `ASWebAuthenticationSession` is explicitly
 * designed for OAuth: you hand it a start URL and a callback URL
 * scheme, and the system delivers the final callback URL straight back
 * to your code — no manual deep-link plumbing required.
 *
 * Exposed JS API (registered as plugin `WebAuth`):
 *
 *   await WebAuth.start({
 *     url: "https://api.cumora.ai/api/auth/start/google?return=cumora%3A%2F%2Fauth",
 *     callbackScheme: "cumora"
 *   })
 *   // resolves with `{ callbackUrl: "cumora://auth#token=...&companyId=..." }`
 *   // or rejects on user cancel.
 */
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {

    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var currentSession: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing or invalid 'url'")
            return
        }
        guard let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("Missing 'callbackScheme'")
            return
        }
        NSLog("[Cumora] WebAuth.start url=%@ scheme=%@", url.absoluteString, scheme)

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: scheme
            ) { callbackUrl, error in
                if let error = error {
                    let nsError = error as NSError
                    if nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.reject("canceled", "USER_CANCELLED")
                    } else {
                        call.reject("auth session failed: \(error.localizedDescription)", "SESSION_ERROR")
                    }
                    return
                }
                guard let callbackUrl = callbackUrl else {
                    call.reject("auth session returned no callback URL", "NO_CALLBACK")
                    return
                }
                NSLog("[Cumora] WebAuth.start callbackUrl=%@", callbackUrl.absoluteString)
                call.resolve(["callbackUrl": callbackUrl.absoluteString])
            }
            // iOS 13+ requires a presentation context provider for the
            // system to know which window to anchor the auth UI to.
            session.presentationContextProvider = self
            // Ephemeral=false so the user sees their existing browser
            // cookies — they don't have to re-enter Google's password
            // every sign-in.
            session.prefersEphemeralWebBrowserSession = false
            self.currentSession = session
            if !session.start() {
                call.reject("could not start auth session", "START_FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Walk up to the active foreground key window. Capacitor builds
        // its window in the SceneDelegate / AppDelegate; this is the same
        // window we present the WKWebView in.
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
           let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }
}
