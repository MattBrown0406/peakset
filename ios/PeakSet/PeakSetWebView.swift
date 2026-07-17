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
        configuration.userContentController.add(context.coordinator, name: "peaksetSharePdf")
        configuration.userContentController.add(context.coordinator, name: "peaksetPlayBell")
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
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "peaksetSharePdf")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "peaksetPlayBell")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var bellPlayer: AVAudioPlayer?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "peaksetPlayBell" {
                playBell()
                return
            }

            guard message.name == "peaksetSharePdf",
                  let payload = message.body as? [String: Any],
                  let filename = payload["filename"] as? String,
                  let base64 = payload["base64"] as? String,
                  let data = Data(base64Encoded: base64) else {
                return
            }

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
            guard let bellURL = Bundle.main.url(
                forResource: "boxing-bell",
                withExtension: "wav",
                subdirectory: "Web/assets"
            ) else {
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
