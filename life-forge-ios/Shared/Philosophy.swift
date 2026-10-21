import SwiftUI

struct ForgePrinciple {
    let title:String
    let color:Color
    static let red=Color(red:0.90,green:0.12,blue:0.22)
    static let ink=Color(red:0.09,green:0.07,blue:0.10)
    static let paper=Color(red:0.96,green:0.94,blue:0.89)
    static let all=[ForgePrinciple(title:"АМБІЦІЯ",color:red),ForgePrinciple(title:"ПЛАН",color:ink),ForgePrinciple(title:"ДОБРОТА",color:ink)]
}
struct ForgePrincipleArt:View {
    let index:Int
    var labels=false
    var body:some View {
        Canvas { context,size in
            context.scaleBy(x:size.width/156,y:size.height/156)
            context.translateBy(x:-102,y:-22)
            let shapes:[Path]=[
Path { p in p.move(to:CGPoint(x:180.000,y:28.000));p.addArc(center:CGPoint(x:180,y:100),radius:72,startAngle:.radians(-1.570796327),endAngle:.radians(2.617967286),clockwise:true);p.addLine(to:CGPoint(x:137.000,y:125.000));p.addCurve(to:CGPoint(x:136.000,y:135.000),control1:CGPoint(x:135.000,y:126.000),control2:CGPoint(x:133.000,y:130.000));p.addCurve(to:CGPoint(x:155.000,y:129.000),control1:CGPoint(x:143.000,y:146.000),control2:CGPoint(x:158.000,y:138.000));p.addCurve(to:CGPoint(x:152.000,y:122.000),control1:CGPoint(x:154.000,y:125.000),control2:CGPoint(x:150.000,y:124.000));p.addLine(to:CGPoint(x:180.000,y:100.000));p.addLine(to:CGPoint(x:180.000,y:76.000));p.addCurve(to:CGPoint(x:171.000,y:73.000),control1:CGPoint(x:180.000,y:72.000),control2:CGPoint(x:175.000,y:72.000));p.addCurve(to:CGPoint(x:164.000,y:55.000),control1:CGPoint(x:156.000,y:76.000),control2:CGPoint(x:153.000,y:58.000));p.addCurve(to:CGPoint(x:180.000,y:56.000),control1:CGPoint(x:173.000,y:52.000),control2:CGPoint(x:175.000,y:60.000));p.closeSubpath() },
Path { p in p.move(to:CGPoint(x:180.000,y:28.000));p.addLine(to:CGPoint(x:180.000,y:56.000));p.addCurve(to:CGPoint(x:164.000,y:55.000),control1:CGPoint(x:175.000,y:60.000),control2:CGPoint(x:173.000,y:52.000));p.addCurve(to:CGPoint(x:171.000,y:73.000),control1:CGPoint(x:153.000,y:58.000),control2:CGPoint(x:156.000,y:76.000));p.addCurve(to:CGPoint(x:180.000,y:76.000),control1:CGPoint(x:175.000,y:72.000),control2:CGPoint(x:180.000,y:72.000));p.addLine(to:CGPoint(x:180.000,y:100.000));p.addLine(to:CGPoint(x:207.000,y:116.000));p.addCurve(to:CGPoint(x:214.000,y:100.000),control1:CGPoint(x:213.000,y:112.000),control2:CGPoint(x:208.000,y:105.000));p.addCurve(to:CGPoint(x:224.000,y:115.000),control1:CGPoint(x:223.000,y:91.000),control2:CGPoint(x:236.000,y:103.000));p.addCurve(to:CGPoint(x:221.000,y:124.000),control1:CGPoint(x:221.000,y:118.000),control2:CGPoint(x:217.000,y:122.000));p.addLine(to:CGPoint(x:242.350,y:136.000));p.addArc(center:CGPoint(x:180,y:100),radius:72,startAngle:.radians(0.523625368),endAngle:.radians(-1.570796327),clockwise:true);p.closeSubpath() },
Path { p in p.move(to:CGPoint(x:180.000,y:100.000));p.addLine(to:CGPoint(x:152.000,y:122.000));p.addCurve(to:CGPoint(x:155.000,y:129.000),control1:CGPoint(x:150.000,y:124.000),control2:CGPoint(x:154.000,y:125.000));p.addCurve(to:CGPoint(x:136.000,y:135.000),control1:CGPoint(x:158.000,y:138.000),control2:CGPoint(x:143.000,y:146.000));p.addCurve(to:CGPoint(x:137.000,y:125.000),control1:CGPoint(x:133.000,y:130.000),control2:CGPoint(x:135.000,y:126.000));p.addLine(to:CGPoint(x:117.650,y:136.000));p.addArc(center:CGPoint(x:180,y:100),radius:72,startAngle:.radians(2.617967286),endAngle:.radians(0.523625368),clockwise:true);p.addLine(to:CGPoint(x:221.000,y:124.000));p.addCurve(to:CGPoint(x:224.000,y:115.000),control1:CGPoint(x:217.000,y:122.000),control2:CGPoint(x:221.000,y:118.000));p.addCurve(to:CGPoint(x:214.000,y:100.000),control1:CGPoint(x:236.000,y:103.000),control2:CGPoint(x:223.000,y:91.000));p.addCurve(to:CGPoint(x:207.000,y:116.000),control1:CGPoint(x:208.000,y:105.000),control2:CGPoint(x:213.000,y:112.000));p.closeSubpath() }
            ]
            let colors:[Color]=index==1 ? [ForgePrinciple.ink,ForgePrinciple.red,.white]:index==2 ? [ForgePrinciple.ink,.white,ForgePrinciple.red]:[ForgePrinciple.red,ForgePrinciple.ink,.white]
            for i in 0..<3 { context.fill(shapes[i],with:.color(colors[i]));context.stroke(shapes[i],with:.color(ForgePrinciple.paper),style:StrokeStyle(lineWidth:2.5,lineJoin:.round)) }

        }.aspectRatio(1,contentMode:.fit).accessibilityLabel("Пазл: амбіція, план, доброта")
    }
}
struct ForgePrincipleCard:View {
    let index:Int
    var compact=false
    var body:some View {
        ForgePrincipleArt(index:index,labels:false).frame(maxWidth:.infinity,maxHeight:.infinity)
    }
}
struct ForgePrinciplesPreview:View {
    var body:some View {
        VStack { Spacer();ForgePrincipleArt(index:-1).frame(width:180,height:180);Spacer() }.frame(maxWidth:.infinity).background(ForgePrinciple.ink).preferredColorScheme(.dark)
    }
}
