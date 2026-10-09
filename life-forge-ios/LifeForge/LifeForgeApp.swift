import SwiftUI
import WebKit
import ActivityKit

enum ForgeRoute: String { case day,now }
struct ForgeRouteRequest { let id=UUID();let route:ForgeRoute }
@main struct LifeForgeApp: App {
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
    static func dismantleUIView(_ view:WKWebView,coordinator:Coordinator) { view.configuration.userContentController.removeScriptMessageHandler(forName:"lifeForgeTimer") }
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
            navigate()
            DispatchQueue.main.asyncAfter(deadline:.now()+0.7) { self.navigate() }
        }
        func observe() { NotificationCenter.default.addObserver(self,selector:#selector(wake),name:UIApplication.didBecomeActiveNotification,object:nil) }
        deinit { NotificationCenter.default.removeObserver(self) }
        @objc func wake() { navigate();Task { await TimerAccess.shared.flush();await MainActor.run { self.webView?.evaluateJavaScript("window.dispatchEvent(new Event('online'))",completionHandler:nil) } } }
        func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
            guard message.frameInfo.isMainFrame,message.frameInfo.request.url?.scheme == "https",message.frameInfo.request.url?.host == TimerAccess.site.host,
                  let payload=message.body as? [String:Any] else { return }
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
