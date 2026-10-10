import Foundation
import Security
import ActivityKit
import AppIntents

final class TimerAccess: NSObject, URLSessionTaskDelegate {
    static let shared = TimerAccess()
    static let site = URL(string: "https://life-forge.sassycocoa.chatgpt.site")!
    private let key = "life-forge.site-session"
    func save(_ cookies: [HTTPCookie]) throws {
        let host = Self.site.host!
        let filtered = cookies.filter { host == $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) || host.hasSuffix("." + $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
        let values = filtered.map { ["name":$0.name,"value":$0.value,"domain":$0.domain,"path":$0.path,"secure":$0.isSecure ? "1":"0","expires":String($0.expiresDate?.timeIntervalSince1970 ?? 0)] }
        let data = try JSONSerialization.data(withJSONObject: values)
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:key]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary,nil) == errSecSuccess else { throw AccessError.session }
    }
    private func cookieHeader() throws -> String {
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:key,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary,&result) == errSecSuccess, let data=result as? Data,
              let values=try JSONSerialization.jsonObject(with:data) as? [[String:String]], !values.isEmpty else { throw AccessError.session }
        return values.filter { (Double($0["expires"] ?? "0") ?? 0) == 0 || (Double($0["expires"] ?? "0") ?? 0) > Date().timeIntervalSince1970 }.map { ($0["name"] ?? "")+"="+($0["value"] ?? "") }.joined(separator:"; ")
    }
    func stop(id: String, at: Date, sleepEndSource:String? = nil) async throws {
        var request=URLRequest(url:Self.site.appendingPathComponent("api/now"))
        request.httpMethod="POST";request.timeoutInterval=15
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.setValue(try cookieHeader(),forHTTPHeaderField:"Cookie")
        var body:[String:Any]=["action":"stop","id":id,"stoppedAt":ISO8601DateFormatter().string(from:at)]
        if let source=sleepEndSource { body["sleepEndSource"]=source }
        request.httpBody=try JSONSerialization.data(withJSONObject:body)
        let config=URLSessionConfiguration.ephemeral;config.httpShouldSetCookies=false
        let session=URLSession(configuration:config,delegate:self,delegateQueue:nil)
        defer { session.finishTasksAndInvalidate() }
        let (_, response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse else { throw AccessError.network }
        guard http.statusCode == 200 else { throw http.statusCode == 401 || http.statusCode == 302 ? AccessError.session : AccessError.network }
    }
    func sendObservations(_ records:[[String:Any]]) async throws {
        var request=URLRequest(url:Self.site.appendingPathComponent("api/observations"));request.httpMethod="POST";request.timeoutInterval=15
        request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.setValue(try cookieHeader(),forHTTPHeaderField:"Cookie")
        request.httpBody=try JSONSerialization.data(withJSONObject:["records":records])
        let config=URLSessionConfiguration.ephemeral;config.httpShouldSetCookies=false
        let session=URLSession(configuration:config,delegate:self,delegateQueue:nil);defer { session.finishTasksAndInvalidate() }
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse,http.statusCode==200,let body=try JSONSerialization.jsonObject(with:data) as? [String:Any],body["saved"] as? Bool == true,(body["ids"] as? [String])?.count==records.count else { throw AccessError.network }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    enum AccessError: LocalizedError, Equatable {
        case session,network
        var errorDescription: String? { self == .session ? "Відкрий Life Forge й увійди, щоб завершити таймер." : "Завершення очікує мережі. Відкрий Life Forge для повторної синхронізації." }
    }
    func rememberActive(_ active:[String:Any]?) {
        if let id=active?["id"] as? String,let category=active?["category"] as? String {
            UserDefaults.standard.set(["id":id,"category":category],forKey:"forge.last-active")
        } else { UserDefaults.standard.removeObject(forKey:"forge.last-active") }
    }
    func activeSleepId() async throws -> String? {
        var request=URLRequest(url:Self.site.appendingPathComponent("api/now"));request.timeoutInterval=15
        request.setValue(try cookieHeader(),forHTTPHeaderField:"Cookie")
        let config=URLSessionConfiguration.ephemeral;config.httpShouldSetCookies=false
        let session=URLSession(configuration:config,delegate:self,delegateQueue:nil)
        defer { session.finishTasksAndInvalidate() }
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse,http.statusCode==200 else { throw AccessError.session }
        guard let result=try JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw AccessError.network }
        let active=result["active"] as? [String:Any];rememberActive(active)
        return active?["category"] as? String == "sleep" ? active?["id"] as? String : nil
    }
    func rememberedSleepId() -> String? {
        guard let value=UserDefaults.standard.dictionary(forKey:"forge.last-active") as? [String:String],value["category"]=="sleep" else { return nil }
        return value["id"]
    }
    func queue(id:String,at:Date,sleepEndSource:String? = nil) {
        var values=UserDefaults.standard.dictionary(forKey:"forge.pending-stops") as? [String:Double] ?? [:]
        values[id]=values[id] ?? at.timeIntervalSince1970
        UserDefaults.standard.set(values,forKey:"forge.pending-stops")
        if let source=sleepEndSource {
            var reasons=UserDefaults.standard.dictionary(forKey:"forge.pending-stop-reasons") as? [String:String] ?? [:]
            reasons[id]=reasons[id] ?? source;UserDefaults.standard.set(reasons,forKey:"forge.pending-stop-reasons")
        }
    }
    func pendingAt(id:String) -> Date? { guard let value=(UserDefaults.standard.dictionary(forKey:"forge.pending-stops") as? [String:Double])?[id] else { return nil };return Date(timeIntervalSince1970:value) }
    func pendingReason(id:String) -> String? { (UserDefaults.standard.dictionary(forKey:"forge.pending-stop-reasons") as? [String:String])?[id] }
    func clear(id:String) {
        var values=UserDefaults.standard.dictionary(forKey:"forge.pending-stops") as? [String:Double] ?? [:]
        values.removeValue(forKey:id);UserDefaults.standard.set(values,forKey:"forge.pending-stops")
        var reasons=UserDefaults.standard.dictionary(forKey:"forge.pending-stop-reasons") as? [String:String] ?? [:]
        reasons.removeValue(forKey:id);UserDefaults.standard.set(reasons,forKey:"forge.pending-stop-reasons")
    }
    func flush() async {
        let values=UserDefaults.standard.dictionary(forKey:"forge.pending-stops") as? [String:Double] ?? [:]
        let reasons=UserDefaults.standard.dictionary(forKey:"forge.pending-stop-reasons") as? [String:String] ?? [:]
        for (id,time) in values { do { try await stop(id:id,at:Date(timeIntervalSince1970:time),sleepEndSource:reasons[id]);clear(id:id)
            for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId == id { await activity.end(nil,dismissalPolicy:.immediate) }
        } catch { } }
    }
}

enum SleepEndReason: String,AppEnum {
    case manual,alarm
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Завершення сну"
    static var caseDisplayRepresentations: [SleepEndReason:DisplayRepresentation] = [.manual:"Я прокинувся",.alarm:"Спрацював будильник"]
}
struct FinishSleepIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Завершити сон"
    static var description = IntentDescription("Завершує лише активний запис сну. Для автоматизації будильника обери «Спрацював будильник».")
    static var openAppWhenRun = false
    @Parameter(title:"Причина",default:.manual) var reason: SleepEndReason
    func perform() async throws -> some IntentResult {
        let access=TimerAccess.shared
        let id:String?
        do { id=try await access.activeSleepId() } catch { id=access.rememberedSleepId();if id==nil { throw error } }
        guard let id else { return .result() }
        let at=access.pendingAt(id:id) ?? Date();access.queue(id:id,at:at,sleepEndSource:reason.rawValue)
        do { try await access.stop(id:id,at:at,sleepEndSource:access.pendingReason(id:id) ?? reason.rawValue);access.clear(id:id)
            for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId==id { await activity.end(nil,dismissalPolicy:.immediate) }
        } catch {
            for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId==id {
                var state=activity.content.state;state.stoppedAt=at;state.pending=true
                await activity.update(ActivityContent(state:state,staleDate:nil))
            }
        }
        return .result()
    }
}

struct StopTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Завершити таймер"
    static var openAppWhenRun = false
    @Parameter(title:"Запис") var entryId: String
    init() {}
    init(entryId:String) { self.entryId=entryId }
    func perform() async throws -> some IntentResult {
        let access=TimerAccess.shared,at=access.pendingAt(id:entryId) ?? Date()
        access.queue(id:entryId,at:at)
        do { try await access.stop(id:entryId,at:at,sleepEndSource:access.pendingReason(id:entryId));access.clear(id:entryId)
            for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId == entryId { await activity.end(nil,dismissalPolicy:.immediate) }
        } catch {
            for activity in Activity<ForgeActivity>.activities where activity.attributes.entryId == entryId {
                var state=activity.content.state;state.pending=true;state.stoppedAt=at
                await activity.update(ActivityContent(state:state,staleDate:nil))
            }
        }
        return .result()
    }
}
