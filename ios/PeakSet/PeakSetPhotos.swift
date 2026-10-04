import AVFoundation
import PhotosUI
import UIKit
import WebKit

/// Progress photos live as JPEG files in Documents/ProgressPhotos.
enum PeakSetPhotoStore {
    static let maxEdge: CGFloat = 1600

    static var directory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ProgressPhotos", isDirectory: true)
    }

    static func isValidID(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 64 && id.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" }
    }

    static func url(for id: String) -> URL? {
        guard isValidID(id) else { return nil }
        return directory.appendingPathComponent("\(id).jpg")
    }

    static func image(for id: String) -> UIImage? {
        guard let url = url(for: id), let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    /// Scales to `maxEdge`, bakes in orientation, and writes a JPEG. Returns the new id.
    static func save(_ image: UIImage, mirrored: Bool = false) throws -> String {
        let id = UUID().uuidString
        guard let url = url(for: id),
              let data = resized(image, maxEdge: maxEdge, mirrored: mirrored).jpegData(compressionQuality: 0.85) else {
            throw CocoaError(.fileWriteUnknown)
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return id
    }

    static func delete(_ id: String) {
        guard let url = url(for: id) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static func thumbnailDataURL(for id: String, maxEdge: CGFloat) -> String? {
        guard let image = image(for: id),
              let data = resized(image, maxEdge: maxEdge).jpegData(compressionQuality: 0.72) else { return nil }
        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    static func resized(_ image: UIImage, maxEdge: CGFloat, mirrored: Bool = false) -> UIImage {
        let size = image.size
        let scale = min(1, maxEdge / max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { context in
            if mirrored {
                context.cgContext.translateBy(x: target.width, y: 0)
                context.cgContext.scaleBy(x: -1, y: 1)
            }
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

/// Serves `massmethod-photo://photo/<id>.jpg` to the web view so photos never
/// pass through localStorage or the JavaScript bridge as base64.
final class PeakSetPhotoSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "massmethod-photo"

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              url.host == "photo",
              let fileURL = PeakSetPhotoStore.url(for: url.deletingPathExtension().lastPathComponent),
              let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "image/jpeg",
            "Content-Length": String(data.count),
            "Cache-Control": "max-age=31536000"
        ])
        urlSchemeTask.didReceive(response ?? URLResponse(url: url, mimeType: "image/jpeg", expectedContentLength: data.count, textEncodingName: nil))
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

/// Presents the ghost-overlay camera or the Photos picker and reports back.
final class PeakSetPhotoCoordinator: NSObject, PHPickerViewControllerDelegate {
    typealias Completion = ([String: Any]) -> Void
    private var completion: Completion?
    private var pose = ""

    func capture(pose: String, poseLabel: String, ghostID: String, from presenter: UIViewController, completion: @escaping Completion) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            pickFromLibrary(pose: pose, from: presenter, completion: completion)
            return
        }
        self.pose = pose
        self.completion = completion
        let ghost = PeakSetPhotoStore.isValidID(ghostID) ? PeakSetPhotoStore.image(for: ghostID) : nil
        let camera = PeakSetCameraViewController(poseLabel: poseLabel, ghost: ghost)
        camera.onFinish = { [weak self] image, mirrored in
            self?.store(image, mirrored: mirrored)
        }
        camera.modalPresentationStyle = .fullScreen
        presenter.present(camera, animated: true)
    }

    func pickFromLibrary(pose: String, from presenter: UIViewController, completion: @escaping Completion) {
        self.pose = pose
        self.completion = completion
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        presenter.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            finish(["status": "cancelled"])
            return
        }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            DispatchQueue.main.async {
                guard let image = object as? UIImage else {
                    self?.finish(["status": "error", "message": "That photo could not be loaded."])
                    return
                }
                self?.store(image, mirrored: false)
            }
        }
    }

    private func store(_ image: UIImage?, mirrored: Bool) {
        guard let image else {
            finish(["status": "cancelled"])
            return
        }
        let pose = self.pose
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result: [String: Any]
            do {
                let id = try PeakSetPhotoStore.save(image, mirrored: mirrored)
                result = ["status": "saved", "id": id, "pose": pose, "date": ISO8601DateFormatter().string(from: Date())]
            } catch {
                result = ["status": "error", "message": "The photo could not be saved."]
            }
            DispatchQueue.main.async { self?.finish(result) }
        }
    }

    private func finish(_ payload: [String: Any]) {
        completion?(payload)
        completion = nil
    }
}

/// Full-screen camera with the previous photo of the same pose as a
/// translucent guide, an opacity slider, a self-timer, and a camera flip.
final class PeakSetCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate {
    var onFinish: ((UIImage?, Bool) -> Void)?

    private let poseLabel: String
    private let ghost: UIImage?
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.mattbrown.peakset.camera")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var position: AVCaptureDevice.Position = .back
    private let ghostView = UIImageView()
    private let countdownLabel = UILabel()
    private let timerButton = UIButton(type: .system)
    private let shutterButton = UIButton(type: .custom)
    private var timerSeconds = 0
    private var countdown: Timer?
    private var finished = false

    init(poseLabel: String, ghost: UIImage?) {
        self.poseLabel = poseLabel
        self.ghost = ghost
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview

        ghostView.image = ghost
        ghostView.contentMode = .scaleAspectFill
        ghostView.clipsToBounds = true
        ghostView.alpha = ghost == nil ? 0 : 0.35
        ghostView.isUserInteractionEnabled = false
        view.addSubview(ghostView)

        buildControls()
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                if granted {
                    self.configureSession()
                } else {
                    self.showPermissionMessage()
                }
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        ghostView.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        countdown?.invalidate()
        sessionQueue.async { [session] in session.stopRunning() }
    }

    private func buildControls() {
        let title = UILabel()
        title.text = poseLabel
        title.font = .systemFont(ofSize: 20, weight: .heavy)
        title.textColor = .white
        title.textAlignment = .center

        let hint = UILabel()
        hint.text = ghost == nil ? "First photo of this pose. Mark your spot." : "Line up with your last photo."
        hint.font = .systemFont(ofSize: 13, weight: .semibold)
        hint.textColor = UIColor(white: 1, alpha: 0.8)
        hint.textAlignment = .center

        let close = Self.pillButton(title: "Cancel")
        close.addAction(UIAction { [weak self] _ in self?.finish(nil) }, for: .touchUpInside)

        let flip = Self.pillButton(title: "Flip")
        flip.addAction(UIAction { [weak self] _ in self?.flipCamera() }, for: .touchUpInside)

        timerButton.setTitle("Timer off", for: .normal)
        Self.stylePill(timerButton)
        timerButton.addAction(UIAction { [weak self] _ in self?.cycleTimer() }, for: .touchUpInside)

        let slider = UISlider()
        slider.minimumValue = 0
        slider.maximumValue = 0.7
        slider.value = Float(ghostView.alpha)
        slider.isHidden = ghost == nil
        slider.minimumTrackTintColor = UIColor(red: 1, green: 0.47, blue: 0.29, alpha: 1)
        slider.accessibilityLabel = "Guide opacity"
        slider.addAction(UIAction { [weak self, weak slider] _ in
            self?.ghostView.alpha = CGFloat(slider?.value ?? 0)
        }, for: .valueChanged)

        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 36
        shutterButton.layer.borderWidth = 5
        shutterButton.layer.borderColor = UIColor(red: 1, green: 0.47, blue: 0.29, alpha: 1).cgColor
        shutterButton.accessibilityLabel = "Take photo"
        shutterButton.addAction(UIAction { [weak self] _ in self?.shutterTapped() }, for: .touchUpInside)

        countdownLabel.font = .monospacedDigitSystemFont(ofSize: 120, weight: .black)
        countdownLabel.textColor = .white
        countdownLabel.textAlignment = .center
        countdownLabel.isHidden = true
        countdownLabel.layer.shadowOpacity = 0.6
        countdownLabel.layer.shadowRadius = 8

        let top = UIStackView(arrangedSubviews: [close, UIView(), flip])
        let header = UIStackView(arrangedSubviews: [title, hint])
        header.axis = .vertical
        header.spacing = 2
        let bottomRow = UIStackView(arrangedSubviews: [timerButton, UIView(), shutterButton, UIView(), UIView()])
        bottomRow.alignment = .center
        bottomRow.distribution = .equalCentering
        let bottom = UIStackView(arrangedSubviews: [slider, bottomRow])
        bottom.axis = .vertical
        bottom.spacing = 18

        for item in [top, header, bottom, countdownLabel] as [UIView] {
            item.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(item)
        }
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            top.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            top.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            header.topAnchor.constraint(equalTo: top.bottomAnchor, constant: 12),
            header.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            bottom.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            bottom.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            bottom.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -20),
            shutterButton.widthAnchor.constraint(equalToConstant: 72),
            shutterButton.heightAnchor.constraint(equalToConstant: 72),
            countdownLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            countdownLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private static func pillButton(title: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        stylePill(button)
        return button
    }

    private static func stylePill(_ button: UIButton) {
        button.setTitleColor(.white, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
        button.backgroundColor = UIColor(white: 0, alpha: 0.45)
        button.layer.cornerRadius = 18
        button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
    }

    private func configureSession() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            self.session.inputs.forEach { self.session.removeInput($0) }
            if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: self.position),
               let input = try? AVCaptureDeviceInput(device: device),
               self.session.canAddInput(input) {
                self.session.addInput(input)
            }
            if !self.session.outputs.contains(self.photoOutput), self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
            }
            self.session.commitConfiguration()
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    private func flipCamera() {
        position = position == .back ? .front : .back
        configureSession()
    }

    private func cycleTimer() {
        timerSeconds = timerSeconds == 0 ? 3 : timerSeconds == 3 ? 10 : 0
        timerButton.setTitle(timerSeconds == 0 ? "Timer off" : "Timer \(timerSeconds)s", for: .normal)
    }

    private func shutterTapped() {
        guard countdown == nil else { return }
        guard timerSeconds > 0 else {
            takePhoto()
            return
        }
        var remaining = timerSeconds
        countdownLabel.text = "\(remaining)"
        countdownLabel.isHidden = false
        shutterButton.isEnabled = false
        countdown = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            remaining -= 1
            if remaining <= 0 {
                timer.invalidate()
                self?.countdown = nil
                self?.countdownLabel.isHidden = true
                self?.takePhoto()
            } else {
                self?.countdownLabel.text = "\(remaining)"
            }
        }
    }

    private func takePhoto() {
        shutterButton.isEnabled = false
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            DispatchQueue.main.async { self.shutterButton.isEnabled = true }
            return
        }
        DispatchQueue.main.async {
            // Crop to exactly what the preview showed so the next ghost lines up.
            let cropped = self.cropToPreview(image)
            self.finish(cropped)
        }
    }

    private func cropToPreview(_ image: UIImage) -> UIImage {
        guard let previewLayer, let cgImage = image.cgImage else { return image }
        let visible = previewLayer.metadataOutputRectConverted(fromLayerRect: previewLayer.bounds)
        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)
        let rect = CGRect(x: visible.origin.x * width, y: visible.origin.y * height, width: visible.width * width, height: visible.height * height).integral
        guard let cropped = cgImage.cropping(to: rect) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    private func showPermissionMessage() {
        let alert = UIAlertController(title: "Camera access is off", message: "Allow camera access in Settings to take progress photos, or choose one from your Photos library.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in self?.finish(nil) })
        present(alert, animated: true)
    }

    private func finish(_ image: UIImage?) {
        guard !finished else { return }
        finished = true
        let mirrored = position == .front
        dismiss(animated: true) { [onFinish] in
            onFinish?(image, mirrored)
        }
    }
}
