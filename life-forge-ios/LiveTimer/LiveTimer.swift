import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

@main struct ForgeWidgetBundle: WidgetBundle { var body: some Widget { ForgeTimerWidget();ForgeDayWidget();ForgeNowWidget() } }
struct ForgeLinkEntry:TimelineEntry { let date:Date }
struct ForgeLinkProvider:TimelineProvider {
    func placeholder(in context:Context) -> ForgeLinkEntry { ForgeLinkEntry(date:Date()) }
    func getSnapshot(in context:Context,completion:@escaping (ForgeLinkEntry)->Void) { completion(ForgeLinkEntry(date:Date())) }
    func getTimeline(in context:Context,completion:@escaping (Timeline<ForgeLinkEntry>)->Void) { completion(Timeline(entries:[ForgeLinkEntry(date:Date())],policy:.never)) }
}
struct ForgeLinkView:View {
    let route:String
    @Environment(\.widgetFamily) var family
    var body:some View {
        Group {
            if family == .accessoryInline {
                Label(route=="day" ? "Мій день":"Роблю зараз",systemImage:route=="day" ? "calendar":"bolt.fill")
            } else {
                ZStack {
                    AccessoryWidgetBackground()
                    CutPaper().stroke(.white,lineWidth:2).padding(4).rotationEffect(.degrees(-8))
                    Image(systemName:route=="day" ? "calendar":"bolt.fill").font(.system(size:23,weight:.black)).widgetAccentable()
                }
            }
        }.containerBackground(for:.widget) { Color.clear }
            .widgetURL(URL(string:"lifeforge://"+route)!)
            .accessibilityLabel(route=="day" ? "Відкрити розклад сьогодні":"Відкрити Роблю зараз")
    }
}
struct ForgeDayWidget:Widget {
    let kind="LifeForge.Day"
    var body:some WidgetConfiguration {
        StaticConfiguration(kind:kind,provider:ForgeLinkProvider()) { _ in ForgeLinkView(route:"day") }
            .configurationDisplayName("Мій день").description("Сьогоднішній розклад одним дотиком.")
            .supportedFamilies([.accessoryCircular,.accessoryInline])
    }
}
struct ForgeNowWidget:Widget {
    let kind="LifeForge.Now"
    var body:some WidgetConfiguration {
        StaticConfiguration(kind:kind,provider:ForgeLinkProvider()) { _ in ForgeLinkView(route:"now") }
            .configurationDisplayName("Роблю зараз").description("Одразу відкриває вибір заняття й таймер.")
            .supportedFamilies([.accessoryCircular,.accessoryInline])
    }
}
struct CutPaper: Shape {
    func path(in rect:CGRect) -> Path { var p=Path();p.move(to:CGPoint(x:0,y:rect.height*0.13));p.addLine(to:CGPoint(x:rect.width,y:0));p.addLine(to:CGPoint(x:rect.width*0.96,y:rect.height*0.88));p.addLine(to:CGPoint(x:0,y:rect.height));p.closeSubpath();return p }
}
struct ForgeBolt: Shape {
    func path(in rect:CGRect) -> Path {
        let points:[CGPoint]=[CGPoint(x:18,y:1),CGPoint(x:5,y:18),CGPoint(x:14,y:18),CGPoint(x:12,y:31),CGPoint(x:28,y:11),CGPoint(x:17,y:11)]
        var p=Path();p.addLines(points.map{CGPoint(x:$0.x/32*rect.width,y:$0.y/32*rect.height)});p.closeSubpath();return p
    }
}
enum ForgeTheme {
    static let ink=Color(red:0.035,green:0.035,blue:0.043),paper=Color(red:0.97,green:0.953,blue:0.913),red=Color(red:0.906,green:0.11,blue:0.2)
    static func color(_ category:String) -> Color {
        switch category {case "music":return Color(red:0.725,green:0.60,blue:1);case "miners":return Color(red:0.34,green:0.86,blue:0.69);case "study":return Color(red:0.47,green:0.71,blue:1);case "gym":return Color(red:1,green:0.70,blue:0.46);case "sleep":return Color(red:0.675,green:0.65,blue:1);case "meal":return Color(red:0.94,green:0.8,blue:0.46);default:return paper}
    }
    static func icon(_ category:String) -> String {
        switch category {case "music":return "music.note";case "miners":return "map.fill";case "study":return "book.closed.fill";case "gym":return "dumbbell.fill";case "sleep":return "moon.fill";case "meal":return "fork.knife";case "break":return "cup.and.saucer.fill";case "career":return "briefcase.fill";default:return "bolt.fill"}
    }
}
struct ForgeClock: View {
    let state: ForgeActivity.ContentState
    var body: some View {
        if let frozen=[state.stoppedAt,state.pausedAt].compactMap({$0}).min() { Text(format(max(0,frozen.timeIntervalSince(state.startedAt)-state.pausedSeconds))).monospacedDigit() }
        else { Text(timerInterval:state.startedAt.addingTimeInterval(state.pausedSeconds)...Date.distantFuture,countsDown:false).monospacedDigit() }
    }
    func format(_ seconds:Double) -> String { let n=Int(seconds);return String(format:"%02d:%02d:%02d",n/3600,n/60%60,n%60) }
}
struct ForgeStopButton: View {
    let id:String
    let pending:Bool
    var sleep=false
    var body: some View {
        Button(intent:StopTimerIntent(entryId:id)) {
            VStack(spacing:4) { Image(systemName:pending ? "arrow.clockwise":sleep ? "sun.max.fill":"stop.fill").font(.system(size:17,weight:.black));Text(pending ? "Повторити":sleep ? "Прокинувся":"Стоп").font(.system(size:12,weight:.heavy)) }
                .frame(width:72,height:58).background(ForgeTheme.red,in:CutPaper()).foregroundStyle(ForgeTheme.paper)
        }.buttonStyle(.plain).accessibilityLabel(pending ? "Повторити завершення таймера":"Завершити поточний запис")
    }
}
struct ForgeLiveCard: View {
    let state:ForgeActivity.ContentState
    let id:String
    @Environment(\.isLuminanceReduced) private var dimmed
    var body: some View {
        ZStack(alignment:.topLeading) {
            ForgeTheme.ink
            CutPaper().fill(ForgeTheme.red.opacity(dimmed ? 0.12:0.2)).frame(width:80,height:150).rotationEffect(.degrees(14)).offset(x:-52,y:-8)
            HStack(spacing:12) {
                VStack(alignment:.leading,spacing:7) {
                    HStack(spacing:7) {
                        ForgeBolt().fill(ForgeTheme.paper).frame(width:12,height:15)
                        Text(state.pending ? "ОЧІКУЄ МЕРЕЖІ":state.pausedAt != nil ? "ПАУЗА / LIFE FORGE":"ЗАРАЗ / LIFE FORGE")
                            .font(.system(size:10,weight:.black)).tracking(1).lineLimit(1).minimumScaleFactor(0.8)
                    }.padding(.horizontal,9).padding(.vertical,5).background(ForgeTheme.red,in:CutPaper())
                    HStack(spacing:6) { Image(systemName:ForgeTheme.icon(state.category)).foregroundStyle(ForgeTheme.color(state.category));Text(state.title).font(.custom("Arial-BoldItalicMT",size:17)).lineLimit(2) }
                    ForgeClock(state:state).font(.system(size:32,weight:.black,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7).accessibilityLabel("Тривалість запису")
                }.frame(maxWidth:.infinity,alignment:.leading)
                ForgeStopButton(id:id,pending:state.pending,sleep:state.category=="sleep")
            }.padding(.horizontal,17).padding(.vertical,13)
        }.frame(maxWidth:.infinity).foregroundStyle(ForgeTheme.paper).clipped()
    }
}
struct ForgeTimerWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for:ForgeActivity.self) { context in
            ForgeLiveCard(state:context.state,id:context.attributes.entryId)
                .activityBackgroundTint(ForgeTheme.ink).activitySystemActionForegroundColor(ForgeTheme.paper)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName:ForgeTheme.icon(context.state.category)).foregroundStyle(ForgeTheme.color(context.state.category)).font(.system(size:25,weight:.heavy)).accessibilityLabel(context.state.title) }
                DynamicIslandExpandedRegion(.trailing) { ForgeClock(state:context.state).font(.system(size:22,weight:.black,design:.rounded)).foregroundStyle(ForgeTheme.paper).frame(width:125).minimumScaleFactor(0.7) }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing:12) { VStack(alignment:.leading,spacing:4) { Text(context.state.pending ? "ОЧІКУЄ МЕРЕЖІ":context.state.pausedAt != nil ? "ПАУЗА":"ЗАРАЗ").font(.system(size:10,weight:.black)).tracking(2).foregroundStyle(ForgeTheme.red);Text(context.state.title).font(.custom("Arial-BoldItalicMT",size:17)).lineLimit(2).foregroundStyle(ForgeTheme.paper) }.frame(maxWidth:.infinity,alignment:.leading);ForgeStopButton(id:context.attributes.entryId,pending:context.state.pending) }.padding(.top,6)
                }
            } compactLeading: { Image(systemName:ForgeTheme.icon(context.state.category)).foregroundStyle(ForgeTheme.color(context.state.category)) }
              compactTrailing: { ForgeClock(state:context.state).font(.system(size:12,weight:.bold)).frame(width:68).minimumScaleFactor(0.7) }
              minimal: { Image(systemName:context.state.pending ? "arrow.triangle.2.circlepath":ForgeTheme.icon(context.state.category)).foregroundStyle(ForgeTheme.color(context.state.category)) }
            .keylineTint(ForgeTheme.red)
        }
    }
}
