import ActivityKit
import Foundation

struct ForgeActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var category: String
        var startedAt: Date
        var pausedAt: Date?
        var pausedSeconds: Double
        var stoppedAt: Date?
        var pending: Bool
    }
    var entryId: String
}
