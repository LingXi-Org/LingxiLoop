import Foundation
import Capacitor
import AuthenticationServices

/**
 * AppleSignInPlugin — bridge to `ASAuthorizationAppleIDProvider`, the
 * native "Sign in with Apple" flow.
 *
 * The Capacitor `@capacitor/browser` + ASWebAuthenticationSession path
 * we use for Google / GitHub works for any OAuth2 provider — but Apple
 * requires that iOS apps use their NATIVE flow when offering "Sign in
 * with Apple" (per App Review Guideline 4.8 and the SIWA
 * documentation). The native flow surfaces the system-styled button
 * + biometric / passcode + Hide-My-Email opt-in that users expect
 * from the platform, and unlike Google's OAuth it returns the
 * identity_token straight back to our process without a redirect.
 *
 * Exposed JS API (registered as plugin `AppleSignIn`):
 *
 *   await AppleSignIn.signIn()
 *   // resolves to:
 *   //   {
 *   //     identityToken: "eyJ..."  // the JWT to send to /auth/apple/native
 *   //     user: "001234.aaaa…"      // Apple's stable user id (== JWT sub)
 *   //     email?: "…@privaterelay.appleid.com"  // first sign-in only
 *   //     name?: "Given Family"                  // first sign-in only
 *   //   }
 *   // rejects on user cancel (code = "USER_CANCELLED") or any other
 *   // ASAuthorizationError (code = "AUTH_FAILED").
 *
 * Email + name are only populated on the user's FIRST sign-in to our
 * app. Subsequent sign-ins return identityToken + user only. The
 * server keys off `user` (== JWT `sub`) for the persistent identity,
 * so the email/name absence is fine after first run.
 */
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var currentController: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        // Only one flow in flight at a time. If JS calls signIn() twice,
        // the second call replaces the first — but we explicitly reject
        // the original so its caller doesn't hang.
        if let prior = self.pendingCall {
            prior.reject("superseded by a newer signIn() call", "SUPERSEDED")
        }
        self.pendingCall = call

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        // .fullName + .email = on first sign-in Apple offers the user
        // the Hide-My-Email picker and returns the name they typed +
        // the (real or relay) email. Subsequent sign-ins ignore the
        // scopes and return just identityToken + user.
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.currentController = controller

        DispatchQueue.main.async {
            controller.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerDelegate

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization auth: ASAuthorization) {
        defer { self.pendingCall = nil; self.currentController = nil }
        guard let call = self.pendingCall else { return }
        guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("unexpected credential type", "BAD_CREDENTIAL")
            return
        }
        guard let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8),
              !token.isEmpty
        else {
            call.reject("no identity token in Apple response", "NO_TOKEN")
            return
        }
        var result: [String: Any] = [
            "identityToken": token,
            "user": credential.user,
        ]
        if let email = credential.email, !email.isEmpty {
            result["email"] = email
        }
        if let name = credential.fullName {
            let combined = [name.givenName, name.familyName]
                .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            if !combined.isEmpty { result["name"] = combined }
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { self.pendingCall = nil; self.currentController = nil }
        guard let call = self.pendingCall else { return }
        let nsErr = error as NSError
        if nsErr.domain == ASAuthorizationError.errorDomain,
           nsErr.code == ASAuthorizationError.canceled.rawValue {
            call.reject("canceled", "USER_CANCELLED")
        } else {
            NSLog("[Cumora] AppleSignIn failed: %@", error.localizedDescription)
            call.reject("apple sign-in failed: \(error.localizedDescription)", "AUTH_FAILED")
        }
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Mirror WebAuthPlugin — walk up to the active foreground key window.
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
           let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }
}
