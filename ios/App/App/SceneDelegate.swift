import UIKit
import Capacitor

/**
 * SceneDelegate — required so `lingxiloop://` deep links reach Capacitor
 * when the app is already running. iOS 13+ delivers URL opens to a
 * running app via `scene(_:openURLContexts:)` (NOT
 * `AppDelegate.application(_:open:)`). Capacitor's `appUrlOpen` event
 * is wired to NSNotificationCenter; we just bridge the scene callback
 * into `ApplicationDelegateProxy` and the JS layer picks it up.
 *
 * Without this class, lingxiloop:// URLs fired while the WebView is in
 * the foreground (e.g. the OAuth redirect from SFSafariViewController)
 * are silently dropped by iOS and our `@capacitor/app` listener never
 * fires. The Swift NSLog below makes the bridge easy to verify in
 * `xcrun simctl spawn booted log stream`.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // The default scene is built from Main.storyboard. We don't need
        // to do anything here besides accept the scene — Capacitor's
        // bridge controller is already wired into the storyboard.
        if let urlContext = connectionOptions.urlContexts.first {
            NSLog("[LingxiLoop] SceneDelegate willConnect url=%@", urlContext.url.absoluteString)
            ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // The hot path — fired when iOS routes a `lingxiloop://...` URL to
        // an already-running app instance. Capacitor's
        // ApplicationDelegateProxy posts the
        // `capacitorOpenURLNotification` that @capacitor/app subscribes
        // to, which becomes the `appUrlOpen` event in JS.
        guard let urlContext = URLContexts.first else { return }
        NSLog("[LingxiLoop] SceneDelegate openURLContexts url=%@", urlContext.url.absoluteString)
        ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneDidBecomeActive(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {}
}
