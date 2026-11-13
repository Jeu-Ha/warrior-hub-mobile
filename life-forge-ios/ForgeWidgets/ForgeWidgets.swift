import SwiftUI
import WidgetKit
import Security

// Static home-screen reminders intentionally have no authentication, network,
// ActivityKit state or dependency on the timer extension's initialization.
@main struct ForgePhilosophyBundle:WidgetBundle {
    var body:some Widget { ForgeAimWidget();ForgePlanWidget();ForgeKindWidget();ForgeAllPrinciplesWidget();ForgeTodoWidget() }
}
struct PrincipleEntry:TimelineEntry { let date:Date }
struct PrincipleProvider:TimelineProvider {
    func placeholder(in context:Context)->PrincipleEntry { PrincipleEntry(date:Date()) }
    func getSnapshot(in context:Context,completion:@escaping(PrincipleEntry)->Void) { completion(PrincipleEntry(date:Date())) }
    func getTimeline(in context:Context,completion:@escaping(Timeline<PrincipleEntry>)->Void) { completion(Timeline(entries:[PrincipleEntry(date:Date())],policy:.never)) }
}
struct PrincipleWidgetView:View {
    let index:Int
    @Environment(\.widgetFamily) var family
    var body:some View {
        ForgePrincipleCard(index:index,compact:family == .systemSmall)
            .containerBackground(for:.widget) { ForgePrinciple.ink }.widgetURL(URL(string:"lifeforge://principles")!)
    }
}

struct ForgeAimWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Aim",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:0)}.configurationDisplayName("Амбіція").description("Смілива мета перед очима.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgePlanWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Plan",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:1)}.configurationDisplayName("План").description("Перетвори бажання на наступний крок.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgeKindWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Kind",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:2)}.configurationDisplayName("Доброта").description("Досягай свого, підтримуючи інших.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgeAllPrinciplesWidget:Widget {
    @Environment(\.widgetFamily) var family
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.All",provider:PrincipleProvider()) { _ in AllPrinciplesView() }.configurationDisplayName("Три опори").description("Усі три принципи разом. За відео SkyBoi про Technoblade.").supportedFamilies([.systemMedium,.systemLarge]) }
}
struct AllPrinciplesView:View {
    @Environment(\.widgetFamily) var family
    var body:some View {
        ForgePrincipleArt(index:-1,labels:false)
            .containerBackground(for:.widget) { ForgePrinciple.ink }.widgetURL(URL(string:"lifeforge://principles")!)
    }
}

struct ForgeTodoEntry:TimelineEntry { let date:Date;let titles:[String];let updatedAt:Date? }
struct ForgeTodoProvider:TimelineProvider {
 func placeholder(in context:Context)->ForgeTodoEntry { ForgeTodoEntry(date:Date(),titles:[],updatedAt:nil) }
 func getSnapshot(in context:Context,completion:@escaping(ForgeTodoEntry)->Void) { completion(read()) }
 func getTimeline(in context:Context,completion:@escaping(Timeline<ForgeTodoEntry>)->Void) { completion(Timeline(entries:[read()],policy:.after(Date().addingTimeInterval(900)))) }
 func read()->ForgeTodoEntry {
  let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:"life-forge.todo-snapshot",kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne];var result:CFTypeRef?
  guard SecItemCopyMatching(q as CFDictionary,&result)==errSecSuccess,let data=result as? Data,let obj=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let todos=obj["todos"] as? [[String:Any]] else { return ForgeTodoEntry(date:Date(),titles:[],updatedAt:nil) }
  return ForgeTodoEntry(date:Date(),titles:todos.compactMap{$0["title"] as? String},updatedAt:(obj["updatedAt"] as? Double).map{Date(timeIntervalSince1970:$0)})
 }
}
struct ForgeTodoWidget:Widget {
 var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Todos",provider:ForgeTodoProvider()) { entry in
  VStack(alignment:.leading,spacing:9) { Text("ТВІЙ НАСТУПНИЙ ХІД").font(.caption2.bold()).foregroundStyle(.red)
   if entry.updatedAt == nil { Text("Відкрий Life Forge для синхронізації").font(.caption) }
   else if entry.titles.isEmpty { Text("Усе зроблено").font(.headline) }
   else { ForEach(Array(entry.titles.prefix(5).enumerated()),id:\.offset) { _,title in HStack(alignment:.top) { Text("○").foregroundStyle(.red);Text(title).font(.caption.bold()).lineLimit(2) } } }
   if let date=entry.updatedAt { Text(date,style:.time).font(.caption2).foregroundStyle(.secondary) }
  }.frame(maxWidth:.infinity,alignment:.leading).containerBackground(for:.widget){Color(red:0.08,green:0.06,blue:0.1)}.widgetURL(URL(string:"lifeforge://day"))
 }.configurationDisplayName("Завдання").description("Наступні завдання. Оновлюються після відкриття Life Forge; спільний доступ Keychain залежить від підпису.").supportedFamilies([.systemSmall,.systemMedium,.systemLarge]) }
}

