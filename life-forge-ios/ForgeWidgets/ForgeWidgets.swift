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
        Group {
            if family == .accessoryRectangular { HStack {Image(systemName:["star.fill","flag.checkered","heart.fill"][index]);Text(ForgePrinciple.all[index].title).font(.headline)} }
            else if family == .systemMedium { HStack(spacing:18) { ForgePrincipleArt(index:index).frame(width:110,height:75);VStack(alignment:.leading,spacing:8) {Text("0\(index+1) / ТРИ ОПОРИ").font(.system(size:10,weight:.black)).tracking(1);Text(ForgePrinciple.all[index].title).font(.system(size:21,weight:.black));Text(ForgePrinciple.all[index].detail).font(.system(size:13)).foregroundStyle(.white).lineLimit(3)}.frame(maxWidth:.infinity,alignment:.leading)}.foregroundStyle(ForgePrinciple.all[index].color) }
            else { ForgePrincipleCard(index:index,compact:true) }
        }.containerBackground(for:.widget) { Color(red:0.09,green:0.07,blue:0.12) }.widgetURL(URL(string:"lifeforge://principles")!)
    }
}
struct ForgeAimWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Aim",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:0)}.configurationDisplayName("01 · Цілься високо").description("Смілива мета перед очима.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgePlanWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Plan",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:1)}.configurationDisplayName("02 · Мета → план").description("Перетвори бажання на наступний крок.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgeKindWidget:Widget {
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.Kind",provider:PrincipleProvider()){_ in PrincipleWidgetView(index:2)}.configurationDisplayName("03 · Будь добрим").description("Досягай свого, підтримуючи інших.").supportedFamilies([.systemSmall,.systemMedium,.accessoryRectangular]) }
}
struct ForgeAllPrinciplesWidget:Widget {
    @Environment(\.widgetFamily) var family
    var body:some WidgetConfiguration { StaticConfiguration(kind:"LifeForge.Philosophy.All",provider:PrincipleProvider()) { _ in AllPrinciplesView() }.configurationDisplayName("Три опори").description("Усі три принципи разом. За відео SkyBoi про Technoblade.").supportedFamilies([.systemMedium,.systemLarge]) }
}
struct AllPrinciplesView:View {
    @Environment(\.widgetFamily) var family
    var body:some View {
        Group { if family == .systemLarge { VStack(spacing:12) { ForEach(0..<3) {i in HStack {ForgePrincipleArt(index:i).frame(width:90,height:65);VStack(alignment:.leading,spacing:5){Text(ForgePrinciple.all[i].title).font(.headline).foregroundStyle(ForgePrinciple.all[i].color);Text(ForgePrinciple.all[i].detail).font(.caption).foregroundStyle(.white)}}.frame(maxWidth:.infinity,alignment:.leading) } } } else { HStack(alignment:.top,spacing:12) { ForEach(0..<3) {i in ForgePrincipleCard(index:i,compact:true)} } } }
            .containerBackground(for:.widget) { Color(red:0.09,green:0.07,blue:0.12) }.widgetURL(URL(string:"lifeforge://principles")!)
    }
}
