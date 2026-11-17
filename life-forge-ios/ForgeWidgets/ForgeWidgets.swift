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
 var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Todos",provider:ForgeTodoProvider()) { entry in ForgeTodoText(entry:entry) }.configurationDisplayName("Завдання · текст").description("Короткий список завдань без зайвих елементів.").supportedFamilies([.systemSmall,.systemMedium,.systemLarge,.accessoryRectangular,.accessoryInline]) }
}
struct ForgeTodoText:View {
 let entry:ForgeTodoEntry
 @Environment(\.widgetFamily) var family
 var body:some View {
  Group {
   if family == .accessoryInline { Text(entry.titles.first ?? "Завдання").lineLimit(1) }
   else { VStack(alignment:.leading,spacing:5) {
    if entry.updatedAt == nil { Text("Відкрий Life Forge").font(.caption) }
    else if entry.titles.isEmpty { Text("Усе зроблено").font(.caption) }
    else { ForEach(Array(entry.titles.prefix(family == .accessoryRectangular ? 2:4).enumerated()),id:\.offset) { _,title in Text(title).font(.system(size:family == .accessoryRectangular ? 13:14,weight:.medium)).lineLimit(1) } }
   }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading) }
  }.containerBackground(for:.widget){Color.clear}.widgetURL(URL(string:"lifeforge://tasks"))
 }
}
