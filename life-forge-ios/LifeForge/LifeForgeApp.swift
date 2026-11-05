import SwiftUI
import WebKit
import ActivityKit
import CoreLocation
import AVFoundation
import UserNotifications
import WidgetKit

enum ForgeRoute: String { case day,now,principles,reflection,tomorrow }
struct ForgeRouteRequest { let id=UUID();let route:ForgeRoute }
@main struct LifeForgeApp: App {
    init() { _ = ForgeLocation.shared;_ = ForgeSleep.shared;WidgetCenter.shared.reloadAllTimelines() }
    @State private var routeRequest:ForgeRouteRequest?
    var body: some Scene { WindowGroup {
        Group {
            if routeRequest?.route == .principles || ProcessInfo.processInfo.arguments.contains("--widget-preview") {
                ForgePrinciplesPreview().overlay(alignment:.bottomTrailing) { if !ProcessInfo.processInfo.arguments.contains("--widget-preview") { Button("Закрити") { routeRequest=nil }.padding().background(.ultraThinMaterial,in:Capsule()).padding() } }
            } else { ForgeWebView(routeRequest:routeRequest).ignoresSafeArea(edges:.bottom).preferredColorScheme(.dark) }
        }.onReceive(NotificationCenter.default.publisher(for:Notification.Name("forge.route"))) { event in
            if let name=event.object as? String,let route=ForgeRoute(rawValue:name) { routeRequest=ForgeRouteRequest(route:route);UserDefaults.standard.removeObject(forKey:"forge.pending-route") }
        }.onAppear { if let name=UserDefaults.standard.string(forKey:"forge.pending-route"),let route=ForgeRoute(rawValue:name) { routeRequest=ForgeRouteRequest(route:route);UserDefaults.standard.removeObject(forKey:"forge.pending-route") } }.onReceive(NotificationCenter.default.publisher(for:Notification.Name("forge.principles"))) { _ in routeRequest=ForgeRouteRequest(route:.principles) }
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
        config.userContentController.add(context.coordinator,name:"lifeForgeSleep")
        config.userContentController.add(context.coordinator,name:"lifeForgeReminders")
        config.userContentController.add(context.coordinator,name:"lifeForgeWidgets")
        config.userContentController.add(context.coordinator,name:"lifeForgeLocation")
        let view=WKWebView(frame:.zero,configuration:config)
        view.isOpaque=false;view.backgroundColor = .black;view.scrollView.backgroundColor = .black
        view.allowsBackForwardNavigationGestures=true;context.coordinator.webView=view
        view.navigationDelegate=context.coordinator;view.uiDelegate=context.coordinator
        context.coordinator.observe()
        view.load(URLRequest(url:TimerAccess.site));return view
    }
    func updateUIView(_ view:WKWebView,context:Context) {
        if let request=routeRequest,context.coordinator.lastRequest != request.id {
            context.coordinator.lastRequest=request.id;context.coordinator.pendingRoute=request.route;context.coordinator.navigate()
        }
    }
    static func dismantleUIView(_ view:WKWebView,coordinator:Coordinator) { view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeTimer");view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeSleep");view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeReminders");view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeWidgets");view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeLocation") }
    final class Coordinator: NSObject,WKScriptMessageHandler,WKNavigationDelegate,WKUIDelegate {
        weak var webView: WKWebView?
        var timerSnapshot:[String:Any]?
        var hasTimerSnapshot=false
        var timerGeneration=0
        var timerSyncing=false
        var lastRequest:UUID?
        var pendingRoute:ForgeRoute?
        // Reuse the iOS camera decision; WebKit's default is to prompt for each view.
        // Only our own top-level camera requests receive this grant.
        func webView(_ webView:WKWebView,requestMediaCapturePermissionFor origin:WKSecurityOrigin,initiatedByFrame frame:WKFrameInfo,type:WKMediaCaptureType,decisionHandler:@escaping (WKPermissionDecision)->Void) {
            guard origin.protocol=="https",origin.host==TimerAccess.site.host,(origin.port==0 || origin.port==443),
                  frame.isMainFrame,frame.request.url?.scheme=="https",frame.request.url?.host==TimerAccess.site.host,
                  type == .camera else { decisionHandler(.deny);return }
            switch AVCaptureDevice.authorizationStatus(for:.video) {
            case .authorized: decisionHandler(.grant)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for:.video) { allowed in DispatchQueue.main.async { decisionHandler(allowed ? .grant : .deny) } }
            default: decisionHandler(.deny)
            }
        }
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
        // ChatGPT sign-in opens its authorization step in a new browsing
        // context. WKWebView does nothing with that request unless the UI
        // delegate supplies another view, so continue it in this same view.
        func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }
        func observe() { NotificationCenter.default.addObserver(self,selector:#selector(wake),name:UIApplication.didBecomeActiveNotification,object:nil) }
        deinit { NotificationCenter.default.removeObserver(self) }
        @objc func wake() { navigate();Task { await TimerAccess.shared.flush();await MainActor.run { self.webView?.evaluateJavaScript("window.dispatchEvent(new Event('online'))",completionHandler:nil) } } }
        func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
            guard message.frameInfo.isMainFrame,message.frameInfo.request.url?.scheme == "https",message.frameInfo.request.url?.host == TimerAccess.site.host,
                  let payload=message.body as? [String:Any] else { return }
            if message.name=="lifeForgeWidgets" { if (message.body as? [String:Any])?["action"] as? String == "preview" { NotificationCenter.default.post(name:Notification.Name("forge.principles"),object:nil) };WidgetCenter.shared.reloadAllTimelines();publishWidgetStatus();return }
            if message.name=="lifeForgeSleep" { ForgeSleep.shared.schedule(payload);return }
            if message.name=="lifeForgeReminders" { ForgeSleep.shared.scheduleReminders(payload);return }
            if message.name=="lifeForgeLocation" {
                webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                    do { try TimerAccess.shared.save(cookies);ForgeLocation.shared.setEnabled(payload["enabled"] as? Bool == true) } catch { self.showError(error.localizedDescription) }
                };return
            }
            timerSnapshot=payload["active"] as? [String:Any];hasTimerSnapshot=true;timerGeneration+=1
            TimerAccess.shared.rememberActive(timerSnapshot)
            webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                do { try TimerAccess.shared.save(cookies) } catch { self.showError(error.localizedDescription) }
            }
            synchronizeTimer()
        }
        // Serialize snapshots: a late "no timer" must not erase a newly started sleep.
        // A failed/background request is retried with the next fresh web snapshot.
        func synchronizeTimer() {
            guard hasTimerSnapshot,!timerSyncing else { return };timerSyncing=true
            Task { @MainActor in
                defer { self.timerSyncing=false }
                while true {
                    let generation=self.timerGeneration
                    guard let data=self.timerSnapshot,let id=data["id"] as? String else {
                        for activity in Activity<ForgeActivity>.activities where activity.content.state.category != "sleep-prompt" {
                            if generation != self.timerGeneration { break }
                            await activity.end(nil,dismissalPolicy:.immediate)
                        }
                        if generation != self.timerGeneration { continue }
                        self.publishTimerStatus("idle","Активного таймера немає.");return
                    }
                    guard let title=data["title"] as? String,let category=data["category"] as? String,let raw=data["startedAt"] as? String,let started=self.parse(raw) else {
                        self.publishTimerStatus("error","Не вдалося прочитати активний таймер.",id:id);return
                    }
                    guard self.widgetExtensionPresent() else { self.publishTimerStatus("missing-extension","В установленій копії немає модуля картки. Встанови IPA зі збереженим LiveTimer.",id:id);return }
                    guard ActivityAuthorizationInfo().areActivitiesEnabled else { self.publishTimerStatus("disabled","Дозволь Live Activities («Дії наживо») у Параметрах iPhone → Life Forge.",id:id);return }
                    let state=ForgeActivity.ContentState(title:title,category:category,startedAt:started,pausedAt:(data["pausedAt"] as? String).flatMap(self.parse),pausedSeconds:(data["pausedMs"] as? Double ?? 0)/1000,stoppedAt:TimerAccess.shared.pendingAt(id:id),pending:TimerAccess.shared.pendingAt(id:id) != nil)
                    let existing=Activity<ForgeActivity>.activities.first { $0.attributes.entryId==id && ($0.activityState == .active || $0.activityState == .stale) }
                    guard existing != nil || UIApplication.shared.applicationState == .active else { self.publishTimerStatus("waiting","Відкрий Life Forge, щоб показати таймер на екрані блокування.",id:id);return }
                    for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId != id || (activity.activityState != .active && activity.activityState != .stale) {
                        if generation != self.timerGeneration { break }
                        await activity.end(nil,dismissalPolicy:.immediate)
                    }
                    if generation != self.timerGeneration { continue }
                    do {
                        if let activity=existing { await activity.update(ActivityContent(state:state,staleDate:nil)) }
                        else {
                            guard UIApplication.shared.applicationState == .active else { self.publishTimerStatus("waiting","Відкрий Life Forge для запуску картки.",id:id);return }
                            _=try Activity.request(attributes:ForgeActivity(entryId:id),content:ActivityContent(state:state,staleDate:nil),pushType:nil)
                        }
                        if generation != self.timerGeneration { continue }
                        self.publishTimerStatus("active","Таймер передано iOS · на екрані блокування є кнопка завершення.",id:id)
                    } catch { self.publishTimerStatus("error","iOS не запустила картку: "+error.localizedDescription,id:id) }
                    if generation == self.timerGeneration { return }
                }
            }
        }
        func widgetExtensionPresent() -> Bool {
            guard let folder=Bundle.main.builtInPlugInsURL else { return false }
            return ((try? FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil)) ?? []).contains { $0.pathExtension=="appex" && Bundle(url:$0)?.object(forInfoDictionaryKey:"NSExtension") is [String:Any] }
        }
        func publishTimerStatus(_ state:String,_ message:String,id:String?=nil) {
            var info:[String:Any] = ["state":state,"message":message,"version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "?"]
            if let id { info["entryId"]=id }
            guard let data=try? JSONSerialization.data(withJSONObject:info),let json=String(data:data,encoding:.utf8) else { return }
            webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('life-forge-timer-status',{detail:"+json+"}))",completionHandler:nil)
        }
        func publishWidgetStatus() {
            let urls=(try? FileManager.default.contentsOfDirectory(at:Bundle.main.builtInPlugInsURL ?? Bundle.main.bundleURL,includingPropertiesForKeys:nil)) ?? []
            let modules=urls.filter { $0.pathExtension=="appex" }.compactMap { url -> [String:Any]? in
                guard let bundle=Bundle(url:url),let id=bundle.bundleIdentifier else { return nil }
                return ["name":url.lastPathComponent,"id":id,"validPrefix":id.hasPrefix((Bundle.main.bundleIdentifier ?? "")+"."),"widgetKit":(bundle.object(forInfoDictionaryKey:"NSExtension") as? [String:Any])?["NSExtensionPointIdentifier"] as? String == "com.apple.widgetkit-extension"]
            }
            let present=modules.contains { ($0["widgetKit"] as? Bool)==true }
            WidgetCenter.shared.getCurrentConfigurations { result in
                var info:[String:Any] = ["version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "?","extensionPresent":present,"liveActivities":ActivityAuthorizationInfo().areActivitiesEnabled,"modules":modules,"osVersion":UIDevice.current.systemVersion,"bundleId":Bundle.main.bundleIdentifier ?? "?","philosophyPresent":modules.contains { ($0["name"] as? String)=="ForgeWidgets.appex" }]
                switch result { case .success(let widgets):info["configured"]=widgets.count;case .failure(let error):info["error"]=error.localizedDescription }
                guard let data=try? JSONSerialization.data(withJSONObject:info),let json=String(data:data,encoding:.utf8) else { return }
                DispatchQueue.main.async { self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('life-forge-widget-status',{detail:"+json+"}))",completionHandler:nil) }
            }
        }
        func parse(_ value:String) -> Date? { let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:value) ?? ISO8601DateFormatter().date(from:value) }
        func showError(_ message:String) { guard let data=try? JSONSerialization.data(withJSONObject:["message":message]),let json=String(data:data,encoding:.utf8) else { return };DispatchQueue.main.async { self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('life-forge-native-error',{detail:"+json+"}))",completionHandler:nil) } }
    }
}

// Visit timestamps come from Core Location; a sparse position never becomes an invented stay.
private struct ForgeVisitEvidence:Codable {
    let arrivedAtMs:Int64
    let departedAtMs:Int64?
    let latitude:Double
    let longitude:Double
    let accuracy:Double
}
final class ForgeLocation:NSObject,CLLocationManagerDelegate {
    static let shared=ForgeLocation()
    weak var webView:WKWebView?
    private let manager=CLLocationManager()
    private var enabled=UserDefaults.standard.bool(forKey:"forge.location.enabled")
    private var watching=false
    private var sending=false
    private var lastAt:Date?
    private var lastFixAt:Date?
    private var oneShotPending=false
    private var fixDeadline:DispatchWorkItem?
    private var pendingVisit:ForgeVisitEvidence?
    private var visitFixes:[String:ForgeVisitEvidence]=[:]
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
        if let data=UserDefaults.standard.data(forKey:"forge.location.visit-fixes"),let values=try? JSONDecoder().decode([String:ForgeVisitEvidence].self,from:data) { visitFixes=values }
        manager.delegate=self;manager.desiredAccuracy=kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter=100;manager.allowsBackgroundLocationUpdates=false
        manager.showsBackgroundLocationIndicator=false;manager.pausesLocationUpdatesAutomatically=true
        NotificationCenter.default.addObserver(self,selector:#selector(wake),name:UIApplication.didBecomeActiveNotification,object:nil)
        if enabled { startAuthorized() }
    }
    @objc private func wake(){if enabled { startAuthorized();if lastFixAt == nil || Date().timeIntervalSince(lastFixAt!)>=300 { requestFix() } };flush();publish()}
    func setEnabled(_ value:Bool){
        let wasEnabled=enabled;enabled=value;UserDefaults.standard.set(value,forKey:"forge.location.enabled")
        if value {
            if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            else { startAuthorized();if !wasEnabled && UIApplication.shared.applicationState == .active { requestFix() } }
        } else {
            manager.stopUpdatingLocation();manager.stopMonitoringSignificantLocationChanges();manager.stopMonitoringVisits()
            watching=false;finishFix();pendingVisit=nil
        }
        publish()
    }
    private func startAuthorized(){
        guard enabled else { return };let status=manager.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else { manager.stopUpdatingLocation();manager.stopMonitoringSignificantLocationChanges();manager.stopMonitoringVisits();watching=false;publish();return }
        // Never enter a continuous background navigation session.
        if status == .authorizedAlways {
            if !watching { manager.stopUpdatingLocation();manager.startMonitoringSignificantLocationChanges();manager.startMonitoringVisits();watching=true }
        } else {
            manager.stopMonitoringSignificantLocationChanges();manager.stopMonitoringVisits();watching=false
            if !UserDefaults.standard.bool(forKey:"forge.location.always-requested") { UserDefaults.standard.set(true,forKey:"forge.location.always-requested");manager.requestAlwaysAuthorization() }
        }
        if UIApplication.shared.applicationState == .active && lastFixAt == nil { requestFix() }
        flush();publish()
    }
    private func requestFix(){
        guard enabled,!oneShotPending,manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse && UIApplication.shared.applicationState == .active else { return }
        oneShotPending=true;lastFixAt=Date();manager.requestLocation()
        let deadline=DispatchWorkItem { [weak self] in guard let self,self.oneShotPending else { return };self.manager.stopUpdatingLocation();self.finishFix();self.pendingVisit=nil;self.publish() }
        fixDeadline=deadline;DispatchQueue.main.asyncAfter(deadline:.now()+25,execute:deadline)
    }
    private func finishFix(){fixDeadline?.cancel();fixDeadline=nil;oneShotPending=false}
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager){startAuthorized()}
    private func append(_ location:CLLocation,visit:ForgeVisitEvidence? = nil,force:Bool = false){
        guard location.horizontalAccuracy>=0,location.horizontalAccuracy<=100000,abs(location.timestamp.timeIntervalSinceNow)<300 else { return }
        guard force || lastAt == nil || location.timestamp.timeIntervalSince(lastAt!)>=60 else { return }
        let at=Int64(location.timestamp.timeIntervalSince1970*1000)
        var record:[String:Any]=["id":UUID().uuidString,"deviceId":device,"source":"ios","kind":"location","startedAtMs":at,"endedAtMs":at,"latitude":location.coordinate.latitude,"longitude":location.coordinate.longitude,"accuracy":location.horizontalAccuracy]
        if let visit { record["visit"]=["arrivedAtMs":visit.arrivedAtMs,"departedAtMs":visit.departedAtMs.map { $0 as Any } ?? NSNull()] }
        queue.append(record);lastAt=location.timestamp
    }
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]){
        guard enabled else { return };let candidate=pendingVisit;pendingVisit=nil
        for l in locations {
            var evidence:ForgeVisitEvidence?
            if let v=candidate,l.timestamp.timeIntervalSinceNow > -30,l.horizontalAccuracy>=0,l.horizontalAccuracy<v.accuracy,l.distance(from:CLLocation(latitude:v.latitude,longitude:v.longitude))<=max(150,v.accuracy+l.horizontalAccuracy),Int64(l.timestamp.timeIntervalSince1970*1000)>=v.arrivedAtMs {
                let refined=ForgeVisitEvidence(arrivedAtMs:v.arrivedAtMs,departedAtMs:nil,latitude:l.coordinate.latitude,longitude:l.coordinate.longitude,accuracy:l.horizontalAccuracy)
                evidence=refined;visitFixes[String(v.arrivedAtMs)]=refined;saveVisitFixes()
            }
            append(l,visit:evidence,force:evidence != nil)
        }
        finishFix();persist();flush();publish()
    }
    func locationManager(_ manager:CLLocationManager,didVisit visit:CLVisit){
        guard enabled,manager.authorizationStatus == .authorizedAlways else { return }
        let now=Date(),arrival=visit.arrivalDate,departure=visit.departureDate
        guard arrival != .distantPast,arrival<=now,now.timeIntervalSince(arrival)<=30*86400 else { return }
        let arrived=Int64(arrival.timeIntervalSince1970*1000),departed=departure == .distantFuture ? nil : Int64(departure.timeIntervalSince1970*1000)
        guard departed == nil || departed!>=arrived && departed!<=Int64(now.timeIntervalSince1970*1000) else { return }
        let cached=visitFixes[String(arrived)]
        let evidence=ForgeVisitEvidence(arrivedAtMs:arrived,departedAtMs:departed,latitude:cached?.latitude ?? visit.coordinate.latitude,longitude:cached?.longitude ?? visit.coordinate.longitude,accuracy:cached?.accuracy ?? visit.horizontalAccuracy)
        let location=CLLocation(coordinate:CLLocationCoordinate2D(latitude:evidence.latitude,longitude:evidence.longitude),altitude:0,horizontalAccuracy:evidence.accuracy,verticalAccuracy:-1,timestamp:now)
        append(location,visit:evidence,force:true)
        if departed == nil { pendingVisit=evidence;requestFix() } else { visitFixes.removeValue(forKey:String(arrived));saveVisitFixes() }
        persist();flush();publish()
    }
    private func saveVisitFixes(){
        if visitFixes.count>16 { let keep=Set(visitFixes.values.sorted{$0.arrivedAtMs>$1.arrivedAtMs}.prefix(16).map{String($0.arrivedAtMs)});visitFixes=visitFixes.filter{keep.contains($0.key)} }
        if let data=try? JSONEncoder().encode(visitFixes) { UserDefaults.standard.set(data,forKey:"forge.location.visit-fixes") }
    }
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){finishFix();pendingVisit=nil;publish(error:error.localizedDescription)}
    private func persist(){do { let data=try JSONSerialization.data(withJSONObject:queue);try data.write(to:queueURL,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]) } catch { publish(error:"Не вдалося записати геолокацію на телефон. Перевір вільне місце.") }}
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
        let status=manager.authorizationStatus,active=enabled && (manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse)
        let message=enabled ? (status == .authorizedAlways ? "Пасивна геолокація · системні відвідування · черга \(queue.count)" : "Для пасивного запису у фоні дозволь «Завжди» · черга \(queue.count)") : "Геолокацію зупинено"
        var payload:[String:Any]=["enabled":active,"mode":"passive","background":status == .authorizedAlways,"message":message]
        if let error { payload["error"]=error }
        guard let data=try? JSONSerialization.data(withJSONObject:payload),let json=String(data:data,encoding:.utf8) else { return }
        webView?.evaluateJavaScript("window.__forgeLocationStatus="+json+";window.dispatchEvent(new CustomEvent('life-forge-location-status',{detail:"+json+"}))",completionHandler:nil)
    }
}

// Local alerts keep working with the web view closed. They never create sleep facts without a tap.
final class ForgeSleep:NSObject,UNUserNotificationCenterDelegate {
    static let shared=ForgeSleep()
    private var signature=""
    private var reminderSignature=""
    override init() {
        super.init();let center=UNUserNotificationCenter.current();center.delegate=self
        let yes=UNNotificationAction(identifier:"forge.sleep.yes",title:"Так, спати",options:[.foreground])
        let later=UNNotificationAction(identifier:"forge.sleep.later",title:"Пізніше",options:[])
        let reflect=UNNotificationAction(identifier:"forge.reflection.open",title:"Записати враження",options:[.foreground])
        let tomorrow=UNNotificationAction(identifier:"forge.tomorrow",title:"План на завтра",options:[.foreground])
        center.setNotificationCategories([UNNotificationCategory(identifier:"forge.sleep",actions:[yes,later],intentIdentifiers:[],options:[]),UNNotificationCategory(identifier:"forge.reflection",actions:[reflect,tomorrow],intentIdentifiers:[],options:[])])
    }
    func schedule(_ payload:[String:Any]) {
        guard let entries=payload["schedule"] as? [[String:Any]],let bytes=try? JSONSerialization.data(withJSONObject:entries,options:.sortedKeys) else { return }
        let next=bytes.base64EncodedString();guard next != signature else { return };signature=next
        let center=UNUserNotificationCenter.current()
        center.requestAuthorization(options:[.alert,.sound]) { allowed,_ in
            guard allowed else { return }
            center.getPendingNotificationRequests { pending in
                center.removePendingNotificationRequests(withIdentifiers:pending.filter{$0.identifier.hasPrefix("forge.sleep.")}.map{$0.identifier})
                for item in entries.prefix(28) {
                    guard let id=item["id"] as? String,let ms=item["at"] as? Double else { continue }
                    let interval=ms/1000-Date().timeIntervalSince1970;guard interval>1 else { continue }
                    let content=UNMutableNotificationContent();content.title="Пора спати?";content.body="Так — почати сон зараз. Без відповіді залишиться твій план.";content.sound = .default;content.categoryIdentifier="forge.sleep"
                    center.add(UNNotificationRequest(identifier:"forge.sleep."+id,content:content,trigger:UNTimeIntervalNotificationTrigger(timeInterval:interval,repeats:false)))
                }
            }
        }
    }
    func scheduleReminders(_ payload:[String:Any]) {
        guard let entries=payload["schedule"] as? [[String:Any]],let bytes=try? JSONSerialization.data(withJSONObject:payload,options:.sortedKeys) else { return }
        let next=bytes.base64EncodedString();guard next != reminderSignature else { return };reminderSignature=next
        let center=UNUserNotificationCenter.current(),reflection=payload["reflection"] as? Bool == true
        center.requestAuthorization(options:[.alert,.sound]) { allowed,_ in
            guard allowed else { return }
            center.getPendingNotificationRequests { pending in
                DispatchQueue.main.async {
                    guard self.reminderSignature==next else { return }
                    center.removePendingNotificationRequests(withIdentifiers:pending.filter{$0.identifier.hasPrefix("forge.reminder.")}.map{$0.identifier})
                    // One repeating alert survives long periods with the app closed.
                    // 48 task alerts + 14 sleep alerts + this daily alert fit iOS's limit.
                    if reflection {
                        let content=UNMutableNotificationContent();content.title="Як минув день?";content.body="Запиши враження й переглянь план на завтра.";content.sound = .default;content.categoryIdentifier="forge.reflection";content.userInfo=["route":"reflection"]
                        var date=DateComponents();date.timeZone=TimeZone(identifier:"America/New_York");date.hour=23;date.minute=0
                        center.add(UNNotificationRequest(identifier:"forge.reminder.reflection",content:content,trigger:UNCalendarNotificationTrigger(dateMatching:date,repeats:true)))
                    }
                    for item in entries.prefix(48) {
                        guard let id=item["id"] as? String,let ms=item["at"] as? Double,let title=item["title"] as? String,let body=item["body"] as? String else { continue }
                        let interval=ms/1000-Date().timeIntervalSince1970;guard interval>1 else { continue }
                        let content=UNMutableNotificationContent();content.title=title;content.body=body;content.sound = .default;content.userInfo=["route":"day"]
                        center.add(UNNotificationRequest(identifier:"forge.reminder."+id,content:content,trigger:UNTimeIntervalNotificationTrigger(timeInterval:interval,repeats:false)))
                    }
                }
            }
        }
    }
    func userNotificationCenter(_ center:UNUserNotificationCenter,willPresent notification:UNNotification,withCompletionHandler completionHandler:@escaping (UNNotificationPresentationOptions)->Void) { completionHandler([.banner,.sound]) }
    func userNotificationCenter(_ center:UNUserNotificationCenter,didReceive response:UNNotificationResponse,withCompletionHandler completionHandler:@escaping ()->Void) {
        guard response.actionIdentifier=="forge.sleep.yes" else {
            if response.actionIdentifier != UNNotificationDismissActionIdentifier {
                let route=response.actionIdentifier=="forge.tomorrow" ? "tomorrow":(response.notification.request.content.userInfo["route"] as? String ?? "day")
                UserDefaults.standard.set(route,forKey:"forge.pending-route")
                DispatchQueue.main.async { NotificationCenter.default.post(name:Notification.Name("forge.route"),object:route) }
            };completionHandler();return
        }
        // Capture the tap, before authentication/network latency.
        UserDefaults.standard.set(["id":UUID().uuidString,"at":Date().timeIntervalSince1970],forKey:"forge.pending-sleep")
        Task { @MainActor in do { try await TimerAccess.shared.confirmSleep() } catch { } ;completionHandler() }
    }
}
