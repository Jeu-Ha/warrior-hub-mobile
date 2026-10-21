import SwiftUI
import WidgetKit

// Static home-screen reminders intentionally have no authentication, network,
// ActivityKit state or dependency on the timer extension's initialization.
@main struct ForgePhilosophyBundle:WidgetBundle {
    var body:some Widget { ForgeAimWidget();ForgePlanWidget();ForgeKindWidget();ForgeAllPrinciplesWidget() }
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
