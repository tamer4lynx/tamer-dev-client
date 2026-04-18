import UIKit
import Lynx
import tamerdevclient
import tamerinsets
import tamerrouter
import tamersystemui

class DevLauncherViewController: UIViewController {
    private var lynxView: LynxView?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        edgesForExtendedLayout = .all
        extendedLayoutIncludesOpaqueBars = true
        additionalSafeAreaInsets = .zero
        view.insetsLayoutMarginsFromSafeArea = false
        view.preservesSuperviewLayoutMargins = false
        if #available(iOS 15.0, *) {
            viewRespectsSystemMinimumLayoutMargins = false
        }
        setupLynxView()
        setupDevClientModule()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let lynxView = lynxView {
            applyFullscreenLayout(to: lynxView)
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        TamerInsetsModule.reRequestInsets()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { SystemUIModule.statusBarStyleForHost }

    private func setupLynxView() {
        let size = fullscreenBounds().size
        let lv = LynxView { builder in
            builder.config = LynxConfig(provider: DevTemplateProvider())
            builder.screenSize = size
            builder.fontScale = 1.0
        }
        lv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lv.insetsLayoutMarginsFromSafeArea = false
        lv.preservesSuperviewLayoutMargins = false
        view.addSubview(lv)
        applyFullscreenLayout(to: lv)
        TamerInsetsModule.attachHostView(lv)
        TamerRouterNativeModule.attachHostView(lv)
        lv.loadTemplate(fromURL: "dev-client.lynx.bundle", initData: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak lv] in
            guard let self, let lv else { return }
            self.logViewport("devclient post-load", lynxView: lv)
            self.applyFullscreenLayout(to: lv)
        }
        self.lynxView = lv
    }

    private func applyFullscreenLayout(to lynxView: LynxView) {
        let bounds = fullscreenBounds()
        let size = bounds.size
        lynxView.frame = bounds
        lynxView.updateScreenMetrics(withWidth: size.width, height: size.height)
        lynxView.updateViewport(withPreferredLayoutWidth: size.width, preferredLayoutHeight: size.height, needLayout: true)
        lynxView.preferredLayoutWidth = size.width
        lynxView.preferredLayoutHeight = size.height
        lynxView.layoutWidthMode = .exact
        lynxView.layoutHeightMode = .exact
        logViewport("devclient apply", lynxView: lynxView)
    }

    private func fullscreenBounds() -> CGRect {
        let bounds = view.bounds
        if bounds.width > 0, bounds.height > 0 {
            return bounds
        }
        return UIScreen.main.bounds
    }

    private func logViewport(_ label: String, lynxView: LynxView) {
        let rootWidth = lynxView.rootWidth()
        let rootHeight = lynxView.rootHeight()
        let intrinsic = lynxView.intrinsicContentSize
        NSLog("[DevLauncher] %@ view=%@ safe=%@ lynxFrame=%@ lynxBounds=%@ root=%0.2fx%0.2f intrinsic=%@", label, NSCoder.string(for: view.bounds), NSCoder.string(for: view.safeAreaInsets), NSCoder.string(for: lynxView.frame), NSCoder.string(for: lynxView.bounds), rootWidth, rootHeight, NSCoder.string(for: intrinsic))
    }

    private func setupDevClientModule() {
        DevClientModule.presentQRScanner = { [weak self] completion in
            let scanner = QRScannerViewController()
            scanner.onResult = { url in
                scanner.dismiss(animated: true) { completion(url) }
            }
            scanner.modalPresentationStyle = .fullScreen
            self?.present(scanner, animated: true)
        }

        DevClientModule.reloadProjectHandler = { [weak self] in
            guard let self = self else { return }
            let projectVC = ProjectViewController()
            projectVC.modalPresentationStyle = .fullScreen
            self.present(projectVC, animated: true)
        }
    }
}
