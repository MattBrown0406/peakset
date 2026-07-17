import SwiftUI
import UIKit
import WebKit
import AVFoundation

struct PeakSetWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        for handler in ["peaksetSharePdf", "peaksetPlayBell", "peaksetTimer", "peaksetHealthKit"] {
            configuration.userContentController.add(context.coordinator, name: handler)
        }
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = webView

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        for handler in ["peaksetSharePdf", "peaksetPlayBell", "peaksetTimer", "peaksetHealthKit"] {
            uiView.configuration.userContentController.removeScriptMessageHandler(forName: handler)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var bellPlayer: AVAudioPlayer?
        private let isoFormatter = ISO8601DateFormatter()

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
            default:
                break
            }
        }

        private func handleTimer(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            if action == "cancel" {
                PeakSetTimerService.shared.cancel()
                return
            }
            if action == "start", let seconds = payload["seconds"] as? Double {
                PeakSetTimerService.shared.start(seconds: seconds)
            } else if action == "start", let seconds = payload["seconds"] as? Int {
                PeakSetTimerService.shared.start(seconds: Double(seconds))
            }
        }

        private func handleHealthKit(_ body: Any) {
            guard let payload = body as? [String: Any], let action = payload["action"] as? String else { return }
            let service = PeakSetHealthKitService.shared

            switch action {
            case "authorize":
                service.requestAuthorization { [weak self] result in
                    self?.sendHealthKitResult(result.map { value -> [String: Any] in ["status": "connected", "message": value] })
                }
            case "readSteps":
                service.readTodaySteps { [weak self] result in
                    self?.sendHealthKitResult(result.map { value -> [String: Any] in ["status": "connected", "message": "Today's steps imported", "steps": value] })
                }
            case "syncWeight":
                guard let weight = Self.doubleValue(payload["weight"]), weight > 0 else {
                    sendHealthKitResult(.failure(PeakSetHealthKitService.ServiceError.saveFailed))
                    return
                }
                let date = (payload["date"] as? String).flatMap { self.isoFormatter.date(from: $0) } ?? Date()
                service.saveWeight(pounds: weight, date: date) { [weak self] result in
                    self?.sendHealthKitResult(result.map { value -> [String: Any] in ["status": "connected", "message": value] })
                }
            case "saveWorkout":
                let title = payload["title"] as? String ?? "PeakSet Workout"
                guard let startText = payload["startedAt"] as? String,
                      let endText = payload["endedAt"] as? String,
                      let start = isoFormatter.date(from: startText),
                      let end = isoFormatter.date(from: endText) else { return }
                service.saveWorkout(title: title, start: start, end: end) { [weak self] result in
                    self?.sendHealthKitResult(result.map { value -> [String: Any] in ["status": "connected", "message": value] })
                }
            default:
                break
            }
        }

        private func sendHealthKitResult(_ result: Result<[String: Any], Error>) {
            let payload: [String: Any]
            switch result {
            case .success(let value):
                payload = value
            case .failure(let error):
                payload = ["status": "error", "message": error.localizedDescription]
            }
            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript("window.handleNativeHealthKit(\(json));")
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
                guard let presenter = Self.topViewController() else { return }
                if let popover = activityController.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                    popover.permittedArrowDirections = []
                }
                presenter.present(activityController, animated: true)
            }
        }

        private static func topViewController() -> UIViewController? {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            var controller = scene?.windows.first { $0.isKeyWindow }?.rootViewController
            while let presented = controller?.presentedViewController {
                controller = presented
            }
            return controller
        }
    }
}
