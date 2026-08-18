import UIKit
import Capacitor

/**
 * MainViewController — custom subclass of `CAPBridgeViewController`
 * whose only job is to register app-local Capacitor plugins (i.e.
 * plugins defined inside this Xcode target, not pulled from npm).
 *
 * Capacitor 8's auto-discovery only sees plugins listed in
 * `CapApp-SPM/Package.swift` dependencies. Plugins added directly to
 * the app target (like our `WebAuthPlugin`) must be registered
 * manually via `bridge?.registerPluginInstance(...)` in
 * `capacitorDidLoad`.
 *
 * Main.storyboard's root view controller class is set to this class
 * (instead of the default `CAPBridgeViewController`) so this hook
 * fires on every launch.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        NSLog("[Cumora] MainViewController.capacitorDidLoad — registering WebAuth, AppleSignIn")
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}
