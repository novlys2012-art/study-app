import UIKit
import Capacitor
import UserNotifications

final class LektoNativeCoordinator {
    static let shared = LektoNativeCoordinator()
    weak var controller: LektoViewController?
    private var pendingSubjectId: String?

    func openSubject(_ raw: String) {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
        guard !raw.isEmpty, raw.count <= 64, raw.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return }
        pendingSubjectId = raw
        deliverPendingSubject()
    }

    func deliverPendingSubject() {
        guard let id = pendingSubjectId, let webView = controller?.webView else { return }
        pendingSubjectId = nil
        let js = "window.__lektoLaunchSubject='\(id)';window.dispatchEvent(new CustomEvent('lekto:open-subject',{detail:{subjectId:'\(id)'}}));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

class LektoViewController: CAPBridgeViewController {
    private var barStyle: UIStatusBarStyle = .darkContent

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return barStyle
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        LektoNativeCoordinator.shared.controller = self
        bridge?.registerPluginInstance(LektoNativePlugin())
        webView?.isOpaque = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        LektoNativeCoordinator.shared.deliverPendingSubject()
    }

    func applyChrome(color: UIColor, dark: Bool) {
        barStyle = dark ? .lightContent : .darkContent
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        setNeedsStatusBarAppearanceUpdate()
    }
}

@objc(LektoNativePlugin)
public class LektoNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LektoNativePlugin"
    public let jsName = "LektoNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setChrome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "minimizeApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reminderPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReminderPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelReminders", returnType: CAPPluginReturnPromise)
    ]

    private let reminderPrefix = "lekto-rem-"

    @objc func setChrome(_ call: CAPPluginCall) {
        let hex = call.getString("color") ?? "#f7f7f5"
        let dark = call.getBool("dark") ?? false
        let color = Self.parseColor(hex) ?? (dark ? UIColor(red: 0.071, green: 0.075, blue: 0.071, alpha: 1) : UIColor(red: 0.969, green: 0.969, blue: 0.961, alpha: 1))
        DispatchQueue.main.async {
            (self.bridge?.viewController as? LektoViewController)?.applyChrome(color: color, dark: dark)
            call.resolve()
        }
    }

    @objc func haptic(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "light"
        DispatchQueue.main.async {
            switch style {
            case "success":
                let gen = UINotificationFeedbackGenerator()
                gen.prepare()
                gen.notificationOccurred(.success)
            case "error":
                let gen = UINotificationFeedbackGenerator()
                gen.prepare()
                gen.notificationOccurred(.error)
            case "selection":
                let gen = UISelectionFeedbackGenerator()
                gen.prepare()
                gen.selectionChanged()
            default:
                let gen = UIImpactFeedbackGenerator(style: .light)
                gen.prepare()
                gen.impactOccurred()
            }
            call.resolve()
        }
    }

    @objc func minimizeApp(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func reminderPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let state: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                state = "granted"
            case .denied:
                state = "denied"
            default:
                state = "prompt"
            }
            call.resolve(["state": state])
        }
    }

    @objc func requestReminderPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["state": granted ? "granted" : "denied"])
        }
    }

    @objc func scheduleReminders(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        let oldIds = (1001...1020).map { "\(reminderPrefix)\($0)" }
        center.removePendingNotificationRequests(withIdentifiers: oldIds)

        guard let items = call.getArray("items", JSObject.self) else {
            call.resolve()
            return
        }

        let now = Date().timeIntervalSince1970
        let group = DispatchGroup()
        for (idx, item) in items.enumerated() {
            let id = (item["id"] as? NSNumber)?.intValue ?? (1001 + idx)
            guard let atMs = (item["atMs"] as? NSNumber)?.doubleValue else { continue }
            let interval = (atMs / 1000.0) - now
            guard interval > 1 else { continue }

            let content = UNMutableNotificationContent()
            content.title = (item["title"] as? String) ?? "Lekto"
            content.body = (item["body"] as? String) ?? ""
            content.sound = .default
            if let subjectId = item["subjectId"] as? String, !subjectId.isEmpty {
                content.userInfo = ["subjectId": subjectId]
            }

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            let req = UNNotificationRequest(identifier: "\(reminderPrefix)\(id)", content: content, trigger: trigger)
            group.enter()
            center.add(req) { _ in group.leave() }
        }
        group.notify(queue: .main) {
            call.resolve()
        }
    }

    @objc func cancelReminders(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        let ids = (1001...1020).map { "\(reminderPrefix)\($0)" }
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
        call.resolve()
    }

    private static func parseColor(_ raw: String) -> UIColor? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") {
            s.removeFirst()
            if s.count == 3 {
                s = s.map { "\($0)\($0)" }.joined()
            }
            guard s.count == 6, let val = UInt64(s, radix: 16) else { return nil }
            let r = CGFloat((val >> 16) & 0xFF) / 255.0
            let g = CGFloat((val >> 8) & 0xFF) / 255.0
            let b = CGFloat(val & 0xFF) / 255.0
            return UIColor(red: r, green: g, blue: b, alpha: 1.0)
        }
        return nil
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let vc = LektoViewController()
        window?.rootViewController = vc
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        if let vc = window?.rootViewController as? LektoViewController {
            vc.webView?.evaluateJavaScript("window.dispatchEvent(new Event('lekto:resume'));", completionHandler: nil)
            LektoNativeCoordinator.shared.deliverPendingSubject()
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
