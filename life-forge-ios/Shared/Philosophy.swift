import SwiftUI

struct ForgePrinciple {
    let title:String
    let detail:String
    let color:Color
    static let all=[
        ForgePrinciple(title:"Цілься високо",detail:"Велика мета. Смілива спроба.",color:Color(red:0.91,green:0.72,blue:1)),
        ForgePrinciple(title:"Мета → план",detail:"Крок → дія → перевірка → покращення.",color:Color(red:0.54,green:0.86,blue:0.82)),
        ForgePrinciple(title:"Будь добрим",detail:"Досягай свого, підтримуючи інших.",color:Color(red:1,green:0.76,blue:0.55))
    ]
}
struct ForgePrincipleArt:View {
    let index:Int
    var body:some View {
        Canvas { context,size in
            let w=size.width,h=size.height
            func point(_ x:Double,_ y:Double)->CGPoint { CGPoint(x:w*x/160,y:h*y/76) }
            func line(_ points:[CGPoint]) { var path=Path();if let first=points.first { path.move(to:first);for p in points.dropFirst(){path.addLine(to:p)} };context.stroke(path,with:.color(ForgePrinciple.all[index].color),style:StrokeStyle(lineWidth:3,lineCap:.round,lineJoin:.round)) }
            if index==0 {
                line([point(12,63),point(48,47),point(76,49),point(117,15)])
                line([point(106,16),point(118,14),point(117,27)])
                var star=Path();for n in 0..<10 {let a=Double(n)*Double.pi/5-Double.pi/2,r=n%2==0 ? 15.0:6.0,p=point(139+cos(a)*r,21+sin(a)*r);if n==0{star.move(to:p)}else{star.addLine(to:p)}};star.closeSubpath();context.fill(star,with:.color(ForgePrinciple.all[index].color))
            } else if index==1 {
                line([point(12,64),point(47,64),point(47,48),point(78,48),point(78,32),point(109,32),point(109,16),point(143,16)])
                line([point(143,9),point(143,29)]);line([point(143,9),point(155,15),point(143,20)])
            } else {
                line([point(40,58),point(80,27),point(120,58),point(40,58)])
                for x in [40.0,120.0] { let p=point(x,58);context.fill(Path(ellipseIn:CGRect(x:p.x-7,y:p.y-7,width:14,height:14)),with:.color(ForgePrinciple.all[index].color)) }
                var heart=Path();heart.move(to:point(80,39));heart.addCurve(to:point(80,17),control1:point(39,19),control2:point(66,0));heart.addCurve(to:point(80,39),control1:point(94,0),control2:point(121,19));context.fill(heart,with:.color(ForgePrinciple.all[index].color))
            }
        }.accessibilityHidden(true)
    }
}
struct ForgePrincipleCard:View {
    let index:Int
    var compact=false
    var body:some View {
        let item=ForgePrinciple.all[index]
        VStack(alignment:.leading,spacing:compact ? 5:8) {
            Text("0\(index+1) / LIFE FORGE").font(.system(size:compact ? 9:10,weight:.black)).tracking(1).foregroundStyle(item.color)
            ForgePrincipleArt(index:index).frame(height:compact ? 37:58)
            Text(item.title).font(.system(size:compact ? 13:19,weight:.black)).foregroundStyle(item.color).lineLimit(2).minimumScaleFactor(0.8)
            Text(item.detail).font(.system(size:compact ? 11:13,weight:.medium)).foregroundStyle(Color(red:0.96,green:0.94,blue:0.89)).lineLimit(compact ? 3:4).minimumScaleFactor(0.8)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
    }
}
struct ForgePrinciplesPreview:View {
    var body:some View {
        ScrollView {
            VStack(alignment:.leading,spacing:18) {
                Text("ТРИ ОПОРИ / LIFE FORGE 1.10").font(.system(size:14,weight:.black)).foregroundStyle(.white)
                Text("Вигляд карток для головного екрана").font(.caption).foregroundStyle(.white.opacity(0.7))
                ForEach(0..<3) { i in HStack(spacing:18) { ForgePrincipleArt(index:i).frame(width:120,height:80);VStack(alignment:.leading,spacing:8) {Text(ForgePrinciple.all[i].title).font(.title3.bold()).foregroundStyle(ForgePrinciple.all[i].color);Text(ForgePrinciple.all[i].detail).font(.subheadline).foregroundStyle(.white)} }.padding(18).frame(maxWidth:.infinity,alignment:.leading).background(Color(red:0.13,green:0.10,blue:0.17),in:RoundedRectangle(cornerRadius:18)) }
                Text("За трьома частинами відео SkyBoi про філософію Technoblade. Короткий переказ, не дослівні цитати.").font(.caption).foregroundStyle(.white.opacity(0.65))
            }.padding(20)
        }.background(Color(red:0.06,green:0.05,blue:0.08)).preferredColorScheme(.dark)
    }
}
