import SwiftUI
import WebKit
import ActivityKit
import CoreLocation

enum ForgeRoute: String { case day,now }
struct ForgeRouteRequest { let id=UUID();let route:ForgeRoute }
@main struct LifeForgeApp: App {
    init() { _ = ForgeLocation.shared }
    @State private var routeRequest:ForgeRouteRequest?
    var body: some Scene { WindowGroup {
        ForgeWebView(routeRequest:routeRequest).ignoresSafeArea(edges:.bottom).preferredColorScheme(.dark)
            .onOpenURL { url in
                guard url.scheme=="lifeforge",let host=url.host,let route=ForgeRoute(rawValue:host) else { return }
                routeRequest=ForgeRouteRequest(route:route)
            }
    } }
}
struct ForgeWebView: UIViewRepresentable {
    let routeRequest:ForgeRouteRequest?
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context:Context) -> WKWebView {
        let config=WKWebViewConfiguration();config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator,name:"lifeForgeTimer")
        config.userContentController.add(context.coordinator,name:"lifeForgeLocation")
        let view=WKWebView(frame:.zero,configuration:config)
        view.isOpaque=false;view.backgroundColor = .black;view.scrollView.backgroundColor = .black
        view.allowsBackForwardNavigationGestures=true;context.coordinator.webView=view
        view.navigationDelegate=context.coordinator
        context.coordinator.observe()
        view.load(URLRequest(url:TimerAccess.site));return view
    }
    func updateUIView(_ view:WKWebView,context:Context) {
        if let request=routeRequest,context.coordinator.lastRequest != request.id {
            context.coordinator.lastRequest=request.id;context.coordinator.pendingRoute=request.route;context.coordinator.navigate()
        }
    }
    static func dismantleUIView(_ view:WKWebView,coordinator:Coordinator) { view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeTimer");view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeLocation") }
    final class Coordinator: NSObject,WKScriptMessageHandler,WKNavigationDelegate {
        weak var webView: WKWebView?
        var lastVersion=""
        var lastRequest:UUID?
        var pendingRoute:ForgeRoute?
        func navigate() {
            guard let view=webView,view.url?.host==TimerAccess.site.host,view.url?.scheme=="https",let route=pendingRoute else { return }
            view.evaluateJavaScript("typeof window.__lifeForgeNavigate==='function' && window.__lifeForgeNavigate('"+route.rawValue+"')") { result,_ in
                if (result as? Bool)==true,self.pendingRoute==route { self.pendingRoute=nil }
            }
        }
        func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
            ForgeLocation.shared.webView=webView;ForgeLocation.shared.publish()
            if webView.url?.host==TimerAccess.site.host,webView.url?.scheme=="https" { webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in try? TimerAccess.shared.save(cookies);ForgeLocation.shared.flush() } }
            navigate()
            DispatchQueue.main.asyncAfter(deadline:.now()+0.7) { self.navigate() }
        }
        func observe() { NotificationCenter.default.addObserver(self,selector:#selector(wake),name:UIApplication.didBecomeActiveNotification,object:nil) }
        deinit { NotificationCenter.default.removeObserver(self) }
        @objc func wake() { navigate();Task { await TimerAccess.shared.flush();await MainActor.run { self.webView?.evaluateJavaScript("window.dispatchEvent(new Event('online'))",completionHandler:nil) } } }
        func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
            guard message.frameInfo.isMainFrame,message.frameInfo.request.url?.scheme == "https",message.frameInfo.request.url?.host == TimerAccess.site.host,
                  let payload=message.body as? [String:Any] else { return }
            if message.name=="lifeForgeLocation" {
                webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                    do { try TimerAccess.shared.save(cookies);ForgeLocation.shared.setEnabled(payload["enabled"] as? Bool == true) } catch { self.showError(error.localizedDescription) }
                };return
            }
            TimerAccess.shared.rememberActive(payload["active"] as? [String:Any])
            webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                do { try TimerAccess.shared.save(cookies) } catch { self.showError(error.localizedDescription) }
            }
            guard let data=payload["active"] as? [String:Any],let id=data["id"] as? String else {
                lastVersion="";Task { @MainActor in guard self.lastVersion.isEmpty else { return };for activity in Activity<ForgeActivity>.activities { await activity.end(nil,dismissalPolicy:.immediate) } };return
            }
            let version=id+":"+String(describing:data["version"] ?? 0)
            guard version != lastVersion else { return };lastVersion=version
            guard let title=data["title"] as? String,let category=data["category"] as? String,
                  let raw=data["startedAt"] as? String,let started=parse(raw) else { return }
            let paused=(data["pausedAt"] as? String).flatMap(parse)
            let state=ForgeActivity.ContentState(title:title,category:category,startedAt:started,pausedAt:paused,pausedSeconds:(data["pausedMs"] as? Double ?? 0)/1000,stoppedAt:TimerAccess.shared.pendingAt(id:id),pending:TimerAccess.shared.pendingAt(id:id) != nil)
            Task { @MainActor in
                guard self.lastVersion == version else { return }
                for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId != id { await activity.end(nil,dismissalPolicy:.immediate) }
                guard self.lastVersion == version else { return }
                if let activity=Activity<ForgeActivity>.activities.first(where:{$0.attributes.entryId == id}) { await activity.update(ActivityContent(state:state,staleDate:nil)) }
                else if ActivityAuthorizationInfo().areActivitiesEnabled {
                    do { _=try Activity.request(attributes:ForgeActivity(entryId:id),content:ActivityContent(state:state,staleDate:nil),pushType:nil) }
                    catch { self.lastVersion="";self.showError("Live Activity: "+error.localizedDescription) }
                } else { self.showError("Увімкни Live Activities для Life Forge у налаштуваннях iPhone.") }
            }
        }
        func parse(_ value:String) -> Date? { let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:value) ?? ISO8601DateFormatter().date(from:value) }
        func showError(_ message:String) { guard let data=try? JSONSerialization.data(withJSONObject:["message":message]),let json=String(data:data,encoding:.utf8) else { return };DispatchQueue.main.async { self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('life-forge-native-error',{detail:"+json+"}))",completionHandler:nil) } }
    }
}

// iOS supplies location events, not a feed of other applications or phone use.
final class ForgeLocation:NSObject,CLLocationManagerDelegate {
    static let shared=ForgeLocation()
    weak var webView:WKWebView?
    private let manager=CLLocationManager()
    private var enabled=UserDefaults.standard.bool(forKey:"forge.location.enabled")
    private var sending=false
    private var lastAt:Date?
    private let device:String
    private var queue:[[String:Any]]=[]
    private let queueURL:URL
    override init() {
        device=UserDefaults.standard.string(forKey:"forge.location.device") ?? UUID().uuidString
        UserDefaults.standard.set(device,forKey:"forge.location.device")
        queueURL=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("location-queue.json")
        super.init()
        try? FileManager.default.createDirectory(at:queueURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        if let data=try? Data(contentsOf:queueURL),let values=try? JSONSerialization.jsonObject(with:data) as? [[String:Any]] { queue=values }
        manager.delegate=self;manager.desiredAccuracy=kCLLocationAccuracyHundredMeters;manager.distanceFilter=100
        manager.allowsBackgroundLocationUpdates=true;manager.showsBackgroundLocationIndicator=true;manager.pausesLocationUpdatesAutomatically=true
        if enabled { startAuthorized() }
        NotificationCenter.default.addObserver(self,selector:#selector(wake),name:UIApplication.didBecomeActiveNotification,object:nil)
    }
    @objc private func wake(){if enabled { startAuthorized() };flush();publish()}
    func setEnabled(_ value:Bool){
        enabled=value;UserDefaults.standard.set(value,forKey:"forge.location.enabled")
        if value { if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() } else { startAuthorized() } }
        else { manager.stopUpdatingLocation();manager.stopMonitoringSignificantLocationChanges() }
        publish()
    }
    private func startAuthorized(){
        guard enabled else { return }
        let status=manager.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else { publish();return }
        manager.startUpdatingLocation();manager.startMonitoringSignificantLocationChanges()
        if status == .authorizedWhenInUse && !UserDefaults.standard.bool(forKey:"forge.location.always-requested") {
            UserDefaults.standard.set(true,forKey:"forge.location.always-requested");manager.requestAlwaysAuthorization()
        }
        flush();publish()
    }
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager){startAuthorized()}
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]){
        guard enabled else { return }
        for l in locations {
            guard l.horizontalAccuracy>=0,abs(l.timestamp.timeIntervalSinceNow)<300,lastAt == nil || l.timestamp.timeIntervalSince(lastAt!)>=60 else { continue }
            let at=Int64(l.timestamp.timeIntervalSince1970*1000)
            queue.append(["id":UUID().uuidString,"deviceId":device,"source":"ios","kind":"location","startedAtMs":at,"endedAtMs":at,"latitude":l.coordinate.latitude,"longitude":l.coordinate.longitude,"accuracy":l.horizontalAccuracy]);lastAt=l.timestamp
        }
        persist();flush();publish()
    }
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){publish(error:error.localizedDescription)}
    private func persist(){if let data=try? JSONSerialization.data(withJSONObject:queue){try? data.write(to:queueURL,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])}}
    func flush(){
        guard !sending,!queue.isEmpty else { return };sending=true
        let records=Array(queue.prefix(100)),ids=Set(records.compactMap{$0["id"] as? String})
        let task=UIApplication.shared.beginBackgroundTask(withName:"Life Forge location sync")
        Task {
            do { try await TimerAccess.shared.sendObservations(records);await MainActor.run { self.queue.removeAll{ids.contains($0["id"] as? String ?? "")};self.persist();self.sending=false;UIApplication.shared.endBackgroundTask(task);self.publish();self.flush() } }
            catch { await MainActor.run { self.sending=false;UIApplication.shared.endBackgroundTask(task);self.publish(error:"Геолокація збережена на телефоні; синхронізація очікує входу або мережі.") } }
        }
    }
    func publish(error:String? = nil){
        let status=manager.authorizationStatus
        let active=enabled && (status == .authorizedAlways || status == .authorizedWhenInUse)
        var payload:[String:Any]=["enabled":active,"message":enabled ? (status == .authorizedAlways ? "Геолокація у фоні · черга \(queue.count)" : "Для фону дозволь «Завжди» в налаштуваннях iPhone · черга \(queue.count)") : "Геолокацію зупинено"]
        if let error { payload["error"]=error }
        guard let data=try? JSONSerialization.data(withJSONObject:payload),let json=String(data:data,encoding:.utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('life-forge-location-status',{detail:"+json+"}))",completionHandler:nil)
    }
}
