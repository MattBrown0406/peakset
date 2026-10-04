import SwiftUI
import UIKit
import WebKit
import AVFoundation

struct PeakSetWebView: UIViewRepresentable {
    static let messageHandlers = ["peaksetSharePdf", "peaksetPlayBell", "peaksetTimer", "peaksetHealthKit", "peaksetBackup", "peaksetPhoto", "peaksetWatch"]

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        for handler in PeakSetWebView.messageHandlers {
            configuration.userContentController.add(context.coordinator, name: handler)
        }
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.setURLSchemeHandler(context.coordinator.photoSchemeHandler, forURLScheme: PeakSetPhotoSchemeHandler.scheme)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        // Without a UI delegate WKWebView answers every confirm() with "Cancel".
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Match the app's navy background so launch never flashes white.
        let background = UIColor(red: 0.039, green: 0.055, blue: 0.102, alpha: 1)
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        context.coordinator.webView = webView

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        for handler in PeakSetWebView.messageHandlers {
            uiView.configuration.userContentController.removeScriptMessageHandler(forName: handler)
        }
        uiView.stopLoading()
        uiView.navigationDelegate = nil
        coordinator.webView = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
        weak var webView: WKWebView?
        let photoSchemeHandler = PeakSetPhotoSchemeHandler()
        private let photoCoordinator = PeakSetPhotoCoordinator()
        private var bellPlayer: AVAudioPlayer?
        private let fractionalISOFormatter: ISO8601DateFormatter = {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter
        }()
        private let fallbackISOFormatter = ISO8601DateFormatter()

        private func parseISODate(_ value: String) -> Date? {
            fractionalISOFormatter.date(from: value) ?? fallbackISOFormatter.date(from: value)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "peaksetPlayBell":
                playBell()
            case "peaksetTimer":
                handleTimer(message.body)
            case "peaksetHealthKit":
                handleHealthKit(message.body)
            case "peaksetSharePdf":
                handlePDFShare(message.body)
            case "peaksetBackup":
                handleBackup(message.body)
            case "peaksetPhoto":
                handlePhoto(message.body)
            case "peaksetWatch":
                if let payload = message.body as? [String: Any], let snapshot = payload["snapshot"] as? String {
                    PeakSetWatchBridge.shared.publish(snapshotJSON: snapshot)
                }
            default:
                break
            }
        }

        /// Presents a JavaScript panel once any screen transition (e.g. the file
        /// picker closing) has finished, rather than answering Cancel.
        private func presentPanel(_ alert: UIAlertController, attempt: Int = 0, onFailure: @escaping () -> Void) {
            guard let presenter = Self.topViewController() else { return onFailure() }
            if presenter.isBeingDismissed || presenter.isBeingPresented, let coordinator = presenter.transitionCoordinator, attempt < 3 {
                let queued = coordinator.animate(alongsideTransition: nil) { [weak self] _ in
                    self?.presentPanel(alert, attempt: attempt + 1, onFailure: onFailure) ?? onFailure()
                }
                // WebKit requires every panel's completion to run exactly once.
                if !queued { onFailure() }
                return
            }
            guard !presenter.isBeingDismissed, !presenter.isBeingPresented else { return onFailure() }
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {

            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            presentPanel(alert) { completionHandler() }
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {

            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            presentPanel(alert) { completionHandler(false) }
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {

            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
            presentPanel(alert) { completionHandler(nil) }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            PeakSetIncomingFiles.shared.attach { [weak self] text in
                self?.callJavaScript("handleIncomingFileText", argument: text)
            }
            PeakSetWatchBridge.shared.attach { [weak self] command, acknowledge in
                self?.callJavaScript("handleWatchCommand", argument: command) { applied in
                    if applied { acknowledge() }
                }
            }
            #if DEBUG
            // Simulator smoke tests: `SIMCTL_CHILD_MASSMETHOD_DEBUG_JS='...' xcrun simctl launch ...`
            if let script = ProcessInfo.processInfo.environment["MASSMETHOD_DEBUG_JS"], !script.isEmpty {
                webView.evaluateJavaScript(script)
            }
            #endif
        }

        /// Calls `window.<function>(argument)` with the argument JSON-encoded so any
        /// file contents arrive as a plain string, never as executable source.
        func callJavaScript(_ function: String, argument: Any, completion: ((Bool) -> Void)? = nil) {
            guard let data = try? JSONSerialization.data(withJSONObject: [argument]),
                  let array = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { [weak self] in
                guard let webView = self?.webView else {
                    completion?(false)
                    return
                }
                // `void` keeps the result serializable; success means the call ran.
                webView.evaluateJavaScript("void window.\(function)?.(...\(array));") { _, error in
                    completion?(error == nil)
                }
            }
        }

        /// The web view only ever shows the bundled app; web links open in
        /// Safari and anything else is refused.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
                return decisionHandler(.cancel)
            }
            switch scheme {
            case "file", "about", "blob", "data", PeakSetPhotoSchemeHandler.scheme:
                decisionHandler(.allow)
            case "http", "https", "mailto", "tel":
                if navigationAction.navigationType == .linkActivated {
                    UIApplication.shared.open(url)
                }
                decisionHandler(.cancel)
            default:
                decisionHandler(.cancel)
            }
        }

        /// iOS can kill the web content process under memory pressure (e.g.
        /// while the camera is open). Reload instead of staying blank, and
        /// queue watch commands and opened files until the page is back.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            PeakSetWatchBridge.shared.detach()
            PeakSetIncomingFiles.shared.detach()
            webView.reload()
        }

        private func handlePhoto(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            let pose = payload["pose"] as? String ?? ""
            let report: ([String: Any]) -> Void = { [weak self] result in
                self?.callJavaScript("handleNativePhoto", argument: result)
            }
            switch action {
            case "capture", "library":
                guard let presenter = Self.topViewController() else { return }
                if action == "library" {
                    photoCoordinator.pickFromLibrary(pose: pose, from: presenter, completion: report)
                } else {
                    photoCoordinator.capture(pose: pose, poseLabel: payload["poseLabel"] as? String ?? "Progress photo", ghostID: payload["ghostId"] as? String ?? "", from: presenter, completion: report)
                }
            case "delete":
                if let id = payload["id"] as? String { PeakSetPhotoStore.delete(id) }
            case "import":
                guard let requestID = payload["requestId"] as? String,
                      let dataURL = payload["dataUrl"] as? String,
                      let comma = dataURL.firstIndex(of: ","),
                      dataURL.hasPrefix("data:image/"),
                      let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
                      let image = UIImage(data: data) else { return }
                let prefix = (payload["prefix"] as? String) == "coach" ? "coach-" : ""
                DispatchQueue.global(qos: .userInitiated).async {
                    let id = (try? PeakSetPhotoStore.save(image, idPrefix: prefix)) ?? ""
                    report(["status": "imported", "requestId": requestID, "id": id])
                }
            case "thumbnail":
                guard let id = payload["id"] as? String, let requestID = payload["requestId"] as? String else { return }
                let size = CGFloat((payload["size"] as? NSNumber)?.doubleValue ?? 640)
                DispatchQueue.global(qos: .userInitiated).async {
                    let dataURL = PeakSetPhotoStore.thumbnailDataURL(for: id, maxEdge: max(120, min(size, 1200))) ?? ""
                    report(["status": "thumbnail", "requestId": requestID, "id": id, "dataUrl": dataURL])
                }
            default:
                break
            }
        }

        private func handleBackup(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            let service = PeakSetBackupService.shared
            switch action {
            case "snapshot":
                guard let json = payload["json"] as? String else { return }
                let filename = payload["filename"] as? String ?? "mass-method-backup.json"
                service.snapshot(json: json, filename: filename) { [weak self] result in
                    switch result {
                    case .success(let location):
                        self?.callJavaScript("handleNativeBackup", argument: ["status": "saved", "location": location.rawValue])
                    case .failure(let error):
                        self?.callJavaScript("handleNativeBackup", argument: ["status": "error", "message": error.localizedDescription])
                    }
                }
            case "list":
                service.list { [weak self] files in
                    let formatter = ISO8601DateFormatter()
                    let backups: [[String: Any]] = files.map {
                        ["name": $0.name, "date": formatter.string(from: $0.date), "bytes": $0.bytes, "location": $0.location.rawValue]
                    }
                    self?.callJavaScript("handleNativeBackup", argument: ["status": "list", "backups": backups])
                }
            case "restore":
                guard let name = payload["name"] as? String,
                      let location = PeakSetBackupService.Location(rawValue: payload["location"] as? String ?? "") else { return }
                service.read(name: name, location: location) { [weak self] result in
                    switch result {
                    case .success(let (json, date)):
                        self?.callJavaScript("handleNativeBackup", argument: ["status": "restore", "json": json, "location": location.rawValue, "date": ISO8601DateFormatter().string(from: date)])
                    case .failure(let error):
                        self?.callJavaScript("handleNativeBackup", argument: ["status": "error", "message": error.localizedDescription])
                    }
                }
            default:
                break
            }
        }

        private func handleTimer(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            if action == "cancel" {
                PeakSetTimerService.shared.cancel()
                PeakSetLiveActivityManager.shared.end()
                return
            }
            if action == "reconcile" {
                PeakSetTimerService.shared.reconcile { [weak self] delivered in
                    DispatchQueue.main.async {
                        self?.webView?.evaluateJavaScript("window.handleNativeTimerReconcile?.({ delivered: \(delivered ? "true" : "false") });")
                    }
                }
                return
            }
            guard action == "start", let seconds = (payload["seconds"] as? NSNumber)?.doubleValue else { return }
            PeakSetTimerService.shared.start(seconds: seconds)
            if payload["liveActivity"] as? Bool == true,
               let endsAtMs = (payload["endsAt"] as? NSNumber)?.doubleValue {
                let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
                PeakSetLiveActivityManager.shared.show(.init(
                    startedAt: Date(),
                    endsAt: endsAt,
                    workoutTitle: payload["workoutTitle"] as? String ?? "Mass Method",
                    exerciseName: payload["exerciseName"] as? String ?? "Next set",
                    nextSetLabel: payload["nextSetLabel"] as? String ?? "",
                    completedSets: (payload["completedSets"] as? NSNumber)?.intValue ?? 0,
                    totalSets: (payload["totalSets"] as? NSNumber)?.intValue ?? 0
                ))
            } else {
                PeakSetLiveActivityManager.shared.end()
            }
        }

        private func handleHealthKit(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            let service = PeakSetHealthKitService.shared

            switch action {
            case "authorize":
                service.requestAuthorization { [weak self] result in
                    self?.sendHealthKitResult(action: action, result.map { summary -> [String: Any] in [
                        "status": "authorizationCompleted",
                        "message": "Apple Health authorization request completed",
                        "weightWrite": summary.bodyMassWrite,
                        "workoutWrite": summary.workoutWrite
                    ] })
                }
            case "readBody":
                let since = (payload["since"] as? String).flatMap(parseISODate) ?? Date().addingTimeInterval(-180 * 86400)
                service.readBodySamples(since: since, kilograms: (payload["unit"] as? String) == "kg", centimeters: (payload["lengthUnit"] as? String) == "cm") { [weak self] result in
                    self?.sendHealthKitResult(action: action, result.map { samples -> [String: Any] in ["status": "bodySamples", "samples": samples, "unit": (payload["unit"] as? String) ?? "lb"] })
                }
            case "readSteps":
                service.readTodaySteps { [weak self] result in
                    self?.sendHealthKitResult(action: action, result.map { value -> [String: Any] in ["status": "stepsImported", "message": "Today's steps imported", "steps": value] })
                }
            case "syncWeight":
                guard let weight = Self.doubleValue(payload["weight"]), weight.isFinite, weight > 0,
                      let dateText = payload["date"] as? String,
                      let date = parseISODate(dateText) else {
                    sendHealthKitResult(action: action, .failure(PeakSetHealthKitService.ServiceError.invalidPayload))
                    return
                }
                let kilograms = (payload["unit"] as? String) == "kg"
                service.saveWeight(value: weight, kilograms: kilograms, date: date) { [weak self] result in
                    self?.sendHealthKitResult(action: action, result.map { value -> [String: Any] in ["status": "weightSaved", "message": value] })
                }
            case "saveWorkout":
                let title = payload["title"] as? String ?? "Mass Method Workout"
                let workoutID = payload["id"] as? String ?? UUID().uuidString
                guard let startText = payload["startedAt"] as? String,
                      let endText = payload["endedAt"] as? String,
                      let start = parseISODate(startText),
                      let end = parseISODate(endText),
                      end > start else {
                    sendHealthKitResult(action: action, .failure(PeakSetHealthKitService.ServiceError.invalidPayload))
                    return
                }
                service.saveWorkout(id: workoutID, title: title, start: start, end: end) { [weak self] result in
                    self?.sendHealthKitResult(action: action, result.map { value -> [String: Any] in ["status": "workoutSaved", "message": value] })
                }
            default:
                break
            }
        }

        /// Every reply names the request it answers so the web app never mistakes
        /// a failed weight export for a failed import.
        private func sendHealthKitResult(action: String, _ result: Result<[String: Any], Error>) {
            var payload: [String: Any]
            switch result {
            case .success(let value):
                payload = value
            case .failure(let error):
                payload = ["status": "error", "message": error.localizedDescription]
            }
            payload["action"] = action
            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript("window.handleNativeHealthKit?.(\(json));")
            }
        }

        private static func doubleValue(_ value: Any?) -> Double? {
            if let number = value as? NSNumber { return number.doubleValue }
            if let text = value as? String { return Double(text) }
            return nil
        }

        private func handlePDFShare(_ body: Any) {
            guard let payload = body as? [String: Any],
                  let filename = payload["filename"] as? String,
                  let base64 = payload["base64"] as? String,
                  let data = Data(base64Encoded: base64) else { return }

            let safeFilename = filename.replacingOccurrences(of: "/", with: "-")
            let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeFilename)
            do {
                try data.write(to: fileURL, options: .atomic)
                presentShareSheet(for: fileURL)
            } catch {
                webView?.evaluateJavaScript("toast('PDF export failed.')")
            }
        }

        private func playBell() {
            let bellURL = Bundle.main.url(forResource: "boxing-bell", withExtension: "wav")
                ?? Bundle.main.url(forResource: "boxing-bell", withExtension: "wav", subdirectory: "Web/assets")
            guard let bellURL else {
                webView?.evaluateJavaScript("toast('Bell audio is unavailable.')")
                return
            }
            do {
                bellPlayer = try AVAudioPlayer(contentsOf: bellURL)
                bellPlayer?.volume = 1
                bellPlayer?.prepareToPlay()
                bellPlayer?.play()
            } catch {
                webView?.evaluateJavaScript("toast('Bell audio could not play.')")
            }
        }

        private func presentShareSheet(for fileURL: URL) {
            DispatchQueue.main.async {
                let activityController = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                guard let presenter = Self.topViewController() else {
                    try? FileManager.default.removeItem(at: fileURL)
                    return
                }
                activityController.completionWithItemsHandler = { [weak self] _, completed, _, _ in
                    try? FileManager.default.removeItem(at: fileURL)
                    // Lets the web app tell a sent check-in from a cancelled share.
                    self?.callJavaScript("handleNativeShare", argument: ["filename": fileURL.lastPathComponent, "completed": completed])
                }
                if let popover = activityController.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                    popover.permittedArrowDirections = []
                }
                presenter.present(activityController, animated: true)
            }
        }

        private static func topViewController() -> UIViewController? {
            // Files opened from Mail or Files arrive while the scene is still
            // activating, so fall back to any foreground scene.
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let scene = scenes.first { $0.activationState == .foregroundActive }
                ?? scenes.first { $0.activationState == .foregroundInactive }
            let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
            var controller = window?.rootViewController
            while let presented = controller?.presentedViewController {
                controller = presented
            }
            return controller
        }
    }
}
